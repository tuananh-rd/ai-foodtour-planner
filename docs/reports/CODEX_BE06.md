# BE-06 — local verified-evidence overlays

2026-10-15. Author: Codex; review/integration owner: Claude.

Merged coordinator `8c1baec` first, then `aa3a8f9` with Claude's contract v1.3 and frontend price-label updates. Orca decisions `msg_900ccdfe0a95` and `msg_02c540e7a1c3` approve per-person semantics, content-hash composition, partial-row count semantics, fail-closed configured files and seven-day mappings. Codex did not edit planner, LLM, frontend, QA or the prose contract.

## Behavior and format

Set FOODTOUR_EVIDENCE_PATH to an absolute local JSON file. Unset/empty/whitespace means no overlay: original Venue values and input-byte dataset_version remain unchanged, with four zero health counts. A configured missing/unreadable/oversized/malformed file fails closed through the existing redacted 503 provider_unavailable envelope; cached evidence is not substituted for an invalid file. Sources are text only and are never fetched.

The explicitly labelled example is `contracts/fixtures/evidence.synthetic.json`: schema=1, entries for three synthetic IDs, `_label` marking the entire file as invented test evidence. Its format is:

```text
schema: 1
entries: [
  venue_id: exact loaded venue ID
  hours: {"0": [["08:00", "22:00"]], ... "6": []}
  hours_source: nonblank string
  hours_verified_at: "YYYY-MM-DD"
  price_per_person_vnd: {"min": integer, "max": integer}
  price_source: nonblank string
  price_verified_at: "YYYY-MM-DD"
]
```

Hours and prices are accepted independently, only with their own source and valid calendar-date metadata. All seven weekday keys are required (0=Monday); an empty interval list explicitly means verified closed. Partial mappings stay unknown rather than inventing closure for omitted days. Times are strict 00:00–23:59 HH:MM, intervals must be forward and nonzero, and overlaps are rejected. Input order is normalized; adjacent intervals are merged so a visit crossing their shared boundary is not falsely classified as closed. Derived hours_display contains only validated weekday/time values.

Per-person min/max must be integers (not bool/float/string), nonnegative and ordered. An explicitly attested zero is allowed as a known free price; raw source zero still follows the existing unknown-price rules. A source venue range is never upgraded by itself: only accepted price_per_person_vnd replaces its values and sets price_evidence=verified. Hours-only entries retain the prior venue-range estimate. API price.semantics and the legacy listing alias price_semantics are per_person only for that verified price, otherwise venue_range. Venue detail/list report verified hours mapping while open_at_arrival remains null without a requested arrival; tour opening claims still come from the hard checker.

Unknown IDs, malformed rows, all copies of duplicate IDs and unsupported entry fields are rejected without echoing contents. Valid entries/fields continue loading. Duplicate JSON object keys or invalid file-level schema fail the file rather than choosing ambiguous data. File reads are capped at 1 MiB. Counter/reason names are fixed strings.

`/health.evidence_overlay` contains only entries_loaded, entries_rejected, hours_verified and prices_verified. A row with any accepted field counts loaded; a row with any rejected field counts rejected, so a partial row can appear in both. aggregate_report additionally exposes count-only evidence_rejections_by_reason, with field counts potentially exceeding rejected-row counts. No IDs, sources, dates, addresses or paths appear in these diagnostics.

When configured, dataset_version hashes a domain separator, the base input digest, overlay byte length and the exact overlay bytes. Any overlay byte change (including provenance/formatting) changes the version; no overlay preserves the old input-only digest. The existing snapshot cache therefore cannot reuse old evidence. Persistent GET session recovery invalidates old tours and retains preferences with the existing data-changed note. Replacement re-reads evidence for overlay-bearing/configured sessions: invalid files return 503 and a version mismatch returns 409 no_candidates without stops. The original pinned-snapshot behavior remains for no-overlay legacy sessions; POST /v1/plans is unchanged.

## Verification

Seventeen new tests (12 loader/planner, 5 API) use synthetic fixtures and temporary files/SQLite only. API strict planning uses the already existing tests.providers.test_http.Handler on an ephemeral 127.0.0.1 HTTP server, through the actual HttpRouteProvider. The fixtures remain synthetic even when all tested evidence fields are verified.

Covered: blank/unset compatibility and old digest, correct minutes/display/prices/counts, independent source/date requirements, invalid dates, malformed/overlapping/reversed/partial-week hours, adjacent normalization, invalid/zero price semantics, unknown and duplicate IDs, malformed rows/file/schema/duplicate JSON keys/size/relative/missing/unreadable paths, aggregate privacy, cache invalidation, missing evidence combinations, strict/default-route distinctions, API price/hour labels, persistent stale-tour recovery and invalid/stale/removed evidence during replacement. No private data or real endpoints were used.

Initial targeted command from backend:

```powershell
$env:PYTHONPATH='.'
../.venv/Scripts/python.exe -m unittest tests.data.test_evidence tests.api.test_evidence -v
# Ran 16 tests in 6.258s; OK (before the additional stale-replacement regression)
```

Final complete discovery from backend (captured in `C:/Users/tuana/AppData/Local/Temp/foodtour-be06-discovery-final.log`):

```powershell
$env:PYTHONPATH='.'
../.venv/Scripts/python.exe -m unittest discover -s tests -t .
```

```text
Ran 151 tests in 14.106s
OK
discovery_exit=0
```

Repository root, generated schema only:

```powershell
./.venv/Scripts/python.exe tools/export_openapi.py
# Exported contracts/v1/openapi.json
./.venv/Scripts/python.exe tools/export_openapi.py --check
# OpenAPI matches server schema
```

Full integration was also run offline (captured in `C:/Users/tuana/AppData/Local/Temp/foodtour-be06-full-final.log`):

```powershell
$env:PIP_NO_INDEX='1'
$env:PIP_DISABLE_PIP_VERSION_CHECK='1'
$env:npm_config_offline='true'
$env:npm_config_audit='false'
$env:npm_config_fund='false'
$env:NEXT_TELEMETRY_DISABLED='1'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1
```

```text
Ran 156 tests in 14.213s
OK (skipped=1)
OpenAPI matches server schema
Compiled successfully in 873ms
ALL 12 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
PASS: all available checks passed; expected skips are listed above
script_exit=0
```

The five extra tests are legacy test_planner tests; the expected skip requires absent private venue/source data. It does not skip any overlay evidence test.

An independent local aggregate probe set FOODTOUR_DATA_PATH to a nonexistent absolute temporary path, FOODTOUR_EVIDENCE_PATH to the synthetic fixture, loaded the dataset and planned with the test FakeVerifiedRoutes versus the default estimator. Actual output:

```json
{"dataset_source":"synthetic","evidence_overlay":{"entries_loaded":3,"entries_rejected":0,"hours_verified":3,"prices_verified":3},"strict_fake_route":"verified_feasible","explore_default_route":"conditional"}
```

## Limits and human responsibilities

This validates a human-attestation schema; it cannot establish that a source actually proves the asserted hours or per-person cost. Metadata dates are checked for format/calendar validity, with no invented freshness/expiry policy; operators must supply honest, current evidence. Sources and original dates remain in the local overlay, tied to the content digest, rather than being exposed through the API. The fixture's attestations are deliberately fictional test inputs and must never be applied to real venues.

No holiday/date-specific exceptions, overnight intervals or 24:00 notation are supported. Missing mappings remain unknown, not guessed; explicit closed days can make planning infeasible. Historical totals keep the contract's venue_range_upper_sum_vnd field name for compatibility; individual prices carry accurate semantics. File updates should be atomic; an incomplete write returns a safe unavailable error. No network verification, scraping, real-data ingestion, dependencies or deployment occurred. Review and merge belong to Claude.
