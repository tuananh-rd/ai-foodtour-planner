# GMAPS-URL-2 QA & Integration Report

## Executive Summary
- Implemented Free Google Maps URLs itinerary export for UI_V2 adhering strictly to Contract v1.7 and Task GMAPS-URL-2 specifications.
- Developed `MapsLinksBlock` component, added `getMapsLinks` client in `frontend/lib/api.js` serving synthetic fixtures in mock mode, integrated segmented walking/driving toggle with >= 44px touch targets, honest partial/unavailable rendering, privacy and schedule proposal disclaimers, and StatusQueue single-banner error handling with accessible retry button.
- Verified against production scratch builds using real browser CDP across ports 13170/9370; executed unit, component, token, and integration suites with 100% pass rates (contractTest 17/17, test_components 31/31, test_ui_kit 11/11, test_ui_v2 23/23, test_maps_links_cdp 33/33) and proven fail-before evidence on commit 554a548.

---

## Contract v1.7 Adherence Checklist
- [x] **URL Shape:** Starts with `https://www.google.com/maps/dir/`, query param `api=1` always present, `dir_action=navigate` is never used.
- [x] **Zero API / Key / Google calls:** Pure URL string generation. Zero Google Maps JavaScript SDK, Embed API, tiles, or backend Google calls. Intercepted network requests to `google.*` / `gstatic.*` confirmed at exactly 0.
- [x] **Browser navigation:** Browser navigates ONLY when the user clicks an `<a>` link (`target="_blank"`, `rel="noopener noreferrer"`). No automatic navigation, no automatic `window.open`.
- [x] **Single Link Presentation:** When `links.length === 1`, renders primary button "Xem lịch trình trên Google Maps" with min-height >= 44px.
- [x] **Split Links Presentation:** When `links.length > 1`, renders ordered list of links with format `Chặng i/n: <from> → <to>` (from = origin label or stop name, to = stop name).
- [x] **Segmented Toggle:** Walking / Driving toggle with touch targets >= 44px. Default is walking. Toggling switches mode and updates `travelmode` in generated URLs.
- [x] **Honest Feasibility & Gap Rendering:**
  - `status === 'partial'`: Displays honest warning banner ("Một số quán chưa có toạ độ nên không đưa vào liên kết") and preserves available links for contiguous runs.
  - `status === 'unavailable'`: Displays honest notice ("Không thể tạo liên kết bản đồ...") with zero links.
  - Non-success tours (`no_solution`, `insufficient_evidence`): Block is completely hidden.
- [x] **Disclaimers & Notes:**
  - Privacy note: "Links contain the origin/venue coordinates or fallback addresses and are sent to Google only when the user opens them."
  - Schedule proposal: "Thứ tự theo gợi ý của ứng dụng; Google có thể hiển thị thời gian khác."
  - Zero claims of Google times or distances.
- [x] **Limits Enforcement:** At most 3 waypoints per URL, URL length <= 2,048 chars.
- [x] **Generation Guard & Session Reset:** Stale asynchronous responses ignored; maps block resets with session.
- [x] **Error Handling:** Network or server errors report to StatusQueue with an accessible Retry button (not an object).
- [x] **Flag-off layout:** Flag-off (V1) layout remains completely untouched.

---

## Test Results

### 1. Real-Browser CDP Suite (`qa/e2e/test_maps_links_cdp.mjs`)
- Executed against production scratch build on port 13170 with headless Edge/Chrome CDP on port 9370.
- **33/33 tests passed:**
  1. `TC-MAPS-HIDDEN-INIT`: Maps block hidden before tour is planned.
  2. `TC-MAPS-NO-GOOGLE-INIT`: Zero requests sent to `google.*` on initial load.
  3. `TC-MAPS-MOUNTED`: Maps block mounted after tour exists with stops.
  4. `TC-MAPS-LINK-ATTRS`: Primary link has `target="_blank"` and `rel="noopener noreferrer"`.
  5. `TC-MAPS-PRIMARY-TEXT`: Single link renders primary label "Xem lịch trình trên Google Maps".
  6. `TC-MAPS-URL-SHAPE`: URL starts with `https://www.google.com/maps/dir/` and contains `api=1`.
  7. `TC-MAPS-NO-DIR-ACTION`: URL does NOT contain `dir_action=navigate`.
  8. `TC-MAPS-TRAVELMODE-DEFAULT`: Default travelmode is walking.
  9. `TC-MAPS-LIMITS-WAYPOINTS`: URL has at most 3 waypoints.
  10. `TC-MAPS-LIMITS-LENGTH`: Encoded URL length <= 2048 chars.
  11. `TC-MAPS-ORDER`: Waypoints preserve stop order.
  12. `TC-MAPS-TOGGLE-STATE-INIT`: Walking radio is initially checked (`aria-checked="true"`).
  13. `TC-MAPS-TOGGLE-DRIVING`: Mode toggle changes travelmode to driving.
  14. `TC-MAPS-TOGGLE-WALKING-RESTORE`: Mode toggle restores travelmode to walking.
  15. `TC-MAPS-TOUCH-44PX`: Toggle buttons and Primary Maps button satisfy touch target >= 44px.
  16. `TC-MAPS-VIEWPORT-REACHABLE`: Primary Maps button inside viewport (< 844px) at 390px.
  17. `TC-MAPS-KEYBOARD-FOCUS`: Toggle buttons receive keyboard focus.
  18. `TC-MAPS-NO-AUTO-OPEN`: `window.open` not called automatically during load, planning, or toggling.
  19. `TC-MAPS-NO-GOOGLE-REQUESTS`: Network interception confirms zero requests made to `google.*` / `gstatic.*`.
  20. `TC-MAPS-PRIVACY-NOTE`: Privacy note rendered.
  21. `TC-MAPS-PROPOSAL-NOTE`: Schedule proposal note rendered.
  22. `TC-MAPS-NO-GOOGLE-ESTIMATES`: Block never claims Google duration or distance.
  23. `TC-MAPS-SPLIT-COUNT`: Split case renders n > 1 links in order (Chặng 1/3, 2/3, 3/3).
  24. `TC-MAPS-SPLIT-FORMAT`: Split links follow format `Chặng i/n: <from> → <to>`.
  25. `TC-MAPS-SPLIT-ATTRS`: Every leg link preserves `target="_blank"` and `rel="noopener noreferrer"`.
  26. `TC-MAPS-PARTIAL-BANNER`: Partial status renders honest disclosure.
  27. `TC-MAPS-PARTIAL-LINKS`: Partial status preserves available links for contiguous usable runs.
  28. `TC-MAPS-UNAVAILABLE-BANNER`: Unavailable status renders honest notice without links.
  29. `TC-MAPS-UNAVAILABLE-ZERO-LINKS`: Unavailable status renders exactly 0 `<a>` maps links.
  30. `TC-MAPS-STALE-GUARD`: Generation guard preserves active mode without stale overwrite.
  31. `TC-MAPS-RESET-SESSION`: Maps block resets and hides when session is reset.
  32. `TC-MAPS-MUTATION-REL`: Mutation proof: removal of `rel="noopener noreferrer"` detected as failure.
  33. `TC-MAPS-MUTATION-ORDER`: Mutation proof: swapped waypoint order detected as failure.

### 2. Fail-Before Proof (`qa/e2e/test_maps_links_cdp.mjs --fail-before`)
- Target: Commit `554a548:frontend` (clean extraction into temporary scratch build).
- Result:
  `❌ FAIL [FB-GMAPS-EXISTS] Pre-change code contains MapsLinksBlock -> Maps block NOT present on 554a548 as expected`
  Exit Code: 0 (proof successful).

### 3. Component DOM & Accessibility Suite (`qa/e2e/test_components.mjs`)
- **31/31 tests passed** (including 7 dedicated tests for `MapsLinksBlock`: hidden for non-success tours, single link primary button attributes, segmented toggle touch targets >= 44px, split links format, partial status disclosure, unavailable status notice, and privacy/schedule proposal disclaimers).

### 4. Design Tokens & Base Components Suite (`qa/e2e/test_ui_kit.mjs`)
- **11/11 tests passed** (tokens, contrast >= 4.5:1, touch targets >= 44px at 390px and 1280px, tabular numbers, StatusQueue single banner guarantee).

### 5. UI_V2 Real-Browser CDP Acceptance Suite (`qa/e2e/test_ui_v2.mjs`)
- **23/23 tests passed** (viewport positioning, jargon purge, one-tap chips, focus ring, StopCard top < 844px, ratings formatting, mutation tests, flag-off presentation rollback).

### 6. API Client & Contract Invariant Suite (`frontend/lib/contractTest.js`)
- **17/17 tests passed** (including Test 16: mock mode Free Google Maps URLs contract v1.7, 409 `no_tour`, limits, travelmode, and Test 17: real mode error propagation).

---

## Limitations & Scope Boundaries
1. **URL-only export:** The application only constructs and exposes Google Maps URL links. It does not provide in-app turn-by-turn navigation or real-time traffic data, which requires users to open the links in the Google Maps app or web browser.
2. **Third-party routing differences:** The application's walking/driving route proposals are based on local graph estimations; Google Maps may choose different paths, departure intervals, or estimated arrival times based on real-time traffic conditions. This is clearly disclosed to users.
3. **Review assignment:** Frontend and browser QA implementation is ready for independent review by Codex per AGENTS.md rules.
