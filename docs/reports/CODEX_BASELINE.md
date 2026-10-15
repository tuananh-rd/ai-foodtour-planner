# Codex baseline and private-input audit

Date: 2026-10-15. Task: DATA-BE-00 / task_be0f9810b29d / ctx_f3ddc4065607.
Author: Codex. Review owner: Claude; this commit is not self-approved.
Baseline source commit: 08041a17dbdb99e5ce16ab795bf3bcd9f69e4fe8.
Branch: foodtour-codex-backend.

## Result and scope

**Baseline tests FAIL: 4 pass, 1 fails, 5 collected.** Installation in an isolated environment succeeds; the API starts and smoke checks pass for the empty-dataset behavior. The failing test depends on private input absent from this worktree. No production, contract, frontend, or dataset files were changed, and no raw/derived venue data was copied. This report contains aggregate counts only.

Read AGENTS.md, docs/PROJECT_RULES.md, docs/AGENT_TASKS.md, and the complete docs/reference/WORD_PLAN.md before auditing. New shared rules govern over the Word document's older six-agent design. Reviewed README.md, backend/requirements.txt, backend/test_planner.py, backend/app/main.py, tools/audit.py, compose.yaml, db/001_init.sql, and .gitignore.

## Commands and actual evidence

Commands below use PowerShell. Paths are relative to the worktree root unless a different directory is stated. No global packages, extra test dependencies, dependency-file upgrades, scraping, or paid services were used.

### Initial environment and documented installation

Ran:

```powershell
python --version
python -m pip --version
python -m pip show fastapi uvicorn httpx pydantic
docker --version
docker compose version
```

All three Python commands printed:

```text
Python was not found; run without arguments to install from the Microsoft Store, or disable this shortcut from Settings > Apps > Advanced app settings > App execution aliases.
```

Both Docker commands reported: `docker : The term 'docker' is not recognized as the name of a cmdlet, function, script file, or operable program.`
Docker/PostGIS startup, SQL execution, migration/rollback, and DB integration are **NOT RUN**.

Initial test attempt, from backend/:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
python -m unittest discover -v
```

Tool process exit 1; same Python-not-found message; no tests collected.

Also attempted from root:

```powershell
python -m pip install -r backend/requirements.txt
Write-Output "pip_exit=$LASTEXITCODE"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
Write-Output "uvicorn_exit=$LASTEXITCODE"
```

Each printed the same Python-not-found message, followed by `pip_exit=9009` and `uvicorn_exit=9009`. The latter command was blocked before import and does not establish the root as a valid app working directory.

Claude's Orca message msg_77547b651d31 authorized using an existing portable Python, creating an ignored local venv, and installing only requirements.txt dependencies. Ran:

```powershell
& 'D:/Downloads/thonny-5.0.0-windows-portable-x64/python.exe' --version
& 'D:/Downloads/thonny-5.0.0-windows-portable-x64/python.exe' -m venv .venv
./.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
./.venv/Scripts/python.exe -m pip freeze
```

Actual version: `Python 3.14.4`. Installation exit 0:

```text
Successfully installed annotated-doc-0.0.5 annotated-types-0.8.0 anyio-4.15.1 certifi-2026.7.22 click-8.5.0 fastapi-0.143.1 h11-0.16.0 httpcore-1.0.9 httpx-0.28.1 idna-3.20 opentelemetry-api-1.45.1 pydantic-2.14.1 pydantic-core-2.50.1 starlette-1.8.0 typing-extensions-4.16.0 typing-inspection-0.4.4 uvicorn-0.54.0
```

`pip freeze` confirmed those versions (distribution spelling `pydantic_core==2.50.1`). Requirements use ranges rather than a lock; this is evidence for these resolved versions and Python 3.14.4, not a claim of reproducing another machine's versions or testing Python 3.11/3.12. Ignored .venv is local installation state, not a deliverable.

### Actual tests after installation

From backend/:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
../.venv/Scripts/python.exe -m unittest discover -v
Write-Output "test_exit=$LASTEXITCODE"
```

Actual output (absolute traceback prefix shortened):

```text
StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
test_budget_and_source (test_planner.PlannerTests.test_budget_and_source) ... FAIL
test_no_match (test_planner.PlannerTests.test_no_match) ... ok
test_strict_refuses_unknown (test_planner.PlannerTests.test_strict_refuses_unknown) ... ok
test_unknown_price_never_free (test_planner.PlannerTests.test_unknown_price_never_free) ... ok
test_validation (test_planner.PlannerTests.test_validation) ... ok

FAIL: test_budget_and_source (test_planner.PlannerTests.test_budget_and_source)
Traceback (most recent call last):
  File ".../backend/test_planner.py", line 12, in test_budget_and_source
    self.assertTrue(result['stops'])
AssertionError: [] is not true

Ran 5 tests in 0.293s
FAILED (failures=1)
test_exit=1
```

No dependency was added in response to the deprecation warning. `Test-Path data/venues.json` returned `False`. Static inspection confirms load() hardcodes ROOT/data/venues.json and returns [] if missing. There is no environment/configuration hook for an absolute private input path; no second data-backed test run was attempted. In particular, the unknown-price exclusion test passes vacuously with an empty list, and HTTP 200 alone does not prove useful planning. A synthetic test fixture and a configurable loader path are needed in a separately scoped implementation task.

### Actual local API startup and smoke

From backend/, with PYTHONDONTWRITEBYTECODE=1:

```powershell
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Exit 1 after startup: `[Errno 10048] error while attempting to bind on address ('127.0.0.1', 8000): [winerror 10048] only one usage of each socket address (protocol/network address/port) is normally permitted`. Existing process was not touched.

Ran the same command with `--port 18080`. Actual output:

```text
INFO:     Started server process [37820]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:18080 (Press CTRL+C to quit)
```

In another command while that server was running:

```powershell
$health=Invoke-RestMethod http://127.0.0.1:18080/health
$venues=Invoke-RestMethod http://127.0.0.1:18080/v1/venues
$body=@{lat=21.03;lon=105.85;budget_vnd=200000;duration_min=120} | ConvertTo-Json
$plan=Invoke-RestMethod http://127.0.0.1:18080/v1/plans -Method Post -ContentType application/json -Body $body
Write-Output "health=$($health.status) dataset_loaded=$($health.dataset_loaded) venue_count=$($venues.items.Count) explore_status=$($plan.status) stop_count=$($plan.stops.Count)"
$strict=Invoke-RestMethod http://127.0.0.1:18080/v1/plans -Method Post -ContentType application/json -Body (@{lat=21.03;lon=105.85;budget_vnd=200000;duration_min=120;mode='strict'}|ConvertTo-Json)
Write-Output "strict_status=$($strict.status) stop_count=$($strict.stops.Count)"
try {Invoke-RestMethod http://127.0.0.1:18080/v1/plans -Method Post -ContentType application/json -Body '{"lat":999}'}catch{Write-Output "invalid_request_http=$([int]$_.Exception.Response.StatusCode)"}
```

Actual output:

```text
health=ok dataset_loaded=False venue_count=0 explore_status=no_candidates stop_count=0
strict_status=insufficient_evidence stop_count=0
invalid_request_http=422
```

Server access output confirmed HTTP 200 for health, venues, explore, strict, and HTTP 422 for the invalid request. The task-owned server was stopped with Ctrl+C (tool exit 1 from interruption). This is local HTTP evidence only; no frontend, real routing, LLM, or DB was validated.

### Documented steps deliberately not executed

README's `python tools/audit.py 'PATH/TO/restaurants_enriched (1).csv'` writes docs/audit.json AND data/venues.json and prints record-bearing exceptions/duplicate keys. It violates this task's report-only/read-only scope. The audit below uses memory only.

Frontend installation/build belongs to Antigravity's independent task; not run here. compose.yaml requires POSTGRES_PASSWORD and only starts PostGIS 17-3.5; it does not boot the API. No password was set and no Docker image was pulled.

## Read-only private data audit

Input was read by its explicitly authorized absolute path:
C:/Users/tuana/Documents/Codex/2026-10-15/referenced-chatgpt-conversation-this-is-an/outputs/ai-foodtour-planner/data.
Directory enumeration found venues.json (85,705 bytes) and raw/restaurants_enriched (1).csv (46,423 bytes). No old 80-row source file was present in this directory, so older source_flags claims from the Word reference were not revalidated.

Executed the following PowerShell audit, exit 0; it does not write files or emit venue identities:

```powershell
$dataRoot='C:/Users/tuana/Documents/Codex/2026-10-15/referenced-chatgpt-conversation-this-is-an/outputs/ai-foodtour-planner/data'
$csvPath=Join-Path $dataRoot 'raw/restaurants_enriched (1).csv'
$rows=@(Import-Csv -LiteralPath $csvPath -Encoding UTF8)
$venues=Get-Content -LiteralPath (Join-Path $dataRoot 'venues.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$fields=@($rows[0].PSObject.Properties.Name)
$missing=[ordered]@{}
foreach($field in $fields){$n=@($rows | Where-Object {[string]::IsNullOrWhiteSpace($_.$field)}).Count; if($n){$missing[$field]=$n}}
$bad=0; $zero=0; $nonfinite=0
foreach($row in $rows){
 $latValue=0.0; $lonValue=0.0
 $parsed=[double]::TryParse($row.lat,[Globalization.NumberStyles]::Float,[Globalization.CultureInfo]::InvariantCulture,[ref]$latValue) -and [double]::TryParse($row.lon,[Globalization.NumberStyles]::Float,[Globalization.CultureInfo]::InvariantCulture,[ref]$lonValue)
 if(!$parsed){$bad++;continue}
 if([double]::IsNaN($latValue) -or [double]::IsInfinity($latValue) -or [double]::IsNaN($lonValue) -or [double]::IsInfinity($lonValue)){$nonfinite++;continue}
 if($latValue -eq 0 -or $lonValue -eq 0){$zero++}
 if($latValue -lt -90 -or $latValue -gt 90 -or $lonValue -lt -180 -or $lonValue -gt 180){$bad++}
}
function DuplicateStats($keys){
 $groups=@($rows | Group-Object -Property { $r=$_; ($keys | ForEach-Object {([string]$r.$_).Normalize().Trim().ToLowerInvariant()}) -join [char]31 } | Where-Object Count -gt 1)
 $excess=0; foreach($g in $groups){$excess+=$g.Count-1}
 [ordered]@{groups=$groups.Count;excess_rows=$excess}
}
$dupes=[ordered]@{}
foreach($keys in @(@('foody_id'),@('source_url'),@('name','address'),@('lat','lon'),$fields)){$label=if($keys.Count -eq $fields.Count){'whole_row'}else{$keys -join '+'};$dupes[$label]=DuplicateStats $keys}
$priceGood=0;$priceMissing=0;$priceZero=0;$priceBad=0;$rawZero=0
foreach($r in $rows){
 if([string]::IsNullOrWhiteSpace($r.price_min_vnd_norm) -or [string]::IsNullOrWhiteSpace($r.price_max_vnd_norm)){$priceMissing++}
 else{
 $minValue=0L;$maxValue=0L
 if(!([long]::TryParse($r.price_min_vnd_norm,[ref]$minValue)) -or !([long]::TryParse($r.price_max_vnd_norm,[ref]$maxValue)) -or $minValue -lt 0 -or $maxValue -lt $minValue){$priceBad++}
 elseif($minValue -eq 0 -or $maxValue -eq 0){$priceZero++}else{$priceGood++}
 }
 if($r.price_min_raw -eq '0' -or $r.price_max_raw -eq '0'){$rawZero++}
}
$distribution=[ordered]@{}
foreach($field in @('geo_status','price_status','hours_status','hours_day_codes_raw','price_semantics')){
 if($fields -contains $field){$counts=[ordered]@{};foreach($g in ($rows | Group-Object $field)){$counts[$g.Name]=$g.Count};$distribution[$field]=$counts}
}
$hoursBad=0;foreach($r in $rows){try{$null=ConvertFrom-Json -InputObject $r.opening_hours_raw -ErrorAction Stop}catch{$hoursBad++}}
$result=[ordered]@{
 csv_rows=$rows.Count;csv_columns=$fields.Count;json_rows=$venues.Count
 missing_nonzero_fields=$missing;malformed_or_out_of_bounds_coords=$bad;nonfinite_coords=$nonfinite;zero_coords=$zero
 duplicates=$dupes;online_only_rows=@($rows|Where-Object {$_.venue_types -match '(^|\|)\s*Shop Online\s*(\||$)'}).Count
 raw_hours_missing=@($rows|Where-Object {[string]::IsNullOrWhiteSpace($_.opening_hours_raw)}).Count;raw_hours_bad_json=$hoursBad
 positive_ordered_normalized_price_pairs=$priceGood;missing_normalized_price_pairs=$priceMissing;zero_normalized_price_pairs=$priceZero;malformed_negative_inverted_price_pairs=$priceBad;raw_zero_price_rows=$rawZero
 distribution=$distribution
 csv_json_id_sets_equal=(@(Compare-Object @($rows.foody_id|Sort-Object) @($venues.id|Sort-Object)).Count -eq 0)
 json_null_min_price=@($venues|Where-Object {$null -eq $_.price_min_vnd_norm}).Count
 json_null_max_price=@($venues|Where-Object {$null -eq $_.price_max_vnd_norm}).Count
 distinct_districts=@($rows.district|Sort-Object -Unique).Count
 source_url_missing=@($rows|Where-Object {[string]::IsNullOrWhiteSpace($_.source_url)}).Count
 source_license_column_present=($fields -contains 'source_license')
}
$result | ConvertTo-Json -Depth 8
```

Actual aggregate output:

```json
{
    "csv_rows":  36,
    "csv_columns":  43,
    "json_rows":  36,
    "missing_nonzero_fields":  {
                                   "cuisine_styles":  3,
                                   "audiences":  5,
                                   "prep_time_raw":  4,
                                   "prep_time_min":  4,
                                   "prep_time_max":  4,
                                   "capacity_raw":  4,
                                   "capacity_value":  4,
                                   "holiday_raw":  4,
                                   "rating_quality":  6,
                                   "rating_location":  4,
                                   "rating_service":  5,
                                   "rating_space":  7,
                                   "rating_price":  5,
                                   "amenities_yes":  3,
                                   "amenities_no":  36,
                                   "price_min_vnd_norm":  1,
                                   "price_max_vnd_norm":  1
                               },
    "malformed_or_out_of_bounds_coords":  0,
    "nonfinite_coords":  0,
    "zero_coords":  0,
    "duplicates":  {
                       "foody_id":  {
                                        "groups":  0,
                                        "excess_rows":  0
                                    },
                       "source_url":  {
                                          "groups":  0,
                                          "excess_rows":  0
                                      },
                       "name+address":  {
                                            "groups":  0,
                                            "excess_rows":  0
                                        },
                       "lat+lon":  {
                                       "groups":  0,
                                       "excess_rows":  0
                                   },
                       "whole_row":  {
                                         "groups":  0,
                                         "excess_rows":  0
                                     }
                   },
    "online_only_rows":  2,
    "raw_hours_missing":  0,
    "raw_hours_bad_json":  0,
    "positive_ordered_normalized_price_pairs":  35,
    "missing_normalized_price_pairs":  1,
    "zero_normalized_price_pairs":  0,
    "malformed_negative_inverted_price_pairs":  0,
    "raw_zero_price_rows":  0,
    "distribution":  {
                         "geo_status":  {
                                            "ok":  36
                                        },
                         "price_status":  {
                                              "ok":  35,
                                              "unknown_zero":  1
                                          },
                         "hours_status":  {
                                              "day_mapping_unknown":  36
                                          },
                         "hours_day_codes_raw":  {
                                                     "[4]":  36
                                                 },
                         "price_semantics":  {
                                                 "venue price range, not individual dish or per-person guaranteed budget":  36
                                             }
                     },
    "csv_json_id_sets_equal":  true,
    "json_null_min_price":  1,
    "json_null_max_price":  1,
    "distinct_districts":  10,
    "source_url_missing":  0,
    "source_license_column_present":  false
}
```

Correction/verification: the audit's `raw_zero_price_rows=0` above compares exact text '0'; the source uses a different numeric representation. A subsequent numeric check (below) returned **1**, which is the authoritative numeric-zero count. The first exploratory audit also wrapped the JSON array unnecessarily under Windows PowerShell, reporting json_rows=1 and null counts=0; the rerun above removes that wrapper and correctly measures 36 JSON rows and one null in each normalized price field. No records were changed.

```powershell
$rows=Import-Csv -LiteralPath 'C:/Users/tuana/Documents/Codex/2026-10-15/referenced-chatgpt-conversation-this-is-an/outputs/ai-foodtour-planner/data/raw/restaurants_enriched (1).csv' -Encoding UTF8
$count=0
foreach($r in $rows){
 $a=0.0;$b=0.0
 if(([double]::TryParse($r.price_min_raw,[ref]$a) -and $a -eq 0) -or ([double]::TryParse($r.price_max_raw,[ref]$b) -and $b -eq 0)){$count++}
}
Write-Output "raw_numeric_zero_price_rows=$count"
```

Output: `raw_numeric_zero_price_rows=1`.

Findings:

- 36 CSV rows, 43 columns, 36 JSON rows; ID sets match. This checks ID correspondence, not full field-by-field derivation equivalence.
- No missing IDs, names, addresses, coordinates, or source URLs. Zero malformed, nonfinite, out-of-range, or zero coordinate rows. This establishes syntactic plausibility only, not location verification.
- Zero duplicate groups and excess rows for ID, source URL, normalized name+address, coordinate text pair, and full row. NFC/trim/casefold-style normalization uses .NET ToLowerInvariant; this is not fuzzy deduplication or a proof of distinct physical businesses.
- Two rows are explicitly tagged Shop Online; the remaining 34 are not thereby proven dine-in.
- All 36 raw-hours values are present and parse as JSON, but all 36 have day_mapping_unknown and day code [4]. Zero verified weekday schedules; nonempty JSON does not establish open-at feasibility.
- 35 positive ordered normalized price pairs, one missing pair (JSON null for each bound), no zero normalized pairs or malformed/negative/inverted pairs. One numeric-zero raw price row remains unknown after normalization.
- All 36 price semantics identify venue ranges, not dish prices or guaranteed per-person spend. Party size/currency basis and actual portions remain unresolved for budgeting.
- Missing-field counts are printed above; fields omitted from missing_nonzero_fields have zero blank CSV cells. Empty amenities_no for all 36 does not mean all amenities are present or safe.
- 10 districts and zero missing URLs do not establish a feasible walking cluster. No venue operations, ingredients, allergies, source permission, or freshness were independently verified. source_license is absent; permission remains unresolved.

## Risks in the existing implementation

These are static observations unless covered by the command evidence above.

1. Tests require private data and include a source-specific identity. A clean worktree cannot reproduce all five passes; empty results allow several assertions to pass vacuously.
2. tools/audit.py float/int conversions can throw on malformed/blank input and do not explicitly reject zero coordinates; no canonical row rejection/quarantine layer exists. Bounds checks alone do not establish walkability.
3. plan() trusts row fields/status flags, does not validate uniqueness by ID, and removes only the chosen row. Duplicate IDs with different rows could enter a tour. Missing/malformed fields can raise errors. These cases have no baseline regression tests.
4. Greedy nearest-next selection filters by accumulated venue upper bounds. It does not solve a party budget, check all combinations, or optimize tour-level diversity. duration_min only caps assumed 30-minute visits; travel is excluded. Responses disclose these limitations, but no hard-constraint tour validator exists.
5. Strict always rejects; conditional discovery does not check opening schedules, live operations, dietary evidence, unreachable/asymmetric routes, or stop locks. None of those planner capabilities is implemented or validated.
6. Every request rereads a local JSON file; absent file is silently empty. No dataset version, atomic snapshot boundary, storage repository, DB integration, sessions, revisions, ownership, expiry, rate limiting, or provider adapters exist.
7. /v1/venues returns raw loaded attributes. Future storage/provider fields need an intentional response allowlist and reviewed compatibility treatment.
8. SQL is an initialization script, not a tested migration chain. Nullable coordinates, unconstrained price_semantics/hours_status, and nullable range checks need review before canonical import; no live DB claim is made.
9. Dependency ranges and Python-version drift prevent bit-for-bit environment reproduction. HTTP smoke and unit tests provide no desktop/mobile or independent integration acceptance.

## Proposed extraction boundary for Claude approval

Proposal only; no files or contracts changed.

First extract without behavior changes, preserving POST /v1/plans, GET /v1/venues, GET /health, current PlanRequest defaults/validation, response keys, strict/no-candidates behavior, warning text, and HTTP statuses. Keep app.main:app runnable and temporarily re-export PlanRequest, plan, load, and app because current tests import them directly. Do not mix that compatibility extraction with new planner policy.

| Boundary | Proposed location / ownership | Responsibility |
| --- | --- | --- |
| App composition | backend/app/main.py, Codex | FastAPI factory/wiring, CORS and route registration |
| API schema and routes | backend/app/api/ and backend/app/schemas/, Codex | Request validation, existing HTTP response mapping, dependency injection |
| Venue storage | backend/app/repositories/, Codex | Read-only list/detail/snapshot interface; JSON adapter first, DB later |
| Pure planning | backend/app/planner/, Claude | Existing distance/plan first; then deterministic candidate selection, checking, ordering and replacement |
| LLM behavior | backend/app/llm/, Claude | Validated extraction, missing-slot policy, grounded explanation; no tour authority |
| Provider transport | backend/app/providers/, Codex | Routing/LLM HTTP clients, credentials, deadlines, error/quota mapping behind approved interfaces |
| Data validation/import | tools/ and db/, Codex | Source adapter, canonical validation, null semantics, dedupe and provenance |

Initial planner seam: `plan(req, rows) -> result` with no FastAPI, filesystem, environment, DB, or network dependencies. Move distance with it. Freeze the input/output types with Claude before dependent edits; avoid leaking Pydantic API DTOs into the final domain boundary.

Repository seam should supply a validated immutable candidate snapshot with explicit dataset version and unknown evidence preserved. Add a configured absolute JSON input path for local read-only use with an unchanged default; never copy private data into fixtures. Baseline unit tests should use clearly labeled synthetic rows and independently test the loader's absent/malformed-file behavior.

Next approved planner interface should consume preferences, candidate snapshot, actual directed route-matrix entries (including unavailable/unreachable), and locks; it should return checked feasible/conditional/insufficient-evidence/no-solution results. The server runs extraction -> validation -> deterministic planning -> hard-constraint check -> grounded explanation. Unknown ETA/geometry, prices, hours, ingredients and operations stay unknown. Locks preserve venue identity and order; timestamps may change.

Codex should extract main.py only under a fresh coordinated task while Claude avoids that file. Claude reviews the extraction; Codex then reviews Claude-owned planner/LLM changes. FastAPI-generated OpenAPI is the API source of truth; export a versioned reviewed contract and compare for drift before frontend consumption. New endpoints/status semantics or changes to /v1/plans need Claude and affected-owner review.

## Follow-up and acceptance limits

Next work needs scoped synthetic fixtures, a configurable read-only loader, canonical data validation tests (null/malformed/zero/duplicates/online-only/unknown-hours), and preserved-contract extraction tests. Later acceptance must cover no solution, budget basis, directed unreachable routing, locks, session isolation and revision conflicts, plus independent desktop/mobile QA.

No baseline failure was repaired or hidden. Claude clarified in msg_895c1342868d that the completed audit/report may settle succeeded despite the recorded failing baseline; the baseline itself remains FAILED. The report is the only tracked change and requires Claude's review before integration.
