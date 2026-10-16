'use client';

import React from 'react';
import ItineraryView from '../ItineraryView';
import MapsLinksBlock from '../MapsLinksBlock';
import EvidenceStrip from '../EvidenceStrip';

/**
 * Formats a number to Vietnamese Dong string (e.g. 35.000 ₫)
 */
function formatVnd(val) {
  if (val === null || val === undefined) return 'chưa rõ';
  return Number(val).toLocaleString('vi-VN') + ' ₫';
}

/**
 * Escapes / ensures safe string rendering (no raw HTML injection)
 */
function SafeText({ text, className = '', style = {} }) {
  if (!text) return null;
  return (
    <span
      className={className}
      dir="auto"
      style={{
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
        unicodeBidi: 'plaintext',
        ...style,
      }}
    >
      {String(text)}
    </span>
  );
}

/**
 * BlockRenderer:
 * Renders structured blocks from contract v1.8 (TASK C3-1).
 * Unknown block types are gracefully ignored.
 * Never uses innerHTML / dangerouslySetInnerHTML.
 */
export default function BlockRenderer({
  block,
  onAction,
  shortlist = [],
  allergies = [],
  tour = null,
  sessionId = null,
  sessionToken = '',
  busy = false,
  isNew = false,
}) {
  if (!block || !block.type) return null;

  switch (block.type) {
    case 'text': {
      return (
        <div
          data-testid="block-text"
          style={{
            lineHeight: 1.6,
            fontSize: 14,
            color: '#1F1B16',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            marginBottom: 8,
          }}
        >
          <SafeText text={block.text} />
        </div>
      );
    }

    case 'notice': {
      const isSafety = block.level === 'safety';
      const isWarning = block.level === 'warning';

      let bg = '#EFF6FF';
      let border = '#BFDBFE';
      let textCol = '#1E3A8A';
      let icon = 'ℹ️';

      if (isSafety) {
        bg = '#FEF2F2';
        border = '#F87171';
        textCol = '#991B1B';
        icon = '🛡️';
      } else if (isWarning) {
        bg = '#FFFBEB';
        border = '#FDE68A';
        textCol = '#92400E';
        icon = '⚠️';
      }

      return (
        <div
          data-testid={block.code === 'outside_hanoi' ? 'outside-hanoi-notice' : (isSafety ? 'notice-safety' : `notice-${block.level || 'info'}`)}
          data-notice-code={block.code}
          className={isSafety ? 'notice-safety' : ''}
          role={isNew && isSafety ? 'alert' : 'status'}
          style={{
            background: bg,
            border: `1px solid ${border}`,
            borderLeft: `4px solid ${isSafety ? '#DC2626' : isWarning ? '#D97706' : '#2563EB'}`,
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 10,
            fontSize: 13,
            color: textCol,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 16 }}>{icon}</span>
          <div style={{ flex: 1, wordBreak: 'break-word' }}>
            <SafeText text={block.text} />
          </div>
        </div>
      );
    }

    case 'dish_suggestions': {
      const items = block.items || [];
      return (
        <div
          data-testid="dish-suggestions-block"
          style={{
            background: '#FFFFFF',
            border: '1px solid #DFD5C6',
            borderRadius: 12,
            padding: 14,
            marginBottom: 12,
          }}
        >
          {items.map((item, idx) => {
            const hasCount = item.venue_count !== null && item.venue_count !== undefined;
            return (
              <div
                key={idx}
                style={{
                  borderBottom: idx < items.length - 1 ? '1px solid #F0EAE1' : 'none',
                  paddingBottom: idx < items.length - 1 ? 10 : 0,
                  marginBottom: idx < items.length - 1 ? 10 : 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <strong style={{ fontSize: 14, color: '#C8431A' }}>
                    <SafeText text={item.dish_group} />
                  </strong>
                  <span
                    style={{
                      fontSize: 11,
                      background: '#F0EAE1',
                      color: '#6B6259',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    kiến thức chung
                  </span>
                </div>
                <p style={{ margin: '0 0 6px', fontSize: 13, color: '#1F1B16' }}>
                  <SafeText text={item.blurb} />
                </p>
                {hasCount && (
                  <div style={{ fontSize: 12, color: '#6B6259' }}>
                    📍 {item.venue_count} quán trong {item.radius_m || 1500} m
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    case 'venue_cards': {
      const cards = block.cards || [];
      return (
        <div data-testid="venue-cards-block" style={{ marginBottom: 16 }}>
          {block.title && (
            <h4 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#1F1B16' }}>
              <SafeText text={block.title} />
            </h4>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cards.map((card, idx) => {
              const v = card.venue || {};
              const inShortlist = shortlist.some((s) => s.venue_id === v.id);

              // 1. Price is RANGE 'khoảng giá quán', NEVER per-person
              let priceText = 'Khoảng giá quán: chưa rõ';
              if (v.price && (v.price.min_vnd || v.price.max_vnd)) {
                priceText = `Khoảng giá quán: ${formatVnd(v.price.min_vnd)} – ${formatVnd(v.price.max_vnd)}`;
              }

              // 2. Hours chip 'Giờ: chưa rõ' / 'nguồn ghi …', NEVER 'đang mở'
              let hoursText = 'Giờ: chưa rõ';
              if (v.hours?.display) {
                hoursText = `nguồn ghi ${v.hours.display}, chưa rõ áp dụng ngày nào`;
              }

              // 3. Rating line only count >= 5 and 'theo nguồn', else 'ít đánh giá'
              let ratingText = 'ít đánh giá';
              if (v.rating && v.rating.count >= 5 && v.rating.value !== null) {
                ratingText = `⭐ ${v.rating.value} (${v.rating.count} đánh giá, theo nguồn)`;
              }

              // 4. Distance 'cách ~N m (ước tính)'
              let distText = null;
              if (card.distance_m !== null && card.distance_m !== undefined) {
                distText = `cách ~${card.distance_m} m (ước tính)`;
              }

              // 5. Flags (allergy_unknown banner)
              const hasAllergyUnknown = (card.flags || []).some((f) => f.code === 'allergy_unknown') || (allergies && allergies.length > 0);

              return (
                <div
                  key={v.id || idx}
                  data-testid="venue-card"
                  style={{
                    background: '#FFFFFF',
                    border: inShortlist ? '2px solid #C8431A' : '1px solid #DFD5C6',
                    borderRadius: 12,
                    padding: 14,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  {/* Header: Label badge + Name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span
                      data-testid="card-label-badge"
                      style={{
                        background: '#C8431A',
                        color: '#FFFFFF',
                        fontWeight: 700,
                        fontSize: 12,
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {card.label || String.fromCharCode(65 + idx)}
                    </span>
                    <strong style={{ fontSize: 15, color: '#1F1B16', flex: 1 }}>
                      <SafeText text={v.name} />
                    </strong>
                    {inShortlist && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          background: '#EAF7EC',
                          color: '#195624',
                          border: '1px solid #9ED4A7',
                          padding: '2px 8px',
                          borderRadius: 6,
                        }}
                      >
                        Đã thêm
                      </span>
                    )}
                  </div>

                  {/* Location & District */}
                  <div style={{ fontSize: 13, color: '#6B6259', marginBottom: 8 }}>
                    <SafeText text={v.district} />
                    {v.address ? ` · ${v.address}` : ''}
                    {distText && ` · ${distText}`}
                  </div>

                  {/* Chips: Price Range, Hours, Rating */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    <span
                      style={{
                        fontSize: 12,
                        background: '#FFF6E0',
                        color: '#6E4300',
                        border: '1px solid #FFD480',
                        padding: '3px 8px',
                        borderRadius: 6,
                      }}
                    >
                      {priceText}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        background: '#EFECE6',
                        color: '#413C36',
                        border: '1px solid #C8C1B7',
                        padding: '3px 8px',
                        borderRadius: 6,
                      }}
                    >
                      {hoursText}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        background: '#F0EAE1',
                        color: '#1F1B16',
                        padding: '3px 8px',
                        borderRadius: 6,
                      }}
                    >
                      {ratingText}
                    </span>
                  </div>

                  {/* Why Chips */}
                  {card.why && card.why.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                      {card.why.map((w, wIdx) => (
                        <span
                          key={wIdx}
                          style={{
                            fontSize: 11,
                            background: '#FBF8F3',
                            border: '1px solid #DFD5C6',
                            color: '#6B6259',
                            padding: '2px 6px',
                            borderRadius: 4,
                          }}
                        >
                          <SafeText text={w.text} />
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Allergy Unknown Banner */}
                  {hasAllergyUnknown && (
                    <div
                      style={{
                        background: '#FFFBEB',
                        border: '1px solid #FDE68A',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 12,
                        color: '#92400E',
                        marginBottom: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span>⚠️</span>
                      <strong>Chưa đủ thông tin về dị ứng</strong>
                    </div>
                  )}

                  {/* Action Buttons (Touch targets >= 44px) */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button
                      type="button"
                      disabled={busy || inShortlist}
                      onClick={() => onAction && onAction({ type: 'add', venue_id: v.id })}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: 'none',
                        background: inShortlist ? '#E5E7EB' : '#C8431A',
                        color: inShortlist ? '#4B5563' : '#FFFFFF',
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: inShortlist || busy ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {inShortlist ? 'Đã thêm' : 'Thêm vào food tour'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onAction && onAction({ type: 'compare', venue_ids: [v.id] })}
                      style={{
                        minHeight: 44,
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: '1px solid #DFD5C6',
                        background: '#FFFFFF',
                        color: '#1F1B16',
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: busy ? 'not-allowed' : 'pointer',
                      }}
                    >
                      So sánh
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    case 'compare_table': {
      const criteria = block.criteria || [];
      const columns = block.columns || [];
      const rows = block.rows || [];
      const unsupported = block.unsupported || [];

      return (
        <div
          data-testid="compare-table"
          style={{
            background: '#FFFFFF',
            border: '1px solid #DFD5C6',
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
            overflowX: 'auto',
          }}
        >
          <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#1F1B16' }}>
            Bảng so sánh quán
          </h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #DFD5C6', textAlign: 'left' }}>
                <th style={{ padding: '8px 6px', color: '#6B6259', fontWeight: 600 }}>Tiêu chí</th>
                {columns.map((col, idx) => (
                  <th key={col.venue_id || idx} style={{ padding: '8px 6px', color: '#C8431A', fontWeight: 700 }}>
                    {col.label ? `${col.label}. ` : ''}
                    <SafeText text={col.name} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => {
                const crit = criteria.find((c) => c.id === row.criterion_id) || { label: row.criterion_id };
                return (
                  <tr key={row.criterion_id || rIdx} style={{ borderBottom: '1px solid #F0EAE1' }}>
                    <td style={{ padding: '8px 6px', fontWeight: 600, color: '#1F1B16' }}>
                      <SafeText text={crit.label} />
                    </td>
                    {(row.cells || []).map((cell, cIdx) => {
                      const displayVal = cell.value || 'Chưa rõ';
                      const noteText = cell.note ? ` (${cell.note})` : (cell.status === 'estimate' ? ' (ước tính)' : cell.status === 'source' ? ' (theo nguồn)' : '');
                      return (
                        <td key={cIdx} style={{ padding: '8px 6px', color: cell.value ? '#1F1B16' : '#6B6259' }}>
                          <SafeText text={displayVal} />
                          {noteText && (
                            <span style={{ fontSize: 11, color: '#8C827A' }}>
                              <SafeText text={noteText} />
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {unsupported.length > 0 && (
            <div data-testid="unsupported-criteria-notice" style={{ marginTop: 12, padding: '8px 10px', background: '#FBF8F3', borderRadius: 6, fontSize: 12, color: '#6B6259' }}>
              <strong>Tiêu chí chưa có dữ liệu:</strong>{' '}
              {unsupported.map((u) => u.text || u.criterion).join(', ')}
            </div>
          )}
        </div>
      );
    }

    case 'clarify': {
      const options = block.options || [];
      return (
        <div
          data-testid="clarify-block"
          style={{
            background: '#FBF8F3',
            border: '1px solid #DFD5C6',
            borderRadius: 12,
            padding: 14,
            marginBottom: 12,
          }}
        >
          {block.question && (
            <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: '#1F1B16' }}>
              <SafeText text={block.question} />
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {options.map((opt, idx) => (
              <button
                key={opt.option_id || idx}
                type="button"
                data-testid={`clarify-option-${opt.option_id}`}
                disabled={busy}
                onClick={() => onAction && onAction({ type: 'pick_option', option_id: opt.option_id })}
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid #C8431A',
                  background: '#FFFFFF',
                  color: '#C8431A',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}
              >
                <SafeText text={opt.label} />
              </button>
            ))}
          </div>
        </div>
      );
    }

    case 'confirm_summary': {
      const items = block.items || [];
      const warnings = block.warnings || [];
      const shortlistItems = block.shortlist || [];

      return (
        <div
          data-testid="confirm-summary"
          style={{
            background: '#FFFFFF',
            border: '2px solid #C8431A',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <h4 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, color: '#1F1B16' }}>
            📋 Bản xác nhận thông tin lịch trình
          </h4>

          {/* Profile fields summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {items.map((it, idx) => {
              const isMissing = it.status === 'missing' || !it.value;
              return (
                <div key={it.id || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#6B6259' }}>
                    <SafeText text={it.label} />:
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <strong style={{ color: isMissing ? '#991B1B' : '#1F1B16' }}>
                      <SafeText text={isMissing ? 'Thiếu' : it.value} />
                    </strong>
                    {isMissing && (
                      <span
                        data-status="missing"
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          background: '#FEE2E2',
                          color: '#991B1B',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}
                      >
                        Thiếu
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Shortlist summary */}
          {shortlistItems.length > 0 && (
            <div style={{ marginBottom: 12, borderTop: '1px solid #F0EAE1', paddingTop: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6B6259', display: 'block', marginBottom: 4 }}>
                Các quán đã chọn ({shortlistItems.length}):
              </span>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#1F1B16' }}>
                {shortlistItems.map((s, sIdx) => (
                  <li key={s.venue_id || sIdx}>
                    <SafeText text={s.name || s.venue_id} />
                    {s.status === 'kept' ? ' (Đã giữ)' : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
              {warnings.map((w, wIdx) => (
                <div key={w.code || wIdx} style={{ fontSize: 12, color: '#92400E' }}>
                  ⚠️ <SafeText text={w.text} />
                </div>
              ))}
            </div>
          )}

          {/* Action Buttons >= 44px */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              disabled={busy}
              data-testid="btn-confirm-yes"
              onClick={() => onAction && onAction({ type: 'confirm_yes' })}
              style={{
                flex: 1,
                minHeight: 44,
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#C8431A',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: 14,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              Xác nhận và tạo lịch trình
            </button>
            <button
              type="button"
              disabled={busy}
              data-testid="btn-confirm-no"
              onClick={() => onAction && onAction({ type: 'confirm_no' })}
              style={{
                minHeight: 44,
                padding: '10px 16px',
                borderRadius: 8,
                border: '1px solid #DFD5C6',
                background: '#FFFFFF',
                color: '#1F1B16',
                fontWeight: 600,
                fontSize: 14,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              Sửa thông tin
            </button>
          </div>
        </div>
      );
    }

    case 'tour_ready': {
      if (!tour) return null;
      return (
        <div data-testid="tour-ready-block" style={{ marginBottom: 20 }}>
          <div data-testid="itinerary-view">
            <ItineraryView
              tour={tour}
              sessionId={sessionId}
              sessionToken={sessionToken}
              highlightedStopId={null}
              onSelectStop={() => {}}
              onInitiateReplace={(stop) => {
                if (onAction) {
                  onAction({
                    type: 'replace_stop',
                    venue_id: stop?.venue_id,
                    order: stop?.order,
                    text: `đổi quán thứ ${stop?.order || 1}`,
                  });
                }
              }}
              busy={busy}
            />
          </div>
        </div>
      );
    }

    default:
      // Unknown block types must be safely ignored per contract v1.8
      return null;
  }
}
