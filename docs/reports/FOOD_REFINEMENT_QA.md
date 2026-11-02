# Lane 3350 Food-Refinement Bug — Frontend/QA Affected Review & Executed Regression

Owner: Claude (frontend/QA, claude-opus-4-8). Backend matching/intent: Sol.
Date: 2026-11-02. No app generation, no live private chat, no provider call, no 8250 chat POST.

## 1. Reported bug

On app 3350: `tôi muốn ăn phở` → choose **Đống Đa** origin → `tôi muốn ăn phở gà cơ`
returned a **generic mutation-deny** plus **stale wrong cards**.

## 2. Affected-review — where the defect lives

The frontend has **no optimistic result cache**: every assistant turn calls
`setView(updatedView)` (`DiscoveryLayout.jsx:545,594`), replacing the whole view; cards render
solely from `displayView.results` (`:1870`), the confirmation solely from `view.confirmation`
(`:2101`). If the backend returns the refined intent with cleared results and `confirmation:null`,
the UI clears on its own. **The bug is a backend contract defect, not a frontend rendering defect;
no frontend production edit was made.**

### Backend review (read-only) — APPROVED

- **724c73a / 5bb9cbb (reviewed earlier):** root cause was a stale `plan_requested=true` routing
  the foods-change turn into `create_itinerary` instead of a search; 5bb9cbb's `State.patch` resets
  `plan_requested`/`pending_slot` on a foods change, clears results+comparison, drops the stale
  `pending_search.dish`, and ends with `self.invalidate()` (`state.py:169` → `confirmation=None`,
  `tour_stale=True`) while preserving selection/locks and origin. `matches_food` is dish_tags-only
  (name-only never matches); generic phở excludes cuốn/xào/chiên/trộn and (via `(?<!tao )`) tào
  phớ. The `denied_mutation_readonly_search` path (engine.py ×3) is gated on
  `not any(selection_refs.values())` → selection authority gate NOT weakened.
- **067193f (canonical labels):** `INTENT_LABELS` maps knowledge-dish keys to canonical short
  labels (`bun→bún`, `nem→nem`, …) so editorial knowledge headings ("Món bún", "Nem / chả giò")
  never become literal search phrases. Correct and bounded.
- **5541059 (no-match integrity):** removes `no_results` from the branch where a valid model
  sentence may overwrite the tool text, so an empty search's factual no-match reply can never be
  turned into a model availability claim. Directly protects the absent-phở-gà path.
- 70 targeted backend tests already PASS (per coordinator) — **not re-run** here.

## 3. Executed browser regression — `qa/discovery-assistant/test_food_refinement_3350.mjs`

Browser-typed regression (real 3350 UI over CDP, Node built-ins, no deps) driven against the live
rules fixtures:
- **8261** = chicken available (`refinement_data(with_chicken=True)`)
- **8262** = chicken absent (`refinement_data(with_chicken=False)`)

(both from `tools/run_food_refinement_fixture.py` — the real app + production serializer/session/CAS
seeded with `refinement_data`). The harness intercepts **all** `http://127.0.0.1:8250/*` requests
over CDP Fetch and **proxies** them to the dataset's fixture (sessions, `/health`, capabilities,
`/v1/client-config`, assistant GET/POST), answering OPTIONS locally; a POST is **never** continued
to the private 8250 app, and any non-3350/non-8250 origin is aborted/recorded. The browser loads
the unchanged 3350 build; only `GET /health` on the fixtures is read directly. No live model.

Exact typed journey per dataset (final text verbatim `tôi muốn ăn phở gà cơ`), asserting on the
**actual returned view** (not HTTP 200) and on rendered cards:
1. `tôi muốn ăn phở` before origin → 0 cards + a location prompt.
2. explicit origin via manual coords `21.02,105.83` → origin chosen; resumed phở search includes
   `beef`; available also `chicken`; decoys (`roll`/`snack`/`name_only`) never appear.
3. (extra) add `beef` to selection.
4. `tôi muốn ăn phở gà cơ` → origin preserved; stale `beef` cleared; no decoys; no mutation-deny;
   `profile.foods` includes `phở gà`; `provider.calls==0`; **available** → results `['chicken']`,
   status ok; **absent** → 0 cards, status `no_results`, reply mentions `phở gà`; `beef` selection
   preserved.

### Result — EXECUTED, 25/25 checks PASS (exit 0)

Ran `node qa/discovery-assistant/test_food_refinement_3350.mjs` against both fixtures. All 25
recorded checks passed; no browser exceptions; no unexpected remote origins; every 8250 request was
proxied (no POST continued to 8250). Sanitized evidence + 8 screenshots retained under
`docs/reports/food-refinement-3350/` (`browser-evidence.json`, `{available,absent}-{0-init,
1-before-origin,2-generic-pho,3-pho-ga}.png`). Evidence stores synthetic venue ids only — no
session id or token.

**Note (honest limitation):** the optional itinerary-confirmation extra did **not** form a
confirmation card — with a minimal profile the real rules returned a clarify-next-step reply
("Danh sách quán và các yêu cầu đã biết vẫn được giữ…"), which is valid behavior, so the
confirmation-invalidation **browser** assertion was skipped (recorded as a note, not a failure).
Backend `invalidate()` on a foods change is covered by Sol's unit tests and by the §2 review.

## 4. Honesty notes

- Private dataset has **0 phở gà** evidence (301 Đống Đa rows, 19 generic phở tag matches); the
  absent fixture models the honest no-data case — expected, not a failure.
- The incident's exact prior native tool arguments are **unverified** (private foods = dessert,
  5 cards, none chicken); they are **not** invented. The reproduced root cause is the
  `plan_requested` misroute, fixed in 5bb9cbb.
- No frontend production file was modified (none required per §2).

## 5. Files

- `qa/discovery-assistant/test_food_refinement_3350.mjs` — executed browser-typed regression
  (proxy to live fixtures 8261/8262; both datasets), 25/25 PASS.
- `docs/reports/food-refinement-3350/browser-evidence.json` + 8 screenshots — sanitized evidence.
- `docs/reports/FOOD_REFINEMENT_QA.md` — this report.
