# Approved online assistant implementation — 2026-10-19

Run `run_928fb169d5d9`; current Codex terminal `term_ecb79c94-80cb-4298-9e27-6720faa54e6e`. Runtime ff583610, Orca1.4.219. Existing Antigravity checkout retained; runtime inventory shows0 attached PTYs/agents there, so one replacement supervised worker is necessary, not a duplicate. Old QA task failed/exited; its counts are historical evidence only. Claude is not resumed.

| ID | Owner | State | Files / acceptance |
|---|---|---|---|
|OA0 |Codex |DONE | Preserve communication WIP and approved proposal; integrate latest Antigravity functional commits without reset/clean; latest authority documented |
|OA1 |Antigravity, Codex review |MODULE REVIEWED / LIVE PENDING | Initial task task_6470a24ebdd6 / ctx_c420f30a25d2 settled8ff4d7c. Review fixes task_b538388a6a4a / ctx_dbcd66807adb settled6205f6e/0f5f638, integratedf61d6a1. Codex preserved conversation.py WIP, tightened missing-state numbers/operating claims and added3 regressions;33 module+HTTP tests pass. Finite text guards are not exhaustive safety proof; deterministic gates remain authoritative |
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
- UI task task_9d7b6ad92b32 / ctx_3e03c3d2ba85 failed at agent_readiness with timeout, no dispatch_input or worker resource materialized. No duplicate worker/model change. Same terminal received one readiness-only probe ea179785-e391-47a9-83ef-4d2e109d5970; receipt alone was unsupported/input_accepted, then actual terminal output explicitly replied READY. Retry must name the failed task/attempt and same terminal, never resend an old prompt blindly.
