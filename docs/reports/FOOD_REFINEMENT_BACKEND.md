# Specific food refinement: backend diagnosis and verification

Date: 2026-11-02. Owner: Sol; independent affected review and browser QA: Claude.

## Reproduction and cause

Reported transcript: `tôi muốn ăn phở` → explicitly choose origin → `tôi muốn ăn phở gà cơ`.
The previous response denied a mutation and retained unrelated result cards. This is a functional
intent/search defect, not a wording issue.

Source diagnosis:

- The previous food parser reduced the specific phrase to the family `phở`. Native
  `update_preferences` with the specific phrase could then disagree with the server-authorized
  patch. Historical native function arguments were not retained, so that exact historical
  model call is not claimed as observed.
- Search expanded a generic dish through knowledge phrases and matched venue names as well as
  tags. A name/category match or nearby location did not establish chicken-phở menu evidence.
- An unchanged coarse food family retained prior results/comparison. Separately, an old
  `plan_requested` flag could divert a new food request into itinerary preparation. Replaying
  a copy of the reported session in memory exposed that stale planning path.
- A denied native mutation could become the final reply even though the food request separately
  authorized a read-only search.

## Implemented behavior

`discovery/food.py` retains specific phở variants and matches literal, bounded phrases inside
compound dish tags. Names, addresses and proximity cannot prove a menu item. `phở gà` does not
match `phở cuốn`, generic `phở`, snacks, or a chicken-phở venue name without supporting tags.
Knowledge display headings are normalized into search phrases rather than searched verbatim.

Food changes clear results/comparison/last-search, cancel stale planning intent and invalidate
confirmation/tour. Origin and valid selected locks remain intact. Pending searches awaiting an
origin retain their explicit price filter and use the new food preference. An unauthorized
native mutation remains denied; a separate authorized food search can still complete. Selection,
ID validation, explicit confirmation, allergy evidence and CAS checks remain enforced.

No-match responses retain the requested food and filters, state insufficient matching data, and
invite an explicit alternative. They never silently relax the request. A native model's final
sentence cannot replace the validated `no_results` reply with an availability claim.

## Evidence

- Commits `724c73a`, `5bb9cbb`, `067193f`, `5541059` contain implementation and synthetic regressions.
- The initial refinement regressions reproduced parser, matching and authorization failures;
  after the final changes, **70 targeted discovery/protocol/outage/upgrade tests passed**, including
  9 food-refinement tests. Command: `.venv/Scripts/python.exe -m unittest
  backend.tests.discovery.test_food_refinement backend.tests.discovery.test_discovery
  backend.tests.discovery.test_upgrade backend.tests.discovery.test_protocol
  backend.tests.discovery.test_outage -q` with `PYTHONPATH=backend`; exit 0.
- Rules tests cover the exact transcript, origin preservation, locked selection, stale
  comparison/confirmation/tour, and both available/missing chicken datasets.
- Native mocked function-call tests cover a specific preference plus broad search, text without
  a required search, stale/denied selection, and denied preference followed by explanation.
  They inspect actual server tool results and unchanged selection, not merely HTTP status.
- A read-only private-data scan found 301 rows in the selected district, 19 with generic
  phở-tag evidence, and **zero with phở-gà-tag evidence in the entire loaded dataset**.
  These are coverage counts, not proof of restaurant menus outside this dataset.
- An in-memory replay using that private snapshot returned `no_results`, preserved specific
  food/origin/selection, cleared comparison and avoided the authorization-denial response.
  It made zero provider calls and did not persist the copied session.

Browser verification uses the running 3350 UI with every API request redirected to isolated
real FastAPI rules instances over explicit synthetic data on 8261/8262. Each has temporary
session/budget storage, no private environment, disabled external providers and no real account
data. Browser results and affected review are recorded separately in `FOOD_REFINEMENT_QA.md`.

## Runtime and remaining limitation

Before integration, read-only health on 8250 showed used 15 of 18, remaining 3, reserve 3.
No Gemini/Tavily requests, ledger resets, retries, cap changes or paid operations are authorized
or performed for this fix. Native tests are mocked; they do not prove live Gemini conversation
quality. Current private data cannot substantiate a chicken-phở result and must report no match.

Integration and final browser settlement are pending at this checkpoint. The existing 3320/8230
lane and private session/ledger files are preserved.
