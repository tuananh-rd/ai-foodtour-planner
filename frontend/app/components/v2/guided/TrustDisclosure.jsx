'use client';

import React, { useState, useEffect, useRef } from 'react';

/**
 * TrustDisclosure
 * Exactly ONE quiet line under stream:
 * "Dữ liệu quán từ Foody • giờ & giá theo nguồn ghi • khoảng cách ước tính" + "Chi tiết"
 * Opens a calm disclosure modal with focus management (Q07) and AI/Google Maps transparency (Q05).
 */
export default function TrustDisclosure({ turn, health }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);

  const handleOpen = () => {
    triggerRef.current = document.activeElement;
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        triggerRef.current.focus();
      }
    }, 10);
  };

  // Background inertness (NFE-04)
  useEffect(() => {
    if (!isOpen) return;
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

  // Focus trap and Escape management (Q07)
  useEffect(() => {
    if (!isOpen) return;

    // Focus close button initially
    const timer = setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 20);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
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

        if (e.shiftKey) {
          if (active === first || !inside) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last || !inside) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Translate understanding parser mode
  const understandingMode = turn?.understanding === 'llm'
    ? 'Trợ lý ngôn ngữ nâng cao'
    : 'Quy tắc ngữ nghĩa trực tiếp';

  // Translate llm_budget status
  let budgetStatus = 'Đang dùng gói thường';
  const remaining = turn?.llm_budget?.daily_remaining_public;
  if (remaining === 'exhausted') {
    budgetStatus = 'Đang đọc theo cách đơn giản';
  } else if (remaining === 'low') {
    budgetStatus = 'Sắp hết lượt ưu tiên';
  } else if (remaining === 'unavailable') {
    budgetStatus = 'Đang đọc theo cách đơn giản';
  }

  return (
    <div style={{ marginTop: 12 }}>
      {/* Exactly ONE quiet line under stream */}
      <div
        data-testid="trust-line"
        style={{
          fontSize: 12,
          color: 'var(--mute, #6b6257)',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexWrap: 'wrap',
          lineHeight: 1.5
        }}
      >
        <span>Dữ liệu quán địa phương • Giờ & giá theo nguồn ghi • Khoảng cách ước tính</span>
        <button
          type="button"
          data-testid="trust-disclosure-btn"
          onClick={handleOpen}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent, #c2410c)',
            textDecoration: 'underline',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            padding: '2px 4px'
          }}
        >
          Chi tiết
        </button>
      </div>

      {/* Calm Modal / Drawer with accessible focus management (Q07) */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="trust-modal-title"
          data-testid="trust-disclosure-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            style={{
              background: '#fff',
              borderRadius: 16,
              maxWidth: 500,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 22,
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)',
              display: 'grid',
              gap: 14,
              color: 'var(--ink, #231f1a)',
              fontSize: 14,
              outline: 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4
                id="trust-modal-title"
                style={{ margin: 0, fontSize: 16, fontWeight: 700 }}
              >
                Chi tiết xử lý & dữ liệu
              </h4>
              <button
                ref={closeBtnRef}
                type="button"
                data-testid="trust-disclosure-close"
                onClick={handleClose}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 20,
                  cursor: 'pointer',
                  color: 'var(--mute, #6b6257)',
                  padding: '4px 8px',
                  lineHeight: 1
                }}
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gap: 10, lineHeight: 1.5 }}>
              <div>
                <b>Cách hiểu yêu cầu:</b> {understandingMode}
              </div>
              <div>
                <b>Trạng thái xử lý:</b> {budgetStatus}
              </div>
              <div>
                <b>Trí tuệ nhân tạo (AI):</b> Khi cần hiểu các yêu cầu phức tạp, văn bản yêu cầu của bạn có thể được gửi ẩn danh đến mô hình Google Gemini để nhận diện các tiêu chí tour (khu vực, thời gian, khẩu vị). Không liên kết danh tính người dùng.
              </div>
              <div>
                <b>Lưu trữ phiên:</b> Lịch sử đối thoại và các tiêu chí đã chọn chỉ được lưu tạm thời theo phiên làm việc ẩn danh để phục vụ xếp lịch trình, không lưu trữ lịch sử cá nhân lâu dài và có thể đặt lại bất cứ lúc nào qua nút &quot;Làm lại&quot;.
              </div>
              <div>
                <b>Nguồn dữ liệu:</b> {health?.dataset ? `Dữ liệu ẩm thực (${health.dataset})` : 'Dữ liệu địa điểm ẩm thực Hà Nội (thử nghiệm cục bộ)'}
              </div>
              <div>
                <b>Giờ mở cửa & giá:</b> Theo nguồn ghi nhận ban đầu, chưa qua kiểm chứng thực tế tại quán
              </div>
              <div>
                <b>Khoảng cách:</b> Ước tính khoảng cách đi bộ đường chim bay
              </div>
              <div>
                <b>Chỉ đường Google Maps:</b> Khi bấm mở lộ trình, ứng dụng tạo liên kết HTTPS chứa toạ độ các quán để mở trên Google Maps. Google Maps tính toán lại tuyến đường và thời gian thực tế độc lập với ứng dụng.
              </div>
              <div
                style={{
                  background: 'var(--warnbg, #fef3c7)',
                  color: 'var(--warn, #92400e)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13
                }}
              >
                Lưu ý an toàn: Dữ liệu không có thông tin nguyên liệu thành phần; chưa quán nào được xác nhận an toàn dị ứng.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                type="button"
                onClick={handleClose}
                style={{
                  padding: '8px 18px',
                  borderRadius: 10,
                  border: '1px solid var(--line, #e6dfd3)',
                  background: 'var(--chip, #f3ece0)',
                  color: 'var(--ink, #231f1a)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: 44
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
