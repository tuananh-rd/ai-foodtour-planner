# Lane 3350 Broader Food Intent — Independent User QA (RED + GREEN)

## Latest integration checkpoint — review BLOCKED

The28 independent Claude checks below passed, but are **not28 matrix cells**: they include
13 origin-first variants, one origin-after and other workflow assertions. The final independent
task `task_d3bf55bec179` / `ctx_691492b03dda` stopped at the Claude coding usage limit before
reviewing the current backend diff `aafedf6` or completing its supplements. Automatic continue
was cancelled; the dispatch was fenced/failed and its conversation/WIP retained. No credit,
model switch or new provider allowance was used. CLI displayed next reset22:30 local.

After that editor stopped, Sol completed only integration-harness work and ran
`QA_SUPPLEMENT=1` with a separate evidence directory: **40/40 PASS,0 FAIL,0 UNTESTED, exit0**.
Evidence: `food-intent-actual-3350/sol-supplement/browser-evidence.json`.

- Added the missing unknown ASCII origin-first case plus all14 origin-after cases over7 foods
  ×2 accent forms. Each starts without origin/with0 cards, asks for location, then explicitly
  chooses local Đống Đa and checks exact result IDs/status/literal food. Combined with preserved
  Claude evidence this covers28 food/accent/origin cells. Explicit Đống Đa filters gà rán to
  fried0/1/2; unknown remains a full literal phrase with no_results.
- Actual UI selected beef0, changed food to gà rán, changed area to Hai Bà Trưng, and verified
  exactly fried_hbt plus unchanged selected beef0.
- Actual UI created/confirmed another3-stop tour. The visible Maps anchor href was parsed:
  Google HTTPS dir/api=1, actual profile origin, walking, ordered waypoint/destination coordinates
  matching returned tour stops, URL≤2048. No Google navigation/API call occurred.
- Existing passed comparison/reload/API-proof sections were not re-run. The full tour was run
  again only to obtain and validate its real rendered URL. Supplemental screenshots are synthetic.

**These40 checks were executed by Sol, not Claude. Final independent affected review of
`aafedf6` and acceptance of this supplement remain BLOCKED by Claude usage. This report is not
a claim that the user has accepted3350 or that live Gemini works.** Backend targeted count is
**86**, not the historical70 quoted below. Final harness treats UNTESTED as a non-success exit.

3350/API8250 was restored to original private-data/session/config mode after isolated QA;
private sessions/ledger and3320/8230 were preserved. See `FOOD_INTENT_BACKEND.md` for final health.

Owner: Claude (frontend/QA, claude-opus-4-8). Backend/runtime: Sol.
Date: 2026-11-02. Rules/synthetic lane only — no live provider (impossible on this lane), no
ledger/cap reset, no env change, no backend/frontend production edit.

## 1. Scope & method

Independent acceptance of broader food intent on the REAL 3350 UI, with the browser typing into
3350 and fetching **8250 directly** (NO CDP Fetch interception, NO mock). Responses are only
OBSERVED (read-only `Network.getResponseBody`). The harness refuses to submit chat unless 8250 is a
rules-only synthetic lane (guard on `/health`), so the live Gemini reserve can never be consumed.
Harness: `qa/discovery-assistant/test_food_intent_actual_3350.mjs` (Node built-ins, no deps).

The 8250 lane was reconfigured by Sol during the task to isolated rules/synthetic
(`tools/run_food_refinement_fixture.py`), then a fix was deployed mid-run. Captures below are
labelled by build.

## 2. RED — pre-fix rejection (preserved, no longer reproducible)

Baseline build (per coordinator): **08c78b5**. Captured verbatim and preserved in
`docs/reports/food-intent-actual-3350/red-prefix-evidence.json`. Sequence: greeting →
"tôi muốn ăn gà rán tại đống đa" → local Đống Đa origin → "tôi muốn ăn gà rán".

- **Dropped specific intent → generic ack.** "gà rán" was dropped by the parser; the turn returned
  `status: ok` with 0 cards and a generic acknowledgement ("Đã ghi nhận phần bạn vừa sửa…" /
  "Mình có thể giúp khám phá món…") instead of a real search / `no_results`.
- **Unconditional old-tour copy.** After the origin change the reply appended
  "…đã cập nhật; **tour cũ cần xác nhận lại**" although no tour ever existed — driven by
  `State.invalidate()` setting `tour_stale=True` on any profile patch regardless of a tour.

Both are backend defects (reply text + parser + `tour_stale` semantics); the frontend renders reply
text verbatim and gates its own tour UI on `view.tour`/`editingSelectionAfterTour`, so **no frontend
production change is warranted**. The pre-fix lane was redeployed, so RED is no longer live-
reproducible; the transcript is retained as evidence.

## 3. GREEN — post-fix acceptance (build aafedf64, dataset synthetic-food-matrix)

Executed `node qa/discovery-assistant/test_food_intent_actual_3350.mjs` against the live lane.
**Real run exit: 0. 28/28 checks PASS (0 FAIL, 0 UNTESTED).**

Exact-ID matrix (origin set first; both accented and unaccented variants give identical id sets;
each dish returns ONLY its own venues — no cross-match, no decoys):

| Intent | status | exact venue ids |
| --- | --- | --- |
| phở gà / pho ga | ok | chicken0, chicken1, chicken2 |
| phở bò / pho bo | ok | beef0, beef1, beef2 |
| phở cuốn / pho cuon | ok | roll0, roll1, roll2 |
| gà rán / ga ran | ok | fried0, fried1, fried2, fried_hbt |
| bún chả / bun cha | ok | bun0, bun1, bun2 |
| cơm / com | ok | rice0, rice1, rice2 |
| unknown ("món lạ xyzqwer") | no_results | (none) |

Additional PASS checks:
- **origin before/after**: dish before origin → 0 cards + location prompt; origin-after resumes to
  the exact beef ids.
- **food + area change**: a new dish clears the old dish's cards and swaps to the exact new ids;
  "ở Đống Đa" filters to a non-vacuous subset with no decoys.
- **compare**: selecting beef0 + beef1 and running compare renders `discovery-comparison-view` with
  exactly those two venues.
- **reload / session restore**: after a page reload, origin (chosen) and the selected beef0 persist,
  with no message replay.
- **full journey**: select beef0/1/2 → profile context "Bắt đầu lúc 18h, tổng 180 phút, đi bộ, 2
  người" (selection preserved) → explicit confirmation gate → confirm → tour with **3 ordered
  stops** → **Google Maps CTA** rendered.
- **direct-API tour proof** (supporting): confirmation → 3 stops → maps-links `status: ok`, 1
  ordered link.
- no unexpected remote origins; no browser exception; no live generation (budget null).

RED defects verified fixed on aafedf64: "gà rán" now searches (fried0/1/2/fried_hbt); the origin
reply is "Đã chọn vị trí xuất phát. Khoảng cách đường chim bay đã cập nhật." with **no** old-tour
copy.

Evidence: `docs/reports/food-intent-actual-3350/browser-evidence.json` + screenshots
(`green-reload-restore.png`, `green-before-plan.png`, `green-tour-maps.png`). Synthetic venue
ids/text only; no session id, token, GPS, or private records exported.

## 4. Backend affected-review (read-only)

- The RED defects are backend-owned (parser dropping specific dishes; generic-ack replies;
  `tour_stale`/old-tour copy). The frontend needed no change and none was made.
- Prior-dispatch review of `067193f` (canonical dish-intent labels so editorial headings never
  become search phrases) and `5541059` (a model sentence cannot overwrite a `no_results` reply into
  an availability claim) stands — APPROVED.
- Build aafedf64 ("synthetic-food-matrix") adds the general parser + expanded fixture; behaviour is
  verified green above. The 70 targeted backend tests already PASS (per coordinator) and were **not**
  re-run.

## 5. Limitations

- Rules/synthetic lane only; no live provider (not possible on this lane) — this validates intent
  routing/UI, not live model quality.
- RED is preserved from observation, not re-runnable (lane redeployed to the fixed build).
- Harness records transient per-item timeouts as UNTESTED (none in the final run); it is resilient
  so a single hiccup cannot abort the matrix.

## 6. Files

- `qa/discovery-assistant/test_food_intent_actual_3350.mjs` — executed acceptance harness (28/28
  PASS, exit 0).
- `docs/reports/food-intent-actual-3350/` — `browser-evidence.json`, `red-prefix-evidence.json`,
  3 sanitized screenshots.
- `docs/reports/FOOD_INTENT_ACTUAL_QA.md` — this report.
