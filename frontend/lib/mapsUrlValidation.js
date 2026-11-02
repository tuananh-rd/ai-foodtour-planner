/**
 * OpenStreetMap & Directions URL validation and server note translation.
 *
 * Rules:
 * - protocol: exactly https:
 * - hostname: exactly www.openstreetmap.org or openstreetmap.org
 * - credentials: none (no username/password)
 * - port: default only (empty or 443)
 * - pathname: exactly /directions
 * - no hash: parsed.hash === ''
 * - length: bounded (length <= 2048)
 * - query params: exactly one 'engine' and one 'route' (no duplicates)
 * - engine: fossgis_osrm_foot (walking) or fossgis_osrm_car (driving)
 * - route: exactly 2 finite, bounded coordinate pairs separated by ';'
 * - expectedMode: must match engine if supplied; motorcycle returns false
 * - Reasons translated accurately without falsely claiming missing coordinates for length limits.
 * - Zero emoji in UI strings.
 */

export function isValidOsmDirUrl(urlStr, expectedMode = null) {
  if (typeof urlStr !== 'string' || !urlStr.trim()) return false;
  if (urlStr.length > 2048) return false;

  try {
    const parsed = new URL(urlStr);
    // 1. protocol https:
    if (parsed.protocol !== 'https:') return false;
    // 2. hostname exactly 'www.openstreetmap.org' or 'openstreetmap.org'
    if (parsed.hostname !== 'www.openstreetmap.org' && parsed.hostname !== 'openstreetmap.org') return false;
    // 3. no credentials
    if (parsed.username !== '' || parsed.password !== '') return false;
    // 4. no non-default port
    if (parsed.port !== '' && parsed.port !== '443') return false;
    // 5. exact pathname '/directions'
    if (parsed.pathname !== '/directions') return false;
    // 6. no hash
    if (parsed.hash !== '') return false;

    // 7. query params: exactly one 'engine' and one 'route'
    const allEngine = parsed.searchParams.getAll('engine');
    const allRoute = parsed.searchParams.getAll('route');
    if (allEngine.length !== 1 || allRoute.length !== 1) return false;

    const engine = allEngine[0];
    if (engine !== 'fossgis_osrm_foot' && engine !== 'fossgis_osrm_car') return false;

    // Validate expected mode matching
    if (expectedMode) {
      const em = String(expectedMode).toLowerCase().trim();
      if (em === 'walking' || em === 'foot' || em === 'walk') {
        if (engine !== 'fossgis_osrm_foot') return false;
      } else if (em === 'driving' || em === 'car' || em === 'oto' || em === 'ô tô') {
        if (engine !== 'fossgis_osrm_car') return false;
      } else {
        // Motorcycle or unknown mode has no valid OSM engine
        return false;
      }
    }

    // 8. route parameter: exactly 2 finite bounded coordinate pairs separated by ';'
    const route = allRoute[0];
    const legs = route.split(';');
    if (legs.length !== 2) return false;

    for (const leg of legs) {
      if (!leg.trim()) return false;
      const coords = leg.split(',');
      if (coords.length !== 2) return false;
      const rawLat = coords[0].trim();
      const rawLon = coords[1].trim();
      if (!rawLat || !rawLon) return false;
      // Strict numeric parsing without NaN or non-digits (except decimal point and optional sign)
      if (!/^-?\d+(?:\.\d+)?$/.test(rawLat) || !/^-?\d+(?:\.\d+)?$/.test(rawLon)) return false;
      const lat = Number(rawLat);
      const lon = Number(rawLon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
      if (lat === 0 && lon === 0) return false; // Missing coordinates are NEVER 0,0
    }

    return true;
  } catch (_) {
    return false;
  }
}

export function isValidGoogleMapsDirUrl(urlStr) {
  if (typeof urlStr !== 'string' || !urlStr.trim()) return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname !== 'www.google.com') return false;
    if (parsed.username !== '' || parsed.password !== '') return false;
    if (parsed.port !== '' && parsed.port !== '443') return false;
    if (!parsed.pathname.startsWith('/maps/dir/')) return false;
    return true;
  } catch (_) {
    return false;
  }
}

export function translateSkippedReason(reason) {
  switch (reason) {
    case 'no_usable_point':
      return 'thiếu toạ độ hoặc địa chỉ hợp lệ';
    case 'url_too_long':
      return 'độ dài liên kết vượt quá giới hạn';
    default:
      return 'không thể đưa vào lộ trình';
  }
}

export function translateServerNote(note) {
  if (typeof note !== 'string') return 'Ghi chú thêm từ máy chủ';
  const trimmed = note.trim();
  if (!trimmed) return '';

  // OpenStreetMap server notes from backend/app/planner/maps_url.py
  if (trimmed === 'Coordinates are shared with OpenStreetMap and its routing service only when you open a link.') {
    return 'Tọa độ chỉ được chia sẻ với OpenStreetMap và dịch vụ điều hướng khi bạn nhấn mở liên kết.';
  }
  if (trimmed === 'Each link opens one ordered leg. Map connectors are estimates, not road routes or live travel times.') {
    return 'Mỗi liên kết mở một chặng theo đúng thứ tự. Đường nối trên bản đồ là ước tính, không phải lộ trình đường sá thực tế hay thời gian thực.';
  }
  if (trimmed === 'Motorcycle routing is unavailable; no car route is substituted. Use the numbered map stops.') {
    return 'Chưa hỗ trợ chỉ đường xe máy; không tự động thay bằng đường ô tô. Bạn hãy theo dõi các điểm dừng được đánh số trên bản đồ.';
  }
  if (trimmed === 'Requested mode differs from the confirmed tour vehicle; choose the matching mode.') {
    return 'Phương thức di chuyển yêu cầu khác với phương tiện đã chọn trong lịch trình; vui lòng chọn phương thức phù hợp.';
  }
  if (trimmed === 'A valid selected origin is required; no origin or address is inferred.') {
    return 'Cần chọn điểm xuất phát hợp lệ; ứng dụng không tự suy diễn điểm xuất phát hay địa chỉ.';
  }
  if (trimmed === 'Missing-coordinate stops break the itinerary; no missing leg is connected or address guessed.') {
    return 'Các điểm dừng thiếu tọa độ làm ngắt quãng lộ trình; ứng dụng không tự nối tắt qua điểm thiếu hoặc đoán địa chỉ.';
  }

  // Legacy Google Maps notes retained for reference
  if (trimmed === 'Links contain the origin/venue coordinates or fallback addresses and are sent to Google only when the user opens them.') {
    return 'Liên kết chứa toạ độ điểm xuất phát/quán ăn hoặc địa chỉ dự phòng và chỉ được gửi khi bạn mở liên kết.';
  }
  if (trimmed === "The schedule is the app's proposal; Google may show different times.") {
    return 'Thứ tự theo gợi ý của ứng dụng; thời gian di chuyển thực tế có thể khác.';
  }

  return normalizeDisplayText(trimmed);
}

function normalizeDisplayText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
}
