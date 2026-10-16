'use client';

import React from 'react';

/**
 * Button component for UI_V2.
 * Strictly guarantees min-height >= 44px and min-width >= 44px for touch accessibility (UX-07).
 * Variants: 'primary' | 'secondary' | 'ghost'
 * Zero developer jargon; accessible focus ring, disabled and loading states.
 */
export default function Button({
  children,
  variant = 'primary',
  type = 'button',
  disabled = false,
  loading = false,
  onClick,
  className = '',
  style = {},
  'aria-label': ariaLabel,
  ...props
}) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'secondary':
        return {
          backgroundColor: 'var(--card-bg, #FFFFFF)',
          color: 'var(--text, #1F1B16)',
          border: '1px solid var(--border, #DFD5C6)',
          boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(31, 27, 22, 0.08))',
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          color: 'var(--text, #1F1B16)',
          border: '1px solid transparent',
        };
      case 'primary':
      default:
        return {
          backgroundColor: 'var(--accent, #C8431A)',
          color: 'var(--accent-contrast, #FFFFFF)',
          border: '1px solid var(--accent, #C8431A)',
          boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(31, 27, 22, 0.08))',
        };
    }
  };

  const baseStyles = {
    minHeight: '44px',
    minWidth: '44px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 18px',
    fontSize: 'var(--type-14, 14px)',
    fontWeight: 600,
    lineHeight: 1.25,
    borderRadius: 'var(--radius-md, 8px)',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.55 : 1,
    transition: 'background-color var(--transition-fast, 150ms ease), border-color var(--transition-fast, 150ms ease), transform var(--transition-fast, 150ms ease)',
    boxSizing: 'border-box',
    textDecoration: 'none',
    userSelect: 'none',
    gap: '8px',
    ...getVariantStyles(),
    ...style,
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`ft-button ft-button-${variant} ${className}`.trim()}
      style={baseStyles}
      aria-label={ariaLabel}
      aria-busy={loading ? 'true' : undefined}
      {...props}
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 14,
              height: 14,
              border: '2px solid currentColor',
              borderRightColor: 'transparent',
              borderRadius: '50%',
              animation: 'ft-spin 0.75s linear infinite',
            }}
          />
          <span>Đang xử lý…</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
