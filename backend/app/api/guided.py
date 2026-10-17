"""Public v1.9 boundary: fixed metadata vocabulary, no free text in turn metadata."""
TRIGGERS = ('low_conf', 'uncovered', 'multi_clause', 'conflict')
SIGNALS = ('allergy', 'dish', 'stops', 'day_part', 'budget', 'budget_scope', 'duration',
           'leg_time', 'party', 'area', 'time', 'vehicle')
STATUSES = ('captured', 'uncovered', 'asked')


def bounded_count(value, maximum=2**31-1):
    return value if type(value) is int and 0 <= value <= maximum else 0


def public_chat(state, *, guided):
    value = state.to_json()
    if guided:
        value['profile']['budget'].setdefault('scope', None)
    return value


def guided_turn(result, budget, understander, session_cap, reserve):
    reason = result.trigger_reason
    signals = result.coverage
    coverage = None
    if isinstance(signals, list) and len(signals) <= 64 and all(
            isinstance(s, dict) and s.get('kind') in SIGNALS and s.get('status') in STATUSES for s in signals):
        coverage = {'signals': [{'kind':s['kind'], 'status':s['status']} for s in signals],
                    'complete': all(s['status'] != 'uncovered' for s in signals)}
    status, used, cap = 'unavailable', 0, 0
    if understander is not None:
        # Injected understanders may supply the same budget without a Gemini client.
        if budget is None and getattr(understander, 'budget', None) is not None:
            budget = understander.budget.snapshot()
        if budget is not None:
            used = bounded_count(result.state.llm_used)
            cap = bounded_count(session_cap)
            remaining = budget['remaining']
            status = 'exhausted' if remaining <= reserve else ('low' if remaining <= reserve+2 else 'ok')
    return {'trigger_reason': reason if isinstance(reason, str) and reason in TRIGGERS else None,
            'coverage': coverage, 'llm_calls': bounded_count(result.llm_calls, maximum=1),
            'llm_budget': {'session_used':used, 'session_cap':cap, 'daily_remaining_public':status}}


def guided_blocks(blocks):
    """Drop malformed additive clarify fields; preserve extension blocks and keys."""
    result = []
    for block in blocks:
        if isinstance(block, dict) and block.get('type') == 'clarify':
            block = dict(block)
            if 'slot' in block and block['slot'] is not None and not isinstance(block['slot'], str):
                block.pop('slot')
            if 'free_text' in block and type(block['free_text']) is not bool:
                block.pop('free_text')
        result.append(block)
    return result
