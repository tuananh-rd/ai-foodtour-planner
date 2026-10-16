# Codex independent review — C0-HF-B

Date: 2026-10-16. Author: Codex (backend/API and independent reviewer).
Reviewed Claude production commit: `90a419d` (merged branch through `d35b67e`).
Decision: **REQUEST CHANGES** for Claude's extractor/LLM portion. Planner allergy eligibility,
conditional status, replacement and validation checks passed the tested cases.
Claude reviews the accompanying Codex API implementation; this is not a self-approved merge.

## Delivered API change

`backend/app/api/schemas.py` exposes `allergies`, defaults to an independent empty list,
limits to ten strings of 1–40 characters after stripping, and rejects Unicode Cc/Cf/Cs
before stripping (including tabs/newlines, DEL, zero-width format characters and surrogates).
Both domain conversions retain the field. Existing PUT, message, GET and SQLite serialization
paths therefore retain it without new storage code or a DB migration. Old SQLite preferences
without the field load with an empty list and their restored tour still exists.

`backend/tests/api/test_c0_hf.py` adds eight API tests. They use the existing labeled synthetic
fixture extended in temporary storage with explicit crab/seafood candidates, so filtering and
replacement assertions exercise actual allergen candidates. Tests cover the requested chat
sentence, 3-to-4 party edit, bare avoidance clarification, restarted GET with identical stop
identities and a passing domain checker, old stored preferences, successful replacement,
PUT/GET/restart trimming, and malformed PUT allergies returning 422. No private data,
credentials, external services or network provider calls were used.

No contract fixture currently lists preferences (`rg preferences contracts/fixtures` returned
no matches). The generated contract is `contracts/v1/openapi.json`, the path used by the export
script and repository drift test.

## Findings with reproductions

### HIGH H1 — ordinary adjacent constraints still silently discard an allergy

Run `MockExtractor().extract('dị ứng cua 4 người')` or the unaccented
`di ung cua 4 nguoi`: `allergies=()`, `party_size=4`, `notes=()`.
`_allergy_terms` rejects the entire captured chunk when `_NOT_A_TERM` sees a digit/party word.
The API consequently plans with no allergy constraint or ingredient warning. Likewise,
`dị ứng cua <img src=x onerror=alert(1)>` yields no allergy and no note because of its digit.
Recognize the ingredient independently of trailing slots, or preserve an explicit unresolved
allergy and ask for clarification; never silently proceed as if no allergy was reported.

### MEDIUM M1 — successful LLM path loses mandatory safety/clarification notes

Construct `RulesFirstExtractor(MockExtractor(), LLMExtractor(provider))` where the local stub
provider returns JSON `{}`. Extract `tôi dị ứng cua, 4 người, 600k cả nhóm` with default
preferences: `source=live`, `allergies=('cua',)`, `notes=()`. Repeat: `source=cache`, same empty
notes. `_keep_rules` merges the allergy field but does not retain `base.notes`; the core
safety warning is absent. Bare avoidance clarification has the same structural problem.
Merge validated rules notes as well as fields, including on cache results. No live LLM was used.

### MEDIUM M2 — negation and resolved-history phrases become positive allergies

Actual deterministic outputs:

```text
không bị dị ứng gì -> ('gì',)
không dị ứng cua -> ('cua',)
hết dị ứng cua rồi -> ('cua rồi',)
dị ứng nhẹ -> ('nhẹ',)
dị ứng nhẹ cua -> ('nhẹ cua',)
```

Family matching recognizes `nhẹ cua` as crab, but the bare severity word becomes a fictional
allergen rather than a clarification. Negated/history assertions must not add a positive
allergy; ambiguous removal of a prior medical constraint should be clarified explicitly.
`không dị ứng` alone returns no allergies/notes. Typo `di un cua` also returns no allergies/notes;
this is a remaining recognition limitation, not a claim that arbitrary typos can all be parsed.

### MEDIUM M3 — raw markup/instruction-like suffixes are reflected in safety notes

`MockExtractor().extract('dị ứng <script>alert(x)</script>')` stores the exact markup as an
allergy and repeats it in both the warning and unknown-term note. `dị ứng <b>cua</b>` behaves
similarly. `dị ứng cua please execute` retains `cua please execute` and echoes that suffix.
No script execution or downstream instruction execution was demonstrated; the demonstrated
issue is unsanitized reflection into user-visible safety text. Sanitize ingredient text and
avoid echoing arbitrary suffixes as ingredient names. The API schema's requested Cc/Cf/Cs
validation does not sanitize markup. A format character in an extracted term is now rejected
by the API with 422; the extractor should provide a useful clarification instead.

### LOW L1 — accent folding and finite vocabulary have visible boundary cases

Direct `allergen_excluded` checks: fish `ca` does **not** exclude `Cà phê Hà Nội` (correct);
dairy `sữa` excludes `Trà sữa A` (appropriate conservative behavior). Dairy also excludes
`Bún sứa`, because folding conflates sứa/sữa (false positive). Fish `ca` does not exclude
`Cá hấp`, because that preparation is outside the enumerated fish phrases. Crab does not
exclude `Bún riêu` without any crab/seafood name/tag; that is an ingredient-data limitation,
not verified safety. Allergen `tom` excludes `Mắm tôm` correctly. Keep the unknown-ingredient
warning and consider accent-aware matching and expanded explicit dish phrases separately.

### LOW L2 — long terms are silently truncated; mixed clauses become fake allergens

`dị ứng cua ` followed by 51 x characters produces a 40-character truncated term without a
truncation note. `dị ứng cua và muốn ăn phở` produces `('cua', 'muốn ăn phở')` and also adds
phở as an interest. Separate request clauses from ingredient terms and clarify overlong input.
These are extractor issues; PUT overlong terms correctly returns 422 in the new API tests.

## Additional independent checks

- `2 triệu`, `3 quán`, `lúc 8 giờ 30`, `0901234567`, and `0901234567 người` did not set
  party_size. No false capture reproduced for these cases.
- Recognized `di ung hai san` does not add seafood to interests (Claude regression test).
- With synthetic verified hours, prices and a provider-route stub, the same no-allergy tour is
  verified_feasible; adding crab allergy makes it conditional with exactly
  `unknowns=('allergy_ingredients',)`. Thus allergy alone prevents verified status even when
  every other evidence field is verified. Strict mode cannot return a verified allergy tour.
- Building a crab tour without allergies and then validating it with crab preferences returns
  ineligibility, status-mismatch and unknowns-mismatch errors. No checker bypass reproduced.
- The API replacement test returns a successful alternative while excluding both explicit
  crab and seafood candidates. No replacement reintroduction reproduced.
- RulesFirst cache key includes the entire prior Preferences repr, which now includes allergies.
  Local stub probes with empty prior versus prior dairy allergy returned live `('cua',)` versus
  live `('sữa','cua')`; identical input/prior repeated returns cache. No cross-prior allergy
  leak reproduced; identical message/prior caching is intentional shared memoization.
- Explanation label accurately discloses absent ingredient data and asks the user to check
  with the venue. No unsupported safety statement was found in that label.

## Verification evidence

Commands (PowerShell, repository root):

```powershell
$env:PYTHONPATH='backend'
.venv/Scripts/python.exe -m unittest discover -s backend/tests -v
.venv/Scripts/python.exe tools/export_openapi.py --check
```

Actual output:

```text
Ran 307 tests in 36.741s
OK
OpenAPI matches server schema
```

The targeted API run also passed all eight tests. The installed test stack emits a Starlette
httpx deprecation warning; no dependency changes were made. Full output was retained locally
in the temporary `c0hf-full-tests.txt` during this run. These passing tests do not negate the
independent review findings above; the identified unsupported phrases are not passing claims.

## FAIL-BEFORE evidence

Used `git archive --format=zip --output=<temporary archive> 90a419d^` and unpacked into an
isolated temporary directory. `90a419d^` resolves to
`20fdfd4b46b3e90512ca499173f6b3c157579e3b`. Only the new API regression test was copied into
that archived checkout; production files remained the old version. The interpreter and
installed dependencies were reused, with PYTHONPATH pointing exclusively at its archived backend.

Ran the three behavior tests corresponding to plan section 1.1 and the requested bare-avoidance
case. Party setup uses the old supported `nhom 3 nguoi`, so it reaches the actual edit failure.
Actual failure output (temporary absolute paths and request IDs omitted):

```text
test_message_allergy_party_budget_and_warning ... ERROR
test_party_edit ... FAIL
test_bare_avoidance_clarifies ... FAIL

ERROR: test_message_allergy_party_budget_and_warning
  self.assertEqual(state['preferences']['allergies'], ['cua'])
KeyError: 'allergies'

FAIL: test_party_edit
  self.assertEqual(self.message('đổi thành 4 người')['preferences']['party_size'], 4)
AssertionError: 3 != 4

FAIL: test_bare_avoidance_clarifies
  self.assertIn('cua', state['preferences']['exclusions'])
AssertionError: 'cua' not found in []

Ran 3 tests in 0.392s
FAILED (failures=2, errors=1)
exit: 1
```

What's left: Claude should address H1 and the medium extraction/LLM findings, add owner tests,
and request another independent review. No Claude-owned production modules were rewritten here.
The Codex schema/API change is ready for Claude review; public deployment and live providers
remain outside this task.
