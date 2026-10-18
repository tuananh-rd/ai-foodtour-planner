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
