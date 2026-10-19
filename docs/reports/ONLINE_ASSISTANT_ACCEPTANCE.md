# Online assistant verification — in progress

Codex coordinates/reviews/integrates; Antigravity implements scoped tasks and independent QA. Scope is contextual conversation around validated deterministic state, opt-in bounded Tavily BASIC retrieval, and a public self-hosted OSM pilot basemap. External navigation remains free Google Maps URLs. No paid activation, push or deployment occurred.

## Integrated behavior

- Optional contextual conversation cannot confirm a tour, change constraints or override allergy warnings. Sensitive turns and private record-derived history stay outside the new conversational projection; provider failure preserves deterministic flow.
- Web lookup requires explicit per-query opt-in. The actual adapter uses strict schema/source guards, fixed official transport, fresh free-account/headroom checks, persistent daily/monthly credit admission, bounded distinct concurrency, singleflight and short-lived cache. Quota/network/provider failure is visible; no synthetic search is represented as live. Sources are untrusted quotations with URL/date/time, not proof of opening or allergy safety.
- The interactive pilot map renders local geographic tiles and synchronized tour markers with toggle, keyboard popup and visible attribution. It is not an in-app walking router. The measured archive is2,138,597bytes; finite storage/bandwidth/freshness maintenance is documented.
- Desktop follows the accepted SVG structure/palette/type hierarchy. Actual1440x1024 side-by-side/overlay and390px mobile captures are retained. Dynamic warnings, Hanoi data and real functional controls differ from sample content; no pixel-identical or full accessibility-conformance claim is made.

## Evidence ledger

| Scope / source | Result | Evidence / limit |
|---|---|---|
| Backend1509005 | PASS661 tests, one optional private-data skip;138.892s | Official scripts/run_unittests.py, exit0; no private CSV/provider coverage inferred |
| OpenAPI / frontend mock contract1509005 | PASS schema match /18 checks | tools/export_openapi.py --check; npm --prefix frontend test; mock contract only |
| Actual adaptercdf47ba | PASS26 module tests and9 independent fresh-process contract groups | online-assistant/adapter-contract-cdf47ba.json; real SQLite, external transports synthetic |
| Actual factory / HTTP1509005 | PASS3 wiring tests | Actual app/adapter/cache/SQLite; only external transports mocked; includes409 before outbound/state invariance |
| Production UI3060/API8060 source1509005 | PASS60/60 desktop/mobile | online-assistant/integrated-final/browser-evidence.json; rules/synthetic, zero remote origins/console errors |
| Broad production browser regression1509005 | FAIL2 of190 checks | online-assistant/regression-final.json; initial clarify focus1280/390 remains open,188 other checks pass |
| Mocked external-search outcomes | PASS32/32 earlier final-frontend tree | online-assistant/mock-web/browser-evidence.json; actual UI/app, only external provider stubbed; no live Tavily claim |
| Session/transport failure lane | PASS19/19 earlier final-frontend tree | online-assistant/session-faults/browser-evidence.json; real synthetic API, failure-only injection |
| Independent exploratory final QA | IN PROGRESS | Existing Antigravity task_773e0849bceb/ctx_bc7440d9491f, report/evidence ownership only |
| Tavily live | BLOCKED | No local key; configure only ignored backend/.env using ONLINE_ASSISTANT_LOCAL_SETUP.md; never send a key in chat |
| Gemini live quality | PARTIAL | Earlier two bounded public calls: one accepted greeting, one rejected reply; cause not retained. No full contextual-quality claim |

## Delivery gate

Resolve/classify the two focus failures and independent findings, review any scoped repair, rebuild and run affected real-browser regressions before final delivery. Current test URL http://127.0.0.1:3060 is production frontend source0de3632 against synthetic/rules API source1509005; this is a test target, not a claim of live-provider acceptance. Preserve user servers, WIP and retained worker; no automatic paid-credit fallback if agent usage is exhausted.
