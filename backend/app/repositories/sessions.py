"""Bounded, single-process sessions. Only secret digests are retained."""
import hashlib
import secrets
import time
from collections import OrderedDict
from contextlib import contextmanager
from dataclasses import dataclass, field
from threading import RLock
from typing import Protocol, ContextManager

from app.api.errors import APIError
from app.planner.types import Preferences


@dataclass
class Session:
    token_hash: bytes
    expires_at: float
    revision: int = 0
    preferences: Preferences = field(default_factory=Preferences)
    tour: object = None
    snapshot: object = None
    window_start: float = 0
    requests: int = 0
    notes: tuple = ()


class SessionStoreInterface(Protocol):
    """Stores yield an isolated unit of work; only successful contexts commit."""

    def create(self) -> dict: ...
    def owned(self, identity: str, token: str) -> ContextManager[Session]: ...
    def check_revision(self, session: Session, expected: int) -> None: ...
    def authorize_token(self, token: str) -> None: ...


class SessionStore:
    def __init__(self, ttl_seconds=3600, max_sessions=256, rate_limit=60,
                 rate_window=60, clock=time.monotonic):
        self.ttl_seconds = ttl_seconds
        self.max_sessions = max_sessions
        self.rate_limit = rate_limit
        self.rate_window = rate_window
        self.clock = clock
        self._sessions = {}
        self._expired = OrderedDict()
        self._lock = RLock()

    def _expire(self, now):
        for identity, session in list(self._sessions.items()):
            if session.expires_at <= now:
                self._expired[identity] = session.token_hash
                del self._sessions[identity]
        while len(self._expired) > self.max_sessions:
            self._expired.popitem(last=False)

    def create(self):
        with self._lock:
            now = self.clock()
            self._expire(now)
            if len(self._sessions) >= self.max_sessions:
                raise APIError(429, "rate_limited", "Đã đạt giới hạn phiên; vui lòng thử lại sau.")
            identity, token = secrets.token_urlsafe(24), secrets.token_urlsafe(32)
            self._sessions[identity] = Session(
                hashlib.sha256(token.encode()).digest(), now + self.ttl_seconds, window_start=now
            )
            return {"session_id": identity, "token": token, "revision": 0}

    @contextmanager
    def owned(self, identity, token):
        # Serializes auth, rate checks, optimistic revisions and commit together.
        # A single lock is deliberately simple for this bounded local prototype.
        with self._lock:
            now = self.clock()
            self._expire(now)
            if not token or len(token) > 200:
                raise APIError(401, "unauthorized_session", "Thiếu thông tin xác thực phiên.")
            digest = hashlib.sha256(token.encode()).digest()
            session = self._sessions.get(identity)
            expected = session.token_hash if session else self._expired.get(identity)
            if not secrets.compare_digest(expected if expected is not None else bytes(32), digest) or expected is None:
                raise APIError(403, "unauthorized_session", "Không có quyền truy cập phiên.")
            if session is None:
                raise APIError(410, "session_expired", "Phiên đã hết hạn; hãy tạo phiên mới.")
            if now - session.window_start >= self.rate_window:
                session.window_start, session.requests = now, 0
            if session.requests >= self.rate_limit:
                raise APIError(429, "rate_limited", "Quá nhiều yêu cầu; vui lòng thử lại sau.")
            session.requests += 1
            yield session

    @staticmethod
    def check_revision(session, expected):
        if expected != session.revision:
            raise APIError(409, "revision_conflict", "Phiên đã thay đổi; hãy dùng bản sửa đổi mới nhất.",
                           {"revision": session.revision})

    def authorize_token(self, token):
        """Authenticate a token-only auxiliary operation without exposing session identity."""
        if not token or len(token) > 200:
            raise APIError(401, 'unauthorized_session', 'Thiếu thông tin xác thực phiên.')
        digest = hashlib.sha256(token.encode()).digest()
        with self._lock:
            self._expire(self.clock())
            identity = None
            for key, session in self._sessions.items():
                if secrets.compare_digest(session.token_hash, digest):
                    identity = key
            if identity is None:
                raise APIError(403, 'unauthorized_session', 'Không có quyền truy cập phiên.')
            with self.owned(identity, token):
                pass
