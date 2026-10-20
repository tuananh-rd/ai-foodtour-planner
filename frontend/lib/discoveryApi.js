/**
 * discoveryApi.js
 * Client module for Discovery Assistant HTTP contract (discovery-v1).
 * Adheres strictly to docs/DISCOVERY_ASSISTANT_CONTRACT.md.
 */

export class DiscoveryApiError extends Error {
  constructor(code, message, details = null, status = 400, latestRevision = null) {
    super(message);
    this.name = 'DiscoveryApiError';
    this.code = code;
    this.details = details;
    this.status = status;
    this.latestRevision = latestRevision;
  }
}

/**
 * Returns API base URL from environment or local default.
 */
export function getApiBaseUrl() {
  const envUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
  return envUrl.replace(/\/+$/, '');
}

/**
 * Valid action names in discovery-v1 tool allowlist.
 */
export const ALLOWED_TOOL_NAMES = [
  'search_restaurants',
  'get_restaurant_details',
  'compare_restaurants',
  'update_preferences',
  'update_foodtour_selection',
  'create_itinerary',
  'revise_itinerary'
];

/**
 * Validates action object according to discovery-v1 frozen contract.
 */
export function validateDiscoveryAction(action) {
  if (!action || typeof action !== 'object') {
    throw new DiscoveryApiError('invalid_action', 'Hành động không hợp lệ: phải là một đối tượng JSON.');
  }

  if (action.type === 'confirm') {
    if (!action.confirmation_id || typeof action.confirmation_id !== 'string') {
      throw new DiscoveryApiError('invalid_action', 'Hành động confirm yêu cầu confirmation_id hợp lệ dạng chuỗi.');
    }
    return action;
  }

  if (action.type === 'settings') {
    if (!action.arguments || typeof action.arguments !== 'object') {
      throw new DiscoveryApiError('invalid_action', 'Hành động settings yêu cầu đối tượng arguments.');
    }
    const hasChatModel = 'chat_model' in action.arguments;
    const hasWebSearch = 'web_search_enabled' in action.arguments;
    if (!hasChatModel && !hasWebSearch) {
      throw new DiscoveryApiError('invalid_action', 'Hành động settings phải cung cấp ít nhất một thiết lập (chat_model hoặc web_search_enabled).');
    }
    if (hasChatModel) {
      if (typeof action.arguments.chat_model !== 'string' || !action.arguments.chat_model.trim() || action.arguments.chat_model.trim().length < 3 || action.arguments.chat_model.trim().length > 64) {
        throw new DiscoveryApiError('invalid_action', 'chat_model phải là chuỗi định danh mô hình hợp lệ từ 3 đến 64 ký tự (không được null).');
      }
    }
    if (hasWebSearch) {
      if (typeof action.arguments.web_search_enabled !== 'boolean') {
        throw new DiscoveryApiError('invalid_action', 'web_search_enabled phải là giá trị boolean (true/false, không được null).');
      }
    }
    return action;
  }

  if (action.type === 'location') {
    if (!action.arguments || typeof action.arguments !== 'object') {
      throw new DiscoveryApiError('invalid_action', 'Hành động location yêu cầu đối tượng arguments.');
    }
    const { operation } = action.arguments;
    const validOperations = ['resolve', 'choose', 'coordinates', 'clear'];
    if (!operation || !validOperations.includes(operation)) {
      throw new DiscoveryApiError('invalid_action', `Thao tác location '${operation}' không hợp lệ (hỗ trợ resolve, choose, coordinates, clear).`);
    }
    if (operation === 'resolve') {
      if (!action.arguments.query || typeof action.arguments.query !== 'string' || !action.arguments.query.trim()) {
        throw new DiscoveryApiError('invalid_action', 'Thao tác resolve yêu cầu query là chuỗi địa điểm không rỗng.');
      }
    } else if (operation === 'choose') {
      if (!action.arguments.candidate_id || typeof action.arguments.candidate_id !== 'string') {
        throw new DiscoveryApiError('invalid_action', 'Thao tác choose yêu cầu candidate_id hợp lệ.');
      }
    } else if (operation === 'coordinates') {
      const lat = Number(action.arguments.lat);
      const lon = Number(action.arguments.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new DiscoveryApiError('invalid_action', 'Tọa độ vị trí lat/lon không hợp lệ.');
      }
      if (!action.arguments.source || typeof action.arguments.source !== 'string') {
        action.arguments.source = 'coordinates';
      }
    }
    return action;
  }

  if (action.type === 'tool') {
    if (!action.name || !ALLOWED_TOOL_NAMES.includes(action.name)) {
      throw new DiscoveryApiError('invalid_action', `Tên công cụ '${action.name}' không nằm trong danh mục cho phép của hợp đồng discovery-v1.`);
    }
    if (!action.arguments || typeof action.arguments !== 'object') {
      action.arguments = {};
    }
    return action;
  }

  throw new DiscoveryApiError('invalid_action', `Loại hành động '${action.type}' không được hỗ trợ (chấp nhận 'tool', 'confirm', 'settings', 'location').`);
}

/**
 * Helper to format readable 422 validation errors from FastAPI/Pydantic or custom schema.
 */
function formatValidationError(body, statusText) {
  if (!body) return `Lỗi xác thực dữ liệu (422): ${statusText}`;
  if (typeof body.detail === 'string') return `Lỗi dữ liệu: ${body.detail}`;
  if (Array.isArray(body.detail)) {
    const messages = body.detail.map((d) => {
      const loc = Array.isArray(d.loc) ? d.loc.filter((p) => p !== 'body').join('.') : '';
      return `${loc ? `Trường '${loc}': ` : ''}${d.msg || 'giá trị không hợp lệ'}`;
    });
    return `Lỗi xác thực dữ liệu (422): ${messages.join('; ')}`;
  }
  if (body.message) return body.message;
  return `Lỗi dữ liệu (422): Yêu cầu không đáp ứng cấu trúc hợp đồng discovery-v1.`;
}

/**
 * Fetch wrapper with timeout and AbortController chaining.
 */
export async function fetchWithTimeout(url, init = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const callerSignal = init.signal;
  let callerAbortHandler = null;

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerAbortHandler = () => controller.abort();
      callerSignal.addEventListener('abort', callerAbortHandler);
    }
  }

  let timer = setTimeout(() => {
    controller.abort(new Error(`Quá thời gian chờ phản hồi (${timeoutMs}ms)`));
  }, timeoutMs);

  function cleanupTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (callerSignal && callerAbortHandler) {
      callerSignal.removeEventListener('abort', callerAbortHandler);
      callerAbortHandler = null;
    }
  }

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });

    // Wrap body consumption methods so the timeout bounds res.json/text reading as well
    const origJson = res.json.bind(res);
    const origText = res.text.bind(res);

    res.json = async () => {
      try {
        return await origJson();
      } catch (err) {
        if (err.name === 'AbortError' || controller.signal.aborted) {
          if (callerSignal?.aborted) {
            const customErr = new Error('Yêu cầu đã bị hủy.');
            customErr.name = 'AbortError';
            throw customErr;
          }
          throw new DiscoveryApiError('timeout', `Quá thời gian đọc phản hồi từ máy chủ (${timeoutMs}ms). Vui lòng thử lại.`, null, 408);
        }
        throw err;
      } finally {
        cleanupTimer();
      }
    };

    res.text = async () => {
      try {
        return await origText();
      } catch (err) {
        if (err.name === 'AbortError' || controller.signal.aborted) {
          if (callerSignal?.aborted) {
            const customErr = new Error('Yêu cầu đã bị hủy.');
            customErr.name = 'AbortError';
            throw customErr;
          }
          throw new DiscoveryApiError('timeout', `Quá thời gian đọc phản hồi từ máy chủ (${timeoutMs}ms). Vui lòng thử lại.`, null, 408);
        }
        throw err;
      } finally {
        cleanupTimer();
      }
    };

    return res;
  } catch (err) {
    cleanupTimer();
    if (err.name === 'AbortError' || controller.signal.aborted) {
      if (callerSignal?.aborted) {
        const customErr = new Error('Yêu cầu đã bị hủy.');
        customErr.name = 'AbortError';
        throw customErr;
      }
      throw new DiscoveryApiError('timeout', `Quá thời gian kết nối tới máy chủ (${timeoutMs}ms). Vui lòng thử lại.`, null, 408);
    }
    throw new DiscoveryApiError('network_error', `Không thể kết nối đến máy chủ: ${err.message}`, err);
  }
}

/**
 * Helper to validate minimal discovery-v1 view shape.
 * Rejects non-contract or malformed 200 responses before they reach state.
 */
export function validateDiscoveryViewShape(view, statusCode = 200) {
  if (!view || typeof view !== 'object' || Array.isArray(view)) {
    throw new DiscoveryApiError('bad_response', 'Dữ liệu phản hồi rỗng hoặc không phải đối tượng JSON.', view, statusCode);
  }
  if (view.contract !== 'discovery-v1') {
    throw new DiscoveryApiError('bad_response', `Hợp đồng phản hồi không hợp lệ: mong đợi 'discovery-v1', nhận '${view.contract}'.`, view, statusCode);
  }
  if (!view.session_id || typeof view.session_id !== 'string') {
    throw new DiscoveryApiError('bad_response', 'Dữ liệu phản hồi thiếu trường session_id hợp lệ.', view, statusCode);
  }
  if (typeof view.revision !== 'number') {
    throw new DiscoveryApiError('bad_response', 'Dữ liệu phản hồi thiếu trường revision hợp lệ.', view, statusCode);
  }
  return view;
}

/**
 * GET /v1/assistant/capabilities
 * Fetches discovery assistant capabilities (chat models, web search status, location mode).
 * Makes no provider request and returns verified discovery-v1 capabilities.
 */
export async function getAssistantCapabilities(options = {}) {
  const url = `${getApiBaseUrl()}/v1/assistant/capabilities`;
  const headers = {
    'Accept': 'application/json'
  };

  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers,
    signal: options.signal
  }, options.timeoutMs || 10000);

  let body = null;
  try {
    body = await res.json();
  } catch (jsonErr) {
    if (jsonErr instanceof DiscoveryApiError || jsonErr?.name === 'AbortError') {
      throw jsonErr;
    }
    throw new DiscoveryApiError(
      'bad_response',
      `Phản hồi cấu hình trợ lý không hợp lệ (mã ${res.status}).`,
      null,
      res.status
    );
  }

  if (!res.ok) {
    const code = body?.code || 'capabilities_failed';
    const msg = body?.message || `Lỗi tải cấu hình trợ lý (${res.status}): ${res.statusText}`;
    throw new DiscoveryApiError(code, msg, body, res.status);
  }

  return body;
}

/**
 * GET /v1/sessions/{id}/assistant
 * Returns current discovery assistant view.
 */
export async function getDiscoveryAssistant(sessionId, sessionToken = '', options = {}) {
  if (!sessionId) {
    throw new DiscoveryApiError('missing_session_id', 'Thiếu sessionId khi tải dữ liệu trợ lý khám phá.');
  }

  const url = `${getApiBaseUrl()}/v1/sessions/${encodeURIComponent(sessionId)}/assistant`;
  const headers = {
    'Accept': 'application/json'
  };
  if (sessionToken) {
    headers['X-Session-Token'] = sessionToken;
  }

  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers,
    signal: options.signal
  }, options.timeoutMs || 15000);

  let body = null;
  try {
    body = await res.json();
  } catch (jsonErr) {
    if (jsonErr instanceof DiscoveryApiError || jsonErr?.name === 'AbortError') {
      throw jsonErr;
    }
    if (!res.ok) {
      body = null;
    } else {
      throw new DiscoveryApiError(
        'bad_response',
        `Phản hồi từ máy chủ không hợp lệ (mã ${res.status}, dữ liệu không phải JSON). Vui lòng thử lại.`,
        null,
        res.status
      );
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new DiscoveryApiError('unauthorized', body?.message || 'Phiên làm việc chưa được xác thực (401).', body, 401);
    }
    if (res.status === 404) {
      throw new DiscoveryApiError('session_not_found', 'Phiên làm việc không tồn tại hoặc đã hết hạn (404). Vui lòng tạo phiên mới.', body, 404);
    }
    if (res.status === 422) {
      const readable = formatValidationError(body, res.statusText);
      throw new DiscoveryApiError('validation_error', readable, body, 422, body?.latest_revision);
    }
    const code = body?.code || 'request_failed';
    const msg = body?.message || (typeof body?.detail === 'string' ? body.detail : null) || `Lỗi máy chủ (${res.status}): ${res.statusText}`;
    throw new DiscoveryApiError(code, msg, body, res.status, body?.latest_revision);
  }

  return validateDiscoveryViewShape(body, res.status);
}

/**
 * POST /v1/sessions/{id}/assistant (Text turn)
 * Sends a natural user message.
 */
export async function sendDiscoveryMessage(sessionId, revision, text, sessionToken = '', options = {}) {
  if (!sessionId) {
    throw new DiscoveryApiError('missing_session_id', 'Thiếu sessionId khi gửi tin nhắn.');
  }
  if (revision === undefined || revision === null) {
    throw new DiscoveryApiError('missing_revision', 'Thiếu revision phiên làm việc.');
  }
  const cleanText = typeof text === 'string' ? text.trim() : '';
  if (!cleanText || cleanText.length > 1000) {
    throw new DiscoveryApiError('invalid_text', 'Nội dung tin nhắn phải từ 1 đến 1000 ký tự.');
  }

  const url = `${getApiBaseUrl()}/v1/sessions/${encodeURIComponent(sessionId)}/assistant`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (sessionToken) {
    headers['X-Session-Token'] = sessionToken;
  }

  const payload = {
    revision: Number(revision),
    text: cleanText
  };

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: options.signal
  }, options.timeoutMs || 25000);

  let body = null;
  try {
    body = await res.json();
  } catch (jsonErr) {
    if (jsonErr instanceof DiscoveryApiError || jsonErr?.name === 'AbortError') {
      throw jsonErr;
    }
    if (!res.ok) {
      body = null;
    } else {
      throw new DiscoveryApiError(
        'bad_response',
        `Phản hồi từ máy chủ không hợp lệ (mã ${res.status}, dữ liệu không phải JSON). Vui lòng thử lại.`,
        null,
        res.status
      );
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new DiscoveryApiError('unauthorized', body?.message || 'Phiên làm việc chưa được xác thực (401).', body, 401);
    }
    if (res.status === 409) {
      const latestRev = body?.latest_revision || body?.revision || null;
      throw new DiscoveryApiError(
        'revision_conflict',
        body?.message || 'Phiên làm việc đã có cập nhật mới (409 Conflict). Đang đồng bộ lại trạng thái…',
        body,
        409,
        latestRev
      );
    }
    if (res.status === 422) {
      const readable = formatValidationError(body, res.statusText);
      throw new DiscoveryApiError('validation_error', readable, body, 422, body?.latest_revision);
    }
    const code = body?.code || 'message_failed';
    const msg = body?.message || (typeof body?.detail === 'string' ? body.detail : null) || `Không thể gửi tin nhắn (${res.status}): ${res.statusText}`;
    throw new DiscoveryApiError(code, msg, body, res.status, body?.latest_revision);
  }

  return validateDiscoveryViewShape(body, res.status);
}

/**
 * POST /v1/sessions/{id}/assistant (Action turn)
 * Sends a validated tool or confirm action.
 */
export async function sendDiscoveryAction(sessionId, revision, rawAction, sessionToken = '', options = {}) {
  if (!sessionId) {
    throw new DiscoveryApiError('missing_session_id', 'Thiếu sessionId khi thực hiện thao tác.');
  }
  if (revision === undefined || revision === null) {
    throw new DiscoveryApiError('missing_revision', 'Thiếu revision phiên làm việc.');
  }

  const action = validateDiscoveryAction(rawAction);
  const url = `${getApiBaseUrl()}/v1/sessions/${encodeURIComponent(sessionId)}/assistant`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (sessionToken) {
    headers['X-Session-Token'] = sessionToken;
  }

  const payload = {
    revision: Number(revision),
    action
  };

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: options.signal
  }, options.timeoutMs || 25000);

  let body = null;
  try {
    body = await res.json();
  } catch (jsonErr) {
    if (jsonErr instanceof DiscoveryApiError || jsonErr?.name === 'AbortError') {
      throw jsonErr;
    }
    if (!res.ok) {
      body = null;
    } else {
      throw new DiscoveryApiError(
        'bad_response',
        `Phản hồi từ máy chủ không hợp lệ (mã ${res.status}, dữ liệu không phải JSON). Vui lòng thử lại.`,
        null,
        res.status
      );
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new DiscoveryApiError('unauthorized', body?.message || 'Phiên làm việc chưa được xác thực (401).', body, 401);
    }
    if (res.status === 409) {
      const latestRev = body?.latest_revision || body?.revision || null;
      throw new DiscoveryApiError(
        'revision_conflict',
        body?.message || 'Phiên làm việc đã có cập nhật mới (409 Conflict). Đang đồng bộ lại trạng thái…',
        body,
        409,
        latestRev
      );
    }
    if (res.status === 422) {
      const readable = formatValidationError(body, res.statusText);
      throw new DiscoveryApiError('validation_error', readable, body, 422, body?.latest_revision);
    }
    const code = body?.code || 'action_failed';
    const msg = body?.message || (typeof body?.detail === 'string' ? body.detail : null) || `Không thể thực hiện thao tác (${res.status}): ${res.statusText}`;
    throw new DiscoveryApiError(code, msg, body, res.status, body?.latest_revision);
  }

  return validateDiscoveryViewShape(body, res.status);
}

/**
 * Action Helpers
 */
export function addSelectionAction(selectionVersion, venueIds) {
  const ids = Array.isArray(venueIds) ? venueIds : [venueIds];
  return {
    type: 'tool',
    name: 'update_foodtour_selection',
    arguments: {
      operation: 'add',
      venue_ids: ids,
      selection_version: Number(selectionVersion) || 0
    }
  };
}

export function removeSelectionAction(selectionVersion, venueIds) {
  const ids = Array.isArray(venueIds) ? venueIds : [venueIds];
  return {
    type: 'tool',
    name: 'update_foodtour_selection',
    arguments: {
      operation: 'remove',
      venue_ids: ids,
      selection_version: Number(selectionVersion) || 0
    }
  };
}

export function lockSelectionAction(selectionVersion, venueIds) {
  const ids = Array.isArray(venueIds) ? venueIds : [venueIds];
  return {
    type: 'tool',
    name: 'update_foodtour_selection',
    arguments: {
      operation: 'lock',
      venue_ids: ids,
      selection_version: Number(selectionVersion) || 0
    }
  };
}

export function unlockSelectionAction(selectionVersion, venueIds) {
  const ids = Array.isArray(venueIds) ? venueIds : [venueIds];
  return {
    type: 'tool',
    name: 'update_foodtour_selection',
    arguments: {
      operation: 'unlock',
      venue_ids: ids,
      selection_version: Number(selectionVersion) || 0
    }
  };
}

export function searchRestaurantsAction(dish, area, maxPriceVnd) {
  const args = {};
  if (dish) args.dish = String(dish).trim();
  if (area) args.area = String(area).trim();
  if (typeof maxPriceVnd === 'number' && maxPriceVnd > 0) args.max_price_vnd = Math.round(maxPriceVnd);
  return {
    type: 'tool',
    name: 'search_restaurants',
    arguments: args
  };
}

export function getRestaurantDetailsAction(venueId) {
  return {
    type: 'tool',
    name: 'get_restaurant_details',
    arguments: { venue_id: String(venueId) }
  };
}

export function compareRestaurantsAction(venueIds) {
  return {
    type: 'tool',
    name: 'compare_restaurants',
    arguments: { venue_ids: Array.isArray(venueIds) ? venueIds : [venueIds] }
  };
}

export function updatePreferencesAction(patch) {
  return {
    type: 'tool',
    name: 'update_preferences',
    arguments: { patch: patch && typeof patch === 'object' ? patch : {} }
  };
}

export function createItineraryAction() {
  return {
    type: 'tool',
    name: 'create_itinerary',
    arguments: {}
  };
}

export function reviseItineraryAction() {
  return {
    type: 'tool',
    name: 'revise_itinerary',
    arguments: {}
  };
}

export function confirmAction(confirmationId) {
  return {
    type: 'confirm',
    confirmation_id: String(confirmationId)
  };
}

export function updateSettingsAction({ chat_model, web_search_enabled } = {}) {
  const args = {};
  if (chat_model !== undefined && chat_model !== null) {
    if (typeof chat_model !== 'string' || !chat_model.trim() || chat_model.trim().length < 3 || chat_model.trim().length > 64) {
      throw new DiscoveryApiError('invalid_action', 'chat_model phải là chuỗi định danh mô hình hợp lệ từ 3 đến 64 ký tự (không được null).');
    }
    args.chat_model = chat_model.trim();
  }
  if (web_search_enabled !== undefined && web_search_enabled !== null) {
    if (typeof web_search_enabled !== 'boolean') {
      throw new DiscoveryApiError('invalid_action', 'web_search_enabled phải là giá trị boolean (true/false, không được null).');
    }
    args.web_search_enabled = web_search_enabled;
  }
  if (Object.keys(args).length === 0) {
    throw new DiscoveryApiError('invalid_action', 'Hành động settings phải cung cấp ít nhất một thiết lập hợp lệ (chat_model hoặc web_search_enabled).');
  }
  return {
    type: 'settings',
    arguments: args
  };
}

export function resolveLocationAction(query) {
  return {
    type: 'location',
    arguments: {
      operation: 'resolve',
      query: String(query || '').trim()
    }
  };
}

export function chooseLocationCandidateAction(candidateId) {
  return {
    type: 'location',
    arguments: {
      operation: 'choose',
      candidate_id: String(candidateId)
    }
  };
}

export function setCoordinatesLocationAction(lat, lon, source = 'coordinates') {
  if (lat === null || lat === undefined || lat === '' || lon === null || lon === undefined || lon === '') {
    throw new DiscoveryApiError('invalid_action', 'Tọa độ vị trí lat/lon không được để trống.');
  }
  const numLat = Number(lat);
  const numLon = Number(lon);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLon) || numLat < -90 || numLat > 90 || numLon < -180 || numLon > 180) {
    throw new DiscoveryApiError('invalid_action', 'Tọa độ vị trí lat/lon không hợp lệ (lat: [-90, 90], lon: [-180, 180]).');
  }
  const safeSource = source === 'gps' ? 'gps' : 'coordinates';
  return {
    type: 'location',
    arguments: {
      operation: 'coordinates',
      lat: numLat,
      lon: numLon,
      source: safeSource
    }
  };
}

export function clearLocationAction() {
  return {
    type: 'location',
    arguments: {
      operation: 'clear'
    }
  };
}

/**
 * Standard Vietnamese translations for backend distance_reason enum values.
 */
export const DISTANCE_REASON_LABELS_VI = {
  origin_missing: 'chưa có điểm xuất phát',
  venue_coordinates_missing: 'quán thiếu toạ độ'
};

/**
 * Formats server-computed distance_m as "đường chim bay" without inventing ETA or road routing.
 */
export function formatDistanceDisplay(restaurant) {
  if (!restaurant || typeof restaurant !== 'object') return null;
  const dist = restaurant.distance_m;
  if (typeof dist === 'number' && Number.isFinite(dist)) {
    if (dist < 1000) {
      return `~${Math.round(dist)} m (đường chim bay)`;
    }
    const km = (dist / 1000).toFixed(1);
    return `~${km} km (đường chim bay)`;
  }
  const rawReason = restaurant.distance_reason;
  if (rawReason) {
    const translated = DISTANCE_REASON_LABELS_VI[rawReason] || rawReason;
    return `Chưa có khoảng cách (${translated})`;
  }
  return 'Chưa có khoảng cách';
}

/**
 * Safe external URL helper to guard untrusted href links (http/https only).
 */
export function safeExternalUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Standard Vietnamese translations for discovery-v1 unknowns and evidence gaps.
 * Preserves distinct unknowns without making safety claims.
 */
export const UNKNOWN_LABELS_VI = {
  ingredient_allergy_safety: 'an toàn thành phần dị ứng',
  allergy_ingredients: 'thành phần đánh giá dị ứng',
  sweetness: 'độ ngọt món ăn',
  dish_price: 'giá từng món ăn',
  current_open_status: 'trạng thái mở cửa hiện tại',
  hours: 'giờ mở cửa thực tế',
  price_per_person: 'giá theo người',
  route: 'tuyến đường thực tế',
  route_time: 'thời gian di chuyển',
  budget: 'chi phí theo ngân sách',
  amenity: 'tiện ích quán',
  parking: 'chỗ đỗ xe',
  taste: 'khẩu vị'
};

export function formatUnknownLabel(key) {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (UNKNOWN_LABELS_VI[trimmed]) {
    return UNKNOWN_LABELS_VI[trimmed];
  }
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(trimmed)) {
    return trimmed;
  }
  return trimmed.replace(/_/g, ' ');
}
