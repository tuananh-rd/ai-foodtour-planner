'use client';

import React from 'react';

/**
 * Validates public HTTPS source URLs strictly aligned with backend search_safety.py:
 * - Reject non-HTTPS protocols
 * - Reject credentials (username/password)
 * - Reject non-443 ports
 * - Reject private, loopback, link-local IPv4/IPv6 literals
 * - Reject localhost and internal TLDs (.local, .internal, .lan, .test, .example, .invalid)
 * - Reject ambiguous numeric/hex hosts
 */
export function isSafeHttpsUrl(urlString) {
  if (!urlString || typeof urlString !== 'string' || urlString.length > 2048) return false;
  if (/[\x00-\x20\x7f\\]/.test(urlString)) return false;
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.port && parsed.port !== '443') return false;

    const host = (parsed.hostname || '').toLowerCase();
    if (!host) return false;

    // Reject exact localhost or reserved/internal TLDs
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.lan') ||
      host.endsWith('.example') ||
      host.endsWith('.invalid') ||
      host.endsWith('.test')
    ) {
      return false;
    }

    // Reject IPv6 literals (e.g. [::1], fe80::)
    if (host.startsWith('[') || host.includes(':')) {
      return false;
    }

    // Check for IPv4 literals
    const ipv4Match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      if (ipv4Match.slice(1, 5).some((s) => s.length > 1 && s.startsWith('0'))) return false;
      const octets = ipv4Match.slice(1, 5).map(Number);
      if (octets.some((o) => o < 0 || o > 255)) return false;
      const [o0, o1] = octets;
      // Loopback 127.0.0.0/8
      if (o0 === 127) return false;
      // Private 10.0.0.0/8
      if (o0 === 10) return false;
      // Private 172.16.0.0/12
      if (o0 === 172 && o1 >= 16 && o1 <= 31) return false;
      // Private 192.168.0.0/16
      if (o0 === 192 && o1 === 168) return false;
      // Link-local 169.254.0.0/16
      if (o0 === 169 && o1 === 254) return false;
      // Carrier-grade NAT 100.64.0.0/10
      if (o0 === 100 && o1 >= 64 && o1 <= 127) return false;
      // Documentation / test ranges
      if (o0 === 192 && o1 === 0 && octets[2] === 2) return false;
      if (o0 === 198 && (o1 === 18 || o1 === 19)) return false;
      if (o0 === 198 && o1 === 51 && octets[2] === 100) return false;
      if (o0 === 203 && o1 === 0 && octets[2] === 113) return false;
      // 0.0.0.0/8 or multicast/broadcast 224+
      if (o0 === 0 || o0 >= 224) return false;
    } else {
      if (!host.includes('.')) return false;
      if (/^(?:0x[0-9a-f]+|[0-9]+)(?:\.(?:0x[0-9a-f]+|[0-9]+))*$/i.test(host)) return false;
      if (/[^a-z0-9.-]/i.test(host)) return false;
    }

    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Formats retrieval timestamp showing both date and time honestly.
 * Tolerates invalid date strings without crashing.
 */
function formatRetrievalTimestamp(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  try {
    return d.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (_) {
    return d.toISOString().replace('T', ' ').slice(0, 16);
  }
}

/**
 * OnlineSearchResults
 * Displays web retrieval results (Tavily BASIC) per OpenAPI WebSearchBlock specification.
 * 
 * Invariants enforced:
 * - Stable root data-testid="online-search-results" and card data-testid="web-search-card"
 * - Escaped text only; never dangerouslySetInnerHTML
 * - Strict public HTTPS source link validation
 * - Date AND time retrieval timestamp
 * - Cached badge shown ONLY on successful cached results, never unavailable
 * - Mandatory safety disclaimer
 * - Per-message query retry for HTTP 200 non-ok blocks
 */
export default function OnlineSearchResults({ block, onRetry }) {
  if (!block || block.type !== 'web_search') {
    return null;
  }

  const { status = 'unavailable', sources = [], fetched_at = null, cached = false, query = null } = block;
  const formattedTime = formatRetrievalTimestamp(fetched_at);

  const renderStatusBadge = () => {
    switch (status) {
      case 'ok':
        return <span className="nn-web-search-status-badge ok" data-testid="web-search-status-ok">Tra cứu web (Tavily)</span>;
      case 'disabled':
        return <span className="nn-web-search-status-badge disabled" data-testid="web-search-status-disabled">Chưa bật tra web</span>;
      case 'quota':
        return <span className="nn-web-search-status-badge quota" data-testid="web-search-status-quota">Hết hạn mức tra cứu</span>;
      case 'rejected':
        return <span className="nn-web-search-status-badge rejected" data-testid="web-search-status-rejected">Tra cứu bị từ chối</span>;
      case 'unavailable':
      default:
        return <span className="nn-web-search-status-badge unavailable" data-testid="web-search-status-unavailable">Không thể tra cứu</span>;
    }
  };

  const renderRetryButton = () => {
    if (typeof onRetry !== 'function') return null;
    return (
      <button
        type="button"
        className="nn-web-search-retry-btn"
        onClick={() => onRetry(query)}
        data-testid="web-search-retry-btn"
      >
        Thử tra cứu lại
      </button>
    );
  };

  return (
    <div className="nn-online-search-results-wrapper" data-testid="online-search-results">
      <div className="nn-web-search-card" data-testid="web-search-card" role="region" aria-label="Kết quả tra cứu web">
        <div className="nn-web-search-head">
          {renderStatusBadge()}
          {/* Cached badge shown strictly for successful cached results per review requirement */}
          {status === 'ok' && cached && (
            <span className="nn-web-optin-badge" data-testid="web-search-cached-badge" title="Kết quả được lấy từ bộ nhớ đệm">
              Đệm
            </span>
          )}
          {formattedTime && (
            <span className="nn-web-search-time" data-testid="web-search-timestamp">
              Tra cứu lúc: {formattedTime}
            </span>
          )}
        </div>

        {status === 'ok' && (
          <>
            {sources && sources.length > 0 ? (
              <ul className="nn-web-sources-list" data-testid="web-search-sources-list">
                {sources.slice(0, 3).map((src, i) => {
                  const safeUrl = isSafeHttpsUrl(src.url) ? src.url : null;
                  return (
                    <li key={i} className="nn-web-source-item" data-testid="web-search-source-item">
                      {safeUrl ? (
                        <a
                          href={safeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="nn-web-source-title"
                          data-testid="web-search-link"
                        >
                          {src.title || 'Nguồn tham khảo'} ↗
                        </a>
                      ) : (
                        <span className="nn-web-source-title">{src.title || 'Nguồn tham khảo'}</span>
                      )}
                      {src.snippet && (
                        <p className="nn-web-source-snippet" data-testid="web-search-snippet">
                          &ldquo;{src.snippet}&rdquo;
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="nn-web-search-message">Không tìm thấy trích dẫn phù hợp từ web.</p>
            )}

            <div className="nn-web-search-disclaimer" data-testid="web-search-disclaimer">
              Nguồn web chưa được xác minh; không xác nhận quán đang mở hoặc an toàn dị ứng.
            </div>
          </>
        )}

        {status === 'disabled' && (
          <div style={{ display: 'grid', gap: 6 }}>
            <p className="nn-web-search-message" data-testid="web-search-disabled-msg">
              Dịch vụ tra cứu web chưa được cấu hình khóa API (Tavily). Hệ thống đang hoạt động theo dữ liệu thử nghiệm cục bộ.
            </p>
            {renderRetryButton()}
          </div>
        )}

        {status === 'quota' && (
          <div style={{ display: 'grid', gap: 6 }}>
            <p className="nn-web-search-message" data-testid="web-search-quota-msg">
              Dịch vụ tra cứu web đã hết hạn mức trong ngày. Bạn vẫn có thể tiếp tục trò chuyện và lập lịch trình bình thường.
            </p>
            {renderRetryButton()}
          </div>
        )}

        {status === 'rejected' && (
          <p className="nn-web-search-message" data-testid="web-search-rejected-msg">
            Yêu cầu tra cứu không được thực hiện vì chứa nội dung nhạy cảm, thông tin cá nhân hoặc yêu cầu xác nhận y tế/dị ứng.
          </p>
        )}

        {status === 'unavailable' && (
          <div style={{ display: 'grid', gap: 6 }}>
            <p className="nn-web-search-message" data-testid="web-search-unavailable-msg">
              Không thể kết nối đến máy chủ tra cứu web lúc này. Vui lòng thử lại sau.
            </p>
            {renderRetryButton()}
          </div>
        )}
      </div>
    </div>
  );
}
