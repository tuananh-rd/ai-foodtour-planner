"""Pure public-query and citation boundaries; no source URL is fetched here."""
import ipaddress
import re
from urllib.parse import urlsplit

from app.assistant.conversation import redact_sensitive, is_health_or_allergy_disclosure
from app.planner.relevance import fold_uncached


def public_source_url(value):
    if not isinstance(value, str) or not value or len(value) > 2048:
        return False
    if any(ord(char) <= 32 or ord(char) == 127 for char in value) or '\\' in value:
        return False
    try:
        parts = urlsplit(value)
        host = parts.hostname or ''
        if (parts.scheme != 'https' or not host or parts.username or parts.password or parts.port not in (None, 443)
                or host == 'localhost' or host.endswith(('.localhost', '.local', '.internal', '.lan'))):
            return False
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            if ('.' not in host or any(not (char.isalnum() or char in '.-') for char in host)
                    or re.fullmatch(r'(?:0x[0-9a-f]+|[0-9]+)(?:\.(?:0x[0-9a-f]+|[0-9]+))*', host, re.I)):
                return False
        else:
            if not address.is_global:
                return False
    except (ValueError, TypeError):
        return False
    return True


def public_food_query(text):
    """Explicit public food/area query only; never complete state or history."""
    if not isinstance(text, str) or not 2 <= len(text) <= 200:
        return None
    if (redact_sensitive(text) != text or is_health_or_allergy_disclosure(text)
            or re.search(r'https?\s*:|www\.|<|>|\{|\}|[\x00-\x1f\x7f]', text, re.I)):
        return None
    folded = fold_uncached(text)
    if re.search(r'\b(?:ignore|instructions?|system|prompt|api key|token|secret|password|bo qua quy tac|ghi db|thuc thi|gps|toa do|dia chi nha|nha toi|minh ten|toi ten|cccd)\b', folded):
        return None
    if not re.search(r'\b(?:pho|bun|banh|quan|mon|an|thuc don|am thuc|ca phe|che|kem|ho guom|hoan kiem|ha noi)\b', folded):
        return None
    query = re.sub(r'^\s*(?:tra\s+web|tra\s+cứu|tìm\s+trên\s+mạng)\s*[:\-]?\s*', '', text, flags=re.I)
    return ' '.join(query.split())[:160] or None
