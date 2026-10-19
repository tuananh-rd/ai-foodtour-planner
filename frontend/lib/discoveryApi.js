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

  if (action.type === 'tool') {
    if (!action.name || !ALLOWED_TOOL_NAMES.includes(action.name)) {
      throw new DiscoveryApiError('invalid_action', `Tên công cụ '${action.name}' không nằm trong danh mục cho phép của hợp đồng discovery-v1.`);
    }
    if (!action.arguments || typeof action.arguments !== 'object') {
      action.arguments = {};
    }
    return action;
  }

  throw new DiscoveryApiError('invalid_action', `Loại hành động '${action.type}' không được hỗ trợ (chỉ chấp nhận 'tool' hoặc 'confirm').`);
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
    if (jsonErr instanceof DiscoveryApiError) {
      throw jsonErr;
    }
    body = null;
  }

  if (!res.ok) {
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

  return body;
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
    if (jsonErr instanceof DiscoveryApiError) {
      throw jsonErr;
    }
    body = null;
  }

  if (!res.ok) {
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

  return body;
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
    if (jsonErr instanceof DiscoveryApiError) {
      throw jsonErr;
    }
    body = null;
  }

  if (!res.ok) {
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

  return body;
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
