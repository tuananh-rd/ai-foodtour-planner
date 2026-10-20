# Maps and GPS lifecycle QA

## Changes

- Maps requests are tied to session ID, token, revision, selected-origin identity and values, vehicle mode, and ordered stop IDs. Effect cleanup aborts the request; responses from a stale identity are ignored.
- Server URLs are accepted only when they use the allowed HTTPS Google Maps directions host/path, `api=1`, the expected travel mode, no more than three waypoints, and no more than 2048 encoded characters.
- Server `partial` and `unavailable` responses, skipped-stop reasons, and notes remain visible. A partial result uses only server-provided ordered segments; an unavailable or empty server result cannot fall back to a client route that could connect across missing legs. Client-generated links remain the fallback after a transport error.
- GPS work now has a request identity. Session resets invalidate pending callbacks and release the shared operation lock; success, denied/unavailable/timeout callbacks, synchronous errors, and revision/session changes are guarded against stale callbacks and duplicate completion.

## Verification

- `node qa/discovery-upgrade/test_maps_gps_lifecycle.mjs` — passed. Endpoint fetches are mocked; checks cover success, empty, error, partial response handling, response ordering, address URL acceptance, URL length/waypoint/mode limits, identity changes, abort signal forwarding, hook order, and GPS lock/source guards.
- `node qa/discovery-upgrade/test_discovery_upgrade_units.mjs` — 93 passed, 0 failed.
- `npm.cmd run build` from `frontend/` — exit code 0; optimized Next.js production build completed.
- No provider calls were made.

## Limitation

The focused test uses mocked endpoint calls and source-level lifecycle guards; it does not run a browser-rendered interaction suite. The build compiled the UI, but runtime hook behavior was not exercised in a browser during this task.
