'use client';

import React from 'react';
import BlockRenderer from '../components/v2/chat/BlockRenderer';

const h = '<img src=x onerror="window.__xss=1">javascript:alert(1)\\u202e' + 'N'.repeat(5000);
const venue = {
  id: 'SYNTHETIC',
  name: h,
  address: h,
  district: h,
  source_url: 'javascript:alert(1)',
  price: null,
  hours: { display: h },
  rating: { value: 4, count: 1 },
};

const blocks = [
  { type: 'text', text: h },
  { type: 'notice', level: 'safety', text: h },
  { type: 'dish_suggestions', items: [{ dish_group: h, blurb: h, venue_count: null }] },
  { type: 'venue_cards', title: h, cards: [{ label: 'A', venue, why: [{ text: h }], flags: [{ code: 'allergy_unknown', text: h }] }] },
  { type: 'compare_table', columns: [{ label: 'A', name: h }], criteria: [{ id: 'x', label: h }], rows: [{ criterion_id: 'x', cells: [{ value: null, note: h, status: 'unknown' }] }], unsupported: [{ text: h }] },
  { type: 'clarify', question: h, options: [{ option_id: 'x', label: h }] },
  { type: 'confirm_summary', items: [{ label: h, value: h }], shortlist: [{ venue_id: 'SYNTHETIC', name: h }], warnings: [{ text: h }] },
  { type: 'tour_ready' },
];

const tour = {
  status: 'conditional',
  stops: [
    {
      order: 1,
      venue_id: 'SYNTHETIC',
      name: h,
      address: h,
      district: h,
      venue,
      why: [{ text: h }],
      price: {},
      hours: {},
      leg_from_previous: { source: 'unknown' },
    },
  ],
  totals: {},
  legs: [],
  reasons: [h],
  proposed_changes: [h],
  unknowns: ['hours', 'price_per_person', 'route'],
};

export default function Review() {
  return (
    <main style={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', overflowX: 'hidden' }}>
      {blocks.map((b, i) => (
        <section
          key={i}
          data-review={b.type}
          style={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}
        >
          <BlockRenderer block={b} allergies={['cua']} tour={tour} onAction={() => {}} />
        </section>
      ))}
    </main>
  );
}
