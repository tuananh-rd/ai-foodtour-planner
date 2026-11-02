# Menu Migration — Independent Read-Only Review

Reviewer: Claude (frontend/QA/review, claude-opus-4-8). Implementation/tests/operator docs: Sol.
Scope: commits `9346046` + `57c24c6` (current HEAD after `ff778c6`). Read-only; no
staging/activation/rollback, no server/env/config/session/ledger changes, no production edits. Only
this report is authored.

## Verdict: APPROVE (no P0/P1; three P2 advisories)

The migration is a bounded, inert, dry-run-by-default pipeline with strict validation, content-hash
staging, and an explicit, atomic, backup-guarded activation/rollback. All required properties are
present with source evidence below. The synthetic test suite (`backend/tests/data/test_menu_migration.py`)
exercises them with `TemporaryDirectory` only; activation was **not** run against real data (correct),
and I did not stage/activate anything.

## Checklist (all PASS)

- **Strict schema/types/canonical keys/ID refs/branch conflict** — `menu_archive.py`: per-file
  `schema` literal check + row caps/type (`:104-108`); duplicate-JSON-key rejection
  (`no_duplicate_keys`) and non-finite rejection (`reject_nonfinite`) (`:60-69,104`); `unique()` on
  foody_id/item_id/dish_id/option_id (`:123-126`); canonical key `(shopee_delivery_id,
  source_dish_id)` uniqueness + per-record branch match (`:153-157`); cross-file dish_group branch
  equality (`:183-185`); branch conflict `mapping_branch_conflict` on delivery id (`:142`).
  `57c24c6` adds explicit `identifier()` checks on record `foody_id` (`record_venue_id_type`), all
  link references (`link_reference_type`), and option item/venue refs (`option_reference_type`), so
  a bool can no longer coerce to a string ID (`identifier(True)` is False — a bool is not
  `type is int`). Correct hardening of referential integrity.
- **V6 `is_dish=false` exclusion** — excluded in `menu.py:50` (`is_dish is False or
  dish_kind=='non_dish'`); counted as `explicit_nonfood_records` (`menu_archive.py:202`). See P2-1.
- **Price quarantine / mandatory minimum** — preserved from prior reviewed logic (`menu.py`
  quarantine + mandatory-min with `minimum_unknown`), surfaced in the manifest summary
  (`menu_migration.py:16-18`).
- **Partial error / no_service** — crawl statuses validated against a fixed set incl. `no_service`
  (`menu_archive.py:21,130-134`); `status=='ok'` requires `match_status=='confirmed'` (`:138`);
  partial archive (`attempted_venues != menu_venues`) requires explicit `--allow-partial`
  (`menu_migration.py:81-82`); an invalid active archive fails closed to `menu_invalid`
  (`loader.py:319`). See P2-3.
- **Bounded ZIP, no traversal, no execution** — size/member/expanded/ratio caps
  (`menu_archive.py:18-20,85-98`); rejects `..`, absolute, `\\`/`:`, symlinks, encrypted members
  (`:93-96`); pure `json.loads`, no eval/exec/network.
- **Pure default dry-run** — `dry_run()` returns `valid_not_activated` and writes nothing
  (`menu_migration.py:23-24`); CLI default path is dry-run (`import_local_menu.py`).
- **Content-hash manifest staging** — `stage()` writes `store/<sha256>/archive.zip` + `manifest.json`
  via `atomic_write` (fsync + `os.replace`), idempotent with a `staged_hash_mismatch` guard
  (`menu_migration.py:27-48`).
- **Explicit activation + backup + rollback atomic guard** — `activate()` requires `confirmed`
  (`:69`), a 64-hex version matching the archive sha + manifest (`:70-80`); an `O_EXCL`
  `activation_lock` (`:56-65`); stages the previous active as the rollback backup (`:90`), forbids
  branch reassignment (`:89`), guards against the active changing mid-activation (`:91`), and swaps
  atomically via `os.replace` (`:92`). Rollback is activation of a staged prior version and also
  requires `--confirm-activation`.
- **Same-path content cache invalidation + stale-selection** — dataset version is content-derived
  (`loader.py:321-322`, `sha256(version+menu_version)`, `menu_version==archive.sha256`), so the same
  path with new content yields a new version; `discovery/tools.py:49-60` then drops now-invalid
  selection ids (keeps valid), bumps `selection_version`, clears results/comparison/pending/plan,
  invalidates confirmation/tour, and records a neutral notice.
- **CLI importer default only dry-run** — `import_local_menu.py`: mutually-exclusive
  dry-run/stage/activate/rollback; default is dry-run; activation/rollback reject an input-archive
  arg; failures emit `rejected_no_activation` / `io_failure_no_success_claim` with exit 2 and no
  success claim.

## P2 advisories (non-blocking)

- **P2-1 `is_dish` optional in validation.** `menu_archive.py:161-162` only type-checks `is_dish`
  when present and otherwise emits a `legacy_nonfood_flag_missing` warning; `menu.py:50` excludes a
  row only on `is_dish is False` / `dish_kind=='non_dish'`. A conforming `shopeefood-dishes/1`
  archive could therefore carry a non-food row that omits the flag and have it treated as food. Low
  risk for the controlled V6 export (which sets `is_dish`) and a warning is surfaced; consider
  requiring `is_dish` for schema `/1` or excluding flag-missing rows when no non-food signal exists.
- **P2-2 `dish_groups` source location.** The validator reads `dish_groups` from **inside**
  `shopeefood_dishes.json` (`menu_archive.py:121`, `menu.py` `dishes_doc['dish_groups']`), not from a
  separate member. The operator `(4)` archive ships a separate `shopeefood_dish_groups.csv` (not
  read). Operator docs should state the V6 export must embed `dish_groups` within
  `shopeefood_dishes.json`, else `links_type_or_cap` fails closed.
- **P2-3 fail-closed surfaces for operator docs.** An invalid/corrupted **active** archive makes
  `load_dataset` raise `menu_invalid` (whole dataset, not just menu). Active is always validated
  before an atomic write, so this only triggers on external corruption — but it is a full
  no-service, not a menu-less fallback. Also the `O_EXCL` `activation_lock` (`menu_migration.py:60`)
  persists if a process dies mid-activation, wedging future activations until manual removal. Both
  are safe (fail-closed) but should be documented for the operator (recovery + the no-fallback
  choice).

## Compatibility (bounded, read-only; no records)

Operator archive `D:/Downloads/shopeefood_menu (4).zip` (my bounded member-list check): 13 members,
~0.99 MB compressed / ~16.6 MB expanded (within `MAX_ARCHIVE` 64 MB, `MAX_EXPANDED` 128 MB, member
cap 64); largest member 5.4 MB (within `MAX_MEMBER` 32 MB); all four required JSON files present. I
did not run record-level validation against real data. Per coordinator, Sol's read-only
`import_local_menu.py --dry-run` on this archive returned `VALID_NOT_ACTIVATED` with 2178 canonical /
2276 links / 12092 options, 2176 food rows, 2 explicit non-food, 94 unavailable, and 2 `error` + 3
`no_service` counted separately — consistent with the validator's design and these bounds. The
active-12 archive SHA and the running 8250 dataset-version/build/budget all match the pre-fingerprint;
no staging/activation/rollback or server restart was performed (dry-run is pure).

## Tests

`backend/tests/data/test_menu_migration.py` (TemporaryDirectory only) covers each property above —
default dry-run no-mutation, CLI safe rejection no-overwrite, schema/types, duplicate/canonical/
orphan, branch duplicate/coords, timestamp/conflict-without-variants, explicit cross-group conflict,
non-food override + quarantine, zip-path/duplicate-json/size bounds, stage→activate same-path cache
+ rollback, tampered-staged/failed-replace preserve-active, partial statuses require ack, reassigned
branch + concurrent activation fail-closed, dataset-change clears pending state + keeps valid locks.
Per coordinator: the focused 14 migration tests PASS, and the combined affected regression is 138
PASS with 1 existing private-fixture skip, exit 0, mock-only (no provider transports). Not re-run
here (no new meaningful test needed; the suite already exercises every reviewed property).
