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
  if (envMode === 'live') return false;
  // Default to mock if NEXT_PUBLIC_API_MODE=mock or not explicitly set to live
  return true;
}

export function setRuntimeMockMode(enable) {
  runtimeMockOverride = enable;
}

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
}

// In-memory mock session store for realistic client testing
const mockSessions = new Map();

function getOrCreateMockSession(sessionId = null) {
  const sid = sessionId || `mock-session-${Date.now()}`;
  if (!mockSessions.has(sid)) {
    mockSessions.set(sid, {
      session_id: sid,
      token: `mock-token-${Math.random().toString(36).substring(2, 10)}`,
      revision: 1,
      preferences: {
        city: "Hà Nội",
        origin: null, // Required to plan
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
      tour: null
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
      leg_source: "straight_line_estimate"
    },
    explanation: `Gợi ý có điều kiện: một số thông tin chưa được xác minh. Các điểm dừng: ${stops.map(s => s.name).join(" → ")}. Tổng đi bộ khoảng ${walkMinutes} phút (ước tính đường chim bay). Tổng khoảng giá tối đa của quán: ${upperSum.toLocaleString('vi-VN')} ₫ (không phải hoá đơn mỗi người). Chưa biết: giờ mở cửa theo ngày, tuyến đi bộ thực tế.`,
    locks: lockedIds,
    is_mock: true
  };
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
      routing: "straight_line_estimator",
      is_mock: true
    };
  }

  const res = await fetch(`${getApiBaseUrl()}/health`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) {
    throw new ApiError("health_check_failed", "Không thể kiểm tra sức khỏe hệ thống backend", null, res.status);
  }
  return res.json();
}

/**
 * 2. Search / List venues
 * GET /v1/venues
 */
export async function getVenues({ limit = 20, offset = 0, q = "" } = {}) {
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
      venues: paginated,
      total: list.length,
      limit,
      offset,
      is_mock: true
    };
  }

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q) params.set("q", q);
  const res = await fetch(`${getApiBaseUrl()}/v1/venues?${params.toString()}`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new ApiError(errorBody?.error?.code || "request_failed", errorBody?.error?.message || "Lỗi tải danh sách quán", errorBody?.error?.details, res.status);
  }
  return res.json();
}

/**
 * 3. Venue detail
 * GET /v1/venues/{id}
 */
export async function getVenueById(id) {
  if (isMockMode()) {
    const found = SYNTHETIC_VENUES.find(v => v.id === id);
    if (!found) {
      throw new ApiError("not_found", `Không tìm thấy quán với mã ${id}`, null, 404);
    }
    return { ...found, is_mock: true };
  }

  const res = await fetch(`${getApiBaseUrl()}/v1/venues/${id}`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new ApiError(errorBody?.error?.code || "request_failed", errorBody?.error?.message || "Lỗi tải thông tin quán", errorBody?.error?.details, res.status);
  }
  return res.json();
}

/**
 * 4. Create session
 * POST /v1/sessions
 */
export async function createSession() {
  if (isMockMode()) {
    const session = getOrCreateMockSession();
    return {
      session_id: session.session_id,
      token: session.token,
      revision: session.revision,
      is_mock: true
    };
  }

  const res = await fetch(`${getApiBaseUrl()}/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new ApiError(errorBody?.error?.code || "session_creation_failed", errorBody?.error?.message || "Không thể tạo phiên làm việc", errorBody?.error?.details, res.status);
  }
  return res.json();
}

/**
 * 5. Send chat message (Extract + Merge preferences)
 * POST /v1/sessions/{id}/messages
 * Returns { preferences, missing_slots, questions, tour|null, revision }
 */
export async function sendMessage(sessionId, text, token = "") {
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
        tour: session.tour,
        revision: session.revision,
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
        tour: session.tour,
        revision: session.revision,
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
        tour: null,
        revision: session.revision,
        is_mock: true
      };
    }

    // Complete preferences -> Generate tour
    session.tour = createMockTour(session.preferences, session.revision, []);
    return {
      preferences: session.preferences,
      missing_slots: [],
      questions: [],
      tour: session.tour,
      revision: session.revision,
      is_mock: true
    };
  }

  const res = await fetch(`${getApiBaseUrl()}/v1/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Session-Token': token
    },
    body: JSON.stringify({ text })
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new ApiError(errorBody?.error?.code || "message_failed", errorBody?.error?.message || "Lỗi xử lý tin nhắn", errorBody?.error?.details, res.status);
  }
  return res.json();
}

/**
 * 6. Update structured preferences
 * PUT /v1/sessions/{id}/preferences
 * Body: { base_revision, preferences }
 */
export async function updatePreferences(sessionId, baseRevision, preferences, token = "") {
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
    return {
      preferences: session.preferences,
      revision: session.revision,
      tour: session.tour,
      is_mock: true
    };
  }

  const res = await fetch(`${getApiBaseUrl()}/v1/sessions/${sessionId}/preferences`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Session-Token': token
    },
    body: JSON.stringify({ base_revision: baseRevision, preferences })
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new ApiError(errorBody?.error?.code || "update_failed", errorBody?.error?.message || "Lỗi cập nhật tùy chọn", errorBody?.error?.details, res.status);
  }
  return res.json();
}

/**
 * 7. Plan tour with current preferences
 * POST /v1/sessions/{id}/tour
 * Body: { base_revision }
 */
export async function planTour(sessionId, baseRevision, token = "") {
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
    return session.tour;
  }

  const res = await fetch(`${getApiBaseUrl()}/v1/sessions/${sessionId}/tour`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Session-Token': token
    },
    body: JSON.stringify({ base_revision: baseRevision })
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new ApiError(errorBody?.error?.code || "plan_failed", errorBody?.error?.message || "Lỗi lập lịch trình", errorBody?.error?.details, res.status);
  }
  return res.json();
}

/**
 * 8. Replace one stop with locks on others
 * POST /v1/sessions/{id}/tour/replace
 * Body: { base_revision, venue_id }
 */
export async function replaceTourStop(sessionId, baseRevision, venueId, token = "") {
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
      throw new ApiError("not_found", "Chưa có tour nào được tạo trong phiên này để thay thế.", null, 404);
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
      throw new ApiError("no_candidates", "Không còn quán thay thế phù hợp nào trong khu vực thỏa mãn các ràng buộc.", null, 400);
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
    return session.tour;
  }

  const res = await fetch(`${getApiBaseUrl()}/v1/sessions/${sessionId}/tour/replace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Session-Token': token
    },
    body: JSON.stringify({ base_revision: baseRevision, venue_id: venueId })
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new ApiError(errorBody?.error?.code || "replace_failed", errorBody?.error?.message || "Lỗi thay đổi điểm dừng", errorBody?.error?.details, res.status);
  }
  return res.json();
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

  const res = await fetch(`${getApiBaseUrl()}/v1/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new ApiError(errorBody?.error?.code || "legacy_failed", errorBody?.error?.message || "Lỗi lập kế hoạch theo API cũ", errorBody?.error?.details, res.status);
  }
  return res.json();
}
