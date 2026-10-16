"""Map private CSV/JSON snapshots to planner venues without inventing evidence.

Only absent files trigger the labelled synthetic fallback. Invalid files fail
explicitly, with count-only diagnostics. No paths or source values enter reports.
"""
from __future__ import annotations

import csv
from datetime import datetime
import hashlib
import io
import json
import math
import os
from collections import Counter
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path

from app.planner.types import Venue
from .evidence import EvidenceLoadError, apply_overlay, empty_counts

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_PATH = ROOT / "data" / "venues.json"
SYNTHETIC_PATH = ROOT / "contracts" / "fixtures" / "venues.synthetic.json"


@dataclass(frozen=True)
class Dataset:
    venues: tuple[Venue, ...]
    dataset_version: str
    dataset_source: str
    input_rows: int
    rejected: dict[str, int]
    flags: dict[str, int]
    evidence_overlay: dict[str, int] = field(default_factory=empty_counts)
    evidence_rejections: dict[str, int] = field(default_factory=dict)


def aggregate_report(dataset: Dataset) -> dict:
    """Return aggregate counts only; excludes venue identities and filesystem paths."""
    return {
        "input_rows": dataset.input_rows,
        "loaded_rows": len(dataset.venues),
        "rejected_rows": sum(dataset.rejected.values()),
        "rejections_by_reason": dict(sorted(dataset.rejected.items())),
        "flags_by_reason": dict(sorted(dataset.flags.items())),
        "evidence_overlay": dict(dataset.evidence_overlay),
        "evidence_rejections_by_reason": dict(dataset.evidence_rejections),
    }


class DatasetLoadError(ValueError):
    """Sanitized file-level failure; callers must not replace it with empty data."""

    def __init__(self, reason: str):
        self.report = {"errors_by_reason": {reason: 1}}
        super().__init__(f"Dataset could not be loaded: {reason}")


def _text(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def _coordinate(value) -> float:
    if isinstance(value, bool) or value is None:
        raise ValueError
    result = float(value)
    if not math.isfinite(result):
        raise ValueError
    return result


def _price(value) -> int | None:
    if isinstance(value, bool) or value is None or value == "":
        return None
    try:
        number = Decimal(str(value))
        if not number.is_finite() or number <= 0 or number != number.to_integral_value():
            return None
        return int(number)
    except (InvalidOperation, ValueError, OverflowError):
        return None


def _tags(value) -> tuple[str, ...]:
    values = value.split("|") if isinstance(value, str) else value if isinstance(value, list) else []
    return tuple(sorted({_text(v) for v in values if _text(v)}))


def _rating(value, scale):
    try:
        if isinstance(scale, bool):
            return None, None
        scale = float(scale)
        if not math.isfinite(scale) or scale <= 0:
            return None, None
    except (TypeError, ValueError, OverflowError):
        return None, None
    try:
        if isinstance(value, bool):
            return None, scale
        value = float(value)
        if not math.isfinite(value) or not 0 <= value <= scale:
            return None, scale
        return value / scale * 5, scale
    except (TypeError, ValueError, OverflowError):
        return None, scale


def _count(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = Decimal(str(value))
        ok = number.is_finite() and 0 <= number <= 10_000_000 and number == number.to_integral_value()
        return int(number) if ok else None
    except (InvalidOperation, ValueError, OverflowError):
        return None


def _bounded_int(value, low, high):
    number = _count(value)
    return number if number is not None and low <= number <= high else None


def _timestamp(value):
    value = _text(value)
    try:
        if 'T' not in value and ' ' not in value:
            return None
        return datetime.fromisoformat(value.replace('Z', '+00:00')).isoformat()
    except ValueError:
        return None


def _parse(blob: bytes, suffix: str) -> tuple[list, bool]:
    try:
        text = blob.decode("utf-8-sig")
        wrapper_synthetic = False
        if suffix == ".csv":
            reader = csv.DictReader(io.StringIO(text), strict=True)
            fields = reader.fieldnames or []
            if not fields or len(fields) != len(set(fields)):
                raise DatasetLoadError("invalid_csv_header")
            rows = list(reader)
            if any(None in r or None in r.values() for r in rows):
                raise DatasetLoadError("invalid_csv_row")
        else:
            rows = json.loads(text)
            if isinstance(rows, dict):
                # Only explicit metadata marks a wrapper synthetic; never infer from its path.
                label = _text(rows.get("_label")).casefold()
                wrapper_synthetic = (rows.get("synthetic") is True
                    or label == "synthetic" or label.startswith(("synthetic ", "synthetic:")))
                rows = rows.get("venues")
        if not isinstance(rows, list):
            raise DatasetLoadError("invalid_document_shape")
        return rows, wrapper_synthetic
    except (UnicodeError, json.JSONDecodeError, csv.Error):
        raise DatasetLoadError("malformed_document") from None


def load_dataset(path: str | Path | None = None) -> Dataset:
    """Read FOODTOUR_DATA_PATH or the default snapshot, falling back only if absent.

    Explicit paths must be absolute; relative environment paths use the repo root.
    The version hashes the bytes
    actually loaded, including the fixture bytes when fallback is necessary.
    Duplicate winners are chosen by canonical row order, then ID, then URL.
    Current source formats have no verified weekday mapping: hours stay None.
    """
    configured = path if path is not None else (os.environ.get("FOODTOUR_DATA_PATH", "").strip() or None)
    source_path = Path(configured) if configured is not None else DEFAULT_PATH
    if path is None and configured is not None and not source_path.is_absolute():
        source_path = ROOT / source_path
    if not source_path.is_absolute():
        raise DatasetLoadError("path_not_absolute")
    synthetic = False
    flags = Counter()
    try:
        blob = source_path.read_bytes()
    except FileNotFoundError:
        synthetic = True
        flags["absent_path_synthetic_fallback"] += 1
        source_path = SYNTHETIC_PATH
        try:
            blob = source_path.read_bytes()
        except OSError:
            raise DatasetLoadError("synthetic_fixture_unavailable") from None
    except OSError:
        raise DatasetLoadError("input_unreadable") from None
    suffix = source_path.suffix.lower()
    if suffix not in (".csv", ".json"):
        raise DatasetLoadError("unsupported_format")
    rows, wrapper_synthetic = _parse(blob, suffix)
    wrapper_synthetic = wrapper_synthetic or synthetic
    synthetic = wrapper_synthetic or (bool(rows) and all(
        isinstance(row, dict) and row.get("synthetic") is True for row in rows))
    rejected = Counter()
    candidates = []
    for row in rows:
        if not isinstance(row, dict):
            rejected["invalid_row_shape"] += 1
            continue
        identity = _text(row.get("id", row.get("foody_id")))
        if not identity:
            rejected["missing_id"] += 1
            continue
        if not _text(row.get("name")):
            rejected["missing_name"] += 1
            continue
        try:
            lat, lon = _coordinate(row.get("lat")), _coordinate(row.get("lon"))
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError
        except (TypeError, ValueError, OverflowError):
            rejected["invalid_coordinates"] += 1
            continue
        if (lat, lon) == (0, 0):
            rejected["zero_coordinate_pair"] += 1
            continue
        candidates.append((identity, _text(row.get("source_url")), json.dumps(row, sort_keys=True, ensure_ascii=True), row, lat, lon))
    # Deduplicate IDs first. URL deduplication must not resurrect an ID loser.
    by_id = []
    seen_ids = set()
    for candidate in sorted(candidates, key=lambda c: c[:3]):
        if candidate[0] in seen_ids:
            rejected["duplicate_id"] += 1
        else:
            seen_ids.add(candidate[0])
            by_id.append(candidate)
    venues = []
    seen_urls = set()
    for identity, url, _, row, lat, lon in by_id:
        if url and url in seen_urls:
            rejected["duplicate_source_url"] += 1
            continue
        if url:
            seen_urls.add(url)
        else:
            flags["missing_source_url"] += 1
        # Format and provenance are independent: synthetic import rows use source columns too.
        canonical = any(key in row for key in ("dish_tags", "geo_ok", "price_min_vnd"))
        low = _price(row.get("price_min_vnd" if canonical else "price_min_vnd_norm"))
        high = _price(row.get("price_max_vnd" if canonical else "price_max_vnd_norm"))
        if (not canonical and row.get("price_status") != "ok") or low is None or high is None or low > high:
            low = high = None
            flags["unknown_price"] += 1
        online = row.get("online_only") is True if canonical else "Shop Online" in _tags(row.get("venue_types"))
        geo_ok = row.get("geo_ok") is True if canonical else row.get("geo_status") == "ok"
        if online:
            flags["online_only"] += 1
        if not geo_ok:
            flags["unverified_geo_status"] += 1
        tags = _tags(row.get("dish_tags" if canonical else "dish_groups"))
        if not tags:
            flags["missing_dish_tags"] += 1
        rating, scale = _rating(row.get("rating_value", row.get("rating")), row.get("rating_scale_max"))
        reviews = _count(row.get("review_count"))
        meals = _tags(row.get("suitable_meals"))
        if rating is None:
            flags["missing_rating"] += 1
        if reviews is None:
            flags["missing_review_count"] += 1
        if not meals:
            flags["missing_suitable_meals"] += 1
        flags["unknown_hours"] += 1
        venues.append(Venue(
            id=identity, name=_text(row.get("name")), lat=lat, lon=lon,
            city=_text(row.get("city")), district=_text(row.get("district")),
            address=_text(row.get("address")), source_url=url, dish_tags=tags,
            online_only=online, geo_ok=geo_ok, price_min_vnd=low,
            price_max_vnd=high, price_evidence="estimate", hours=None,
            hours_display=_text(row.get("hours_display" if canonical else "hours_displayed")) or None,
            synthetic=wrapper_synthetic or row.get("synthetic") is True,
            rating=rating, rating_scale_max=scale, review_count=reviews,
            capacity_value=_bounded_int(row.get("capacity_value"), 1, 100000),
            prep_time_min=_bounded_int(row.get("prep_time_min"), 0, 1440),
            prep_time_max=_bounded_int(row.get("prep_time_max"), 0, 1440),
            rating_quality=_rating(row.get("rating_quality"), row.get("rating_scale_max"))[0],
            rating_location=_rating(row.get("rating_location"), row.get("rating_scale_max"))[0],
            rating_service=_rating(row.get("rating_service"), row.get("rating_scale_max"))[0],
            rating_space=_rating(row.get("rating_space"), row.get("rating_scale_max"))[0],
            rating_price=_rating(row.get("rating_price"), row.get("rating_scale_max"))[0],

            suitable_meals=meals, audiences=_tags(row.get("audiences")),
            cuisine_styles=_tags(row.get("cuisine_styles")),
            amenities_yes=_tags(row.get("amenities_yes")), amenities_no=_tags(row.get("amenities_no")),
            source_fetched_at=_timestamp(row.get("fetched_at", row.get("source_fetched_at"))),
        ))
    try:
        merged, version, evidence_counts, evidence_rejections = apply_overlay(
            tuple(venues), hashlib.sha256(blob).hexdigest())
    except EvidenceLoadError as error:
        raise DatasetLoadError(str(error)) from None
    if evidence_counts['hours_verified']:
        flags['unknown_hours'] -= evidence_counts['hours_verified']
    for before, after in zip(venues, merged):
        if before.price_min_vnd is None and after.price_evidence == 'verified':
            flags['unknown_price'] -= 1
    return Dataset(merged, version, "synthetic" if synthetic else "private", len(rows),
                   dict(rejected), dict(flags), evidence_counts, evidence_rejections)
