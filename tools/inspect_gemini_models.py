"""One explicitly authorized metadata GET; no generateContent or key/response body logging."""
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT/'backend'))


def main():
    output = ROOT/'docs/reports/discovery-upgrade-model-metadata.json'
    if output.exists():
        raise SystemExit('Metadata evidence already exists; no repeat request')
    from tools.run_online_assistant import local_configuration
    local_configuration()
    from app.providers.gemini import GeminiClient
    from app.providers.http_transport import request_bytes
    from app.llm.provider import ProviderError
    cap = min(18, int(os.getenv('FOODTOUR_LLM_DAILY_BUDGET', '18')))
    client = GeminiClient(daily_budget=cap, budget_db=ROOT/'.venv/online-gemini-budget.sqlite')
    evidence = {'metadata_gets': 0, 'model_requests': 0, 'configured_model': client.model,
                'documentation': ['https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite',
                                  'https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite'],
                'models': [], 'budget_before': client.budget.snapshot()}
    try:
        if not client.configured:
            raise ProviderError('unavailable')
        evidence['metadata_gets'] = 1
        data = json.loads(request_bytes(client.base_url+'/v1beta/models?pageSize=1000',
            headers={'Accept': 'application/json', 'x-goog-api-key': os.getenv(client.api_key_env, '').strip()},
            deadline_s=8.0, max_bytes=512*1024))
        for row in data.get('models', []):
            identity = row.get('name', '').removeprefix('models/')
            if identity in ('gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'):
                evidence['models'].append({'id': identity,
                    'generate_content': 'generateContent' in row.get('supportedGenerationMethods', [])})
        evidence['outcome'] = 'metadata_success'
    except (ProviderError, ValueError, TypeError, AttributeError) as error:
        evidence['outcome'] = 'blocked'
        evidence['reason'] = getattr(error, 'kind', 'bad_response')
    evidence['budget_after'] = client.budget.snapshot()
    output.write_text(json.dumps(evidence, indent=2)+'\n', encoding='utf8')
    print(json.dumps({'outcome': evidence['outcome'], 'models': evidence['models'], 'model_requests': 0}))
    return 0 if evidence['outcome'] == 'metadata_success' else 1


if __name__ == '__main__':
    raise SystemExit(main())
