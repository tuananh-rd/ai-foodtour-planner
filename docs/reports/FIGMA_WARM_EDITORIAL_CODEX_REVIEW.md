# Codex review — candidate905e6ea not accepted

## Integrated25cd216 — final gate remains open

Reviewed2a82b48 fixes chat/hero rhythm and mobile navigation; integrated25cd216 for verification. A single final broad browser run yields187/190, exit1 (figma-warm-editorial-regression-final.json). Two timeline checks depend on changed source wording; classify separately from product. Real WE-11:200% CSS text reflow390px clips map-toggle/right422px and replacement/right427px. WE-12: GuidedTimeline renders price/leg metadata only in nn-sr, hiding facts from sighted users. Same-owner task_f223894221b3 repairs these with targeted evidence; no acceptance yet. Build147kB passes. Actual font rendering, dynamic warning/scroll layout and omitted unsupported sidebar features remain visual differences; no pixel-identical or fullWCAG claim.

## Second candidate9da1fcb — changes still required

Codex inspected refreshed actual side-by-side/mobile screenshots and semantic diff. Unknown facts, group-budget labeling, neutral stop labels and keyboard suggestions improved;38 targeted checks pass according to implementer. Candidate is not integrated. Fresh same-owner task_0b8beaeb46b6 addresses remaining issues without repeated full-suite execution.

- WE-07: Chat vertical hierarchy is substantially compressed: actual heading around174 versus reference198, support278 versus330, chips326 versus409 and divider354 versus458. Current heading weight800 differs visibly from the reference's lighter typography. Restore44/60 heading rhythm, spacing and two-line support; document actual font substitution separately.
- WE-08: Right hero around150/148px high versus reference158/190; metrics56 versus66. Report's altered target sizes and0px claims are unsupported. Restore32/46 hero typography, sizes and card/CTA hierarchy; preserve warnings via scroll and report dynamic deviations honestly.
- WE-09: Empty-tour CTA focuses the composer while mobile chat is hidden and does not switch tabs; sidebar quick suggestions likewise need visible chat activation before focus. Test resulting visible focus/draft with keyboard.
- WE-10: Generic distance labeled walking even for another vehicle; footer claims browser storage despite backend-persistent sessions. Use actual units/vehicle and truthful local-session wording.

No final regression yet: source still under bounded frontend correction. Do not infer acceptance from38 passing targeted checks, canvas existence or incomplete contrast sampling.

Codex reviewed source changes and the actual1440x1024 side-by-side plus390px mobile screenshots. Antigravity task_9aa61f3769fc/ctx_fc219ec5727d settled with905e6ea; its28 checks do not establish final acceptance. Candidate is not integrated. Same implementer receives task_53af11905ca6 to correct the following findings with no overlapping frontend editor, new live provider calls or final-suite repetition.

| Finding | Severity | Evidence / required correction |
|---|---|---|
| WE-01 fabricated unknown metrics/time/location | P1 | GuidedLayout hero/metrics hardcode18:00/20:30,2.5h,450K,03 and Hai Ba Trung when state absent; empty instruction cards carry invented times. Keep missing facts unknown and distinguish instructional steps from tour stops |
| WE-02 budget/distance semantics | P1 | Group500000 shown as “mỗi người”;0.8km labeled “trải nghiệm”. Bind actual scope and units; preserve unknowns |
| WE-03 fabricated sidebar history and no-op controls | P2 | Three sample trips presented as recent; clickable divs have no keyboard activation. History checks chatState.history rather than current message state; locale looks expandable with no action; unavailable saved control advertised. Use real state/actions or remove/relabel truthfully |
| WE-04 invented cuisine stage | P2 | Positional first/main/dessert labeling treats last stop as dessert regardless of actual venue. Use neutral stop sequence unless supported by data |
| WE-05 material visual mismatch | P1 for approved UI scope | Actual heading/hero too heavy and single-line versus original two-line typography; chat/top grid y90 versus98; stop badges stacked above text instead of horizontal; stop cards/scroll push final CTA below visible region. Correct computed styles, hierarchy and spacing while retaining required warnings/state |
| WE-06 overstated QA | P2 | Contrast checks use hardcoded RGB, not actual DOM; geometry ignores y but report claims zero deviation; replace only opens/cancels, map only proves canvas. Add targeted semantic/keyboard/computed-style/real replacement/Range evidence and report real limits |

Source/screenshot review is not a full functional audit. The existing28 checks are historical candidate evidence; no final regression run is justified until these corrections are reviewed. Keep actual synthetic/mocked/live modes explicit. Tavily account metadata blocker and Gemini limits remain unchanged.
