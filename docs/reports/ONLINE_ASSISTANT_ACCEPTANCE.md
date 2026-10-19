# Online assistant verification — local scope accepted, live-provider limits retained

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
| Production UI3696001/API1509005 | PASS60/60 desktop/mobile | online-assistant/integrated-focus-final/browser-evidence.json; rules/synthetic, zero remote origins/console errors |
| Broad production browser regression3696001 | PASS190/190 checks, exit0 | online-assistant/regression-focus-final.json; both initial clarify-focus checks1280/390 now pass |
| Focus repair6816b23 | PASS7/7 targeted browser cases | ../qa/online-assistant/final-integration/focus_verification_evidence.json; initial/next clarify, new draft, restore, confirmation/tour |
| Mocked external-search outcomes | PASS32/32 earlier final-frontend tree | online-assistant/mock-web/browser-evidence.json; actual UI/app, only external provider stubbed; no live Tavily claim |
| Session/transport failure lane | PASS19/19 earlier final-frontend tree | online-assistant/session-faults/browser-evidence.json; real synthetic API, failure-only injection |
| Independent exploratory QA / affected-implementer review | COMPLETE, integration approved | online-assistant/FINAL_QA.md; candidate6816b23 integrated3696001 after Codex review; initial unsupported root-cause/visual claims corrected |
| Tavily live | BLOCKED by account metadata | Local key now configured/ignored; /usage HTTP200 recognizes free plan but account.paygo_limit=null and key.limit=null, unchanged adapter rejects unknown limits;0 search POST/local credit delta0. online-assistant/tavily-live-smoke.json |
| Gemini live quality | PARTIAL | Earlier two bounded public calls: one accepted greeting, one rejected reply; cause not retained. No full contextual-quality claim |

## Delivery gate

The two focus failures are fixed and the local integration gate passes: reviewed source3696001, production build PASS (148kB first-load JS), final broad browser190/190 and actual production UI60/60. Backend source is unchanged from1509005, so its661-test result is retained without rerunning the full suite. Current test URL http://127.0.0.1:3060 serves frontend3696001 against synthetic/rules API1509005; no local/private dataset or live-provider quality is inferred.

Runtime follow-up after local credential setup: same frontend3696001 serves HTTP200; reloaded task-owned API8060 reports buildd1d989f (backend source unchanged), dataset synthetic, assistant rules, web_search_configured=true. This indicates local configuration only: live account gate remains BLOCKED by null limits. API restart required terminating only verified task-owned processes after graceful shutdown stalled; existing session ledger and user servers were preserved. No new search or Gemini calls followed the blocked probe.

Codex inspected the refreshed1440x1024 side-by-side and390px mobile geographic-map capture in online-assistant/integrated-focus-final/. Core desktop columns, palette and hierarchy remain aligned with the reference. Remaining differences include dynamic Hanoi/synthetic content, anonymous account, mandatory warning/data/search controls, card heights and page scroll; this is not pixel-identical acceptance. Side-by-side and overlay are retained. No full WCAG or physical-device conformance claim is made.

Tavily live remains BLOCKED by unknown account/key limits even with a configured local key. /usage HTTP200 returns null PAYGO and key limits; guards were not relaxed, no search POST occurred and no citations were fabricated. Local caps are1 credit/day and3/month, preserving lower existing caps and ledger; no Gemini calls or settings changes. See ONLINE_ASSISTANT_LOCAL_SETUP.md. Gemini remains PARTIAL. Existing mock-search32/32 and fault-lane19/19 evidence concerns earlier frontend source and is not relabeled as a fresh live run. Agent/model billing state is unverified; no claim of a platform billing lock is made. Preserve user servers, WIP and retained worker; usage exhaustion or a required credit fallback remains a stop-and-report condition.
