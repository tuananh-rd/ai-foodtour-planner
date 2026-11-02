# Local menu integration and resumed acceptance

Date: 2026-11-02. Sol: backend/data/runtime/integration. Claude Opus4.8 medium: frontend/QA/review.

## Scope and privacy

The user approved a local12-venue menu archive and delivery-channel prices as references.
No scraping, live Gemini/Tavily generation, credits, caps/ledger resets, billing, push or deployment.
Raw archive and private derived evidence remain ignored under `.venv/`; public artifacts contain
synthetic fixtures or aggregate counts only. No menu dataset, contact details, source venue IDs,
precise private coordinates or private screenshots are committed.

`tools/import_local_menu.py` validates the archive against the existing catalog and confirmed
source mapping, then retains a local-only copy. The original source is not modified. Six of the
12 confirmed venues were absent from the older1702-row catalog: they are added using explicit
confirmed mapping/name/address/valid Hanoi coordinates, with unknown hours and prices retained.
They are not linked by fuzzy restaurant-name inference. The resulting catalog has1708 venues.

## Source and semantics

Backend commits: `72a1932`, `627395e`, `5cf329d`.

- 535 canonical dishes,559 group links,3239 option rows,12 linked venues.
- 2 hotline/contact rows excluded from food/menu output;533 menu rows retained.
- 4 anomalous/conflicting/unverified prices quarantined (null price/minimum), without silently
 deleting the underlying food evidence.4 minimums remain unverified.
- Mandatory option minima are recomputed from required groups/min_select and known surcharges;
 missing groups/prices/conflicting minima remain unknown. Optional extras never inflate the minimum.
 Of183 rows marked mandatory,180 have a known non-quarantined minimum; the others stay unknown.
- Delivery reference/base and minimum including mandatory options are separate fields. They never
 overwrite a venue range or become dine-in/per-person/planner-budget evidence. Delivery fees,
 ingredients/allergy safety, current availability and opening hours are not inferred.
- A source-reported unavailable item is not offered as matching food. Source availability is not
 a claim the venue is operating now.
- Search uses literal menu-name evidence for venues with menus, falling back to coarse dish tags
 only for venues without menus. Phone/contact rows and venue names cannot substantiate a dish.
 Menu-supported venues are preferred before the bounded five-result cap, then distances use
 the selected origin. `matching_menu` returns at most3 relevant items per restaurant.
- A menu price filter uses known minimum including mandatory options. Unknown/quarantined prices
 cannot establish affordability. Venues without menu evidence retain explicit venue-range caveats.
- Menu records are excluded from model tool projections. No dataset is sent to a provider.

## Verification so far

90 targeted discovery/menu/protocol/outage/address tests PASS, exit0; after the final missing-group
guard, the5 affected menu tests PASS. Counts overlap and are not advertised as95 unique tests.
33 affected loader/evidence/metadata tests PASS with1 existing private-fixture skip, exit0.
The archive importer linked all12 venues; aggregate-only reports show the counts above.

Read-only/in-memory replay of the actual private sample (no session persistence/provider):

| Request | Menu venues | Matching menu rows |
|---|---:|---:|
| gà rán |2|4|
| cơm |7|40|
| phở gà/phở bò/phở cuốn/bún chả/unknown test dish |0|0|

This is coverage within the approved sample, not real-world absence. Actual menu replay:
food request → origin prompt → explicitly selected origin → matching-menu result → selected venue
→ explicit confirmation → conditional1-stop tour → ordered free Maps link. Unknown dish then
returns zero results while preserving origin/selection and invalidating confirmation.
All provider calls0; original private session and budget files untouched.

## Resume and pending acceptance

Restored3350 web and8250 API from connection-refused state; private health confirmed HEAD5e792bc,
configured model unchanged and budget15/18/reserve3. Claude `/usage` showed3% session/15% week,
usage credits off; the same exact existing conversation resumed via retry `ctx_554791af0e7b`.
Its turn-start receipt was unobserved, but actual current-task transcript/read-only review proved
execution. Claude independently approved `aafedf6` and the prior preserved28+40 evidence; valid
suites were not rerun simply because the session resumed.

Independent affected review of `aafedf6` and menu commits `72a1932`/`627395e`/`5cf329d` is APPROVED.
UI commit `4da7f28` was built once in an isolated snapshot, exit0. Public actual3350→8250 menu
QA:13/13 PASS, including reference/quarantine/mandatory/unknown-minimum rendering, tag-only
fallback, no-data and390px no-overflow/composer. Sol independently inspected the synthetic
desktop/mobile captures. Four menu formatter checks also passed.

Claude's private actual3350→8250 UI journey completed: request before origin → selected local
origin →2 menu-supported result venues → selected1 venue → explicit confirmation →1-stop tour
→ ordered driving Maps matching actual origin/stops. After changing food, selection/origin remain
and old tour/confirmation are invalidated. Public evidence contains counts/booleans only.
The historical capture records13 assertions; coordinator review excludes1 invalid numerical
inequality assertion (coincidentally equal venue/menu prices do not establish repricing), leaving
**12 meaningful private UI checks accepted**. No passed journey was rerun solely for this cleanup.
Menu-price separation is established by backend tests and source review, not numeric inequality.

Sol separately verified the actual private rules API: literal unknown dish produces `no_results`,
zero cards, preserved origin/selected venue and no confirmation; changing area to Cầu Giấy retains
that no-data outcome and the same selected venue/origin. This supplement is API integration
evidence, not additional independent UI coverage. Every provider call count is0.

3350 now serves UI snapshot`4da7f28`;8250 restored original private/configured mode with source
`920f4d8`, same session namespace and installed archive. Read-only health: original model
`gemini-3.5-flash-lite`, used15/18, remaining3/reserve3, session cap6. Dataset version was compared
against the local menu-enabled loader and matches, proving all12 menu venues are active in the
restored runtime.3320/8230 process owners remain unchanged. Private sessions/ledger are preserved.

No live Gemini generation was authorized or performed. Remaining3 equals reserve3, so configured
health is not live conversation proof; whole-app/live-model acceptance is not claimed. Private
journey coverage is1 selected stop; the preserved synthetic journey proves3 ordered stops.
No data, hours, ingredients or affordability were invented to force a larger private tour.

