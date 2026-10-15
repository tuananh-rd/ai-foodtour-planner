"""Bounded local HTTP transport. No DNS, proxy, redirect or vendor defaults."""
import ipaddress
from http.client import HTTPException
import math
import socket
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from app.llm.provider import ProviderError


def local_endpoint(url):
    try:
        parts = urlsplit(url)
        address = ipaddress.ip_address(parts.hostname or '')
        if (parts.scheme not in ('http', 'https') or not address.is_loopback or parts.username
                or parts.password or parts.query or parts.fragment or not parts.port):
            return None
        return url.rstrip('/')
    except (ValueError, TypeError, AttributeError):
        return None


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        fp.close()
        raise ProviderError('unavailable')


def request_bytes(url, *, body=None, headers=None, deadline_s=8.0, max_bytes=8192):
    # Validate every final URL before opener/socket construction, including direct adapter calls.
    if local_endpoint(url) is None:
        # OSRM's fixed query is allowed by its adapter; no arbitrary query is accepted here.
        try:
            parts = urlsplit(url)
            allowed = parts.query == 'overview=false' and local_endpoint(url.split('?', 1)[0])
        except (ValueError, TypeError, AttributeError):
            allowed = False
        if not allowed:
            raise ProviderError('unavailable')
    try:
        if not math.isfinite(deadline_s) or deadline_s <= 0:
            raise ProviderError('timeout')
        end = time.monotonic() + min(deadline_s, 30.0)
        opener = build_opener(ProxyHandler({}), NoRedirect())
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
