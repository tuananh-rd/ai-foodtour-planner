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
    const validOperations = ['resolve', 'choose', 'coordinates', 'clear', 'label'];
    if (!operation || !validOperations.includes(operation)) {
      throw new DiscoveryApiError('invalid_action', `Thao tác location '${operation}' không hợp lệ (hỗ trợ resolve, choose, coordinates, clear, label).`);
    }
    if (operation === 'resolve') {
      if (!action.arguments.query || typeof action.arguments.query !== 'string' || !action.arguments.query.trim()) {
        throw new DiscoveryApiError('invalid_action', 'Thao tác resolve yêu cầu query là chuỗi địa điểm không rỗng.');
      }
    } else if (operation === 'choose') {
      if (!action.arguments.candidate_id || typeof action.arguments.candidate_id !== 'string') {
        throw new DiscoveryApiError('invalid_action', 'Thao tác choose yêu cầu candidate_id hợp lệ.');
      }
    } else if (operation === 'label') {
      if (!action.arguments.label || typeof action.arguments.label !== 'string' || action.arguments.label.trim().length < 2 || action.arguments.label.trim().length > 160) {
        throw new DiscoveryApiError('invalid_action', 'Thao tác label yêu cầu label là chuỗi từ 2 đến 160 ký tự.');
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
      if (action.arguments.resolve_address && action.arguments.source !== 'gps' && action.arguments.source !== 'map') {
        throw new DiscoveryApiError('invalid_action', 'Tùy chọn resolve_address chỉ được phép khi source là gps hoặc map.');
      }
      if (action.arguments.label !== undefined && action.arguments.label !== null) {
        if (typeof action.arguments.label !== 'string' || action.arguments.label.trim().length < 2 || action.arguments.label.trim().length > 160) {
          throw new DiscoveryApiError('invalid_action', 'Nhãn tọa độ tùy chọn phải là chuỗi từ 2 đến 160 ký tự.');
        }
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

export function setCoordinatesLocationAction(lat, lon, source = 'coordinates', resolveAddress = false, label = null) {
  if (lat === null || lat === undefined || lat === '' || lon === null || lon === undefined || lon === '') {
    throw new DiscoveryApiError('invalid_action', 'Tọa độ vị trí lat/lon không được để trống.');
  }
  const numLat = Number(lat);
  const numLon = Number(lon);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLon) || numLat < -90 || numLat > 90 || numLon < -180 || numLon > 180) {
    throw new DiscoveryApiError('invalid_action', 'Tọa độ vị trí lat/lon không hợp lệ (lat: [-90, 90], lon: [-180, 180]).');
  }
  const safeSource = (source === 'gps' || source === 'map') ? source : 'coordinates';
  const args = {
    operation: 'coordinates',
    lat: numLat,
    lon: numLon,
    source: safeSource
  };
  if (resolveAddress && (safeSource === 'gps' || safeSource === 'map')) {
    args.resolve_address = true;
  }
  if (label && typeof label === 'string' && label.trim().length >= 2) {
    args.label = label.trim().slice(0, 160);
  }
  return {
    type: 'location',
    arguments: args
  };
}

export function setLabelLocationAction(label) {
  if (!label || typeof label !== 'string' || label.trim().length < 2 || label.trim().length > 160) {
    throw new DiscoveryApiError('invalid_action', 'Tên địa chỉ phải là chuỗi từ 2 đến 160 ký tự.');
  }
  return {
    type: 'location',
    arguments: {
      operation: 'label',
      label: label.trim().slice(0, 160)
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
  origin_missing: 'chưa chọn điểm xuất phát',
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
 * Formats a MenuReference (discovery-v1 matching_menu) delivery reference price,
 * truthfully. ShopeeFood delivery reference — NEVER presented as a dine-in price.
 * Quarantined or missing prices are shown as unverified, not invented.
 */
export function formatMenuReferencePrice(mref) {
  if (!mref || typeof mref !== 'object') return 'Giá chưa xác định';
  if (mref.price_status === 'quarantined' || mref.reference_price_vnd === null || mref.reference_price_vnd === undefined) {
    return 'Giá chưa xác minh';
  }
  const p = Number(mref.reference_price_vnd);
  if (!Number.isFinite(p)) return 'Giá chưa xác định';
  return `${p.toLocaleString('vi-VN')} đ`;
}

/**
 * Formats the mandatory-option minimum for a MenuReference, or a truthful
 * "not determined" when the source minimum could not be verified.
 */
export function formatMenuMinimum(mref) {
  if (!mref || typeof mref !== 'object') return null;
  // min_total_vnd is the per-item minimum INCLUDING mandatory options, not an order minimum.
  if (mref.min_total_vnd !== null && mref.min_total_vnd !== undefined && Number.isFinite(Number(mref.min_total_vnd))) {
    return `Giá món tối thiểu ~${Number(mref.min_total_vnd).toLocaleString('vi-VN')} đ`;
  }
  if (mref.mandatory_options === true || mref.price_status === 'minimum_unknown') {
    return 'Giá món tối thiểu chưa xác định';
  }
  return null;
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
  elderly_access: 'tiếp cận người cao tuổi / đi lại thuận tiện',
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

/**
 * Fetches server-generated Free Google Maps Links for tour itinerary.
 * Endpoint: GET /v1/sessions/{id}/tour/maps-links?mode=walking|driving
 * Includes X-Session-Token authentication.
 */
export async function getDiscoveryMapsLinks(sessionId, sessionToken, mode = 'walking', options = {}) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new DiscoveryApiError('invalid_session_id', 'Thiếu sessionId hợp lệ.');
  }
  if (!sessionToken || typeof sessionToken !== 'string') {
    throw new DiscoveryApiError('unauthorized', 'Thiếu sessionToken hợp lệ.');
  }

  const validModes = ['walking', 'driving'];
  const targetMode = validModes.includes(mode) ? mode : 'walking';

  const headers = {
    'Accept': 'application/json',
    'X-Session-Token': sessionToken
  };

  const query = new URLSearchParams({ mode: targetMode });
  const url = `${getApiBaseUrl()}/v1/sessions/${encodeURIComponent(sessionId)}/tour/maps-links?${query.toString()}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers,
      signal: options?.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new DiscoveryApiError('network_error', 'Không thể kết nối đến máy chủ.');
  }

  if (!res.ok) {
    let errData = null;
    try {
      errData = await res.json();
    } catch {
      // Ignore JSON parse error on non-OK response
    }
    const code = errData?.detail?.code || errData?.code || 'maps_links_error';
    const message = errData?.detail?.message || errData?.message || `Lỗi máy chủ (${res.status})`;
    throw new DiscoveryApiError(code, message, errData?.detail || errData, res.status);
  }

  return await res.json();
}

/**
 * Exact legacy generic prefix from backend:
 * "Model chưa phản hồi hoặc đã đạt giới hạn; đang dùng xử lý tại máy. "
 */
const LEGACY_GENERIC_PREFIX_REGEX = /^Model chưa phản hồi hoặc đã đạt giới hạn[;,]?\s*đang dùng xử lý tại máy\.\s*/i;

/**
 * Checks if text contains exact legacy generic prefix.
 */
export function hasLegacyGenericPrefix(text) {
  if (typeof text !== 'string') return false;
  return LEGACY_GENERIC_PREFIX_REGEX.test(text);
}

/**
 * Strips legacy generic outage prefixes display-only from assistant text.
 * Preserves stored history untouched.
 */
export function stripLegacyOutagePrefix(text) {
  if (typeof text !== 'string') return text;
  return text.replace(LEGACY_GENERIC_PREFIX_REGEX, '');
}

/**
 * Returns human-readable truthful label for reply source without claiming fake model success.
 * Prioritizes explicit 'tools' before generic 'mode: rules'.
 */
export function formatReplySource(replySource, model = null, mode = null) {
  if (replySource === 'tools') {
    return 'CÔNG CỤ NỘI BỘ';
  }
  if (replySource === 'rules' || mode === 'rules') {
    return 'QUY TẮC NỘI BỘ';
  }
  if (replySource === 'model' && mode !== 'rules') {
    return model ? model.toUpperCase() : 'MÔ HÌNH AI';
  }
  return null;
}

/**
 * Benign reasons that are normal conversation handling, NOT service outages.
 */
const BENIGN_NON_OUTAGE_REASONS = new Set([
  'private_turn',
  'safe_answer_rejected',
  'health_disclosure',
  'clarification',
  'greeting'
]);

/**
 * Classifies AI service state and interruptions truthfully according to
 * Sol failure schema (kind, source, http_status) and legacy reason codes.
 * Returns null if service is operating normally.
 * Strictly avoids compound guesses like "timeout OR quota".
 */
function latestAssistantHasLegacyPrefix(messages) {
  if (!Array.isArray(messages)) return false;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role === 'assistant') return hasLegacyGenericPrefix(messages[index].text);
  }
  return false;
}

export function classifyServiceInterruption(provider, messages = []) {
  if (!provider || typeof provider !== 'object') {
    // If no provider metadata but messages contain legacy prefix, derive neutral legacy status
    if (latestAssistantHasLegacyPrefix(messages)) {
      return {
        active: true,
        category: 'legacy_local',
        source: 'legacy_prefix',
        httpStatus: null,
        rawReason: null,
        message: 'Trợ lý đang hoạt động ở chế độ quy tắc nội bộ.'
      };
    }
    return null;
  }

  const { reply_source, mode, reason, failure } = provider;

  // Benign reasons (privacy/safety guards, etc.) are NOT service outages
  if (reason && BENIGN_NON_OUTAGE_REASONS.has(reason.trim())) {
    return null;
  }

  // If model succeeded normally without rules fallback or error
  if (reply_source === 'model' && mode !== 'rules' && !failure && !reason) {
    return null;
  }

  // 1. Structured failure from Sol backend: provider.failure = { kind, source, http_status }
  if (failure && typeof failure === 'object') {
    const source = failure.source;
    const kind = failure.kind;
    const hasValidHttpStatus = typeof failure.http_status === 'number' &&
      Number.isInteger(failure.http_status) &&
      failure.http_status >= 400 && failure.http_status <= 599;
    const httpStatus = hasValidHttpStatus ? failure.http_status : null;

    // Timeout: classify timeout ONLY kind === 'timeout' or source === 'turn_deadline'
    if (kind === 'timeout' || source === 'turn_deadline') {
      return {
        active: true,
        category: 'timeout',
        source: source || 'turn_deadline',
        httpStatus,
        rawReason: reason || null,
        message: 'Hệ thống phản hồi lâu hơn dự kiến. Trợ lý đang phục vụ bằng quy tắc nội bộ để không gián đoạn cuộc trò chuyện của bạn.'
      };
    }

    // Transport / Network failure that is NOT a timeout (e.g. unavailable, bad_response)
    if (source === 'transport') {
      return {
        active: true,
        category: 'transport',
        source: 'transport',
        httpStatus,
        rawReason: reason || null,
        message: 'Chưa thể sử dụng phản hồi từ AI. Ứng dụng đang hỗ trợ từ dữ liệu tại máy.'
      };
    }

    // Provider HTTP status (only valid integer 400..599)
    if (source === 'provider_http' || httpStatus !== null) {
      if (httpStatus === 429) {
        return {
          active: true,
          category: 'provider_429',
          source: 'provider_http',
          httpStatus: 429,
          rawReason: reason || null,
          message: 'Đã đạt giới hạn sử dụng từ nhà cung cấp AI. Trợ lý đang phục vụ bằng quy tắc nội bộ.'
        };
      }
      return {
        active: true,
        category: 'provider_http',
        source: 'provider_http',
        httpStatus,
        rawReason: reason || null,
        message: 'Nhà cung cấp AI gặp sự cố. Trợ lý đang phục vụ bằng quy tắc nội bộ.'
      };
    }

    // App limit: session cap
    if (source === 'session_cap') {
      return {
        active: true,
        category: 'session_cap',
        source: 'session_cap',
        httpStatus: null,
        rawReason: reason || null,
        message: 'Đã đạt giới hạn số lượt trò chuyện của phiên. Các chức năng xem quán và lịch trình vẫn hoạt động bình thường.'
      };
    }

    // App limit: daily reserve (non-zero remaining is app usage guard pausing AI)
    if (source === 'daily_reserve') {
      return {
        active: true,
        category: 'daily_reserve',
        source: 'daily_reserve',
        httpStatus: null,
        rawReason: reason || null,
        message: 'Hệ thống tạm dừng gọi AI để bảo lưu hạn ngạch sử dụng. Trợ lý đang phục vụ bằng quy tắc nội bộ.'
      };
    }

    // Local admission
    if (source === 'local_admission') {
      return {
        active: true,
        category: 'local_admission',
        source: 'local_admission',
        httpStatus: null,
        rawReason: reason || null,
        message: 'Yêu cầu được xử lý trực tiếp tại máy theo quy tắc nội bộ.'
      };
    }

    // Generic structured quota failure
    if (kind === 'quota') {
      return {
        active: true,
        category: 'quota_fallback',
        source: source || 'quota',
        httpStatus,
        rawReason: reason || null,
        message: 'Đã đạt giới hạn xử lý yêu cầu. Trợ lý đang phục vụ bằng quy tắc nội bộ.'
      };
    }
  }

  // 2. Legacy reason fallbacks (when provider.failure is absent)
  if (typeof reason === 'string' && reason.trim()) {
    const r = reason.trim().toLowerCase();

    // A legacy reason string alone does not retain an upstream HTTP status.
    if (r.includes('429')) {
      return {
        active: true,
        category: 'legacy_limit',
        source: 'legacy_reason',
        httpStatus: null,
        rawReason: reason,
        message: 'Lượt AI trước chưa hoàn tất. Ứng dụng đang hỗ trợ từ dữ liệu tại máy.'
      };
    }

    // Timeout: only for timeout_rules_fallback or explicit timeout
    if (r === 'timeout' || r === 'timeout_rules_fallback') {
      return {
        active: true,
        category: 'timeout',
        source: 'legacy_timeout',
        httpStatus: null,
        rawReason: reason,
        message: 'Hệ thống phản hồi lâu hơn dự kiến. Trợ lý đang phục vụ bằng quy tắc nội bộ để không gián đoạn cuộc trò chuyện của bạn.'
      };
    }

    // Per-turn limit (turn_call_cap is per-turn limit, NOT session cap)
    if (r === 'turn_call_cap') {
      return {
        active: true,
        category: 'turn_call_cap',
        source: 'turn_call_cap',
        httpStatus: null,
        rawReason: reason,
        message: 'Lượt xử lý đạt giới hạn số thao tác trong một tin nhắn. Các thay đổi đã kiểm chứng vẫn được giữ.'
      };
    }

    // Local session cap / turn budget
    if (r === 'session_cap' || r === 'turn_budget_exceeded') {
      return {
        active: true,
        category: 'session_cap',
        source: 'session_cap',
        httpStatus: null,
        rawReason: reason,
        message: 'Đã đạt giới hạn số lượt trò chuyện của phiên. Các chức năng xem quán và lịch trình vẫn hoạt động bình thường.'
      };
    }

    // Daily reserve
    if (r === 'daily_reserve_cap' || r.includes('daily_reserve')) {
      return {
        active: true,
        category: 'daily_reserve',
        source: 'daily_reserve',
        httpStatus: null,
        rawReason: reason,
        message: 'Hệ thống tạm dừng gọi AI để bảo lưu hạn ngạch sử dụng. Trợ lý đang phục vụ bằng quy tắc nội bộ.'
      };
    }

    // Generic quota with unknown origin
    if (r.includes('quota')) {
      return {
        active: true,
        category: 'quota_fallback',
        source: 'legacy_quota',
        httpStatus: null,
        rawReason: reason,
        message: 'Đã đạt giới hạn xử lý yêu cầu. Trợ lý đang phục vụ bằng quy tắc nội bộ.'
      };
    }

    // Tool error
    if (r.includes('tool_error')) {
      return {
        active: true,
        category: 'tool_error',
        source: 'tool_error',
        httpStatus: null,
        rawReason: reason,
        message: 'Công cụ nội bộ gặp lỗi khi xử lý. Trợ lý đã giữ nguyên dữ liệu đã xác thực.'
      };
    }
  }

  // Check if messages have legacy prefix when metadata is absent (reloading old prepatch sessions)
  if (latestAssistantHasLegacyPrefix(messages)) {
    return {
      active: true,
      category: 'legacy_local',
      source: 'legacy_prefix',
      httpStatus: null,
      rawReason: null,
      message: 'Trợ lý đang hoạt động ở chế độ quy tắc nội bộ.'
    };
  }

  // If rules fallback happened without specific failure or reason
  if (reply_source === 'rules' && mode === 'rules' && reason) {
    return {
      active: true,
      category: 'generic',
      source: 'rules',
      httpStatus: null,
      rawReason: reason,
      message: 'Trợ lý đang hoạt động ở chế độ quy tắc nội bộ.'
    };
  }

  return null;
}

/**
 * GET /v1/sessions/{id}/venues/{venue_id}/menu
 * Fetches paginated canonical menu for one visible venue.
 */
export async function fetchVenueMenu(sessionId, venueId, options = {}, sessionToken = null) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new DiscoveryApiError('invalid_argument', 'Session ID không được để trống.');
  }
  if (!venueId || typeof venueId !== 'string') {
    throw new DiscoveryApiError('invalid_argument', 'Venue ID không được để trống.');
  }

  const offset = Number.isInteger(options.offset) && options.offset >= 0 ? options.offset : 0;
  const limit = Number.isInteger(options.limit) && options.limit >= 1 && options.limit <= 50 ? options.limit : 25;
  const q = typeof options.q === 'string' ? options.q.trim() : '';
  const group = options.group ? String(options.group).trim() : null;
  const dishId = options.dishId ? String(options.dishId).trim() : null;
  const optionOffset = Number.isInteger(options.optionOffset) && options.optionOffset >= 0 ? options.optionOffset : 0;
  const optionLimit = Number.isInteger(options.optionLimit) && options.optionLimit >= 1 && options.optionLimit <= 500 ? options.optionLimit : 100;

  const params = new URLSearchParams();
  params.set('offset', String(offset));
  params.set('limit', String(limit));
  if (q) params.set('q', q);
  if (group) params.set('group', group);
  if (dishId) params.set('dish_id', dishId);
  params.set('option_offset', String(optionOffset));
  params.set('option_limit', String(optionLimit));

  const url = `${getApiBaseUrl()}/v1/sessions/${encodeURIComponent(sessionId)}/venues/${encodeURIComponent(venueId)}/menu?${params.toString()}`;
  const headers = { 'Accept': 'application/json' };
  if (sessionToken) {
    headers['X-Session-Token'] = sessionToken;
  }

  const res = await fetchWithTimeout(url, { method: 'GET', headers }, options.timeoutMs || 25000);
  let body = null;
  try {
    body = await res.json();
  } catch (jsonErr) {
    throw new DiscoveryApiError('bad_response', `Phản hồi thực đơn không hợp lệ (mã ${res.status}).`, null, res.status);
  }

  if (!res.ok) {
    const code = body?.code || `http_${res.status}`;
    const msg = body?.message || `Lỗi tải thực đơn quán (mã ${res.status}).`;
    throw new DiscoveryApiError(code, msg, body, res.status);
  }
  return body;
}

/**
 * Merges newly fetched option groups into a dish, preserving uniqueness of option IDs.
 * Recomputes options_returned and options_complete deterministically.
 */
export function mergeDishOptions(existingDish, incomingDish) {
  if (!existingDish || !incomingDish) return existingDish;

  const mergedGroups = (existingDish.option_groups || []).map((g) => ({
    ...g,
    options: [...(g.options || [])]
  }));

  (incomingDish.option_groups || []).forEach((incG) => {
    const existingG = mergedGroups.find((g) => g.id === incG.id);
    if (existingG) {
      const exIds = new Set(existingG.options.map((o) => o.id));
      const added = (incG.options || []).filter((o) => !exIds.has(o.id));
      existingG.options = [...existingG.options, ...added];
    } else {
      mergedGroups.push({
        ...incG,
        options: [...(incG.options || [])]
      });
    }
  });

  const totalCumulative = mergedGroups.reduce(
    (acc, g) => acc + (Array.isArray(g.options) ? g.options.length : 0),
    0
  );

  const targetTotal = incomingDish.options_total ?? existingDish.options_total ?? totalCumulative;

  return {
    ...existingDish,
    option_groups: mergedGroups,
    options_returned: totalCumulative,
    options_complete: totalCumulative >= targetTotal
  };
}

/**
 * Applies merged options to a dish inside menuData items immutably.
 */
export function applyDishOptionsToMenu(menuData, incomingDish, dishId) {
  if (!menuData || !Array.isArray(menuData.items) || !incomingDish) return menuData;
  const targetIdStr = String(dishId ?? incomingDish.id);
  const updatedItems = menuData.items.map((item) => {
    if (String(item.id) !== targetIdStr) return item;
    return mergeDishOptions(item, incomingDish);
  });
  return {
    ...menuData,
    items: updatedItems
  };
}
