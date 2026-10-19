'use client';

import React from 'react';
import { useStatusQueue } from './StatusQueue.js';

/**
 * Banner component for UI_V2.
 * Supports info, warning, error.
 * All user-facing text in Vietnamese, zero developer jargon.
 * Accessible with role="alert" or role="status", dismiss button with min-height >= 44px.
 */
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

export default function Banner({
  type = 'info',
  title = null,
  message,
  action = null,
  onDismiss = null,
  className = '',
  style = {},
  ...props
}) {
  const getBannerStyles = () => {
    switch (type) {
      case 'error':
        return {
          backgroundColor: 'var(--banner-error-bg, #FEF2F2)',
          color: 'var(--banner-error-text, #7F1D1D)',
          borderColor: 'var(--banner-error-border, #FECACA)',
          icon: <AlertIcon />,
          defaultTitle: 'Đã có lỗi xảy ra',
          role: 'alert',
        };
      case 'warning':
        return {
          backgroundColor: 'var(--banner-warning-bg, #FFFBEB)',
          color: 'var(--banner-warning-text, #78350F)',
          borderColor: 'var(--banner-warning-border, #FDE68A)',
          icon: <WarningIcon />,
          defaultTitle: 'Lưu ý',
          role: 'alert',
        };
      case 'info':
      default:
        return {
          backgroundColor: 'var(--banner-info-bg, #EFF6FF)',
          color: 'var(--banner-info-text, #1E3A8A)',
          borderColor: 'var(--banner-info-border, #BFDBFE)',
          icon: <InfoIcon />,
          defaultTitle: 'Thông tin',
          role: 'status',
        };
    }
  };

  const config = getBannerStyles();

  return (
    <div
      role={config.role}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      className={`ft-banner ft-banner-${type} ${className}`.trim()}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '12px 16px',
        borderRadius: 'var(--radius-md, 8px)',
        border: `1px solid ${config.borderColor}`,
        backgroundColor: config.backgroundColor,
        color: config.color,
        fontSize: 'var(--type-14, 14px)',
        lineHeight: 1.5,
        boxSizing: 'border-box',
        ...style,
      }}
      {...props}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
        <span aria-hidden="true" style={{ fontSize: 18, flexShrink: 0 }}>
          {config.icon}
        </span>
        <div style={{ flex: 1 }}>
          {title && (
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{title}</div>
          )}
          <div>{message}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {React.isValidElement(action) ? (
          action
        ) : action && typeof action === 'object' && action.label ? (
          <button
            type="button"
            onClick={action.onClick}
            aria-label={action.label}
            className="ft-banner-action-btn"
            data-testid="banner-action-btn"
            style={{
              minHeight: '44px',
              minWidth: '44px',
              padding: '8px 14px',
              backgroundColor: 'currentColor',
              border: 'none',
              borderRadius: 'var(--radius-sm, 6px)',
              fontWeight: 600,
              fontSize: 'var(--type-14, 14px)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              ...action.style,
            }}
          >
            <span style={{ color: config.backgroundColor, pointerEvents: 'none' }}>
              {action.label}
            </span>
          </button>
        ) : null}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
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
              fontSize: 18,
              padding: '8px',
              opacity: 0.8,
              boxSizing: 'border-box',
            }}
          >
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * BannerQueue component: renders the single active banner from StatusQueue.
 * Guarantees ONLY ONE banner is shown at any moment based on priority.
 */
export function BannerQueue({ className = '', style = {} }) {
  const { activeBanner, dismiss } = useStatusQueue();

  if (!activeBanner) return null;

  return (
    <div
      className={`ft-banner-queue ${className}`.trim()}
      data-testid="status-queue-container"
      style={{ width: '100%', marginBottom: 12, ...style }}
    >
      <Banner
        key={activeBanner.id}
        type={activeBanner.type}
        title={activeBanner.title}
        message={activeBanner.message}
        action={activeBanner.action}
        onDismiss={() => dismiss(activeBanner.id)}
      />
    </div>
  );
}
