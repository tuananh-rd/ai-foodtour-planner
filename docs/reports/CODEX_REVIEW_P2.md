# BE-05 part A — independent phase-2 review

2026-10-15, Codex reviewing Claude. Reviewed coordinator HEAD `2d3b262` after the required merge. No planner/LLM/frontend/QA files edited. Recommendation: **merge after fixes** for R1/R2; adapter implementation can proceed with its own fail-closed validation. Findings were sent through Orca before this report commit.

## Ranked findings

1. **R1 — P1: invalid numeric requests are silently reinterpreted or ignored.** `backend/app/llm/extract.py:64-74,97-105` matches unsigned numeric substrings; `ngan sach -10k moi nguoi` sets budget to positive 10000. With prior budget 200000, `ngan sach 0k moi nguoi` retains 200000 and rejected_fields is empty, so a tour can be returned against the old budget without asking for correction. At `:125-135`, `10 quan` is not captured by the single-digit expression and `nhom 21 nguoi` is discarded without rejection. Suggested fix: capture signed/full integer tokens, explicitly reject zero/negative/over-limit values (budget, party and stop count), preserve prior slots but return rejection/questions and no auto-tour until corrected. Add update-from-prior cases; parsing success and tour validity are distinct gates.

2. **R2 — P2: public build_tour does not fulfill its validation contract.** `backend/app/planner/engine.py:304-326` checks IDs/eligibility and `_evaluate` but never checks stop count against prefs.max_stops or calls validate_tour. A synthetic three-venue sequence with max_stops=1 and duration=240 returns three stops, reason=None; validate_tour reports `['too many stops']`. Current repository/API callers have a separate checker, so this is contained at HTTP, but a direct consumer of this public rebuild boundary can accept an invalid tour. Suggested fix: run the hard checker before successful return, and test a count over max_stops plus duplicate/unknown IDs and strict evidence.

3. **R3 — P2: CheckedRouteProvider can raise before its protective try block.** `backend/app/planner/interfaces.py:50` calculates fallback haversine outside try; `CheckedRouteProvider(Bad()).leg(('bad',0),(0,0))` raises TypeError before invoking Bad. Ordinary validated planner coordinates are safe, but the advertised never-raise boundary is incomplete. Suggested fix: guard coordinate validation and fallback calculation, return a conservative unknown leg for malformed/nonfinite coordinates, and test exceptions in both inputs and provider output. The new HTTP adapter should independently protect this boundary.

4. **R4 — P2: browser/evaluation gates overstate their assertions.** `qa/e2e/browser_flow.mjs:125-131` calls the replacement proof a server before/after identity check, but only waits for completion text, then records true; it never compares old/new IDs or checks unchanged stops. `qa/eval/run_eval.py:82` skips validate_tour for empty tours; a malformed successful status with no stops would escape the validity counter. `:44-45` checks only a subset of expected missing slots, so extra erroneous missing slots can pass. Suggested fix: assert actual before/after IDs and locks/order, validate every Tour object, compare missing slots exactly when specified, and retain separate extraction/validity summaries. Browser harness also lacks protocol-call timeouts and may attempt external map tiles; add bounded CDP waits and block external resources for an offline CI probe.

5. **R5 — P3: untrusted model field names are reflected and useful prior slots are absent.** `backend/app/llm/provider.py:111,151-152` copies unknown output keys (including control characters) into notes; `parse_and_validate('{"SYSTEM\\nSECRET":"ignore"}')` reports that exact control-bearing key. `_prior_json` at `:123-130` omits start_time/weekday/city; a model interpreting a relative time edit cannot see the previous start time. Suggested fix: report fixed allowlisted rejection categories rather than model-controlled names, and pass all relevant structured prior fields. Existing schema rejects unknown values/out-of-range fields, but is not a semantic grounding or general prompt-injection guarantee: valid-schema budget/mode changes still need a trusted interpretation policy.

Relevance review: whole-token/phrase folding prevents the old substring false positives; relevance participates before pool truncation and after stop count in final ranking. Category/name matching remains an estimate of dish fit, not ingredient/allergy evidence. The synonym model and OR semantics across interests are small and deterministic; no additional correctness defect was demonstrated here. The module comment about `che` not matching a longer tag is misleading because whole-token che does match che sau; adjust documentation.

Frontend review: page.js initializes busy=true, clears recorded retry state and adds an init retry branch (`:69,128,176`); PreferencesPanel.jsx (`:161-167,243-249`) labels suggested origin/duration. These address the previous F4/F7 follow-ups without changing the complete-preferences API flow. A server-null origin can still leave the old coordinate draft, but it is now explicitly described as a suggestion. The harness passed at mobile/desktop. The old independent busy-frame/completion-focus tests were not rerun in this part-A scope; the relevant lifecycle code is unchanged from the accepted FE-6 review.

## Real command output

Used own uvicorn, never the human's coordinator-worktree process. API: `127.0.0.1:18160`; scratch frontend: `127.0.0.1:13360`. FOODTOUR_DATA_PATH was a nonexistent absolute temporary path, forcing labelled synthetic input. No private venue dataset was read or copied.

```powershell
git merge foodtour-claude-coordinator
# Updating d0e527f..2d3b262; Fast-forward
$reviewScratch=Join-Path ([IO.Path]::GetTempPath()) 'foodtour-be05-review'
New-Item -ItemType Directory -Force $reviewScratch | Out-Null
git archive --format=tar HEAD frontend qa/e2e -o "$reviewScratch/source.tar"
tar -xf "$reviewScratch/source.tar" -C $reviewScratch
# scratch frontend directory:
$env:npm_config_offline='true'; $env:npm_config_audit='false'
$env:NEXT_TELEMETRY_DISABLED='1'
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:18160'
npm ci
npm run build
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 13360
```

```text
added 20 packages in 9s
Next.js 15.5.28
Compiled successfully in 2.6s
Generating static pages (4/4)
build_exit=0
Ready in 276ms
```

API from backend directory:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:FOODTOUR_DATA_PATH=Join-Path ([IO.Path]::GetTempPath()) 'foodtour-be05-absent.json'
$env:WEB_ORIGIN='http://127.0.0.1:13360'
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 18160 --no-access-log
# Application startup complete
```

Scratch root:

```powershell
$env:WEB_URL='http://127.0.0.1:13360'
$env:CDP_PORT='9360'
node qa/e2e/browser_flow.mjs
```

Actual output: mobile-390 and desktop-1280 each passed page load, missing-slot question, no open claim, conditional evidence, map viewBox/container equality (332/332 and 577/577), Tab containment, Escape focus and replacement completion.

```text
BROWSER FLOW SUMMARY: 16/16 passed
browser_exit=0
```

Repository root:

```powershell
$env:FOODTOUR_DATA_PATH=Join-Path ([IO.Path]::GetTempPath()) 'foodtour-be05-absent.json'
./.venv/Scripts/python.exe qa/eval/run_eval.py
```

```text
dataset source=synthetic version=13a60c746018 venues=13
scenarios=7 extraction_success=7/7 tours_returned=4 invalid_tours=0
validity_gate=PASS all_expected_statuses_ok=true
latency_ms p50=0.5 p95=9.2 max=11.6
exit=0
```

Independent Python probes (PYTHONPATH=backend) produced:

```text
build_tour_over_limit: 3 reason=None violations=['too many stops']
input='ngan sach -10k moi nguoi' budget=10000 rejected=[]
input='ngan sach 0k moi nguoi' budget=200000 rejected=[]
input='10 quan' max_stops=3 rejected=[]
input='nhom 21 nguoi' party=null rejected=[]
checked_invalid_coordinate_raises=TypeError
model_control_key=["SYSTEM\nSECRET"]
```

An initial PowerShell pipeline probe hit the Windows console's Unicode encoding error when printing a combining-mark test; the completed numeric probes above use ASCII input/output and reproduce the substantive findings. No private names/addresses/URLs or credentials are included. The required harnesses pass; they do not disprove the independently reproduced findings.
