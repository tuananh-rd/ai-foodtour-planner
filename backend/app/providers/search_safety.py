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


def free_account_remaining(payload):
    """Conservative official /usage gate; unknown/paid/PAYGO settings fail closed.

    Researcher is the documented free plan. Unknown names/schema are not inferred
    free. Require a bounded provider-side key limit as well as local accounting.
    This read-only snapshot cannot stop a human changing account settings later.
    """
    if not isinstance(payload, dict):
        return None
    account, key = payload.get('account'), payload.get('key')
    if not isinstance(account, dict) or not isinstance(key, dict):
        return None
    if not isinstance(account.get('current_plan'), str) or account['current_plan'].casefold() != 'researcher':
        return None
    fields = [account.get(name) for name in ('plan_usage', 'plan_limit', 'paygo_usage', 'paygo_limit')]
    key_fields = [key.get(name) for name in ('usage', 'limit')]
    if any(type(value) is not int for value in fields + key_fields):
        return None
    used, limit, paygo_used, paygo_limit = fields
    key_used, key_limit = key_fields
    if (not 0 <= used <= limit <= 1000 or limit < 1
            or paygo_used != 0 or paygo_limit != 0
            or not 0 <= key_used <= key_limit <= 1000 or key_limit < 1):
        return None
    return min(limit-used, key_limit-key_used)
