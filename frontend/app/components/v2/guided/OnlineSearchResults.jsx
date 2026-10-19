'use client';

import React from 'react';

/**
 * OnlineSearchResults
 * Displays web retrieval results (Tavily BASIC) per OpenAPI WebSearchBlock specification.
 * 
 * Safety & Privacy constraints:
 * - Escaped text only; never dangerouslySetInnerHTML.
 * - Public HTTPS links only with rel="noopener noreferrer".
 * - Mandatory disclaimer: "Nguồn web chưa được xác minh; không xác nhận quán đang mở hoặc an toàn dị ứng."
 * - Distinct honest statuses: ok, disabled, unavailable, quota, rejected.
 */
export default function OnlineSearchResults({ block, onRetry }) {
  if (!block || block.type !== 'web_search') {
    return null;
  }

  const { status = 'unavailable', sources = [], fetched_at = null, cached = false } = block;

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

  const isSafeHttpsUrl = (urlString) => {
    if (!urlString || typeof urlString !== 'string') return false;
    try {
      const parsed = new URL(urlString);
      return parsed.protocol === 'https:' && !parsed.hostname.includes('localhost') && !parsed.hostname.endsWith('.local');
    } catch (_) {
      return false;
    }
  };

  return (
    <div className="nn-web-search-card" data-testid="web-search-card" role="region" aria-label="Kết quả tra cứu web">
      <div className="nn-web-search-head">
        {renderStatusBadge()}
        {cached && <span className="nn-web-optin-badge" title="Kết quả được lấy từ bộ nhớ đệm">Đệm</span>}
        {fetched_at && (
          <span className="nn-web-search-time" data-testid="web-search-timestamp">
            {new Date(fetched_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
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
        <p className="nn-web-search-message" data-testid="web-search-disabled-msg">
          Dịch vụ tra cứu web chưa được cấu hình khóa API (Tavily). Hệ thống đang hoạt động theo dữ liệu thử nghiệm cục bộ.
        </p>
      )}

      {status === 'quota' && (
        <p className="nn-web-search-message" data-testid="web-search-quota-msg">
          Dịch vụ tra cứu web đã hết hạn mức trong ngày. Bạn vẫn có thể tiếp tục trò chuyện và lập lịch trình bình thường.
        </p>
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
          {typeof onRetry === 'function' && (
            <button
              type="button"
              className="nn-web-search-retry-btn"
              onClick={onRetry}
              data-testid="web-search-retry-btn"
            >
              Thử tra cứu lại
            </button>
          )}
        </div>
      )}
    </div>
  );
}
