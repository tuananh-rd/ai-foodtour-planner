# Codex independent review — NgonNgon frontend

18/10/2026. Reviewer: Codex lead. Author/QA: Antigravity. Status: **in progress, no acceptance yet**. Review uses the SVG preview visually inspected by Codex, source diff, and later fresh browser evidence. No frontend changes made by Codex while author owns active files.

## Early findings sent through Orca

These refer to the author's in-progress working tree, not a final commit; final disposition must be checked on the integrated build.

| ID | Priority | Finding | Required evidence for closure |
|---|---|---|---|
| NFE-01 | P1 | New shell copied sample facts: 20:30 departure fallback, Saturday, Hoàn Kiếm, 1.8 km and ~450K budget. Header/totals may contradict actual tour, repeating E02. | Null arrival/depart/distance/budget stay unknown; legitimate zero kept; correct TourView totals fields; neutral title or actual area; no hardcoded date/weekday; group/per-person budget scope preserved and requested budget distinguished from cost |
| NFE-02 | P1 | Replacement maps all 409s to no replacement, hiding revision conflict. | Real stale revision resynchronises current owned state, shows current obligations/summary and does not silently retry; actual no-candidate keeps old tour and reason |
| NFE-03 | P2 | Disclosure claims no personal history stored despite session turns/preferences retained; AI recipient unnamed, Foody attribution hardcoded for synthetic input. | Accurate session retention and conditional Gemini sending statement before submit; synthetic/private attribution follows actual mode; no raw telemetry/credentials |
| NFE-04 | P2 | Focus trap alone does not make background inert. | Browser checks initial focus, Tab/Shift+Tab containment, Escape/return focus, background inertness, mobile modal scrolling |
| NFE-05 | P2 | Restored profile rows label all values as user input, losing default/inferred provenance. | Reload rows preserve source, no inferred/default row becomes user; amounts 150k/300k/1m and new unread numeric questions restore correctly |
| NFE-06 | P2 | Mockup-derived local tip promises seats by departure before 18:30 without evidence. | Remove the claim; generic advice to verify hours/prices is acceptable; no invented operational/queue information |
| NFE-07 | P2 | Unknown/status warnings need readable Vietnamese, not JSON/raw codes; map URL waypoints need honest mobile behavior. | Conditional/verified/insufficient distinctly labelled; complete warnings before confirmation and timeline; 3/4/5-stop URLs with per-leg fallback where needed and no API/embed requests |

## Final acceptance evidence — pending

Record author commits, Codex diff review result, integrated commit, contract/build/backend results, desktop/mobile browser flows, screenshots and limitations here after real verification. A running process, input acceptance or worker_done alone does not close this review. Actual screen-reader speech, real Google navigation and real-world venue facts require distinct evidence; accessibility DOM/CDP checks are not equivalent to all of them.
