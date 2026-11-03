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
import json
import re
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


def _diagnostic_headers(target,status,headers):
    if target is None:return
    target['http_status']=status
    if headers is None:return
    media=headers.get('Content-Type','').split(';',1)[0].strip().lower()
    if re.fullmatch(r'[a-z0-9.+-]+/[a-z0-9.+-]+',media):target['content_type']=media
    for name in ('x-request-id','request-id','cf-ray'):
        value=headers.get(name)
        if value and re.fullmatch(r'[a-zA-Z0-9_.:-]{1,128}',value):target[name]=value


def _diagnostic_error(target,data):
    """Bounded known error envelopes only; never retain free-form title/detail/message."""
    titles={'browser signature banned':'browser_signature_banned',
            'browser_signature_banned':'browser_signature_banned',
            'access denied':'access_denied','error 1010':'browser_signature_banned',
            'error code: 1010':'browser_signature_banned'}
    def visit(value,depth=0):
        if not isinstance(value,dict) or depth>3:return
        code=value.get('error_code',value.get('code'))
        if type(code) is int and 0<=code<=99999:
            target.setdefault('error_code',code)
        elif isinstance(code,str) and re.fullmatch(r'[a-zA-Z0-9_.:-]{1,64}',code) and not code.lower().startswith(('sk-','bearer')):
            target.setdefault('error_code',code)
        kind=value.get('type')
        if kind in ('browser_signature_banned','new_api_error'):
            target.setdefault('error_type',kind)
        title=value.get('title')
        if isinstance(title,str) and title.strip().casefold() in titles:
            target.setdefault('error_title',titles[title.strip().casefold()])
        for key in ('retryable','owner_action_required'):
            if type(value.get(key)) is bool:target.setdefault(key,value[key])
        for key in ('error','details'):
            visit(value.get(key),depth+1)
        errors=value.get('errors')
        if isinstance(errors,list):
            for item in errors[:3]:visit(item,depth+1)
    visit(data)


def request_bytes(url, *, body=None, headers=None, deadline_s=8.0, max_bytes=8192, diagnostics=None):
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
            _diagnostic_headers(diagnostics,response.status,response.headers)
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
        _diagnostic_headers(diagnostics,status,error.headers)
        if diagnostics is not None and diagnostics.get('content_type')=='application/json':
            try:
                blob=error.read(4097)
                data=json.loads(blob) if len(blob)<=4096 else {}
                _diagnostic_error(diagnostics,data)
            except (ValueError,TypeError,OSError,AttributeError):pass
        error.close()
        raise ProviderError('quota' if status == 429 else 'unavailable', status=status) from None
    except (TimeoutError, socket.timeout):
        raise ProviderError('timeout') from None
    except URLError as error:
        raise ProviderError('timeout' if isinstance(error.reason, TimeoutError) else 'unavailable') from None
    except (OSError, ValueError, TypeError, AttributeError, HTTPException):
        raise ProviderError('bad_response') from None
