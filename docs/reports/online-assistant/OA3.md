# Online Assistant TavilySearch Provider Report (OA3)

- Task ID: `task_7bd07278a470`
- Dispatch ID: `ctx_e884a0d5d914`
- Date: 2026-10-19
- Workspace: `foodtour-antigravity-web`
- Primary Coordinator: Codex (`term_24c3a210-7070-4dd5-b703-f12f516a70b0`)
- Specification Reference: `docs/ONLINE_ASSISTANT_CONTRACT.md`
- Code Artifacts Owned:
  - `backend/app/providers/tavily.py`
  - `backend/tests/providers/test_tavily.py`
  - `docs/reports/online-assistant/OA3.md`

---

## 1. Executive Summary

This report documents the implementation and verification of the `TavilySearch` provider adapter in `backend/app/providers/tavily.py` along with unit test coverage in `backend/tests/providers/test_tavily.py`. 

An independent review of candidate 3461353 identified five concrete contract gaps:
1. Malformed API responses (such as `results` as a dict rather than a list) were coerced to empty lists and treated as `ok`.
2. Instruction injection and allergy clearance filters were applied only to snippets, leaving titles unchecked.
3. When persistent SQLite month-blocking writes failed, subsequent searches were permitted to send additional outbound POST requests.
4. Concurrency across distinct query keys was unbounded, permitting arbitrary parallel mock POSTs under held transports.
5. Injected wall-clock drift (backward steps or jumps beyond TTL) was not verified against monotonic cache entries.

These gaps have been corrected. The provider now enforces:
- Strict distinct-query concurrency bounds (default 2, cap <= 4) with singleflight coalescing for duplicate queries.
- Finite positive deadline validation and overall clamping to 6.0s across usage GET, admission, and search POST, with rejection of late POST responses before caching.
- Strict response schema validation where missing or non-list `results` return `unavailable` with conservative charging (`credits: 1`) and are never cached.
- Comprehensive safety checks across both titles and snippets for folded Vietnamese and English instruction patterns, allergy clearance assertions, and sensitive redaction tags.
- A thread-safe in-process fail-closed fuse set before persistent SQLite block execution, blocking all future searches even if SQLite disk writes fail.
- Dual-clock cache validation verifying both monotonic TTL and injected wall-clock bounds.
- Explicit fail-closed configuration parsing rejecting blank or invalid env limits, with injected budget validation preventing limit enlargement.

All 26 hermetic tests in `backend/tests/providers/test_tavily.py` pass without network calls, and all existing provider tests run cleanly.

---

## 2. Technical Implementation Details

### 2.1. In-Process Concurrency and Inflight Registry
- `TavilySearch` initializes `max_concurrent_searches = min(max(1, int(max_concurrent_searches)), 4)` (default 2).
- Inside an atomic lock:
  - The process-salted SHA-256 cache is inspected first.
  - If a matching query is already in-flight, the calling thread becomes a follower on the existing leader's `threading.Event`, preserving singleflight behavior (1 outbound POST).
  - If the query is distinct and `len(self._in_flight) >= self.max_concurrent_searches`, the registry is at capacity. The call immediately returns `status="unavailable"`, `credits=0`, `cached=False` with no admission and no network transport.
  - When distinct capacity is available, a new in-flight entry is registered and the thread becomes leader.
- Inflight registry cleanup is guaranteed via a `finally` block under the atomic lock.

### 2.2. Deadline Validation and Timing Bounds
- The `deadline_s` argument is validated to ensure it is a finite positive `float` or `int` (rejecting `bool`, `<= 0`, `inf`, `nan`, strings).
- Clamped to a maximum of 6.0s: `clamped_deadline = min(float(deadline_s), 6.0)`.
- Follower threads wait on the leader event with a timeout bounded by `clamped_deadline`.
- Leader execution evaluates `remaining = clamped_deadline - (time.monotonic() - t0)` before usage GET, before admission, and before outbound search POST.
- If the outbound search POST finishes after the overall deadline has elapsed (`time.monotonic() - t0 > deadline_s`), the result is rejected (`status="unavailable"`, `credits=1`) and discarded before caching.

### 2.3. Strict Response Schema Validation
- The response must be a dictionary containing the key `"results"`, which must be an instance of `list`.
- If `"results"` is missing, a dictionary, `None`, a string, or any non-list type:
  - Status returns `"unavailable"`, `credits=1` (conservatively charged for transport execution).
  - The result is explicitly not placed into the LRU cache.
- For legitimate empty lists (`"results": []`), the provider returns `status="ok"`, `sources=[]`, `credits=1`, which is placed in the cache.
- For non-empty lists, each entry must be a dictionary. `url` must be a valid public HTTPS string. `title` and `content`/`snippet` must be string types (no coercion from dicts/lists).

### 2.4. Title and Snippet Safety Verification
- Both `title` and `snippet` are sanitized: HTML tags stripped, control characters replaced with spaces, and length capped (160 for title, 500 for snippet).
- Validation function `_is_source_unsafe`:
  - Detects sensitive redaction leaks (`redact_sensitive(text) != text` or presence of `"[redacted_"`).
  - Detects health disclosures via `is_health_or_allergy_disclosure(text)`.
  - Detects exact diacritic allergy clearance claims via `RE_ALLERGY_CLEARANCE`.
  - Folds text with `fold_uncached(text)` and checks against `INSTRUCTION_PATTERNS` (covering `ignore instructions`, `system prompt`, `bỏ qua quy tắc`, `thực thi code`, `ghi db`, `api key`, `token`, `secret`, `password`).
  - Checks folded text against `FOLDED_ALLERGY_PATTERNS` (covering `an toan di ung`, `dam bao khong di ung`, `hoan toan an toan`, `cam ket an toan`, `allergy free`, `100% safe`).
- If either the title or snippet triggers any safety rule, the source is dropped.
- Valid safe sources are capped at a maximum of 3 items.

### 2.5. Fail-Closed In-Process Broken-Credit Fuse
- To prevent repeat requests when unexpected usage credits are reported (missing, non-integer, boolean, or not exactly 1):
  1. The thread-safe in-process fuse (`self._fuse_blown = True` and class-level `TavilySearch._process_fuse_blown = True`) is set atomically FIRST.
  2. The persistent SQLite block `self.budget.block_current_month()` is then executed.
  3. If SQLite disk writing fails or raises an `IOError`, the in-process fuse remains set.
  4. Subsequent searches on the instance or process check the fuse at the entry point of `search()`, returning `status="unavailable"`, `credits=0` without invoking `admit()` or `search_transport()`.
- **Storage-Loss Limitations**: If SQLite disk writing fails and the host process subsequently crashes or restarts, the persistent `search_blocks` row will not be present in SQLite. Durability across process restarts relies on successful disk persistence by SQLite.

### 2.6. Dual-Clock Cache Validation
- Each cache entry stores a 3-tuple: `(copy.deepcopy(result), wall_time, expires_mono)`.
- Cache hit validation requires:
  1. `now_mono < expires_mono` (monotonic expiration).
  2. `0.0 <= (now_wall - cached_wall_time).total_seconds() <= self.cache_ttl_s`.
- If the injected wall clock drifts backward (`wall_diff < 0`) or jumps forward past TTL (`wall_diff > cache_ttl_s`), the entry is invalidated and evicted from the cache.

### 2.7. Environment Parsing and Injected Budget Bounds
- `from_env()` enforces explicit validation:
  - If `FOODTOUR_TAVILY_DAILY_CREDITS` or `FOODTOUR_TAVILY_MONTHLY_CREDITS` is present in `env` as empty string or whitespace, it fails closed (`configured=False`) instead of falling back to default values.
  - If non-integer or out of bounds (`0 < daily <= monthly <= 900`), it fails closed.
  - If an optional `budget` instance is injected, `budget.daily_limit` cannot exceed explicit `daily_limit` and `budget.monthly_limit` cannot exceed explicit `monthly_limit`. Mismatches fail closed.

---

## 3. Read-Only Affected-Implementer Review

The provider integration relies on helper modules maintained by Codex:
1. `backend/app/providers/search_safety.py`:
   - `public_food_query`: Accurately restricts query length, blocks sensitive disclosures, and enforces Hanoi food terms.
   - `public_source_url`: Correctly validates public HTTPS schemes and rejects RFC 1918, RFC 4193, loopback, and cloud metadata addresses.
   - `free_account_remaining`: Reliably verifies Researcher plan parameters and rejects PAYGO or paid tiers.
2. `backend/app/providers/search_transport.py`:
   - `tavily_usage` and `tavily_post`: Enforce clean timeout handling and map HTTP errors into standard `ProviderError` instances.
3. `backend/app/repositories/search_budget.py`:
   - `SearchCreditBudget`: Enforces atomic transaction semantics (`BEGIN IMMEDIATE`) for daily and monthly credit tracking.
   - `block_current_month`: Accepts 0 arguments and records `month:YYYY-MM` into the `search_blocks` table, which is checked by `admit()`.

---

## 4. Test Evidence

The updated test suite in `backend/tests/providers/test_tavily.py` contains 26 hermetic tests covering configuration, transport errors, concurrency, schema validation, and safety filters.

Command executed with coordinator Python environment:
```text
$env:PYTHONPATH="backend"; & "C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-claude-coordinator/.venv/Scripts/python.exe" -m unittest backend/tests/providers/test_tavily.py
..........................
----------------------------------------------------------------------
Ran 26 tests in 0.884s

OK
```

All search provider tests executed together:
```text
$env:PYTHONPATH="backend"; & "C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-claude-coordinator/.venv/Scripts/python.exe" -m unittest backend/tests/providers/test_search_safety.py backend/tests/providers/test_search_transport.py backend/tests/providers/test_tavily.py
................................
----------------------------------------------------------------------
Ran 32 tests in 0.916s

OK
```

### Breakdown of Test Cases
| Test Class | Test Case | Target Requirement | Status |
| :--- | :--- | :--- | :--- |
| `TavilyConfigTests` | `test_valid_env_configures_successfully` | Valid env defaults | PASS |
| | `test_missing_or_empty_api_key_fails_closed` | Missing key disabled | PASS |
| | `test_disabled_or_not_free_only_fails_closed` | Enabled/free_only flags | PASS |
| | `test_missing_or_relative_db_path_fails_closed` | Absolute path check | PASS |
| | `test_invalid_caps_fail_closed` | Caps <= 900 validation | PASS |
| | `test_default_caps_when_unset` | Unset env defaults (20/500) | PASS |
| | `test_explicit_blank_or_invalid_env_caps_fail_closed` | Explicit blank fails closed | PASS |
| | `test_injected_budget_cannot_exceed_explicit_configured_caps` | Injected budget cap bounds | PASS |
| `TavilySearchExecutionTests` | `test_success_turn_and_explicit_settings` | Basic depth, parameters, 1 credit | PASS |
| | `test_account_gate_paid_paygo_unknown_and_exhausted` | Free plan usage gate | PASS |
| `TransportErrorAndLimitsTests` | `test_usage_snapshot_transport_errors` | Usage snapshot errors (0 credits) | PASS |
| | `test_search_post_transport_errors_conservatively_charge_credit` | POST transport error (1 credit) | PASS |
| | `test_unexpected_usage_credits_sets_in_process_fuse_and_blocks_persistently` | In-process fuse & durable month block | PASS |
| | `test_failed_block_fuse_blocks_future_posts_even_when_db_write_fails` | Fuse blocks POST on DB write failure | PASS |
| `CacheAndConcurrencyTests` | `test_cache_hit_returns_deepcopy_zero_credits_and_same_timestamp` | Deepcopy, 0 credits, cached=True | PASS |
| | `test_cache_ttl_expiration` | Monotonic TTL expiry | PASS |
| | `test_wall_clock_drift_evicts_cache_despite_monotonic_validity` | Injected wall-clock drift eviction | PASS |
| | `test_singleflight_deduplicates_concurrent_calls` | Same-query 4 threads -> 1 POST | PASS |
| | `test_distinct_8_query_held_transports_peak_at_or_below_cap` | 8 distinct queries peak <= cap (2) | PASS |
| `PrivacyAndSafetyTests` | `test_prompt_injection_and_health_rejections` | Query injection/health rejection | PASS |
| | `test_ssrf_and_private_url_sanitization` | Public URL filter (RFC 1918) | PASS |
| | `test_html_control_chars_and_length_capping` | HTML/control strip, length caps | PASS |
| | `test_malformed_response_schema_never_cached_empty_ok` | Non-list results fail closed | PASS |
| | `test_legitimate_empty_results_list_returns_ok_and_cached` | Valid empty list returns ok | PASS |
| | `test_title_and_snippet_injections_allergy_clearance_and_sensitive_redactions` | Title/snippet injection & allergy | PASS |
| | `test_deadline_validation_clamping_and_late_post_rejection` | Deadline validation & late POST | PASS |

---

## 5. Limitations

1. **No External Network Calls**: All testing is hermetic using synthetic mock transports and mock snapshots. No real Tavily API keys or live network requests were used.
2. **Persistence Storage Dependency**: The in-process fuse ensures immediate fail-closed protection within the current process lifetime if unexpected usage occurs. Protection surviving process restarts depends on SQLite filesystem writes succeeding.
