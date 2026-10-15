"""Bounded ASGI guards and allowlisted access telemetry; no request payload logging."""
import hashlib
import json
import logging
import os
import time
import uuid
from collections import OrderedDict
from threading import RLock

from starlette.responses import JSONResponse
from app.api.errors import APIError

ACCESS_LOG = logging.getLogger('foodtour.access')


def configure_access_logging():
    ACCESS_LOG.setLevel(logging.INFO)
    if not ACCESS_LOG.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter('%(message)s'))
        ACCESS_LOG.addHandler(handler)
    ACCESS_LOG.propagate = False


def setting(name, default, maximum=1000000):
    try:
        value = int(os.getenv(name, str(default)))
        return value if 1 <= value <= maximum else default
    except ValueError:
        return default


class RateLimiter:
    """Process-local, bounded fixed windows. Forwarded headers are never read here."""

    def __init__(self, window, capacity=4096, clock=time.monotonic):
        self.window, self.capacity, self.clock = window, capacity, clock
        self.entries = OrderedDict()
        self.lock = RLock()

    def allow(self, key, limit):
        with self.lock:
            now = self.clock()
            while self.entries and now - next(iter(self.entries.values()))[0] >= self.window:
                self.entries.popitem(last=False)
            started, count = self.entries.get(key, (now, 0))
            if now - started >= self.window:
                started, count = now, 0
            if count >= limit:
                return False
            self.entries[key] = (started, count + 1)
            while len(self.entries) > self.capacity:
                self.entries.popitem(last=False)
            return True


class SecurityMiddleware:
    def __init__(self, app, body_limit=8192, token_limit=60, ip_limit=240, window=60,
                 web_origins=('http://localhost:3000',)):
        self.app, self.body_limit = app, body_limit
        self.token_limit, self.ip_limit = token_limit, ip_limit
        self.limiter = RateLimiter(window)
        self.web_origins = {origin.encode() for origin in web_origins}

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        headers = {k.lower(): v for k, v in scope.get('headers', [])}
        # Server-issued IDs avoid reflecting arbitrary client text into logs/headers.
        identity = uuid.uuid4().hex
        scope.setdefault('state', {})['request_id'] = identity
        session_path = scope['path'].startswith('/v1/sessions')
        status, response_started = 500, False

        async def guarded_send(message):
            nonlocal status, response_started
            if message['type'] == 'http.response.start':
                status, response_started = message['status'], True
                additions = {b'x-request-id': identity.encode(), b'x-content-type-options': b'nosniff',
                             b'referrer-policy': b'no-referrer'}
                if session_path:
                    additions[b'cache-control'] = b'no-store'
                message['headers'] = [(k, v) for k, v in message.get('headers', [])
                                      if k.lower() not in additions] + list(additions.items())
            await send(message)

        async def reject(code, error_code, message):
            cors = {}
            origin = headers.get(b'origin')
            if origin in self.web_origins:
                cors = {'Access-Control-Allow-Origin': origin.decode(),
                        'Access-Control-Expose-Headers': 'X-Request-ID', 'Vary': 'Origin'}
            await JSONResponse(APIError(code, error_code, message).body(), status_code=code, headers=cors)(
                scope, receive, guarded_send)

        try:
            if scope['path'].startswith('/v1/') and scope['method'] != 'OPTIONS':
                host = str((scope.get('client') or ('unknown', 0))[0])
                # Hash both keys; neither is ever passed to logs.
                ip_key = ('ip', hashlib.sha256(host.encode()).digest())
                token = headers.get(b'x-session-token')
                if not self.limiter.allow(ip_key, self.ip_limit) or (session_path and token and
                        not self.limiter.allow(('token', hashlib.sha256(token).digest()), self.token_limit)):
                    await reject(429, 'rate_limited', 'Quá nhiều yêu cầu; vui lòng thử lại sau.')
                    return
            if session_path:
                try:
                    length = int(headers.get(b'content-length', b'0'))
                except ValueError:
                    await reject(422, 'validation_error', 'Yêu cầu không hợp lệ.')
                    return
                if length > self.body_limit or length < 0:
                    await reject(413, 'validation_error', 'Nội dung yêu cầu vượt giới hạn.')
                    return
                chunks, size = [], 0
                while True:
                    message = await receive()
                    if message['type'] == 'http.disconnect':
                        return
                    chunk = message.get('body', b'')
                    size += len(chunk)
                    if size > self.body_limit:
                        await reject(413, 'validation_error', 'Nội dung yêu cầu vượt giới hạn.')
                        return
                    if chunk:
                        chunks.append(chunk)
                    if not message.get('more_body', False):
                        break
                replayed = False
                async def bounded_receive():
                    nonlocal replayed
                    if not replayed:
                        replayed = True
                        return {'type': 'http.request', 'body': b''.join(chunks), 'more_body': False}
                    return await receive()
                await self.app(scope, bounded_receive, guarded_send)
            else:
                await self.app(scope, receive, guarded_send)
        except Exception:
            if response_started:
                # Never send a second response after headers; these routes do not stream.
                raise
            await reject(500, 'internal_validation_failed', 'Không thể xử lý yêu cầu.')
        finally:
            route = getattr(scope.get('route'), 'path', '<unmatched>')
            ACCESS_LOG.info(json.dumps({'request_id': identity, 'route': route,
                'status': status, 'latency_ms': round((time.perf_counter() - started) * 1000, 3)},
                ensure_ascii=True))
