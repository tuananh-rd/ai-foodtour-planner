'use client';

import React, { useState, useEffect } from 'react';

/**
 * TrustDisclosure
 * Exactly ONE quiet line under stream:
 * "Dữ liệu quán từ Foody • giờ & giá theo nguồn ghi • khoảng cách ước tính" + "Chi tiết"
 * Opens a calm disclosure modal with zero developer jargon and zero banned words.
 */
export default function TrustDisclosure({ turn, health }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Translate understanding parser mode (No banned words: NO "Gemini", NO "bộ luật cục bộ", NO "llm")
  const understandingMode = turn?.understanding === 'llm'
    ? 'Trợ lý ngôn ngữ nâng cao'
    : 'Quy tắc ngữ nghĩa trực tiếp';

  // Translate llm_budget status (NO raw enums, friendly Vietnamese only)
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
        <span>Dữ liệu quán từ Foody • giờ & giá theo nguồn ghi • khoảng cách ước tính</span>
        <button
          type="button"
          data-testid="trust-disclosure-btn"
          onClick={() => setIsOpen(true)}
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

      {/* Calm Modal / Drawer */}
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
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              maxWidth: 480,
              width: '100%',
              padding: 20,
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)',
              display: 'grid',
              gap: 14,
              color: 'var(--ink, #231f1a)',
              fontSize: 14
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
                type="button"
                data-testid="trust-disclosure-close"
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 20,
                  cursor: 'pointer',
                  color: 'var(--mute, #6b6257)',
                  padding: '0 4px',
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
                <b>Nguồn dữ liệu:</b> Dữ liệu quán ẩm thực từ Foody Hà Nội
              </div>
              <div>
                <b>Giờ mở cửa & giá:</b> Theo nguồn ghi nhận ban đầu, chưa qua kiểm chứng thực tế
              </div>
              <div>
                <b>Khoảng cách:</b> Ước tính khoảng cách đi bộ đường chim bay
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
                onClick={() => setIsOpen(false)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 10,
                  border: '1px solid var(--line, #e6dfd3)',
                  background: 'var(--chip, #f3ece0)',
                  color: 'var(--ink, #231f1a)',
                  fontWeight: 600,
                  cursor: 'pointer'
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
