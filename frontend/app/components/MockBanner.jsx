'use client';

export default function MockBanner({ isMock, datasetSource, datasetVersion, onToggleMode, busy = false }) {
  const isSynthetic = isMock || datasetSource === 'synthetic';
  const isPrivate = !isMock && datasetSource === 'private';

  if (!isSynthetic && !isPrivate && !isMock) return null;

  if (isSynthetic) {
    return (
      <div
        role="status"
        aria-label="Cảnh báo chế độ dữ liệu giả lập"
        style={{
          background: '#fff3cd',
          border: '1px solid #ffeeba',
          borderLeft: '5px solid #ff9800',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              background: '#d9532f',
              color: '#fff',
              fontWeight: 800,
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 4,
              letterSpacing: '0.5px',
              textTransform: 'uppercase'
            }}
          >
            DỮ LIỆU GIẢ LẬP
          </span>
          <span style={{ fontSize: 13, color: '#856404' }}>
            {isMock
              ? 'Đang chạy chế độ MOCK nội bộ với mẫu synthetic (contracts/fixtures/venues.synthetic.json). Không dùng dữ liệu thực.'
              : `Máy chủ đang sử dụng bộ dữ liệu giả lập SYNTHETIC (phiên bản: ${datasetVersion ? datasetVersion.substring(0, 8) : 'mẫu thử'}). Không dùng dữ liệu thực.`}
          </span>
        </div>

        {onToggleMode && (
          <button
            type="button"
            onClick={onToggleMode}
            disabled={busy}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              background: '#fff',
              border: '1px solid #d39e00',
              borderRadius: 6,
              color: '#856404',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontWeight: 600
            }}
          >
            {isMock ? 'Chuyển sang Backend Thật' : 'Chuyển sang Mock Mode'}
          </button>
        )}
      </div>
    );
  }

  // Neutral notice for private dataset
  return (
    <div
      role="status"
      aria-label="Thông báo nguồn dữ liệu cục bộ"
      style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderLeft: '5px solid #64748b',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 16,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            background: '#475569',
            color: '#fff',
            fontWeight: 700,
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 4,
            letterSpacing: '0.5px'
          }}
        >
          DỮ LIỆU CỤC BỘ
        </span>
        <span style={{ fontSize: 13, color: '#334155' }}>
          Dữ liệu cục bộ chưa xác minh. Giờ mở cửa theo ngày, giá theo người và định tuyến thực tế cần được kiểm chứng trước khi đi.
        </span>
      </div>

      {onToggleMode && (
        <button
          type="button"
          onClick={onToggleMode}
          disabled={busy}
          style={{
            fontSize: 12,
            padding: '4px 10px',
            background: '#fff',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            color: '#475569',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontWeight: 600
          }}
        >
          {isMock ? 'Chuyển sang Backend Thật' : 'Chuyển sang Mock Mode'}
        </button>
      )}
    </div>
  );
}
