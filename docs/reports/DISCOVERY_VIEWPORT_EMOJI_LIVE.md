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

## Frontend and integrated acceptance

Antigravity checkpoint `4d46739` removes static emoji across frontend branches and uses proportional columns, coordinated1024px breakpoints and viewport-derived heights. Codex reviewed the immutable diff and inspected its actual1440px screenshot. Final acceptance remains pending; historical63/63 checks and previous screenshots do not accept this continuation.

The first new mock-browser run timed out waiting for a restaurant card. Its screenshot showed the composer correctly disabled because the mock `/v1/sessions` returned `session_token`, while the real contract and application require `token`. This is a harness contract defect; the product authentication gate must not be weakened to pass it. The checkpoint corrects that field and waits for authenticated enabled input; a successful rerun is still required.

Checkpoint source review also requested a display-only runtime emoji guard (including restored/provider/venue/user-echo data, while retaining raw inputs/IDs/URLs), complete sequence tests and removal of the arbitrary960px desktop height cap. Static source audit alone does not establish that dynamic UI text is emoji-free. Actual rectangle/reachability checks are required because `overflow-x:hidden` can hide clipped content without a document scrollbar.

Antigravity delivered `e99d83b` with a passing five-width mock-browser matrix (44 assertions), production build, 35 sanitizer assertions and 51 targeted contract checks. Codex inspected actual2560 and390 screenshots and accepted the proportional width direction, but **rejected runtime text acceptance**: pictograph deletion joined adjacent numbers, and the field projection omitted actual district/dish/hours/confirmation/tour fields. These passing tests did not cover those defects. Follow-up `task_6bad7be2b243` / `ctx_1570c0e39d91` owns the correction and independent affected-backend source review; no new worker or provider request was authorized.

Codex independently built immutable frontend `e99d83b` in an isolated directory and ran the actual backend/planner/SQLite journey on `1e6cb17` at3310/8210: **63/63 checks PASS**, normal exit0, zero uncaught JS exceptions and zero external HTTP origins, actual local PMTiles206. Evidence: `discovery-viewport-checkpoint-20261020/browser-evidence.json`; frontend and runner/backend revisions are separately recorded. Actual map1440 and confirmed390 images were inspected, showing geographic roads/lake/marker/attribution and usable mobile tour controls. This accepts checkpoint application behavior, not the pending runtime emoji correction or final deployed source.

## Runtime

Task-owned API `http://127.0.0.1:8300`: local/private dataset and existing Gemini configuration, estimate-only routing, paid Maps disabled. No additional live chat turns are to be used for automated QA after the three-turn smoke allowance is consumed.

Independent regression API `http://127.0.0.1:8210`: explicit synthetic fixture/rules, same application/planner, no outbound model calls. Final frontend URLs/source revisions will be recorded after integration. Existing user servers/processes were not stopped.
