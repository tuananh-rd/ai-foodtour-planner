"""Local human-attested evidence. Sources are never fetched or echoed in reports."""
import hashlib
import json
import os
import re
from collections import Counter
from dataclasses import replace
from datetime import date
from pathlib import Path

MAX_BYTES = 1024 * 1024
WEEK = {str(day) for day in range(7)}
HOURS_KEYS = {'hours', 'hours_source', 'hours_verified_at'}
PRICE_KEYS = {'price_per_person_vnd', 'price_source', 'price_verified_at'}


class EvidenceLoadError(ValueError):
    """Constant reason only: never retain paths, contents or identities in errors."""


def empty_counts():
    return {'entries_loaded': 0, 'entries_rejected': 0, 'hours_verified': 0, 'prices_verified': 0}


def _object(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError('duplicate JSON key')
        out[key] = value
    return out


def provenance(entry, prefix):
    source, timestamp = entry.get(prefix + '_source'), entry.get(prefix + '_verified_at')
    if not isinstance(source, str) or not source.strip():
        raise ValueError
    if not isinstance(timestamp, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', timestamp):
        raise ValueError
    # Validate the declared calendar date, without inventing a freshness policy.
    # A clock-dependent policy would also make identical bytes mean different snapshots.
    date.fromisoformat(timestamp)


def _minute(value):
    if not isinstance(value, str) or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', value):
        raise ValueError
    return int(value[:2]) * 60 + int(value[3:])


def hours(value):
    # Missing weekdays cannot be represented as unknown by the planner: require a full mapping.
    if not isinstance(value, dict) or set(value) != WEEK:
        raise ValueError
    result = {}
    for day in range(7):
        intervals = value[str(day)]
        if not isinstance(intervals, list):
            raise ValueError
        converted = []
        for interval in intervals:
            if not isinstance(interval, list) or len(interval) != 2:
                raise ValueError
            start, end = map(_minute, interval)
            if start >= end:
                raise ValueError
            converted.append((start, end))
        converted.sort()
        if any(a[1] > b[0] for a, b in zip(converted, converted[1:])):
            raise ValueError
        merged = []
        for start, end in converted:
            if merged and merged[-1][1] == start:
                merged[-1] = (merged[-1][0], end)
            else:
                merged.append((start, end))
        result[day] = merged
    return result


def display_hours(mapping):
    def clock(value):
        return f'{value // 60:02d}:{value % 60:02d}'
    return '; '.join(str(day) + ': ' + (', '.join(clock(a) + '–' + clock(b) for a, b in intervals)
                                      if intervals else 'đóng cửa')
                     for day, intervals in sorted(mapping.items()))


def prices(value):
    if not isinstance(value, dict) or set(value) != {'min', 'max'}:
        raise ValueError
    low, high = value['min'], value['max']
    if type(low) is not int or type(high) is not int or not 0 <= low <= high:
        raise ValueError
    return low, high


def apply_overlay(venues, base_version):
    """Return merged venues/version and aggregate-only counters/reasons.

    Partial entries count in both loaded and rejected; field counters count
    accepted venue fields, never claims inferred from a source's URL/text.
    """
    configured = os.getenv('FOODTOUR_EVIDENCE_PATH', '').strip()
    counts, reasons = empty_counts(), Counter()
    if not configured:
        return venues, base_version, counts, {}
    try:
        path = Path(configured)
        if not path.is_absolute():
            raise EvidenceLoadError('evidence_path_not_absolute')
        with path.open('rb') as stream:
            blob = stream.read(MAX_BYTES + 1)
        if len(blob) > MAX_BYTES:
            raise EvidenceLoadError('evidence_file_too_large')
        data = json.loads(blob.decode('utf-8-sig'), object_pairs_hook=_object)
        if (not isinstance(data, dict) or set(data) - {'schema', 'entries', '_label'}
                or type(data.get('schema')) is not int or data['schema'] != 1
                or not isinstance(data.get('entries'), list)):
            raise EvidenceLoadError('evidence_invalid_schema')
    except EvidenceLoadError:
        raise
    except OSError:
        raise EvidenceLoadError('evidence_input_unreadable') from None
    except (ValueError, UnicodeError, RecursionError):
        raise EvidenceLoadError('evidence_invalid_json') from None
    entries = data['entries']
    identities = Counter(e.get('venue_id').strip() for e in entries
                         if isinstance(e, dict) and isinstance(e.get('venue_id'), str))
    by_id = {v.id: v for v in venues}
    merged = dict(by_id)
    for entry in entries:
        reason = None
        if not isinstance(entry, dict) or set(entry) - ({'venue_id'} | HOURS_KEYS | PRICE_KEYS):
            reason = 'invalid_entry_schema'
        elif not isinstance(entry.get('venue_id'), str) or not entry['venue_id'].strip():
            reason = 'invalid_venue_id'
        else:
            identity = entry['venue_id'].strip()
            if identities[identity] > 1:
                reason = 'duplicate_venue_id'
            elif identity not in by_id:
                reason = 'unknown_venue_id'
        if reason:
            counts['entries_rejected'] += 1
            reasons[reason] += 1
            continue
        updates, rejected = {}, False
        if HOURS_KEYS.intersection(entry):
            try:
                provenance(entry, 'hours')
                mapping = hours(entry.get('hours'))
                updates.update(hours=mapping, hours_display=display_hours(mapping))
                counts['hours_verified'] += 1
            except (ValueError, TypeError):
                reasons['invalid_hours_evidence'] += 1
                rejected = True
        if PRICE_KEYS.intersection(entry):
            try:
                provenance(entry, 'price')
                low, high = prices(entry.get('price_per_person_vnd'))
                updates.update(price_min_vnd=low, price_max_vnd=high, price_evidence='verified')
                counts['prices_verified'] += 1
            except (ValueError, TypeError):
                reasons['invalid_price_evidence'] += 1
                rejected = True
        if not updates and not rejected:
            reasons['missing_evidence_fields'] += 1
            rejected = True
        if updates:
            counts['entries_loaded'] += 1
            merged[identity] = replace(by_id[identity], **updates)
        if rejected:
            counts['entries_rejected'] += 1
    # Length-prefixed, domain-separated content hash: any evidence byte change invalidates caches/tours.
    version = hashlib.sha256(b'foodtour-evidence-v1\0' + bytes.fromhex(base_version)
                             + len(blob).to_bytes(8, 'big') + blob).hexdigest()
    return tuple(merged[v.id] for v in venues), version, counts, dict(sorted(reasons.items()))
