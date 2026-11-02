# Menu migration preparation — ready, not activated

Date: 2026-11-03. Implementation: Sol. Independent review: existing Claude Opus4.8 medium.

Baseline ff778c6. Changes9346046/57c24c6/2bfd94a/90ada2c add strict archive validation, read-only default dry-run,
private hash-addressed staging/manifest, explicit future activation/rollback with partial-crawl
acknowledgement, branch-reassignment guard, old-version backup, activation lock and atomic replace.
The loader uses one validated snapshot and content hash; selected-session invalidation now clears
stale pending searches/planning and emits a truthful review notice while preserving valid locks.

## Compatibility dry-run only

Read-only input: user-approved `shopeefood_menu (4).zip`. Its `V6_DATA_SEMANTICS.md` was read as
reference, not executed. No sample4 staging, activation, rollback, extraction or source modification.

| Observation | Count |
|---|---:|
| attempted venues |50|
| menus / successful venues |45|
| source canonical records |2178|
| explicit nonfood excluded |2|
| eligible food/menu records before source-availability filtering |2176|
| group links |2276|
| options |12092|
| source-unavailable item records |94|
| error / no_service venues |2 /3|
| quarantined prices / unverified minimums |4 /3|

Validation result `valid_not_activated`, errors0. Warnings separately count5 unconfirmed attempts,
4 quarantined prices and3 unverified minimums. No venue names, record IDs, phone numbers, coordinates
or raw dataset rows enter this report. The original12-venue archive also validates with its original
535 canonical/559 links/3239 options and533 eligible menu records; legacy nonfood flags are warned.

## Verification

- 19 synthetic migration/menu tests passed initially, including explicit activate/rollback against
 TemporaryDirectory fixtures only. No real active archive was an activation test target.
- 138 affected data/discovery/protocol/outage/address tests PASS,1 existing private-fixture skip,
 exit0. After the final mandatory-option/V6-flag guards,21 focused migration/menu tests PASS,
 exit0 (overlapping counts, not additional unique suites).
- Tests cover malformed safe rejection, no-write dry-run, schemas/types/IDs/canonical duplicates,
 orphan/group/option/branch conflicts, nonfood, quarantine/mandatory minimum, path/size/JSON bounds,
 partial statuses/acknowledgement, tampered stage, failed replace, activation lock, same-path/same-
 mtime cache replacement, rollback and truthful stale-session selection handling.
- Read-only before/after checks: active12 archive SHA unchanged, API8250 dataset version/build
 unchanged, budget snapshot unchanged. No runtime restart, sessions/ledger/config mutation,
 scraping, live Gemini/Tavily generation, cap reset, credits, push or deployment.

Operator commands and the minimum data-team delivery contract: `../MENU_ARCHIVE_OPERATIONS.md`.
Independent review outcome and any follow-up findings are recorded in `MENU_MIGRATION_REVIEW.md`.
Claude independently APPROVED the implementation and final deltas (review commits70c635f/167ab42),
with noP0/P1 and all three P2 advisories resolved or documented. Review dispatches settled and the
pre-existing terminal is retained/idle; no duplicate editor or paid continuation.
Machine-readable aggregate evidence: `menu-migration-dry-run.json`,
`menu-migration-preservation.json` (all before/after preservation checks true).
Tooling readiness does not authorize activation; await the future dataset delivery and an explicit
instruction before changing the active snapshot.
