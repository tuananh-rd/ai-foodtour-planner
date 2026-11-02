# GPS address, conversation and active-chat continuation

## Authority and source

Sol owns backend/AI/runtime/review/integration; Antigravity owns frontend/QA; Claude Sonnet5.5 medium completed read-only advice. AG's existing conversation was resumed with user-authorized session-only full tool permissions; no global settings changed. Its screen remains Gemini3.8 Flash/high. This is the implementation agent, distinct from the app's Gemini chat model.

Backend source: `17a8f54`, `a21c8cd`, `8843e37`, `359b28f`, `b92dff1`, `4213800`; native comparison-selection regression `52a8880`. UI source `8e66383`, `0bb4d3f`, `99e32de` integrated as `e338f13`, `566122f`, `7ab96b4`. Final production UI **`af9d1cc`** also clears stale GPS denial/progress after a chosen origin succeeds; AG affected read-only review explicitly APPROVE (`task_07713c9fc10f` / `ctx_de9092b35b17`). All current worker tasks settled and retained; no concurrent editor.

## Behavior

- Clicked GPS requests a nearby street/place label through bounded Photon/OSM reverse lookup. Coordinates remain internal for Haversine and Maps; no house number is inferred. Approximate/attribution/unavailable/manual-edit states are visible. Timeout/rate-limit/off states do not falsely claim absent OSM data. Manual labels do not geocode or change coordinates and invalidate confirmation/tour.
- General food questions can use a bounded public dialogue context without onboarding. Read tools remain separate from selection mutations; actual visible IDs, selection versions, allergy/privacy and explicit confirmation/CAS remain authoritative. General food comparisons do not rewrite food preferences; comparison A/B references survive an emptied result list.
- Active chat expands the column, hides the introductory hero/chips and collapses the unset-origin form behind an explicit control. Bounded internal scrolling keeps the composer visible; the location editor remains usable. Initial insufficient desktop/unbounded mobile results were retained and corrected before final acceptance.

## Offline evidence

- Backend overlapping suites and cap/privacy/address evidence are detailed in [backend report](CONTINUATION_20261102_BACKEND.md); do not add overlapping counts into a synthetic total. New native comparison-selection regression passes and creates neither tour nor confirmation. OpenAPI drift check passes.
- AG reports revised units103/103 and retained exits0 for build tasks6828/6931. Mock artifact `qa/discovery-upgrade/evidence.json` reports34/34 on five widths. Those mock checks did not catch the real mobile stream/composer problem and are not used as final layout acceptance.
- Independent configured production build `e338f13` exits0: `continuation-20261102-initial-build.json`.
- `continuation-20261102-integrated/browser-evidence.json`: real synthetic/rules backend and browser-typed discovery, area change, compare/select, confirmation, planner, actual-origin free Maps, Haversine/unknown distances, invalidation,409 recovery, allergy, offline error, PMTiles206, keyboard, no emoji/remote origins/JS exceptions. Initial layout checks fail; retained evidence includes exact stream/composer measurements.
- `continuation-20261102-address-rendered-fixed-harness/browser-evidence.json`:13/13 rendered address checks. GPS hardware and geocoder response are CDP fixtures; outgoing reverse lookup is suppressed, so no upstream geocoder/model request occurs. Manual label saving uses the actual synthetic API. The first retained run timed out because the harness matched lowercase `quá` against UI `Quá`; only the harness was corrected.
- Reproducible browser checks: `tools/verify_nov02_integrated_ui.mjs` and `tools/verify_nov02_address_ui.mjs`. Both reject a non-synthetic/non-rules backend before creating test sessions. The address harness explicitly distinguishes fixture responses from actual backend actions.

### Final rendered acceptance

| Evidence | Result and limits |
|---|---|
| `continuation-20261102-final-build.json`, `...-final-build-private.json` | Both production builds exit0, UI sourceaf9d1cc; different compiled API targets8240/8250, no environment files copied |
| `continuation-20261102-final-integrated/browser-evidence.json` |55/56 on actual synthetic/rules API: typed discovery/area/compare/select/explicit confirmation/planner/Maps, five widths, no emoji/overflow, composer/readability/scroll, privacy/allergy/CAS409/offline/PMTiles206. One assertion captured a stale greeting response because the harness counted a concurrent GET bootstrap as the new POST |
| `continuation-20261102-final-transcript/browser-evidence.json` |6/6 targeted continuation after harness synchronization fix (count only POST, reject older revisions), including the exact screenshot sentence and correct area/compound foods/one origin question. The55/56 artifact is retained; this is not represented as one56/56 run |
| `continuation-20261102-final-address/browser-evidence.json` |14/14, simulated hardware/geocoder responses, actual manual-label API save; resolved/approximate/attribution/unavailable/manual/denied/timeout and stale-progress cleanup. No upstream geocoder/model call |
| `continuation-20261102-final-shell/browser-evidence.json` |8/8 on final source, greeting without origin, desktop/mobile stream/composer and expanded manual-origin controls. No onboarding or provider call |
| `continuation-20261102-private-bootstrap/browser-evidence.json` |6/6, actual private/Gemini-configured UI bootstrap only; supported model visible, no venue records displayed/exported, no GPS acquisition and ledger10→10. This is not live quality proof |

Final real journey stream/composer measurements (pixels):1280:400/732;1440:624/956;1920:680/1012;2560:1040/1372;390mobile:452/823 within844px viewport. Chat body15px/composer16px. Screenshots `active-chat-1440.png`, `active-chat-390.png` and `mobile-origin-editor.png` were inspected. Earlier near-threshold mobile420px and stale GPS notice were corrected, not waived by loosening the threshold. The additional `tools/verify_nov02_shell_ui.mjs` retains the general-chat/expanded-editor regression.

## Live evidence and remaining limitation

The current-day smoke consumed all six authorized user turns and ten native generated requests, zero retries, requested/returned `gemini-3.5-flash-lite`, bounded private local records. It proved a model-authored general answer and real local tool results, but did **not** complete selection/tour. It is a partial/failing journey, not a quality PASS. Source fixes have offline regressions; the repaired final journey has not been re-probed live.

The smoke exposed a SQLite reservation persistence defect admitting ten calls despite session cap6. It was fixed and covered by a real SQLite cap2 regression. The exact smoke session's spent count was conservatively reconciled0→10; daily ledger remains10 used, lower daily18/session6/reserve3 caps unchanged. No further live Gemini generation is performed under this consumed allowance. A later explicitly bounded allowance is required for final model-led quality verification. Tavily remains off/unconfigured, with no live search or paid eligibility assumption.

No raw private dataset, key, health history or personal GPS is exported. The one actual Photon service check used a public fixture and is documented separately in the backend report. Numeric/operational/allergy claim guards remain conservative and can reject otherwise benign model prose; this is a known limitation, not evidence that all general dialogue is solved.

## Final local URLs and acceptance

Preserved user lane: http://127.0.0.1:3320 / API8230, synthetic/rules, untouched.

**Offline accepted:** http://127.0.0.1:3330 / API8240 — production, synthetic/rules. Actual backend build4213800; final backend code is unchanged by later UI/test/doc commits.

**Private local data + Gemini configured:** http://127.0.0.1:3350 / API8250 — productionaf9d1cc, backende338f13 includes repaired4213800 backend. Modelgemini-3.5-flash-lite; daily limit18/used10/remaining8, session6/reserve3 unchanged. No new smoke generation: final live conversational quality remains unverified and must not be inferred from bootstrap/health. Tavily unavailable/off. No push/deploy performed; original3320/API8230 preserved.
