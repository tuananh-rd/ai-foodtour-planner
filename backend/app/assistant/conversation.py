"""Bounded Vietnamese conversational assistant module (OA1).

Exports:
    - ConversationalAssistant: Contextual conversational layer around deterministic state/planner.
    - AssistantReply: Immutable result of an assistant turn.

Safety and Contract Guarantees (docs/ONLINE_ASSISTANT_CONTRACT.md):
    - Exactly preserved deterministic state and reply blocks; never mutated.
    - Strict schema validation rejecting tool calls, actions, and patches.
    - Rejection of allergy clearance, unverified venue/operational claims, and unsupported numeric facts.
    - Rejection of agent roleplay (em / Đại Ca in product replies) and instruction leakage.
    - Bounded context with privacy redaction for coordinates, contact info, and secrets.
    - Zero direct HTTP requests, credential creation, or budget modifications.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Optional

try:
    from app.llm.provider import ProviderError
except ImportError:
    class ProviderError(Exception):  # pragma: no cover
        def __init__(self, kind: str, message: str = "", status: int | None = None):
            super().__init__(message or kind)
            self.kind = kind
            self.status = status


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
MAX_TURN_CHARS = 250
MAX_USER_TEXT_CHARS = 400
MAX_REPLY_CHARS = 600

# --- Privacy Redaction Regexes ---

RE_COORDINATE_PAIR = re.compile(
    r"(?:"
    r"\(?\s*-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}\s*\)?"
    r"|\b(?:lat|latitude|lon|lng|longitude)\s*[:=]\s*-?\d{1,3}(?:\.\d+)?\b"
    r"|\b(?:20|21)\.\d{3,}\b"
    r"|\b(?:105|106)\.\d{3,}\b"
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
    """Redact coordinate pairs, contact details, and secret-like strings."""
    if not isinstance(text, str):
        return ""
    text = RE_COORDINATE_PAIR.sub("[redacted_coord]", text)
    text = RE_PHONE.sub("[redacted_phone]", text)
    text = RE_EMAIL.sub("[redacted_email]", text)
    text = RE_SECRET.sub("[redacted_secret]", text)
    return text


# --- Rejection Guards Regexes ---

RE_ALLERGY_CLEARANCE = re.compile(
    r"(?:"
    r"an\s+to\u00e0n\s+cho.*d\u1ecb\s+\u1ee9ng"
    r"|kh\u00f4ng\s+(?:lo|s\u1ee3)\s+d\u1ecb\s+\u1ee9ng"
    r"|\u0111\u1ea3m\s+b\u1ea3o\s+kh\u00f4ng\s+(?:b\u1ecb\s+)?d\u1ecb\s+\u1ee9ng"
    r"|ho\u00e0n\s+to\u00e0n\s+an\s+to\u00e0n"
    r"|cam\s+k\u1ebft\s+an\s+to\u00e0n"
    r"|kh\u00f4ng\s+ch\u1ee9a\s+ch\u1ea5t\s+d\u1ecb\s+\u1ee9ng"
    r"|kh\u00f4ng\s+(?:h\u1ec1\s+)?c\u00f3\s+(?:l\u1ea1c|\u0111\u1eadu\s+ph\u1ed9ng|h\u1ea3i\s+s\u1ea3n|t\u00f4m|cua|tr\u1ee9ng|s\u1eefa|gluten)"
    r"|tuy\u1ec7t\s+\u0111\u1ed1i\s+an\s+to\u00e0n"
    r")",
    re.IGNORECASE,
)

RE_AGENT_ROLEPLAY = re.compile(
    r"(?:"
    r"\b\u0111\u1ea1i\s+ca\b"
    r"|\bti\u1ec3u\s+\u0111\u1ec7\b"
    r"|\b\u0111\u00e0n\s+em\b"
    r"|phen\s+n\u00e0y\s+em\s+s\u01a1\s+su\u1ea5t"
    r"|x\u1eed\s+\u0111\u1eb9p\s+con\s+h\u00e0ng"
    r")",
    re.IGNORECASE,
)

RE_INSTRUCTION_LEAKAGE = re.compile(
    r"(?:"
    r"system\s+prompt"
    r"|system\s+instruction"
    r"|prompt\s+injection"
    r"|you\s+are\s+an?\s+ai"
    r"|b\u1ea1n\s+l\u00e0\s+m\u00f4\s+h\u00ecnh\s+ng\u00f4n\s+ng\u1eef"
    r"|ignore\s+previous\s+instructions"
    r"|theo\s+ch\u1ec9\s+\u0111\u1ea1o\s+c\u1ee7a\s+h\u1ec7\s+th\u1ed1ng"
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

RE_SPECIFIC_PRICE = re.compile(
    r"\b(\d{1,4}(?:\.\d{3})+|\d{1,4})\s*(?:k|\u0111|vnd|\u0111\u1ed3ng|ngh\u00ecn|tri\u1ec7u)\b",
    re.IGNORECASE,
)

RE_SPECIFIC_HOURS = re.compile(
    r"\b([01]?\d|2[0-3])(?::([0-5]\d)|h([0-5]\d)?)\b",
    re.IGNORECASE,
)

RE_SPECIFIC_RATING = re.compile(
    r"\b([1-5]\.[0-9])\s*(?:sao|star|\u0111i\u1ec3m)\b",
    re.IGNORECASE,
)

RE_NAMED_VENUE = re.compile(
    r"\b(?:qu\u00e1n|nh\u00e0\s+h\u00e0ng|ti\u1ec7m)\s+([A-Z\u00c0-\u1ef9][\w\s]+)",
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
2. KHÔNG BAO GIỜ tuyên bố quán ăn hoặc món ăn là "an toàn cho người dị ứng" hay đảm bảo không chứa chất dị ứng. Hệ thống không có thẩm quyền y tế/xác minh thành phần chi tiết.
3. KHÔNG BAO GIỜ bịa đặt giá tiền cụ thể, giờ mở cửa/đóng cửa, xếp hạng hoặc tên quán không có trong dữ liệu được cung cấp.
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


def project_safe_state(state: Any) -> dict:
    """Project minimal, privacy-safe state excluding GPS coordinates, tokens, and private venues."""
    if not state:
        return {}

    if hasattr(state, "to_json"):
        st_dict = state.to_json(private=False)
    elif isinstance(state, dict):
        st_dict = state
    else:
        st_dict = {}

    out: dict[str, Any] = {}
    if "phase" in st_dict:
        out["phase"] = st_dict["phase"]
    elif hasattr(state, "phase"):
        out["phase"] = getattr(state, "phase")

    pending = st_dict.get("pending") if "pending" in st_dict else getattr(state, "pending", None)
    if pending:
        if isinstance(pending, dict):
            out["pending"] = {
                "kind": pending.get("kind"),
                "slot": pending.get("slot"),
            }
        elif hasattr(pending, "kind"):
            out["pending"] = {
                "kind": getattr(pending, "kind", None),
                "slot": getattr(pending, "slot", None),
            }
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
                    safe_profile[k] = val
        if safe_profile:
            out["profile"] = safe_profile

    if "has_allergy" in st_dict:
        out["has_allergy"] = bool(st_dict["has_allergy"])
    elif "allergies" in st_dict:
        out["has_allergy"] = bool(st_dict["allergies"])
    elif hasattr(state, "allergies"):
        out["has_allergy"] = bool(getattr(state, "allergies"))

    return out


def project_recent_turns(recent_turns: Any) -> list[dict]:
    """Extract and redact the last 4 text turns with bounded lengths."""
    if not recent_turns or not isinstance(recent_turns, (list, tuple)):
        return []
    turns = []
    for t in recent_turns[-4:]:
        if isinstance(t, dict):
            role = str(t.get("role", "user"))
            text = str(t.get("text", ""))
        elif hasattr(t, "role") and hasattr(t, "text"):
            role = str(getattr(t, "role", "user"))
            text = str(getattr(t, "text", ""))
        else:
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
    """Conversational assistant enforcing contract OA1."""

    def __init__(self, provider: Any = None):
        self.provider = provider

    @property
    def provider_label(self) -> str:
        if self.provider is None:
            return "none"
        return str(
            getattr(self.provider, "model", None)
            or getattr(self.provider, "name", None)
            or "gemini"
        )

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

        # Guard: Allergy clearance claim
        if RE_ALLERGY_CLEARANCE.search(reply):
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
        context_numbers = extract_context_numbers(user_text, safe_state, recent_turns, reply_blocks)

        # Check prices
        for m in RE_SPECIFIC_PRICE.finditer(reply):
            num_clean = m.group(1).replace(".", "")
            if num_clean not in context_numbers and m.group(1) not in context_numbers:
                return False, None

        # Check hours/times
        for m in RE_SPECIFIC_HOURS.finditer(reply):
            h = m.group(1)
            minute = m.group(2) or m.group(3) or "00"
            if h not in context_numbers and minute not in context_numbers and f"{h}:{minute}" not in context_numbers:
                return False, None

        # Check ratings
        for m in RE_SPECIFIC_RATING.finditer(reply):
            if m.group(1) not in context_numbers:
                return False, None

        # Guard: Invented venue names when no venues are in context
        for m in RE_NAMED_VENUE.finditer(reply):
            candidate = m.group(1).strip()
            # If candidate is not a common noun and not in context
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
        safe_state = project_safe_state(state)
        safe_turns = project_recent_turns(recent_turns)

        # Build bounded prompt representation
        prompt_parts = []
        if safe_state.get("phase"):
            prompt_parts.append(f"Giai đoạn hiện tại: {safe_state['phase']}.")
        if safe_state.get("pending"):
            p = safe_state["pending"]
            prompt_parts.append(f"Hệ thống đang chờ người dùng trả lời: {p.get('kind')} (mục: {p.get('slot')}).")
        if safe_state.get("profile"):
            prompt_parts.append(f"Thông tin đã biết: {safe_state['profile']}.")
        if safe_state.get("has_allergy"):
            prompt_parts.append("Lưu ý: Có ghi nhận thông tin dị ứng từ người dùng.")
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
