# Nov03 food relevance, conversation evidence and full-menu upgrade

Status: backend offline acceptance passed; frontend integration and rendered acceptance pending.

## Root cause and changes

The old accent-folded substring matching conflated soup `phở` with `phô mai`, `phố`, and `tào phớ`. Matching now compares complete Unicode tokens and phrases, retains accent distinctions when available, and explicitly distinguishes soup from rolled/fried variants. Menu evidence and explicit dish categories establish relevance; venue names and addresses do not. Specific and unknown requested dishes remain literal; no unrelated replacement is silently substituted. Stored stale search cards are revalidated, while explicit selected/locked venues remain selected.

A second RED regression found the parser removed individual words as generic modifiers: `phô mai`, `pho mai`, `bánh ngọt`, `mì cay`, `bánh ít`, and `bánh bột lọc` were reduced to broader prefixes. These words now remain in the dish phrase; an explicit quantity+taste phrase such as `ít cay` still ends it. All six contrasts are GREEN in `c0a312c`; ten affected refinement checks passed. An older origin-required test was updated to the new area-search contract, rather than reinstating onboarding.

The exact screenshot request, `tôi muốn ăn phở ở đống đa, 2 người ăn, ngân sách khoảng 300k`, now searches without requiring an origin. Distance remains unknown until an origin is explicitly chosen. A tour still requires origin and current explicit confirmation. General chat is not blocked by location onboarding.

Full-menu HTTP access is authenticated and restricted to venues already visible to that session. It exposes canonical food rows, groups, descriptions, availability, prices and option groups with explicit pagination and totals. Nonfood, anomalous prices and unverified mandatory-option minima retain their existing treatment. Delivery source metadata is retained internally; repeated visible price disclaimers are removed without asserting verified dine-in prices.

## Conversation rules removed and retained

Removed: duplicate prompt instructions, blanket rejection of digits/prices, rejection based on question-mark count, generic preference acknowledgements, and repeated price caveats. Grounded public menu prices, rounded distances and recent conversation history can inform explanations. An evidenced 88,000 VND price is allowed; an invented 99,000 VND price is rejected by the targeted regression.

Retained: server-owned IDs and state, read versus mutation authorization, selected locks, CAS revisions, current explicit confirmation, allergy unknowns, factual grounding, no fabricated operating hours or road ETA, no emoji, and provider honesty. Exact origin/GPS, health/allergy data and private location turns are excluded from model projection. Entire menus/datasets are not sent to the model.

## Location and map contract

Detailed address lookup is explicit-submit only, with bounded Photon requests, timeout, shared rate gate and cache. Candidates require explicit selection; a district/local centroid is labelled approximate. Map click/drag creates a draft pin that needs a separate use-location action. Reverse lookup may provide a road label; it never invents a house number. Failure keeps a clear editable fallback.

Online OSM raster tiles extend useful street coverage beyond the old Hoan Kiem PMTiles. Normal browser HTTP cache and Referer, visible attribution and no bulk download/prefetch are required. Connectors remain labelled estimates. OSM per-leg navigation preserves chosen origin, stop order and supported transport; unsupported motorcycle routing is not silently mapped to car.

Provider references reviewed before implementation: [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/), [MapLibre raster example](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-raster-tile-source/), [Photon project and public-demo policy](https://github.com/komoot/photon).

## Evidence available

- Real private menu6 aggregate comparison: 593 old cheese/tào-phớ false positives become zero; 134 available soup rows, 13 chicken-pho, 23 beef-pho, 27 rolled-pho and 173 fried-chicken rows. Literal unknown returns zero. See `NOV03_PRIVATE_RELEVANCE.json`; no raw records are published.
- Actual API, disposable rules-only sessions: screenshot request gives five relevant results, no origin required, distance null. A separately requested city-wide fried-chicken result exposes 136 canonical dishes, 14 groups and 71 options, equal to the active archive. See `NOV03_ACTUAL_API.json`.
- Fried chicken in Dong Da has five coarse dish-category results but no canonical menu-backed matches; the positive full-menu example uses a separate city-wide request, not a hidden relaxation.
- Actual explicit public-address lookup returned five candidates with no auto-selection; choosing one and an explicit map pin succeeded. No private GPS or records are included in evidence.
- A real concurrent-request 503 exposed repeated archive parsing under the session write lock. Content-hashed repository snapshots now reuse validated data, invalidate same-path replacements, and reject malformed replacements rather than returning stale cache. Replacement and rollback checks passed.
- Affected backend checks: 32 tests before stale-result refinement, 17 targeted checks after it, 34 importer/cache tests, and 10 upgrade/replacement checks after cache correction. These overlap and are not additive. Three explicit-confirmation/allergy checks passed after final copy removal. Initial test-launch mistakes (pytest unavailable, missing PYTHONPATH) were corrected; they are not product test failures.

Backend commits: `9a18141`, `bb0050a`, `21cf811`, `4e910a2`, `5660b60`, `c0a312c`.

## Remaining acceptance

Frontend review found missing rendered full-menu content despite implemented handlers, stale async-menu identity handling, an unsubmitted-query pagination mismatch and residual price text. AG owns these corrections. Source/API tests alone do not accept those UI requirements. The final rendered journey, outside-pilot streets, pin controls, mobile sizing and service failure remain pending until the corrected build is served and inspected.

No new Gemini/Tavily generation was made. Rules and native mocked-tool-loop results are not live Gemini quality acceptance; a future real-model test requires separate allowance. Original private runtime sessions, budget, caps and rollback data must be restored and fingerprint-verified after disposable QA.
