"""Local durable session units of work. No raw tokens or venue payloads on disk."""
import hashlib
import json
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

from app.api.errors import APIError
from app.api.schemas import PreferencesSchema
from app.data import DatasetLoadError
from app.planner import engine
from app.repositories.sessions import Session, SessionStore

CHANGED = 'dữ liệu đã đổi, hãy lập lại lịch trình'


def unavailable():
    return APIError(503, 'provider_unavailable', 'Kho lưu phiên tạm thời không khả dụng.')


class SQLiteSessionStore:
    """BEGIN IMMEDIATE covers authentication, revision check and commit across processes.

    Expired rows become bounded hash-only tombstones. Expiry uses wall time so it
    remains meaningful after restart. No connection is shared between threads.
    """

    check_revision = staticmethod(SessionStore.check_revision)

    def __init__(self, path, venues, routing, ttl_seconds=3600, max_sessions=256,
                 rate_limit=60, rate_window=60, clock=time.time, timeout=0.2, quality_weight=1.0):
        self.path = Path(path)
        self.quality_weight = quality_weight
        self.venues, self.routing = venues, routing
        self.ttl_seconds, self.max_sessions = ttl_seconds, max_sessions
        self.clock, self.timeout = clock, timeout
        # Reuse constant-time auth and bounded, process-local token rate accounting.
        self._rates = SessionStore(rate_limit=rate_limit, rate_window=rate_window, clock=clock)

    @contextmanager
    def _transaction(self):
        db = None
        try:
            if not self.path.is_absolute():
                raise ValueError('absolute database path required')
            db = sqlite3.connect(self.path, timeout=self.timeout, isolation_level=None)
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('BEGIN IMMEDIATE')
            db.execute('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)')
            versions = db.execute('SELECT version FROM schema_version').fetchall()
            if not versions:
                db.execute('INSERT INTO schema_version VALUES (1)')
                db.execute('CREATE TABLE sessions (id TEXT PRIMARY KEY, token_hash BLOB NOT NULL, '
                           'preferences TEXT, revision INTEGER NOT NULL, expires_at REAL NOT NULL, tour TEXT)')
                db.execute('CREATE INDEX sessions_expiry ON sessions(expires_at)')
            elif versions != [(1,)]:
                raise ValueError('unsupported schema')
            yield db
            db.commit()
        except (sqlite3.Error, ValueError, TypeError, KeyError, IndexError, OverflowError, DatasetLoadError):
            raise unavailable() from None
        finally:
            if db is not None:
                if db.in_transaction:
                    db.rollback()
                db.close()

    def _purge(self, db, now):
        db.execute('UPDATE sessions SET preferences=NULL,tour=NULL WHERE expires_at<=?', (now,))
        db.execute('DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE expires_at<=? '
                   'ORDER BY expires_at DESC,id DESC LIMIT -1 OFFSET ?)', (now, self.max_sessions))

    def create(self):
        with self._transaction() as db:
            now = self.clock()
            self._purge(db, now)
            if db.execute('SELECT COUNT(*) FROM sessions WHERE expires_at>?', (now,)).fetchone()[0] >= self.max_sessions:
                raise APIError(429, 'rate_limited', 'Đã đạt giới hạn phiên; vui lòng thử lại sau.')
            identity, token = secrets.token_urlsafe(24), secrets.token_urlsafe(32)
            prefs = PreferencesSchema().model_dump_json()
            db.execute('INSERT INTO sessions VALUES (?,?,?,?,?,NULL)',
                       (identity, hashlib.sha256(token.encode()).digest(), prefs, 0, now + self.ttl_seconds))
        return {'session_id': identity, 'token': token, 'revision': 0}

    def _restore(self, row):
        digest, encoded, revision, expiry, encoded_tour = row
        if not isinstance(digest, bytes) or len(digest) != 32 or type(revision) is not int or revision < 0:
            raise ValueError('invalid session')
        prefs = PreferencesSchema.model_validate_json(encoded).domain()
        session = Session(digest, expiry, revision, prefs)
        if encoded_tour is None:
            return session
        record = json.loads(encoded_tour)
        if set(record) != {'dataset_version', 'stops'} or not isinstance(record['stops'], list):
            raise ValueError('invalid tour record')
        data = self.venues.snapshot()
        session.snapshot = data
        if record['dataset_version'] != data.dataset_version:
            session.notes = (CHANGED,)
            return session
        stops = record['stops']
        if not stops:
            # Failure diagnoses are regenerated; never persist free-form venue text.
            session.tour = engine.plan_tour(data.venues, prefs, self.routing, quality_weight=self.quality_weight)
            return session
        if any(set(s) != {'venue_id', 'order'} or type(s['order']) is not int for s in stops):
            raise ValueError('invalid stops')
        ordered = sorted(stops, key=lambda s: s['order'])
        if [s['order'] for s in ordered] != list(range(1, len(stops) + 1)):
            raise ValueError('invalid order')
        rebuilt, violation = engine.build_tour(data.venues, prefs,
                                               [s['venue_id'] for s in ordered], self.routing)
        if violation or rebuilt is None or engine.validate_tour(rebuilt, data.venues, prefs, self.routing):
            session.notes = (CHANGED,)
            return session
        session.tour = rebuilt
        return session

    @contextmanager
    def owned(self, identity, token):
        with self._transaction() as db:
            now = self.clock()
            # Use the shared constant-time comparison even for expired rows.
            if not token or len(token) > 200:
                raise APIError(401, 'unauthorized_session', 'Thiếu thông tin xác thực phiên.')
            row = db.execute('SELECT token_hash,preferences,revision,expires_at,tour FROM sessions WHERE id=?',
                             (identity,)).fetchone()
            digest = hashlib.sha256(token.encode()).digest()
            expected = row[0] if row is not None else bytes(32)
            if not isinstance(expected, bytes) or not secrets.compare_digest(expected, digest) or row is None:
                raise APIError(403, 'unauthorized_session', 'Không có quyền truy cập phiên.')
            if row[3] <= now:
                self._purge(db, now)
                # Commit expiry purge even though the request is rejected.
                db.commit()
                raise APIError(410, 'session_expired', 'Phiên đã hết hạn; hãy tạo phiên mới.')
            self._purge(db, now)
            session = self._restore(row)
            # Only hashes/expiry and rate counters are kept here, no preferences/tours.
            with self._rates._lock:
                self._rates._expire(now)
                if identity not in self._rates._sessions:
                    self._rates._sessions[identity] = Session(expected, row[3], window_start=now)
                while len(self._rates._sessions) > self.max_sessions:
                    del self._rates._sessions[next(iter(self._rates._sessions))]
            with self._rates.owned(identity, token):
                yield session
            if session.revision == row[2]:
                # Reads do not rewrite old metadata: repeat reads retain the stale-data note.
                return
            encoded_tour = None
            if session.tour is not None:
                encoded_tour = json.dumps({'dataset_version': session.snapshot.dataset_version,
                    'stops': [{'venue_id': s.venue_id, 'order': s.order} for s in session.tour.stops]})
            db.execute('UPDATE sessions SET preferences=?,revision=?,tour=? WHERE id=? AND revision=?',
                       (PreferencesSchema.from_domain(session.preferences).model_dump_json(),
                        session.revision, encoded_tour, identity, row[2]))

    def authorize_token(self, token):
        if not token or len(token) > 200:
            raise APIError(401, 'unauthorized_session', 'Thiếu thông tin xác thực phiên.')
        digest, match = hashlib.sha256(token.encode()).digest(), None
        with self._transaction() as db:
            now = self.clock()
            self._purge(db, now)
            for identity, expected, expiry in db.execute('SELECT id,token_hash,expires_at FROM sessions'):
                if isinstance(expected, bytes) and secrets.compare_digest(expected, digest) and expiry > now:
                    match = (identity, expected, expiry)
        if match is None:
            raise APIError(403, 'unauthorized_session', 'Không có quyền truy cập phiên.')
        identity, expected, expiry = match
        with self._rates._lock:
            self._rates._expire(now)
            if identity not in self._rates._sessions:
                self._rates._sessions[identity] = Session(expected, expiry, window_start=now)
            while len(self._rates._sessions) > self.max_sessions:
                del self._rates._sessions[next(iter(self._rates._sessions))]
            with self._rates.owned(identity, token):
                pass
