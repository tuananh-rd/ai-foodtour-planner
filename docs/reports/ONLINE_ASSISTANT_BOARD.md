# Approved online assistant implementation — 2026-10-19

Run `run_928fb169d5d9`; current Codex terminal `term_ecb79c94-80cb-4298-9e27-6720faa54e6e`. Runtime ff583610, Orca1.4.219. Existing Antigravity checkout retained; runtime inventory shows0 attached PTYs/agents there, so one replacement supervised worker is necessary, not a duplicate. Old QA task failed/exited; its counts are historical evidence only. Claude is not resumed.

| ID | Owner | State | Files / acceptance |
|---|---|---|---|
|OA0 |Codex |DONE | Preserve communication WIP and approved proposal; integrate latest Antigravity functional commits without reset/clean; latest authority documented |
|OA1 |Antigravity, Codex review |IN PROGRESS | Task task_6470a24ebdd6 / dispatch ctx_c420f30a25d2; turn_started and real output observed. Only new backend/app/assistant/{__init__,conversation}.py, backend/tests/assistant/, docs/reports/online-assistant/OA1.md; context/privacy/safety/provider-failure tests |
|OA2 |Codex architecture + bounded Antigravity implementation |WAIT OA1 | Conversation/state API and chat UI wiring; exact file list before dispatch; preserve confirmation/allergy/revision/reload gates |
|OA3 |Antigravity, Codex review |WAIT OA2 | Tavily adapter, durable credit guards, citations/UI failures; official docs verified before implementation |
|OA4 |Antigravity, Codex review |WAIT OA3 | Interactive local PMTiles/OSM map, attribution/Range/markers/error; actual licensed asset provenance and bytes |
|OA5 |Antigravity + Codex |WAIT | Fresh desktop/mobile real-browser journey and failure/privacy/quota/Range checks; regression/build/drift; one final verified URL/commit |

Codex owns rules/board/contracts/integration and does not concurrently edit worker-owned files. Antigravity default model remains untouched. Every task requires actual turn/output and code/test review, not merely worker_done. External keys/data coverage may block live quality, not independent implementation. Preserve user servers and private data; no push/deploy/paid API.
