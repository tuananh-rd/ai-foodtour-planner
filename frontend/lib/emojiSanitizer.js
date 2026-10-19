/**
 * frontend/lib/emojiSanitizer.js
 * Display-only runtime Unicode emoji normalization.
 *
 * Responsibilities:
 * - Sanitizes dynamic/restored/provider/venue/user-echo text for DISPLAY only.
 * - Preserves raw input, IDs, tokens, URLs, ordinary digits/numbers, prices, and Vietnamese text.
 * - Never modifies session state, authentication tokens, API payloads, or raw IDs.
 */

// Modern Unicode pattern detecting:
// - Keycaps: [0-9#*]\ufe0f?\u20e3
// - Extended_Pictographic: all standard emoji/pictographs
// - Regional_Indicator: country flag pairs
// - Emoji_Modifier: skin tone modifiers
// - Miscellaneous symbols & dingbats: [\u2600-\u26ff], [\u2700-\u27bf]
// - Legacy emoji code points: [\u231a\u231b\u23e9-\u23ec\u23f0\u23f3], [\u2b50\u2b55]
// - Variation selectors & ZWJ: [\ufe0e\ufe0f], \u200d
export const EMOJI_DISPLAY_REGEX = /(?:[0-9#*]\ufe0f?\u20e3|\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\u2600-\u26ff]|[\u2700-\u27bf]|[\u231a\u231b\u23e9-\u23ec\u23f0\u23f3]|[\u2b50\u2b55]|[\ufe0e\ufe0f]|\u200d)+/gu;

/**
 * Checks if a string contains any Unicode emoji or dingbat code points.
 * @param {string} text
 * @returns {boolean}
 */
export function hasEmoji(text) {
  if (typeof text !== 'string') return false;
  EMOJI_DISPLAY_REGEX.lastIndex = 0;
  return EMOJI_DISPLAY_REGEX.test(text);
}

/**
 * Normalizes a single display text string by removing Unicode emojis/pictographs,
 * collapsing excessive horizontal whitespace while preserving newlines, punctuation,
 * numbers, IDs, and URLs.
 *
 * @param {string|any} text
 * @returns {string|any}
 */
export function normalizeDisplayText(text) {
  if (typeof text !== 'string') return text;
  EMOJI_DISPLAY_REGEX.lastIndex = 0;
  if (!EMOJI_DISPLAY_REGEX.test(text)) return text;
  EMOJI_DISPLAY_REGEX.lastIndex = 0;
  return text
    .replace(EMOJI_DISPLAY_REGEX, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
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

  const sanitized = { ...view };

  // 1. Messages
  if (Array.isArray(view.messages)) {
    sanitized.messages = view.messages.map((m) => {
      if (!m || typeof m !== 'object') return m;
      return {
        ...m,
        text: normalizeDisplayText(m.text)
      };
    });
  }

  // 2. Reply
  if (view.reply && typeof view.reply === 'object') {
    sanitized.reply = {
      ...view.reply,
      text: normalizeDisplayText(view.reply.text),
      question: view.reply.question ? normalizeDisplayText(view.reply.question) : null
    };
  }

  // 3. Results (Restaurant Cards)
  if (Array.isArray(view.results)) {
    sanitized.results = view.results.map((r) => {
      if (!r || typeof r !== 'object') return r;
      return {
        ...r,
        name: normalizeDisplayText(r.name),
        description: r.description ? normalizeDisplayText(r.description) : r.description,
        specialties: Array.isArray(r.specialties) ? r.specialties.map(normalizeDisplayText) : r.specialties,
        address: r.address ? normalizeDisplayText(r.address) : r.address
      };
    });
  }

  // 4. Selection
  if (Array.isArray(view.selection)) {
    sanitized.selection = view.selection.map((s) => {
      if (!s || typeof s !== 'object') return s;
      return {
        ...s,
        name: normalizeDisplayText(s.name),
        address: s.address ? normalizeDisplayText(s.address) : s.address
      };
    });
  }

  // 5. Comparison
  if (view.comparison && typeof view.comparison === 'object') {
    sanitized.comparison = {
      ...view.comparison,
      criteria: Array.isArray(view.comparison.criteria) ? view.comparison.criteria.map(normalizeDisplayText) : view.comparison.criteria,
      unknowns: Array.isArray(view.comparison.unknowns) ? view.comparison.unknowns.map(normalizeDisplayText) : view.comparison.unknowns,
      venues: Array.isArray(view.comparison.venues) ? view.comparison.venues.map((v) => ({
        ...v,
        name: normalizeDisplayText(v.name),
        address: v.address ? normalizeDisplayText(v.address) : v.address
      })) : view.comparison.venues
    };
  }

  // 6. Confirmation
  if (view.confirmation && typeof view.confirmation === 'object') {
    sanitized.confirmation = {
      ...view.confirmation,
      warnings: Array.isArray(view.confirmation.warnings) ? view.confirmation.warnings.map(normalizeDisplayText) : view.confirmation.warnings
    };
  }

  // 7. Tour
  if (view.tour && typeof view.tour === 'object') {
    sanitized.tour = {
      ...view.tour,
      title: view.tour.title ? normalizeDisplayText(view.tour.title) : view.tour.title,
      route_warnings: Array.isArray(view.tour.route_warnings) ? view.tour.route_warnings.map(normalizeDisplayText) : view.tour.route_warnings,
      stops: Array.isArray(view.tour.stops) ? view.tour.stops.map((st) => ({
        ...st,
        name: normalizeDisplayText(st.name),
        stage: st.stage ? normalizeDisplayText(st.stage) : st.stage,
        note: st.note ? normalizeDisplayText(st.note) : st.note
      })) : view.tour.stops
    };
  }

  return sanitized;
}
