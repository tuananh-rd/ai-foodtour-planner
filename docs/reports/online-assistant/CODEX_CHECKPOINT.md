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
| Interactive map/citations UI | IN PROGRESS | Antigravity task task_529bb1dff2e5 / ctx_262125b4904a, actual turn/output and exact ownership ACK observed. Codex review already flagged map error/lifecycle/accessibility and search-retry/read-only mock boundaries; fixes and browser acceptance pending |
| Final browser/visual regression | NOT TESTED | tools/probe_online_ui.mjs is prepared and syntax-checked. Existing regression counts and historical screenshots are not acceptance of this initiative |

## Runtime and ownership

Run run_928fb169d5d9, runtime ff583610-c1ff-4566-ad85-2a1ca62d1e8b, Orca1.4.219. Codex terminal term_ecb79c94-80cb-4298-9e27-6720faa54e6e. Same Antigravity terminal term_37bc1a97-029f-4e92-8ca7-da75d3689675; no duplicate agent was created.

Managed UI attempts ctx_3e03c3d2ba85 and ctx_8ab3fec3a84e failed readiness before input despite an actual readiness-only READY reply. The version-matched low-level lane was used for the fresh UI Task/Dispatch. Orca therefore labels its process-resource lane unsupervised; Task authority, inbox, actual output and code are monitored. The prior settled managed resource ctx_dbcd66807adb is explicitly retained per the user's direction to preserve the existing agent. Do not release that terminal while the current task runs. Never replay old lifecycle messages.

Antigravity owns the exact frontend list in its dispatch, qa/online-assistant/, UI report/evidence, and next.config.mjs only for versioned-map cache headers. Codex owns backend/contracts/rules/board/security and tools/probe_online_ui.mjs; no simultaneous frontend edits.

## Development services, not final delivery

- http://127.0.0.1:3060 → API8060; synthetic data, LLM mock/rules, route estimates, web disabled, source2389908 at process startup.
- API terminal term_993488d0-5b49-40f7-ba8c-fb4a69a15608; web terminal term_83065e6b-0639-4f84-8483-5565ead4be4b. These were created by this task after free-port checks; user servers were not stopped.
- Final integration must restart only these task-owned processes as needed, verify the actual commit/health/build, run desktop/mobile journeys and failures, capture source comparison evidence, and report one final verified URL. Do not describe the development preview as the completed upgrade.
