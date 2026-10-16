# Independent Codex review of R0

Decision: **MERGE-AFTER-FIXES**. Review author: Codex; reviewed author: Claude. Date: 2026-10-16. This is a review, not approval of Codex's own server implementation.

## Scope and evidence

Merged `foodtour-claude-coordinator` first (fast-forward c079fa2 -> 9f24a31). Read b7c89c3, c581dc6, 887e54b and the integrated extractor, planner, loader, API serializers, budget adapter and contract v1.6. Only this report was changed by the review. All reported inputs/coordinates/names below are synthetic; no private CSV was used for benchmarks or probes. Provider responses were local stubs, not live Gemini validation.

- `PYTHONPATH=backend .venv/Scripts/python.exe -m unittest discover -s backend/tests -q`: **255 passed**, 52.704 s.
- `PYTHONPATH=backend .venv/Scripts/python.exe -m unittest backend.test_planner -q`: **4 passed, 1 failed** (`test_budget_and_source`: empty stops). This legacy test calls `legacy.load()`, which returns `[]` when this worktree's `data/venues.json` is absent; not evidence of an R0 regression. I cannot independently claim 260 passing here.
- `.venv/Scripts/python.exe tools/export_openapi.py --check`: **passed**. Schema drift passing does not establish agreement with contract prose.
- Initial discovery without `PYTHONPATH=backend` produced import errors; corrected the invocation before the above run.
- Independent Python-stdin probes below exercised both successful and malformed inputs without modifying production/test files.

## Findings, ranked

### HIGH R01 — complete prior suppresses necessary interpretation of new edits

`backend/app/llm/provider.py:279`–`285` returns false immediately when origin and duration exist, regardless of what the new message requests. With prior `Preferences(origin=(21.0285,105.8522), duration_min=180, interests=('bun',))`:

| Message | Observed (all zero provider calls) | Required handling |
|---|---|---|
| `xuat phat tu cho Dong Xuan` | Old origin survives; no `origin_text` | Resolve the explicitly changed origin or ask |
| `toi chi co hai tieng` | Duration stays 180 | Extract 120 or ask |
| `thu bay luc 18h` | Time becomes 18:00 but weekday stays null | Extract Saturday or disclose incomplete extraction |
| `chi an pho thay bun` | Interests become `('bun','bún','phở')` | Replace requested interest instead of retaining bún |

The latter rule limitations pre-existed; R0's new gate prevents the configured model from repairing them and reports successful rules extraction without explaining an ignored edit. This can produce a valid tour for the wrong preferences. Gate on whether the current message's requested changes were understood, not solely slot completeness; ask when interpretation remains unresolved.

### HIGH R02 — lossy cache keys reuse a semantically different request across sessions

`backend/app/llm/provider.py:295`–`312` folds accents and punctuation before hashing. With the same prior (including default `None`) these two messages collide:

```python
a = 'an bò quanh cho Dong Xuan hai tieng'
b = 'an bơ quanh cho Dong Xuan hai tieng'
# Stub provider returns {"duration_min":120,"interests":["bò"],"origin_text":"cho Dong Xuan"}
x = rf.extract(a)  # source live, interests ('bò',), one call
y = rf.extract(b)  # source cache, interests ('bò',), still one total call
```

Beef and butter are distinct requests. The extractor is application-wide, so a separate session with identical prior can receive the first session's result; accent differences can also replay a different place phrase (`phố Huế` versus `pho Hue`). Cache hits do not re-ground `origin_text` against the new text. Use a semantics-preserving message key and cache validated updates rather than a whole merged result; consider explicit session partitioning for private text.

**Different-prior question:** `_key` includes the complete dataclass `repr(prior)`. Changing prior origin from `(21.0285,105.8522)` to `(21.03,105.85)` produced different hashes. I did **not** reproduce reuse across unequal priors or session-token bypass. The proven failure is same-prior, different-message collision and shared cache scope.

### HIGH R03 — a loader-accepted review count crashes ranking

`backend/app/planner/quality.py:68`–`69`; contributing boundary `backend/app/data/loader.py:111`–`117`.

```python
n = _count('1e400')  # accepted; equals 10**400
v = Venue('a','Synthetic A',21.0285,105.8522,
          dish_tags=('bun',),rating=5.0,review_count=n,synthetic=True)
smoothed_rating(v,3.5)  # OverflowError: int too large to convert to float
plan_tour([v],Preferences(origin=(21.0285,105.8522),duration_min=180,
                          interests=('bun',)))  # OverflowError
```

An external dataset field can therefore turn a plan/message into an unhandled server error. Bound source counts to a documented sane domain and use a stable smoothing formula, treating unusable values as unknown. This is reachable through the current loader, not just an invalid hand-built dataclass.

### MEDIUM R04 — successful model extraction loses newly extracted meal/audience

`backend/app/llm/provider.py:314`–`320`, `:109`–`126`, `:175`–`188`; `backend/app/providers/gemini.py:149`–`170`.

Input `an toi cung gia dinh 2 gio quanh cho Dong Xuan` with empty prior produces meal `dinner`, audience `family`, duration 120 in rules, then needs the model for the origin. A successful stub model response `{"origin_text":"cho Dong Xuan","duration_min":120}` returns meal/audience **null**, because the whole rule result is discarded. These fields cannot be supplied by the real model schema; `parse_and_validate('{"meal":"dinner","audience":"family"}')` rejects both as `unknown_field`, and `_prior_json` omits them too. Preserve independently validated rule updates when merging a model response and align the extraction schema/prior with the new fields.

### MEDIUM R05 — shared caches retain private inputs and precise origins beyond session lifetime

`backend/app/llm/provider.py:295`–`297`, `:309`–`318`; `backend/app/planner/relevance.py:27`–`32`.

Populate the model cache using prior `Preferences(origin=(21.0285,105.8522), origin_source='current_location', duration_min=None)` and message `toi co hai tieng`. The cached `ExtractionResult.preferences.origin` retains those exact coordinates. The SHA-256 key does not redact its cached value. Expired entries are ignored but never removed on lookup; absent capacity eviction, private result values remain until process exit. There is no linkage to session deletion/expiry.

Additionally `_key` calls the newly LRU-cached `fold(cleaned)`. Python's LRU stores its **raw string argument**, so up to 8,192 strings including full cleaned chat/place text can survive independently of the model cache's nominal TTL. This is memory retention, not a demonstrated log leak or network disclosure. Cache only necessary nonprivate updates, enforce expiry deletion and avoid memoizing full messages through the global relevance cache.

### MEDIUM R06 — source-controlled why text can carry unsupported claims and Unicode controls

`backend/app/planner/engine.py:93`–`96` directly concatenates the first new source tag; `:80`–`82` similarly reflects user interest terms. Synthetic second venue tag `safe <script>alert(1)</script> \u202e` yields:

```text
Thêm món khác: safe <script>alert(1)</script> [U+202E]
```

`validate_tour` accepts it because recomputation repeats the same text. A source tag such as `đã xác minh an toàn dị ứng` likewise remains an unsupported safety phrase in an explanatory sentence. Reject control/format characters and phrase diversity as source-category metadata, or use controlled category labels. This probe proves propagation, **not** browser script execution; escaping remains the renderer's responsibility. Venue **names** are not interpolated into these templates, so putting `SYSTEM: verified allergy safe` and U+202E only in the name did not reflect that name into why text.

### MEDIUM R07 — meal/audience parsing treats context and negation as positive intent

`backend/app/llm/extract.py:160`–`170`.

- `chieu nay di an toi` -> `meal='snack'`, because `chiều nay` wins before the explicit dinner phrase.
- `khong co tre em, di mot minh` -> `audience='family'`, because negated `trẻ em` wins before solo.
- `khong di voi gia dinh, di mot minh` -> `family` for the same reason.
- `toi muon an bun` and `toi thich toi` -> meal null: whole-word phrase regexes correctly avoid generic `toi` substring hits.
- `toi nay di hoc` -> dinner even though the sentence requests no meal; temporal context is treated as meal intent.

These change ranking only, not feasibility. Prioritize explicit meal intent, handle negation, and distinguish time-of-day context from requested meal/audience.

### LOW R08 — calls are spent on messages carrying no extractable request

`backend/app/llm/provider.py:279`–`293`. With empty preferences, `cam on ban` invokes the provider once; `toi thich toi` also passes the gate. Both required slots missing short-circuits the relevance/place decision after three words. On a scarce daily quota, obvious acknowledgments should be zero-call responses with the existing missing-slot question. Conversely a blanket `rejected_fields` return also prevents model interpretation of independent valid changes in a longer message; do not let one invalid slot suppress every other request.

### LOW R09 — client-config feature flag promised in v1.6 is absent

Codex-owned integration omission: `backend/app/api/routes.py:145`–`162`, `backend/app/api/schemas.py:356`–`360`. Setting `FOODTOUR_UI_V2=1` and requesting `/v1/client-config` returned 200 with **no `features` property**. The OpenAPI agrees with this implementation, but the v1.6 normative addition promises `features.ui_v2` and does not mark it planned. Implement in a separately assigned server task or explicitly defer it in the contract.

## Other probe results and contract reconciliation

- **Interest priority:** a rating-5 venue with 10,000 reviews and no requested `bun` match was never selected over a matching venue. `eligible` removes zero-match venues before soft ranking; relevance also precedes soft sum. Empty interests intentionally allow all eligible venues.
- **Smoothing:** NaN, infinity and negative ratings produce no smoothed score; negative/NaN review counts in directly built venues are treated as zero. Equal-score, same-coordinate venues selected ID `a` for both input orders. Normal count smoothing and deterministic ID tie-breaking work. `well_rated` itself lacks the rating upper/finite check: a directly built infinity-rated venue with count 20 passes it, although the current loader blocks that path. Keep the guard consistent as defense in depth.
- **Why honesty:** ordinary templates make no hours, price-per-person, allergy-safety or verified-feasibility claims. `well_rated` reports the source and requires 20 reviews; `fits_meal` says the source labels it suitable. Near-origin/short-walk templates use `~` but do not say `ước tính` for straight-line estimates, so the standalone reason loses the stronger estimate label present elsewhere in the tour response. Keep estimate provenance visible with those reasons.
- **Recomputation:** forging `why=(('well_rated','verified allergy safe'),)` on a valid stop yields `['reasons mismatch at a']`. It is rejected. Recomputing does not sanitize the original source strings (R06).
- **Contract contradiction:** v1.6 says neither meal nor audience changes `validate_tour`, and `types.py:66` says they are never part of validation. In fact a valid tour built with no meal, then validated against the **same venue/prefs except** meal `dinner` (venue source meals `('Buoi toi',)`), yields `['reasons mismatch at a']`. Changing `start_time` or metadata can legitimately require new explanations; the contract should say these fields do not alter hard feasibility, while why text is recomputed and compared. Audience currently does not affect why, so audience-only changes do not fail this check.
- **Contract extraction mismatch:** v1.6 meal/audience preferences work through the structured API and persistence, but not consistently through the model path (R04). Defaults from `start_time` are computed by `effective_meal`; the API can still serialize `meal=null`. If consumers require the derived meal as a display field, contract wording needs to distinguish explicit versus effective meal.
- **Budget/message contract:** the 0/1 message-call convention is implemented separately from transport-attempt counts. c581dc6 honors adapter-provided `llm_calls`; local admission refusal is 0, retry-after-first-attempt refusal is 1. Independent existing provider-budget tests passed. Budget reset/persistence, 429 exhaustion and evidence response shapes are implemented and tested; no additional v1.6 mismatch found there.
- **Evidence/display responsibility:** evidence is present in list, detail and nested stop venue views. `rating.count<5` presentation is a browser requirement; server deliberately still supplies the source value. No backend mismatch on that clause. Planned alternatives, saved itineraries and health details are explicitly deferred and are not omissions.
- The concrete v1.6 disagreements found are the missing feature flag, the literal validation-invariance statement, the incomplete model preference path, and ambiguous derived-meal serialization. Rules gating/cache semantics also undermine the broader accurate-extraction/session-isolation promises. No endpoint/enum mismatch was found for implemented v1.6 message, rating/evidence or why shapes.

## Synthetic performance comparison

Python 3.14.4, Windows, Intel64 Family 6 Model 186 Stepping 2. Same interpreter/process, default 14-venue search cap, 1,702 generated venues, no private CSV, no provider I/O. Before engine/relevance source was loaded using `git show 887e54b^:...` and executed in memory, with the old relevance functions explicitly assigned to the old engine namespace. After uses the integrated 887e54b engine. Both use the current compatible dataclasses/interfaces. The after fold cache was cleared before each timed call; the before fold function has no cache. Timed `plan_tour` only, excluding source loading and venue generation.

| Maximum stops | Before milliseconds | After milliseconds | Interpretation |
|---|---:|---:|---|
| 3, three runs | 247.47 / 218.54 / 215.68 | 102.60 / 100.71 / 100.67 | Median 218.54 -> 100.71 ms, about 54% lower |
| 5, one run | 94,064.82 | 72,312.34 | About 23% lower, still 72 seconds |

The three-stop runs overlapped the backend test suite; the five-stop measurements are single samples, so these are local observations, not a statistical production latency claim. Source quality legitimately changed the selected IDs; the input venues and constraints stayed identical. The five-stop enumeration remains a material latency limitation, even though the full source pool is capped to 14 search candidates. `engine.py:236`–`250` explores permutations and reevaluates prefixes twice. This is a **MEDIUM performance concern** at the contract's supported five stops; add bounded search/latency handling in a separately scoped task rather than describing the cache optimization as sufficient.

Reproducer (run from repository root with `PYTHONPATH=backend`; writes no files):

```python
import subprocess, time
from dataclasses import replace
from app.planner import engine
from app.planner.relevance import fold
from app.planner.types import Venue, Preferences

oldrel = {'__package__': 'app.planner'}
exec(subprocess.check_output([
    'git', 'show', '887e54b^:backend/app/planner/relevance.py'
]).decode(), oldrel)
old = {'__package__': 'app.planner'}
exec(subprocess.check_output([
    'git', 'show', '887e54b^:backend/app/planner/engine.py'
]).decode(), old)
old['interest_score'] = oldrel['interest_score']
old['excluded'] = oldrel['excluded']
venues = [Venue(
    f'synth-{i:04}', f'Synthetic bun {i}',
    21.0285 + (i % 41) * .00001, 105.8522 + (i // 41) * .00001,
    dish_tags=('bun',), synthetic=True, rating=3 + (i % 21) / 10,
    review_count=i % 400, suitable_meals=('Buoi trua',)
) for i in range(1702)]
p = Preferences(origin=(21.0285,105.8522), duration_min=720,
                interests=('bun',), max_stops=3, start_time_min=600)
for stops, repeats in [(3,3), (5,1)]:
    for label, fn in [('before',old['plan_tour']), ('after',engine.plan_tour)]:
        elapsed = []
        for _ in range(repeats):
            fold.cache_clear()
            start = time.perf_counter()
            tour = fn(venues, replace(p,max_stops=stops))
            elapsed.append((time.perf_counter()-start)*1000)
        print(stops, label, elapsed, [s.venue_id for s in tour.stops])
```

## Disposition

Fix R01–R03 before acceptance; resolve R04–R07 or explicitly document and obtain coordinator acceptance of their limits. Reconcile the listed normative contract disagreements, assign the missing flag to its server owner, and retain the five-stop latency limitation in release evidence. No production changes, new dependency, private data artifact, remote publication or merge approval was made by this review.
