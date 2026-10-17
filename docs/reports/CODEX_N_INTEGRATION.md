# N-series local integration — 18/10/2026

Codex lead under the user's explicit override; Claude did not participate. Application baseline `228ea0e`. No push, deployment, paid API activation, scraping or dependency upgrade. Plans/reviews remain present and untracked as requested. Antigravity authored the redesign in its existing Orca worktree/default Gemini3.8Flash High session, then explicitly transferred frontend writes at `739ee78`; Codex performed serial review fixes. Antigravity retains independent QA, not concurrent frontend source edits.

## Delivered behavior

The SVG was rendered and visually inspected before the design brief. The live UI implements its warm ivory/forest green/lime/orange style, pill navigation, chat column, metric cards, timeline cards and stop-order overview. Mobile uses legible responsive panels rather than scaling the desktop canvas. The SVG is a reference asset, not embedded as the application. Controls use real API/state flows; no fake account, fabricated operational tip, sample date, cost or distance was copied.

Vietnamese extraction now handles “một tiếng rưỡi” as90minutes, written amounts, “cả hội/cả chuyến”, party size and stop counts. Coverage does not count an old slot as capturing a new unread numeric cue; unresolved cues persist as obligations. A profile/budget chip cannot resolve ambiguous allergy text through the ngân/ngan alias. Explicit confirmation and allergy gates still block every planning entry point.

Null arrival/leg duration/profile facts remain unknown and legitimate zero is retained. Warnings/status/price semantics survive confirmation and timeline. The exact requested budget and group/per-person/unknown scope remain distinct from venue source ranges. Restored questions derive from current state, including150k/300k/1m. No-solution gives an explicit terminal explanation or a bounded, locally checked adjustment, never silent relaxation. Replacement preserves other stop identities/order/locks; no-candidate retains the old tour. A real concurrent safety change followed by stale replacement409 restores the current question, closes the old modal and hides the retained old tour until its obligations are resolved; reload does the same.

Dialogs are portals outside the inert background, have keyboard containment and return focus. Replacement completion targets the tour region if the old trigger no longer exists. Loading/retry, hostile strings, offline/5xx/conflicts and200% reflow have browser coverage. Privacy copy distinguishes actual rules/mock from optional Gemini and explains that destination coordinates enter the free Google URL. No browser Maps key, paid API, embed or unrestricted runtime endpoint override remains.

Local observability records random request IDs and allowlisted contract/algorithm/dataset/error/phase/status/timing/counter metadata, separating provider attempts/validated outcomes and checked planning. It excludes prompts, session tokens, raw paths, personal location and private venue identifiers. Data-gap and benchmark tools produce counts/timings; operations/runbook documents session expiry, bounded quotas and safe local recovery.

## Final verification on application source6415d61

| Gate | Evidence | Result |
|---|---|---|
| Backend/module/security/storage/parser | `.venv/Scripts/python.exe -X utf8 scripts/run_unittests.py` |575 OK,1 optional private-CSV skip;47.887s |
| Public schema | `tools/export_openapi.py --check` | Matches server OpenAPI |
| Frontend contract | `npm --prefix frontend test` |18/18 |
| Frontend production build | `npm --prefix frontend run build`, telemetry disabled | Exit0 |
| Null/zero/status/warnings/Maps links | `node tools/check_ngonngon_render.cjs` |11/11 React SSR probes |
| Independent full browser | `node qa/e2e/codex_guided_review.mjs` |169/169; actual Chrome+scratch production Next+synthetic real HTTP API; desktop1280 and mobile390;0 runtime exceptions,0 console errors,0 Maps API/key requests |
| Additional interactive replacement/dialog/reload | `node tools/review_ngonngon_interactions.mjs` |22/22; real preview frontend and separate synthetic API; actual successful replacement, locks/order, no-candidate, real safety409, reload, focus and budget restoration |
| Earlier isolated guided HTTP API | `qa/e2e/test_guided_api.py --port18267` |26/26; earlier backend checkpoint, final backend suite covers subsequent regression |
| Author independent QA | Antigravity final QA commit/report | Pending final author settlement/review; not inferred from process status |

The full browser suite includes chat→clarify→confirm→tour→actual free-Maps anchor activation (external navigation blocked), editing, reload, actual concurrent409, stale ownership/revisions, error/offline/retry, feature flags, keyboard and200% reflow. Four semantic actions after initial submission in its standard flow do not establish universal usability. Screenshots and visual comparison: [independent captures](ngonngon-codex/README.md), especially [desktop](ngonngon-codex/desktop-tour.png), [mobile](ngonngon-codex/mobile-tour.png), [confirmation](ngonngon-codex/mobile-confirm.png). No private data in captures. Raw temporary browser session evidence stays outside Git.

The supplemental reviewer initially used a non-feasible generic synthetic shortlist; that correctly produced no solution. A PowerShell stdin encoding error in the new fixture text was corrected with a UTF-8 patch. The completed probe then found two actual UI failures (fallback selector preferred main over the tour region; an existing tour hid a newly pending allergy after replacement409), reproduced them before fixing source6415d61 and passed22 checks afterwards. Full production browser169/169 and build were rerun after the source fix. Earlier screenshots claiming mobile success on a scaled desktop layout and earlier author presence-only QA do not satisfy this gate.

## Limits and remaining decisions

Count-only private audit:36loaded,0rejected,2online-only,36unknown hours,1unknown price,0verified hours/prices overlays. Anonymous cluster candidate counts6/6/5/4/3/3/3/2/1/1 do not establish operating status, ingredients, walkability or reuse permission. Private local S04 returns3conditional stops passing an independent checker; S02 ends clearly without a tour or relaxation loop. Real localhost8020 API also proved stale revision409 and no-candidate409 preserving the old tour. Private venue records/identities/coordinates are absent from Git/reports.

Gemini live smoke made exactly1 bounded attempt after a separate0-call reserve-gate check, left the reserve3 and had0transport errors/0safety violations. The ambiguous case still reported rules understanding with unresolved allergy and no plan; this is not successful LLM understanding validation or a quality benchmark. No additional live calls were made. General unseen Vietnamese/LLM quality remains unproven despite deterministic regressions and safe structural gates.

Performance:100warm samples per rules/checked-planner workload at concurrency1and5 plus a separate cold sample; rules p95=24.069/123.462ms, direct planner/check p95=0.612/0.598ms,0errors. See [backend evidence](CODEX_N_BACKEND.md) for machine/mode and limitations. These local synthetic measurements do not identify a cache/index bottleneck or measure provider/network SLO, so P2 performance work stays deferred.

Actual screen-reader speech, representative participant testing, real Google route behavior, verified hours/prices/ingredients/routing and disposable persisted-DB backup/restore are not tested. Strict certification remains blocked on genuine evidence. The user must choose licensed data/pilot verification/participants and any future persistence or external telemetry policy; no permission to gather/publish data is inferred. Optional SQLite behavior is unit-tested, but this preview uses in-memory sessions lost at restart. A historical baseline audit row remains in old Git history (already redacted in the tree before this upgrade); no history rewrite was authorised.

## Local handoff

User preview: http://127.0.0.1:3020 ; API http://127.0.0.1:8020 . Explicit rules/mock LLM, routing estimate, no geocoder/Google API/provider outbound calls. It uses the user's existing authorised local venue input, so results can be conditional or infeasible. Screenshot QA uses a separate labelled synthetic API only. See [operations](../LOCAL_OPERATIONS.md) and `tools/run_upgrade_preview.ps1` for safe restart; it refuses occupied ports. Existing user services3000/8000/3010/8010 were not stopped. Synthetic8030 is test-owned and will be closed at completion. No production deployment is claimed.
