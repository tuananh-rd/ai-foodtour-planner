'use client';

import { PriceBadge, HoursBadge, LegSourceBadge, LockBadge } from './EvidenceBadge';

export default function TourTimeline({
  tour,
  highlightedStopId,
  onSelectStop,
  onInitiateReplace,
  busy
}) {
  if (!tour || !tour.stops || tour.stops.length === 0) {
    return null;
  }

  const { stops, totals, locks = [] } = tour;

  return (
    <section aria-label="Lịch trình điểm dừng foodtour">
      {/* Tour Totals Summary Bar */}
      <div
        style={{
          background: '#fff',
          borderRadius: 14,
          padding: '14px 18px',
          marginBottom: 16,
          boxShadow: 'var(--shadow-sm)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          border: '1px solid var(--border-color)'
        }}
      >
        <div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Điểm dừng</span>
          <strong style={{ fontSize: 15, color: 'var(--text-primary)' }}>{stops.length} điểm</strong>
        </div>

        <div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Tổng đi bộ</span>
          <strong style={{ fontSize: 15, color: 'var(--text-primary)' }}>
            {totals.walk_minutes != null ? `~${totals.walk_minutes} phút` : 'Chưa xác định'}
          </strong>
        </div>

        <div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>
            {(tour?.stops || []).length > 0 && (tour.stops || []).every((s) => s.price?.semantics === 'per_person' && s.price?.evidence === 'verified')
              ? 'Tổng giá theo người (đã xác minh)'
              : 'Trần khoảng giá quán'}
          </span>
          <strong style={{ fontSize: 15, color: 'var(--text-primary)' }}>
            {totals.venue_range_upper_sum_vnd?.toLocaleString('vi-VN')} ₫
          </strong>
        </div>

        <div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Phiên bản tour</span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              background: '#edf2f7',
              color: '#4a5568',
              padding: '2px 8px',
              borderRadius: 6
            }}
          >
            Bản #{tour.revision}
          </span>
        </div>
      </div>

      {/* Stop Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {stops.map((s, idx) => {
          const isHighlighted = highlightedStopId === s.venue_id;
          const isLocked = locks.includes(s.venue_id);

          return (
            <article
              key={s.venue_id}
              id={`stop-card-${s.venue_id}`}
              role="button"
              tabIndex={0}
              aria-label={`Điểm dừng ${s.order}: ${s.name}`}
              onClick={() => onSelectStop && onSelectStop(s.venue_id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectStop && onSelectStop(s.venue_id);
                }
              }}
              style={{
                background: '#fff',
                borderRadius: 14,
                padding: 18,
                boxShadow: isHighlighted ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                border: isHighlighted
                  ? '2px solid var(--accent-primary)'
                  : isLocked
                  ? '1px solid #cbd5e1'
                  : '1px solid var(--border-color)',
                transition: 'all 0.15s ease',
                position: 'relative',
                cursor: 'pointer'
              }}
            >
              {/* Card Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: isHighlighted ? '#b84020' : 'var(--accent-primary)',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 14
                    }}
                  >
                    {s.order || idx + 1}
                  </span>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                      {s.name}
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {s.address} · {s.district}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <LockBadge isLocked={isLocked} />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInitiateReplace(s);
                    }}
                    disabled={busy}
                    style={{
                      minHeight: 44,
                      padding: '0 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border-color)',
                      background: '#faf9f5',
                      color: 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: busy ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                    title={`Đổi điểm dừng #${s.order} này trong khi các điểm dừng khác được khóa giữ nguyên`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                    </svg>
                    Đổi quán
                  </button>
                </div>
              </div>

              {/* Time arrival / departure */}
              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  background: '#f9f8f5',
                  padding: '6px 12px',
                  borderRadius: 8
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  Đến: <strong>{s.arrive || '--:--'}</strong>
                </span>
                <span>→</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  (ước tính {tour?.assumptions?.visit_minutes_per_stop ? `${tour.assumptions.visit_minutes_per_stop}p` : 'thời gian'} dừng)
                </span>
              </div>

              {/* Price & Hours Grid */}
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                <div>
                  <PriceBadge
                    minVnd={s.price?.min_vnd}
                    maxVnd={s.price?.max_vnd}
                    evidence={s.price?.evidence}
                    semantics={s.price?.semantics}
                  />
                </div>
                <div>
                  <HoursBadge hours={s.hours} />
                </div>
              </div>

              {/* Leg from previous stop */}
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 10,
                  borderTop: '1px solid #f0ede4',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: 12
                }}
              >
                <LegSourceBadge leg={s.leg_from_previous} />

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {s.source_url && (
                    <a
                      href={s.source_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}
                    >
                      Nguồn quán
                    </a>
                  )}
                  ·
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=17/${s.lat}/${s.lon}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}
                  >
                    OSM
                  </a>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
