# Strict SVG fidelity — Codex integration review

18/10/2026. User's new visual requirement supersedes the earlier “SVG-inspired” acceptance. Functional baseline0a9828e is retained; this report does not inherit a visual PASS. Codex coordinates/reviews/integrates, Claude owns the primary UI and final visual verdict, Antigravity implements bounded support/components/QA. Run `run_c3ad7a6af923`; current task/ownership details in TASK_BOARD.

## Reference and acceptance method

Original `D:/Downloads/UI ngonngon tour.svg` is design data. SHA256 `F73364241A53DAF697FD92521EE7AAB5FF4CBA843C2BF27FB0B14063428EB41D`, identical to the internal reference SVG. Original text uses outlined paths, so font-family identity cannot be asserted from live SVG font metadata. Claude has personally rendered/viewed the original, not only read a prior brief; Codex separately viewed the1440×1024 reference PNG.

Major structural anchors reported from Claude's original inspection: header height80, chat white rounded panel x32/y108/w480/h888, right content x560..1384, metrics y243/h95 with width≈265.7 each, timeline card width500, mint right panel x1078/y357/w306/h615. Exact final targets/type/icon details belong to Claude's measured spec. Compare actual screenshots at1440×1024 with the reference using both side-by-side and an overlay; judge frame/column/header/card geometry separately from intentionally different dynamic strings. Do not use synthetic mockup claims as real venue facts to lower pixel difference. Document any text/warning/state masks or crop and retain an unmasked comparison.

No full-SVG screenshot/image overlay may replace the live UI. Extracting a small static brand/icon asset is distinct from rendering the whole design as a static screen. Actual buttons, chat, clarification, confirmation, timeline, Maps URL and replacement must remain functional. Existing allergy/price/hours/routing warnings remain visible; exact copied mockup dates/bills/identity/seating advice or unsupported features are forbidden. Honest additions can change content height, but should fit the reference structure and be called out as residuals rather than silently inflating the shell.

## Gates — open until candidate implementation

| Gate | Required evidence | State |
|---|---|---|
| Reference inspection | Claude's direct original rendering/viewing + measured spec | Confirmed; a0d3b43 measured spec/tokens committed |
| Primary implementation | Claude-owned layout/scoped CSS commit; no overlapping frontend writes | Shell5633203 committed; final integrated review pending |
| Component implementation | Exact Claude brief, Codex-routed Antigravity file scope and commit | Brief a0d3b43 delivered msg_9ce9bbf7b5e3; implementation active |
| Visual desktop | Fresh actual synthetic1440×1024 screenshot + side-by-side/overlay + material deviations fixed | Pending |
| Mobile/accessibility |390×844, no horizontal overflow, clear decisions/warnings, actual controls/focus | Pending |
| Functional regression | Backend/module, contract/drift, build; browser chat→clarify→confirm→tour→Maps→replace/reload/error/409 | Pending final source |
| Final visual verdict | Claude reviews integrated images + original and lists honest remaining differences | Pending |
| Lifecycle/handoff | Both task outcomes, correct release/reuse, final local URL and commits | Pending |

Prior tests575backend(1optional-CSVskip), frontend contracts18, production browser169, supplemental22 and independent author interaction62/integrated66 are a regression baseline, not new visual evidence. Screenshots use labelled synthetic data only; no private preview venue rows, tokens or location history in artifacts. User servers remain running; temporary services use checked separate ports. No Maps API/key/billing, external provider calls, dependency upgrades, push/deploy or new data collection is authorised for this visual revision.

## Intermediate findings routed to owners

| ID | Finding / evidence | Owner / disposition |
|---|---|---|
| VF-C01 | Actual production browser on5633203:168/169 pass,1failure. At1280×800 the confirmation card is y340.875..853.172, height512.297, so the prior full-decision visibility gate fails. Zero runtime/console errors. [Count-only evidence](svg-fidelity-codex/shell-regression.json). | Claude e0c69ea pins decision and collapses intro; reported card202..657.3 at1280×800. Final combined browser rerun pending; do not weaken gate. |
| VF-C02 | Original SVG timeline title paths fill1E1E1E, description757575 and border outlineD9D9D9; they differ from global green ink/muted/border tokens. | Claude added distinct card tokens/spec in5633203; Antigravity must apply to leaf cards. |
| VF-C03 | First baseline tour comparison was scrolled down, omitting title/metrics under sticky header; annotation also covered header geometry. Such a comparison cannot prove alignment. | Corrected382bfe4 normalized/unmasked image viewed by Codex; method accepted. Final captures must retain scroll/viewport/source metadata. |
| VF-C04 | Baseline capture main printed success but left WebSocket/owned subprocess handles open; actual node stayed running and the worker awaited a background task forever. | Corrected382bfe4: success/failure cleanup and explicit exit. Codex checked all3test ports free after completion; method accepted. |
| VF-C05 | Initial leaf41cb2fe post_impl actual cards500×216 each vs reference500×129/129/107; timeline1260high, duplicate heading/price/leg and in-card actions materially change hierarchy. | Claude14bafaf removes duplicate root heading; approved compact card/actions/hours brief msg_de33bf415e68 routed to Antigravity via msg_a5a6833263ed. Leaf correction pending. |
| VF-C06 | Native default viewport1440 has clientWidth1425; initial post_impl route291wide vs306, tiles262vs≈265.7. Fixing only route306 reduces timeline to485; overall824column proof still needed. | Claude owns scoped responsive frame/gutter treatment; final default browser geometry pending. Do not claim1–2px from special hide-scrollbar capture alone. |

Codex's original XML audit confirms the reference SHA and palette independently; Claude's region pixel-error claims remain provisional until its images/method are exported and viewed. Frame geometry, typography and honest dynamic content are assessed separately. A failed legacy test that expects stale welcome copy is not silently converted to PASS; the legacy `test_guided_ui.mjs` port-killing preflight must not be used against unknown listeners. Current isolated production browser/module/contract gates remain required.
