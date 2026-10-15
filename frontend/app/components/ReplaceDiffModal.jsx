'use client';

export default function ReplaceDiffModal({
  isOpen,
  oldStop,
  candidate,
  lockedStops = [],
  onConfirm,
  onCancel,
  busy
}) {
  if (!isOpen || !oldStop) return null;

  const oldMax = oldStop.price?.max_vnd || 0;
  const newMax = candidate?.price_max_vnd || 0;
  const priceDiff = newMax - oldMax;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 9999
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          maxWidth: 520,
          width: '100%',
          padding: 24,
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 id="modal-title" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            🔄 Xác nhận Đổi Điểm Dừng #{oldStop.order}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: '#888'
            }}
          >
            ✕
          </button>
        </div>

        {/* Locked stops reminder */}
        <div
          style={{
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 12,
            color: '#334155'
          }}
        >
          <strong>🔒 Cơ chế Khóa hành trình (Tour Locking):</strong>
          <p style={{ marginTop: 2 }}>
            Chỉ vị trí điểm dừng #{oldStop.order} được đổi. Tất cả {lockedStops.length} điểm dừng còn lại ({lockedStops.join(', ')}) được giữ nguyên tuyệt đối về quán và thứ tự.
          </p>
        </div>

        {/* Before / After comparison */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          {/* Old stop */}
          <div
            style={{
              background: '#fff1f0',
              border: '1px solid #ffa39e',
              borderRadius: 12,
              padding: 12,
              fontSize: 13
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: '#cf1322', textTransform: 'uppercase' }}>
              Quán hiện tại
            </span>
            <h4 style={{ fontSize: 14, fontWeight: 700, marginTop: 4, color: '#cf1322' }}>
              {oldStop.name}
            </h4>
            <p style={{ fontSize: 11, color: '#8c161d', marginTop: 2 }}>{oldStop.address}</p>
            <div style={{ marginTop: 8, fontSize: 12, color: '#595959' }}>
              Khoảng giá: {oldStop.price?.min_vnd?.toLocaleString('vi-VN')}–{oldStop.price?.max_vnd?.toLocaleString('vi-VN')} ₫
            </div>
          </div>

          {/* New stop */}
          <div
            style={{
              background: '#f6ffed',
              border: '1px solid #b7eb8f',
              borderRadius: 12,
              padding: 12,
              fontSize: 13
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: '#389e0d', textTransform: 'uppercase' }}>
              Quán đề xuất mới
            </span>
            <h4 style={{ fontSize: 14, fontWeight: 700, marginTop: 4, color: '#389e0d' }}>
              {candidate?.name || 'Điểm dừng thay thế tối ưu (Server)'}
            </h4>
            <p style={{ fontSize: 11, color: '#237804', marginTop: 2 }}>{candidate?.address || 'Hoàn Kiếm, Hà Nội'}</p>
            <div style={{ marginTop: 8, fontSize: 12, color: '#595959' }}>
              Khoảng giá: {candidate?.price_min_vnd != null ? `${candidate.price_min_vnd.toLocaleString('vi-VN')}–${candidate.price_max_vnd.toLocaleString('vi-VN')} ₫` : 'Tối ưu theo ngân sách'}
            </div>
          </div>
        </div>

        {/* Diff metrics */}
        <div style={{ background: '#fafafa', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>Chênh lệch trần giá quán:</span>
            <strong style={{ color: candidate ? (priceDiff > 0 ? '#d4380d' : '#389e0d') : '#595959' }}>
              {candidate ? (priceDiff > 0 ? `+${priceDiff.toLocaleString('vi-VN')} ₫` : `${priceDiff.toLocaleString('vi-VN')} ₫`) : 'Tối ưu tự động'}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Thứ tự và lộ trình:</span>
            <span>Được tính toán lại bảo đảm thời lượng</span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid #d9d9d9',
              background: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Giữ quán cũ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: busy ? '#aaa' : 'var(--accent-primary)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer'
            }}
          >
            {busy ? 'Đang đổi…' : 'Xác nhận đổi quán này'}
          </button>
        </div>
      </div>
    </div>
  );
}
