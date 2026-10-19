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

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

  const getTypeStyles = () => {
    switch (type) {
      case 'error':
        return {
          backgroundColor: 'var(--banner-error-bg, #FEF2F2)',
          color: 'var(--banner-error-text, #7F1D1D)',
          borderColor: 'var(--banner-error-border, #FECACA)',
          icon: <AlertIcon />,
        };
      case 'warning':
        return {
          backgroundColor: 'var(--banner-warning-bg, #FFFBEB)',
          color: 'var(--banner-warning-text, #78350F)',
          borderColor: 'var(--banner-warning-border, #FDE68A)',
          icon: <WarningIcon />,
        };
      case 'success':
        return {
          backgroundColor: 'var(--evidence-verified-bg, #EAF7EC)',
          color: 'var(--evidence-verified-text, #195624)',
          borderColor: 'var(--evidence-verified-border, #9ED4A7)',
          icon: <CheckIcon />,
        };
      case 'info':
      default:
        return {
          backgroundColor: 'var(--card-bg, #FFFFFF)',
          color: 'var(--text, #1F1B16)',
          borderColor: 'var(--border, #DFD5C6)',
          icon: <InfoIcon />,
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
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
