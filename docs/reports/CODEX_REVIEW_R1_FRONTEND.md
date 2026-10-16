# Independent Codex review — R1-5 UI_V2

Date: 2026-10-16. Author under review: Antigravity, commit `a2735e81488a05d7feeb2a403d42b525b266f728`. Reviewer: Codex, not the implementation author. Review checkout: `7bd3e7b` after the required `git merge foodtour-claude-coordinator` (fast-forward). No frontend or QA files were edited.

**Decision: REQUEST CHANGES.** Three HIGH findings block acceptance: error responses crash the page, unsuccessful tour outcomes lose their explanations, and chat clarification questions disappear. Six additional findings below cover evidence, accessibility, rollback, tests, and bundle cost. This report is review evidence, not approval to merge or enable V2 by default.

## Execution and isolation

- Read project rules, task ownership, reference Word plan, and installed Orca orchestration/CLI guides. Used the dispatched Orca Task/Dispatch for coordination; no additional agents.
- Ran the supplied suite: `$env:UI_V2_PORT='13000'; node qa/e2e/test_ui_v2.mjs`. Production build succeeded; **15/15 passed**. First stop tops were 316px at 390×844 and 224.5px at 1280×800.
- Ran separate headless Edge/CDP probes against a production scratch build with `NEXT_PUBLIC_API_MODE=real` and `NEXT_PUBLIC_API_URL=http://127.0.0.1:18000`. A local Node HTTP fixture server on 18000 returned explicitly synthetic session/tour responses; web server used 13000. No private CSV, database, live provider, public publication, or paid service was used.
- Scratch source/build directories were under `%TEMP%/foodtour-uiv2-build-*`, outside the repository. Harnesses were `%TEMP%/codex-r1-review.mjs`, `codex-r1-baseline.mjs`, and `codex-r1-mutation.mjs`; these are convenience artifacts, not dependencies of this report. Reproduction inputs and observations are recorded below.
- Controlled rollback build: same checkout/dependencies, restoring only `app/page.js`, `app/globals.css`, and `lib/api.js` from `a2735e8^` inside scratch. These are all non-V2 production files changed by R1-5; added V2 components remained unimported. This isolates the R1-5 effect, rather than claiming a full historical checkout benchmark.
- The supplied suite leaves its Next child listening after killing the `npx` wrapper. Verified the process command line pointed to this review's scratch build before stopping that child. Independent harnesses spawned Next directly and stopped their own servers.

## Findings, ranked

### R1-F01 — HIGH — actionable error banners crash React

Location: `frontend/app/components/v2/V2Layout.jsx:88`, `:105`, `:151`, `:168`; shared rendering boundary `frontend/app/ui/Banner.jsx:92` and `:143`.

V2 enqueues `action: {label, onClick}` objects. BannerQueue passes that object directly to Banner, which renders `{action}` as a child. React cannot render this object. Authentication, revision conflict, provider-unavailable, and generic errors all take an affected branch.

Exact reproduction: open `/?ui=v2`, allow synthetic session initialization, then make `POST /v1/sessions/SYN-SESSION-1/tour` return HTTP 422 with `{"error":{"code":"validation_error","message":"SYNTHETIC_ERROR"}}`. Click the request area's plan button. Observed body: `Application error: a client-side exception has occurred while loading 127.0.0.1 (see the browser console for more information).`; banner count = 0. As a control, HTTP 429 rendered one banner (`role=alert`, `aria-live=polite`) because that branch has no action object.

Required correction: render a real accessible button element for each action, or adapt the shared Banner action contract consistently. Exercise 401/410, 409, 422/500, and 503 with actual action clicks; recover without a page reload. Generic retry also currently calls planning regardless of the failed operation, so preserve the existing operation-specific retry context when wiring recovery.

### R1-F02 — HIGH — no-solution and insufficient-evidence outcomes are silently discarded

Location: `frontend/app/components/v2/V2Layout.jsx:199`, `:253`; `frontend/app/components/v2/EvidenceStrip.jsx:12`.

`hasTour` depends only on nonempty stops. An unsuccessful valid API response with empty stops falls back to the initial request screen. V2 never renders `tour.status`, `reasons`, `proposed_changes`, or checked `explanation`; the old TourStatusBanner is absent. Conditional and verified results also get the same fixed EvidenceStrip text, which does not read its `tour` prop.

Exact reproduction: return HTTP 200 from planning with `{"revision":2,"tour":{"status":"no_solution","stops":[],"reasons":["SYNTHETIC_NO_SOLUTION_REASON"],"proposed_changes":["Increase duration"],"unknowns":[],"totals":{"walk_minutes":null,"venue_range_upper_sum_vnd":null,"leg_source":"unknown"}}}`. Observed `document.body.innerText.includes('SYNTHETIC_NO_SOLUTION_REASON') === false`; only the initial input/chips/actions remain. The same rendering branch applies to `insufficient_evidence` with empty stops.

Required correction: explicitly render all four feasibility states and the server's reasons/proposed adjustments, without silently relaxing strict mode. Derive evidence and routing disclosures from actual tour evidence, including provider routes and verified hours, instead of fixed statements about every result.

### R1-F03 — HIGH — natural-language clarification workflow has no visible response

Location: `frontend/app/page.js:469` V2 prop wiring; `frontend/app/components/v2/V2Layout.jsx:62`, `:75`; `frontend/app/components/v2/RequestArea.jsx:56`.

The shared page still updates messages, missing slots, questions, and notes. V2 receives only messages/notes and uses messages solely to extract metadata; it does not display assistant replies or notes and receives no questions/missing-slot props. A user cannot see what information is required to proceed.

Exact reproduction: open `/?ui=v2`, select a suggestion, submit it, and return HTTP 200 from `/messages` with `{"revision":1,"tour":null,"missing_slots":["duration_min"],"questions":["SYNTHETIC_QUESTION_DURATION"],"notes":["SYNTHETIC_NOTE"]}`. Both question and note text were absent from the document after the request completed. There is no clarification interaction equivalent to the original ChatPanel.

Required correction: retain a concise accessible conversation/clarification surface and render required questions and relevant notes; prove a missing-slot response can be answered and followed by planning. Keep the itinerary-first layout.

### R1-F04 — MEDIUM — null walking evidence becomes a zero-minute claim

Location: `frontend/app/components/v2/ItineraryView.jsx:34`, `:90`.

`tour.totals?.walk_minutes || 0` converts contractual `null` to 0. This invents a walking duration when evidence is unknown. Price remains unknown, albeit awkwardly rendered as `≤ chưa rõ`.

Exact reproduction: return a three-stop conditional synthetic tour with `totals.walk_minutes=null` and `venue_range_upper_sum_vnd=null`. Observed summary: `3 quán · ~0 phút đi bộ · ≤ chưa rõ (khoảng giá quán)`. `walk_minutes: int|null` is explicitly allowed in the frozen contract.

Required correction: distinguish null/missing from numeric zero; show walking time as unknown. Apply the comparison symbol only when an actual upper bound exists.

### R1-F05 — MEDIUM — provenance is hardcoded and synthetic mode loses its disclosure

Location: `frontend/app/components/v2/RequestArea.jsx:206`; unused provenance inputs at `frontend/app/components/v2/V2Layout.jsx:49`.

The request screen always claims `Dữ liệu: 1.702 quán Hà Nội`, regardless of health/session dataset metadata. V2 removes the original synthetic-data notice and never uses `datasetSource`, `datasetVersion`, or `isMock` for a normal-user provenance disclosure. A locally unverified label does not identify fabricated fixtures.

Exact reproduction: run the supplied suite's mock production build and open `/?ui=v2` without `dev=1`, before planning. It advertises 1,702 venues even though the client is using six synthetic fixture venues; the initial screen does not identify them as synthetic. The independent real-mode fixture server returning `dataset_source=synthetic` produced the same hardcoded claim. Synthetic names on later stop cards do not fix the initial claim.

Required correction: derive counts only from available metadata, omit unsupported counts, and clearly label synthetic input in normal mode. Developer-control suppression must retain material data provenance.

### R1-F06 — MEDIUM — keyboard focus is invisible and open-sheet targets are too small

Locations: `frontend/app/components/v2/RequestArea.jsx:124`; V2 PreferencesSheet's reused controls in `frontend/app/components/PreferencesPanel.jsx:657`, `:700`, `:720`, `:818`.

The request input's inline `outline: none` overrides the global `:focus-visible` rule. In the preferences sheet, existing inline minimum sizes also override the 44px token rule. The supplied target test runs with this sheet closed and omits selects.

Exact reproduction at 390×844: focus the header reset button and dispatch a real Tab key. The request input becomes active and matches `:focus-visible`, but computed outline is `none`, box-shadow is `none`, and its border retains its unfocused appearance. Open preferences and measure visible controls: `#pref-origin-preset` = 278×40px; `#pref-custom-lat` and `#pref-custom-lon` = 123×36px; `#pref-duration` = 148×40px.

Required correction: provide a visible keyboard focus indicator and enforce 44px on controls inside the open sheets. Verify keyboard and pointer interaction at mobile and desktop sizes, including selects and any autocomplete widget.

### R1-F07 — MEDIUM — flag-off is not a complete presentation rollback

Location: `frontend/app/globals.css:1`, importing unscoped `frontend/app/ui/tokens.css` globally.

The legacy page's state/effects/handlers are preserved, but the new global stylesheet changes the old layout even when no V2 flag is active. A complete flag-off claim is therefore incorrect.

Exact reproduction: compare `/` at 390×844 in the controlled rollback scratch build and current scratch build, with `features.ui_v2=false` and no query flag. Original reset button height = 30px; current = 44px. The mode-toggle button similarly changes from 26px to 44px (its label varies with mock/real mode). Root `--bg` and `--shadow-lg` change from absent to `#FBF8F3` and `0 10px 24px rgba(31,27,22,0.14)`. Both builds render the old layout; the presentation is demonstrably different.

Required correction: scope V2 styling or explicitly revise and approve the rollback requirement, with regression evidence for the intentionally shared changes. Do not call a two-element presence check “byte-for-byte rollback.”

### R1-F08 — MEDIUM — several acceptance assertions pass without the claimed feature

Location: `qa/e2e/test_ui_v2.mjs:367`, `:370`, `:390`, `:393`, `:405`, `:433`, `:447`.

Executed evidence:

1. Unmodified suite passed TC-V2-09 while printing `Banners count: 0`. No error/budget state is triggered, and `<=1` cannot establish the advertised exactly-one behavior or action recovery.
2. In a separate scratch-only harness, immediately before `const stopDetails = await ev(...)`, executed `document.querySelectorAll('[data-why-chip], [data-venue-rating]').forEach(e=>e.remove())`. **The entire suite still passed 15/15**, including TC-V2-10 and TC-V2-11. TC10 records but never asserts why counts; TC11 returns true if the first rating node is absent and never examines the low-count stop.
3. TC-V2-12 runs without opening MapSheet, so MapView is unmounted and the selected route-layer count is necessarily zero. Google polylines also are not proven by these CSS selectors. It does not test the actual provider/estimate branch.
4. TC-V2-08 checks existence, not exactly one or collapsed state. TC14 measures the closed sheet and excludes `select`; F06 reproduces its missed failures. TC15 checks an input and the CONTRACT badge, missing the measured CSS regression.

The suite is not wholly tautological: viewport assertions require actual stop cards and `record()` throws on a false assertion. The issue is that these specific predicates do not prove their stated behaviors. The independent 422 probe is a concrete failure that all 15 acceptance checks missed.

Required correction: construct each relevant state, assert its expected content and exact cardinality, and demonstrate targeted fail-before/mutation results. Check every rating fixture, both hidden and formatted cases, open sheets, map provider doubles, and error action buttons. `--fail-before` only probes jargon/viewport and does not establish these other claims.

### R1-F09 — LOW — inactive V2 adds default-page JS; ui-kit remains built

Location: `frontend/app/page.js:12` eager V2 import and transitive imports.

Production build comparison (same installed Next 15.5.28 and dependencies):

| Build | `/` page size | `/` first-load JS | `/ui-kit` first-load JS |
|---|---:|---:|---:|
| Controlled pre-R1-5 files | 30 kB | 133 kB | 111 kB |
| R1-5 current files, mock or real mode | 36.8 kB | 143 kB | 112 kB |

V2 is eagerly included regardless of the runtime flag: approximately +10 kB first-load JS even for the old layout. App build manifests confirm `/ui-kit/page` remains in the default production build. Its route-specific chunk is separate, not automatically downloaded by `/`; both routes share the extracted `static/chunks/50-29578fb255ee863e.js` in the current build. No evidence of a live network or latency problem is claimed from these sizes alone.

Suggested correction: load inactive V2 on demand if rollback performance isolation is required; decide explicitly whether the component gallery should be shipped. Measure again after changes rather than setting an invented performance threshold.

## Checks that passed and limits

| Area | Evidence and result |
|---|---|
| Existing page state and API handlers | R1-5 page diff adds feature state/effects and an alternate render branch; original initialization, revision handling, abort/generation checks, handlers, and old render branch are unchanged. API changes are mock fixture/metadata additions and additive client-config features. Global CSS prevents claiming identical presentation. |
| Reset and stale tour response | Local fixture delayed `/tour` by 700ms; invoked the actual header reset callback after 100ms through its React props to exercise cancellation despite the UI's disabled busy control. After completion: zero old stop cards, plan enabled. This is a forced reset race, not a claim that disabled controls are user-clickable. |
| Origin supersede | Stubbed `navigator.geolocation.getCurrentPosition` to retain callbacks. Started lookup, changed preset to `nhatho`, then released old callback at (20,104): fields remained (21.0287,105.849). |
| Session reset and origin lookup | Closed preferences, reset session, reopened, released the retained old callback at (19,103): new fields remained default (21.033,105.85). PreferencesPanel retains epoch/generation invalidation and unmount cleanup. No Google Places/live geocoding validation claimed. |
| Text injection | Used `<img src=x onerror="window.__xss=1">` in synthetic stop names, why text, hours display, and reason text. Name/why/hours rendered as literal text; zero injected image nodes; `window.__xss` remained unset. Reasons do not render at all (F02), so that absence is not evidence of safe reason rendering once restored. |
| External links | New V2 components create no source-controlled anchors or HTML sinks. Independent V2 fixture view contained no links. Reused MapView's names are React text/DOM attributes; route drawing requires `leg.source === 'provider_route'` and geometry. No new external-link vulnerability identified in the requested diff; no live provider test. |
| Rating | Fixture value 4.567/count 128 rendered `★ 4,6 (128 đánh giá theo nguồn)`; count 3 hid the score and showed `Ít đánh giá theo nguồn`; missing venue/rating also hid score. `toFixed(1)` behavior and source label confirmed independently of the weak supplied test. |
| Null/optional evidence | Three stop cards rendered with null price, null hours, missing nested venue/rating, and extra unknown config fields. Unknown price/hours remained `chưa rõ`; source hours text included the day-applicability disclaimer. Null walking total fails F04. Omitted/null why is handled by `stop.why || []` on inspection; malformed non-array types are outside this additive-field check. |
| Price meaning | Existing synthetic suite displayed range chips, not an invented per-person bill; StopCard only labels per-person when both semantics and evidence permit it. No live price verification was performed. |
| Estimate geometry | Source inspection of reused `MapView.jsx:298` confirms geometry is drawn only for provider-route legs; estimates do not meet the condition even if geometry exists. The independent synthetic response included estimate geometry; no live Google map was configured. The supplied closed-map test provides no additional assurance (F08). |
| Sheet keyboard behavior | Initial focus entered dialog; Tab from last enabled control wrapped to close button. Escape closed; when the invoker was explicitly focused before opening, focus restored to that invoker. Pointer-programmatic `.click()` alone does not focus an invoker, so that case was not misreported as a restoration defect. |
| Reduced motion | Emulated `prefers-reduced-motion: reduce`; computed sheet transition duration was `1e-06s`, consistent with the global override. |
| Banner semantics | HTTP 429 produced one visible banner, role alert and aria-live polite. Action-bearing errors fail F01; no claim of a complete queue lifecycle/priority acceptance pass. |

No DB integration, live Maps/Routes/Places, geolocation hardware, provider credentials, contrast audit, screen-reader session, or production latency measurements were exercised. Findings require author fixes and independent re-review; no implementation changes were made during this review.
