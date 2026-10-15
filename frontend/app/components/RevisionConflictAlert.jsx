'use client';

export default function RevisionConflictAlert({ conflictError, onReloadSession, onDismiss }) {
  if (!conflictError) return null;

  return (
    <div
      role="alert"
      style={{
        background: '#fff2f0',
        border: '1px solid #ffccc7',
        borderLeft: '5px solid #ff4d4f',
        borderRadius: 10,
        padding: '14px 18px',
        marginBottom: 16,
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <strong style={{ color: '#cf1322', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⚠️</span> Xung đột phiên bản (409 Revision Conflict)
          </strong>
          <p style={{ fontSize: 13, color: '#434343', marginTop: 4, lineHeight: 1.45 }}>
            {conflictError.message || 'Phiên làm việc đã bị thay đổi bởi thao tác khác. Vui lòng tải lại dữ liệu mới nhất từ máy chủ.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {onReloadSession && (
            <button
              type="button"
              onClick={onReloadSession}
              style={{
                minHeight: 38,
                padding: '6px 14px',
                background: '#ff4d4f',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Đồng bộ lại
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8c8c8c',
                fontSize: 16,
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
