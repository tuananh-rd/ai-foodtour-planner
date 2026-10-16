# Independent Codex re-review — R1-5d

Date: 2026-10-16. Reviewer: Codex, independent of author Antigravity. Reviewed fix: `c8100f17d715959161c442cd966b11d567acaea9`, after the requested `git merge foodtour-claude-coordinator` fast-forward from `cb61c0a` to `a692223`. Prior review: `docs/reports/CODEX_REVIEW_R1_FRONTEND_3.md`.

**Decision: ACCEPT for R1-5d.** The remaining R2-N01 routing verification defect is fixed: canonical total evidence and every stop leg, including origin to first stop, are reconciled conservatively. No new blocking regression was established. This is a review of this correction, not authorization for public release or clearance of unrelated findings.

## Evidence

- `node qa/e2e/test_components.mjs`: **47/47 PASS**.
- `$env:UI_V2_PORT='13000'; node qa/e2e/test_ui_v2.mjs`: scratch production build succeeded; **28/28 PASS**, including both exact prior routing reproductions. First-stop top: **772.984375px** at 390×844 and **504.59375px** at 1280×800, both inside the viewport.
- Re-ran the prior independent canonical routing harness: **128 combinations, zero unsafe provider claims**. A stronger independent equality check also passes all 128 cases: exactly **2** permit provider/full-evidence copy (all stop legs provider, total provider or omitted, no aggregate route unknown); the other **126** do not.
- Re-ran the **512-combination** variant varying non-frozen `tour.legs` as well: **zero unsafe claims against canonical evidence**, and **zero rendered-output differences** between any `tour.legs` variant and its canonical-only counterpart. This checks that ignored fields neither grant nor veto verification.
- Metric reconciliation: the unmodified prior 512 harness prints **4** unsafe flags because its oracle includes explicit estimate/unknown values in `tour.legs`. All four have provider evidence on every canonical stop leg, provider or omitted canonical total, and no aggregate route unknown. Those flags conflict with this task's explicit requirement to ignore `tour.legs`; they are not concealed as zero under the old oracle. Excluding that non-contract field from the unsafe predicate yields zero, and full HTML equality independently verifies the ignore behavior.
- Re-ran the independent **768-combination hours/price matrix: zero failures**. Four hour statuses × four arrival states × four price evidence states × three price semantics × four aggregate unknown combinations. Verified copy is asserted separately for hours and price.
- Six additional missing/malformed stop cases (empty list, null stop, empty stop, null leg, missing source, provider stop followed by empty stop) produce **zero provider/full-evidence claims**, even with a provider total and a provider `tour.legs` value.

## Actual-source mutation

In an external scratch copy, copied the committed component suite unchanged and changed the real `EvidenceStrip.jsx` predicate from `totalMatches && allStopsLegProvider` to `(totalIsProvider || allStopsLegProvider)`, preserving the aggregate-unknown veto. Running that committed suite exits **1 at TC-EVID-07**, rejecting the contradictory total-versus-stop rendering. Thus the committed assertions detect an actual loosened-source regression; this conclusion does not rely on TC-EVID-12's separately reimplemented mathematical predicate.

Mutation scratch: `%TEMP%/codex-r1-review4-mutant-0uTFGz`; exact stdout/stderr retained there as `mutation-output.txt`. Repository production and QA files were never mutated.

## Independent production HTTP/browser reproduction

Built the current frontend in real API mode outside the repository; synthetic Node HTTP API on **18000**, Next production server on **13000**, headless Edge via the existing CDP harness endpoint. No private datasets, provider credentials, live provider requests, or publishing. All application/API listeners used the assigned ports; CDP used the harness's separate debugging port 9360.

The synthetic `/tour` response uses `status:'verified_feasible'`, no aggregate unknowns, verified hours with `open_at_arrival:true`, and verified per-person 40000 VND prices. After clicking plan and expanding the actual evidence strip:

| Routing fields | Observed result |
|---|---|
| Provider total; first stop provider; second stop `straight_line_estimate` | `Chưa chắc: tuyến đi thực tế`; no provider or full-evidence claim |
| Provider total; first stop provider; second stop `unknown` | Same conservative result |
| Total omitted; first stop `unknown`; second provider | Same conservative result; origin leg is included |
| Total and both stop sources omitted | Same conservative result; no missing-only verification |
| Provider total and both stop sources provider | `Bằng chứng đầy đủ: tuyến đường thực tế · giờ mở cửa xác thực`; expanded provider copy retained |
| Same canonical provider evidence with `tour.legs:[{source:'unknown'}]` | Same legitimate full-evidence result; non-frozen field ignored |

The two prior exact reproductions are therefore fixed in both committed browser checks and independent real HTTP delivery. All six independent browser cases have `aria-expanded='true'`, a resolvable `aria-controls` target, and a **44px** toggle. Expanded conservative routing retains the existing straight-line-estimate wording; the zero-unsafe metric here concerns unsupported provider/full-evidence claims, not a comprehensive wording audit.

## Regression checks and limits

- **Flag off:** real-mode root without V2 query and with feature false retains legacy preference heights **40/36/36/40px**, reset/mode **30/26px**, absent `--bg`/`--shadow-lg`, and no V2 dynamic chunks in its resource list. These match the prior independently rebuilt baseline measurements; the supplied suite independently passes its rollback assertions. No historical baseline rebuild was needed for this component-only production diff.
- **Accessibility:** real Tab navigation reaches request input with `:focus-visible=true` and solid **2px** outline. Tab from the final enabled sheet control wraps to the close button; Escape restores the explicitly focused invoker. Reduced-motion sheet transition is **1e-06s**; sampled sheet preference controls remain **44/44/44/44px**. Supplied suite finds zero undersized controls among 30 visible sheet controls. No screen-reader session or contrast audit.
- **Quick answers:** independently counted HTTP requests for all five answers. Each sends one message POST and clears the input; the following plan sends one tour POST with zero repeated message POSTs, plus the separate Maps-links GET.
- **Stale responses:** forced reset callback during delayed tour yields zero stale cards and an enabled plan button; late geolocation after reset leaves default coordinates unchanged. As before, forced callback reset is an adversarial probe because the normal reset control is disabled while busy.
- **Build/isolation:** mock and real production builds report `/` **34.9 kB**, first-load JS **138 kB**, shared JS **103 kB**; `/ui-kit` returns **404** with default configuration. Both builds succeeded. No live DB, Maps/Routes/Places, hardware geolocation, provider-failure integration, or latency benchmark was validated.

Independent final real-mode scratch: `%TEMP%/codex-r1-review4-NmE0P4`. Harnesses outside Git: `codex-r1-review4-browser.mjs`, `codex-r1-review4-matrix.mjs`, `codex-r1-review4-strict-matrix.mjs`, plus the prior canonical harness. The inherited independent browser footer says `0/0`; it is not an acceptance count. Its six routing scenarios have explicit throw-on-failure assertions, while other independent probes report observations. The **28/28** count belongs to the committed browser suite.

Excluded setup attempts: corrected Unicode literals damaged by the PowerShell-to-Node pipe before accepting strict header assertions; changed an unsuccessful synthetic Enter expansion attempt to direct button activation before collecting expanded-browser evidence. These were harness setup issues, not accepted passing results or evidence of a product keyboard defect. Final real keyboard probes are the Tab/Escape observations above.

Only this report was authored in the repository. Integration/review disposition owner: Claude coordinator. No remaining correction required for R1-5d.
