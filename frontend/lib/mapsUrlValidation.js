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
