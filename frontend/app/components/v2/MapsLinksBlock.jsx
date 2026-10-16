'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getMapsLinks } from '../../../lib/api';
import { useStatusQueue } from '../../ui/StatusQueue';
import { isValidGoogleMapsDirUrl, translateSkippedReason } from '../../../lib/mapsUrlValidation';

/**
 * Free Google Maps URLs Itinerary Block (Contract v1.7, GMAPS-URL-2).
 *
 * Rules:
 * - Pure public URL scheme (api=1, travelmode=walking|driving, max 3 waypoints, <= 2048 chars).
 * - ZERO Google Maps API / JS / embeds / tiles / keys / billing.
 * - ZERO Google calls from the server, client app, or test suites.
 * - The browser only navigates to Google when the USER explicitly clicks an <a> link.
 * - Strict URL allowlist before rendering ANY anchor: https, exact www.google.com host, no credentials,
 *   default port, /maps/dir/ path. Accepted URLs preserved verbatim; rejected links disclosed.
 * - Segmented walking/driving toggle (default walking, >=44px touch target, full radio keyboard navigation).
 * - Exactly one link: primary button 'Xem lịch trình trên Google Maps'.
 * - n > 1 links: ordered list 'Chặng i/n: <from> → <to>'.
 * - Real <a href target="_blank" rel="noopener noreferrer">.
 * - Status partial/unavailable rendered honestly with server notes and accurate reason translation.
 * - Never claims or implies Google travel times or distances.
 * - Generation and sessionEpoch guards prevent stale responses from overwriting newer mode/revision state.
 * - Errors route through StatusQueue with an accessible Retry button; stable callbacks prevent loops.
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
  const sessionEpochRef = useRef(sessionEpoch);
  sessionEpochRef.current = sessionEpoch;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const walkingBtnRef = useRef(null);
  const drivingBtnRef = useRef(null);

  const { enqueue, dismiss } = useStatusQueue();
  const enqueueRef = useRef(enqueue);
  enqueueRef.current = enqueue;
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  const isSuccessTour = Boolean(
    tour &&
    tour.stops &&
    tour.stops.length > 0 &&
    tour.status !== 'no_solution' &&
    tour.status !== 'insufficient_evidence'
  );

  // Reset state when session resets or epoch changes (stable dependencies: never depends on dismiss callback)
  useEffect(() => {
    generationRef.current++;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMapsData(null);
    setMode('walking');
    dismissRef.current('maps_links_error');
  }, [sessionId, sessionEpoch]);

  const fetchLinks = useCallback(async (currentMode) => {
    if (!isSuccessTour) {
      setMapsData(null);
      return;
    }

    const currentGen = ++generationRef.current;
    const currentEpoch = sessionEpochRef.current;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    setLoading(true);
    dismissRef.current('maps_links_error');

    try {
      const res = await getMapsLinks(sessionId || 'default', currentMode, sessionToken, {
        signal: abortCtrl.signal,
      });

      // Generation and session epoch guard: ignore stale responses if another fetch or reset occurred
      if (currentGen !== generationRef.current || currentEpoch !== sessionEpochRef.current) {
        return;
      }

      setMapsData(res);
      setLoading(false);
      dismissRef.current('maps_links_error');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (currentGen !== generationRef.current || currentEpoch !== sessionEpochRef.current) return;

      setLoading(false);
      setMapsData(null);

      enqueueRef.current({
        id: 'maps_links_error',
        type: 'error',
        title: 'Không thể tạo liên kết bản đồ',
        message: err?.message || 'Có lỗi khi lấy đường dẫn Google Maps. Bạn có thể bấm thử lại.',
        action: {
          label: 'Thử lại',
          onClick: () => {
            dismissRef.current('maps_links_error');
            fetchLinks(modeRef.current);
          },
        },
      });
    }
  }, [isSuccessTour, sessionId, sessionToken]);

  // Refetch when tour revision, session revision, mode, or sessionEpoch changes
  useEffect(() => {
    if (!isSuccessTour) {
      setMapsData(null);
      dismissRef.current('maps_links_error');
      return;
    }

    fetchLinks(mode);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isSuccessTour, tour?.revision, revision, mode, sessionEpoch, fetchLinks]);

  // Handle radio group keyboard navigation (ArrowLeft, ArrowRight, ArrowUp, ArrowDown)
  const handleToggleKeyDown = (e, targetMode) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      setMode('driving');
      drivingBtnRef.current?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      setMode('walking');
      walkingBtnRef.current?.focus();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setMode(targetMode);
    }
  };

  // Hide the block completely for non-success tours
  if (!isSuccessTour) {
    return null;
  }

  const stops = tour.stops || [];
  const rawLinks = Array.isArray(mapsData?.links) ? mapsData.links : [];

  // Strict URL allowlist before rendering ANY anchor:
  // Must be https:, hostname exactly www.google.com, no credentials, default port, pathname starting with /maps/dir/
  const validLinks = rawLinks.filter((link) => link && isValidGoogleMapsDirUrl(link.url));
  const rejectedCount = rawLinks.length - validLinks.length;
  const isAllRejected = rawLinks.length > 0 && validLinks.length === 0;

  // If all links were rejected as unsafe, treat the block as unavailable
  const effectiveStatus = isAllRejected ? 'unavailable' : (mapsData?.status || 'ok');

  const skipped = mapsData?.skipped || [];
  const serverNotes = Array.isArray(mapsData?.notes) ? mapsData.notes : [];
  const effectiveOrigin = originLabel || 'Điểm xuất phát';

  // Helper to format stop name
  const getStopName = (stopOrder) => {
    if (stopOrder === null || stopOrder === undefined || stopOrder === 0) {
      return effectiveOrigin;
    }
    const match = stops.find((s) => s.order === stopOrder);
    return match?.name || `Điểm ${stopOrder}`;
  };

  const allNoUsablePoint = skipped.length > 0 && skipped.every((s) => s.reason === 'no_usable_point');
  const allUrlTooLong = skipped.length > 0 && skipped.every((s) => s.reason === 'url_too_long');

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

        {/* Walking / Driving Segmented Toggle (>= 44px min-height/width touch target & WAI-ARIA Radio Group pattern) */}
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
            ref={walkingBtnRef}
            type="button"
            role="radio"
            aria-checked={mode === 'walking'}
            tabIndex={mode === 'walking' ? 0 : -1}
            data-mode="walking"
            data-testid="toggle-walking"
            onClick={() => setMode('walking')}
            onKeyDown={(e) => handleToggleKeyDown(e, 'walking')}
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
              outline: 'none',
            }}
          >
            <span aria-hidden="true">🚶</span>
            <span>Đi bộ</span>
          </button>
          <button
            ref={drivingBtnRef}
            type="button"
            role="radio"
            aria-checked={mode === 'driving'}
            tabIndex={mode === 'driving' ? 0 : -1}
            data-mode="driving"
            data-testid="toggle-driving"
            onClick={() => setMode('driving')}
            onKeyDown={(e) => handleToggleKeyDown(e, 'driving')}
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
              outline: 'none',
            }}
          >
            <span aria-hidden="true">🚗</span>
            <span>Lái xe</span>
          </button>
        </div>
      </div>

      {/* Rejected links disclosure (Contract v1.7, GMAPS-URL-2) */}
      {rejectedCount > 0 && (
        <div
          data-maps-rejected-disclosure
          role="status"
          style={{
            padding: '8px 12px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#991B1B',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxSizing: 'border-box',
          }}
        >
          <span aria-hidden="true">⚠️</span>
          <span>Một liên kết không hợp lệ đã bị bỏ qua</span>
        </div>
      )}

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
      {effectiveStatus === 'partial' && (
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
          <div style={{ flex: 1 }}>
            <div>
              <strong>Lịch trình một phần:</strong>{' '}
              {allUrlTooLong
                ? 'Độ dài liên kết vượt quá giới hạn của Google Maps nên một số chặng không thể đưa vào chỉ đường.'
                : allNoUsablePoint
                ? 'Một số quán chưa có toạ độ nên không đưa vào liên kết.'
                : 'Một số chặng không thể đưa vào liên kết do thiếu toạ độ/địa chỉ hoặc vượt quá độ dài liên kết.'}
            </div>
            {skipped.length > 0 && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#92400E' }}>
                {skipped.map((s, idx) => {
                  const stopName = getStopName(s.stop_order);
                  const reasonText = translateSkippedReason(s.reason);
                  return (
                    <div key={s.stop_order || idx} data-maps-skipped-item>
                      • Điểm {s.stop_order} ({stopName}): {reasonText}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Honest unavailable status banner */}
      {effectiveStatus === 'unavailable' && (
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
          <div style={{ flex: 1 }}>
            <div>
              <strong>Không thể tạo liên kết bản đồ:</strong>{' '}
              {isAllRejected
                ? 'Tất cả các liên kết được tạo đều không vượt qua bước kiểm tra an toàn URL.'
                : allUrlTooLong
                ? 'Lịch trình vượt quá giới hạn độ dài liên kết của Google Maps.'
                : allNoUsablePoint
                ? 'Các quán trong lịch trình chưa có toạ độ hoặc địa chỉ hợp lệ để dẫn đường.'
                : 'Không thể tạo đường dẫn cho các điểm trong lịch trình (do thiếu toạ độ/địa chỉ hoặc độ dài liên kết vượt quá giới hạn).'}
            </div>
            {skipped.length > 0 && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#991B1B' }}>
                {skipped.map((s, idx) => {
                  const stopName = getStopName(s.stop_order);
                  const reasonText = translateSkippedReason(s.reason);
                  return (
                    <div key={s.stop_order || idx} data-maps-skipped-item>
                      • Điểm {s.stop_order} ({stopName}): {reasonText}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Server notes (Contract v1.7) - rendered as escaped text */}
      {serverNotes.length > 0 && (
        <div
          data-maps-server-notes
          style={{
            marginBottom: '10px',
            padding: '8px 12px',
            backgroundColor: '#FAF7F2',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'var(--muted, #6B6259)',
            border: '1px solid var(--border, #DFD5C6)',
            boxSizing: 'border-box',
          }}
        >
          {serverNotes.map((note, idx) => (
            <div key={idx} data-maps-note style={{ marginBottom: idx < serverNotes.length - 1 ? '4px' : 0 }}>
              ℹ️ {String(note)}
            </div>
          ))}
        </div>
      )}

      {/* Links Rendering - only valid accepted links rendered verbatim */}
      {!loading && effectiveStatus !== 'unavailable' && validLinks.length === 1 && (
        /* Exactly ONE link: Primary Button / Link */
        <div>
          <a
            href={validLinks[0].url}
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

      {!loading && effectiveStatus !== 'unavailable' && validLinks.length > 1 && (
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
          {validLinks.map((link, idx) => {
            const fromName = getStopName(link.from_stop);
            const toName = getStopName(link.to_stop);
            const totalLinks = link.of || validLinks.length;
            const legLabel = `Chặng ${link.index || idx + 1}/${totalLinks}: ${fromName} → ${toName}`;

            return (
              <a
                key={link.index || idx}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                data-maps-link
                data-leg-link={link.index || idx + 1}
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
