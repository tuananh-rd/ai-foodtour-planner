# Warm editorial UI task board

Source/base: fc09d2c, approved Figma frame1:145 and original1440x1024 PNG. This is a new UI task, independent of the Tavily account-metadata blocker. Codex coordinates/reviews/integrates; Antigravity implements; Claude inactive. Existing behavior/focus fixes must survive. No live provider probes or quota changes.

| Gate | Owner | State | Evidence / boundary |
|---|---|---|---|
| Design/reference and authority | Codex | DONE | Original image opened, hash/spec recorded; AGENTS/PROJECT_RULES updated |
| Safe base and worker reuse | Codex | DONE | Clean sibling6816b23 fast-forwarded tofc09d2c; settled/retained terminal37bc reused; no new agent/model |
| UI implementation | Antigravity | RUNNING / ACK VERIFIED | task_9aa61f3769fc / ctx_fc219ec5727d; guided components/scoped CSS, page/layout if needed, new public/warm-editorial assets, qa/figma-warm-editorial and FIGMA_WARM_EDITORIAL_QA.md only. Injection initially remained in visible TUI draft; one bare Enter submitted that same draft. Actual new turn/commands observed, no resend. Ownership ACK msg_85648084535a explicitly confirms original-image inspection before coding, old-QA inspection and no live-provider calls or overlapping edits |
| Targeted QA / candidate commit | Antigravity | CORRECTIONS DISPATCHED | Candidate905e6ea reviewed,28 checks insufficient. task_53af11905ca6/ctx_0e9c06b07142 owns same files; correct WE-01–06 and provide targeted evidence |
| Visual/code review and local integration | Codex | CHANGES REQUIRED | Candidate905e6ea not integrated; see FIGMA_WARM_EDITORIAL_CODEX_REVIEW.md |
| Final relevant regression/build | Codex | PENDING | One final run after review, source/mode/URL evidence; no backend full-suite repeat absent backend changes |

Review event: candidate905e6ea is NOT ACCEPTED or integrated. Actual screenshots/source reveal fabricated unknown metrics/times/history, incorrect budget scope/distance unit, invented dessert stage, keyboard/no-op controls, material type/spacing/card mismatches and overstated QA. See FIGMA_WARM_EDITORIAL_CODEX_REVIEW.md. Fresh bounded correction task_53af11905ca6 reuses the same Antigravity terminal with the same file scope; no concurrent frontend editor. Previous task settled/retained,28 candidate checks historical only. Final regression remains gated.

Second review event:9da1fcb improves semantic issues and records38 targeted checks, but is NOT integrated/accepted. Actual images still show compressed chat/hero/metrics rhythm, excessive heading weight and altered target measurements; mobile empty CTA/suggestion focus can target hidden chat, distance/footer semantics need correction. Same-owner task_0b8beaeb46b6 handles WE-07–10, targeted checks only. Prior task_53af11905ca6 settled/retained. Final regression remains pending until this visual/action review passes.

Do not infer acceptance from dispatch/input acceptance/worker_done. Require actual ownership ACK/output, commit and test evidence. Preserve original untracked reports, private configuration/ledgers and all user servers. Existing3060/API8060 has a real Tavily credential: do not automate search there. Current live metadata blocker remains null PAYGO/key limits; Gemini PARTIAL.
