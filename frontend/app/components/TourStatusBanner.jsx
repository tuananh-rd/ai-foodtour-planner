'use client';

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

const STATUS_CONFIG = {
  verified_feasible: {
    title: 'Lịch trình đã đủ bằng chứng xác thực',
    badge: 'ĐÃ XÁC MINH',
    bg: '#e8f5e9',
    border: '#a5d6a7',
    textColor: '#1b5e20',
    icon: <CheckIcon />
  },
  conditional: {
    title: 'Gợi ý có điều kiện (Conditional)',
    badge: 'CÓ ĐIỀU KIỆN',
    bg: '#fff8e1',
    border: '#ffe082',
    textColor: '#795548',
    icon: <ZapIcon />
  },
  insufficient_evidence: {
    title: 'Chưa đủ bằng chứng để lập lịch (Insufficient Evidence)',
    badge: 'THIẾU BẰNG CHỨNG',
    bg: '#fff3e0',
    border: '#ffcc80',
    textColor: '#e65100',
    icon: <AlertIcon />
  },
  no_solution: {
    title: 'Không tìm được lịch trình thoả các ràng buộc (No Solution)',
    badge: 'KHÔNG CÓ LỘ TRÌNH',
    bg: '#ffebee',
    border: '#ffcdd2',
    textColor: '#c62828',
    icon: <XIcon />
  }
};

const UNKNOWN_LABELS = {
  hours: 'giờ mở cửa theo ngày',
  price_per_person: 'giá theo người',
  route: 'tuyến đi bộ thực tế',
  party_size: 'số người trong nhóm',
  origin: 'điểm xuất phát',
  duration_min: 'thời lượng tour',
  budget_scope: 'phạm vi ngân sách'
};

export default function TourStatusBanner({ tour, onSwitchToExplore, onAdjustPreferences }) {
  if (!tour || !tour.status) return null;

  const cfg = STATUS_CONFIG[tour.status] || STATUS_CONFIG.conditional;
  const reasons = tour.reasons || [];
  const proposedChanges = tour.proposed_changes || [];
  const unknowns = tour.unknowns || [];

  return (
    <div
      role="region"
      aria-label={`Trạng thái tour: ${cfg.title}`}
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: 14,
        padding: '16px 20px',
        marginBottom: 20,
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{cfg.icon}</span>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: cfg.textColor, margin: 0 }}>
            {cfg.title}
          </h2>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 6,
            background: cfg.textColor,
            color: '#fff'
          }}
        >
          {cfg.badge}
        </span>
      </div>

      {/* Explanation text from server */}
      {tour.explanation && (
        <p style={{ fontSize: 14, color: cfg.textColor, lineHeight: 1.5, marginBottom: 10 }}>
          {tour.explanation}
          {tour.explanation_source === 'llm' && (
            <span data-explanation-source="llm" style={{ display: 'block', fontSize: 11, opacity: 0.8, marginTop: 4 }}>
              Lời giải thích do Gemini diễn đạt lại từ dữ kiện đã được hệ thống kiểm tra.
            </span>
          )}
        </p>
      )}

      {/* Reasons why status is not verified */}
      {reasons.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <strong style={{ fontSize: 13, color: cfg.textColor }}>Lý do & dữ kiện chưa kiểm chứng:</strong>
          <ul style={{ paddingLeft: 20, marginTop: 4, marginBottom: 8, fontSize: 13, color: cfg.textColor }}>
            {reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Unknowns tags */}
      {unknowns.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: cfg.textColor }}>Dữ liệu chưa rõ:</span>
          {unknowns.map((u, i) => (
            <span
              key={i}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 4,
                background: '#fff',
                border: `1px solid ${cfg.border}`,
                color: cfg.textColor,
                fontWeight: 600
              }}
            >
              ? {UNKNOWN_LABELS[u] || u}
            </span>
          ))}
        </div>
      )}

      {/* Proposed Changes from server */}
      {proposedChanges.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${cfg.border}` }}>
          <strong style={{ fontSize: 13, color: cfg.textColor }}>Đề xuất điều chỉnh (Gợi ý, không tự ý áp đặt):</strong>
          <ul style={{ paddingLeft: 20, marginTop: 4, marginBottom: 10, fontSize: 13, color: cfg.textColor }}>
            {proposedChanges.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons for quick fixes */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {tour.status === 'insufficient_evidence' && onSwitchToExplore && (
          <button
            type="button"
            onClick={onSwitchToExplore}
            style={{
              padding: '8px 14px',
              background: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Chuyển sang chế độ Khám phá có điều kiện
          </button>
        )}

        {tour.status === 'no_solution' && onAdjustPreferences && (
          <button
            type="button"
            onClick={onAdjustPreferences}
            style={{
              padding: '8px 14px',
              background: '#fff',
              border: `1px solid ${cfg.textColor}`,
              color: cfg.textColor,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Điều chỉnh tùy chọn (Thời lượng / Ngân sách)
          </button>
        )}
      </div>
    </div>
  );
}
