# Codex independent review — NgonNgon frontend

18/10/2026. Reviewer: Codex lead. Author/QA: Antigravity. Final verdict: **ACCEPT for the local prototype, with evidence limits below**. Initial `502972c` received REQUEST CHANGES; reviewed serial fixes, independent QA and integrated reruns are now complete. Ownership transferred explicitly at `739ee78` before Codex frontend fixes; serial QA/report corrections followed worker settlement/release. No concurrent active-file edits.

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
| NFE-08 | P2 | Header invents a Tuấn identity/avatar in an anonymous app. | Replace with anonymous/local context; no fake account/profile |
| NFE-09 | P2 | Desktop navigation only sets mobile-tab state while desktop ignores it; controls do nothing. | Desktop actions scroll/focus real sections, mobile tabs switch actual views; selected/current semantics exposed and keyboard reachable |
| NFE-10 | P1 | During QA setup, author added unrestricted `window.__FOODTOUR_API_URL` endpoint override to production API client to work around an old build's baked API port. | Remove the hook; configure NEXT_PUBLIC_API_URL at scratch build time (or isolated dev startup) and validate production build separately; no arbitrary runtime token destination |

## Intermediate evidence before browser acceptance

Independent `tools/check_ngonngon_render.cjs` probes (React SSR via existing Next SWC, synthetic only): unmerged baseline UI at coordinator failed 8/11 checks; author checkpoint `502972c` reviewed read-only through `NGONNGON_FRONTEND_DIR` passes 11/11. This covers empty-profile defaults, null arrival/ETA, a legitimate zero-duration inter-stop leg, warning retention, conditional label and 3/4/5-stop HTTPS walking URLs without keys. It does not cover root shell metric/header fallbacks, interaction/hydration, waypoint handling in Google, modal focus or 409; NFE findings stay open until their specific evidence is recorded. No private data or outbound request is used by this probe.

Record author commits, Codex diff review result, integrated commit, contract/build/backend results, desktop/mobile browser flows, screenshots and limitations here after real verification. A running process, input acceptance or worker_done alone does not close this review. Actual screen-reader speech, real Google navigation and real-world venue facts require distinct evidence; accessibility DOM/CDP checks are not equivalent to all of them.

## Serial re-review on6415d61

Author checkpoints `502972c` and `739ee78` were reviewed before integration. Findings required further serial fixes rather than accepting the author's earlier presence-only QA/mobile images. Antigravity paused all frontend writes via Orca `msg_9215935809c2`; Codex fixed root hydration, portals, reconstruction, metrics and scope in `5c87b1f`, styling/touch targets in `4a39b04`, full mobile confirmation in `dbc8a63`, and pending-safety/focus in `6415d61`. The latest two were found by actual browser failures, not inferred from source attributes.

| Finding | Codex verification / disposition |
|---|---|
| NFE-01 | CLOSED: SSR null/zero/profile probes11/11, source review of root totals/budget scope/title, actual screenshot metric500k group and estimated0.8km derived from known legs, no sample date/time/distance defaults |
| NFE-02 | CLOSED in reviewed source: real successful replacement preserves identities/order/locks; controlled no-candidate preserves server tour; real concurrent allergy edit causes stale replacement409→current obligation, no old modal/timeline, same after reload. New test failed before6415d61 because retained tour hid pending question |
| NFE-03 | CLOSED: disclosure distinguishes rules/mock vs conditional GoogleGemini, recent session memory vs retention, source attribution and destination URL; source+browser review |
| NFE-04 | CLOSED for automated keyboard/DOM checks: portals outside inert root, actual mouse activation, Tab/Shift+Tab containment, dialog close/return, replacement completion fallback. Actual screen-reader speech remains untested |
| NFE-05 | CLOSED: provenance retained from source; dynamic question150/300/1000k checked after browser reload; current safety question restored after real conflict |
| NFE-06 | CLOSED: fabricated18:30 seating tip removed, no new operational claim |
| NFE-07 | CLOSED: status/missing/warnings readable before confirmation and timeline; source ranges qualified;3/4/5-stop HTTPS walking URL probes, real anchor activation blocked before external Google navigation; actual Google routing not tested |
| NFE-08 | CLOSED: anonymous visitor header, no invented Tuấn/account |
| NFE-09 | CLOSED in reviewed source: real desktop section focus/scroll actions and mobile visibility state; mobile390no overflow, keyboard and200% reflow coverage; larger author interaction QA additionally reviewed before acceptance |
| NFE-10 | CLOSED: unrestricted browser-global endpoint override removed; scratch production endpoint configured before build; no Maps API/key requests or credentials in independent browser evidence |

Independent final application source gate:169/169 production Chrome checks, zero runtime/console errors;22/22 additional interactive checks;18/18 frontend contracts;11/11 SSR probes; production build exit0. Backend575 OK/1 optional private-CSV skip; schema drift matches. See [integration report](CODEX_N_INTEGRATION.md) and [fresh synthetic visual evidence](ngonngon-codex/README.md). Preview-only cache isolation `ac05fc8` leaves default production distDir unchanged and is additionally checked with build+preview interactions; it fixes a root build/dev artifact collision, not an application behavior change.

Final verdict: **ACCEPT for the local prototype with documented evidence limits**. Antigravity settled `d52335c` and was released before Codex's serial QA/report corrections `22b3a76`; integrated author harness rerun66/66, plus169/169 independent production and22/22 supplemental interactions. Ten canonical author images were visually inspected (mobile confirmation and replacement included), duplicate copies removed, estimated quantities/session privacy/test-mode claims corrected. No live provider, data certification, screen-reader participant or deployment acceptance is implied. Historical report claims are superseded by the explicit base/results here and the integration report.
