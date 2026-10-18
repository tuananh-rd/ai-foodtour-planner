# Claude review — attached-digit input fix (run_d07647b6e92e, task_f9cc7b0d069d)

Scope reviewed (read-only, root 0cda532 + uncommitted): `backend/app/chat/coverage.py` (`numeric_prefix_spacing`, used in `extras`), `backend/app/chat/understand.py` (`effective_text`, `_understand`), new `backend/tests/chat/test_functional_qa.py`, `tools/diagnose_functional_qa.py`. No app/source edits by me. Synthetic only; no provider/key access.

## Verdict: APPROVE (with 2 non-blocking notes)

## What the change does
`re.sub(r'\b(tour|nay|mai|trong|cho|khoảng|khoang|tầm|tam)(?=\d)', r'\1 ', text, IGNORECASE)` inserts one space between a fixed request word and an immediately following digit, in `effective_text`, `_understand` and `coverage.extras` (both the raw and folded text). The exact input `tour3 quán … tối nay120 phút,500nghìn cho2người,…` therefore reaches the same rules as the already-working spaced sentence: goal `tour`, stops 3, party 2, duration 120, budget 500000, allergy đậu phộng, next question `budget_scope`, then start_time, then confirm_plan.

## Semantic / safety review
- Narrow: only 8 words, only directly before a digit, word boundary required (`v_mai12`, `chợ2`, `cho 2` unchanged). It never deletes or reorders text and adds no values; it only lets existing parsers see numbers they already accept when spaced. No new slot, no inferred value.
- No silent relax: allergy parsing, `confirm_plan` obligation, budget scope question and revision handling are untouched; tests assert `plan_request is None` on every turn (text entry cannot bypass explicit confirmation) and that no `start_time` is invented for `tour3 … tối nay120 phút` (the variants stay at start_time None). Budget edit after confirm keeps stops 3 and returns to confirm_plan.
- Quote / hypothetical / postponed handling: the spacing is applied before the quote-strip and postponed-clause trimming and does not change quote delimiters or negation words, so those branches see the same structure as before. Not changed by this diff, none regressed in my runs.
- Ran `python -m unittest discover -s tests/chat -t .` (backend cwd): **186 tests OK** (includes the new module). Third-party/foreign API tests not run by me.

## Notes (non-blocking)
1. `re.IGNORECASE` also rewrites capitalised names/identifiers that happen to start with one of the words and a digit: `Quán Mai2` → `Quán Mai 2`, `Tam3 Thuong` → `Tam 3 Thuong`, `Hẻm Trong5` → `Hẻm Trong 5`. The spaced string is used for parsing only in the reviewed paths, but venue-name or address matching on that string could in theory mis-match a venue literally named with an attached digit. Suggestion: match lowercase/uppercase variants of the whole word only (e.g. `[Cc]ho`, `CHO`) or require the previous char to be start/space/punctuation. I did not verify venue-reference matching against a venue with such a name.
2. `CHO2NGUOI` becomes `CHO 2NGUOI` (digit-letter junction after the digit is still left to the downstream regex). Works for `2người` today; not for fully unspaced ASCII without diacritics. Out of scope for this fix.
3. `tools/diagnose_functional_qa.py` posts the exact sample sentence to http://127.0.0.1:8020 (the user's private API) and 8040, and prints only counts/slots (no venue records). Acceptable as a read-only diagnostic, but it does create sessions on those servers; run it deliberately and do not commit its output if it ever echoes private fields. No secrets in the file.
4. `backend/app/llm/extract.py:171` still normalises without the helper; if a live LLM extractor is the first reader, it sees `tour3`. Rules-first path (reviewed) is covered; I did not test the live-LLM path (no key access).

## Limits
Read-only review of the diff and the 186 chat tests; no browser, no live/private API, no provider calls.

---
# Update 2 — tightened helper + greeting branch (read-only review of the uncommitted diff on 39fa6fc)
## Verdict: APPROVE
- **Helper (coverage.py)** is now three narrow rules: `tour` (any case) before a digit; a day-part phrase (`tối|sáng|chiều|trưa` + `nay|mai`, with/without diacritics) before a digit; and the lowercase generic words `trong|cho|khoảng|khoang|tầm|tam` before a digit. Probes: `tour3`→`tour 3`, `Tối nay120`→`Tối nay 120`, `sáng mai9h`→`sáng mai 9h`, `cho2người`→`cho 2người`, `trong180`→`trong 180`; unchanged: `Quán Mai2`, `Tam3 Thuong`, `Trong5`, `tối nay 19h`, `hôm nay120`. My note 1 (capitalised names) is resolved; `extras('Quán Trong5 ba quán', folded)` returns `{}`, so folding does not reintroduce a rewrite visible in results. Remaining, harmless: a bare `mai`/`nay` without a day-part word is not separated (`hôm nay120` stays), so that phrasing still depends on the spaced form.
- **Greeting branch (understand.py)**: a greeting/thanks message that also carries a parsed profile patch now returns `UPDATE_PROFILE` with that patch (confidence 0.9); a bare greeting still returns `GREET_OR_SMALLTALK`. Probes: `xin chào`/`cảm ơn` → GREET; `hello, tour3 quán Hồ Gươm tối nay120 phút` → UPDATE_PROFILE {duration 120, stops 3, day_part evening}; `chào, ngân sách 300 nghìn` → UPDATE_PROFILE {budget_vnd 300000}. No plan can start from this branch (it only updates the profile; the confirmation obligation is downstream and unchanged).
- **Risk noted (not a regression):** `hi mình không dị ứng gì` still returns GREET_OR_SMALLTALK although the patch carries `no_allergy`; this stays on the safe side (the allergy obligation is not silently closed by a greeting message), and the diff does not change it. Worth a product decision only if QA expects the allergy declaration to be applied in that message.
- **Tests**: `python -m unittest discover -s tests/chat -t .` from backend: **188 tests OK** (includes the new regressions). Not run: full backend suite, live LLM path, browser. No source edits by me.

---
# Update 3 — independent actual UI audit (synthetic UI 3050 / API 8050; CDP on 19500; read-only)
Method: headless Chrome via CDP, real `Input.dispatchKeyEvent`/`insertText` keyboard, `Network.emulateNetworkConditions` for offline, reload for session restore; viewports 1440×1024 (default scrollbars, clientWidth 1425 when scrolling) and 390×844. Synthetic fixture only; no private API (8020/3020) used. Screenshots: `claude-fq-desk-*.png`, `claude-fq-mob-*.png` in this directory. Source untouched.

## Works as intended (evidence)
- Enter in the composer sends (form submit); the clarify option is keyboard-focusable and Enter/Space activate it; focus moves to the next question/`confirm-yes-btn`/`google-maps-cta` after each step (no focus loss).
- Escape on the confirmation card does NOT confirm or alter the plan (card stays, no timeline).
- Trust dialog and replace dialog: `role=dialog`, `aria-modal=true`, labelled, focus moves inside, 6 consecutive Tab presses stay inside (trap), Escape closes and returns focus to the opener (desktop replace opened from its real button → `stop-replace-btn-1` on mobile verified).
- Offline send: error banner `role=alert`, composer text kept, send re-enabled, "Thử lại" present; after going online the retry succeeds. No horizontal overflow (390: scrollWidth 390; 1440: 1425/1425). No console errors/exceptions.
- Mobile: confirm yes button fully in viewport (y596–640 of 844); tour restored after reload (3 stops).

## Concrete defects (for explicit ownership before any fix)
1. **D1 Retry button wraps to two lines** ("Thử / lại") in the error banner at 1440 (`claude-fq-desk-06-offline.png`): `.nn-alert button` has no `white-space: nowrap`/min-width. Files: shell `guided-visual.css` (+ none else). Low severity, 1-line fix. Owner: Claude shell (needs release).
2. **D2 Misleading offline message**: with the network offline the banner says "Máy chủ đang bận xử lý. Bạn vui lòng thử lại sau giây lát." (server busy) although the request never reached the server; users cannot tell offline from overload. Location: error mapping in the shell (`GuidedLayout.jsx` handlers). Suggest a distinct "Không kết nối được; kiểm tra mạng rồi bấm Thử lại" for fetch/network errors only. Medium-low. Needs wording approval (no feature expansion).
3. **D3 Privacy line vs session restore mismatch**: the line above the composer says the app keeps the recent chat turns in the session to restore on reload ("Ứng dụng giữ các lượt trò chuyện gần nhất trong phiên để khôi phục khi tải lại"), but after reload the UI restores the profile/cards/timeline (3 stops, "Mình hiểu là…", tour) while **no text bubbles** (user messages, assistant text) come back (`.nn-bubble` count 0 desktop and mobile; `claude-fq-desk-09-restore-clean.png`). Either the UI should render the restored turns or the sentence should say that only the plan and understood details are restored. Honesty/copy issue; decide with coordinator (the second is zero-risk copy fix in `TrustDisclosure.jsx`/shell line).
4. **D4 After restore the page opens scrolled** (scrollY 279 at 1440; the tour title is hidden under the sticky header) because focus/scroll goes to the restored card. Cosmetic; could be avoided by not auto-scrolling on restore. Low.
5. **D5 Small touch targets**: desktop nav pills, suggestion chips (35 high), reset (39), replace buttons (34), and the "Chi tiết" disclosure button (47×20, default 1px focus ring — below WCAG 2.2 AA target size 24×24, and not the brand focus ring used elsewhere). Mobile: only the three replace buttons (98×34) are under 44. Fix is padding/hit-area only (visual size can stay at the reference): `TrustDisclosure.jsx` + `guided-leaves.css` (Antigravity files) for "Chi tiết" and replace; chips/nav are shell. Low-medium; keep SVG sizes via padding/pseudo-element.
6. **D6 Tab order**: first stop is an invisible `NEXTJS-PORTAL` element (framework), then nav, chips, "Chi tiết", composer, reset; the reset button is after the composer in DOM order (visually top right in the tour column). Acceptable; no action unless QA requires.

## Not tested / limits
Screen-reader output, real hardware keyboard IME, long-session expiry (`session_expired` UI), 409 revision recovery from the UI, live LLM, private API 8020/3020, other viewports (1280×800 re-checked earlier in this task chain for the confirm card, not re-run here).
