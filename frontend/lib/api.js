/**
 * API client module for AI FoodTour Planner.
 * Adheres strictly to contracts/v1/CONTRACT.md.
 * 
 * Supports both live backend communication and deterministic MOCK mode
 * (NEXT_PUBLIC_API_MODE=mock). In mock mode, every response includes is_mock: true
 * and synthetic fixture data.
 */

// Synthetic venues matching contracts/fixtures/venues.synthetic.json
export const SYNTHETIC_VENUES = [
  {
    id: "SYN-001",
    name: "[SYNTHETIC] Quán thử 1 - Bún chả Phố Cổ",
    lat: 21.0285,
    lon: 105.8500,
    city: "Hà Nội",
    district: "Hoàn Kiếm",
    address: "Địa chỉ giả lập 1, Hoàn Kiếm",
    source_url: "https://example.invalid/synthetic/1",
    dish_tags: ["bún", "chả"],
    online_only: false,
    geo_ok: true,
    price_min_vnd: 20000,
    price_max_vnd: 45000,
    price_evidence: "estimate",
    hours: null,
    hours_display: null,
    rating: { value: 4.5, count: 128, source_scale_max: 5 },
    source_fetched_at: "2026-10-15T08:00:00Z",
    synthetic: true
  },
  {
    id: "SYN-002",
    name: "[SYNTHETIC] Quán thử 2 - Phở Gia Truyền",
    lat: 21.0307,
    lon: 105.8503,
    city: "Hà Nội",
    district: "Hoàn Kiếm",
    address: "Địa chỉ giả lập 2, Hoàn Kiếm",
    source_url: "https://example.invalid/synthetic/2",
    dish_tags: ["phở"],
    online_only: false,
    geo_ok: true,
    price_min_vnd: 25000,
    price_max_vnd: 55000,
    price_evidence: "estimate",
    hours: null,
    hours_display: null,
    rating: { value: 4.8, count: 420, source_scale_max: 5 },
    source_fetched_at: "2026-10-15T08:00:00Z",
    synthetic: true
  },
  {
    id: "SYN-003",
    name: "[SYNTHETIC] Quán thử 3 - Bánh mì Phố Huế",
    lat: 21.0329,
    lon: 105.8506,
    city: "Hà Nội",
    district: "Hoàn Kiếm",
    address: "Địa chỉ giả lập 3, Hoàn Kiếm",
    source_url: "https://example.invalid/synthetic/3",
    dish_tags: ["bánh mì"],
    online_only: false,
    geo_ok: true,
    price_min_vnd: 30000,
    price_max_vnd: 65000,
    price_evidence: "estimate",
    hours: null,
    hours_display: null,
    rating: { value: 4.1, count: 3, source_scale_max: 5 },
    source_fetched_at: "2026-10-15T08:00:00Z",
    synthetic: true
  },
  {
    id: "SYN-004",
    name: "[SYNTHETIC] Quán thử 4 - Bún ốc nguội",
    lat: 21.0351,
    lon: 105.8509,
    city: "Hà Nội",
    district: "Hoàn Kiếm",
    address: "Địa chỉ giả lập 4, Hoàn Kiếm",
    source_url: "https://example.invalid/synthetic/4",
    dish_tags: ["bún", "ốc"],
    online_only: false,
    geo_ok: true,
    price_min_vnd: 35000,
    price_max_vnd: 75000,
    price_evidence: "estimate",
    hours: null,
    hours_display: null,
    rating: { value: 4.2, count: 54, source_scale_max: 5 },
    source_fetched_at: "2026-10-15T08:00:00Z",
    synthetic: true
  },
  {
    id: "SYN-005",
    name: "[SYNTHETIC] Quán thử 5 - Chè Bốn Mùa",
    lat: 21.0301,
    lon: 105.8532,
    city: "Hà Nội",
    district: "Hoàn Kiếm",
    address: "Địa chỉ giả lập 5, Hoàn Kiếm",
    source_url: "https://example.invalid/synthetic/5",
    dish_tags: ["chè"],
    online_only: false,
    geo_ok: true,
    price_min_vnd: 20000,
    price_max_vnd: 40000,
    price_evidence: "estimate",
    hours: null,
    hours_display: null,
    rating: { value: 4.6, count: 85, source_scale_max: 5 },
    source_fetched_at: "2026-10-15T08:00:00Z",
    synthetic: true
  },
  {
    id: "SYN-006",
    name: "[SYNTHETIC] Quán thử 6 - Nem rán & Bún chả",
    lat: 21.0323,
    lon: 105.8535,
    city: "Hà Nội",
    district: "Hoàn Kiếm",
    address: "Địa chỉ giả lập 6, Hoàn Kiếm",
    source_url: "https://example.invalid/synthetic/6",
    dish_tags: ["nem", "bún"],
    online_only: false,
    geo_ok: true,
    price_min_vnd: 25000,
    price_max_vnd: 45000,
    price_evidence: "estimate",
    hours: null,
    hours_display: null,
    synthetic: true
  },
  {
    id: "SYN-007",
    name: "[SYNTHETIC] Quán thử 7 - Xôi xéo lá chuối",
    lat: 21.0345,
    lon: 105.8538,
    city: "Hà Nội",
    district: "Hoàn Kiếm",
    address: "Địa chỉ giả lập 7, Hoàn Kiếm",
    source_url: "https://example.invalid/synthetic/7",
    dish_tags: ["xôi"],
    online_only: false,
    geo_ok: true,
    price_min_vnd: 30000,
    price_max_vnd: 55000,
    price_evidence: "estimate",
    hours: { "0": [[360, 600]] },
    hours_display: "06:00-10:00 (giả lập)",
    synthetic: true
  },
  {
    id: "SYN-008",
    name: "[SYNTHETIC] Quán thử 8 - Cà phê Trứng",
    lat: 21.0367,
    lon: 105.8541,
    city: "Hà Nội",
    district: "Hoàn Kiếm",
    address: "Địa chỉ giả lập 8, Hoàn Kiếm",
    source_url: "https://example.invalid/synthetic/8",
    dish_tags: ["cà phê"],
    online_only: false,
    geo_ok: true,
    price_min_vnd: 35000,
    price_max_vnd: 65000,
    price_evidence: "estimate",
    hours: { "0": [[420, 1380]] },
    hours_display: "07:00-23:00 (giả lập)",
    synthetic: true
  }
];

export class ApiError extends Error {
  constructor(code, message, details = null, status = 400) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

/**
 * Determine if current mode is mock mode.
 * Default to mock mode if NEXT_PUBLIC_API_MODE is 'mock' or unset.
 */
let runtimeMockOverride = null;

export function isMockMode() {
  if (runtimeMockOverride !== null) return runtimeMockOverride;
  const envMode = process.env.NEXT_PUBLIC_API_MODE;
  // Default to real mode (NEXT_PUBLIC_API_MODE unset or 'real').
  // Mock mode is ONLY used when explicitly set to 'mock'.
  return envMode === 'mock';
}

export function setRuntimeMockMode(enable) {
  runtimeMockOverride = enable;
}

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:18000';
}

// In-memory mock session store for realistic client testing
const mockSessions = new Map();

function getOrCreateMockSession(sessionId = null) {
  const sid = sessionId || `mock-session-${Date.now()}`;
  if (!mockSessions.has(sid)) {
    mockSessions.set(sid, {
      session_id: sid,
      token: `mock-token-${Math.random().toString(36).substring(2, 10)}`,
      revision: 0,
      preferences: {
        city: "Hà Nội",
        origin: null, // Required to plan
        origin_label: null,
        origin_source: null,
        start_time: "08:30",
        weekday: 0,
        duration_min: null, // Required to plan
        budget_vnd: null,
        budget_scope: null,
        party_size: null,
        interests: [],
        exclusions: [],
        max_stops: 3,
        mode: "explore"
      },
      tour: null,
      notes: []
    });
  }
  return mockSessions.get(sid);
}

/**
 * Helper to build a contract-shaped Tour object
 */
function createMockTour(prefs, revision = 1, lockedIds = [], candidateStops = null) {
  // If strict mode and missing evidence:
  if (prefs.mode === "strict") {
    return {
      revision,
      status: "insufficient_evidence",
      stops: [],
      reasons: [
        "Chế độ nghiêm ngặt cần giờ mở cửa, giá theo người và tuyến đường đã xác minh; chưa có đủ bằng chứng."
      ],
      proposed_changes: [
        "Chuyển sang chế độ khám phá có điều kiện (explore) để xem gợi ý thử nghiệm."
      ],
      unknowns: ["hours", "price_per_person", "route"],
      totals: {
        venue_range_upper_sum_vnd: 0,
        walk_minutes: null,
        leg_source: "straight_line_estimate"
      },
      explanation: "Chưa đủ bằng chứng để lập lịch trình đáng tin cậy. Lý do: Chưa có ma trận đường bộ và giờ mở cửa đã xác minh từng ngày.",
      locks: lockedIds,
      assumptions: { search_pool: 8, eligible_total: 8, pool_truncated: false },
      is_mock: true
    };
  }

  // Check impossible requests
  if (prefs.budget_vnd !== null && prefs.budget_vnd < 30000) {
    return {
      revision,
      status: "no_solution",
      stops: [],
      reasons: [
        `Ngân sách ${prefs.budget_vnd?.toLocaleString('vi-VN')} ₫ quá thấp (mức tối thiểu tham khảo từ 20.000 ₫/quán).`
      ],
      proposed_changes: [
        "Tăng ngân sách lên tối thiểu 100.000 ₫."
      ],
      unknowns: [],
      totals: {
        venue_range_upper_sum_vnd: 0,
        walk_minutes: null,
        leg_source: "straight_line_estimate"
      },
      explanation: "Không tìm được lịch trình thoả các ràng buộc. Lý do: Ngân sách thấp hơn mức giá của các quán trong khu vực.",
      locks: lockedIds,
      assumptions: { search_pool: 8, eligible_total: 8, pool_truncated: false },
      is_mock: true
    };
  }

  if (prefs.duration_min !== null && prefs.duration_min < 45) {
    return {
      revision,
      status: "no_solution",
      stops: [],
      reasons: [
        `Thời lượng ${prefs.duration_min} phút ngắn hơn thời gian cần thiết cho một tour (tối thiểu 45–60 phút).`
      ],
      proposed_changes: [
        "Tăng thời lượng lên ít nhất 90 phút."
      ],
      unknowns: [],
      totals: {
        venue_range_upper_sum_vnd: 0,
        walk_minutes: null,
        leg_source: "straight_line_estimate"
      },
      explanation: "Không tìm được lịch trình thoả các ràng buộc. Lý do: Thời lượng quá ngắn.",
      locks: lockedIds,
      assumptions: { search_pool: 8, eligible_total: 8, pool_truncated: false },
      is_mock: true
    };
  }

  // Selected venues
  let venues = candidateStops;
  if (!venues || venues.length === 0) {
    // Pick 3 default venues from synthetic list
    venues = [SYNTHETIC_VENUES[0], SYNTHETIC_VENUES[1], SYNTHETIC_VENUES[4]];
  }

  let cumulativeMinutes = 0;
  const stops = venues.map((v, idx) => {
    const legMinutes = idx === 0 ? 5 : 7;
    const legKm = idx === 0 ? 0.35 : 0.52;
    cumulativeMinutes += legMinutes;
    
    // Arrival and departure times
    const startHour = 8;
    const startMin = 30 + cumulativeMinutes;
    const arriveH = String(startHour + Math.floor(startMin / 60)).padStart(2, '0');
    const arriveM = String(startMin % 60).padStart(2, '0');
    
    cumulativeMinutes += 30; // visit duration assumption
    const departH = String(startHour + Math.floor(cumulativeMinutes / 60)).padStart(2, '0');
    const departM = String(startMin % 60).padStart(2, '0');

    return {
      venue_id: v.id,
      name: v.name,
      address: v.address,
      district: v.district,
      lat: v.lat,
      lon: v.lon,
      source_url: v.source_url,
      order: idx + 1,
      arrive: `${arriveH}:${arriveM}`,
      depart: `${departH}:${departM}`,
      leg_from_previous: {
        minutes: legMinutes,
        km: legKm,
        source: "straight_line_estimate" // straight line by default per PRD/CONTRACT
      },
      price: {
        min_vnd: v.price_min_vnd,
        max_vnd: v.price_max_vnd,
        semantics: "venue_range",
        evidence: v.price_evidence || "estimate"
      },
      hours: {
        status: v.hours ? "estimate" : "unknown",
        display: v.hours_display || null,
        open_at_arrival: null // null means unknown, never true without verification
      },
      why: [
        { code: idx === 0 ? "near_origin" : "match_interest", text: idx === 0 ? "Gần điểm xuất phát (~4 phút đi bộ)" : "Khớp món ăn và khẩu vị ưa thích" },
        { code: "well_rated", text: "Được đánh giá tốt theo nguồn thu thập" }
      ],
      venue: {
        id: v.id,
        name: v.name,
        rating: v.rating || { value: 4.5, count: 80, source_scale_max: 5 },
        suitable_meals: ["breakfast", "lunch", "dinner"],
        audiences: ["solo", "friends", "family"],
        cuisine_styles: v.dish_tags || [],
        source_fetched_at: v.source_fetched_at || "2026-10-15T08:00:00Z"
      }
    };
  });

  const upperSum = stops.reduce((acc, s) => acc + (s.price.max_vnd || 0), 0);
  const walkMinutes = stops.reduce((acc, s) => acc + (s.leg_from_previous.minutes || 0), 0);

  return {
    revision,
    status: "conditional",
    stops,
    reasons: [
      "Chưa xác minh: giờ mở cửa theo ngày",
      "Chưa xác minh: tuyến đi bộ thực tế (đang dùng đường chim bay ước tính)"
    ],
    proposed_changes: [],
    unknowns: ["hours", "route"],
    totals: {
      venue_range_upper_sum_vnd: upperSum,
      walk_minutes: walkMinutes,
      leg_source: "straight_line_estimate",
      route_provider: null
    },
    route_warnings: [],
    explanation: `Gợi ý có điều kiện: một số thông tin chưa được xác minh. Các điểm dừng: ${stops.map(s => s.name).join(" → ")}. Tổng đi bộ khoảng ${walkMinutes} phút (ước tính đường chim bay). Tổng khoảng giá tối đa của quán: ${upperSum.toLocaleString('vi-VN')} ₫ (không phải hoá đơn mỗi người). Chưa biết: giờ mở cửa theo ngày, tuyến đi bộ thực tế.`,
    locks: lockedIds,
    assumptions: {
      search_pool: venues.length,
      eligible_total: venues.length,
      pool_truncated: false
    },
    is_mock: true
  };
}

/**
 * Safe fetch helper with structured ApiError handling
 */
async function safeFetch(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw err;
    }
    throw new ApiError(
      "provider_unavailable",
      `Không thể kết nối đến máy chủ backend (${getApiBaseUrl()}). Vui lòng kiểm tra dịch vụ.`,
      { originalError: err.message },
      503
    );
  }

  if (!res.ok) {
    let errorBody = null;
    try {
      errorBody = await res.json();
    } catch (_) {}
    const code = errorBody?.error?.code || (
      res.status === 409 ? "revision_conflict" :
      res.status === 410 ? "session_expired" :
      (res.status === 401 || res.status === 403) ? "unauthorized_session" :
      res.status === 429 ? "rate_limited" :
      res.status === 503 ? "provider_unavailable" :
      res.status === 422 ? "validation_error" : "request_failed"
    );
    const msg = errorBody?.error?.message || `Yêu cầu thất bại (HTTP ${res.status})`;
    const details = errorBody?.error?.details || null;
    throw new ApiError(code, msg, details, res.status);
  }
  return res.json();
}

/**
 * 1. Health check endpoint
 * GET /health
 */
export async function getHealth() {
  if (isMockMode()) {
    return {
      status: "ok",
      dataset_loaded: true,
      llm: "mock",
      routing: "straight_line_estimate",
      dataset_source: "synthetic",
      dataset_version: "v1.0-mock",
      llm_budget: {
        limit: 18,
        used: 4,
        remaining: 14,
        exhausted: false,
        resets_at: new Date(Date.now() + 36000000).toISOString(),
        window: "pacific_midnight"
      },
      is_mock: true
    };
  }

  return safeFetch(`${getApiBaseUrl()}/health`, {
    headers: { 'Accept': 'application/json' }
  });
}

/**
 * 2. Search / List venues
 * GET /v1/venues
 */
export async function getVenues({ limit = 50, offset = 0, q = "", city = "Hà Nội" } = {}, options = {}) {
  if (isMockMode()) {
    let list = SYNTHETIC_VENUES;
    if (q) {
      const qLower = q.toLowerCase();
      list = list.filter(v => 
        v.name.toLowerCase().includes(qLower) || 
        v.dish_tags.some(tag => tag.toLowerCase().includes(qLower))
      );
    }
    const paginated = list.slice(offset, offset + limit);
    return {
      items: paginated,
      venues: paginated,
      total: list.length,
      limit,
      offset,
      dataset_source: "synthetic",
      dataset_version: "v1.0-mock",
      is_mock: true
    };
  }

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q) params.set("q", q);
  if (city) params.set("city", city);
  const data = await safeFetch(`${getApiBaseUrl()}/v1/venues?${params.toString()}`, {
    headers: { 'Accept': 'application/json' },
    signal: options?.signal
  });
  const items = data.items || [];
  return {
    items,
    venues: items,
    total: data.total !== undefined ? data.total : items.length,
    limit: data.limit !== undefined ? data.limit : limit,
    offset: data.offset !== undefined ? data.offset : offset,
    dataset_source: data.dataset_source,
    dataset_version: data.dataset_version,
    is_mock: false
  };
}

/**
 * 3. Venue detail
 * GET /v1/venues/{id}
 */
export async function getVenueById(id, options = {}) {
  if (isMockMode()) {
    const found = SYNTHETIC_VENUES.find(v => v.id === id);
    if (!found) {
      throw new ApiError("not_found", `Không tìm thấy quán với mã ${id}`, null, 404);
    }
    return { ...found, is_mock: true };
  }

  return safeFetch(`${getApiBaseUrl()}/v1/venues/${id}`, {
    headers: { 'Accept': 'application/json' },
    signal: options?.signal
  });
}

/**
 * 4. Create session
 * POST /v1/sessions
 */
export async function createSession(options = {}) {
  if (isMockMode()) {
    const session = getOrCreateMockSession();
    return {
      session_id: session.session_id,
      token: session.token,
      revision: session.revision,
      is_mock: true
    };
  }

  return safeFetch(`${getApiBaseUrl()}/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    signal: options?.signal
  });
}

/**
 * 5. Send chat message (Extract + Merge preferences)
 * POST /v1/sessions/{id}/messages
 * Returns { preferences, missing_slots, questions, notes, tour|null, revision, dataset_source, dataset_version }
 */
export async function sendMessage(sessionId, text, token = "", options = {}) {
  if (typeof window !== 'undefined' && window.__MOCK_NEXT_MESSAGE_ERROR) {
    const errData = window.__MOCK_NEXT_MESSAGE_ERROR;
    window.__MOCK_NEXT_MESSAGE_ERROR = null;
    throw new ApiError(errData.code || 'error', errData.message || 'Synthetic message error', errData.details || null, errData.status || 500);
  }
  if (typeof window !== 'undefined' && window.__MOCK_NEXT_MESSAGE_RES) {
    const msgRes = window.__MOCK_NEXT_MESSAGE_RES;
    window.__MOCK_NEXT_MESSAGE_RES = null;
    if (isMockMode()) {
      const session = getOrCreateMockSession(sessionId);
      if (msgRes.revision !== undefined) session.revision = msgRes.revision;
      if (msgRes.tour !== undefined) session.tour = msgRes.tour;
    }
    return msgRes;
  }

  if (isMockMode()) {
    const session = getOrCreateMockSession(sessionId);
    session.revision += 1;
    const lower = text.toLowerCase();

    // Parse origin
    if (lower.includes("hồ gươm") || lower.includes("hoàn kiếm")) {
      session.preferences.origin = { lat: 21.0285, lon: 105.8522 };
    } else if (lower.includes("phố cổ")) {
      session.preferences.origin = { lat: 21.0340, lon: 105.8510 };
    } else if (lower.includes("nhà thờ")) {
      session.preferences.origin = { lat: 21.0287, lon: 105.8490 };
    }

    // Parse duration
    const durMatch = lower.match(/(\d+)\s*(giờ|tiếng)/);
    const minMatch = lower.match(/(\d+)\s*phút/);
    if (durMatch) {
      session.preferences.duration_min = parseInt(durMatch[1], 10) * 60;
    } else if (minMatch) {
      session.preferences.duration_min = parseInt(minMatch[1], 10);
    }

    // Parse budget
    const budgetMatch = lower.match(/(\d+)\s*(k|nghìn|ngàn|triệu)/);
    if (budgetMatch) {
      const num = parseInt(budgetMatch[1], 10);
      session.preferences.budget_vnd = budgetMatch[2] === "triệu" ? num * 1000000 : num * 1000;
      if (lower.includes("mỗi người") || lower.includes("/người") || lower.includes("người")) {
        session.preferences.budget_scope = "per_person";
      } else if (lower.includes("cả nhóm") || lower.includes("tổng")) {
        session.preferences.budget_scope = "group";
      }
    }

    // Update interests if mentioned
    const extractedInterests = [];
    if (lower.includes("phở")) extractedInterests.push("phở");
    if (lower.includes("bún")) extractedInterests.push("bún");
    if (lower.includes("chè")) extractedInterests.push("chè");
    if (lower.includes("bánh mì")) extractedInterests.push("bánh mì");
    if (lower.includes("cà phê")) extractedInterests.push("cà phê");
    if (lower.includes("nem")) extractedInterests.push("nem");
    if (lower.includes("xôi")) extractedInterests.push("xôi");
    if (extractedInterests.length > 0) {
      session.preferences.interests = extractedInterests;
    }

    if (lower.includes("nghiêm ngặt") || lower.includes("strict")) {
      session.preferences.mode = "strict";
    } else if (lower.includes("khám phá") || lower.includes("explore")) {
      session.preferences.mode = "explore";
    }

    // Check if user specifically requested impossible scenarios
    if (lower.includes("1000 đồng") || lower.includes("1k") || lower.includes("ngân sách 10k")) {
      session.preferences.budget_vnd = 10000;
      session.preferences.origin = session.preferences.origin || { lat: 21.033, lon: 105.850 };
      session.preferences.duration_min = session.preferences.duration_min || 120;
      session.tour = createMockTour(session.preferences, session.revision, []);
      return {
        preferences: session.preferences,
        missing_slots: [],
        questions: [],
        notes: session.notes || [],
        tour: session.tour,
        revision: session.revision,
        dataset_source: "synthetic",
        dataset_version: "v1.0-mock",
        is_mock: true
      };
    }

    if (lower.includes("15 phút") || lower.includes("10 phút")) {
      session.preferences.duration_min = 15;
      session.preferences.origin = session.preferences.origin || { lat: 21.033, lon: 105.850 };
      session.tour = createMockTour(session.preferences, session.revision, []);
      return {
        preferences: session.preferences,
        missing_slots: [],
        questions: [],
        notes: session.notes || [],
        tour: session.tour,
        revision: session.revision,
        dataset_source: "synthetic",
        dataset_version: "v1.0-mock",
        is_mock: true
      };
    }

    // Missing slots detection per CONTRACT.md (origin, duration_min, budget_scope if budget set)
    const missing = [];
    const questions = [];
    if (session.preferences.origin === null) {
      missing.push("origin");
      questions.push("Bạn muốn bắt đầu xuất phát từ điểm nào quanh Phố Cổ Hà Nội (ví dụ: Hồ Gươm, Phố Cổ, Nhà Thờ Lớn)?");
    }
    if (session.preferences.duration_min === null) {
      missing.push("duration_min");
      questions.push("Bạn có khoảng bao nhiêu thời gian cho chuyến đi (ví dụ: 60 phút, 90 phút hay 180 phút)?");
    }
    if (session.preferences.budget_vnd !== null && session.preferences.budget_scope === null) {
      missing.push("budget_scope");
      questions.push("Ngân sách này là cho mỗi người hay cả nhóm?");
    }

    if (missing.length > 0) {
      session.tour = null;
      return {
        preferences: session.preferences,
        missing_slots: missing,
        questions: questions,
        notes: session.notes || [],
        tour: null,
        revision: session.revision,
        dataset_source: "synthetic",
        dataset_version: "v1.0-mock",
        is_mock: true
      };
    }

    // Complete preferences -> Generate tour
    session.tour = createMockTour(session.preferences, session.revision, []);
    return {
      preferences: session.preferences,
      missing_slots: [],
      questions: [],
      notes: session.notes || [],
      tour: session.tour,
      revision: session.revision,
      dataset_source: "synthetic",
      dataset_version: "v1.0-mock",
      extraction_source: "rules",
      llm_calls: 0,
      llm_budget: { limit: 18, remaining: 14, exhausted: false },
      is_mock: true
    };
  }

  return safeFetch(`${getApiBaseUrl()}/v1/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Session-Token': token
    },
    body: JSON.stringify({ text }),
    signal: options?.signal
  });
}

/**
 * 6. Update structured preferences
 * PUT /v1/sessions/{id}/preferences
 * Body: { base_revision, preferences }
 */
export async function updatePreferences(sessionId, baseRevision, preferences, token = "", options = {}) {
  if (isMockMode()) {
    const session = getOrCreateMockSession(sessionId);
    if (baseRevision !== undefined && baseRevision !== null && baseRevision !== session.revision) {
      throw new ApiError(
        "revision_conflict",
        `Xung đột phiên bản: Dữ liệu hiện tại trên máy chủ là bản #${session.revision}, nhưng bạn gửi yêu cầu từ bản #${baseRevision}. Vui lòng tải lại để đồng bộ.`,
        { server_revision: session.revision, base_revision: baseRevision },
        409
      );
    }
    session.preferences = { ...session.preferences, ...preferences };
    session.revision += 1;
    // Server contract: updating preferences invalidates prior tour so tour=null and revisions do not drift
    session.tour = null;

    // Recalculate missing slots
    const missing = [];
    const questions = [];
    if (session.preferences.origin === null) {
      missing.push("origin");
      questions.push("Bạn muốn bắt đầu xuất phát từ điểm nào quanh Phố Cổ Hà Nội (ví dụ: Hồ Gươm, Phố Cổ, Nhà Thờ Lớn)?");
    }
    if (session.preferences.duration_min === null) {
      missing.push("duration_min");
      questions.push("Bạn có khoảng bao nhiêu thời gian cho chuyến đi (ví dụ: 60 phút, 90 phút hay 180 phút)?");
    }
    if (session.preferences.budget_vnd !== null && session.preferences.budget_scope === null) {
      missing.push("budget_scope");
      questions.push("Ngân sách này là cho mỗi người hay cả nhóm?");
    }

    return {
      preferences: session.preferences,
      missing_slots: missing,
      questions: questions,
      notes: session.notes || [],
      tour: session.tour,
      revision: session.revision,
      dataset_source: "synthetic",
      dataset_version: "v1.0-mock",
      is_mock: true
    };
  }

  // Sanitize preferences so we never send extra fields that fail pydantic model extra=forbid
  const sanitized = {
    city: preferences.city || "Hà Nội",
    origin: preferences.origin ? { lat: Number(preferences.origin.lat), lon: Number(preferences.origin.lon) } : null,
    origin_label: preferences.origin_label != null ? String(preferences.origin_label).slice(0, 120) : null,
    origin_source: preferences.origin_source || null,
    start_time: preferences.start_time || null,
    weekday: preferences.weekday != null ? Number(preferences.weekday) : null,
    duration_min: preferences.duration_min != null ? Number(preferences.duration_min) : null,
    budget_vnd: preferences.budget_vnd != null ? Number(preferences.budget_vnd) : null,
    budget_scope: preferences.budget_scope || null,
    party_size: preferences.party_size != null ? Number(preferences.party_size) : null,
    interests: Array.isArray(preferences.interests) ? preferences.interests : [],
    exclusions: Array.isArray(preferences.exclusions) ? preferences.exclusions : [],
    max_stops: preferences.max_stops != null ? Number(preferences.max_stops) : 3,
    mode: preferences.mode || "explore"
  };

  try {
    return await safeFetch(`${getApiBaseUrl()}/v1/sessions/${sessionId}/preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Session-Token': token
      },
      body: JSON.stringify({ base_revision: baseRevision, preferences: sanitized }),
      signal: options?.signal
    });
  } catch (err) {
    if (err.status === 422 && (sanitized.origin_label !== undefined || sanitized.origin_source !== undefined)) {
      const fallback = { ...sanitized };
      delete fallback.origin_label;
      delete fallback.origin_source;
      return safeFetch(`${getApiBaseUrl()}/v1/sessions/${sessionId}/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Session-Token': token
        },
        body: JSON.stringify({ base_revision: baseRevision, preferences: fallback }),
        signal: options?.signal
      });
    }
    throw err;
  }
}

/**
 * 7. Plan tour with current preferences
 * POST /v1/sessions/{id}/tour
 * Body: { base_revision }
 */
export async function planTour(sessionId, baseRevision, token = "", options = {}) {
  if (typeof window !== 'undefined' && window.__MOCK_NEXT_ERROR) {
    const errData = window.__MOCK_NEXT_ERROR;
    window.__MOCK_NEXT_ERROR = null;
    throw new ApiError(errData.code || 'error', errData.message || 'Synthetic error', errData.details || null, errData.status || 500);
  }
  if (typeof window !== 'undefined' && window.__MOCK_NEXT_TOUR) {
    const tourRes = window.__MOCK_NEXT_TOUR;
    window.__MOCK_NEXT_TOUR = null;
    if (isMockMode()) {
      const session = getOrCreateMockSession(sessionId);
      if (tourRes.revision !== undefined) session.revision = tourRes.revision;
      if (tourRes.tour !== undefined) session.tour = tourRes.tour;
    }
    return tourRes;
  }

  if (isMockMode()) {
    const session = getOrCreateMockSession(sessionId);
    if (baseRevision !== undefined && baseRevision !== null && baseRevision !== session.revision) {
      throw new ApiError(
        "revision_conflict",
        `Xung đột phiên bản: Lịch trình đã được cập nhật bởi một thao tác khác (revision #${session.revision}).`,
        { server_revision: session.revision, base_revision: baseRevision },
        409
      );
    }
    session.revision += 1;
    session.tour = createMockTour(session.preferences, session.revision, []);
    return {
      preferences: session.preferences,
      missing_slots: [],
      questions: [],
      notes: session.notes || [],
      tour: session.tour,
      revision: session.revision,
      dataset_source: "synthetic",
      dataset_version: "v1.0-mock",
      is_mock: true
    };
  }

  return safeFetch(`${getApiBaseUrl()}/v1/sessions/${sessionId}/tour`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Session-Token': token
    },
    body: JSON.stringify({ base_revision: baseRevision }),
    signal: options?.signal
  });
}

/**
 * 8. Replace one stop with locks on others
 * POST /v1/sessions/{id}/tour/replace
 * Body: { base_revision, venue_id }
 */
export async function replaceTourStop(sessionId, baseRevision, venueId, token = "", options = {}) {
  if (isMockMode()) {
    const session = getOrCreateMockSession(sessionId);
    if (baseRevision !== undefined && baseRevision !== null && baseRevision !== session.revision) {
      throw new ApiError(
        "revision_conflict",
        `Xung đột phiên bản: Lịch trình đã có thay đổi mới hơn trên máy chủ (revision #${session.revision}).`,
        { server_revision: session.revision, base_revision: baseRevision },
        409
      );
    }

    if (!session.tour || !session.tour.stops || session.tour.stops.length === 0) {
      throw new ApiError("no_candidates", "Phiên chưa có điểm dừng để thay thế.", null, 409);
    }

    const currentStops = session.tour.stops;
    const targetIdx = currentStops.findIndex(s => s.venue_id === venueId);
    if (targetIdx === -1) {
      throw new ApiError("validation_error", `Quán có mã ${venueId} không tồn tại trong tour hiện tại.`, null, 400);
    }

    // Locked venue IDs are all other stops
    const lockedIds = currentStops.filter(s => s.venue_id !== venueId).map(s => s.venue_id);

    // Pick an alternative synthetic venue not currently in tour
    const existingIds = currentStops.map(s => s.venue_id);
    const candidate = SYNTHETIC_VENUES.find(v => !existingIds.includes(v.id) && !v.online_only && v.geo_ok);

    if (!candidate) {
      throw new ApiError("no_candidates", "Không có phương án thay thế thoả ràng buộc.", { reasons: ["Không còn quán thay thế phù hợp trong khu vực"] }, 409);
    }

    // Form new venues list preserving order and identity of other stops
    const newVenues = currentStops.map((s, idx) => {
      if (idx === targetIdx) {
        return candidate;
      }
      return SYNTHETIC_VENUES.find(v => v.id === s.venue_id) || {
        id: s.venue_id,
        name: s.name,
        address: s.address,
        district: s.district,
        lat: s.lat,
        lon: s.lon,
        source_url: s.source_url,
        price_min_vnd: s.price.min_vnd,
        price_max_vnd: s.price.max_vnd,
        price_evidence: s.price.evidence
      };
    });

    session.revision += 1;
    session.tour = createMockTour(session.preferences, session.revision, lockedIds, newVenues);
    return {
      preferences: session.preferences,
      missing_slots: [],
      questions: [],
      notes: session.notes || [],
      tour: session.tour,
      revision: session.revision,
      dataset_source: "synthetic",
      dataset_version: "v1.0-mock",
      is_mock: true
    };
  }

  return safeFetch(`${getApiBaseUrl()}/v1/sessions/${sessionId}/tour/replace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Session-Token': token
    },
    body: JSON.stringify({ base_revision: baseRevision, venue_id: venueId }),
    signal: options?.signal
  });
}

/**
 * 9. Legacy prototype endpoint
 * POST /v1/plans
 */
export async function planTourLegacy(payload) {
  if (isMockMode()) {
    // Return mock tour mapped to legacy format
    const mockTour = createMockTour({
      origin: { lat: payload.lat, lon: payload.lon },
      duration_min: payload.duration_min,
      budget_vnd: payload.budget_vnd,
      budget_scope: "per_person",
      interests: payload.interests || [],
      mode: payload.mode || "explore"
    }, 1);

    return {
      status: mockTour.status,
      stops: mockTour.stops.map(s => ({
        id: s.venue_id,
        name: s.name,
        address: s.address,
        district: s.district,
        lat: s.lat,
        lon: s.lon,
        source_url: s.source_url,
        straight_line_leg_km: s.leg_from_previous.km,
        price_min_vnd_norm: s.price.min_vnd,
        price_max_vnd_norm: s.price.max_vnd,
        hours_displayed: s.hours.display || "Chưa rõ"
      })),
      straight_line_total_km: 1.25,
      venue_range_upper_sum_vnd: mockTour.totals.venue_range_upper_sum_vnd,
      reasons: mockTour.reasons,
      proposed_changes: mockTour.proposed_changes,
      warnings: [
        "Giờ theo ngày chưa xác minh; cần liên hệ quán.",
        "Khoảng giá của quán không bảo đảm chi phí mỗi người.",
        "Khoảng cách đường chim bay; chưa có tuyến đường hay thời gian di chuyển thực."
      ],
      is_mock: true
    };
  }

  return safeFetch(`${getApiBaseUrl()}/v1/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload)
  });
}

/**
 * 10. Client config for Google Maps & providers (contract v1.5)
 * GET /v1/client-config
 */
export async function getClientConfig(options = {}) {
  if (isMockMode()) {
    return {
      maps: {
        provider: "google",
        status: "unavailable",
        reason: "not_configured",
        js_api_key: null,
        map_id: null,
        language: "vi",
        region: "VN",
        default_center: { lat: 21.0285, lon: 105.8522 },
        default_zoom: 15
      },
      geocoding: { status: "unavailable" },
      routing: { provider: "estimate", status: "unavailable" },
      privacy: {
        sent_to_google: ["map_tiles", "autocomplete_text", "route_coordinates"],
        doc: "docs/PHASE4.md"
      },
      features: {
        ui_v2: (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ui') === 'v2') || process.env.NEXT_PUBLIC_UI_V2 === '1' || false
      },
      is_mock: true
    };
  }

  try {
    const res = await safeFetch(`${getApiBaseUrl()}/v1/client-config`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: options?.signal
    });
    if (res && !res.features) {
      res.features = {
        ui_v2: (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ui') === 'v2') || false
      };
    }
    return res;
  } catch (err) {
    // Graceful fallback when backend endpoint is not configured / not yet deployed
    return {
      maps: {
        provider: "google",
        status: "unavailable",
        reason: "not_configured",
        js_api_key: null,
        map_id: null,
        language: "vi",
        region: "VN",
        default_center: { lat: 21.0285, lon: 105.8522 },
        default_zoom: 15
      },
      geocoding: { status: "unavailable" },
      routing: { provider: "estimate", status: "unavailable" },
      privacy: {
        sent_to_google: ["map_tiles", "autocomplete_text", "route_coordinates"],
        doc: "docs/PHASE4.md"
      },
      features: {
        ui_v2: (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ui') === 'v2') || false
      }
    };
  }
}

/**
 * 11. Restaurant venues for map viewport (contract v1.5)
 * GET /v1/venues/map?min_lat&min_lon&max_lat&max_lon&limit<=500
 */
export async function getVenuesMap(params = {}, options = {}) {
  const { min_lat, min_lon, max_lat, max_lon, limit = 500 } = params;

  if (isMockMode()) {
    let items = SYNTHETIC_VENUES.filter((v) => !v.online_only && v.geo_ok);
    if (min_lat != null && max_lat != null && min_lon != null && max_lon != null) {
      items = items.filter((v) => v.lat >= min_lat && v.lat <= max_lat && v.lon >= min_lon && v.lon <= max_lon);
    }
    const truncated = items.length > limit;
    const sliced = items.slice(0, Math.min(limit, 500)).map((v) => ({
      id: v.id,
      name: v.name,
      lat: v.lat,
      lon: v.lon,
      district: v.district,
      dish_tags: v.dish_tags || [],
      price_max_vnd: v.price_max_vnd,
      synthetic: true
    }));

    return {
      items: sliced,
      total_in_view: items.length,
      truncated,
      dataset_source: "synthetic",
      dataset_version: "v1.0-mock",
      is_mock: true
    };
  }

  const query = new URLSearchParams();
  if (min_lat != null) query.set('min_lat', String(min_lat));
  if (min_lon != null) query.set('min_lon', String(min_lon));
  if (max_lat != null) query.set('max_lat', String(max_lat));
  if (max_lon != null) query.set('max_lon', String(max_lon));
  query.set('limit', String(Math.min(limit, 500)));

  const signal = options?.signal || params?.signal;
  return await safeFetch(`${getApiBaseUrl()}/v1/venues/map?${query.toString()}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal
  });
}

/**
 * 12. Manual address geocoding fallback (server Google Geocoding, contract v1.5)
 * POST /v1/geocode { query }
 */
export async function geocodeAddress(queryText, token = "", options = {}) {
  const trimmed = (queryText || '').trim();
  if (!trimmed) {
    throw new ApiError("validation_error", "Vui lòng nhập địa chỉ cần tìm.", null, 422);
  }

  if (isMockMode()) {
    const q = trimmed.toLowerCase();
    const match = SYNTHETIC_VENUES.find((v) =>
      v.name.toLowerCase().includes(q) ||
      v.address.toLowerCase().includes(q) ||
      (v.district && v.district.toLowerCase().includes(q))
    );

    if (match) {
      return {
        status: "ok",
        provider: "google_geocoding",
        results: [
          {
            label: `${match.name}, ${match.address}`,
            lat: match.lat,
            lon: match.lon,
            place_id: `synthetic-${match.id}`
          }
        ],
        is_mock: true
      };
    }

    if (q.includes("hồ gươm") || q.includes("hoàn kiếm")) {
      return {
        status: "ok",
        provider: "google_geocoding",
        results: [
          { label: "Hồ Hoàn Kiếm, Hàng Trống, Hoàn Kiếm, Hà Nội", lat: 21.0285, lon: 105.8522, place_id: "synthetic-hk" }
        ],
        is_mock: true
      };
    }

    if (q.includes("nhà thờ")) {
      return {
        status: "ok",
        provider: "google_geocoding",
        results: [
          { label: "Nhà Thờ Lớn Hà Nội, 40 Nhà Chung, Hoàn Kiếm, Hà Nội", lat: 21.0287, lon: 105.8490, place_id: "synthetic-nt" }
        ],
        is_mock: true
      };
    }

    return {
      status: "ok",
      provider: "google_geocoding",
      results: [
        { label: `${trimmed}, Hoàn Kiếm, Hà Nội`, lat: 21.033, lon: 105.850, place_id: "synthetic-custom" }
      ],
      is_mock: true
    };
  }

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (token) {
    headers['X-Session-Token'] = token;
  }

  return safeFetch(`${getApiBaseUrl()}/v1/geocode`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: trimmed.slice(0, 200) }),
    signal: options?.signal
  });
}


