# DATA-01: read-only versioned venue loader

Date: 2026-10-15. Author: Codex. Review owner: Claude.
Task: task_27d84c380b68 / ctx_d30d06fc3af7.
Base merged from foodtour-claude-coordinator: 3145d92 (fast-forward; no rebase).
Scope expansion: Orca msg_ea5095c55e11 adds CSV and the ds-1 aggregate audit.

## Delivered behavior

Added backend/app/data/ and synthetic-only unittest cases under backend/tests/data/.
No dependency changes or modifications to main.py, planner/, llm/, contracts/, frontend/, or private data.

`load_dataset(path=None) -> Dataset` reads an explicit absolute path, FOODTOUR_DATA_PATH, or <repo>/data/venues.json, in that precedence. It supports UTF-8/BOM CSV and JSON in the existing tools/audit.py list-of-rows shape. It reads bytes once and returns their full lowercase SHA-256 as dataset_version. It never invokes the old audit CLI or writes a dataset.

The returned Dataset exposes a tuple of planner.types.Venue objects, dataset_source (json/csv/synthetic), dataset_version, row counts, rejection counts and flag counts. `aggregate_report(dataset)` returns only counts and static reason codes; it contains no names, addresses, IDs, URLs, input paths or row contents.

Missing input alone triggers contracts/fixtures/venues.synthetic.json, sets dataset_source=synthetic and every loaded Venue.synthetic=True, and records absent_path_synthetic_fallback. The fallback version hashes the fixture bytes, not the absent filename. An existing malformed/unreadable file raises DatasetLoadError with sanitized count-only diagnostics; it never silently falls back. An existing valid empty list remains an explicitly empty snapshot with input_rows=0.

Coordinate validation rejects null, booleans, malformed, nonfinite, out-of-range coordinates and the (0,0) sentinel. An isolated zero axis remains valid. Retained venues get geo_ok only when the source flag is exactly ok (or the fallback fixture explicitly marks geo_ok). This is structural eligibility, **not geoverification**.

The source Shop Online tag sets online_only after splitting/trimming tags, without dropping the record. Unknown, zero, negative, fractional, inverted, malformed and status-invalid price ranges become a null pair; all prices retain price_evidence=estimate. Integral decimal strings are accepted for CSV compatibility. All hours stay None because neither current private schema supplies a verified weekday mapping; raw hours_displayed is kept as hours_display. Even fixture hours are conservatively unknown through this loader. No verification of operations, ingredients or allergies is inferred.

Rejected invalid rows do not consume duplicate identity slots. Valid rows sort by ID, URL and canonical JSON content, then deduplicate by ID, then nonempty source_url; output order and winners are independent of input row order. Empty URLs are flagged rather than collapsing unrelated IDs. Coordinate overlap is audited but does not by itself deduplicate venues. Rejection reasons count mutually exclusive dropped rows; flags may overlap and count retained rows.

## Commands and actual results

From worktree root:

```powershell
orca orchestration check --terminal term_80f429c1-def5-44fe-a042-5dcea458639f --json
git status --short
git merge foodtour-claude-coordinator
```

Actual merge output: `Updating 078226d..3145d92`, `Fast-forward`, 18 files changed. These are coordinator changes brought in by the requested merge, not DATA-01 edits.

Used the existing isolated Python 3.14.4 .venv from DATA-BE-00; no installs or upgrades.

From backend/:

```powershell
$env:PYTHONPATH='.'
$env:PYTHONDONTWRITEBYTECODE='1'
../.venv/Scripts/python.exe -m unittest discover -s tests -t .
```

Initial run: 38 tests collected, one new test failed because its duplicate-ID example used a different URL, so the deterministic canonical winner did not share the URL the assertion expected. The loader correctly selected that canonical winner. Corrected only the synthetic test input so the duplicate-ID and duplicate-URL cases exercise both intended stages.

Final actual output, exit 0:

```text
......................................
----------------------------------------------------------------------
Ran 38 tests in 0.800s

OK
```

This includes the unchanged Claude planner/extraction/explanation tests and new loader tests for null/zero/malformed/nonfinite coordinates, duplicates and ordering, online-only and geo flags, unknown/zero/invalid prices, unknown hours and no evidence promotion, CSV/BOM compatibility, malformed JSON/CSV, absent-file fallback and labels/hash, environment/default paths, sanitized reports, existing empty/unreadable inputs, unchanged input bytes, and loaded synthetic Venue objects passed to plan_tour then validate_tour. The integration assertion returns a conditional three-stop tour with no validation violations. This is synthetic deterministic integration, not live provider validation.

This command intentionally discovers tests/ only, as assigned. The older backend/test_planner.py is outside this discovery root and still imports main.py, which this task does not change; its prior private-input failure is documented in CODEX_BASELINE.md.

## Independent private snapshot audit

Read only these authorized paths in memory:

- ds-0: C:/Users/tuana/Documents/Codex/2026-10-15/referenced-chatgpt-conversation-this-is-an/outputs/ai-foodtour-planner/data/venues.json
- ds-1: C:/Users/tuana/Documents/Codex/2026-10-15/referenced-chatgpt-conversation-this-is-an/outputs/ai-foodtour-planner/data/raw/restaurants_enriched_1702_2026-10-15.csv

No data was copied into this worktree, persisted as a new snapshot, published, or committed.
The following exact script was piped to `../.venv/Scripts/python.exe -` from backend/ with PYTHONPATH=. and PYTHONDONTWRITEBYTECODE=1:

```python
import csv, hashlib, io, json, math, unicodedata
from collections import Counter
from pathlib import Path
from app.data import load_dataset, aggregate_report
root = Path("C:/Users/tuana/Documents/Codex/2026-10-15/referenced-chatgpt-conversation-this-is-an/outputs/ai-foodtour-planner/data")
results = {}
for label, path in [("ds-0", root / "venues.json"), ("ds-1", root / "raw/restaurants_enriched_1702_2026-10-15.csv")]:
    blob = path.read_bytes()
    if path.suffix == ".csv":
        reader = csv.DictReader(io.StringIO(blob.decode("utf-8-sig")))
        rows = list(reader)
        fields = reader.fieldnames
    else:
        rows = json.loads(blob)
        fields = list(rows[0])
    def dup(keys):
        groups = Counter(tuple(unicodedata.normalize("NFC", str(r.get(k) or "")).strip().casefold() for k in keys) for r in rows)
        return sum(n - 1 for n in groups.values() if n > 1)
    coords = Counter()
    for r in rows:
        try:
            lat, lon = float(r["lat"]), float(r["lon"])
            if not all(map(math.isfinite, (lat, lon))) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                coords["malformed_nonfinite_or_out_of_bounds"] += 1
            elif (lat, lon) == (0, 0):
                coords["zero_pair"] += 1
            else:
                coords["finite_in_range_nonzero_pair"] += 1
        except (TypeError, ValueError, KeyError):
            coords["malformed_nonfinite_or_out_of_bounds"] += 1
    ds = load_dataset(path)
    results[label] = {
        "rows": len(rows), "columns": len(fields), "sha256": hashlib.sha256(blob).hexdigest(),
        "duplicate_excess": {"+".join(keys): dup(keys) for keys in [("foody_id",), ("source_url",), ("name", "address"), ("lat", "lon")]},
        "price_status": dict(Counter(r.get("price_status") for r in rows)),
        "hours_status": dict(Counter(r.get("hours_status") for r in rows)),
        "geo_status": dict(Counter(r.get("geo_status") for r in rows)),
        "hours_day_codes_raw": dict(Counter(str(r.get("hours_day_codes_raw")) for r in rows)),
        "price_semantics": dict(Counter(r.get("price_semantics") for r in rows)),
        "online_only_rows": sum("Shop Online" in [tag.strip() for tag in (r.get("venue_types") or "").split("|")] for r in rows),
        "missing_dish_groups": sum(not (r.get("dish_groups") or "").strip() for r in rows),
        "missing_name_address_id": {k: sum(not str(r.get(k) or "").strip() for r in rows) for k in ("name", "address", "foody_id")},
        "coordinates": dict(coords),
        "hoan_kiem_rows": sum("hoan kiem" in "".join(c for c in unicodedata.normalize("NFD", r.get("district", "").casefold()) if not unicodedata.combining(c)) for r in rows),
        "loader_report": aggregate_report(ds),
        "dataset_source": ds.dataset_source,
        "all_hours_unknown": all(v.hours is None for v in ds.venues),
        "all_prices_estimate": all(v.price_evidence == "estimate" for v in ds.venues),
    }
print(json.dumps(results, ensure_ascii=True, indent=2))
```

Actual aggregate output, exit 0:

```json
{
  "ds-0": {
    "rows": 36,
    "columns": 44,
    "sha256": "63cd06e782ac85a603f02e5fb2a89fc687f0359905b3d4891bcbd99cdcf9b2b9",
    "duplicate_excess": {
      "foody_id": 0,
      "source_url": 0,
      "name+address": 0,
      "lat+lon": 0
    },
    "price_status": {
      "ok": 35,
      "unknown_zero": 1
    },
    "hours_status": {
      "day_mapping_unknown": 36
    },
    "geo_status": {
      "ok": 36
    },
    "hours_day_codes_raw": {
      "[4]": 36
    },
    "price_semantics": {
      "venue price range, not individual dish or per-person guaranteed budget": 36
    },
    "online_only_rows": 2,
    "missing_dish_groups": 0,
    "missing_name_address_id": {
      "name": 0,
      "address": 0,
      "foody_id": 0
    },
    "coordinates": {
      "finite_in_range_nonzero_pair": 36
    },
    "hoan_kiem_rows": 4,
    "loader_report": {
      "input_rows": 36,
      "loaded_rows": 36,
      "rejected_rows": 0,
      "rejections_by_reason": {},
      "flags_by_reason": {
        "online_only": 2,
        "unknown_hours": 36,
        "unknown_price": 1
      }
    },
    "dataset_source": "json",
    "all_hours_unknown": true,
    "all_prices_estimate": true
  },
  "ds-1": {
    "rows": 1702,
    "columns": 43,
    "sha256": "936eb167cf00e82b39c80b4cc8ec3a770e94c1cf243981661d3881f8f9cb7816",
    "duplicate_excess": {
      "foody_id": 0,
      "source_url": 0,
      "name+address": 0,
      "lat+lon": 5
    },
    "price_status": {
      "ok": 1614,
      "unknown_zero": 84,
      "invalid_range": 4
    },
    "hours_status": {
      "day_mapping_unknown": 1692,
      "missing": 10
    },
    "geo_status": {
      "ok": 1702
    },
    "hours_day_codes_raw": {
      "[4]": 1692,
      "[]": 10
    },
    "price_semantics": {
      "venue price range, not individual dish or per-person guaranteed budget": 1702
    },
    "online_only_rows": 88,
    "missing_dish_groups": 30,
    "missing_name_address_id": {
      "name": 0,
      "address": 0,
      "foody_id": 0
    },
    "coordinates": {
      "finite_in_range_nonzero_pair": 1702
    },
    "hoan_kiem_rows": 238,
    "loader_report": {
      "input_rows": 1702,
      "loaded_rows": 1702,
      "rejected_rows": 0,
      "rejections_by_reason": {},
      "flags_by_reason": {
        "missing_dish_tags": 30,
        "online_only": 88,
        "unknown_hours": 1702,
        "unknown_price": 88
      }
    },
    "dataset_source": "csv",
    "all_hours_unknown": true,
    "all_prices_estimate": true
  }
}
```

The ds-1 hash matches the coordinator/human manifest exactly. Independently confirmed 1,702 rows x 43 columns, 1,614 ok prices / 84 unknown_zero / 4 invalid_range, 88 trimmed Shop Online tags, 30 missing dish_groups, 1,692 unknown weekday mappings / 10 missing hours, and 238 district matches for Hoan Kiem. An initial exploratory tag count of 82 omitted whitespace trimming; the corrected independent audit above agrees with the loader's 88. There are zero duplicate IDs, URLs or normalized name+address tuples, but five excess coordinate pairs. Shared coordinates do not establish duplicate businesses.

All 1,702 source geo_status values say ok and all pairs are finite/in-range/nonzero; none were independently geoverified. The loader retains 1,702 rows and flags 88 unknown price pairs, 88 online-only records and all 1,702 unknown-hours records. Not having the online-only tag does not establish dine-in suitability.

ds-0 remains independently selectable by its absolute JSON path and loads all 36 rows. Its JSON has 44 keys because tools/audit.py adds id to the 43 source fields. It has two online-only flags, one unknown price pair and 36 unknown-hour flags. Its version is distinct from ds-1. Neither version overwrites the other.

## Review and limitations

Claude must review before integration. main.py has not been wired to this loader; that belongs to BE-01. Explicit verified weekday mapping support requires an agreed source schema before future ingestion can promote hours. Current evidence never qualifies venue prices as a per-person bill.

No DB startup/migration, real routing, live LLM, network scraping, frontend/browser QA, public reuse authorization, or real venue opening/allergy verification was performed. The fallback is labeled synthetic at Dataset and Venue level; downstream HTTP integration must preserve those labels. Rows with missing URLs are retained but flagged for future provenance policy. Deterministic duplicate selection establishes reproducibility, not which conflicting source row is factually correct.
