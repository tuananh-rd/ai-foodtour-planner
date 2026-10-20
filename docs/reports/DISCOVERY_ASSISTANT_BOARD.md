# Discovery-first assistant task board

## Active upgrade - 2026-10-20: location, verified chat models and optional web

Baseline200405a/frontend4fdfe92. Direct user authority supersedes Tavily retirement: web is optional/default off, separate from verified Gemini chat models; existing free-only/null-limit guard and Tavily ledger remain. No paid activation, default model/cap increase, provider switch, user-server shutdown or private records/keys in evidence. New Gemini allowance: at most3 user turns/6 model requests including loop, no auto retry; prior smoke is not replayed.

Contract: `docs/DISCOVERY_LOCATION_MODEL_WEB_CONTRACT.md`. Codex owns contracts/backend/AI/runtime/integration and screenshot authorization/root-cause tests. Antigravity owns explicitly dispatched frontend/QA and affected review; Claude inactive. Current Run remains`run_a4b75f502189` after runtime/terminal verification, without a duplicate coordinator/agent.

| Work | Owner | State |
|---|---|---|
| Exact screenshot transcript/authorization and stale preferences | Codex | RED reproduced; GREEN native/mock/local tests. Read-only search separated from selection mutation; area/compound foods replace stale filters, old cards cleared, turn-start A/B binding retained |
| Selected origin, local manual resolution and backend distances | Codex | Implemented: explicit local candidates/coordinates, origin-required search, Haversine/unknown distances and invalidation; no arbitrary-address geocoder |
| Verified model catalog/session settings and optional Tavily guards | Codex | Implemented; only previously full-loop-verified3.5 listed, current quota unavailable. Default-off Tavily restored with original null-limit/free-only guard and separate ledger; no Tavily live calls |
| Location/model/web UI, distance cards, Maps CTA and independent QA | Antigravity | Follow-up `task_cdf843155428` / `ctx_0a01e12b4bfe` remains the sole active UI dispatch after user resumed the same terminal; Maps wiring, delayed-GPS guard, build and actual browser QA are pending checkpoint |
| Mock/application E2E, source review and new bounded native smoke | Codex + affected review |138 targeted backend checks PASS at `f98f099`;73 actual API checks recorded at `e01590f` PASS. UI/browser integration pending. NEW live smoke BLOCKED, one user turn/two requests, no retry |

New live evidence: `discovery-upgrade-model-metadata.json` is one key-scoped metadata GET, no generate/debit. `discovery-upgrade-live.json` records candidate3.1 native HTTP200 with two validated local searches, followed by tool-result continuation timeout; natural chat quality NOT PASSED. Private records remain local. Ledger13→15/18, remaining3 equals reserve3, reset2026-10-20T07:00:00Z. No further provider calls, caps/billing unchanged. Candidate3.1 is not in the production registry because full continuation compatibility did not complete. The requested multiple available live model choices remain blocked; no fabricated second option.

### Antigravity permission and resume checkpoint

Runtime-restart checkpoint: runtime `3622cd09-3b4a-43e6-b02f-08b11579785f`; Run successfully rebound to current lead `term_89a48ee1-88be-4a9a-9384-bb9da78dcca2`. Same-conversation Antigravity is now `term_6273620a-3a19-4b17-b8ef-2d062cd84af2`; the existing dispatch still names the missing old terminal, so its settlement authority has not been transferred or fabricated. No duplicate Task, Dispatch or worker was created. Seven staged frontend/QA files remain at sibling HEAD `db0c705`. Existing unit output is 93 PASS / 0 FAIL and was not rerun. Build task-6581 has no retained exit; no active build Node process was found. A new build must be recorded with actual output/exit, without claiming the previous build passed.

Staged review blocks integration: `GuidedTimeline` retains old server Maps links across request/session/mode changes and empty/error replies; backend `partial`, skipped-stop reasons and notes are not rendered; server links lack the explicit chosen-origin gate and URL/2048 validation. Hooks occur after a conditional early return. Findings were sent to the same-conversation worker, requiring focused lifecycle coverage and correction before the final build/commit. A bounded 30-second wait produced no settlement; pending work is implementation/build evidence, not a live-provider retry. No frontend file was edited by Codex during worker ownership.

The user authorized automatic file edits within the existing frontend/QA task scope. The current worker screen explicitly confirms `Accept-edits mode: file edits auto-approved` and the `accept-edits` status; this is a session setting, not a global permission change. Existing task `task_cdf843155428`, dispatch `ctx_0a01e12b4bfe`, Run `run_a4b75f502189` and conversation `0d2a85b1-d51a-4f2a-beb0-c0476ffcf828` remain unchanged.

If the existing worker must be resumed after a verified stop, use its existing worktree `foodtour-antigravity-web` and the same conversation with `agy --conversation 0d2a85b1-d51a-4f2a-beb0-c0476ffcf828 --mode accept-edits`. Verify current Orca task/terminal authority before resuming; do not launch a duplicate worker or change its model. Do not use `--dangerously-skip-permissions`. Billing, account, deletion, private-data and security boundaries remain unchanged. Current mode confirmation is not evidence of a completed implementation, build or test.

Previous completed continuation and its live limit/evidence follow below.

## Current continuation — 2026-10-20

Direct user authority: fluid Warm editorial at 1280/1440/1920/2560 desktop and 390 mobile; no Unicode emoji anywhere in the product UI; actual configured Gemini and local dataset. This explicit request authorizes at most three smoke chat turns and six total model requests including tool continuations, without automatic retries, model/cap increases, Tavily or paid Maps. Historical no-live-probe statements below describe the prior delivery only.

Baseline `4b57fe6`, UI `41b1d33`. New runtime `a71c4070-c37a-46f3-a54c-103d39af39e7`, current coordinator terminal `term_f4235d70-7974-4a00-b0e5-9a9fa3a4141b`, Run `run_a4b75f502189`. Old handles are not authority. Existing Antigravity terminal was rediscovered, positively acknowledged readiness, and shows Gemini 3.8 Flash/high; no model override or duplicate agent. Two readiness detector timeouts produced failed attempts without task delivery; documented low-level dispatch `task_90f732d804e0` / `ctx_110dc582c012` was injected and acknowledged. This is an unsupervised terminal lifecycle lane, not proof that Orca owns its process.

| Work | Owner | Current evidence |
|---|---|---|
| Fluid layout, frontend emoji removal, resize/QA/build | Antigravity, Codex review/integration | COMPLETE: author`a2958a1`, integrated frontend`4fdfe92`; Codex review complete, two production builds PASS,88 sanitizer/45 mock-browser/18 contract/51 client checks PASS |
| Generated text emoji policy | Codex, Antigravity APPROVE | Shared plain-text presentation policy, discovery and legacy conversation/explanation guards; 78 targeted backend tests PASS |
| Native tool-schema correction | Codex, Antigravity APPROVE | Nested Profile `$defs` moved to parameter-document root so `#/$defs/Origin` resolves; offline reference-resolution regression PASS |
| Actual Gemini smoke | Codex | COMPLETE: three total chat turns / five model transports, zero automatic retries. Initial HTTP400 retained; after schema fix four HTTP200 responses name configured `gemini-3.5-flash-lite`, native search/compare + result continuation. Local private dataset, no exported records. Comparison honestly reports unknown fields. No further smoke model traffic authorized under this run's three-turn limit |
| Current runtime | Codex | New task-owned API8300, private data + existing Gemini configuration, persistent budget ledger; final production URL3300/source4fdfe92; actual private bootstrap/resize28/28 PASS, budget unchanged5; synthetic actual-backend journey63/63 PASS |

Sanitized provider evidence: `discovery-live-20261020.json` (initial failure) and `discovery-live-20261020-schema-fixed.json` (two remaining turns). Combined ledger used0→5 with configured daily20/session6/reserve3 during smoke. Existing local launcher further restricts daily allowance to18 without resetting used calls or changing `.env`. No user process stopped; Claude remains inactive.

Current acceptance: [DISCOVERY_VIEWPORT_EMOJI_LIVE.md](DISCOVERY_VIEWPORT_EMOJI_LIVE.md). Antigravity sequential follow-up tasks`task_6bad7be2b243`/`ctx_1570c0e39d91` and final three-string correction`task_b2956348110d`/`ctx_e1450ef0e100` completed and were independently reviewed. No duplicate active worker. Current real URL3300/API8300 is private/Gemini; regression3310/API8210 is synthetic/rules. Historical no-live/3200 statements below remain historical only.

## Previous completed delivery

Direct user request2026-10-19. Baselinebe2bb8f; rules and requirements supersede historical Tavily/checklist behavior. Codex coordinator/backend/contracts/review, Antigravity bounded frontend/QA, Claude inactive. No Tavily calls or new live probes/cap increases. Preserve private inputs/ledgers/WIP/servers.

| Phase | Owner | State | Gate |
|---|---|---|---|
| D0 requirements/contracts | Codex | DONE | Full attachment read/archived; direct instructions distinguished; discovery-v1 frozen |
| D1 state/tools/selection | Codex | DONE | Validated tools, versioned state, actual local dataset smoke and integrated HTTP/SQLite/CAS regression; legacy safety obligations preserved |
| D2 natural UI / remove web | Antigravity, Codex integration | DONE LOCAL | cdd4c46 integratedc7091c5, Codex map/input fixes2d54e49/df4b5df/41b1d33 reviewed by affected implementer; production browser63/63 desktop/mobile |
| D3 Gemini + confirmation/planner | Codex | IMPLEMENTED, LIVE NOT TESTED | Single native function-calling loop with existing budgets, strict user confirmation/allergy gates; protocol/privacy/race tests mock only |
| D4 runtime retirement/integration | Codex + affected implementer | DONE | Tavily runtime/UI/probes removed, venue provenance and private keys/ledgers preserved; source reviews APPROVE |
| D5 acceptance | Antigravity QA, Codex independent review | PASS LOCAL, LIVE NOT TESTED | Production41b1d33, actual synthetic/rules API99d64ce,63/63 browser,0 JS exceptions, PMTiles206 + geographic screenshots,41 module/51 client checks; live Gemini quality unverified |

Reference architecture mentions PostGIS/weather, but neither is a required dependency or authorized migration/service. No weather data is reported honestly without blocking chat. Gemini live currently unverified for the new loop; synthetic/mock tests never establish live natural quality. Report blocker if configured model/quota/cap cannot support the bounded loop; do not increase budget or use credits.

FINAL LOCAL DELIVERY: **http://127.0.0.1:3200**, production, explicitly synthetic/rules. Read DISCOVERY_ASSISTANT_ACCEPTANCE.md for exact commit/evidence matrix, retained failures and remaining visual/live limitations; DISCOVERY_ASSISTANT_LOCAL_USE.md for the user flow. Final affected reviewf13b0bc integratedc10ff0c, all current dispatches settled/terminal retained,0 reclaimable resources. Old checkpoints below are historical; do not reuse their pending states or old URLs.

Backend checkpoint:16 initial discovery tests passed;8 additional native-protocol/privacy/SQLite/concurrency tests passed; area-only follow-up targeted test passed. These are hermetic tests, not live Gemini proof. Codex owns only backend/contracts/docs; Antigravity owns its dispatched frontend/QA files. Previous dispatch ctx_8c53644bd48e settled with corrected task ID after one rejected mismatched completion; terminal retained and reused. No Tavily calls have been made for this implementation.

21:02 recovery: verified QA node25540/parent27792 had finished writing26 assertions at20:29:49 but stayed alive due success-path open server/WebSocket/children and exit-only cleanup. Codex stopped ONLY positively identified QA node; worker resumed and settled correct task_6d373f53c224/ctx_fd0058920726 with9deb5ee. No user/worker process was killed. Original forced exit is a harness defect, not product PASS; bounded normal-exit evidence requested. Independent actual UI3200/API8200 then found real confirmation HTTP500 after selection + taste change; Codex reproduced and fixed439980f (planner validation context),3 targeted tests PASS. Final production build/E2E remains pending current frontend fixes. Existing3200 is integration DEV, synthetic/rules; no live Gemini/Tavily calls.
