'use client';

export default function MockBanner({ isMock, onToggleMode }) {
  if (!isMock) return null;

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
          Đang chạy chế độ MOCK với mẫu synthetic (contracts/fixtures/venues.synthetic.json). Không dùng dữ liệu thực.
        </span>
      </div>

      {onToggleMode && (
        <button
          type="button"
          onClick={onToggleMode}
          style={{
            fontSize: 12,
            padding: '4px 10px',
            background: '#fff',
            border: '1px solid #d39e00',
            borderRadius: 6,
            color: '#856404',
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          Chuyển sang Backend Thật
        </button>
      )}
    </div>
  );
}
