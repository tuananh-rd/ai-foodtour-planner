'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getMapsLinks } from '../../../lib/api';
import { useStatusQueue } from '../../ui/StatusQueue';

/**
 * Free Google Maps URLs Itinerary Block (Contract v1.7, GMAPS-URL-2).
 *
 * Rules:
 * - Pure public URL scheme (api=1, travelmode=walking|driving, max 3 waypoints, <= 2048 chars).
 * - ZERO Google Maps API / JS / embeds / tiles / keys / billing.
 * - ZERO Google calls from the server, client app, or test suites.
 * - The browser only navigates to Google when the USER explicitly clicks an <a> link.
 * - Segmented walking/driving toggle (default walking, >=44px touch target).
 * - Exactly one link: primary button 'Xem lịch trình trên Google Maps'.
 * - n > 1 links: ordered list 'Chặng i/n: <from> → <to>'.
 * - Real <a href target="_blank" rel="noopener noreferrer">.
 * - Status partial/unavailable rendered honestly with server notes.
 * - Never claims or implies Google travel times or distances.
 * - Generation guard prevents stale responses from overwriting newer mode/revision state.
 * - Errors route through StatusQueue with an accessible Retry button.
 */
export default function MapsLinksBlock({
  tour,
  sessionId,
  sessionToken,
  sessionEpoch = 0,
  revision = 0,
  originLabel = null,
  initialMapsData = null,
  className = '',
  style = {},
}) {
  const [mode, setMode] = useState('walking'); // 'walking' | 'driving'
  const [loading, setLoading] = useState(false);
  const [mapsData, setMapsData] = useState(initialMapsData);

  const generationRef = useRef(0);
  const abortControllerRef = useRef(null);

  const { enqueue, dismiss } = useStatusQueue();

  const isSuccessTour = Boolean(
    tour &&
    tour.stops &&
    tour.stops.length > 0 &&
    tour.status !== 'no_solution' &&
    tour.status !== 'insufficient_evidence'
  );

  // Reset state when session resets
  useEffect(() => {
    setMapsData(null);
    setMode('walking');
    dismiss('maps_links_error');
  }, [sessionId, sessionEpoch, dismiss]);

  const fetchLinks = useCallback(async (currentMode) => {
    if (!isSuccessTour) {
      setMapsData(null);
      return;
    }

    const currentGen = ++generationRef.current;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    setLoading(true);
    dismiss('maps_links_error');

    try {
      const res = await getMapsLinks(sessionId || 'default', currentMode, sessionToken, {
        signal: abortCtrl.signal,
      });

      // Generation guard: ignore stale responses if another fetch occurred
      if (currentGen !== generationRef.current) {
        return;
      }

      setMapsData(res);
      setLoading(false);
      dismiss('maps_links_error');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (currentGen !== generationRef.current) return;

      setLoading(false);
      setMapsData(null);

      enqueue({
        id: 'maps_links_error',
        type: 'error',
        title: 'Không thể tạo liên kết bản đồ',
        message: err?.message || 'Có lỗi khi lấy đường dẫn Google Maps. Bạn có thể bấm thử lại.',
        action: {
          label: 'Thử lại',
          onClick: () => {
            dismiss('maps_links_error');
            fetchLinks(currentMode);
          },
        },
      });
    }
  }, [isSuccessTour, sessionId, sessionToken, dismiss, enqueue]);

  // Refetch when tour, tour revision, session revision, or mode changes
  useEffect(() => {
    if (!isSuccessTour) {
      setMapsData(null);
      dismiss('maps_links_error');
      return;
    }

    fetchLinks(mode);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isSuccessTour, tour?.revision, revision, mode, fetchLinks, dismiss]);

  // Hide the block completely for non-success tours
  if (!isSuccessTour) {
    return null;
  }

  const stops = tour.stops || [];
  const links = mapsData?.links || [];
  const status = mapsData?.status || 'ok';
  const skipped = mapsData?.skipped || [];
  const effectiveOrigin = originLabel || 'Điểm xuất phát';

  // Helper to format stop name
  const getStopName = (stopOrder) => {
    if (stopOrder === null || stopOrder === undefined || stopOrder === 0) {
      return effectiveOrigin;
    }
    const match = stops.find((s) => s.order === stopOrder);
    return match?.name || `Điểm ${stopOrder}`;
  };

  return (
    <section
      data-maps-links-block
      aria-label="Liên kết Google Maps"
      className={`ft-maps-links-block ${className}`.trim()}
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border, #DFD5C6)',
        borderRadius: 'var(--radius-lg, 12px)',
        padding: '14px 16px',
        marginBottom: '16px',
        boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(31, 27, 22, 0.08))',
        boxSizing: 'border-box',
        width: '100%',
        ...style,
      }}
    >
      {/* Header Row: Title & Segmented Mode Toggle */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '12px',
        }}
      >
        <div>
          <h4
            style={{
              margin: '0 0 2px 0',
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--text, #1F1B16)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🧭</span>
            <span>Mở trên Google Maps</span>
          </h4>
          <p
            style={{
              margin: 0,
              fontSize: '12px',
              color: 'var(--muted, #6B6259)',
            }}
          >
            Chỉ đường miễn phí, mở trực tiếp ứng dụng khi bạn nhấn liên kết.
          </p>
        </div>

        {/* Walking / Driving Segmented Toggle (>= 44px min-height/width touch target) */}
        <div
          role="radiogroup"
          aria-label="Phương thức di chuyển"
          data-testid="maps-mode-toggle"
          style={{
            display: 'inline-flex',
            backgroundColor: '#F5F0EB',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '3px',
            gap: '2px',
            border: '1px solid var(--border, #DFD5C6)',
          }}
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'walking'}
            data-mode="walking"
            data-testid="toggle-walking"
            onClick={() => setMode('walking')}
            style={{
              minHeight: '44px',
              minWidth: '44px',
              padding: '8px 14px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: mode === 'walking' ? 'var(--accent, #E65100)' : 'transparent',
              color: mode === 'walking' ? '#FFFFFF' : 'var(--text, #1F1B16)',
              fontWeight: mode === 'walking' ? 700 : 500,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              boxSizing: 'border-box',
              transition: 'background-color 0.15s ease',
            }}
          >
            <span aria-hidden="true">🚶</span>
            <span>Đi bộ</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'driving'}
            data-mode="driving"
            data-testid="toggle-driving"
            onClick={() => setMode('driving')}
            style={{
              minHeight: '44px',
              minWidth: '44px',
              padding: '8px 14px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: mode === 'driving' ? 'var(--accent, #E65100)' : 'transparent',
              color: mode === 'driving' ? '#FFFFFF' : 'var(--text, #1F1B16)',
              fontWeight: mode === 'driving' ? 700 : 500,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              boxSizing: 'border-box',
              transition: 'background-color 0.15s ease',
            }}
          >
            <span aria-hidden="true">🚗</span>
            <span>Lái xe</span>
          </button>
        </div>
      </div>

      {/* Loading state indicator */}
      {loading && (
        <div
          data-maps-loading
          style={{
            padding: '12px',
            textAlign: 'center',
            fontSize: '13px',
            color: 'var(--muted, #6B6259)',
            backgroundColor: '#FAF7F2',
            borderRadius: '8px',
            marginBottom: '10px',
          }}
        >
          Đang tạo đường dẫn chỉ đường Google Maps...
        </div>
      )}

      {/* Honest partial status banner */}
      {status === 'partial' && (
        <div
          data-maps-status="partial"
          role="status"
          style={{
            padding: '10px 14px',
            backgroundColor: '#FFFBEB',
            border: '1px solid #FDE68A',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#78350F',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            boxSizing: 'border-box',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: '16px' }}>⚠️</span>
          <div>
            <strong>Lịch trình một phần:</strong> Một số quán chưa có toạ độ nên không đưa vào liên kết.
            {skipped.length > 0 && (
              <span style={{ display: 'block', marginTop: '2px', fontSize: '12px', color: '#92400E' }}>
                (Các điểm chưa đủ toạ độ: điểm thứ {skipped.map((s) => s.stop_order).join(', ')})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Honest unavailable status banner */}
      {status === 'unavailable' && (
        <div
          data-maps-status="unavailable"
          role="alert"
          style={{
            padding: '12px 14px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#7F1D1D',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            boxSizing: 'border-box',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: '16px' }}>⛔</span>
          <div>
            <strong>Không thể tạo liên kết bản đồ:</strong> Các quán trong lịch trình chưa có toạ độ hoặc địa chỉ hợp lệ để dẫn đường.
          </div>
        </div>
      )}

      {/* Links Rendering */}
      {!loading && status !== 'unavailable' && links.length === 1 && (
        /* Exactly ONE link: Primary Button / Link */
        <div>
          <a
            href={links[0].url}
            target="_blank"
            rel="noopener noreferrer"
            data-maps-link
            data-primary-maps-link
            className="ft-primary-maps-link"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              minHeight: '44px',
              minWidth: '44px',
              padding: '12px 20px',
              backgroundColor: 'var(--accent, #E65100)',
              color: '#FFFFFF',
              borderRadius: 'var(--radius-md, 8px)',
              fontWeight: 700,
              fontSize: '15px',
              textDecoration: 'none',
              boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(31, 27, 22, 0.08))',
              width: '100%',
              boxSizing: 'border-box',
              textAlign: 'center',
            }}
          >
            <span aria-hidden="true">🗺️</span>
            <span>Xem lịch trình trên Google Maps</span>
          </a>
        </div>
      )}

      {!loading && status !== 'unavailable' && links.length > 1 && (
        /* Multiple Links (n > 1): Ordered List 'Chặng i/n: <from> → <to>' */
        <div
          data-maps-split-links
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            width: '100%',
          }}
        >
          {links.map((link, idx) => {
            const fromName = getStopName(link.from_stop);
            const toName = getStopName(link.to_stop);
            const totalLinks = link.of || links.length;
            const legLabel = `Chặng ${link.index}/${totalLinks}: ${fromName} → ${toName}`;

            return (
              <a
                key={link.index || idx}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                data-maps-link
                data-leg-link={link.index}
                className="ft-leg-maps-link"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  minHeight: '44px',
                  minWidth: '44px',
                  padding: '10px 14px',
                  backgroundColor: '#FFFFFF',
                  color: 'var(--text, #1F1B16)',
                  border: '1px solid var(--border, #DFD5C6)',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <span style={{ flex: 1 }}>{legLabel}</span>
                <span
                  style={{
                    color: 'var(--accent, #E65100)',
                    fontSize: '13px',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  Mở Maps ↗
                </span>
              </a>
            );
          })}
        </div>
      )}

      {/* Disclaimers & Privacy Notes (never claim Google duration/distance) */}
      <div
        data-maps-disclaimer
        style={{
          marginTop: '10px',
          paddingTop: '8px',
          borderTop: '1px dashed var(--border, #DFD5C6)',
          fontSize: '12px',
          lineHeight: 1.4,
          color: 'var(--muted, #6B6259)',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
        }}
      >
        <div>
          🔒 Links contain the origin/venue coordinates or fallback addresses and are sent to Google only when the user opens them.
        </div>
        <div>
          ⏱️ Thứ tự theo gợi ý của ứng dụng; Google có thể hiển thị thời gian khác.
        </div>
      </div>
    </section>
  );
}
