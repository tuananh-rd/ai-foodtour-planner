# Online assistant implementation checkpoint — 2026-10-19

This is an implementation checkpoint, not final acceptance. Codex coordinates/reviews/integrates; the existing Antigravity agent implements bounded frontend and subsequent adapter tasks. No Claude invocation, model change, paid activation or remote publishing occurred.

## Current implementation and evidence

| Area | State | Evidence and limit |
|---|---|---|
| Conversation module | Implemented, reviewed | Antigravity8ff4d7c/6205f6e/0f5f638 integrated; Codex2389908 closes missing-state numeric/operating-claim bypasses.33 module/API tests passed before the additional history-projection test. Guards are finite; deterministic confirmation/allergy/planner validation remains authoritative |
| API/state integration | Implemented, targeted tests pass | Explicit read-only web_search flag cannot patch preferences or confirm a tour. Shared existing LLM budget; no second conversational call when understanding already consumed a call. Revision409 is checked before retrieval. Sensitive current turns and record-derived assistant history are not sent to the new conversation layer |
| Backend regression | PASS at be0db26 | `.venv/Scripts/python.exe -X utf8 scripts/run_unittests.py`:625 tests,1 optional private-CSV skip,157.403s, exit0. Earlier timing failures were diagnosed by full-suite profiling; repeated whole-clause predicates now run once per clause without relaxing safety or the test threshold |
| Later privacy projection | Targeted PASS | Seven API/decoration tests pass after omitting private record-derived assistant replies from model context. A final full suite on the final integrated commit is still required |
| Tavily quota/security base | Implemented, hermetic PASS | Durable atomic daily/monthly credits, fixed official endpoint, pinned global peer/TLS host, no redirects/proxies, bounded DNS/deadline/body. Tests use synthetic transports; no Tavily network calls |
| Tavily adapter | NOT IMPLEMENTED yet | Queued task task_7091438b0cd8; no concurrent worker. Exact interface frozen in ONLINE_ASSISTANT_CONTRACT.md |
| Live Tavily | BLOCKED | No local key configured. Future configuration belongs in ignored backend/.env; never send a key through chat. Enabled/free-only flags and absolute persistent ledger are required; the app cannot certify shared account allowance from local counters |
| Live Gemini | PARTIAL | Existing gemini-3.5-flash-lite configuration, at most2 generic public calls with persistent accounting: one accepted greeting, one rejected result. Rejection cause was not retained; do not assert an exact cause or full multi-turn quality PASS. No sensitive data, grounding or paid-service activation |
| Public local basemap | Extracted and measured |2,138,597bytes; Protomaps20261018, OSM freshness2026-10-18T04:00Z; source/license/hash in frontend/public/maps/README.md. Actual same-origin Range probe returned206 and bytes0-126/2138597 with127 bytes and ETag |
| Interactive map/citations UI | CANDIDATE REJECTED / UIR1 ACTIVE | d9c2971 integrated2602cd6 for review only. UIR1 task task_6735006d7387 / ctx_fc855380ac48 has current ownership ACK. Worker rendering, initial markers, retries, errors, privacy and report corrections remain review gates |
| Final browser/visual regression | CANDIDATE FAIL / FINAL PENDING | Actual synthetic API journey33/35 checks on candidate; both initial-marker checks failed. Visual/runtime inspection additionally found blank basemap/worker-load error. CODEX_REVIEW.md and codex-candidate/codex-map-diagnostic preserve evidence. Extended retry, keyboard, replace and offline probe is prepared; final integration must rerun it |

## Runtime and ownership

Run run_928fb169d5d9, runtime ff583610-c1ff-4566-ad85-2a1ca62d1e8b, Orca1.4.219. Codex terminal term_24c3a210-7070-4dd5-b703-f12f516a70b0 (rebound consumer generation2 after old terminal exited). Same Antigravity terminal term_37bc1a97-029f-4e92-8ca7-da75d3689675; no duplicate agent was created.

Managed UI attempts ctx_3e03c3d2ba85 and ctx_8ab3fec3a84e failed readiness before input despite an actual readiness-only READY reply. The version-matched low-level lane was used for the fresh UI Task/Dispatch. Orca therefore labels its process-resource lane unsupervised; Task authority, inbox, actual output and code are monitored. The prior settled managed resource ctx_dbcd66807adb is explicitly retained per the user's direction to preserve the existing agent. Do not release that terminal while the current task runs. Never replay old lifecycle messages.

Antigravity owns the exact frontend list in its dispatch, qa/online-assistant/, UI report/evidence, and next.config.mjs only for versioned-map cache headers. Codex owns backend/contracts/rules/board/security and tools/probe_online_ui.mjs; no simultaneous frontend edits.

## Development services, not final delivery

- http://127.0.0.1:3060 → API8060; synthetic data, LLM mock/rules, route estimates, web disabled, source2389908 at process startup.
- API terminal term_993488d0-5b49-40f7-ba8c-fb4a69a15608; web terminal term_83065e6b-0639-4f84-8483-5565ead4be4b. These were created by this task after free-port checks; user servers were not stopped.
- Final integration must restart only these task-owned processes as needed, verify the actual commit/health/build, run desktop/mobile journeys and failures, capture source comparison evidence, and report one final verified URL. Do not describe the development preview as the completed upgrade.

## Recovery continuation

Commit1f823c6 preserves and reviews the personal-data/key protection WIP rather than discarding it. Targeted assistant and9 API integration tests pass, OpenAPI drift check matches,18 mock-client contract checks pass. Fresh backend discovery at1f823c6 passed625 tests with1 optional private-data skip in202.849s, exit0; final post-adapter regression still required. UIR1 is the single active Antigravity task; OA3 remains undispatched. No new agent/model/service activation.


## Current continuation point (UIR3)

UIR1 aea866d and UIR2 52120c9 are reviewed/integrated at3d996da; arbitrary API-origin override removed. Same existing Antigravity is active on UIR3 task_0cd2013b89cc / ctx_204ca0c55369 with exact3file ACK. Real mobile bug OA-UI-009 hides web results by switching to itinerary whenever an unchanged tour is returned; UIR3 must switch only for an actual tour_ready event. OA-UI-007 disabled/quota wording also remains. Wait for actual scoped commit and independently rerun corrected extended browser probe, then dispatch OA3; do not confuse worker_done with UI acceptance.

Corrected browser driver has UTF8-safe Vietnamese and proper Enter char; initial false allergy/retry/popup failures were harness errors. R2 actual checks pass these plus initial markers, real tiles, replacement synchronization and desktop retry; only mobile-hidden-result timeout blocks the journey. Session/fault suite19/19 passes with actual UI/real synthetic API and failure-only injection. Root task-owned API8060 was restarted to3d996da, rules/synthetic/search-disabled; UI3060 is development mode, not final delivery. Production build validation is running independently; it does not replace final UI3/OA3 acceptance.

OA3 frozen contract now includes read-only /usage free-plan/no-PAYGO/headroom gate in addition to local durable credits. Live Tavily remains blocked by absent key. Explicit self-location privacy hardening and UTF8 driver corrections are Codex-owned; preserve them. No new agent, model change, paid activation, push/deploy or user-server shutdown.
