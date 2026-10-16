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
