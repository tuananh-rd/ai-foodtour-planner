'use client';

import React from 'react';

/**
 * Card component for UI_V2.
 * Clean structured container with light border or subtle elevation.
 */
export default function Card({
  children,
  header = null,
  footer = null,
  elevated = false,
  as: Component = 'div',
  className = '',
  style = {},
  ...props
}) {
  const cardStyles = {
    backgroundColor: 'var(--card-bg, #FFFFFF)',
    color: 'var(--text, #1F1B16)',
    borderRadius: 'var(--radius-lg, 12px)',
    border: elevated ? 'none' : '1px solid var(--border, #DFD5C6)',
    boxShadow: elevated
      ? 'var(--shadow-md, 0 4px 12px rgba(31, 27, 22, 0.10))'
      : 'var(--shadow-sm, 0 1px 3px rgba(31, 27, 22, 0.08))',
    overflow: 'hidden',
    transition: 'box-shadow var(--transition-base, 200ms ease)',
    boxSizing: 'border-box',
    ...style,
  };

  const headerStyles = {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border, #DFD5C6)',
    fontWeight: 700,
    fontSize: 'var(--type-16, 16px)',
  };

  const bodyStyles = {
    padding: '20px',
  };

  const footerStyles = {
    padding: '14px 20px',
    borderTop: '1px solid var(--border, #DFD5C6)',
    backgroundColor: 'var(--subtle, #F0EAE1)',
  };

  return (
    <Component
      className={`ft-card ${elevated ? 'ft-card-elevated' : ''} ${className}`.trim()}
      style={cardStyles}
      {...props}
    >
      {header && <div className="ft-card-header" style={headerStyles}>{header}</div>}
      <div className="ft-card-body" style={bodyStyles}>{children}</div>
      {footer && <div className="ft-card-footer" style={footerStyles}>{footer}</div>}
    </Component>
  );
}
