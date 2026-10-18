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
| Primary implementation | Claude-owned layout/scoped CSS commit; no overlapping frontend writes | In progress |
| Component implementation | Exact Claude brief, Codex-routed Antigravity file scope and commit | Brief a0d3b43 delivered msg_9ce9bbf7b5e3; implementation active |
| Visual desktop | Fresh actual synthetic1440×1024 screenshot + side-by-side/overlay + material deviations fixed | Pending |
| Mobile/accessibility |390×844, no horizontal overflow, clear decisions/warnings, actual controls/focus | Pending |
| Functional regression | Backend/module, contract/drift, build; browser chat→clarify→confirm→tour→Maps→replace/reload/error/409 | Pending final source |
| Final visual verdict | Claude reviews integrated images + original and lists honest remaining differences | Pending |
| Lifecycle/handoff | Both task outcomes, correct release/reuse, final local URL and commits | Pending |

Prior tests575backend(1optional-CSVskip), frontend contracts18, production browser169, supplemental22 and independent author interaction62/integrated66 are a regression baseline, not new visual evidence. Screenshots use labelled synthetic data only; no private preview venue rows, tokens or location history in artifacts. User servers remain running; temporary services use checked separate ports. No Maps API/key/billing, external provider calls, dependency upgrades, push/deploy or new data collection is authorised for this visual revision.
