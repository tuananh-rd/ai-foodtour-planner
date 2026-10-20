/**
 * frontend/lib/emojiSanitizer.js
 * Comprehensive display-only runtime Unicode emoji normalization.
 *
 * Responsibilities:
 * - Sanitizes dynamic/restored/provider/venue/user-echo text for DISPLAY only.
 * - Replaces visible pictographs/emojis/flags/keycaps with space separator so words/numbers do not join (e.g. 20🍜30 -> 20 30).
 * - Removes invisible formatting characters without inserting spaces so words are not split (e.g. Ph\u200dở -> Phở).
 * - Comprehensive projection coverage for all actual discovery & legacy schema fields:
 *   district, dish_tags, hours.display, confirmation.summary/profile, tour.explanation/reasons/unknowns/stops/nested venue/address.
 * - Strictly preserves raw input, IDs, tokens, URLs, ordinary digits/numbers, prices, coordinates, and Vietnamese diacritics.
 * - Never modifies session state, authentication tokens, API payloads, or raw database keys.
 */

// Invisible formatting characters that should be removed without inserting spaces:
// - Variation selectors: \ufe0e (text), \ufe0f (emoji)
// - Zero-width joiner: \u200d
// - Unicode tag characters: \u{e0020}-\u{e007f}
const INVISIBLE_FORMATS_REGEX = /[\ufe0e\ufe0f\u200d\u{e0020}-\u{e007f}]/gu;

// Visible emojis, pictographs, flags, keycaps, dingbats, and symbols:
// - Keycaps: [0-9#*]\ufe0f?\u20e3 (matched as a unit so the number is not left behind)
// - Extended_Pictographic: all standard emoji and pictographs
// - Regional_Indicator: country flag pairs
// - Emoji_Modifier: skin tone modifiers
// - Miscellaneous symbols, geometric shapes, and dingbats:
//   [\u00a9\u00ae\u203c\u2049\u2122\u2139\u2194-\u2199\u21a9-\u21aa\u231a-\u231b\u2328\u2388\u23cf\u23e9-\u23f3\u23f8-\u23fa\u24c2\u25aa-\u25ab\u25b6\u25c0\u25fb-\u27bf\u2934-\u2935\u2b05-\u2b07\u2b1b-\u2b1c\u2b50\u2b55\u3030\u303d\u3297\u3299\u20e3]
// - Astral symbol planes: [\u{1f000}-\u{1faff}]
export const VISIBLE_EMOJI_REGEX = /(?:[0-9#*]\ufe0f?\u20e3|[\u{1f000}-\u{1faff}\u00a9\u00ae\u203c\u2049\u2122\u2139\u2194-\u2199\u21a9-\u21aa\u231a-\u231b\u2328\u2388\u23cf\u23e9-\u23f3\u23f8-\u23fa\u24c2\u25aa-\u25ab\u25b6\u25c0\u25fb-\u27bf\u2934-\u2935\u2b05-\u2b07\u2b1b-\u2b1c\u2b50\u2b55\u3030\u303d\u3297\u3299\u20e3]|\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier})+/gu;

/**
 * Checks if a string contains any Unicode emoji, dingbat, or invisible formatting code point.
 * @param {string} text
 * @returns {boolean}
 */
export function hasEmoji(text) {
  if (typeof text !== 'string') return false;
  VISIBLE_EMOJI_REGEX.lastIndex = 0;
  INVISIBLE_FORMATS_REGEX.lastIndex = 0;
  return VISIBLE_EMOJI_REGEX.test(text) || INVISIBLE_FORMATS_REGEX.test(text);
}

/**
 * Normalizes a single display text string:
 * 1. Strips invisible formatting characters (VS15/16, ZWJ, tags) without inserting spaces.
 * 2. Replaces visible emojis/pictographs/flags/keycaps with a single space separator.
 * 3. Collapses multiple horizontal whitespace while preserving line breaks.
 *
 * @param {string|any} text
 * @returns {string|any}
 */
export function normalizeDisplayText(text) {
  if (typeof text !== 'string' || !text) return text;
  // 1. Remove invisible format codes first without spaces (e.g. Ph\u200dở -> Phở)
  let s = text.replace(INVISIBLE_FORMATS_REGEX, '');
  // 2. Replace visible emojis/pictographs/keycaps/flags with a single space (e.g. 20🍜30 -> 20 30)
  s = s.replace(VISIBLE_EMOJI_REGEX, ' ');
  // 3. Collapse multiple horizontal whitespace while preserving line breaks
  s = s.replace(/[ \t]{2,}/g, ' ');
  return s.trim();
}

/**
 * Sanitizes a Restaurant object for display.
 * @param {object|null} r
 * @returns {object|null}
 */
export function sanitizeRestaurantForDisplay(r) {
  if (!r || typeof r !== 'object') return r;
  return {
    ...r,
    // Strictly preserve raw identifiers, coordinates, locked state, ratings, source metadata
    id: r.id,
    lat: r.lat,
    lon: r.lon,
    locked: r.locked,
    label: r.label,
    source_url: r.source_url,
    source_fetched_at: r.source_fetched_at,
    distance_m: r.distance_m,
    distance_source: r.distance_source,
    distance_reason: r.distance_reason ? normalizeDisplayText(r.distance_reason) : r.distance_reason,
    // Display text fields
    name: normalizeDisplayText(r.name),
    address: r.address ? normalizeDisplayText(r.address) : r.address,
    district: r.district ? normalizeDisplayText(r.district) : r.district,
    dish_tags: Array.isArray(r.dish_tags) ? r.dish_tags.map(normalizeDisplayText) : r.dish_tags,
    description: r.description ? normalizeDisplayText(r.description) : r.description,
    specialties: Array.isArray(r.specialties) ? r.specialties.map(normalizeDisplayText) : r.specialties,
    unknowns: Array.isArray(r.unknowns) ? r.unknowns.map(normalizeDisplayText) : r.unknowns,
    // Hours display
    hours: r.hours ? {
      ...r.hours,
      display: r.hours.display ? normalizeDisplayText(r.hours.display) : r.hours.display,
      status: r.hours.status
    } : r.hours,
    // Price evidence display
    price: r.price ? {
      ...r.price,
      evidence: r.price.evidence ? normalizeDisplayText(r.price.evidence) : r.price.evidence
    } : r.price,
    // Nested details if present
    details: r.details && typeof r.details === 'object' ? {
      ...r.details,
      address: r.details.address ? normalizeDisplayText(r.details.address) : r.details.address,
      district: r.details.district ? normalizeDisplayText(r.details.district) : r.details.district,
      description: r.details.description ? normalizeDisplayText(r.details.description) : r.details.description,
      dish_tags: Array.isArray(r.details.dish_tags) ? r.details.dish_tags.map(normalizeDisplayText) : r.details.dish_tags,
      specialties: Array.isArray(r.details.specialties) ? r.details.specialties.map(normalizeDisplayText) : r.details.specialties,
      hours: r.details.hours ? {
        ...r.details.hours,
        display: r.details.hours.display ? normalizeDisplayText(r.details.hours.display) : r.details.hours.display
      } : r.details.hours
    } : r.details
  };
}

/**
 * Sanitizes a StopView object for display.
 * @param {object|null} st
 * @returns {object|null}
 */
export function sanitizeStopForDisplay(st) {
  if (!st || typeof st !== 'object') return st;
  return {
    ...st,
    // Strictly preserve raw identifiers, numbers, coordinates, URLs, times
    venue_id: st.venue_id,
    order: st.order,
    lat: st.lat,
    lon: st.lon,
    source_url: st.source_url,
    arrive: st.arrive,
    depart: st.depart,
    synthetic: st.synthetic,
    price: st.price,
    leg_from_previous: st.leg_from_previous,
    // Display text fields
    name: normalizeDisplayText(st.name),
    stage: st.stage ? normalizeDisplayText(st.stage) : st.stage,
    note: st.note ? normalizeDisplayText(st.note) : st.note,
    address: st.address ? normalizeDisplayText(st.address) : st.address,
    district: st.district ? normalizeDisplayText(st.district) : st.district,
    // Nested venue object if present (e.g. st.venue from backend StopView)
    venue: st.venue ? sanitizeRestaurantForDisplay(st.venue) : st.venue,
    // Why reasons
    why: Array.isArray(st.why) ? st.why.map((w) => ({
      ...w,
      text: normalizeDisplayText(w.text)
    })) : st.why,
    // Hours display
    hours: st.hours ? {
      ...st.hours,
      display: st.hours.display ? normalizeDisplayText(st.hours.display) : st.hours.display,
      hours_displayed: st.hours.hours_displayed ? normalizeDisplayText(st.hours.hours_displayed) : st.hours.hours_displayed
    } : st.hours
  };
}

/**
 * Sanitizes a Confirmation object for display.
 * @param {object|null} conf
 * @returns {object|null}
 */
export function sanitizeConfirmationForDisplay(conf) {
  if (!conf || typeof conf !== 'object') return conf;
  return {
    ...conf,
    // Strictly preserve IDs and versions
    id: conf.id,
    profile_version: conf.profile_version,
    selection_version: conf.selection_version,
    // Warnings
    warnings: Array.isArray(conf.warnings) ? conf.warnings.map(normalizeDisplayText) : conf.warnings,
    // Summary
    summary: conf.summary && typeof conf.summary === 'object' ? {
      ...conf.summary,
      title: conf.summary.title ? normalizeDisplayText(conf.summary.title) : conf.summary.title,
      notes: conf.summary.notes ? normalizeDisplayText(conf.summary.notes) : conf.summary.notes,
      description: conf.summary.description ? normalizeDisplayText(conf.summary.description) : conf.summary.description,
      area: conf.summary.area ? normalizeDisplayText(conf.summary.area) : conf.summary.area,
      missing: Array.isArray(conf.summary.missing) ? conf.summary.missing.map(normalizeDisplayText) : conf.summary.missing,
      shortlist: Array.isArray(conf.summary.shortlist) ? conf.summary.shortlist.map((s) => ({
        ...s,
        name: normalizeDisplayText(s.name)
      })) : conf.summary.shortlist,
      venues: Array.isArray(conf.summary.venues) ? conf.summary.venues.map((v) => ({
        ...v,
        name: normalizeDisplayText(v.name)
      })) : conf.summary.venues,
      items: Array.isArray(conf.summary.items) ? conf.summary.items.map((it) => ({
        ...it,
        label: normalizeDisplayText(it.label),
        value: typeof it.value === 'string' ? normalizeDisplayText(it.value) : it.value
      })) : conf.summary.items
    } : conf.summary,
    // Profile if nested inside confirmation
    profile: conf.profile ? sanitizeProfileForDisplay(conf.profile) : conf.profile
  };
}

/**
 * Sanitizes a Profile object for display.
 * @param {object|null} p
 * @returns {object|null}
 */
export function sanitizeProfileForDisplay(p) {
  if (!p || typeof p !== 'object') return p;
  return {
    ...p,
    // Area
    area: p.area ? normalizeDisplayText(p.area) : p.area,
    // Taste/dietary arrays
    tastes: Array.isArray(p.tastes) ? p.tastes.map(normalizeDisplayText) : p.tastes,
    exclusions: Array.isArray(p.exclusions) ? p.exclusions.map(normalizeDisplayText) : p.exclusions,
    allergies: Array.isArray(p.allergies) ? p.allergies.map(normalizeDisplayText) : p.allergies,
    // Strictly preserve origin object, numbers, budget_scope, vehicles, times
    origin: p.origin,
    party_size: p.party_size,
    budget_vnd: p.budget_vnd,
    budget_scope: p.budget_scope,
    start_time: p.start_time,
    end_time: p.end_time,
    duration_min: p.duration_min,
    vehicle: p.vehicle,
    max_leg_min: p.max_leg_min
  };
}

/**
 * Sanitizes a TourView object for display.
 * @param {object|null} tour
 * @returns {object|null}
 */
export function sanitizeTourForDisplay(tour) {
  if (!tour || typeof tour !== 'object') return tour;
  return {
    ...tour,
    // Strictly preserve revision, status, totals, locks, assumptions
    revision: tour.revision,
    status: tour.status,
    totals: tour.totals,
    locks: tour.locks,
    assumptions: tour.assumptions,
    // Display text fields
    title: tour.title ? normalizeDisplayText(tour.title) : tour.title,
    explanation: tour.explanation ? normalizeDisplayText(tour.explanation) : tour.explanation,
    reasons: Array.isArray(tour.reasons) ? tour.reasons.map(normalizeDisplayText) : tour.reasons,
    unknowns: Array.isArray(tour.unknowns) ? tour.unknowns.map(normalizeDisplayText) : tour.unknowns,
    proposed_changes: Array.isArray(tour.proposed_changes) ? tour.proposed_changes.map(normalizeDisplayText) : tour.proposed_changes,
    route_warnings: Array.isArray(tour.route_warnings) ? tour.route_warnings.map(normalizeDisplayText) : tour.route_warnings,
    // Stops
    stops: Array.isArray(tour.stops) ? tour.stops.map(sanitizeStopForDisplay) : tour.stops
  };
}

/**
 * Creates a display-sanitized clone of a discovery-v1 view object.
 * Only human-facing text fields are sanitized. All raw identifiers,
 * coordinates, tokens, revisions, locks, and status codes are preserved identically.
 *
 * @param {object|null} view
 * @returns {object|null}
 */
export function sanitizeViewForDisplay(view) {
  if (!view || typeof view !== 'object') return view;

  return {
    ...view,
    // Strictly preserve raw metadata, tokens, session IDs, versions & contracts
    contract: view.contract,
    session_id: view.session_id,
    token: view.token,
    revision: view.revision,
    profile_version: view.profile_version,
    selection_version: view.selection_version,
    status: view.status,
    source: view.source,
    provider: view.provider,
    diagnostics: view.diagnostics,

    // 1. Messages
    messages: Array.isArray(view.messages) ? view.messages.map((m) => {
      if (!m || typeof m !== 'object') return m;
      return {
        ...m,
        text: normalizeDisplayText(m.text)
      };
    }) : view.messages,

    // 2. Reply
    reply: view.reply && typeof view.reply === 'object' ? {
      ...view.reply,
      text: normalizeDisplayText(view.reply.text),
      question: view.reply.question ? normalizeDisplayText(view.reply.question) : null
    } : view.reply,

    // 3. Results (Restaurant Cards)
    results: Array.isArray(view.results) ? view.results.map(sanitizeRestaurantForDisplay) : view.results,

    // 4. Selection
    selection: Array.isArray(view.selection) ? view.selection.map(sanitizeRestaurantForDisplay) : view.selection,

    // 5. Comparison
    comparison: view.comparison && typeof view.comparison === 'object' ? {
      ...view.comparison,
      criteria: Array.isArray(view.comparison.criteria) ? view.comparison.criteria.map(normalizeDisplayText) : view.comparison.criteria,
      unknowns: Array.isArray(view.comparison.unknowns) ? view.comparison.unknowns.map(normalizeDisplayText) : view.comparison.unknowns,
      venues: Array.isArray(view.comparison.venues) ? view.comparison.venues.map(sanitizeRestaurantForDisplay) : view.comparison.venues
    } : view.comparison,

    // 6. Confirmation
    confirmation: view.confirmation ? sanitizeConfirmationForDisplay(view.confirmation) : view.confirmation,

    // 7. Profile
    profile: view.profile ? sanitizeProfileForDisplay(view.profile) : view.profile,

    // 8. Tour
    tour: view.tour ? sanitizeTourForDisplay(view.tour) : view.tour,

    // 9. Settings
    settings: view.settings ? {
      chat_model: view.settings.chat_model,
      web_search_enabled: Boolean(view.settings.web_search_enabled)
    } : view.settings,

    // 10. Location
    location: view.location ? {
      ...view.location,
      status: view.location.status,
      source: view.location.source,
      approximate: Boolean(view.location.approximate),
      label: view.location.label ? normalizeDisplayText(view.location.label) : view.location.label,
      candidates: Array.isArray(view.location.candidates) ? view.location.candidates.map((c) => ({
        ...c,
        id: c.id,
        lat: c.lat,
        lon: c.lon,
        kind: c.kind,
        approximate: Boolean(c.approximate),
        label: normalizeDisplayText(c.label)
      })) : view.location.candidates
    } : view.location,

    // 11. Web
    web: view.web ? {
      ...view.web,
      enabled: Boolean(view.web.enabled),
      status: view.web.status,
      reason: view.web.reason ? normalizeDisplayText(view.web.reason) : view.web.reason,
      sources: Array.isArray(view.web.sources) ? view.web.sources.map((s) => ({
        ...s,
        title: normalizeDisplayText(s.title),
        snippet: normalizeDisplayText(s.snippet),
        url: s.url,
        retrieved_at: s.retrieved_at,
        untrusted: Boolean(s.untrusted)
      })) : view.web.sources
    } : view.web
  };
}
