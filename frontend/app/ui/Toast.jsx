'use client';

import React, { useEffect } from 'react';

/**
 * Toast component for UI_V2.
 * Accessible notification with role="status", aria-live="polite", and 44px dismiss button.
 */
export default function Toast({
  message,
  type = 'info', // 'info' | 'success' | 'warning' | 'error'
  onClose,
  duration = 4000,
  action = null,
  className = '',
  style = {},
  ...props
}) {
  useEffect(() => {
    if (duration > 0 && onClose) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const getTypeStyles = () => {
    switch (type) {
      case 'error':
        return {
          backgroundColor: 'var(--banner-error-bg, #FEF2F2)',
          color: 'var(--banner-error-text, #7F1D1D)',
          borderColor: 'var(--banner-error-border, #FECACA)',
          icon: '⛔',
        };
      case 'warning':
        return {
          backgroundColor: 'var(--banner-warning-bg, #FFFBEB)',
          color: 'var(--banner-warning-text, #78350F)',
          borderColor: 'var(--banner-warning-border, #FDE68A)',
          icon: '⚠️',
        };
      case 'success':
        return {
          backgroundColor: 'var(--evidence-verified-bg, #EAF7EC)',
          color: 'var(--evidence-verified-text, #195624)',
          borderColor: 'var(--evidence-verified-border, #9ED4A7)',
          icon: '✓',
        };
      case 'info':
      default:
        return {
          backgroundColor: 'var(--card-bg, #FFFFFF)',
          color: 'var(--text, #1F1B16)',
          borderColor: 'var(--border, #DFD5C6)',
          icon: 'ℹ️',
        };
    }
  };

  const cfg = getTypeStyles();

  return (
    <div
      role="status"
      aria-live="polite"
      className={`ft-toast ft-toast-${type} ${className}`.trim()}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        backgroundColor: cfg.backgroundColor,
        color: cfg.color,
        border: `1px solid ${cfg.borderColor}`,
        borderRadius: 'var(--radius-md, 8px)',
        boxShadow: 'var(--shadow-md, 0 4px 12px rgba(31, 27, 22, 0.10))',
        fontSize: 'var(--type-14, 14px)',
        lineHeight: 1.4,
        maxWidth: 'calc(100vw - 32px)',
        boxSizing: 'border-box',
        ...style,
      }}
      {...props}
    >
      <span aria-hidden="true" style={{ fontSize: 16 }}>{cfg.icon}</span>
      <span style={{ flex: 1 }}>{message}</span>
      {action}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
          style={{
            minHeight: '44px',
            minWidth: '44px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm, 4px)',
            color: 'currentColor',
            cursor: 'pointer',
            padding: 8,
            fontSize: 16,
            boxSizing: 'border-box',
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
