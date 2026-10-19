"""Explicit, at-most-two-call live probe using existing local Gemini configuration."""
import argparse
import json
import os
from pathlib import Path
import sys

from run_online_assistant import ROOT, local_configuration


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-live', action='store_true')
    args = parser.parse_args()
    if not args.allow_live:
        raise SystemExit('No calls made: explicit --allow-live required.')
    local_configuration()
    if os.environ.get('FOODTOUR_LLM', 'mock').strip().lower() != 'gemini':
        print(json.dumps({'status': 'blocked', 'reason': 'existing Gemini mode not configured'}))
        return 2
    sys.path.insert(0, str(ROOT / 'backend'))
    from app.providers.gemini import GeminiClient
    from app.assistant.conversation import ConversationalAssistant
    ledger = os.environ.get('FOODTOUR_BUDGET_DB') or str(ROOT / '.venv/online-gemini-budget.sqlite')
    try:
        existing_limit = int(os.environ.get('FOODTOUR_LLM_DAILY_BUDGET', '18'))
    except ValueError:
        existing_limit = 0
    client = GeminiClient(daily_budget=max(0, min(2, existing_limit)), budget_db=ledger)
    if not client.configured:
        print(json.dumps({'status': 'blocked', 'reason': 'missing existing local key'}))
        return 2
    assistant = ConversationalAssistant(client)
    history = []
    rows = []
    for text, state in (
        ('Xin chào, mình muốn khám phá món ăn Hà Nội.', {'phase': 'discover'}),
        ('Mình đi hai người và muốn ăn phở; bạn gợi ý cách bắt đầu nhé.',
         {'phase': 'discover', 'profile': {'party_size': 2}, 'pending': {'kind': 'clarify_slot', 'slot': 'area'}})):
        reply = assistant.respond(text, history, state, [], deadline_s=8)
        rows.append({'status': reply.status, 'provider': reply.provider, 'llm_calls': reply.llm_calls,
                     'accepted_public_reply': reply.text if reply.status == 'ok' else None})
        history.append({'role': 'user', 'text': text})
        if reply.status == 'ok':
            history.append({'role': 'assistant', 'text': reply.text})
        if reply.status in ('quota', 'unavailable', 'disabled'):
            break
    print(json.dumps({'scope': 'generic public prompts only; no private dataset/GPS/allergies/history',
                      'model': client.model, 'calls': rows, 'budget': client.budget.snapshot()}, ensure_ascii=False))
    return 0 if len(rows) == 2 and all(row['status'] == 'ok' for row in rows) else 1


if __name__ == '__main__':
    raise SystemExit(main())
