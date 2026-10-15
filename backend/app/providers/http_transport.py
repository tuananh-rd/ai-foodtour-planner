"""Bounded provider HTTP transport. No proxy, no redirects, size and deadline caps.

Allowed destinations:
- loopback IP literals over http/https with an explicit port (local fakes and self-hosted services);
- HTTPS to hostnames on the explicit allowlist: FOODTOUR_PROVIDER_HOSTS (comma-separated, exact,
  case-insensitive) plus the official host of a provider the operator explicitly enabled
  (registered by that adapter via allow_host()).
Anything else is refused before any socket is opened. Error messages never contain URLs or keys.
"""
import ipaddress
from http.client import HTTPException
import math
import os
import socket
import ssl
import time
from threading import RLock
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, HTTPSHandler, ProxyHandler, Request, build_opener

from app.llm.provider import ProviderError

_REGISTERED = set()
_LOCK = RLock()


def allow_host(host):
    """Called by an adapter only when its provider has been explicitly enabled by configuration."""
    with _LOCK:
        _REGISTERED.add(host.strip().casefold())


def allowed_hosts():
    configured = {h.strip().casefold() for h in os.getenv('FOODTOUR_PROVIDER_HOSTS', '').split(',') if h.strip()}
    with _LOCK:
        return configured | set(_REGISTERED)


def _loopback(host):
    try:
        return ipaddress.ip_address(host or '').is_loopback
    except ValueError:
        return False


def destination_allowed(url):
    """True when url may be contacted. Path and query are built by adapters, never by users."""
    try:
        parts = urlsplit(url)
        host = (parts.hostname or '').casefold()
        if parts.username or parts.password or parts.fragment or not host:
            return False
        if _loopback(host):
            return parts.scheme in ('http', 'https') and parts.port is not None
        return parts.scheme == 'https' and host in allowed_hosts() and parts.port in (None, 443)
    except (ValueError, TypeError, AttributeError):
        return False


def provider_endpoint(url):
    """Normalize a configured base URL (no query) or return None when it is not allowed."""
    try:
        parts = urlsplit(url or '')
        if parts.query or not destination_allowed(url):
            return None
        return url.rstrip('/')
    except (ValueError, TypeError, AttributeError):
        return None


def local_endpoint(url):
    """Backward-compatible: loopback-only base URL."""
    endpoint = provider_endpoint(url)
    return endpoint if endpoint and _loopback(urlsplit(endpoint).hostname) else None


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        fp.close()
        raise ProviderError('unavailable')


def request_bytes(url, *, body=None, headers=None, deadline_s=8.0, max_bytes=8192):
    # Validate every final URL before opener/socket construction, including direct adapter calls.
    if not destination_allowed(url):
        raise ProviderError('unavailable')
    try:
        if not math.isfinite(deadline_s) or deadline_s <= 0:
            raise ProviderError('timeout')
        end = time.monotonic() + min(deadline_s, 30.0)
        opener = build_opener(ProxyHandler({}), NoRedirect(), HTTPSHandler(context=ssl.create_default_context()))
        req = Request(url, data=body, headers=headers or {}, method='POST' if body is not None else 'GET')
        with opener.open(req, timeout=min(deadline_s, 30.0)) as response:
            if response.status != 200:
                raise ProviderError('quota' if response.status == 429 else 'unavailable')
            if response.headers.get('Content-Encoding', 'identity').lower() != 'identity':
                raise ProviderError('bad_response')
            declared = response.headers.get('Content-Length')
            if declared is not None and (int(declared) < 0 or int(declared) > max_bytes):
                raise ProviderError('bad_response')
            chunks, size = [], 0
            while True:
                if response.fp is None:
                    break
                remaining = end - time.monotonic()
                if remaining <= 0:
                    raise ProviderError('timeout')
                # urllib returns HTTPResponse; update its socket deadline between read1 calls
                # so a slow-drip peer cannot reset a full timeout for every arriving byte.
                response.fp.raw._sock.settimeout(remaining)
                chunk = response.read1(min(4096, max_bytes + 1 - size))
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise ProviderError('bad_response')
                chunks.append(chunk)
            if declared is not None and size != int(declared):
                raise ProviderError('bad_response')
            return b''.join(chunks)
    except ProviderError:
        raise
    except HTTPError as error:
        status = error.code
        error.close()
        raise ProviderError('quota' if status == 429 else 'unavailable') from None
    except (TimeoutError, socket.timeout):
        raise ProviderError('timeout') from None
    except URLError as error:
        raise ProviderError('timeout' if isinstance(error.reason, TimeoutError) else 'unavailable') from None
    except (OSError, ValueError, TypeError, AttributeError, HTTPException):
        raise ProviderError('bad_response') from None
