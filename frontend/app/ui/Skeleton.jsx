'use client';

import React from 'react';

/**
 * Skeleton loading placeholder for UI_V2.
 * Respects prefers-reduced-motion via tokens.css.
 */
export default function Skeleton({
  variant = 'rect', // 'text' | 'rect' | 'circle'
  width = '100%',
  height = 20,
  lines = 1,
  className = '',
  style = {},
  ...props
}) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'circle':
        return {
          borderRadius: '50%',
          width: width === '100%' ? height : width,
          height: height,
        };
      case 'text':
        return {
          borderRadius: 'var(--radius-sm, 4px)',
          height: height || 16,
        };
      case 'rect':
      default:
        return {
          borderRadius: 'var(--radius-md, 8px)',
          height: height,
        };
    }
  };

  const baseStyles = {
    backgroundColor: 'var(--subtle, #F0EAE1)',
    display: 'block',
    width: width,
    animation: 'ft-skeleton-pulse 1.6s ease-in-out infinite',
    boxSizing: 'border-box',
    ...getVariantStyles(),
    ...style,
  };

  if (variant === 'text' && lines > 1) {
    return (
      <div
        className={`ft-skeleton-group ${className}`.trim()}
        aria-hidden="true"
        role="presentation"
        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        {Array.from({ length: lines }).map((_, index) => (
          <span
            key={index}
            className="ft-skeleton ft-skeleton-text"
            style={{
              ...baseStyles,
              width: index === lines - 1 ? '70%' : '100%',
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <span
      className={`ft-skeleton ft-skeleton-${variant} ${className}`.trim()}
      aria-hidden="true"
      role="presentation"
      style={baseStyles}
      {...props}
    />
  );
}
