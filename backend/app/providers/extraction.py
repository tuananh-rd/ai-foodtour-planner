"""JSON slot extraction over a configured loopback HTTP endpoint."""
import json
import os

from app.llm.provider import ProviderError
from .http_transport import provider_endpoint, request_bytes


class HttpExtractionProvider:
    def __init__(self, endpoint=None, api_key_env='FOODTOUR_LLM_API_KEY', max_bytes=8192):
        self.endpoint = provider_endpoint(endpoint)
        self.configured = self.endpoint is not None
        self.api_key_env, self.max_bytes = api_key_env, max_bytes

    def complete(self, text, prior, *, deadline_s):
        if not self.configured:
            raise ProviderError('unavailable')
        headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
        key = os.getenv(self.api_key_env)
        if key:
            headers['Authorization'] = 'Bearer ' + key
        try:
            body = json.dumps({'text': text, 'prior': prior}, ensure_ascii=False, allow_nan=False).encode('utf-8')
            raw = request_bytes(self.endpoint, body=body, headers=headers,
                                deadline_s=deadline_s, max_bytes=self.max_bytes).decode('utf-8')
            # Content is still untrusted: the LLMExtractor applies the authoritative slot schema.
            decoded = json.loads(raw)
            if not isinstance(decoded, dict):
                raise ValueError
            return raw
        except (ValueError, TypeError, UnicodeError, RecursionError):
            raise ProviderError('bad_response') from None
