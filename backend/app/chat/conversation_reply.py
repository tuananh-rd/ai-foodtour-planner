"""Read-only conversation decoration; the deterministic reply remains authoritative."""
from __future__ import annotations

import copy
import re

from app.planner.relevance import fold_uncached


def private_turn(text):
    """Conservative refusal to send sensitive user text to optional public providers."""
    from app.assistant.conversation import redact_sensitive
    if not isinstance(text, str):
        return False
    folded = fold_uncached(text)
    return bool(redact_sensitive(text) != text or re.search(
        r'\b(?:di ung|benh|trieu chung|ho so|chan doan|so dien thoai|dia chi nha|gps|toa do|password|api key|mat khau)\b', folded))


def decorate_reply(assistant, result, user_text, recent_turns, *, budget, session_cap, reserve):
    meta = {'status': 'skipped', 'provider': 'none', 'llm_calls': 0}
    if not user_text or result.llm_calls or result.state.llm_used >= session_cap:
        return meta
    if private_turn(user_text):
        return dict(meta, status='rejected')
    if budget and (budget.get('exhausted') or budget.get('remaining', 0) <= reserve):
        return dict(meta, status='quota')
    # No venue records, coordinates, addresses, allergy disclosures or session tokens.
    state = {
        'phase': result.state.phase,
        'pending': ({'kind': result.state.pending.kind, 'slot': result.state.pending.slot}
                    if result.state.pending else None),
        'profile': {key: result.state.profile[key].to_json() for key in (
            'party_size', 'budget', 'duration_min', 'vehicle', 'max_leg_min', 'stops')},
    }
    try:
        history = [turn for turn in recent_turns if not private_turn(turn.get('text', ''))][-4:]
        reply = assistant.respond(user_text, copy.deepcopy(history), state, [], deadline_s=8.0)
        calls = reply.llm_calls
        if type(calls) is not int or calls not in (0, 1):
            return dict(meta, status='rejected')
        result.state.llm_used += calls
        status = reply.status if reply.status in ('ok', 'disabled', 'unavailable', 'quota', 'rejected') else 'rejected'
        meta = {'status': status, 'provider': 'gemini' if reply.provider == 'gemini' else 'none', 'llm_calls': calls}
        text = reply.text
        if status != 'ok' or not isinstance(text, str) or not text.strip() or len(text) > 600:
            return meta
        # Keep the single deterministic decision question and all warnings/facts.
        if result.state.pending and ('?' in text or '？' in text):
            return dict(meta, status='rejected')
        if (result.intent == 'GREET_OR_SMALLTALK' and not result.state.pending
                and not result.state.allergies and not result.state.allergy_unresolved):
            result.blocks = [b for b in result.blocks if b.get('type') != 'text']
        result.blocks.insert(0, {'type': 'text', 'text': text.strip()})
        if result.state.turns and result.state.turns[-1].get('role') == 'assistant':
            result.state.turns[-1]['text'] = ' '.join(b.get('text', '') for b in result.blocks if b.get('type') == 'text')[:300]
        return meta
    except Exception:
        # Provider internals and private prompts never enter logs or public errors.
        return dict(meta, status='unavailable')
