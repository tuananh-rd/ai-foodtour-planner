# Codex independent review: GMAPS-URL-2

Decision: **REQUEST CHANGES**. Reviewer: Codex. Reviewed commit: `6027bdf7148613a044ec4839a3e3a1610c2041ce`, after the requested fast-forward merge of `foodtour-claude-coordinator` to `27b286e`. Reference: contract v1.7 and the GMAPS-REVIEW acceptance list. This review changes only this report; implementation fixes remain with Antigravity.

## Findings

### HIGH H1 — Untrusted destinations render as Google Maps links

Locations: `frontend/app/components/v2/MapsLinksBlock.jsx:357,409`; `frontend/lib/api.js:1266,1301`.

Both anchor branches use the response URL directly without checking protocol, host or path. In the production scratch browser, the following hostile synthetic response URLs all rendered unchanged under the Google Maps label:

- `https://evil.example/maps/dir/?api=1`
- `http://www.google.com/maps/dir/?api=1`
- `https://www.google.com.evil.example/maps/dir/`
- `https://www.google.com/other/`

Reproduce after planning a tour at `/?ui=v2`: set `window.__MOCK_NEXT_MAPS_LINKS = {status:'ok', links:[{index:1,of:1,url:'https://evil.example/maps/dir/?api=1'}],notes:[]}`, then click the driving toggle. Inspect `[data-maps-link]`: its href is the hostile URL. No link was clicked during review. This permits misleading outbound destinations; `rel` does not validate the destination.

The `javascript:alert(1)` probe also rendered an anchor, but React 19 replaced its href with `javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')`. This is evidence of React protection, **not demonstrated script execution** or application allowlisting. Reject unsafe URLs before rendering either anchor branch; require HTTPS, exact `www.google.com` host and `/maps/dir/` path, reject credentials/nonstandard ports, preserve each accepted URL verbatim and disclose rejected links. Add hostile single/split response tests.

### MEDIUM M1 — Error banner is cleared automatically; Retry cannot be used

Locations: `MapsLinksBlock.jsx:53-57,87-108,112-130`; interacting dependency: `frontend/app/ui/StatusQueue.js:121-129`.

In the scratch browser, set `window.__MOCK_NEXT_MAPS_LINKS_ERROR={message:'SYNTHETIC failure'}` and click the driving toggle from walking. After 150 ms, querying `[role="alert"]` returned no banner and no buttons; links had recovered without a Retry click. The review attempted to locate/click `Thử lại`, but there was no button, so this is **not** a successful Retry test.

Cause from source: enqueuing the error updates the provider's `activeBanner`/`queueCount`, recreating its `dismiss` and `enqueue` functions. The component's reset effect depends on `dismiss`, so queue changes trigger session-reset behavior (clear data, reset walking, dismiss the error), while its fetch effect also depends on these changing callbacks. Queue activity can therefore reset/refetch the component without a session change. A persistent backend failure risks repeated requests; persistent-failure request counts were not measured here.

Keep queue callbacks stable or avoid treating their identity as session changes. Verify an error remains visible, exactly one actual HTML Retry button is keyboard usable and >=44px, and only user retry or a relevant state transition restarts the failed request.

### MEDIUM M2 — Partial/unavailable explanations can be false; server notes are discarded

Locations: `MapsLinksBlock.jsx:137-140,285-347,439-470`.

The component never reads `mapsData.notes` or `skipped[].reason`. Reproduce with a partial response containing one valid link, `skipped:[{stop_order:2,reason:'url_too_long'}]`, and `notes:['SYNTHETIC: address exceeds URL limit']`. The browser instead said the venue lacks coordinates and omitted the supplied explanation. An unavailable response caused by the encoded URL limit is similarly described as lacking coordinates or a valid address. Contract v1.7 explicitly allows address fallback and `url_too_long`; missing coordinates alone is not the general cause.

Render server explanations as escaped text, or accurately translate the reason codes with a neutral fallback. Preserve the privacy/proposal disclosure and avoid suggesting all gaps mean missing coordinates. Cover URL-length gaps and unavailable cases, not only `no_usable_point` fixtures.

### MEDIUM M3 — Passing suite does not establish order mutations or asynchronous guards

Locations: `qa/e2e/test_maps_links_cdp.mjs:409-415,677-722,725-759`.

`TC-MAPS-ORDER` checks only that both coordinate substrings occur. Applying its exact predicate to `https://www.google.com/maps/dir/?api=1&waypoints=21.002%7C21.001` returned **true**, despite reversed order. The advertised order mutation tests a separate helper against hardcoded strings; that helper is not used by the actual DOM order assertion. Removing the actual implementation's ordering check would not make this helper fail.

The rel mutation likewise tests a standalone HTML literal rather than mutating the application. There is no disclaimer mutation in the committed suite. In this review's own DOM mutations, removing `rel` made the real attribute predicate false, and removing `[data-maps-disclaimer]` made the real proposal predicate false; reversed waypoints still passed the committed order predicate. These are predicate-level probes, not claims of rebuilding three mutated application versions.

The stale test resolves immediate mock fixtures, waits 200 ms before changing mode and never creates out-of-order completion. Reset is tested only after requests have completed. Thus 33/33 does not establish pending-response reset, delayed errors, mode races or stale revision behavior. Generation/AbortController checks exist in source, but reset does not increment the generation, and `sessionEpoch` is absent from the fetch effect dependencies. A delayed live-response race was **not independently validated** in this review.

Use controlled delayed responses, including an older success/error after a newer request and after reset/unmount; assert no stale link/banner. Compare actual rendered URL sequences exactly with the injected response and decoded expected waypoint arrays. Run the same acceptance assertions against actual remove-rel, reorder and drop-disclaimer mutations and require failure.

### LOW L1 — Radio semantics lack radio-group keyboard behavior

Location: `MapsLinksBlock.jsx:226-283`.

The toggle exposes `role="radiogroup"` and two `role="radio"` buttons but implements neither arrow-key selection nor roving tab index. Native buttons support Tab/Enter/Space, but adding a radio role does not supply radio keyboard behavior. Reproduce by focusing walking and pressing ArrowRight: there is no handler to select driving. The suite tests only programmatic focus, despite its header claiming Enter activation/focus-indicator coverage. Use native radio inputs or implement the radio keyboard pattern and test actual key events. No screen-reader session was run.

## Independent evidence

- Production scratch copy: `C:\Users\tuana\AppData\Local\Temp\foodtour-maps-build-qYQbn8`, outside the repository; `next build` succeeded. Next production server used **13000**, headless Edge CDP used **18000**. Synthetic mock mode only; no private dataset, provider keys, Google link clicks or public publishing. Scratch server/browser were stopped and build directory removed by the harness.
- Ran a UTF-8 copy of `qa/e2e/test_maps_links_cdp.mjs` with only absolute source-root/port overrides and added review probes: **33/33 committed assertions passed**, final summary and cleanup reached. The PowerShell wrapper reported exit 1 and captured a Node DEP0190 native-command warning; therefore this is assertion-output evidence, not a claimed clean process exit. Supplemental probes are observations reported above, not counted as passing acceptance assertions. An initial copy had incorrect PowerShell decoding; its text-label failure was discarded and the UTF-8 run replaced it.
- CDP `Network.requestWillBeSent` observation was enabled before initial navigation. Google/gstatic request count was **0**, including a final measurement after hostile-response, mode, partial/unavailable and error probes. This proves zero observed page requests in the synthetic run; it is not provider/server validation or a claim about untested credentialed configurations. No Google URLs were opened.
- `node frontend/lib/contractTest.js`: **17/17 passed**, exit 0. `node qa/e2e/test_components.mjs`: **31/31 passed**, exit 0.
- Additional SSR probe with hostile stop names `<img src=x onerror="globalThis.pwned=1">`: names were escaped (`&lt;img`), no raw `<img>` tag. Hostile notes produced no script execution but are omitted entirely. Response URLs require the separate H1 fix.
- Temporary harness/log: `%TEMP%\codex-gmaps-review.mjs`, `%TEMP%\codex-gmaps-review.log`; SSR probe: `%TEMP%\codex-gmaps-ssr.mjs`. These local scratch artifacts are not committed or public artifacts.

## Acceptance coverage and limits

| Requirement | Result |
| --- | --- |
| Real anchors, `_blank`, exact `noopener noreferrer` | PASS for primary and split baseline |
| Server response URLs only, no client URL construction | PASS by source inspection; synthetic fixture selection is confined to mock behavior, except existing global test hooks also precede the mock check |
| Preserve response order and `Chặng i/n` labels | PASS by source/ordinary split rendering; test mutation coverage fails M3 |
| Walking default / driving toggle | PASS ordinary browser flow |
| Partial/unavailable honesty | Basic fixtures pass; URL-length reason fails M2 |
| Privacy/proposal copy; no Google time/distance claim | PASS ordinary rendered block; privacy sentence is English in the Vietnamese UI |
| No automatic Google requests | PASS independent page-network observation, zero |
| Stale response/reset/mode guards | Ordinary mode/reset passes; asynchronous proof missing M3; queue-triggered reset defect M1 |
| Error banner and Retry button | FAIL M1; shared Banner can render descriptor actions, but this integration removes the error |
| Hostile URL/notes/names | FAIL URL allowlist H1; names escaped; notes omitted M2 |
| 390x844 touch targets/reachability | Primary 46.5x324px, walking 44x82.734375px, driving 44x83.234375px; primary top 467.5px; PASS measured controls |
| Accessibility | Programmatic keyboard focus passes; radio keyboard semantics L1; error/split controls not independently measured |
| Flag-off untouched | PASS source review: additions are in V2 components; no changes to the legacy page/MapView files in the merged implementation; no independent flag-off browser replay |
| Tests fail for rel/order/disclaimer mutations | Rel/disclaimer predicates fail real DOM removal; ordering predicate accepts reversal; full mutation-run coverage remains required |

Required before acceptance: resolve H1 and M1-M3, add the missing hostile/error/race/mutation cases, and rerun production scratch browser checks plus affected module tests. L1 should be corrected alongside toggle accessibility. No production files were edited, no implementation was self-approved, and no live backend/provider functionality is claimed verified.
