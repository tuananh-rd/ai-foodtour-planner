# Codex review of UI candidate d9c2971 — NOT ACCEPTED

Environment: Windows, Chrome155.0.8059.80 (headless with software WebGL test flag), Node24.19.0. UI source d9c2971 integrated at2602cd6; actual development URL http://127.0.0.1:3060, backend http://127.0.0.1:8060 reports2389908, synthetic/rules. This mixed checkpoint is explicitly not the final tested build. No private dataset or external LLM/search calls were used by the browser probe.

`node tools/probe_online_ui.mjs` exercised actual typing/clicking against the real synthetic API on1440×1024 and390×844. Candidate evidence: [browser-evidence.json](codex-candidate/browser-evidence.json).33 of35 automated checks passed; initial marker visibility failed on both viewports. A canvas-existence check was insufficient and is not accepted as geographic rendering evidence. Manual screenshot review and a separate runtime diagnostic identified an additional blocking blank-basemap defect.

| ID | Severity / kind | Reproduction, expected and actual | Gate / evidence |
|---|---|---|---|
| OA-UI-001 | P1 product | Open Bản đồ. Expected local geographic roads/water; actual blank background. Chrome reports Worker failed to load. Only the initial PMTiles header range is requested | [Diagnostic JSON](codex-map-diagnostic/browser-evidence.json); [actual tour map](codex-candidate/tour-map-1440.png). MapLibre6 bundler worker URL must be configured and retested |
| OA-UI-002 | P1 product | Create3-stop tour, open map. Expected3 markers immediately; actual0 until toggling off/on. Reproduced on desktop and mobile | Candidate checks markers match tour failed twice. Map-ready/effect lifecycle must synchronize initial markers |
| OA-UI-003 | P1 implementation review | HTTP200 disabled/quota web result retry reads lastFailedTurn, which is only populated on transport failure. Retry has no originating query and can do nothing or use another draft | Preserve immutable query association on each web reply, correct fresh revision/web flag, and verify actual retry request |
| OA-UI-004 | P2 test-mode product | Mock web query follows normal mock profile/tour processing before appending unavailable block | Short-circuit before slot/tour mutation; test preference/pending/allergy/tour invariance |
| OA-UI-005 | P2 defense in depth | Citation UI accepts HTTPS private-IP/credential/nonstandard-port URLs, shows time without date and potentially invalid dates | Server independently rejects unsafe URLs, so this is not proof of server SSRF. Align frontend validation and retrieval timestamp semantics |
| OA-UI-006 | P2 implementation review | Custom marker div has button role without native keyboard behavior; asynchronous imports lack generation cancellation; source errors beyond404/WebGL can leave indefinite loading | Native keyboard markers, bounded error/loading behavior and cleanup required |
| OA-UI-007 | P2 content correctness | Disabled web message asserts synthetic data regardless of effective dataset; quota message asserts daily-only even when month or a conservative guard blocks | Use provider-specific unavailable/configuration status without dataset assumptions; quota wording must cover both windows |
| OA-UI-008 | P1 security / sibling WIP only | UIR1 debugging added arbitrary window.__FOODTOUR_API_URL__ and ?api= overrides in getApiBaseUrl, plus default-port change. A crafted app URL could redirect API requests and session credentials to an unintended origin | Not integrated into coordinator. msg_de8938bd9c1b requires exact original configured-origin behavior, removal of runtime override and regression boundary; correct test build configuration instead |
| OA-QA-001 | Evidence error | Original worker capture uses frontend mock mode; its map image includes startup error and blank map. Copied bounds helper tests do not exercise PilotMap | Historical screenshots/static checks cannot support functional acceptance. Correct UI.md claims and retest actual backend/map |

Public asset control: Node PMTiles reader returned a166,951-byte tile for13/6504/3606 with the expected pilot bounds. Actual same-origin127-byte Range request returned206. Thus asset availability/header decoding alone does not establish renderer readiness. Official worker setup guidance: https://maplibre.org/maplibre-gl-js/docs/ (ESM/Next.js section) and https://github.com/maplibre/maplibre-gl-js/blob/main/docs/guides/v5-to-v6-migration-guide.md.

UIR1 task task_6735006d7387 / ctx_fc855380ac48 was injected once into the existing Antigravity terminal. It owns the same bounded frontend files and report/QA corrections. The previous worker_done settled its lifecycle but did not pass Codex review. Current-lifecycle ownership ACK was verified in msg_244048038228 after coordinator recovery; final review remains required. Tavily adapter task task_7091438b0cd8 is still queued; do not claim retrieval implementation complete.


## UIR1 work-in-progress observation (not integrated acceptance)

The worker's correctly configured3070/8070 synthetic/rules probe produced35 passing checks and PMTiles tile-range487845-605035, not just the header. Codex opened the actual1440 screenshot in the sibling integrated evidence folder: roads, Hoan Kiem lake and3 markers are visibly rendered. Thus the original renderer/initial-marker defects have a positive WIP retest. This run uses the older35-check probe and does not prove the newly added popup keyboard, HTTP200 retry, replacement or offline checks. Final commit/build and independent integration retest remain required.

The sibling WIP still contained OA-UI-008 when reviewed; no security acceptance is granted by a visually working map. msg_de8938bd9c1b requires removing arbitrary API origin selection and restoring original configuration semantics. msg_5c7db434254e also requires mock revision advance and action+web flag422 parity. These are source-review findings, distinct from the earlier CORS test-configuration error. The current coordinator checkout has not integrated this WIP.


## Integrated UIR2 runtime review at3d996da

UIR1/2 were integrated after restoring the configured API origin and passing the18 frontend contract checks and7 scoped QA checks. The initial scoped test invocation from the wrong checkout read old source and failed a static selector assertion; rerunning from the actual sibling checkout passed. This was a test working-directory error, not an application defect.

The first extended browser run also had corrupted newly inserted Vietnamese literals (PowerShell stdin encoding) and an incomplete CDP Enter sequence. These created false allergy, retry-text and popup failures. UTF8-safe patches and the actual Enter character fixed the harness. The second run passes allergy preservation during read-only search, native popup keyboard activation, initial markers, replacement-marker synchronization, desktop retry, Range and bounded offline fallback. It still fails a real mobile journey: the existing tour in a web response causes unconditional auto-switch away from chat. No claim of final PASS is made.

| ID | Severity / kind | Reproduction, expected and actual | Gate |
|---|---|---|---|
| OA-UI-009 | P1 product | At390x844, create a tour, select Explore/chat, enable web and submit a public food query. Expected result/retry stays visible in chat. Actual response includes unchanged tour and executeTurn switches to itinerary; result remains in hidden DOM and retry is inaccessible | Screenshot integrated-r2/web-disabled-390.png; source unconditional setActiveMobileTab under res.tour. UIR3 must switch only on actual tour_ready generation/replacement |
| OA-QA-002 | Harness, corrected | New accented assertion/query strings became question marks through PowerShell piping; native Enter lacked char text. Corrected without changing product allergy/marker logic | R2 passes corresponding assertions. Keep initial failed evidence distinct from product failures |

The actual session/fault probe passes19/19 checks including startup/restore503, retained session, initialization concurrency, reload of per-leg limit, opted-in transport failure, restored draft+web mode and manual Enter retry. Durable aggregate evidence: session-faults/browser-evidence.json. All data is synthetic, LLM rules and search disabled; no external provider quality is established.


## UI gate cleared at0de3632; provider gate remains open

UIR3 commit2a9c3e7 changes exactly the mobile tour_ready transition, honest disabled/quota wording and report. Source review and actual production browser retest pass60/60 on1440x1024/390x844, zero console errors/remote origins. The R3 final offline-map timeout was a harness navigation issue: after reload, the driver must select the visible itinerary tab before clicking map; hidden controls now fail explicitly rather than receiving a click at0,0. R4 independently verifies the product paths with that correction. Evidence: integrated-r4/browser-evidence.json.

Codex viewed the actual SVG side-by-side and overlay, the visible mobile map region and mobile web result. Header/main columns, chat-card bounds, stat-card geometry and palette remain close to the accepted reference; dynamic Hanoi/synthetic content, anonymous profile, extra GPS/search controls, source disclosures and safety warnings intentionally differ. Warning content shifts timeline cards downward and can increase page scroll; route-header controls can wrap the schematic label. No pixel-identical claim or complete WCAG/physical-device certification is made. Map roads/lake/attribution are visible; no routing line is represented as a real walking route.

OA-UI-001/002/003/004/006/007/008/009 have reviewed fixes and the applicable runtime/unit evidence. Citation defense has scoped URL tests; live-source citation quality remains blocked by absent Tavily credentials. OA3 and final post-integration backend/contracts/browser regression remain required; no final upgrade acceptance yet.
