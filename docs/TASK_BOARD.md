# Task board — phase 3 (Claude only), see docs/PHASE3.md and docs/HANDOVER_P3.md
Reviews in this phase are Claude self-reviews + tests, not independent reviews.

| ID | Work | Status | Evidence |
|---|---|---|---|
| P3-0 | Rules, inventory, roadmap | DONE | docs/PHASE3.md, AGENTS.md override note |
| P3-1 | Allowlisted HTTPS transport + local .env loader (`app.server`) | DONE | unit tests; real Gemini calls through it |
| P3-2 | Gemini extraction (generateContent + schema), budget, 5xx retry, labelled fallback | DONE, tested live | 39/39 correct when answered (42 calls); qa/reports/EVAL_P3.md |
| P3-3 | Gemini checked explanation, no venue identity sent, bounded retry | DONE, tested live | 18/22 accepted; rejections fall back to template |
| P3-4 | Walking routing ORS / OSRM with geometry, matrix prefetch | DONE in code, fake-server tested | **BLOCKED for live verification: needs human-provided key/endpoint** |
| P3-5 | Frontend route polylines, source labels, waiting hint, map fit fix | DONE | components 13/13; browser 18/18 (rules) and 18/18 (real Gemini) |
| P3-6 | Health/config/docs (.env.example, RUNNING.md, contract v1.4) | DONE | docs |
| P3-7 | Geo plausibility audit | DONE (flags only) | ds-1: 0 out of box, 11 shared coords, 29 district outliers |
| P3-8 | Handover matrix | DONE | docs/HANDOVER_P3.md |
| — | Verified hours / per-person prices | BLOCKED: needs verified source + permission | overlay pipeline ready |
| — | PostGIS, remote CI, deployment | BLOCKED: infra / human approval | — |
