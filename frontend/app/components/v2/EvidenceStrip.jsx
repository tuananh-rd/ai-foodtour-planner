'use client';

import React, { useState } from 'react';

/**
 * Single collapsed EvidenceStrip for UI_V2 (Scope 3).
 * Collapsed title: "Chưa chắc: giờ mở cửa · giá theo người" (expandable).
 * Replaces repeated banners and disclaimers.
 * Zero raw developer field names (no 'hours', 'price_per_person', 'route').
 */
export default function EvidenceStrip({
  tour,
  className = '',
  style = {},
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      data-evidence-strip
      className={`ft-evidence-strip ${className}`.trim()}
      style={{
        backgroundColor: '#FFFBEB',
        border: '1px solid #FDE68A',
        borderRadius: 'var(--radius-md, 8px)',
        marginBottom: '16px',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Header button (Toggle) with min-height >= 44px */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded ? 'true' : 'false'}
        aria-controls="evidence-strip-details"
        style={{
          width: '100%',
          minHeight: '44px',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#78350F',
          fontSize: '13px',
          fontWeight: 600,
          textAlign: 'left',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>⚠️</span>
          <span>Chưa chắc: giờ mở cửa · giá theo người</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#92400E' }}>
          <span>{isExpanded ? 'Thu gọn' : 'Xem chi tiết'}</span>
          <span style={{ fontSize: '14px', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            ▼
          </span>
        </div>
      </button>

      {/* Expanded detailed notes */}
      {isExpanded && (
        <div
          id="evidence-strip-details"
          style={{
            padding: '10px 14px 14px 14px',
            borderTop: '1px solid #FEF3C7',
            backgroundColor: '#FEFDF8',
            fontSize: '13px',
            color: '#451A03',
            lineHeight: 1.6,
          }}
        >
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li style={{ marginBottom: '6px' }}>
              <strong>Giờ mở cửa:</strong> Dữ liệu nguồn chưa có lịch chi tiết theo từng thứ trong tuần. Bạn nên liên hệ xác nhận với quán trước khi tới.
            </li>
            <li style={{ marginBottom: '6px' }}>
              <strong>Khoảng giá:</strong> Mức giá hiển thị là khoảng giá chung do quán công bố, không phải hoá đơn tính theo từng người.
            </li>
            <li>
              <strong>Đường đi:</strong> Khoảng cách và thời gian di chuyển là ước tính đường chim bay nội bộ của hệ thống.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
