# C0-2 delivery — synthetic chat acceptance runner

Implemented under the dispatched backend/tests/chat, qa/chat and docs/reports scope.
Reviewer: Claude coordinator. No `/chat` implementation or understanding engine was added.

`qa/chat/run_scenarios.py` runs the original 12 scenarios and 14 additive adversarial
scenarios in isolated FastAPI TestClients. It applies initial area/preferences through
public actions, injects a deterministic exact-text understanding object, maps scenario
budget to the production DailyLLMBudget, counts provider invocations, evaluates every
README expectation and rejects unsupported expectation keys. It checks global
confirmation, allergy claim, unknown-field and call-count invariants on each successful
turn; failed requests must not mutate stored state and still obey provider-call limits.
Successful turns must match persisted chat/revision/tour/preferences. Reports give
scenario and turn status, HTTP status, intent, observed calls and failures without tokens.

The adversarial corpus covers repeated questions, all four pending kinds followed by
`ok`, stale labels across changed/new search contexts, allergy→seafood search, budget
scope flips, vehicle changes after confirmation, outside-Hanoi location, 1000 chars,
NFD input and replay of an identical action/revision (expected 409). Existing scenarios
were not changed. The added repeat_request/status/error_code extension is documented.

C5 integration seam: with `FOODTOUR_LLM=stub`, invoke
`app.state.chat_understanding_provider.understand(text, state)` after deterministic
rules decline and normal budget admission. The result is a detached scenario dictionary;
unmapped calls raise and all invocations increment `.calls`. With off it is None.
`app.state.llm_budget` is the production budget instance; scenario budget is its limit.
Claude owns wiring the actual engine call site in C5; that is deliberately outstanding.

`qa/chat/eval_utterances.py` loads the future callable
`app.chat.understand.understand(text, state)`, builds a fresh ChatState for each corpus
entry (including supplied pending kind), reports accuracy and expected→actual confusion
over 165 labels, and optionally writes JSON. It does not silently hide import failures
inside an existing understanding module. Pending kind alone lacks options/slot/results
context, so contextual accuracy needs richer corpus state in a later task.

Verification on merged production commit `94a2fc2`:

```text
Full backend suite: Ran 333 tests in 21.262s; OK (skipped=1)
Final focused chat suite after replay fix: Ran 10 tests in 0.579s; OK (skipped=1)
OpenAPI matches server schema (exit 0)
eval_utterances.py: understand not available (exit 0)
run_scenarios.py: 26 scenarios / 90 scripted turns unavailable (exit 1)
```

`C0_2_SCENARIOS.json` records the unavailable result per turn, because
`features.chat_v2` is absent on this tree. The unittest wrapper skips only when the
feature is absent/disabled or the route returns 404; other failures fail the suite.
Nine harness tests run now: all expectation types, negative assertions, unknown
grounding, provider counts, repeat questions, confusion denominators, detached stub
answers and exact revision replay using a fake client. A replay regression test verifies
response-only reply/turn fields do not falsely count as persisted mutations.

Limitations: no end-to-end chat scenario can execute until C5 exposes `/chat` and wires
the provider seam; no real LLM, DB server or routing service was validated. SQLite and
existing allergy API persistence were exercised locally. Free prose truthfulness uses
the corpus text assertions and structured evidence checks, not semantic omniscience.
This work is ready for Claude review; it does not self-approve integration.
