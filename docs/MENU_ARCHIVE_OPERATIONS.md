# Local menu archive operations

This iteration prepares tooling only. The active12-venue archive, runtime, sessions, budget and
configuration remain unchanged. No activation/rollback of a real archive was performed.

## Validate first (default is read-only)

```powershell
.venv/Scripts/python.exe tools/import_local_menu.py 'D:/Downloads/shopeefood_menu (4).zip' --dry-run
```

Omitting `--dry-run` has the same read-only effect. Exit0 means structurally compatible, **not
activated**; exit2 rejects malformed/unsupported input with sanitized error codes. Reports contain
counts, warnings and archive SHA256, never menu/venue records, phone numbers or private paths.
Review `crawl_statuses` and `last_attempt_statuses` separately: errors/no-service are not empty
successful menus. `unavailable_records` describes source-observed item availability, not closures.
Nonfood and quarantined-price counts are separate; unknown ingredients/hours/dine-in prices stay
unknown. Partial snapshots can validate while still requiring explicit acknowledgement later.

## Stage for a later authorized change

```powershell
.venv/Scripts/python.exe tools/import_local_menu.py 'D:/Downloads/incoming-menu.zip' --stage
```

Staging validates again and writes a content-addressed private directory:
`.venv/private-menu/versions/<SHA256>/archive.zip` plus `manifest.json`. It does not change the
active file, environment, runtime, sessions or ledger. The manifest contains schema, hash, UTC
staging time, effective/source counts and warnings/errors. Raw inputs remain private/ignored.
Archive bytes are captured once; stage writes exactly those validated bytes, avoiding a source
file changing between validation and copy. Never commit version directories or raw crawl reports.

## Explicit later activation and rollback (not run in this iteration)

Only perform these after a later instruction authorizes changing the serving dataset. Read the
staged manifest and retain the previous hash returned by activation. Substitute a real staged
hash from the validation output; hashes below are notation, not commands to run literally.

```powershell
.venv/Scripts/python.exe tools/import_local_menu.py --activate <STAGED_SHA256> --confirm-activation
.venv/Scripts/python.exe tools/import_local_menu.py --rollback <PREVIOUS_SHA256> --confirm-activation
```

For an intentionally partial delivery, add `--allow-partial` after reviewing missing/error venues.
This does not infer closure, recover failed crawls, merge older items or relax validation.
Duplicate IDs, orphan references, conflicting branch assignments and unsupported schemas remain
rejected. Reassigning an existing Foody ID to another delivery branch is forbidden; resolve the
identity upstream instead of silently remapping selected venues.

The active default is the existing `.venv/private-menu/shopeefood_menu.zip` consumed by
`tools/run_online_assistant.py --dataset local`. For a separately configured `FOODTOUR_MENU_PATH`,
pass that exact path using `--active-path`; `--store` can select another private version directory.
These flags do not edit `.env` or switch configuration automatically.

Activation checks staged bytes against the hash/manifest, obtains an exclusive local activation
lock, validates/backups the current archive, then writes a temporary sibling, flushes/fsyncs and
atomically replaces the active file. Failure before replacement leaves the previous file intact.
Rollback uses exactly the same validation/replacement path and preserves the outgoing version.
No server restart, provider call, budget reset, deployment or scraping is part of either command.
If a process crashes with an activation lock remaining, verify no operator is still activating
before explicitly removing that one lock; tooling never steals a lock automatically.

Malformed manually replaced archives fail closed as `menu_invalid` for the dataset; there is no
silent fallback that claims stale menu evidence is current. The supported activation command
validates before replacing. Normal rollback expects the outgoing active archive to remain valid
so it can be backed up and branch-checked. If someone bypasses tooling and makes that file
malformed, rollback also refuses to overwrite it blindly: first preserve/rename that corrupt file
to a private diagnostic location, then explicitly restore the validated staged version at the
same configured active path. Do not erase sessions/ledgers or change identity mappings to hide it.

The prepared loader reads one immutable archive snapshot for mapping/menu construction and hashes
content, not path/mtime or a source-declared version. The existing repository cache invalidates
on changed bytes even at the same path/mtime; rollback can reuse the exact earlier valid snapshot.
Serving8250 has not been restarted to load these code changes in this preparation-only iteration.

On a later loaded dataset change, old results/comparison/pending searches and confirmation expire.
Missing selected venue IDs are removed with a visible notice; valid venue locks/origin remain.
Changed/removed menu dishes never get remapped to another name/branch: selection is venue-based,
so the user is told to re-search/review menu and prices before a fresh confirmation. Old tours
become stale. No automatic planning or confirmation is performed.

## Minimum delivery contract for the data team

Root-level required UTF-8 JSON documents (CSV/markdown may accompany them; never executed):

| File | Required schema | Rows |
|---|---|---|
| shopeefood_dishes.json | shopeefood-dishes/1 | dishes and dish_groups |
| shopeefood_menu_items.json | shopeefood-menu-items/1 | items |
| shopeefood_menu_options.json | shopeefood-menu-options/1 | options |
| shopeefood_mapping.json | shopeefood-mapping/1 | venues |

The `dish_groups` embedded in `shopeefood_dishes.json` is the authoritative link table consumed
and validated. Accompanying CSVs are not imported or cross-validated. Data-team consistency checks
must align CSVs with JSON before delivery; changing only a CSV will not change application records.
Deliver a closed, finalized ZIP (prefer an atomic rename after writing), not a file still being crawled.

- Stable, unique `foody_id`, `dish_id`, `item_id`, `option_id`; canonical dish uniqueness is
  `(shopee_delivery_id, source_dish_id)`. IDs may be strings or positive integers as defined in
  source records; booleans/floats are invalid. Source group IDs may be negative virtual groups.
- Confirmed mappings require valid finite Hanoi coordinates, source venue name/address, stable
  delivery-branch ID and a timezone-aware `fetched_at`. Each delivery branch maps to one venue.
  Failed/unconfirmed attempts may omit delivery coordinates; they must not carry orphan menu rows.
- Every item/canonical dish/group link must agree on venue, delivery branch and source dish IDs;
  links cover every canonical dish/item. Every option references a known item/venue/group.
  Cross-group conflicting observations must be marked `conflict_status=conflict` with preserved
  `variants`; no first-row-wins collapse. Conflicted prices are quarantined, not guessed.
- Items require timezone-aware ISO `fetched_at`. Mapping `last_attempt_at` is validated when
  supplied. Preserve last-good menu state separately from the most recent attempt status.
  Supported crawl statuses: `ok`, `error`, `no_service`, `not_collected`, `review`,
  `empty_confirmed`, `not_rendered`, `blocked`.
- V6 `is_dish` must be boolean; `false` rows stay in source but never enter food search/budget.
  The V6 semantics marker or any flag in the export requires flags on every canonical/item row;
  partial omission is rejected. The markdown marker is never executed or interpreted as instructions.
  `dish_kind=non_dish` also excludes them. Legacy archives without the boolean remain compatible
  with a warning and bounded phone/short-hotline recognition. Group labels alone do not exclude food.
- Currency/channel must be `VND`/`shopeefood_delivery`; prices/surcharges are integer VND or null.
  Preserve source/list/promo observations and verification status. Anomalies/conflicts have no
  usable reference minimum; do not substitute a guessed price or a dine-in/per-person interpretation.
- Options declare boolean `mandatory`, integer/null `min_select`, `max_select`, surcharge.
  Required group minimums sum the cheapest required choices only when fully known; missing prices,
  selections or groups remain unknown. Optional/default toppings are not added automatically.
- `is_available` is boolean/null source evidence only. No inferred ingredients, allergy safety,
  portions, current opening status, route geometry or travel ETA. Option-only names are not
  standalone dishes. No fuzzy synonyms or branch-name matching is performed.

Bounds are explicit: compressed archive≤64MiB, total expanded≤128MiB, member≤32MiB,≤64 members,
compression ratio≤250;≤20k canonical dishes,30k items/links,200k options,2k mappings. Bigger input
is rejected for a reviewed limit change, not silently truncated. ZIP traversal, duplicate members,
symlinks, encryption, duplicate JSON keys and non-finite JSON numbers are rejected; nothing is extracted.
