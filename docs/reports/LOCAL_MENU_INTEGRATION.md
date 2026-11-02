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

8250 is temporarily an isolated rules/synthetic API for direct browser QA. Private sessions and
ledger are preserved. Pending: menu UI build, independent affected review of menu integration,
actual browser synthetic/private menu journey, final restoration of private/configured mode,
and concise final checkpoint. Rules evidence will not be called whole-app/live Gemini acceptance.

