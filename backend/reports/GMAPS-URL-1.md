# GMAPS-URL-1 evidence

Base: `git merge foodtour-claude-coordinator` fast-forwarded from `aaa67d2` to
`8535304`, including frozen contract v1.7 and R0-7. Reviewer: Claude; review
and coordinator integration are pending. No remote publishing or provider calls.

## Implementation

- Pure `backend/app/planner/maps_url.py` uses standard URL encoding and URL
  assembly, coordinate-first points (six decimals), normalized address fallback,
  ordered mobile-compatible splitting, encoded length checks and explicit gaps.
- Session-token-protected GET maps-links endpoint returns typed responses and
  `409 no_tour` for absent/empty tours. It preserves tour, preferences, revision
  and expiry, with normal authentication/rate accounting and no-store headers.
- SQLite reads previously rebuilt tours through routing. The new optional
  `restore_tour=False` path restores only saved stop identities/order, retaining
  dataset-version invalidation and avoiding routing, validation and explanations.
  Default restoration for existing callers remains covered by the full suite.
- Canonical OpenAPI is `contracts/v1/openapi.json` (the existing exporter target).
  Seven labeled synthetic fixture cases cover walking, driving, mobile splitting,
  address fallback, partial gaps, unavailable and length-based splitting.
- Added only the Maps URLs section to `docs/RUNNING.md`, with Google's official
  source, privacy, client limits, no key/billing and schedule caveats.

## Fail-before proof

Production was unchanged at `8535304` when the initial seven acceptance tests ran:

```text
PYTHONPATH=backend .venv/Scripts/python.exe -m unittest backend.tests.api.test_maps_links -v
ModuleNotFoundError: No module named 'app.planner.maps_url'
test_auth_no_tour_readonly_and_no_providers: AssertionError: 404 != 401
test_sqlite_restore_does_not_replan_or_change_persisted_tour: AssertionError: 404 != 200
Ran 7 tests in 0.130s
FAILED (failures=2, errors=35)
```

Errors include parameterized coordinate/mode/count subcases. The test client is
entered before blocking socket.connect, because Windows asyncio creates a local
socket pair when its event loop starts; all endpoint requests under the patch
still reject any attempted socket connection.

## Pass-after verification

```text
PYTHONPATH=backend .venv/Scripts/python.exe -m unittest backend.tests.api.test_maps_links -v
Ran 9 tests
OK

.venv/Scripts/python.exe scripts/run_unittests.py
Full suite exit: 0
Ran 279 tests in 35.220s
OK (skipped=1)

.venv/Scripts/python.exe tools/export_openapi.py --check
OpenAPI matches server schema

git diff --check
No whitespace errors
```

Acceptance inspects URLs only: Vietnamese/special encoding, address normalization
and cap, invalid/missing coordinates, missing points, coordinate precedence,
walking/driving, 1..12 stops, repeated joins, three-waypoint cap, shrinking long
links, oversized pairs, api=1, absent dir_action, privacy notes, schema/fixture
parity, token checks, absent/empty tour, read-only state and no outbound sockets.
SQLite tests also forbid planner rebuild calls and compare persisted session
fields before/after GET. The single skip is the existing absent-private-dataset
legacy case; no new tests are skipped.

## Limitations and explicit edge behavior

- URL generation does not verify venue locations, Google address interpretation,
  route availability, travel times, distances or live Google client behavior.
  Some Google clients ignore waypoints; the UI must show notes and the app's
  proposed schedule. No API keys, Google billing or service setup is involved.
- Missing points break contiguous runs. A singleton usable run gets an explicitly
  disclosed same-origin/destination link; it does not imply a route across a gap.
  Oversized adjacent pairs list their affected stops as url_too_long and restart
  after the gap; unavailable means no link can be built.
- SQLite still reads its local venue snapshot and expires/rate-counts sessions;
  changed dataset versions retain the existing invalidation behavior (no_tour).
