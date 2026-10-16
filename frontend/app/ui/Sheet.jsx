'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Sheet component for UI_V2.
 * Responsiveness:
 * - < 600px: Bottom sheet
 * - 600px - 1023px: Centered dialog modal
 * - >= 1024px: Side panel (drawer)
 *
 * Accessibility:
 * - Focus trap (Tab / Shift-Tab cycle)
 * - Escape key to close
 * - Focus restore to previous element
 * - aria-modal="true" and role="dialog"
 * - Inert backdrop dismissing on click
 * - Close button with min-height/width >= 44px
 */
export default function Sheet({
  isOpen,
  onClose,
  title,
  children,
  footer = null,
  busy = false,
  className = '',
  style = {},
  'aria-describedby': ariaDescribedBy,
}) {
  const dialogRef = useRef(null);
  const titleId = useRef(`sheet_title_${Math.random().toString(36).slice(2, 8)}`).current;
  const [viewportMode, setViewportMode] = useState('bottom'); // 'bottom' | 'center' | 'side'

  // Track viewport mode
  useEffect(() => {
    const updateMode = () => {
      const w = window.innerWidth;
      if (w < 600) {
        setViewportMode('bottom');
      } else if (w >= 1024) {
        setViewportMode('side');
      } else {
        setViewportMode('center');
      }
    };
    updateMode();
    window.addEventListener('resize', updateMode);
    return () => window.removeEventListener('resize', updateMode);
  }, []);

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Focus restore to the invoker element
  useEffect(() => {
    if (!isOpen) return undefined;
    const invoker = document.activeElement;
    return () => {
      if (invoker && typeof invoker.focus === 'function' && document.contains(invoker)) {
        invoker.focus();
        return;
      }
      const fallback = document.querySelector('[data-focus-fallback], main, [role="main"]');
      if (fallback) {
        if (!fallback.hasAttribute('tabindex')) fallback.setAttribute('tabindex', '-1');
        fallback.focus();
      }
    };
  }, [isOpen]);

  // Focus trap & Escape key
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );

      if (focusable.length === 0) {
        e.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = dialogRef.current.contains(active);

      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, busy, onClose]);

  // Auto-focus first focusable element when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (!dialogRef.current) return;
        const focusable = dialogRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          dialogRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Backdrop click dismiss
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !busy) {
      onClose();
    }
  };

  const getOverlayLayout = () => {
    switch (viewportMode) {
      case 'bottom':
        return {
          alignItems: 'flex-end',
          justifyContent: 'center',
          padding: 0,
        };
      case 'side':
        return {
          alignItems: 'stretch',
          justifyContent: 'flex-end',
          padding: 0,
        };
      case 'center':
      default:
        return {
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        };
    }
  };

  const getPanelLayout = () => {
    switch (viewportMode) {
      case 'bottom':
        return {
          width: '100%',
          maxWidth: '100%',
          maxHeight: '85vh',
          borderRadius: '16px 16px 0 0',
          borderBottom: 'none',
        };
      case 'side':
        return {
          width: '420px',
          maxWidth: '90vw',
          height: '100%',
          maxHeight: '100vh',
          borderRadius: '16px 0 0 16px',
        };
      case 'center':
      default:
        return {
          width: '520px',
          maxWidth: '92vw',
          maxHeight: '90vh',
          borderRadius: '16px',
        };
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="ft-sheet-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(21, 19, 17, 0.6)',
        display: 'flex',
        zIndex: 9999,
        transition: 'background-color var(--transition-base, 200ms ease)',
        ...getOverlayLayout(),
      }}
    >
      <div
        ref={dialogRef}
        data-sheet
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        className={`ft-sheet ft-sheet-panel ft-sheet-${viewportMode} ${className}`.trim()}
        style={{
          backgroundColor: 'var(--card-bg, #FFFFFF)',
          color: 'var(--text, #1F1B16)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg, 0 10px 24px rgba(31, 27, 22, 0.14))',
          border: '1px solid var(--border, #DFD5C6)',
          overflow: 'hidden',
          boxSizing: 'border-box',
          ...getPanelLayout(),
          ...style,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border, #DFD5C6)',
            flexShrink: 0,
          }}
        >
          <h2
            id={titleId}
            style={{
              fontSize: 'var(--type-18, 18px)',
              fontWeight: 700,
              margin: 0,
              color: 'var(--text, #1F1B16)',
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Đóng bảng"
            style={{
              minHeight: '44px',
              minWidth: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-sm, 4px)',
              fontSize: 20,
              color: 'var(--text, #1F1B16)',
              cursor: busy ? 'not-allowed' : 'pointer',
              padding: '8px',
              boxSizing: 'border-box',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            flex: 1,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div
            style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border, #DFD5C6)',
              backgroundColor: 'var(--subtle, #F0EAE1)',
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
