"""Fixed Tavily HTTPS endpoints, pinned public DNS address, no proxies or redirects."""
import http.client
import ipaddress
import json
import socket
import ssl
import time
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout

from app.llm.provider import ProviderError

HOST = 'api.tavily.com'
MAX_BYTES = 64 * 1024
_DNS_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix='tavily-dns')
_DNS_SLOTS = threading.BoundedSemaphore(2)


def public_addresses(resolver=socket.getaddrinfo):
    try:
        rows = resolver(HOST, 443, type=socket.SOCK_STREAM)
        addresses = list(dict.fromkeys(row[4][0] for row in rows))
        if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
            raise ValueError
        return addresses
    except (OSError, ValueError, TypeError):
        raise ProviderError('unavailable') from None


def timed_public_addresses(timeout):
    if not _DNS_SLOTS.acquire(blocking=False):
        raise ProviderError('unavailable')
    try:
        future = _DNS_POOL.submit(public_addresses)
    except RuntimeError:
        _DNS_SLOTS.release()
        raise ProviderError('unavailable') from None
    future.add_done_callback(lambda _: _DNS_SLOTS.release())
    try:
        return future.result(timeout=max(.01, timeout))
    except FutureTimeout:
        future.cancel()
        raise ProviderError('timeout') from None


class PinnedTavilyConnection(http.client.HTTPSConnection):
    def __init__(self, address, timeout, deadline=None):
        super().__init__(HOST, port=443, timeout=timeout, context=ssl.create_default_context())
        self.address = address
        self.deadline = deadline

    def connect(self):
        # Resolve once before admission/transport. TLS SNI and certificate checks
        # still use the official host; the socket never performs a second DNS lookup.
        sock = socket.create_connection((self.address, 443), self.timeout)
        try:
            peer = ipaddress.ip_address(sock.getpeername()[0])
            if not peer.is_global or peer != ipaddress.ip_address(self.address):
                raise OSError('Invalid peer')
            if self.deadline:
                sock.settimeout(max(.01, self.deadline-time.monotonic()))
            self.sock = self._context.wrap_socket(sock, server_hostname=HOST)
        except Exception:
            sock.close()
            raise


def _tavily_json(method, path, payload, api_key, *, deadline_s):
    """Internal fixed-endpoint transport shared by the two public wrappers."""
    connection = None
    deadline = time.monotonic() + min(max(float(deadline_s), .1), 8.0)
    try:
        address = timed_public_addresses(deadline-time.monotonic())[0]
        connection = PinnedTavilyConnection(address, timeout=max(.1, deadline-time.monotonic()), deadline=deadline)
        connection.request(method, path, body=(json.dumps(payload, ensure_ascii=False).encode('utf-8') if payload is not None else None),
            headers={'Authorization': 'Bearer ' + api_key, 'Content-Type': 'application/json', 'Accept': 'application/json'})
        if connection.sock:
            connection.sock.settimeout(max(.1, deadline-time.monotonic()))
        response = connection.getresponse()
        if response.status == 429:
            raise ProviderError('quota', status=429)
        # Redirect locations and raw provider errors are never fetched or exposed.
        if response.status != 200:
            raise ProviderError('unavailable', status=response.status)
        body = bytearray()
        while True:
            if time.monotonic() >= deadline:
                raise ProviderError('timeout')
            if connection.sock:
                connection.sock.settimeout(max(.1, deadline-time.monotonic()))
            chunk = response.read(min(8192, MAX_BYTES + 1 - len(body)))
            if not chunk:
                break
            body.extend(chunk)
            if len(body) > MAX_BYTES:
                raise ProviderError('bad_response')
        result = json.loads(body.decode('utf-8'))
        if not isinstance(result, dict):
            raise ProviderError('bad_response')
        return result
    except ProviderError:
        raise
    except (OSError, ValueError, TypeError, http.client.HTTPException):
        raise ProviderError('unavailable') from None
    finally:
        if connection:
            connection.close()


def tavily_post(payload, api_key, *, deadline_s=6.0):
    """Search only. Caller reserves one durable BASIC credit before this call."""
    return _tavily_json('POST', '/search', payload, api_key, deadline_s=deadline_s)


def tavily_usage(api_key, *, deadline_s=3.0):
    """Read-only account gate; never changes plan, billing or provider settings."""
    return _tavily_json('GET', '/usage', None, api_key, deadline_s=deadline_s)
