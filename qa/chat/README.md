# Conversation scenarios (C0-2)

Acceptance corpus for the chat upgrade (`docs/CHATBOT_UPGRADE_PLAN.vi.md` §5, contract v1.8). Synthetic data only
(`contracts/fixtures/venues.chat.synthetic.json`, regenerate with `python tools/gen_chat_fixture.py`).

* `utterances.jsonl` — 165 labelled Vietnamese utterances (with/without diacritics): `text`, `intent`, optional `patch`
  (expected understanding patch), `refs` (user references: "A", "1", "last"), `pending` (kind of the open pending question
  the utterance is answered against). Intent set: GREET_OR_SMALLTALK, DISCOVER_DISH, SEARCH_VENUES, COMPARE, ADD, REMOVE,
  KEEP, UPDATE_PROFILE, SET_ALLERGY, SET_AVOID, ANSWER_PENDING, CONFIRM_YES, CONFIRM_NO, AMBIGUOUS_ACK, REQUEST_PLAN,
  MODIFY_PLAN, ASK_DETAIL, OUT_OF_SCOPE, UNSAFE.
* `scenarios/scenarios.json` — CH-01…CH-12 multi-turn scenarios.

## Scenario DSL
`setup`: `{"fixture":"chat","llm":"off"|"stub","llm_stub":{"<exact user text>":{"intent":…,"patch":{…}}},"budget":<int|null>,"start":{"area":{"district"|"label"|"lat","lon"}|null,"preferences":{…}}}`.
Each turn is `{"say": "<text>"}` or `{"action": {…contract v1.8 Action…}}` plus `expect`:
`intent`, `understanding` (rules|llm|cache|action), `llm_calls_max`, `tour` (`none`|`present`), `phase`, `pending_kind` (null|…),
`blocks_include`/`blocks_exclude` (block types), `text_contains`/`text_not_contains` (all block texts, accent-insensitive),
`state` (dotted paths into `chat`, e.g. `profile.party_size.value`), `state_absent`, `cards` `{min,max}`, `card_flags_all`
(each card must carry flag), `no_card_name_contains`, `compare` `{criteria:[ids], unsupported:[ids], status:{criterion:status}}`,
`no_repeat_of_previous_question` (bool: the `clarify`/question text must differ from every earlier turn while the slot is unchanged),
`label_refs` (labels A/B/C present in `chat.last_results`).
Global invariants checked on EVERY turn by the runner: no tour without a confirmed `confirm_plan`; no card/venue carries
a "safe/an toàn" claim about allergy; unknown fields are `Chưa rõ`/null, never invented; `llm_calls` ≤ 1.

## Running locally

From the repository root (activate the project virtualenv first):

```sh
python qa/chat/run_scenarios.py --report /tmp/chat-report.json
python -m unittest discover -s backend/tests/chat -v
python qa/chat/eval_utterances.py --report /tmp/intent-report.json
```

On Windows choose a writable report path instead of `/tmp`. The runner defaults to both
`scenarios.json` and additive `adversarial.json`; explicit positional JSON paths override them.
Every scenario has a fresh TestClient, temporary SQLite session/budget databases, synthetic fixture,
estimated routing and disabled geocoding/explanation providers. Missing chat support is reported
as unavailable with exit 1 by the CLI; only the unittest integration wrapper skips while the feature
or route is absent. Unexpected server/setup errors fail rather than skip. The corpus evaluator exits
0 with `understand not available` until `app.chat.understand.understand(text, state)` is callable;
it then prints accuracy, per-intent confusion and case results. Accuracy is informational (no hidden
threshold). Pending corpus entries supply a kind only, so context-dependent cases need fuller fixtures.

### C5 provider injection seam

For `FOODTOUR_LLM=stub`, call `app.state.chat_understanding_provider.understand(text, state)`
after deterministic understanding declines and session/daily admission allows a call. It returns a
detached dictionary from the scenario's exact-text `llm_stub`; an unmapped request raises, and every
invocation increments `.calls`. For `off` the state provider is `None`. This is a test seam; the runner
does not implement or monkeypatch `/chat` or the understanding engine. Claude must wire that call
site in C5. The runner cross-checks actual stub invocations against each turn's `llm_calls` and uses
the production `app.state.llm_budget` (`DailyLLMBudget`) with `setup.budget` as its limit; null uses 18.
Session cap 6 and reserve 3 remain active. Public setup actions count as turns too and are checked
for invariants before the scripted turns; they do not establish plan confirmation.

Adversarial-only DSL extension: `{"repeat_request":1,"expect":{"status":409,"error_code":"revision_conflict"}}`
replays the first scripted turn's exact JSON payload including its original revision. The index is
one-based within the scenario. `status` defaults to 200; `error_code` checks the standard error frame.
Failed requests must leave GET session state unchanged. Successful turns must persist chat, tour,
preferences and revision exactly. Reports contain scenario IDs and diagnostics, not session tokens.

`python qa/chat/build_adversarial.py` regenerates the additive corpus; it never rewrites the original
scenarios. The runner also validates dataset IDs, factual card fields, unknown compare cells, distance
labels and allergy warning flags. Free prose is checked by scenario text assertions; this is not a
general semantic proof that arbitrary text contains no invented fact.

## Second blind held-out evaluation

`heldout2.jsonl` contains 100 independently labelled synthetic utterances, frozen in commit
`7729a35` before the first target evaluation. Labels describe the primary requested operation
using the ontology above. Every row includes `setup_actions` and a frozen `context` with
`pending` (kind, offered options, explicit nullable slot) and `last_results`. Setup actions
use the public API; no session state or pending is injected. Regional wording, typos,
accentless text, emoji, mixed intentions, negation, amounts and clock times are included.

Run `python qa/chat/eval_heldout.py --report docs/reports/C1_HELDOUT2_API.json` to print
API accuracy and confusion. Each row runs through `run_scenario` with a fresh synthetic
session and disabled external providers; setup and target turns receive the runner's
grounding, persistence, revision, confirmation and call-count checks. A mismatch with the
frozen setup context is an evaluation failure. Exit 0 requires at least 80 rows, at least
85% accuracy and zero setup/invariant failures; rules-only results do not measure live LLM
quality. `build_heldout2.py` records authoring and bootstraps contexts without evaluating
target utterances. Do not regenerate or relabel the set to improve a measured score.
