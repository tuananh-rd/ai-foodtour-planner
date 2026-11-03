import assert from 'node:assert/strict';
import {discoveryChatTimeout} from '../../frontend/lib/discoveryApi.js';
assert.equal(discoveryChatTimeout('apithat:gpt-6-luna','responses'),75000);
assert.equal(discoveryChatTimeout('apithat:gpt-6-luna'),75000);
assert.equal(discoveryChatTimeout('apithat:gpt-6-luna','chat_completions'),25000);
assert.equal(discoveryChatTimeout('gemini-3.5-flash-lite'),25000);
assert.equal(discoveryChatTimeout(null),25000);
console.log('PASS: Responses75s client exceeds60s backend; Gemini/legacy unchanged.');
