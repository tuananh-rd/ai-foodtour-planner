'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function ReplaceDiffModal({
  isOpen,
  oldStop,
  resultDiff = null,
  lockedStops = [],
  onConfirm,
  onCancel,
  busy = false
}) {
  const confirmBtnRef = useRef(null);
  const dialogRef = useRef(null);
  const invokerRef = useRef(null);

  // Background inertness (NFE-04)
  useEffect(() => {
    if (!isOpen) return;
    invokerRef.current = document.activeElement;
    const container = document.querySelector('[data-testid="guided-container"]') || document.querySelector('main');
    if (container) {
      container.setAttribute('aria-hidden', 'true');
      try { container.inert = true; } catch (_) {}
    }
    return () => {
      if (container) {
        container.removeAttribute('aria-hidden');
        try { container.inert = false; } catch (_) {}
      }
    };
  }, [isOpen]);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !busy) {
        onCancel();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      if (busy) {
        // Controls are disabled while busy: keep focus on the dialog itself, never on BODY/background.
        e.preventDefault();
        dialogRef.current.focus();
        return;
      }
      // Focus trap: Tab / Shift+Tab cycle inside the dialog only.
      const focusable = Array.from(
        dialogRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = dialogRef.current.contains(active);
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, busy, onCancel]);

  useEffect(() => {
    // The focused action becomes disabled when busy starts, which drops focus to BODY after this
    // effect; move focus to the dialog now and again on the next frame.
    if (!isOpen || !busy || !dialogRef.current) return undefined;
    dialogRef.current.focus();
    const raf = requestAnimationFrame(() => {
      if (dialogRef.current && document.activeElement !== dialogRef.current) dialogRef.current.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen, busy]);

  // Restore focus to the invoking control when the dialog closes.
  useEffect(() => {
    if (!isOpen) return undefined;
    const invoker = invokerRef.current || document.activeElement;
    return () => {
      if (invoker && typeof invoker.focus === 'function' && document.contains(invoker)) {
        invoker.focus();
        return;
      }
      // Invoker is gone (the stop was replaced): land on the tour region so keyboard users keep context.
      const fallback = document.querySelector('[data-focus-fallback]') || document.querySelector('main, [role="main"]');
      if (fallback) {
        if (!fallback.hasAttribute('tabindex')) fallback.setAttribute('tabindex', '-1');
        fallback.focus();
      }
    };
  }, [isOpen]);

  // Focus primary button when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);
    }
  }, [isOpen, resultDiff]);

  if (!isOpen || !oldStop) return null;

  const isCompleted = Boolean(resultDiff && resultDiff.newStop);

  const formatPrice = (priceObj) => {
    if (!priceObj || (priceObj.min_vnd == null && priceObj.max_vnd == null)) {
      return 'Chưa rõ khoảng giá';
    }
    const min = priceObj.min_vnd != null ? priceObj.min_vnd.toLocaleString('vi-VN') : '?';
    const max = priceObj.max_vnd != null ? priceObj.max_vnd.toLocaleString('vi-VN') : '?';
    const verifiedPerPerson = priceObj.semantics === 'per_person' && priceObj.evidence === 'verified';
    return `${min}–${max} ₫ (${verifiedPerPerson ? 'giá theo người, đã xác minh' : 'khoảng giá quán'})`;
  };

  const oldPriceDiff = oldStop.price?.max_vnd || 0;
  const newPriceDiff = resultDiff?.newStop?.price?.max_vnd || 0;
  const priceDiff = newPriceDiff - oldPriceDiff;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
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
            {isCompleted ? `Đã Đổi Xong Điểm Dừng #${oldStop.order}` : `Xác nhận Đổi Điểm Dừng #${oldStop.order}`}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Đóng hộp thoại"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 20,
              cursor: busy ? 'not-allowed' : 'pointer',
              color: '#888',
              padding: '4px 8px'
            }}
          >
            ×
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
          <strong>Cơ chế Khóa hành trình (Tour Locking):</strong>
          <p style={{ marginTop: 2, marginBottom: 0 }}>
            Chỉ đổi quán tại điểm dừng #{oldStop.order}; giữ nguyên các quán khác và thứ tự của chúng. Thời gian và chặng đi ước tính sẽ được tính lại.
          </p>
        </div>

        {!isCompleted ? (
          /* Neutral Confirmation - No Fabricated Preview */
          <div>
            <div
              style={{
                background: '#fff1f0',
                border: '1px solid #ffa39e',
                borderRadius: 12,
                padding: 14,
                fontSize: 13,
                marginBottom: 16
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: '#cf1322', textTransform: 'uppercase' }}>
                Quán hiện tại cần thay
              </span>
              <h4 style={{ fontSize: 15, fontWeight: 700, marginTop: 4, marginBottom: 4, color: '#cf1322' }}>
                {oldStop.name}
              </h4>
              <p style={{ fontSize: 12, color: '#8c161d', margin: '2px 0 6px' }}>{oldStop.address || oldStop.district}</p>
              <div style={{ fontSize: 12, color: '#595959' }}>
                {formatPrice(oldStop.price)}
              </div>
            </div>

            <div
              style={{
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                borderRadius: 12,
                padding: 14,
                fontSize: 13,
                marginBottom: 18,
                color: '#237804'
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                Lựa chọn từ Máy chủ (Server-selected):
              </div>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
                Quán thay thế sẽ do máy chủ tính toán tự động dựa trên ngân sách, sở thích ẩm thực và cự ly đi bộ khả thi của bạn. Hệ thống cam kết không hiển thị quán suy đoán giả lập trước khi máy chủ xác nhận.
              </p>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                data-testid="replace-modal-cancel-btn"
                onClick={onCancel}
                disabled={busy}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid #d9d9d9',
                  background: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer'
                }}
              >
                Giữ quán cũ
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                data-testid="replace-modal-confirm-btn"
                onClick={(e) => { dialogRef.current?.focus(); onConfirm(e); }}
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
                {busy ? 'Đang tìm quán thay thế…' : 'Thay quán này'}
              </button>
            </div>
          </div>
        ) : (
          /* Server Confirmed Before/After Diff */
          <div>
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
                  Quán trước đây
                </span>
                <h4 style={{ fontSize: 14, fontWeight: 700, marginTop: 4, marginBottom: 4, color: '#cf1322' }}>
                  {resultDiff.oldStop.name}
                </h4>
                <p style={{ fontSize: 11, color: '#8c161d', margin: '2px 0 6px' }}>{resultDiff.oldStop.address || resultDiff.oldStop.district}</p>
                <div style={{ fontSize: 11, color: '#595959' }}>
                  {formatPrice(resultDiff.oldStop.price)}
                </div>
              </div>

              {/* Server selected new stop */}
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
                  Quán mới (Máy chủ chọn)
                </span>
                <h4 style={{ fontSize: 14, fontWeight: 700, marginTop: 4, marginBottom: 4, color: '#389e0d' }}>
                  {resultDiff.newStop.name}
                </h4>
                <p style={{ fontSize: 11, color: '#237804', margin: '2px 0 6px' }}>{resultDiff.newStop.address || resultDiff.newStop.district}</p>
                <div style={{ fontSize: 11, color: '#595959' }}>
                  {formatPrice(resultDiff.newStop.price)}
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div style={{ background: '#fafafa', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Chênh lệch trần giá quán:</span>
                <strong style={{ color: priceDiff > 0 ? '#d4380d' : priceDiff < 0 ? '#389e0d' : '#595959' }}>
                  {priceDiff > 0 ? `+${priceDiff.toLocaleString('vi-VN')} ₫` : `${priceDiff.toLocaleString('vi-VN')} ₫`}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Trạng thái lộ trình:</span>
                <span style={{ color: '#2e7d32', fontWeight: 600 }}>Đã cập nhật từ máy chủ</span>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                ref={confirmBtnRef}
                type="button"
                data-testid="replace-modal-done-btn"
                onClick={onCancel}
                style={{
                  padding: '10px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--accent-primary)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Hoàn tất & xem lịch trình
              </button>
            </div>
          </div>
        )}
      </div>
    </div>, document.body
  );
}
