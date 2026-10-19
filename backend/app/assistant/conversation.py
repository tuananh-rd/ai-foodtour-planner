"""Bounded Vietnamese conversational assistant module (OA1 / OA1R).

Exports:
    - ConversationalAssistant: Contextual conversational layer around deterministic state/planner.
    - AssistantReply: Immutable result of an assistant turn.

Safety and Contract Guarantees (docs/ONLINE_ASSISTANT_CONTRACT.md):
    - Exactly preserved deterministic state and reply blocks; never mutated.
    - Strict schema validation rejecting tool calls, actions, and patches.
    - Rejection of allergy clearance, unverified venue/operational claims, and unsupported numeric facts.
    - Rejection of operational hours, price claims, and ETA/duration claims even if numbers appear in inputs.
    - Health and allergy disclosures in current user turn are rejected with 0 external LLM calls.
    - Sensitive health/allergy history is omitted and no has_allergy note is sent to external prompt (per unpaid Gemini terms).
    - Rejection of agent roleplay (em / Đại Ca in product replies) and instruction leakage.
    - Bounded context with privacy redaction for low/high-precision coordinates, contact info, and secrets.
    - Sensitive output echoes (coordinates, phones, emails, tokens, redacted tags) are strictly rejected.
    - Zero direct HTTP requests, credential creation, or budget modifications.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Optional

from app.llm.provider import ProviderError


# --- Schema and Limits ---

REPLY_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "reply": {
            "type": "STRING",
            "description": "Natural Vietnamese conversational response to the user",
        }
    },
    "required": ["reply"],
}

ALLOWED_STATUSES = {"ok", "disabled", "unavailable", "quota", "rejected"}
ALLOWED_ROLES = {"user", "assistant", "bot"}
MAX_TURN_CHARS = 250
MAX_USER_TEXT_CHARS = 400
MAX_REPLY_CHARS = 600

# --- Privacy Redaction Regexes ---

RE_COORDINATE_PAIR = re.compile(
    r"(?:"
    r"\b(?:lat|latitude|lon|lng|longitude)\s*[:=]\s*-?\d{1,3}(?:\.\d+)?\b"
    r"|(?:tọa\s*độ|toa\s*do|coords?|coordinates?)\s*[:=]?\s*\(?\s*-?\d{1,3}(?:\.\d+)?\s*[,;\s]\s*-?\d{1,3}(?:\.\d+)?\s*\)?"
    r"|\(\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*\)"
    r"|\b-?\d{1,3}(?:\.\d+)\s*,\s*-?\d{1,3}(?:\.\d+)?\b"
    r"|\b-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)\b"
    r"|\b2[0-1]\.\d+\b"
    r"|\b10[5-6]\.\d+\b"
    r")",
    re.IGNORECASE,
)

RE_PHONE = re.compile(
    r"(?:\+?84|0)(?:3|5|7|8|9)\d{8}\b|\b\d{3,4}[-.\s]\d{3,4}[-.\s]\d{3,4}\b"
)

RE_EMAIL = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"
)

RE_SECRET = re.compile(
    r"(?:"
    r"\bAIza[0-9A-Za-z-_]{35}\b"
    r"|\bghp_[a-zA-Z0-9]{36}\b"
    r"|\bbearer\s+[a-zA-Z0-9_\-\.]{16,}\b"
    r"|\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*['\"]?[a-zA-Z0-9_\-]{8,}['\"]?\b"
    r"|\b[a-f0-9]{32,64}\b"
    r")",
    re.IGNORECASE,
)


def redact_sensitive(text: str) -> str:
    """Redact arbitrary low-precision coordinate pairs, contact details, and secret-like strings."""
    if not isinstance(text, str):
        return ""
    text = RE_COORDINATE_PAIR.sub("[redacted_coord]", text)
    text = RE_PHONE.sub("[redacted_phone]", text)
    text = RE_EMAIL.sub("[redacted_email]", text)
    text = RE_SECRET.sub("[redacted_secret]", text)
    return text


# --- Health and Allergy Disclosure Detection ---

RE_HEALTH_OR_ALLERGY = re.compile(
    r"(?:"
    r"\b(?:dị\s*ứng|di\s*ung|dị\s*tính)\b"
    r"|\b(?:tiểu\s*đường|tim\s*mạch|huyết\s*áp|đau\s*dạ\s*dày)\b"
    r"|\bkiêng\s*(?:ăn\s*)?(?:lạc|đậu\s*phộng|hải\s*sản|tôm|cua|trứng|sữa|gluten|thịt|bò|gà|mỡ|đường)\b"
    r"|\bkhông\s*ăn\s*được\s*(?:lạc|đậu\s*phộng|hải\s*sản|tôm|cua|trứng|sữa|gluten)\b"
    r")",
    re.IGNORECASE,
)


def is_health_or_allergy_disclosure(text: str) -> bool:
    """Detect health or allergy disclosures requiring zero external LLM calls."""
    if not isinstance(text, str):
        return False
    return bool(RE_HEALTH_OR_ALLERGY.search(text))


# --- Rejection Guards Regexes ---

RE_ALLERGY_CLEARANCE = re.compile(
    r"(?:"
    r"\băn\s+(?:lạc|đậu\s+phộng|hải\s+sản|tôm|cua|trứng|sữa|gluten)\s+(?:(?:thì\s+)?được|thoải\s+mái)?\s*không\s+sao\b"
    r"|\băn\s+(?:được|thoải\s+mái)\s*không\s+sao\b"
    r"|\bkhông\s+sao\s+đâu\b"
    r"|\byên\s+tâm\s+ăn\b"
    r"|an\s+toàn\s+cho.*dị\s+ứng"
    r"|không\s+(?:lo|sợ)\s+dị\s+ứng"
    r"|đảm\s+bảo\s+không\s+(?:bị\s+)?dị\s+ứng"
    r"|hoàn\s+toàn\s+an\s+toàn"
    r"|cam\s+kết\s+an\s+toàn"
    r"|không\s+chứa\s+chất\s+dị\s+ứng"
    r"|không\s+(?:hề\s+)?có\s+(?:lạc|đậu\s+phộng|hải\s+sản|tôm|cua|trứng|sữa|gluten)"
    r"|tuyệt\s+đối\s+an\s+toàn"
    r")",
    re.IGNORECASE,
)

RE_PRICE_CLAIM = re.compile(
    r"(?:"
    r"\bquán\s+(?:này\s+)?(?:có\s+)?giá\b"
    r"|\bgiá\s+(?:khoảng|tầm|chỉ|khoảng\s+tầm)?\s*\d+\s*(?:k|đ|vnd|đồng|nghìn|triệu)\b"
    r"|\b\d+\s*(?:k|đ|vnd|đồng|nghìn|triệu)\s*(?:một|mỗi|cho\s+mỗi)?\s*(?:bát|phần|món|suất|người|ly|cốc)\b"
    r"|\bchi\s+phí\s+(?:khoảng|tầm|là)?\s*\d+\b"
    r"|\b(?:đồng|k|đ|vnd)\s*[\/]\s*(?:bát|suất|món|người)\b"
    r")",
    re.IGNORECASE,
)

RE_OPERATIONAL_CLAIM = re.compile(
    r"(?:"
    r"\b(?:đang|hiện\s+đang)\s+(?:mở|đóng|hoạt\s+động)\b"
    r"|\bmở\s+cửa\s+(?:cả\s+ngày|suốt\s+ngày|24\/24|từ|lúc|vào|đến)\b"
    r"|\bđóng\s+cửa\s+(?:lúc|vào|muộn|sớm)\b"
    r"|\b(?:phục\s+vụ|hoạt\s+động|bán)\s+(?:cả\s+ngày|suốt\s+ngày|24\/24|thông\s+trưa)\b"
    r"|\b(?:mở|bán)\s+(?:từ\s+\d+|đến\s+\d+)\b"
    r"|\bgiờ\s+mở\s+cửa\b"
    r")",
    re.IGNORECASE,
)

RE_ETA_CLAIM = re.compile(
    r"(?:"
    r"\bchỉ\s+mất\s+(?:vài|\d+)\s+phút\b"
    r"|\bmất\s+(?:khoảng|tầm|chỉ|\d+)\s+phút\s+(?:là\s+tới|là\s+đến|di\s+chuyển|đi\s+bộ)?\b"
    r"|\bđi\s+(?:bộ\s+)?mất\s+(?:vài|\d+)\s+phút\b"
    r"|\b(?:khoảng|chỉ|tầm)\s+\d+\s+phút\s+là\s+(?:tới|đến)\b"
    r"|\bthời\s+gian\s+di\s+chuyển\b"
    r"|\bchỉ\s+cách\s+(?:đây\s+)?\d+\s*(?:m|mét|km)\b"
    r")",
    re.IGNORECASE,
)

RE_AGENT_ROLEPLAY = re.compile(
    r"(?:"
    r"\bđại\s+ca\b"
    r"|\btiểu\s+đệ\b"
    r"|\bđàn\s+em\b"
    r"|phen\s+này\s+em\s+sơ\s+suất"
    r"|xử\s+đẹp\s+con\s+hàng"
    r")",
    re.IGNORECASE,
)

RE_INSTRUCTION_LEAKAGE = re.compile(
    r"(?:"
    r"system\s+prompt"
    r"|system\s+instruction"
    r"|prompt\s+injection"
    r"|you\s+are\s+an?\s+ai"
    r"|bạn\s+là\s+mô\s+hình\s+ngôn\s+ngữ"
    r"|ignore\s+previous\s+instructions"
    r"|theo\s+chỉ\s+đạo\s+của\s+hệ\s+thống"
    r")",
    re.IGNORECASE,
)

RE_PLANNER_COMMANDS = re.compile(
    r"(?:"
    r"\b(?:UPDATE_PREFERENCES|set_slot|plan_tour|confirm_plan|execute_action)\b"
    r"|[\{\[][\s\S]*\"(?:action|slot|tool|patch)\"[\s\S]*[\}\]]"
    r")",
    re.IGNORECASE,
)

RE_FALSE_ACTION_OR_MUTATION_CLAIM = re.compile(
    r"(?:"
    r"\b(?:mình\s+)?đã\s+xác\s+nhận\b"
    r"|\b(?:mình\s+)?đã\s+tạo\s+tour\b"
    r"|\b(?:mình\s+)?đã\s+bỏ\s+dị\s+ứng\b"
    r"|\b(?:mình\s+)?đã\s+chốt\s+(?:kế\s+hoạch|tour|lịch\s+trình)\b"
    r"|\b(?:mình\s+)?đã\s+đặt\s+(?:bàn|chỗ)\b"
    r"|\btạo\s+tour\s+thành\s+công\b"
    r"|\bbỏ\s+dị\s+ứng\s+khỏi\s+yêu\s+cầu\b"
    r"|\bxác\s+nhận\s+và\s+tạo\s+tour\b"
    r")",
    re.IGNORECASE,
)

RE_SPECIFIC_PRICE_DIGITS = re.compile(
    r"\b(\d{1,4}(?:\.\d{3})+|\d{1,4})\s*(?:k|đ|vnd|đồng|nghìn|triệu)\b",
    re.IGNORECASE,
)

RE_SPECIFIC_HOURS_DIGITS = re.compile(
    r"\b([01]?\d|2[0-3])(?::([0-5]\d)|h([0-5]\d)?)\b",
    re.IGNORECASE,
)

RE_SPECIFIC_RATING_DIGITS = re.compile(
    r"\b([1-5]\.[0-9])\s*(?:sao|star|điểm)\b",
    re.IGNORECASE,
)

RE_NAMED_VENUE = re.compile(
    r"\b(?:quán|nhà\s+hàng|tiệm)\s+([A-ZÀ-Ỹ][\w\s]+)",
)

DISALLOWED_EXTRA_KEYS = {
    "action", "tool", "tools", "patch", "commands", "command",
    "plan", "slots", "slot", "function_call", "function", "state", "status"
}


SYSTEM_PROMPT = """Bạn là trợ lý đắc lực hỗ trợ khám phá ẩm thực Hà Nội cho ứng dụng AI FoodTour.
Nhiệm vụ của bạn:
- Đưa ra phản hồi hội thoại bằng tiếng Việt tự nhiên, thân thiện, lịch sự và súc tích (1-3 câu).
- Tôn trọng và hòa hợp với các câu hỏi và trạng thái hiện tại của hệ thống.

Quy tắc bất biến:
1. KHÔNG BAO GIỜ tự thực thi lệnh, sinh patch cấu trúc dữ liệu, gọi tool hay thay đổi state của hệ thống.
2. KHÔNG BAO GIỜ tuyên bố quán ăn hoặc món ăn là "an toàn cho người dị ứng", khẳng định ăn được không sao hay đảm bảo không chứa chất dị ứng. Hệ thống không có thẩm quyền y tế/xác minh thành phần chi tiết.
3. KHÔNG BAO GIỜ khẳng định giá quán/món cụ thể, giờ mở/đóng cửa, thời gian di chuyển/ETA (như chỉ mất vài phút), xếp hạng hoặc tên quán không có trong dữ liệu được cung cấp.
4. Khi có câu hỏi lựa chọn đang chờ (pending decision), KHÔNG đặt thêm câu hỏi mới gây xung đột với câu hỏi của hệ thống.
5. Luôn giữ phong cách giao tiếp chuyên nghiệp, nhã nhặn. Không dùng từ ngữ xưng hô đóng vai nội bộ (như đại ca, đàn em).
6. Định dạng đầu ra: Chỉ trả về JSON duy nhất theo schema {"reply": "câu trả lời của bạn"}. Tuyệt đối không thêm trường nào khác."""


@dataclass(frozen=True)
class AssistantReply:
    status: str
    text: Optional[str]
    provider: str
    llm_calls: int = 0

    def __post_init__(self):
        if self.status not in ALLOWED_STATUSES:
            raise ValueError(f"Invalid AssistantReply status: {self.status}")


def extract_fallback_text(reply_blocks: Any) -> Optional[str]:
    """Extract deterministic text from reply_blocks without modifying them."""
    if not reply_blocks:
        return None
    texts = []
    for b in reply_blocks:
        if isinstance(b, dict):
            b_type = b.get("type")
            b_text = b.get("text")
            if b_type == "text" and isinstance(b_text, str) and b_text.strip():
                texts.append(b_text.strip())
            elif b_type == "notice" and isinstance(b_text, str) and b_text.strip():
                texts.append(b_text.strip())
        elif hasattr(b, "type") and hasattr(b, "text"):
            b_type = getattr(b, "type")
            b_text = getattr(b, "text")
            if b_type in ("text", "notice") and isinstance(b_text, str) and b_text.strip():
                texts.append(b_text.strip())

    if not texts:
        for b in reply_blocks:
            if isinstance(b, dict):
                if b.get("type") == "clarify" and isinstance(b.get("question"), str):
                    texts.append(b["question"].strip())
            elif hasattr(b, "type") and getattr(b, "type") == "clarify" and hasattr(b, "question"):
                q = getattr(b, "question")
                if isinstance(q, str) and q.strip():
                    texts.append(q.strip())

    return "\n".join(texts) if texts else None


def _sanitize_string(v: Any, max_len: int = 60) -> str:
    """Sanitize control characters and bound length of state strings."""
    s = str(v or "")
    s = re.sub(r"[\x00-\x1f\x7f]", "", s)
    return s.strip()[:max_len]


def project_safe_state(state: Any) -> dict:
    """Project minimal, privacy-safe state excluding GPS coordinates, tokens, private venues, and allergy cues."""
    if not state:
        return {}

    if hasattr(state, "to_json"):
        st_dict = state.to_json(private=False)
    elif isinstance(state, dict):
        st_dict = state
    else:
        st_dict = {}

    out: dict[str, Any] = {}
    if "phase" in st_dict and st_dict["phase"]:
        out["phase"] = _sanitize_string(st_dict["phase"], 30)
    elif hasattr(state, "phase") and getattr(state, "phase"):
        out["phase"] = _sanitize_string(getattr(state, "phase"), 30)

    pending = st_dict.get("pending") if "pending" in st_dict else getattr(state, "pending", None)
    if pending:
        if isinstance(pending, dict):
            k = _sanitize_string(pending.get("kind"), 30)
            s = _sanitize_string(pending.get("slot"), 30)
            if k or s:
                out["pending"] = {"kind": k, "slot": s}
            else:
                out["pending"] = None
        elif hasattr(pending, "kind"):
            k = _sanitize_string(getattr(pending, "kind", None), 30)
            s = _sanitize_string(getattr(pending, "slot", None), 30)
            if k or s:
                out["pending"] = {"kind": k, "slot": s}
            else:
                out["pending"] = None
    else:
        out["pending"] = None

    profile = st_dict.get("profile") if "profile" in st_dict else getattr(state, "profile", None)
    if isinstance(profile, dict):
        safe_profile = {}
        for k in (
            "party_size", "budget", "budget_vnd", "duration_min",
            "vehicle", "max_leg_min", "stops", "tastes", "day_part"
        ):
            if k in profile:
                val = profile[k]
                if isinstance(val, dict) and "value" in val:
                    val = val["value"]
                elif hasattr(val, "value"):
                    val = getattr(val, "value")
                if val is not None:
                    if isinstance(val, (int, float)):
                        safe_profile[k] = val
                    elif isinstance(val, str):
                        safe_profile[k] = _sanitize_string(val, 50)
                    elif isinstance(val, (list, tuple)):
                        safe_profile[k] = [_sanitize_string(item, 30) for item in val[:5] if item]
        if safe_profile:
            out["profile"] = safe_profile

    # Note: no has_allergy in external prompt per official unpaid Gemini terms
    return out


def project_recent_turns(recent_turns: Any) -> list[dict]:
    """Extract and redact the last 4 text turns with bounded lengths.

    Omits turns disclosing health/allergy conditions per official unpaid Gemini terms.
    Whitelists roles to allowed user/assistant roles.
    """
    if not recent_turns or not isinstance(recent_turns, (list, tuple)):
        return []
    turns = []
    for t in recent_turns[-4:]:
        if isinstance(t, dict):
            raw_role = str(t.get("role", "user")).strip().lower()
            text = str(t.get("text", ""))
        elif hasattr(t, "role") and hasattr(t, "text"):
            raw_role = str(getattr(t, "role", "user")).strip().lower()
            text = str(getattr(t, "text", ""))
        else:
            continue

        # Whitelist history role
        if raw_role not in ALLOWED_ROLES:
            continue
        role = "assistant" if raw_role in ("assistant", "bot") else "user"

        # Omit sensitive health/allergy history
        if is_health_or_allergy_disclosure(text):
            continue

        cleaned = redact_sensitive(text).strip()
        if cleaned:
            turns.append({"role": role, "text": cleaned[:MAX_TURN_CHARS]})
    return turns


def extract_context_numbers(user_text: str, safe_state: dict, recent_turns: list[dict], reply_blocks: Any) -> set[str]:
    """Collect known numbers/digits from context to guard against unsupported numeric hallucination."""
    raw_sources = [user_text]
    for t in recent_turns:
        raw_sources.append(t.get("text", ""))
    profile = safe_state.get("profile", {})
    for v in profile.values():
        if isinstance(v, (int, float, str)):
            raw_sources.append(str(v))
    if reply_blocks:
        for b in reply_blocks:
            if isinstance(b, dict):
                for v in b.values():
                    if isinstance(v, (int, float, str)):
                        raw_sources.append(str(v))

    combined = " ".join(raw_sources)
    numbers = set(re.findall(r"\d+", combined))
    return numbers


class ConversationalAssistant:
    """Conversational assistant enforcing contract OA1 / OA1R."""

    def __init__(self, provider: Any = None):
        self.provider = provider

    @property
    def provider_label(self) -> str:
        if self.provider is None:
            return "none"
        return "gemini"

    @property
    def is_configured(self) -> bool:
        if self.provider is None:
            return False
        return bool(getattr(self.provider, "configured", True))

    def _validate_reply(
        self,
        raw: Any,
        user_text: str,
        safe_state: dict,
        recent_turns: list[dict],
        reply_blocks: Any,
    ) -> tuple[bool, Optional[str]]:
        """Validate LLM output against strict schema and hallucination/safety guards."""
        if not isinstance(raw, dict):
            return False, None

        keys = set(raw.keys())
        if keys != {"reply"} or (keys & DISALLOWED_EXTRA_KEYS):
            return False, None

        reply = raw.get("reply")
        if not isinstance(reply, str) or not reply.strip():
            return False, None
        reply = reply.strip()
        if len(reply) > MAX_REPLY_CHARS:
            return False, None

        # Guard: Agent roleplay forbidden in customer replies
        if RE_AGENT_ROLEPLAY.search(reply):
            return False, None

        # Guard: Instruction leakage
        if RE_INSTRUCTION_LEAKAGE.search(reply):
            return False, None

        # Guard: Planner commands / actions / patches
        if RE_PLANNER_COMMANDS.search(reply):
            return False, None

        # Guard: False action claims or confirmation / state mutation
        if RE_FALSE_ACTION_OR_MUTATION_CLAIM.search(reply):
            return False, None

        # Guard: Allergy clearance claim (including 'ăn lạc được không sao')
        if RE_ALLERGY_CLEARANCE.search(reply):
            return False, None

        # Guard: Price claim for venue/dishes (even if number was in input)
        if RE_PRICE_CLAIM.search(reply):
            return False, None

        # Guard: Operational hours claim for venues (even if number was in input)
        if RE_OPERATIONAL_CLAIM.search(reply):
            return False, None

        # Guard: ETA / travel duration claim (even if number was in input)
        if RE_ETA_CLAIM.search(reply):
            return False, None

        # Guard: Sensitive output echoes (coordinates, phones, emails, secrets, or internal redacted tags)
        if (
            RE_SECRET.search(reply)
            or RE_PHONE.search(reply)
            or RE_EMAIL.search(reply)
            or RE_COORDINATE_PAIR.search(reply)
            or "[redacted_" in reply
        ):
            return False, None

        # Guard: Decision question preservation
        has_pending = safe_state.get("pending") is not None
        if has_pending:
            if "?" in reply:
                return False, None
        else:
            if reply.count("?") > 1:
                return False, None

        # Guard: Unsupported numeric facts (prices, hours, ratings)
        # A repeated user/model number is not authoritative state evidence.
        profile = safe_state.get('profile', {})
        context_numbers = {str(value) for value in profile.values() if type(value) in (int, float)}

        for m in RE_SPECIFIC_PRICE_DIGITS.finditer(reply):
            num_clean = m.group(1).replace(".", "")
            amount = int(num_clean)
            unit = m.group(0)[len(m.group(1)):].strip().casefold()
            if unit in ('k', 'nghìn'):
                amount *= 1000
            elif unit == 'triệu':
                amount *= 1000000
            if amount != profile.get('budget', profile.get('budget_vnd')):
                return False, None

        for m in RE_SPECIFIC_HOURS_DIGITS.finditer(reply):
            h = m.group(1)
            minute = m.group(2) or m.group(3) or "00"
            if h not in context_numbers and minute not in context_numbers and f"{h}:{minute}" not in context_numbers:
                return False, None

        for m in RE_SPECIFIC_RATING_DIGITS.finditer(reply):
            if m.group(1) not in context_numbers:
                return False, None

        # Guard: Profile slot numbers in reply must match authoritative structured state, not user text alone
        profile = safe_state.get("profile", {})
        party_m = re.search(r"\b(\d+)\s*(?:người|thành\s+viên|khách)\b", reply, re.IGNORECASE)
        if party_m:
            num = int(party_m.group(1))
            auth_party = profile.get("party_size")
            if auth_party is None or num != int(auth_party):
                return False, None

        dur_m = re.search(r"\b(\d+)\s*phút\b", reply, re.IGNORECASE)
        if dur_m:
            num = int(dur_m.group(1))
            auth_dur = profile.get("duration_min")
            auth_leg = profile.get("max_leg_min")
            valid_durs = {int(x) for x in (auth_dur, auth_leg) if x is not None}
            if num not in valid_durs:
                return False, None

        stops_m = re.search(r"\b(\d+)\s*(?:quán|điểm\s+dừng|chặng)\b", reply, re.IGNORECASE)
        if stops_m:
            num = int(stops_m.group(1))
            auth_stops = profile.get("stops")
            if auth_stops is None or num != int(auth_stops):
                return False, None

        # Guard: Invented venue names when no venues are in context
        for m in RE_NAMED_VENUE.finditer(reply):
            candidate = m.group(1).strip()
            folded_candidate = unicodedata.normalize("NFC", candidate).casefold()
            if folded_candidate not in ("ăn", "uống", "nước", "ngon", "phố cổ"):
                combined_context = (
                    user_text + " " + " ".join(t.get("text", "") for t in recent_turns)
                )
                if folded_candidate not in unicodedata.normalize("NFC", combined_context).casefold():
                    return False, None

        return True, reply

    def respond(
        self,
        user_text: Any,
        recent_turns: Any,
        state: Any,
        reply_blocks: Any,
        *,
        deadline_s: float = 8.0,
    ) -> AssistantReply:
        """Process user turn and return AssistantReply."""
        fallback_text = extract_fallback_text(reply_blocks)

        if not self.is_configured:
            return AssistantReply(
                status="disabled",
                text=fallback_text,
                provider=self.provider_label,
                llm_calls=0,
            )

        clean_user_text = redact_sensitive(str(user_text or ""))[:MAX_USER_TEXT_CHARS]

        # Guard: Health / allergy disclosure in current user turn
        # Per official unpaid Gemini terms, health/allergy disclosures are rejected with 0 calls
        if is_health_or_allergy_disclosure(clean_user_text):
            return AssistantReply(
                status="rejected",
                text=fallback_text,
                provider=self.provider_label,
                llm_calls=0,
            )

        safe_state = project_safe_state(state)
        safe_turns = project_recent_turns(recent_turns)

        # Build bounded prompt representation (no has_allergy external prompt)
        prompt_parts = []
        if safe_state.get("phase"):
            prompt_parts.append(f"Giai đoạn hiện tại: {safe_state['phase']}.")
        if safe_state.get("pending"):
            p = safe_state["pending"]
            prompt_parts.append(f"Hệ thống đang chờ người dùng trả lời: {p.get('kind')} (mục: {p.get('slot')}).")
        if safe_state.get("profile"):
            prompt_parts.append(f"Thông tin đã biết: {safe_state['profile']}.")
        if safe_turns:
            prompt_parts.append("Hội thoại gần nhất:")
            for t in safe_turns:
                prompt_parts.append(f"- {t['role']}: {t['text']}")
        prompt_parts.append(f"Tin nhắn người dùng vừa gửi: {clean_user_text}")

        user_prompt = "\n".join(prompt_parts)

        llm_calls = 0
        try:
            llm_calls = 1
            raw_output = self.provider.generate_json(
                system=SYSTEM_PROMPT,
                user_text=user_prompt,
                schema=REPLY_SCHEMA,
                deadline_s=deadline_s,
                max_output_tokens=300,
                retry=False,
            )
        except ProviderError as e:
            calls = getattr(e, "llm_calls", llm_calls)
            if getattr(e, "status", None) == 429 or getattr(e, "kind", "") == "quota":
                return AssistantReply(
                    status="quota",
                    text=fallback_text,
                    provider=self.provider_label,
                    llm_calls=calls,
                )
            elif getattr(e, "kind", "") in ("unavailable", "timeout"):
                return AssistantReply(
                    status="unavailable",
                    text=fallback_text,
                    provider=self.provider_label,
                    llm_calls=calls,
                )
            else:
                return AssistantReply(
                    status="rejected",
                    text=fallback_text,
                    provider=self.provider_label,
                    llm_calls=calls,
                )
        except TimeoutError:
            return AssistantReply(
                status="unavailable",
                text=fallback_text,
                provider=self.provider_label,
                llm_calls=llm_calls,
            )
        except Exception:
            return AssistantReply(
                status="rejected",
                text=fallback_text,
                provider=self.provider_label,
                llm_calls=llm_calls,
            )

        valid, validated_text = self._validate_reply(
            raw_output, clean_user_text, safe_state, safe_turns, reply_blocks
        )
        if not valid or validated_text is None:
            return AssistantReply(
                status="rejected",
                text=fallback_text,
                provider=self.provider_label,
                llm_calls=llm_calls,
            )

        return AssistantReply(
            status="ok",
            text=validated_text,
            provider=self.provider_label,
            llm_calls=llm_calls,
        )
