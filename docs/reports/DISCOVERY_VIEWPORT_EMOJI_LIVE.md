# Viewport, plain UI text and actual Gemini continuation

Date: 2026-10-20 (Asia/Saigon). Baseline `4b57fe6`, previous UI `41b1d33`.
Codex coordinates/backend/reviews/integrates; Antigravity implements bounded frontend/QA; Claude inactive.

## Scope and evidence boundaries

The direct request authorizes fluid Warm editorial at desktop widths 1280, 1440, 1920, 2560 and mobile390; removal of Unicode emoji throughout the product; and a live smoke using existing local Gemini configuration and private venue data. The live allowance is at most three chat turns / six total model requests including tool continuations, no automatic retries, cap/model increases, paid Maps or Tavily. No entire dataset, personal GPS/health, secret values or venue records may enter reports.

Existing untracked evidence, private datasets, configuration and persistent ledgers remain intact. Runtime restart invalidated historical terminal handles. Current Run `run_a4b75f502189`; existing Antigravity terminal was rediscovered and positively acknowledged readiness. Its visible effective selection is Gemini3.8 Flash/high, unchanged. Two readiness-detector starts failed without task delivery; the documented low-level Orca dispatch was then acknowledged: `task_90f732d804e0` / `ctx_110dc582c012`. No duplicate agent or second coordinator was created.

## Backend and live Gemini — verified

Backend commit `1d3bad8` adds a shared plain-text display policy and applies it to discovery generated replies/replay, legacy conversation verification and checked explanations. Raw user input and private records/IDs are preserved. The native function schema now keeps Pydantic `$defs` at the parameter document root; previously `#/$defs/Origin` was nested under `patch` and did not resolve.

The final hermetic targeted suite passed **78 tests**, exit0: discovery presentation/protocol/journey, legacy conversation and extraction/explanation modules. It includes an actual HTTP restore check proving assistant display is plain while raw replay and session identity remain unchanged (`361b63a`); the follow-up separator fix `dab8195` prevents adjacent words/numbers from merging during emoji removal. These mocks establish regression behavior, not provider success. The protocol reference test verifies every native declaration's local `$ref` resolves; OpenAPI drift check also passes.

Backend final source is `1e6cb17`: invisible joiners/variation/tag formatting are removed before safety verification without splitting words, so an obfuscated allergy-safety assertion cannot evade the existing safety check. Visible pictographs become separators. Raw user replay is retained. Both task-owned API lanes were refreshed to this source after their exact process command lines were verified; no user-owned server was stopped.

Actual provider evidence:

| Run | Chat turns | Actual model transports | Result |
|---|---:|---:|---|
| Initial configured native loop |1|1|HTTP400; API explicitly returned `rules` / `unavailable_rules_fallback`. Retained as failure, never counted as live success |
| After locally diagnosed schema correction |2|4|Four HTTP200 native responses, each naming response model `gemini-3.5-flash-lite` and finish reason STOP; native search + tool-result continuation, then native comparison + tool-result continuation |
| Combined authorized smoke |**3**|**5**|No automatic retry, model substitution or additional smoke calls |

Sanitized artifacts: [initial failure](discovery-live-20261020.json), [corrected schema live responses](discovery-live-20261020-schema-fixed.json). They contain response model/status, native tool names, call counts, result counts and fallback reason, never request/response text, venue IDs/names/addresses/GPS, tokens or keys. The local dataset loaded1702 validated venues; this aggregate is not an export of records. Search returned5 results; comparison used2 actual local results and honestly returned `unknown` for missing evidence. A provider success does not prove all restaurant facts, planner feasibility or broad conversational quality.

The existing persistent Gemini ledger was reused, used0→5. Configured daily20, session6, reserve3 were unchanged in the smoke. The existing local launcher further restricts runtime daily allowance to18 and preserves the same used calls. `.env`, model and account/billing configuration were not changed. Health/configured state is supplemental only; live proof is the actual four provider responses.

The smoke exercised actual application HTTP routes through FastAPI TestClient with temporary sessions and real outbound Gemini transport. It is not a private-data production-browser tour test. Only bounded tool projections are sent; public landmark requests were used, no personal GPS or health statements. The native loop has no automatic network retry and at most two attempts per turn.

## Frontend and integrated acceptance - complete

Antigravity authored `4d46739`, `e99d83b`, `41ecf88` and final bounded correction `a2958a1`. Codex reviewed and cherry-picked them as `0b539eb`, `fa84539`, `7fc13aa`, `4fdfe92`. The final frontend tree equals the author's tree. Affected backend review is **APPROVE** in [DISCOVERY_VIEWPORT_BACKEND_REVIEW.md](DISCOVERY_VIEWPORT_BACKEND_REVIEW.md); it correctly attributes the78 backend tests to Codex and its88/45 frontend checks to Antigravity. Claude remained inactive. Existing worker terminal was reused for sequential scopes, with no duplicate active worker, and retained idle after settlement; this manual dispatch lane has no Orca-owned process resource to stop.

The canvas has no fixed1208px maximum. Proportional grid tracks, `min-width:0`, coordinated1024px breakpoints, internal scroll and viewport-derived panel height retain sidebar/chat/tour/map. Codex independently checked the actual production3300 initial view at all five widths, rather than relying on `scrollWidth` alone:

| Viewport | Canvas right edge | Chat height | Tour right edge | Result |
|---|---:|---:|---:|---|
|1280x800|1280|662|1247.98|PASS|
|1440x1024|1440|886|1407.98|PASS|
|1920x1080|1920|942|1887.98|PASS|
|2560x1440|2560|1302|2527.98|PASS|
|390x844|390|stacked scrolling|mobile tabs|PASS|

The32px desktop right inset is intended canvas padding. All desktop composers remain contained and reachable. Mobile content scrolls; the test does not claim the entire stacked interface fits vertically without scrolling. Warm editorial direction is retained, without a claim of pixel-perfect Figma fidelity.

Static UI emoji were replaced by SVG or text. Display-only projection and shared `normalizeDisplayText` cover replies/replay, venue details, district/dishes/hours, confirmation/profile/tour, legacy SafeText/chat/errors, map popups and marker labels. Visible pictographs become separators; invisible format codes are removed without splitting words. Raw inputs, IDs, tokens, coordinates, URLs, locks and action revisions remain unchanged. Final three omissions (legacy stop aria labels and why text) were corrected and independently reviewed. The final source scanner finds only **two comment lines with illustrative emoji** in `emojiSanitizer.js`, not runtime UI literals; the updated audit artifact preserves these findings instead of claiming an empty result. Backend static matches in `chat/understand.py` are input-recognition regex alternatives, not output templates. Input controls intentionally preserve what the user types.

| Verification | Result / provenance |
|---|---|
|Backend targeted regression + OpenAPI drift|78 tests PASS, drift PASS at`1e6cb17`; no backend source changed during UI integration|
|Sanitizer unit assertions|88/88 PASS, author and independent Codex run|
|Frontend contract/client/Maps checks|18/18 and51/51 PASS, Codex run on integrated source|
|Injected mock-browser rerender + five-width matrix|45/45 PASS, Antigravity; fixture contains emoji so this exercises rendering, not just a source scan|
|Both immutable final Next production builds|PASS, source`4fdfe92`, separate public API bases8210/8300, no frontend env/key copy|
|Final production UI + actual synthetic backend/planner/SQLite|**63/63 PASS**, exit0, zero JS exceptions, zero external origins, actual PMTiles206|
|Actual private/Gemini URL bootstrap and all five resizes|**28/28 PASS**, authenticated private discovery-v1 view, zero assistant POST attempts, zero external requests, budget unchanged at5 used|

Final evidence: [browser-evidence.json](discovery-viewport-final-20261020/browser-evidence.json), [runtime-bootstrap.json](discovery-viewport-final-20261020/runtime-bootstrap.json), and discovery/confirmed/map screenshots at1440/390 in the same directory. Codex inspected actual final discovery1440 and map390 images, in addition to checkpoint map1440/confirmed390 and worker2560/390 captures. The map shows roads/lake/marker/attribution. The earlier checkpoint63/63 evidence is retained under `discovery-viewport-checkpoint-20261020` and is not substituted for the final run.

Review history: the first mock-browser timeout came from a mock session returning `session_token` instead of contract field `token`; the authentication gate remained intact. Codex rejected the initial sanitizer because it joined adjacent numbers and omitted real schema/render fields; later fixes preserve separators and cover the reported callsites. Initial passing35 assertions/44 mock checks were insufficient and are superseded by the88/45 suites and final independent checks. Backend review wording was corrected to match actual tool names/schema implementation and evidence attribution before acceptance.

## Running version and limits

**Final test URL: http://127.0.0.1:3300** - immutable production frontend`4fdfe92`, actual API`http://127.0.0.1:8300`, private local dataset and configured Gemini`gemini-3.5-flash-lite`. API reports`1e6cb17`; `git diff 1e6cb17..4fdfe92 -- backend` is empty, so the different hashes represent the same backend application source. Existing key, persistent ledger and lower runtime cap18/session6/reserve3 remain intact; bootstrap confirms used5/remaining13. No usage block was observed; no paid credit purchase, model switch, billing activation or quota increase occurred.

The isolated regression URL3310/API8210 is explicitly synthetic/rules and consumed no model budget. The former3200 delivery is historical and is not the current running URL. Only positively identified task-owned servers were refreshed; user processes, WIP, secrets, private data and ledgers remain intact. No push/deploy, new service, dependency upgrade, Tavily or paid Maps call.

Native Gemini success is proven by the retained actual outbound responses, **not** health or the bootstrap probe. The authorized smoke remains exactly3 chat turns/5 total model transports (initial400 plus four200), with no further model traffic during final QA. It proves bounded local search/comparison/tool continuations, not broad private-data conversation quality, private-data browser tour completion, full accessibility certification or real road-routing accuracy. Tour/allergy/confirmation/replacement end-to-end coverage uses clearly labeled synthetic fixtures. Free Google Maps URLs and the self-hosted PMTiles pilot remain unchanged.
