# Broader food-intent rejection: diagnosis and acceptance

Date: 2026-11-02. Backend/integration: Sol. Independent frontend/user QA: Claude Opus4.8 medium.

## Rejected acceptance and reproduced defects

The preceding phở-only acceptance (`08c78b5`) did not establish general food-request coverage.
The user rejected3350 with: `chào bạn` → `tôi muốn ăn gà rán tại đống đa` → explicitly choose
local Đống Đa origin → `tôi muốn ăn gà rán`. The old backend acknowledged an area edit, then
returned generic help instead of searching. It also mentioned an old tour that did not exist.

Root causes in the previous source:

1. `food_intent` recognized a closed list of dish families. Unknown phrases were discarded;
   partially known ones could lose specificity. Thus gà rán never became a food preference.
2. `fallback` started a search largely from recognized food/dish keywords. The area-only patch
   produced an acknowledgement; no `pending_search` was created, so origin choice had no
   food search to resume. Repeating the unrecognized request reached generic help again.
3. Native preference-tool success was treated as sufficient completion. A model could update
   preferences and acknowledge without executing the separately requested read/search.
4. `location_action` unconditionally appended “tour cũ cần xác nhận lại” even for a fresh session.

RED evidence: new backend matrix ran 7 test methods with 14 failed assertions/subcases against
the old implementation. Claude also reproduced the failure by typing in actual3350 with direct
requests to an actual8250 rules API; no response interception or model calls were used.

## Implemented scope

Commit `aafedf6` separates request grammar from menu vocabulary. Explicit food requests capture
the literal noun phrase, including unknown dishes, and separate location/time/taste/safety
clauses. Bare known dish names remain shorthand; incidental knowledge/allergy mentions do not
silently replace the main food preference. Accent-free terms match tags accent-insensitively.

Every understood read request performs a search, obtains an origin and resumes that search, or
asks one specific missing-food question. Unknown literal foods produce no matching evidence;
they are not reduced to a generic family or broadened into unrelated venues. General explicit
venue discovery may intentionally omit a food filter. Dish-tag evidence remains mandatory for
food-filtered results; venue names alone cannot substantiate a dish.

Food/area changes clear stale result/comparison/planning intent, preserve origin/valid selected
locks, and invalidate confirmation/tour through the existing versioned contract. Native
preference acknowledgements cannot stand in for a required read; missing searches complete
locally without replaying mutations. Timeout/quota diagnostics retain their actual provenance.
No selection, allergy, explicit-confirmation, ID or CAS gate was loosened. Location copy no
longer invents a previous tour.

## Targeted backend verification

86 test methods PASS (exit0): food_intent_matrix, food_refinement, discovery, upgrade, protocol,
outage, address_chat. The new module has 9 methods including 28 matrix subcases:

| Requested food | Accents / no accents | Origin first / after request | Expected fixture result |
|---|---|---|---|
| phở gà | PASS / PASS | PASS / PASS | chicken0–2 only |
| phở bò | PASS / PASS | PASS / PASS | beef0–2 only |
| phở cuốn | PASS / PASS | PASS / PASS | roll0–2 only |
| gà rán | PASS / PASS | PASS / PASS | fried0–2 only in Đống Đa |
| bún chả | PASS / PASS | PASS / PASS | bun0–2 only |
| cơm | PASS / PASS | PASS / PASS | rice0–2 only |
| bánh thiên hà (unknown) | PASS / PASS | PASS / PASS | no_results; literal phrase retained |

Additional assertions: exact rejected transcript, food/area changes, selected lock preservation,
pending-search dump/restore, missing-food clarification, no invented old tour, exclusion of
incidental/allergy/knowledge mentions, native preference-only acknowledgement and native timeout
after acknowledgement. Native generation is mocked; it is not live Gemini quality evidence.

## Read-only private coverage and replay

Private records were inspected locally; only aggregate counts and booleans are reported.
Among301 Đống Đa rows, tag evidence counts are: phở gà0, phở bò0, phở cuốn0, gà rán11,
bún chả0, cơm68, unknown dish0. Across all loaded rows, gà rán98 and phở cuốn11.
Zero specific-tag coverage does not prove those dishes are unavailable in the real world.

Fresh in-memory exact replay retains gà rán, asks for origin, stores pending search, then returns
5 tag-supported results after local origin choice. Two restored incident states also return
5 tag-supported results on the repeated request, preserve origin/selection and avoid generic
acknowledgement. One legacy state had no food preference. No copied session was persisted, no
raw record/name/ID/GPS was exported, and provider calls were0.

## Runtime and independent acceptance

3350 temporarily uses actual8250 synthetic/rules (`synthetic-food-matrix`) to make direct browser
acceptance impossible to debit Gemini. All external provider keys are blank in that isolated
process; sessions/budget are temporary. The private session/ledger files and3320/8230 are preserved.
The synthetic matrix contains explicit compound dish tags, nearby public fixture coordinates and
synthetic all-week opening intervals, allowing a full selected-tour journey when validated.

Direct actual8250 API integration at `aafedf6` PASS: greeting → gà rán/Đống Đa → local origin
selection →3 matching results → compare A/B (2 venues) → explicitly select fried0/1/2 → chat
`Bắt đầu lúc 18h, tổng 180 phút, đi bộ, 2 người` → create confirmation (tour still null) →
explicit confirm → conditional3-stop tour → Maps endpoint `status:ok`,1 link. All assistant
responses report provider.calls0. This proves the fixture supports the full journey; it does not
substitute for Claude's independent typed UI acceptance.

Claude independently completed28 UI checks (13 food variants, one origin-after, compare/reload,
confirmation and3-stop tour/Maps CTA); Sol then completed40 integration supplement checks after
Claude coding usage was exhausted. Combined evidence covers28 food/accent/origin cells, actual
second-area change/selection preservation and rendered Maps URL origin/order/walking/length.
All executed final checks PASS; no frontend production change/build was required. Exact attribution
and evidence are in `FOOD_INTENT_ACTUAL_QA.md`.

Final independent review of current `aafedf6` and supplemental acceptance is **BLOCKED** by Claude
coding usage (CLI reset22:30 local). Automatic continue was cancelled, dispatch fenced/failed,
conversation/WIP retained. No credit/model switch was attempted. This is separate from app Gemini
limits; no complete independent acceptance or live conversation success is claimed.

Final read-only health after restoration: API8250 source`b22af8f` (includes backend`aafedf6`),
private dataset, original configured `gemini-3.5-flash-lite`, used15/18, remaining3/reserve3,
reset `2026-11-03T08:00:00Z`. App URL remains `http://127.0.0.1:3350`; private sessions are
preserved and historical messages are not rewritten.3320/8230 process owners are unchanged.
No live generation, cap/ledger reset, billing, push or deployment is authorized or performed.
