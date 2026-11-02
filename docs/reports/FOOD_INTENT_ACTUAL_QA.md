# Lane 3350 Broader Food Intent — Independent User QA (RED + GREEN)

## Latest checkpoint — review COMPLETE; menu UI shipped and QA'd

The28 independent Claude checks below passed, but are **not28 matrix cells**: they include
13 origin-first variants, one origin-after and other workflow assertions. Full matrix coverage is
now established by preserved Claude evidence (28/28) **plus** the Sol integration supplement
(40/40, build aafedf64) — accepted here with the independent `aafedf6` affected review in §4 and
the matching-menu work in §7. Per coordinator, the whole matrix was **not** re-run.

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

Those 40 supplement checks were executed by Sol; the preserved Claude 28/28 are independent. The
independent affected review of `aafedf6` is **COMPLETE** and the supplement **ACCEPTED** (see §4);
the matching-menu source `72a1932` / `627395e` / `5cf329d` is **APPROVED** (see §7). The menu UI was
implemented by Claude and frozen at build **`4da7f28` (exit 0)**, then QA'd live: public menu 13/13
and the private journey 12 meaningful checks (one numeric dine-in-vs-delivery inequality assertion
was excluded by coordinator review as logically invalid — see §7). Per coordinator, combined
targeted tests tally **90**, plus **5** affected menu tests and **33** data tests (**1** skip),
with overlapping counts;
the whole matrix and the backend suites were **not** re-run. This report makes no claim that the
user has accepted 3350 or that live Gemini quality works.

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

## 4. Backend affected-review (read-only) — aafedf6, APPROVED

Independent review of the CURRENT fix `aafedf6` ("recognize literal food requests independently of
dish catalog"); earlier `067193f`/`5541059` are superseded context, not the focus.

- **food.py** — grammar-based literal food recognition independent of the dish catalog
  (`_REQUEST` request verbs + `_STOP` noun-phrase terminators, negation guard), so non-catalog
  dishes like "gà rán" are captured as the literal food. `needs_food_clarification` returns a
  truthful clarify (clearing stale results/pending) when a request has no parseable food and is not
  a general-venue search. A bare-dish guard keeps incidental dish mentions from silently changing
  the preference.
- **engine.py** — a `required_search` guarantee: a food/area request always yields a real
  `search_restaurants` even when the model returns no tool, hits the turn-call cap, is denied, or
  errors/times out, via `complete_required_search()` — a **separately authorized READ** (never a
  replay of denied mutations), so the selection-authority gate is not weakened
  (`denied_mutation_readonly_search`). Also: `knowledge_question` refinement, `foods` list CAS in
  `authorized`, plan-cue gating so a food/area request cannot misroute into `create_itinerary`, and
  an area-change-with-existing-foods search trigger.
- **state.py** — clears `plan_requested`/`pending_slot` on **foods OR area** change (fixes the
  stale-plan misroute for area changes too).
- **experience.py** — removes the unconditional "tour cũ cần xác nhận lại" old-tour copy (the RED
  defect); origin reply is now just "Đã chọn vị trí xuất phát. Khoảng cách đường chim bay đã cập
  nhật." Verified live before the lane reverted.
- No frontend change was required for the food-intent fix, and none was made there.
- **86** targeted backend tests PASS (recorded on `DISCOVERY_ASSISTANT_BOARD.md`; the historical
  "70" is superseded). Not re-run per instruction.

## 5. Limitations

- Rules/synthetic lane only; no live provider (not possible on this lane) — this validates intent
  routing/UI, not live model quality.
- RED is preserved from observation, not re-runnable (lane redeployed to the fixed build).
- Harness records transient per-item timeouts as UNTESTED (none in the final run); it is resilient
  so a single hiccup cannot abort the matrix.

## 7. Matching-menu integration (ShopeeFood delivery reference)

New user-approved scope: show a bounded per-venue delivery-menu reference. Contract (frozen):
`Restaurant.matching_menu: MenuReference[≤3]` where `MenuReference = {name, reference_price_vnd:
int|null, min_total_vnd: int|null, price_status: reference|quarantined|minimum_unknown,
mandatory_options: bool, price_channel: 'shopeefood_delivery', availability:
unknown|unavailable|source_available, source_fetched_at: str|null}`. Delivery reference — **never**
a dine-in price; no allergy/hour claims.

**Backend review (read-only) — `72a1932`, APPROVED.** `schemas.py` adds `MenuReference` (StrictModel)
and `Restaurant.matching_menu` (`max_length=3`) exactly per contract. `data/menu.py` loads the
bounded ShopeeFood archive: excludes contact/hotline rows, caps rows, honours only confirmed
venue mappings, quarantines anomalous prices (→ `reference_price_vnd: null`, `price_status:
quarantined`), computes mandatory-option minima (→ `minimum_unknown` when unverifiable), cross-checks
`min_total_vnd`, and derives `availability`. `tools.py` attaches `matching_menu(...)[:3]` to each
rendered restaurant for the current foods, with dish-tag fallback only for menu-less venues;
`matching_menu` is excluded from the LLM projection. Delivery references never reprice the venue's
dine-in price. **89** targeted backend tests PASS (`.venv/menu-targeted-tests.log`); not re-run.
`627395e` then uses the menu `min_total_vnd` as the delivery price filter (menu-backed venues kept
when a row's minimum ≤ cap, menu-less venues fall back to source range; menu-backed venues sorted
first), with a truthful disclaimer distinguishing delivery reference from dine-in price/fees.
`5cf329d` fixes the mandatory-option guard so a dish flagged mandatory with no actual mandatory
group resolves to `minimum_unknown`, and adds `tools/run_local_menu_qa.py` — a private QA launcher
that boots the app with `FOODTOUR_LLM=mock`, all provider/Maps keys blanked, geocoder off,
disposable session/budget DBs, and the private menu ZIP (no accounts/caps/ledgers). Reviewed and
APPROVED.

**Frontend (implemented, my scope).** Added a truthful `matching_menu` card to each restaurant
result in `DiscoveryLayout.jsx` (testids `menu-ref-<id>` / `menu-ref-<id>-<n>` /
`menu-ref-price-<id>-<n>`): per row shows the delivery reference price, the mandatory minimum (or
"Giá món tối thiểu chưa xác định"), a "cần chọn tuỳ chọn bắt buộc" flag, with a header + note stating it is
a ShopeeFood delivery reference, "không phải giá tại quán", and claims no price/hours/allergy at the
venue. Quarantined rows render "Giá chưa xác minh" (no fabricated price). Client formatters
`formatMenuReferencePrice` / `formatMenuMinimum` added to `frontend/lib/discoveryApi.js`; scoped
styles in `discovery-visual.css`. Names pass through `normalizeDisplayText` (no emoji).

**Menu QA (ready).** `qa/discovery-assistant/test_matching_menu_3350.mjs` — one bounded, targeted
browser test (real 3350 UI, direct 8250, no interception). It asserts, against the synthetic
`menu_data` (venue `fried0`): a 3-row menu card in menu order (reference `Gà rán phần thử` ~30.000 đ
giao hàng; quarantined `Gà rán giá lỗi` → "Giá chưa xác minh"; mandatory `Gà rán chọn sốt` → "Giá
món tối thiểu ~35.000 đ" + bắt buộc), the delivery disclaimer, the venue dine-in price unchanged, a
menu-less venue showing no card, and unknown→no_results→no cards. **Public menu QA — EXECUTED, 13/13 PASS (exit 0)** on `synthetic-menu-matrix` with 3350 serving
`4da7f28`. The `fried0` card shows the 3 rows in menu order (reference ~30.000 đ giao hàng;
quarantined → "Giá chưa xác minh", no fabricated price; mandatory → "Giá món tối thiểu ~35.000 đ" +
bắt buộc); the delivery disclaimer is present ("không phải giá tại quán", no allergy/hour); the
venue dine-in price is not repriced; a menu-less venue shows no card; unknown→no_results→no cards.
The exact phrase "tôi muốn ăn gà rán thiếu option" isolates and renders the `minimum_unknown` row
live ("Giá món tối thiểu chưa xác định"). At 390px the card has no horizontal overflow and the
composer stays reachable. Evidence: `docs/reports/matching-menu-3350/browser-evidence.json` +
screenshots.

**Private menu journey — EXECUTED; 12 meaningful checks accepted (exit 0)** via the Sol-safe
launcher (`run_local_menu_qa.py --port 8250`, mock LLM, keys blank, disposable DBs, private ZIP),
3350 on `4da7f28`. Flow: request typed before origin (prompt, 0 cards) → local gazetteer origin
chosen (no invented coords) → nonempty `matching_menu` card → add to tour → profile "…xe máy…" →
explicit confirmation → tour with **1 stop** → ordered **driving** Google Maps URL validated (api=1,
origin = profile.origin, waypoints+destination in stop order) → post-tour food change preserved
selection+origin and invalidated confirmation/tour. The captured historical evidence
(`.../private/private-evidence.json`) recorded 13 checks; on coordinator review the one numeric
"venue dine-in price ≠ any delivery reference" inequality assertion is **excluded as logically
invalid** (a dine-in price may legitimately coincide with a delivery reference; non-repricing is
proven by backend regression), leaving **12 meaningful checks accepted**. That assertion is removed
from the harness going forward; the historical evidence file is left unedited. Evidence is
**counts/booleans/status only** (2 menu venues, 6 reference rows, confirmed 1-stop tour, driving
Maps valid) — no venue names/ids/prices/URLs/screenshots written; raw menu stays in the gitignored
`.venv`. The original private ledger/session was untouched (mock lane, no live generation). No
app-Gemini quality is claimed.

## 6. Files

- `qa/discovery-assistant/test_food_intent_actual_3350.mjs` — executed acceptance harness (Claude
  28/28 PASS; Sol supplement 40/40 PASS on aafedf64).
- `qa/discovery-assistant/test_matching_menu_3350.mjs` — public menu card QA (13/13 PASS on
  `--menu`).
- `qa/discovery-assistant/test_matching_menu_private_3350.mjs` — one private menu journey
  (13/13 PASS; counts/booleans-only evidence).
- `frontend/app/components/v2/guided/DiscoveryLayout.jsx`, `frontend/lib/discoveryApi.js`,
  `frontend/app/components/v2/guided/discovery-visual.css` — matching_menu card UI + formatters +
  styles (frozen at commit `4da7f28`).
- `docs/reports/food-intent-actual-3350/` — `browser-evidence.json`, `red-prefix-evidence.json`,
  `sol-supplement/`, screenshots.
- `docs/reports/matching-menu-3350/browser-evidence.json` (+ screenshots) — public menu QA; and
  `.../private/private-evidence.json` — private journey (counts/booleans/status only).
- `docs/reports/FOOD_INTENT_ACTUAL_QA.md` — this report.
