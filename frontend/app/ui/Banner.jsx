'use client';

import React from 'react';
import { useStatusQueue } from './StatusQueue.js';

/**
 * Banner component for UI_V2.
 * Supports info, warning, error.
 * All user-facing text in Vietnamese, zero developer jargon.
 * Accessible with role="alert" or role="status", dismiss button with min-height >= 44px.
 */
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
          icon: '⛔',
          defaultTitle: 'Đã có lỗi xảy ra',
          role: 'alert',
        };
      case 'warning':
        return {
          backgroundColor: 'var(--banner-warning-bg, #FFFBEB)',
          color: 'var(--banner-warning-text, #78350F)',
          borderColor: 'var(--banner-warning-border, #FDE68A)',
          icon: '⚠️',
          defaultTitle: 'Lưu ý',
          role: 'alert',
        };
      case 'info':
      default:
        return {
          backgroundColor: 'var(--banner-info-bg, #EFF6FF)',
          color: 'var(--banner-info-text, #1E3A8A)',
          borderColor: 'var(--banner-info-border, #BFDBFE)',
          icon: 'ℹ️',
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
        {action}
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
            ✕
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
