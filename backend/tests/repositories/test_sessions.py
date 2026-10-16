import hashlib
import json
import os
import sqlite3
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.api.errors import APIError
from app.main import create_app
from app.planner import engine
from app.planner.interfaces import StraightLineEstimator
from app.planner.types import Preferences
from app.repositories.sqlite_sessions import CHANGED, SQLiteSessionStore
from app.repositories.venues import VenueRepository


class DurableSessions(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'sessions.sqlite'
        self.venues = VenueRepository(Path(self.temp.name) / 'absent.json')
        self.routing = StraightLineEstimator()
        self.now = 1000.0
        self.store = self.new_store()

    def new_store(self, **kw):
        return SQLiteSessionStore(self.path, self.venues, self.routing,
                                  clock=lambda: self.now, **kw)

    @contextmanager
    def database(self, **kw):
        db = sqlite3.connect(self.path, **kw)
        try:
            with db:
                yield db
        finally:
            db.close()

    def seeded(self):
        created = self.store.create()
        with self.store.owned(created['session_id'], created['token']) as session:
            session.preferences = Preferences(origin=(21.0285, 105.8522), duration_min=240)
            session.snapshot = self.venues.snapshot()
            session.tour = engine.plan_tour(session.snapshot.venues, session.preferences, self.routing)
            session.revision = 1
        return created

    def test_restart_rebuilds_exact_order_from_ids_without_private_payload(self):
        created = self.seeded()
        with self.store.owned(created['session_id'], created['token']) as first:
            ids = [s.venue_id for s in first.tour.stops]
        with self.new_store().owned(created['session_id'], created['token']) as restored:
            self.assertEqual(restored.revision, 1)
            self.assertEqual([s.venue_id for s in restored.tour.stops], ids)
            self.assertFalse(engine.validate_tour(restored.tour, restored.snapshot.venues,
                                                restored.preferences, self.routing))
        with self.database() as db:
            self.assertEqual(db.execute('PRAGMA journal_mode').fetchone()[0], 'wal')
            digest, encoded = db.execute('SELECT token_hash,tour FROM sessions').fetchone()
            self.assertEqual(digest, hashlib.sha256(created['token'].encode()).digest())
            keys = set(json.loads(encoded))
            self.assertTrue({'dataset_version', 'stops'} <= keys <= {'dataset_version', 'stops', 'locks'}, keys)  # locks = venue ids only
            self.assertTrue(all(set(s) == {'venue_id', 'order'} for s in json.loads(encoded)['stops']))
        raw = self.path.read_bytes()
        self.assertNotIn(created['token'].encode(), raw)
        for venue in self.venues.snapshot().venues:
            self.assertNotIn(venue.name.encode(), raw)
            if venue.address:
                self.assertNotIn(venue.address.encode(), raw)

    def test_two_writers_have_one_atomic_conflict(self):
        created = self.store.create()
        gate = threading.Barrier(2)
        def writer(_):
            store = self.new_store(timeout=3)
            gate.wait(timeout=5)
            try:
                with store.owned(created['session_id'], created['token']) as session:
                    store.check_revision(session, 0)
                    session.revision += 1
                return 200
            except APIError as error:
                return error.status
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(writer, range(2))), [200, 409])
        with self.store.owned(created['session_id'], created['token']) as session:
            self.assertEqual(session.revision, 1)

    def test_transaction_rollback(self):
        created = self.store.create()
        with self.assertRaises(APIError):
            with self.store.owned(created['session_id'], created['token']) as session:
                session.revision = 9
                raise APIError(409, 'revision_conflict', 'safe')
        with self.store.owned(created['session_id'], created['token']) as session:
            self.assertEqual(session.revision, 0)

    def test_isolation_and_expiry_survive_restart(self):
        a, b = self.store.create(), self.store.create()
        with self.assertRaises(APIError) as rejected:
            with self.new_store().owned(a['session_id'], b['token']):
                self.fail('cross-session access')
        self.assertEqual(rejected.exception.status, 403)
        self.now += 3601
        with self.assertRaises(APIError) as expired:
            with self.new_store().owned(a['session_id'], a['token']):
                self.fail('expired access')
        self.assertEqual(expired.exception.status, 410)
        with self.database() as db:
            self.assertTrue(all(p is None and t is None for p, t in db.execute('SELECT preferences,tour FROM sessions')))

    def test_capacity_and_expired_rows_bound(self):
        store = self.new_store(max_sessions=2, ttl_seconds=1)
        for _ in range(6):
            store.create()
            self.now += 2
        store.create()
        with self.database() as db:
            self.assertLessEqual(db.execute('SELECT COUNT(*) FROM sessions').fetchone()[0], 3)
        store.create()
        with self.assertRaises(APIError) as full:
            store.create()
        self.assertEqual(full.exception.status, 429)

    def test_dataset_change_discards_tour_keeps_preferences(self):
        created = self.seeded()
        with self.database() as db:
            record = json.loads(db.execute('SELECT tour FROM sessions').fetchone()[0])
            record['dataset_version'] = 'old-version'
            db.execute('UPDATE sessions SET tour=?', (json.dumps(record),))
        with self.new_store().owned(created['session_id'], created['token']) as session:
            self.assertIsNone(session.tour)
            self.assertEqual(session.preferences.duration_min, 240)
            self.assertEqual(session.notes, (CHANGED,))

    def test_env_selects_store_and_new_app_reads_database(self):
        with patch.dict(os.environ, {'FOODTOUR_SESSION_DB': str(self.path)}):
            first = create_app(data_path=self.venues.path)
            with TestClient(first) as client:
                created = client.post('/v1/sessions').json()
                response = client.post('/v1/sessions/' + created['session_id'] + '/messages',
                    headers={'X-Session-Token': created['token']},
                    json={'text': 'quanh Hồ Gươm trong 4 giờ'})
                self.assertEqual(response.status_code, 200, response.text)
            second = create_app(data_path=self.venues.path)
            with TestClient(second) as client:
                response = client.get('/v1/sessions/' + created['session_id'],
                                      headers={'X-Session-Token': created['token']})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()['revision'], 1)
                self.assertEqual(len(response.json()['tour']['stops']), 3)

    def test_get_stale_or_missing_venue_returns_null_note_repeatedly(self):
        created = self.seeded()
        with TestClient(create_app(sessions=self.store, data_path=self.venues.path)) as client:
            url = '/v1/sessions/' + created['session_id']
            self.assertEqual(client.get(url).status_code, 401)
            self.assertEqual(client.get(url, headers={'X-Session-Token': 'wrong'}).status_code, 403)
            for field, value in [('dataset_version', 'outdated'), ('stops', [{'venue_id': 'gone', 'order': 1}])]:
                with self.database() as db:
                    record = {'dataset_version': self.venues.snapshot().dataset_version,
                              'stops': [{'venue_id': 'gone', 'order': 1}]}
                    record[field] = value
                    db.execute('UPDATE sessions SET tour=?', (json.dumps(record),))
                for _ in range(2):
                    response = client.get(url, headers={'X-Session-Token': created['token']})
                    self.assertEqual(response.status_code, 200, response.text)
                    state = response.json()
                    self.assertIsNone(state['tour'])
                    self.assertEqual(state['preferences']['duration_min'], 240)
                    self.assertEqual(state['notes'], [CHANGED])

    def test_locked_and_corrupt_db_are_redacted_503(self):
        self.store.create()
        with TestClient(create_app(sessions=self.store, data_path=self.venues.path),
                        raise_server_exceptions=False) as client:
            with self.database(isolation_level=None) as db:
                db.execute('BEGIN IMMEDIATE')
                response = client.post('/v1/sessions')
                self.assertEqual(response.status_code, 503, response.text)
                self.assertEqual(response.json()['error']['code'], 'provider_unavailable')
                self.assertNotIn(str(self.path), response.text)
                db.rollback()
        bad = Path(self.temp.name) / 'bad.sqlite'
        bad.write_bytes(b'corrupt database')
        store = SQLiteSessionStore(bad, self.venues, self.routing)
        with TestClient(create_app(sessions=store), raise_server_exceptions=False) as client:
            response = client.post('/v1/sessions')
            self.assertEqual(response.status_code, 503)
            self.assertNotIn(str(bad), response.text)

    def test_corrupt_row_and_schema_fail_closed(self):
        created = self.store.create()
        with self.database() as db:
            db.execute("UPDATE sessions SET preferences='malformed'")
        with self.assertRaises(APIError) as bad:
            with self.store.owned(created['session_id'], created['token']):
                self.fail('corrupt row accepted')
        self.assertEqual(bad.exception.status, 503)
        with self.database() as db:
            db.execute('UPDATE schema_version SET version=99')
        with self.assertRaises(APIError) as bad:
            self.store.create()
        self.assertEqual(bad.exception.status, 503)
