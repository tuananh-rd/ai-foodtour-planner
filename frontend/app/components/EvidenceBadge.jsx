'use client';

export function PriceBadge({ minVnd, maxVnd, evidence = 'estimate', semantics = 'venue_range' }) {
  const isVerified = evidence === 'verified';
  const isEstimate = evidence === 'estimate';

  const bg = isVerified ? 'var(--badge-verified-bg)' : isEstimate ? 'var(--badge-estimate-bg)' : 'var(--badge-unknown-bg)';
  const color = isVerified ? 'var(--badge-verified-text)' : isEstimate ? 'var(--badge-estimate-text)' : 'var(--badge-unknown-text)';
  const symbol = isVerified ? '✓' : isEstimate ? '≈' : '?';
  const label = isVerified ? 'XÁC MINH' : isEstimate ? 'ƯỚC TÍNH' : 'CHƯA RÕ';

  let displayStr = 'Chưa có thông tin giá';
  if (minVnd != null && maxVnd != null) {
    displayStr = `${minVnd.toLocaleString('vi-VN')} – ${maxVnd.toLocaleString('vi-VN')} ₫`;
  } else if (maxVnd != null) {
    displayStr = `Tối đa ${maxVnd.toLocaleString('vi-VN')} ₫`;
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontSize: 12,
          padding: '3px 8px',
          borderRadius: 6,
          background: bg,
          color: color,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4
        }}
        title={`Bằng chứng giá: ${label}. Ngữ nghĩa: Khoảng giá quán, không phải hóa đơn mỗi người.`}
      >
        <span>{symbol} Giá: {displayStr}</span>
        <span style={{ fontSize: 10, opacity: 0.85 }}>({label})</span>
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        * Khoảng giá quán, không bảo đảm chi phí mỗi người
      </span>
    </div>
  );
}

export function HoursBadge({ hours }) {
  if (!hours) {
    return (
      <span
        style={{
          fontSize: 12,
          padding: '3px 8px',
          borderRadius: 6,
          background: 'var(--badge-unknown-bg)',
          color: 'var(--badge-unknown-text)',
          fontWeight: 600
        }}
      >
        ? Giờ: Chưa rõ (Chưa kiểm chứng theo ngày)
      </span>
    );
  }

  const isVerified = hours.status === 'verified';
  const isEstimate = hours.status === 'estimate';
  const bg = isVerified ? 'var(--badge-verified-bg)' : isEstimate ? 'var(--badge-estimate-bg)' : 'var(--badge-unknown-bg)';
  const color = isVerified ? 'var(--badge-verified-text)' : isEstimate ? 'var(--badge-estimate-text)' : 'var(--badge-unknown-text)';

  // open_at_arrival: true | false | null. Null means unknown, never true!
  let statusText = 'Chưa rõ theo giờ đến';
  if (hours.open_at_arrival === true && isVerified) {
    statusText = 'Đang mở cửa';
  } else if (hours.open_at_arrival === false) {
    statusText = 'Đóng cửa vào giờ đến';
  }

  return (
    <span
      style={{
        fontSize: 12,
        padding: '3px 8px',
        borderRadius: 6,
        background: bg,
        color: color,
        fontWeight: 600
      }}
      title={`Trạng thái giờ mở cửa: ${hours.status}. open_at_arrival: ${hours.open_at_arrival}`}
    >
      🕒 Giờ: {hours.display || '07:00–22:00 (tham khảo)'} · {statusText}
    </span>
  );
}

export function LegSourceBadge({ leg }) {
  if (!leg) return null;

  const isProvider = leg.source === 'provider_route';
  const isStraightLine = leg.source === 'straight_line_estimate';

  const bg = isProvider ? '#e8f5e9' : isStraightLine ? '#fff3e0' : '#f5f5f5';
  const color = isProvider ? '#2e7d32' : isStraightLine ? '#e65100' : '#757575';
  const label = isProvider
    ? 'Tuyến đi bộ thực tế'
    : isStraightLine
    ? 'Đường chim bay ước tính'
    : 'Chưa rõ tuyến';

  return (
    <span
      style={{
        fontSize: 11,
        padding: '2px 7px',
        borderRadius: 4,
        background: bg,
        color: color,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4
      }}
      title={`Nguồn dữ liệu chặng: ${leg.source}`}
    >
      🚶 {leg.minutes != null ? `${leg.minutes} phút` : 'Ước tính'} ({leg.km} km) · {label}
    </span>
  );
}

export function LockBadge({ isLocked }) {
  if (!isLocked) return null;

  return (
    <span
      style={{
        fontSize: 11,
        padding: '3px 8px',
        borderRadius: 6,
        background: '#e2e8f0',
        color: '#475569',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4
      }}
      title="Điểm dừng này đã được cố định danh tính và vị trí thứ tự trong tour."
    >
      🔒 ĐÃ KHÓA
    </span>
  );
}
