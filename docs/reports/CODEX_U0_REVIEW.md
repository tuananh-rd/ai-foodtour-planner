# Codex U0 independent contract review

Date: 2026-10-17. Author: Codex. Reviewed merged base `fd621ac`.
Verdict: **REQUEST-CHANGES**. Findings 1 and 2 block U3 implementation; this is the single requested review round, not a self-approved contract revision. Claude owns the corrections and independent review.

Read: AGENTS.md, PROJECT_RULES, AGENT_TASKS, reference/WORD_PLAN, the approved U-series plan, CONTRACT v1.9 and its inherited v1.8 rules, U0_S0_FAIL_BEFORE, test_u0_s0, and guided-flow-mockup. The direct dispatch's approval supersedes the plan document's stale proposed/awaiting-approval heading.

## Numbered findings

1. **BLOCKER — unresolved allergy must survive pending replacement and actions.** Rule 1 only says confirm_plan/tour are impossible "while it is open". It does not define an unresolved safety obligation that survives clearing/replacing the single pending. Existing `ChatEngine.handle` clears a stale clarify after profile edits; `_do_request_plan` replaces it with confirm_plan, and `_do_confirm_yes` checks only `_plan_missing` (area/time/vehicle). Thus adding the proposed allergy question alone leaves an action bypass. Freeze the stronger invariant: an allergy cue without a resolved substance remains unresolved across unrelated text, edits, searches, request_plan, confirm_no, stale options and reload; neither confirmation summary nor planner invocation is allowed until explicitly resolved. Define what resolves or explicitly retracts the cue, and recheck at request_plan AND confirm_yes, including old confirm_plan state. Likewise, unconfirmed AI allergies must remain a planning blocker independent of the currently displayed question. Do not rely on the client or pending.kind alone.

   Executed proof on the merged base using only `venues.chat.synthetic.json`: seed a ChatState with known synthetic area, duration 180, vehicle walk, one fixture venue in shortlist, and `Pending('allergy-test','clarify_slot',[],'allergy_term')`; call the reducer with the following actions, carrying each returned state/preferences forward:

   ```text
   edit_profile {party_size:2}: pending=None, plan_request=False, allergies=0
   request_plan: pending=(confirm_plan,None), plan_request=False, allergies=0
   confirm_yes: pending=None, plan_request=True, allergies=0
   ```

   This proves the engine-to-API planner authorization bypass with seeded proposed pending state, not an end-to-end claim that the current base already emits allergy_term for a raw cue. The API currently executes `result.plan_request` without another allergy gate (`api/routes.py`, chat handler). No real tour/provider call was made. Required acceptance: API action-sequence and persisted/reloaded-state tests exercise this path and stale confirm_plan, asserting no planner call and no new tour until resolution.

2. **BLOCKER — privacy and flag compatibility need one explicit scope.** The proposed metadata enums themselves contain no user text or secrets, and coverage's fixed kind/status vocabulary is suitable for allowlisting. However the inherited `/chat` response currently also returns top-level `llm_budget={limit,remaining,exhausted}` (`routes.py:525`, `schemas.py:170`); remaining is the exact daily count. "The exact daily counter is never exposed" conflicts with retaining that field byte-for-byte. Also "With the flag off" follows TWO flags; it does not say whether guided_ui gates only presentation or the new engine/API semantics. Freeze a matrix for chat_v2/guided_ui and specify whether the exact legacy budget remains only on the legacy path, and whether new fields are omitted rather than serialized null off-flag. Specify `/messages` behavior separately. The task requests unchanged legacy `/messages`, so do not remove its fields by inference. U3 cannot implement a golden byte comparison and a never-expose rule consistently without this decision.

3. **Non-blocking — budget scope rule is directionally clear but needs transport/gating details.** For an amount plus N>=2 and no explicit scope, leave scope null and ask before confirmation; never guess group or per_person. `Field_.to_json` currently omits scope when null, whereas the text says "stays null"; choose absent-or-null or an explicit null wire requirement on the enabled path. Define priority when allergy_term and budget_scope both need questions (recommend allergy first), and ensure the budget obligation also survives unrelated actions and later party-size changes. The existing S0 A6 test checks the in-memory null, not its serialized shape or action bypass.

4. **Non-blocking — day_part does not authorize a start time.** The prohibition is clear and testable. Complete the mapping for morning/noon/afternoon, specify priority versus an explicitly selected meal, and retain any existing explicit start_time unchanged. Evening->dinner and late->late are specified; meal must remain a ranking hint. Test both missing and existing start_time. Profile stops/day_part persistence should use the existing JSON column and default missing fields on old rows, without migration.

5. **Non-blocking — one clarify is testable; priority and chip shape need tightening.** At most one clarify block per reply is unambiguous. Inherited clarify.options allows <=4, but the eight-family allergy choices are described as options while new chips permits <=8. State explicitly whether eight choices live only in chips, how pick_option validates them against persisted pending.options, and whether stale pending IDs are checked (the action currently carries only option_id). Avoid publishing clickable choices that the reducer cannot accept. Decide how multiple missing/conflicting slots are queued behind the first safety question.

6. **Non-blocking — metadata sanitization and budget boundaries.** Use fixed allowlists for trigger_reason and coverage, bounded numeric counts, and never echo malformed engine strings in metadata. The dispatch defines low as remaining-reserve<=2 and exhausted as remaining<reserve, but legacy refusal uses remaining<=reserve (`routes.py:481`); explicitly distinguish status from eligibility at equality. Define session_used/session_cap when no provider exists and the precedence when multiple trigger reasons apply. Unknown block types/keys should pass through as requested; malformed new metadata must degrade safely without a 500 and without arbitrary user text passthrough in turn metadata. Persistence tests must ensure only public state is returned, not private pending context/history.

## Evidence and disposition

- Interpreter: root `.venv/Scripts/python.exe`; bare `python` resolves to the Windows Store alias and was unavailable. No dependency installation was needed.
- From backend: `../.venv/Scripts/python.exe -m unittest tests.chat.test_u0_s0 -v`: **15 tests, OK, expected failures=6**, reproducing the base report. The action-sequence reducer probe above also completed successfully and showed the bypass.
- No production code, contract, frontend, or chat-engine files changed. No .env, keys, private CSV, live Gemini, Maps API, dev server, push or deployment used.
- Per dispatch stop condition, **Part 2/U3 was not started**. Full backend/OpenAPI gates are not claimed for this review-only outcome. Required next step: Claude freezes corrected safety and flag/privacy semantics, then dispatches U3 against that contract with API fail-before evidence and full gates.
