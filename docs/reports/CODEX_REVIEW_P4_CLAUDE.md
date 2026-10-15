# Independent review — Claude phase 4

Reviewer: Codex. Review owner / implementation owner: Claude. Date: 2026-10-15.

Recommendation: **MERGE-AFTER-FIXES for the phase-4 origin trust boundary**. P4-R1 and P4-R2 below block accepting the claim that origins are always server-grounded from the user's stated place. The focused high-quality-polyline fix is independently ready; full discovery is green, but existing tests do not detect these adversarial model outputs. No reviewed planner, LLM, Gemini prompt/schema, eval or contract file was edited by Codex.

## Commits and scope

Reviewed the diff `2d55dc1^..foodtour-claude-coordinator` in backend/app/planner/, backend/app/llm/, backend/app/providers/gemini.py, qa/eval/, and contract v1.5. Relevant commits: **2d55dc1** (origin metadata/origin_text/Gemini/eval), **ba136f1** (origin resolution addendum), **cd4df65** (geocode auth/health clarification), and **5e49644** (replacement point-cap fix). The reviewed integration tip after the second merge was **5e49644**; **ecb4912** is the accepted PH4-BE board update. Existing explain.py was inspected even though phase 4 did not change it.

Codex PH4-BE baseline: **3e6c0a32f871725ede5a3d50dcf03643866ad6ae**. This task's polyline-quality fix, test and cost/volume documentation: **3e33c9c21eaec073a79a6b5139938a81e12d851e**. The review report itself is committed separately so its reviewed code hash remains stable.

## Findings ranked by severity

### P4-R1 — HIGH — raw model origin bypasses Gemini's server landmark mapping

Evidence: `backend/app/providers/gemini.py:170`–184 passes the model dictionary through, only mapping origin fields when origin_landmark is present. `backend/app/llm/provider.py:91` accepts raw origin coordinates; `:108` accepts origin_source=landmark; `:171`–177 trusts that source string and discards origin_text whenever any origin update exists.

Failing input: a fake model returns a dictionary with `origin` set to any invented coordinate object inside the existing pilot bounding box, `origin_source: "landmark"`, and `origin_label: "Invented marker"`, **without origin_landmark**. `LLMExtractor(GeminiExtractionProvider(fake_client)).extract(...)` returns status ok, no rejected fields, and the invented origin labelled landmark. A schema prompt is not a server validation boundary: the response parser accepts out-of-schema properties. Raw-origin support pre-existed for the generic HTTP extraction interface; phase 4 adds a trusted-looking landmark label/source and suppresses origin_text resolution on this path.

Actual local probe output (no network):

```json
{"probe": "P1_raw_origin_bypass", "status": "ok", "origin_accepted": true, "source": "landmark", "rejected": []}
```

Impact: an invalid or adversarial model response can select a start point that was neither user-supplied nor mapped from a known landmark, contradicting the provider comment and phase-4 no-invented-coordinate boundary. A concurrently supplied legitimate origin_text is dropped, so geocoding cannot correct it.

Suggested fix: at the Gemini adapter boundary, reject/remove raw origin, origin_label and origin_source from model output before mapping a strictly validated origin_landmark enum to server-owned coordinates and metadata. Keep generic-provider compatibility separate. Do not treat a model-controlled source string as proof of server resolution. Add an out-of-schema-output fake-model regression test, including raw origin plus origin_text.

### P4-R2 — HIGH — origin_text is not grounded in the cleaned user text

Evidence: `backend/app/providers/gemini.py:124`–125 asks the model to copy the exact user phrase, but `backend/app/llm/provider.py:55`–61 validates only type, size and ASCII controls. `:170`–183 returns that arbitrary phrase without checking it appeared in the input. The API at `backend/app/api/routes.py:252`–260 geocodes it and accepts the first result.

Failing input: user text `synthetic request for two hours`; fake model output `{"origin_text":"Invented place absent from input","duration_min":120}`. Both the extractor and the actual message endpoint accepted it. A fake geocoder was called once, and the response origin_source became geocoded. No Google/network request was made by the probe.

```json
{"probe": "P2_ungrounded_place", "accepted": true, "rejected": []}
{"probe": "P2_API_ungrounded_place", "http_status": 200, "geocoder_calls": 1, "origin_source": "geocoded"}
```

Impact: hallucinated output can trigger a paid geocode call and move the user's tour to an unintended location even though the contract defines origin_text as a phrase the user wrote. Schema/type validation does not enforce that rule.

Suggested fix: validate a normalized origin_text as a contiguous phrase in the cleaned current user input before returning it; reject it and leave origin missing otherwise. Preserve the original display phrase after comparison, never infer coordinates, and test invented/unrelated phrases, cleaned injection clauses and changed-origin follow-ups. Consider grounding landmark selection in the current input too.

### P4-R3 — MEDIUM, inherited — explanation checker accepts an unsupported all-day-opening claim

Evidence: `backend/app/llm/explain.py:144`–161 uses a narrow opening-claim regex. `:201` onward accepts text as llm when that checker returns no problems. This code was unchanged by phase 4, but is explicitly in this review's scope.

Failing input: on a conditional synthetic tour with unknown hours, `check_explanation("Goi y co dieu kien: tat ca quan mo suot ngay.", tour_facts(...))` returns an empty problem list. The statement asserts all venues are open all day; the uncertainty prefix does not make that supported. This spelling without diacritics is normalized by the checker just like Vietnamese with accents.

```json
{"probe": "P4_opening_claim", "tour_status": "conditional", "unknown_hours": true, "checker_problems": []}
```

Suggested fix: use structured, server-owned claim templates or a tightly constrained explanation format for operating-hours claims rather than relying on a blacklist of paraphrases. At minimum reject all-day-opening variants when hours are unknown and add this regression test. This does not invalidate deterministic tours, but it can give their accompanying text unsupported operational claims.

### P4-R4 — LOW — phase-4 eval positives cannot establish exact-phrase grounding

Evidence: `qa/eval/run_eval.py:46`–49 uses substring containment against the expected place; `:74` filters llm_only scenarios from rules evaluation. `qa/eval/scenarios.json:101`–131 adds only two positive free-text examples. The filtered 7-scenario rules score is legitimate for that subset; it is not evidence that the two new LLM-only scenarios or the API/geocode handoff passed.

Failing input to check_extraction: expected origin_text contains `dong xuan`; actual origin_text `dong xuan; then invent another place`. It returns no problems. An invented extra phrase can therefore pass the phase-4 origin-specific assertion.

```json
{"probe": "P5_eval_substring", "check_problems": []}
```

Suggested fix: retain diacritic-insensitive place comparison, but separately enforce that the complete model phrase is grounded in the input and add negative cases for extra locations/raw coordinates. Report evaluated/skipped LLM-only counts explicitly and add fake-model API tests so this boundary is checked without credentials. Do not present the rules-only run below as a Gemini evaluation.

### P4-R5 — LOW — Unicode control handling differs between extraction and the API

Evidence: `backend/app/llm/provider.py:24`, `:55`–61 checks C0/DEL only, whereas `backend/app/api/schemas.py:41`–44 rejects Unicode Cc/Cf/Cs in origin_label. A raw validated provider output containing a label with U+200B is accepted with no rejected fields, then rejected by the API schema.

```json
{"probe": "P3_unicode_validation", "extractor_status": "ok", "rejected_fields": [], "api_schema_rejects": true}
```

Impact: the extraction boundary reports success for a value the API cannot represent, producing a generic 422 instead of a useful rejected-field/missing-slot result. Gemini's normal server-mapped labels avoid this; adversarial output and generic live extraction can hit it. The API fails safely and does not emit the label.

Suggested fix: share the control-character policy at the extraction boundary, including origin_text, so rejected fields are explicit before API validation. P4-R1 also removes the direct Gemini label path.

## Resolved during review — replacement volume cap

The earlier expression allowed origin + 5 current stops + 40 candidates =46 points, contrary to the requested 45-point cost envelope. Raised through Orca; Claude authored **5e49644**, reducing candidates according to MAX_ROUTE_POINTS, with a regression test. Merged and verified in the full 202-test run. This item is **closed** for valid API tours of at most five stops; no Codex edit to planner files was needed. The volume table in CODEX_PH4_BE.md now uses 45 points / 2025 matrix elements and distinguishes diagnostics and SQLite restore overhead.

## Contract v1.5 vs implementation

| Area | Result / mismatch |
| --- | --- |
| client-config fields, null key/map ID when unavailable, browser-key-only ready path, no-store | Matches approved contract; no server key returned. |
| venues/map bbox, limit<=500, q, total_in_view/truncated, deterministic physical valid-geo snapshot, allowlist | Matches; price_max_vnd remains a venue range and map output makes no hours/per-person claims. |
| geocode token-only ownership, 401/403/429, <=5 results, HTTP 200 ok/zero_results/unavailable/quota | Matches the final addendum at CONTRACT.md:149. The earlier generic sentence at :142 says 503 for routing/geocoding failures; that conflicts with the approved addendum's HTTP 200 provider outcomes. Clarify the older text; implementation intentionally follows the specific addendum. |
| origin metadata | API and SQLite follow <=120 / enum / display-only rules. Planner types add metadata only; no relevance/feasibility calculation depends on it. Raw model boundary issues are P4-R1/R2 above. |
| free-text geocode success/failure and builtin no-call paths | API matches, but relies on extractor grounding that currently is not enforced (P4-R2). |
| long geocoder display label | API intentionally truncates the provider label to 120 characters at routes.py:259, while the addendum literally says origin_label=result.label. Clarify truncation in the contract to reconcile that with its <=120 rule; do not relax the API label limit. |
| tour route_provider / warnings / geometry | Implemented additively with warnings only on Google provider-route tours; estimated tours have empty warnings and no geometry. Fixed walking beta fallback when Google supplies no warning is task-authorized; contract could explicitly document that fallback. ORS/OSRM still retain their v1.4 provider geometry support; the v1.5 Google-specific sentence should not be read as removing legacy support. |
| missing/failed Google routing vs 503 wording | Existing planner receives unknown legs and can return an empty no_solution / insufficient_evidence tour rather than throwing 503 for every matrix failure; health carries the provider error kind. This preserves prior fail-closed planner behavior, but contract :142 should specify which failure states use 503 versus an empty planning outcome. |

No schema field-name drift was found. No contract text was edited in this review.

## Verification and reproduction method

Local stub clients supplied model dictionaries directly to GeminiExtractionProvider, then through LLMExtractor; no keys or network were used. For P4-R2 a TestClient message request used the same extractor and a counting fake geocoder. P4-R3 loaded the labelled synthetic fixture via an absent temporary path and generated a conditional tour with unknown hours. P4-R4 called the real eval check_extraction function. All probes printed only the aggregate results shown above; no request bodies, session tokens, real coordinates, private venue data or secrets were logged.

Example core reproduction of R1/R2 (fake client, not a real provider call):

```python
class Client:
    def __init__(self, answer): self.answer = answer
    def generate_json(self, *args, **kwargs): return self.answer.copy()

extractor = LLMExtractor(GeminiExtractionProvider(Client(model_dictionary)))
result = extractor.extract("synthetic request for two hours")
```

The initial scratch probe lacked PYTHONPATH, then attempted to pass the domain-shaped synthetic fixture as a private JSON input; both setup errors were corrected before the results above by setting PYTHONPATH=backend and using an absent temporary path for the labelled fixture fallback. Neither failure required a repository edit or provider call.

Actual commands for suite/eval verification:

```powershell
$env:PYTHONPATH='backend'
./.venv/Scripts/python.exe -m unittest backend.tests.providers.test_google_maps -q
./.venv/Scripts/python.exe scripts/run_unittests.py *> $env:TEMP/foodtour-ph4-be2-tests.txt
$testResult=$LASTEXITCODE
Get-Content $env:TEMP/foodtour-ph4-be2-tests.txt -Tail 5
Write-Output "UNITTEST_EXIT=$testResult"
./.venv/Scripts/python.exe tools/export_openapi.py --check
./.venv/Scripts/python.exe qa/eval/run_eval.py --data "$env:TEMP/foodtour-review-absent.json" --repeat 1
```

Actual outputs:

```text
Ran 11 tests in 1.326s
OK

Ran 202 tests in 18.694s
OK (skipped=1)
UNITTEST_EXIT=0
OpenAPI matches server schema
```

Rules-only eval aggregate output (full runner JSON contained per-scenario aggregate metrics; no venue data):

```json
{
  "dataset": {"source": "synthetic", "version": "13a60c746018", "venues": 13},
  "scenarios": 7,
  "extraction_success": "7/7",
  "provider_unavailable": 0,
  "extraction_correct_when_answered": "7/7",
  "tours_returned": 4,
  "invalid_tours": 0,
  "validity_gate": "PASS"
}
```

Eval exit 0. The documented private-data legacy skip and existing Starlette/httpx TestClient deprecation remain. No real Gemini/Google call, network test, browser test or dependency installation was performed in this follow-up. P4-R1/R2 require Claude fixes and independent re-verification; green current tests alone do not close them.
