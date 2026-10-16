/**
 * Free Google Maps URL validation and reason translation (Contract v1.7, GMAPS-URL-2).
 *
 * Rules:
 * - protocol: exactly https:
 * - hostname: exactly www.google.com
 * - credentials: none (no username/password)
 * - port: default only (empty or 443)
 * - pathname: must start with /maps/dir/
 * - Accepted URLs must be preserved verbatim.
 * - Reasons translated accurately without falsely claiming missing coordinates for url_too_long.
 */

export function isValidGoogleMapsDirUrl(urlStr) {
  if (typeof urlStr !== 'string' || !urlStr.trim()) return false;
  try {
    const parsed = new URL(urlStr);
    // 1. protocol https:
    if (parsed.protocol !== 'https:') return false;
    // 2. hostname exactly 'www.google.com'
    if (parsed.hostname !== 'www.google.com') return false;
    // 3. no credentials
    if (parsed.username !== '' || parsed.password !== '') return false;
    // 4. no non-default port
    if (parsed.port !== '' && parsed.port !== '443') return false;
    // 5. pathname starting with '/maps/dir/'
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
      return 'độ dài liên kết vượt quá giới hạn của Google Maps';
    default:
      return 'không thể đưa vào lộ trình';
  }
}

export function translateServerNote(note) {
  if (typeof note !== 'string') return String(note || '');
  const trimmed = note.trim();

  // Known server notes from backend/app/planner/maps_url.py
  if (trimmed === 'Links contain the origin/venue coordinates or fallback addresses and are sent to Google only when the user opens them.') {
    return 'Liên kết chứa toạ độ điểm xuất phát/quán ăn hoặc địa chỉ dự phòng và chỉ được gửi tới Google khi bạn mở liên kết.';
  }
  if (trimmed === "The schedule is the app's proposal; Google may show different times.") {
    return 'Thứ tự theo gợi ý của ứng dụng; Google có thể hiển thị thời gian khác.';
  }
  if (trimmed === 'Tour origin has no usable point; links start at the first usable stop.') {
    return 'Điểm xuất phát tour không có toạ độ hoặc địa chỉ hợp lệ; liên kết bắt đầu từ quán ăn đầu tiên có thông tin.';
  }
  if (trimmed === 'An isolated usable stop has identical origin and destination; no missing leg is inferred.') {
    return 'Điểm dừng đơn lẻ có điểm đi và điểm đến giống nhau; không tự suy diễn chặng đường còn thiếu.';
  }
  if (trimmed.startsWith('Skipped stops break the itinerary into separate usable runs')) {
    return 'Các điểm dừng bị bỏ qua chia lịch trình thành các chặng riêng biệt; các chặng thiếu không được tự động nối. Lý do được liệt kê trong danh sách bỏ qua, bao gồm các điểm vượt quá giới hạn độ dài liên kết.';
  }
  return note;
}

