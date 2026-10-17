# Independent synthetic browser evidence

Source: `6415d61`, 18 October 2026. Reviewer: Codex. These captures contain explicitly synthetic fixtures, never private venue data. Browser viewport is 1440×1024 or 390×844 at scale 1; mobile is responsive content, not a scaled desktop screenshot.

`node tools/review_ngonngon_interactions.mjs` — **22/22 PASS**. Uses the real preview frontend at localhost3020 and real synthetic HTTP API at8030, with fixed loopback CDP interception only inside this isolated review browser. Production endpoint configuration is unchanged. Fixture API setup seeds the confirmation state; the browser actually clicks confirmation, replacement and modal controls. The larger production-build browser suite separately covers typing the initial chat and clarification.

Verified here: explicit confirmation, 3 stops, no mobile horizontal overflow, actual tab visibility, portal outside inert root, Tab containment, successful replacement with other stop identities/order/locks preserved, completion focus, controlled no-candidate409 preserving server tour, real concurrent safety edit followed by stale replacement409, current allergy question after reload ahead of the retained old tour, trust-dialog close/focus and restored budget questions150k/300k/1m. `checks.json` contains only boolean check names/results.

| Capture | State |
|---|---|
| desktop-empty.png | Real empty shell |
| desktop-confirm.png | Restored confirmation before browser decision |
| mobile-confirm.png | Visible decision/warnings with no composer overlap |
| desktop-tour.png | Top of actual conditional timeline and metric cards |
| mobile-tour.png | Top of responsive tour, evidence warnings and first stop |
| desktop-replace.png | Actual interactive replacement modal |

Codex visually compared these with `docs/design/ngonngon-tour-reference.png`: warm ivory canvas, forest green/lime accents, pill navigation, left chat, three metric cards, white timeline cards with green time pills and right stop-order overview. Mobile wraps the header and uses actual chat/tour tabs. Warnings and source qualifiers take additional space deliberately. The right overview is labelled stop order, not a route map; no guessed geometry is rendered. No fake identity, sample amounts, date, ETA or tips were copied from the mockup. SVG remains reference material, not the live UI.

Full independent scratch-production browser gate on this source: **169/169 PASS**, zero runtime exceptions/console errors, zero Maps API/key requests. Accessibility checks cover keyboard, focus, semantics, touch targets, sampled contrast and200% reflow; actual screen-reader speech and participant usability are untested. No Google destination page or real-world routing/operating/allergen evidence is validated by these images.
