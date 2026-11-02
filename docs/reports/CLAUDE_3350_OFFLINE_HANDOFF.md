# Lane 3350 Offline Outage UX — Frontend/QA Takeover Handoff

Owner: Claude (frontend/QA coding owner, claude-opus-4-8). Backend/AI/runtime: Sol.
Date: 2026-11-02. Scope: `frontend/lib/discoveryApi.js`,
`frontend/app/components/v2/guided/DiscoveryLayout.jsx` (+ scoped CSS),
`qa/discovery-assistant/test_service_interruption.mjs`. No backend edits (concurrent with Sol).

This handoff records an independent audit of the already-integrated offline outage UX, the
regression coverage added during the takeover, and a precise backend timeout-contract finding
relayed to Sol. The live conversational service remains blocked by an unverified timeout cause;
nothing here establishes restored Gemini quality and no generation was performed.

## 1. Independent audit — outage UX state, session isolation, recovery

I re-reviewed the state machine against the frozen requirements (single truthful status, raw
reason in diagnostics only, no compound "timeout OR quota" guess, persistence across local
actions, clear only on genuine recovery). Findings:

- **Session isolation — correct.** `activeInterruption` resets on `sessionId` change
  (`DiscoveryLayout.jsx` ~L240) and the session-change effect (~L411) fully resets `view` to
  `DEFAULT_ASSISTANT_VIEW`, invalidates pending request tokens, aborts in-flight fetches, and
  clears drafts/modals. A banner from one session cannot leak into another.
- **Persistence across local actions — correct and deliberate.** A local tool/location/selection
  action returns a view whose `provider` is null or unchanged, so `classifyServiceInterruption`
  returns null and the clear-branch guard (`provider.mode === 'gemini' && provider.calls > 0 &&
  !provider.failure`) is not satisfied. The banner is therefore preserved, matching the
  "survives local actions / reload" requirement.
- **Recovery — correct.** The banner clears only on a genuine model turn (gemini mode, calls > 0,
  no failure), which distinguishes a real reply (including a truthful `reply_source: 'tools'`
  native answer) from a local-action view. The `legacy_local` updater (~L235) refuses to
  downgrade a specific classification (e.g. timeout) to a neutral legacy status on reload.

**No reproducible frontend defect was found.** The `mode === 'gemini'` condition in the
clear-branch is a deliberate guard, not a bug: loosening it to "any null classification clears"
would clear the banner on the next local action and break the persistence requirement. Because
Gemini is the only configured provider, the guard is correct as written. If additional providers
are ever configured, the clear-branch would need a provider-agnostic "successful model turn"
signal — noted as a latent robustness item, not a current defect, and intentionally left
unchanged to avoid fabricating a fix.

## 2. Regression coverage added (QA only, no production change)

`qa/discovery-assistant/test_service_interruption.mjs` gained a new section `[9]` with 10
incident-anchored assertions guarding real, previously-untested branches:

- **9a** Structured fixture `{kind:'timeout', source:'transport', http_status:null}` with
  `reason:'timeout_rules_fallback'` → category `timeout`, `httpStatus === null`, raw reason
  preserved verbatim, human copy never claims a quota/429 root cause. Historical3350 retained
  only a legacy reason; this structured source is a regression fixture, not reconstructed evidence.
- **9b** `daily_reserve` pause with remaining allowance → stays `daily_reserve`, never
  `provider_429`, no HTTP status (encodes the "reserve 3 remaining, NOT proven 429" truth).
- **9c** `local_admission` source → distinct local state, no HTTP status.
- **9d** Remaining benign reasons `clarification` and `greeting` → not outages.

Result: `node qa/discovery-assistant/test_service_interruption.mjs` → **54 passed, 0 failed**
(was 44/44; +10). Tests use the pure helper only; no live Gemini, no network, no generation.

## 3. Backend timeout-contract finding for Sol (advisory, no backend edit)

Relayed via Orca; recorded here for durability. Deadline/model/caps were NOT changed.

- Client transport allows up to 25s for a POST turn (`sendDiscoveryMessage`/`sendDiscoveryAction`
  `options.timeoutMs || 25000`); the native server-side turn deadline is 12s. The server deadline
  bounds the observed server processing. For the two recorded requests, the app returned near13s,
  before the configured25s client limit; this does not prove the client can never pre-empt a server.
- Observed latencies 12992ms and 13164ms both exceed the 12s deadline with a single model attempt
  each → the failure is **expiration while awaiting the provider transport response**
  under the12s transport/turn budget, consistent with `reason: timeout_rules_fallback`.
  Elapsed time alone cannot distinguish transport/socket timeout from an outer turn-deadline;
  the newly structured source metadata is needed for that distinction.
- Admission state at the time: session 2 of 6, daily 12 of 18 with reserve 3 (remaining 6 > reserve
  3), exhausted = false. These do **not** indicate session-cap, daily-reserve, or local-admission
  refusal.
- There is **no retained provider HTTP status/body** for these timeouts. 429, invalid model/key,
  and remote quota exhaustion are **unproven**; "configured/available" is not a successful chat
  response. Root cause between remote provider latency vs. network path remains unresolved and
  requires a later explicitly bounded allowance to re-test with the new sanitized status/source
  telemetry. No such call was made under the exhausted previous allowance.

## 4. Verification and limitations

- Helper suite: 54/54 PASS (above). Pre-existing build PASS, 44→54 helper PASS, and the prior
  3350 CDP fixture 16/16 (all POSTs intercepted, ledger 12→12) are unchanged by this takeover; I
  did not re-run the full rendered/build suites because no production source changed (QA-only edit).
- The React effect that drives banner persistence/recovery is validated by reading/reasoning, not
  by a component-level test harness (out of scope for mock-helper tests); its underlying helper
  decisions are covered.
- Live conversational quality remains BLOCKED pending a bounded generation allowance. No app chat
  (8250), remote Gemini, Tavily, model-metadata probe, ledger/caps/billing change, push, deploy,
  or private export was performed.

## 5. Files touched

- `qa/discovery-assistant/test_service_interruption.mjs` — +10 incident-anchored regression
  assertions (section 9). No production source (`discoveryApi.js`, `DiscoveryLayout.jsx`, scoped
  CSS) required changes; audit found them truthful and correct.

Coordinator review corrected the structured fixture to a valid backend enum (`quota` for local
admission) and narrowed the timeout attribution above. The same54 assertions pass after those
corrections; no production change, generation or broad build/rendered rerun was needed.
