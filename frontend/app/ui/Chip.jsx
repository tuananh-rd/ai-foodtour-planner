'use client';

import React from 'react';

/**
 * Chip component for UI_V2.
 * Single/multi select with aria-pressed.
 * Touch target strictly guaranteed >= 44px height (UX-07).
 */
export default function Chip({
  children,
  selected = false,
  onClick,
  disabled = false,
  icon = null,
  className = '',
  style = {},
  'aria-label': ariaLabel,
  ...props
}) {
  const isSelected = Boolean(selected);

  const baseStyles = {
    minHeight: '44px',
    minWidth: '44px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 16px',
    fontSize: 'var(--type-14, 14px)',
    fontWeight: isSelected ? 600 : 500,
    lineHeight: 1.25,
    borderRadius: 'var(--radius-full, 9999px)',
    border: isSelected
      ? '1.5px solid var(--accent, #C8431A)'
      : '1px solid var(--border, #DFD5C6)',
    backgroundColor: isSelected
      ? 'var(--accent, #C8431A)'
      : 'var(--card-bg, #FFFFFF)',
    color: isSelected
      ? 'var(--accent-contrast, #FFFFFF)'
      : 'var(--text, #1F1B16)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    boxShadow: isSelected
      ? 'var(--shadow-sm, 0 1px 3px rgba(31, 27, 22, 0.08))'
      : 'none',
    transition: 'all var(--transition-fast, 150ms ease)',
    boxSizing: 'border-box',
    userSelect: 'none',
    gap: '8px',
    ...style,
  };

  return (
    <button
      type="button"
      aria-pressed={isSelected ? 'true' : 'false'}
      disabled={disabled}
      onClick={onClick}
      className={`ft-chip ${isSelected ? 'ft-chip-selected' : ''} ${className}`.trim()}
      style={baseStyles}
      aria-label={ariaLabel}
      {...props}
    >
      {icon && (
        <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
          {icon}
        </span>
      )}
      <span>{children}</span>
    </button>
  );
}
