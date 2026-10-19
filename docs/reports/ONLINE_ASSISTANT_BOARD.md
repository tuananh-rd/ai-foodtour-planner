# Approved online assistant implementation — 2026-10-19

Run `run_928fb169d5d9`; current Codex terminal `term_ecb79c94-80cb-4298-9e27-6720faa54e6e`. Runtime ff583610, Orca1.4.219. Existing Antigravity checkout retained; runtime inventory shows0 attached PTYs/agents there, so one replacement supervised worker is necessary, not a duplicate. Old QA task failed/exited; its counts are historical evidence only. Claude is not resumed.

| ID | Owner | State | Files / acceptance |
|---|---|---|---|
|OA0 |Codex |DONE | Preserve communication WIP and approved proposal; integrate latest Antigravity functional commits without reset/clean; latest authority documented |
|OA1 |Antigravity, Codex review |REVIEW FIXES | Initial task task_6470a24ebdd6 / ctx_c420f30a25d2 settled with8ff4d7c and21 stub tests; acceptance withheld for concrete privacy/claim bypasses. Same terminal reused for task_b538388a6a4a / ctx_dbcd66807adb, actual turn/output/ownership ACK observed. Only conversation.py, its test module and OA1 report |
|OA2 |Codex architecture + bounded Antigravity implementation |API IMPLEMENTED / UI WAIT |4411b8f: read-only conversation, explicit web_search contract, privacy gate, shared call caps and revision-safe lookup. Six new HTTP/decoration tests pass with stubs. UI scope: docs/design/ONLINE_ASSISTANT_UI_SCOPE.md |
|OA3 |Antigravity, Codex review |WAIT OA2 | Tavily adapter, durable credit guards, citations/UI failures; official docs verified before implementation |
|OA4 |Antigravity, Codex review |WAIT OA3 | Interactive local PMTiles/OSM map, attribution/Range/markers/error; actual licensed asset provenance and bytes |
|OA5 |Antigravity + Codex |WAIT | Fresh desktop/mobile real-browser journey and failure/privacy/quota/Range checks; regression/build/drift; one final verified URL/commit |

Codex owns rules/board/contracts/integration and does not concurrently edit worker-owned files. Antigravity default model remains untouched. Every task requires actual turn/output and code/test review, not merely worker_done. External keys/data coverage may block live quality, not independent implementation. Preserve user servers and private data; no push/deploy/paid API.

## Fresh findings and preparation

- Fresh baseline585 tests failed result-count parsing and repeated-allergy timing; no previous broad PASS was inherited. f486f27 fixes result counts; e0d3213 preserves legacy flag-off reply shape and adds per-parse-only prefix caching.41 targeted regressions pass. Intermediate617-test full run failed legacy metadata/timing before those fixes; a fresh full run remains required.
- Durable search-credit ledger:3 tests pass for persistence/day+month/concurrency/corrupt storage. Fixed-host pinned-public-IP transport:2 tests pass for mixed/private DNS, redirects and429. No Tavily network call occurred.
- Public pilot map:2,138,597bytes, OSM freshness2026-10-18T04:00Z; source/hash/attribution committed. Runtime Range/render remains pending.
- Safe configuration metadata shows existing Gemini configured and Tavily key absent; no key values printed. Tavily live quality is BLOCKED pending local backend/.env configuration. Gemini live quality is NOT TESTED.
