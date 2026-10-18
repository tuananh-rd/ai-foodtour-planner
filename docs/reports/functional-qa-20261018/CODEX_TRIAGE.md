# Fresh functional QA triage — 2026-10-18

Status: **in progress; no final acceptance yet**. This round does not inherit old PASS counts. Orca Run `run_d07647b6e92e`; Codex coordinates/integrates, Claude owns assigned UI fixes and final visual review, Antigravity owns exploratory QA only.

## Environments actually exercised

| UI / API | Effective source / data / provider | Evidence limits |
|---|---|---|
|3020 /8020 | Earlier integrated root UI, local private data; rules/mock, estimated routing | Existing user preview retained; no private rows/screenshots exported |
|3040 /8040 | Frozen frontend d828e68, earlier backend; synthetic fixture, rules/mock | Baseline defect reproduction and synthetic captures |
|3050 /8050 | Frozen frontend d828e68, backend8d3a379; synthetic fixture, rules/mock | Health and HTTP200 verified, real browser and failure-only interception |
|3051 /8051 | Same frozen app revision as3050, existing local private input; rules/mock | Venue identities/count match old8020 loader but dataset hashes differ; do not claim identical dataset version |

All these backends advertise estimated routing and unavailable geocoding. Gemini live is **BLOCKED**: active health reports mock/rules with no verified live budget; no keys were read, services activated, or live calls made in this round. Synthetic fixture success is not local-data feasibility or Gemini validation. The new previews store sessions in memory; server-restart persistence is not promised.

## Confirmed findings and disposition

| Finding | Severity / owner | Reproduction / root cause | Current disposition |
|---|---|---|---|
|BUG-001 |P1 Codex | Exact `tour3 quán quanh Hồ Gươm tối nay120 phút,500nghìn cho2người,thích phở và bún chả,dị ứng đậu phộng` misses stop/day-part cues and explicit tour goal |8d3a379 normalizes narrowly before deterministic extraction; actual HTTP8050/8051 and Antigravity positive UI slot assertions pass |
|BUG-002 |P1 Codex | After the exact input, answering group budget scope leaves no next question; subsequent19h is misrouted | Same lost-goal root as001; do not count as an independent parser root cause. Follow-up now asks start time then explicit confirmation |
|BUG-004 |P1 Codex | Greeting plus a complete tour request discards parsed preferences |8d3a379 retains the profile patch; fresh greeting regression fails before/passes after; Claude review APPROVE |
|BUG-006 |P1 Codex | `Tour ba quán quanh Hồ Gươm tối nay một tiếng rưỡi, năm trăm nghìn cả hội cho hai người, không dị ứng gì` captures90min/500kgroup/2people/3stops but loses goal and next question |7f05832 preserves existing explicit no-allergy handling while applying supplied area/goal and displaying understood values; fail-before,5 targeted tests pass; browser retest pending refresh |
|BUG-003 |P2 Claude | Inline budget edit offers only4presets, preventing arbitrary amounts through that control | Scoped labelled VND input with existing backend bounds, presets and budget-scope semantics; independent retest pending |
|Startup failure |P1 Claude | Failure-only CDP abort of actual POST `/v1/sessions` leaves fresh UI without an alert/retry | Baseline4bcd040: actual Chrome, failure observed, alert/retry absent; fix pending |
|Transient restore failure |P1 Claude | Failure-only503 on actual stored-session GET causes a replacement POST and overwrites the client session pointer without warning | Original server session/preferences remain intact;6/9 fresh baseline assertions fail. Preserve old pointer on transient errors and retry restoration; fix pending |
|D1–D5 |P2/P3 Claude | Actual UI audit: retry wrapping, misleading offline wording, false text-history restoration promise, restore scrolling, disclosure/mobile hit areas |94857a1 reproduction evidence; exact file ownership ACK received. Preserve SVG geometry and functional focus/retry behavior |
|BUG-005 candidate |Coverage limit under triage | Đồng Xuân is absent from the finite local landmark reference and geocoder is off | No invented coordinates or service activation. Verify useful manual clarification; absent geocoding alone is not an implementation failure |

## Evidence and review gates

- Backend7f05832:581 tests OK,1 optional private-CSV skip,62.864s. New semantic regressions fail before the changes and assert no text entry bypasses explicit confirmation.
- Earlier candidate8d3a379: fresh independent scratch production Chrome169/169, zero runtime exceptions/console errors;15 SSR probes,18 frontend mock-contract invariants and schema drift pass. These supplemental checks are **not** final acceptance of subsequent UI fixes or exploratory coverage.
- Startup/restore baseline: [redacted assertions](codex-baseline/session-errors.json), [startup](codex-baseline/codex-startup-failure.png), [restore](codex-baseline/codex-restore-failure.png). `node tools/probe_fq_session_errors.mjs` exits1 on failed assertions; it never replaces successful backend responses or exports session credentials.
- Claude [review and actual UI findings](CLAUDE_REVIEW.md) distinguish its own tests from reported results. Antigravity baseline report requires corrected case-level coverage before integration/acceptance.

## Test mistakes explicitly excluded

An initial Windows stdin Unicode probe corrupted Vietnamese accents; it was discarded and replaced with UTF-8 source-file diagnostics. A DOM-dependent legacy component test was mistakenly invoked directly under Node and failed because `document` was absent; it does not establish an application defect (the actual SSR module suite passed). Early Antigravity scripts grouped untested GPS/409/timeout/focus/Maps cases under broad PASS labels and dispatched an unhandled custom error event: these claims were rejected, not counted as coverage. Corrected cases must observe actual requests, state, positive slot values, nonempty replacement identities and real backend revisions.

## Remaining gates

Complete individual requested cases on actual UI/backend; preserve FAIL/BLOCKED/NOT TESTED honestly. Finish/review UI repairs and7f05832 affected review, refresh owned test previews at an acknowledged checkpoint, retest every defect, run final regressions/build/drift and Claude visual review on the integrated candidate. Keep legacy user services untouched, private data out of Git, free Google Maps URLs, and no push/deploy.
