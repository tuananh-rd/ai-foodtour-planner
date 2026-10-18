'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './guided-leaves.css';

/**
 * TrustDisclosure
 * Exactly ONE quiet line under composer conforming to SVG fidelity spec (owner: Antigravity):
 * "Dữ liệu quán địa phương • Giờ & giá theo nguồn ghi • Khoảng cách ước tính" + "Chi tiết"
 * Modal uses token host class .nn-dialog for styling outside .nn-root.
 * Retains focus trap, background inertness, and all disclosures.
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
    ? 'Có hỗ trợ của Gemini trong lượt này'
    : 'Đọc yêu cầu theo quy tắc tại máy';

  // Translate llm_budget status
  let budgetStatus = 'Có thể nhờ AI khi cần và còn lượt';
  const remaining = turn?.llm_budget?.daily_remaining_public;
  if (remaining === 'exhausted') {
    budgetStatus = 'Đang đọc theo cách đơn giản';
  } else if (remaining === 'low') {
    budgetStatus = 'Sắp hết lượt ưu tiên';
  } else if (remaining === 'unavailable') {
    budgetStatus = 'Đang đọc theo cách đơn giản';
  }

  return (
    <div style={{ marginTop: 8 }}>
      {/* Exactly ONE quiet 12px mute line under stream/composer */}
      <div
        data-testid="trust-line"
        style={{
          fontSize: 12,
          color: 'var(--nn-mute, #62736D)',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexWrap: 'wrap',
          lineHeight: 1.4
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
            color: 'var(--nn-green, #166B52)',
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

      {/* Calm Modal / Drawer with accessible focus management and .nn-dialog token host */}
      {isOpen && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="trust-modal-title"
          data-testid="trust-disclosure-modal"
          className="nn-dialog"
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
              background: 'var(--nn-card, #FFFFFF)',
              borderRadius: 16,
              maxWidth: 500,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 24,
              boxShadow: 'var(--nn-shadow, 0 8px 24px rgba(10, 46, 31, 0.10))',
              display: 'grid',
              gap: 14,
              color: 'var(--nn-ink, #17352B)',
              fontSize: 14,
              outline: 'none',
              border: '1px solid var(--nn-line, #DDE7E1)'
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
                  color: 'var(--nn-mute, #62736D)',
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
                <b>Trí tuệ nhân tạo (AI):</b> Khi Gemini được cấu hình và còn lượt, văn bản bạn nhập cùng các tiêu chí cần thiết có thể được gửi đến Google Gemini để hiểu yêu cầu. Chế độ quy tắc tại máy không gửi yêu cầu đến AI bên ngoài.
              </div>
              <div>
                <b>Lưu trữ phiên:</b> Ứng dụng giữ các lượt trò chuyện gần nhất và tiêu chí trong phiên để khôi phục khi tải lại; phiên mặc định hết hạn sau một giờ. &quot;Làm lại&quot; mở phiên mới, không phải cam kết xóa ngay phiên cũ trên máy chủ.
              </div>
              <div>
                <b>Nguồn dữ liệu:</b> {health?.dataset_source === 'synthetic' ? 'Dữ liệu tổng hợp (synthetic), chỉ để kiểm thử' : health?.dataset_source === 'private' ? 'Dữ liệu địa điểm thử nghiệm cục bộ, chưa có quyền công bố' : 'Chưa rõ nguồn dữ liệu'}
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
              <div className="nn-peach-box" style={{ fontSize: 13 }}>
                Lưu ý an toàn: Dữ liệu không có thông tin nguyên liệu thành phần; chưa quán nào được xác nhận an toàn dị ứng.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                type="button"
                onClick={handleClose}
                className="nn-ghost-pill"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
