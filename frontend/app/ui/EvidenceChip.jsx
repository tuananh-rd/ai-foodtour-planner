'use client';

import React from 'react';

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const EVIDENCE_CONFIG = {
  verified: {
    icon: <CheckIcon />,
    defaultLabel: 'Đã xác minh',
    title: 'Thông tin đã được xác minh độc lập từ nguồn dữ liệu chính xác',
    bg: 'var(--evidence-verified-bg, #EAF7EC)',
    text: 'var(--evidence-verified-text, #195624)',
    border: 'var(--evidence-verified-border, #9ED4A7)',
  },
  estimate: {
    icon: '≈',
    defaultLabel: 'Ước tính',
    title: 'Số liệu ước tính tự động theo thuật toán và khoảng giá công bố của quán',
    bg: 'var(--evidence-estimate-bg, #FFF6E0)',
    text: 'var(--evidence-estimate-text, #6E4300)',
    border: 'var(--evidence-estimate-border, #FFD480)',
  },
  unknown: {
    icon: '?',
    defaultLabel: 'Chưa rõ',
    title: 'Thông tin chưa rõ từ nguồn; hệ thống không suy đoán hoặc bịa số liệu',
    bg: 'var(--evidence-unknown-bg, #EFECE6)',
    text: 'var(--evidence-unknown-text, #413C36)',
    border: 'var(--evidence-unknown-border, #C8C1B7)',
  },
};

/**
 * EvidenceChip component for UI_V2.
 * Levels: 'verified' | 'estimate' | 'unknown'
 * Strict rule: NEVER color only. Always displays:
 * - Status icon (check, approx, question)
 * - Vietnamese descriptive text
 * - Title tooltip explaining the evidence status
 */
export default function EvidenceChip({
  level = 'unknown',
  label = null,
  title = null,
  size = 'md', // 'sm' | 'md'
  className = '',
  style = {},
  ...props
}) {
  const normLevel = (level && EVIDENCE_CONFIG[level.toLowerCase()])
    ? level.toLowerCase()
    : 'unknown';
  const cfg = EVIDENCE_CONFIG[normLevel];

  const displayText = label || cfg.defaultLabel;
  const displayTitle = title || cfg.title;

  const isSmall = size === 'sm';

  return (
    <span
      className={`ft-evidence-chip ft-evidence-${normLevel} ${className}`.trim()}
      title={displayTitle}
      role="status"
      aria-label={`${displayText}: ${displayTitle}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSmall ? '4px' : '6px',
        padding: isSmall ? '2px 8px' : '4px 10px',
        fontSize: isSmall ? 'var(--type-12, 12px)' : 'var(--type-14, 14px)',
        fontWeight: 600,
        lineHeight: 1.25,
        borderRadius: 'var(--radius-full, 9999px)',
        backgroundColor: cfg.bg,
        color: cfg.text,
        border: `1px solid ${cfg.border}`,
        userSelect: 'none',
        boxSizing: 'border-box',
        ...style,
      }}
      {...props}
    >
      <span
        aria-hidden="true"
        className="ft-evidence-icon"
        style={{
          fontWeight: 700,
          fontSize: isSmall ? 11 : 13,
          lineHeight: 1,
        }}
      >
        {cfg.icon}
      </span>
      <span className="ft-evidence-text">{displayText}</span>
    </span>
  );
}
