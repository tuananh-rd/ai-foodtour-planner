# U0 — S0 fail-before evidence (Claude, 2026-10-17, base commit d28f355)

S0 = the user's exact sentence (see `backend/tests/chat/test_u0_s0.py`). Method: ran `ChatEngine.handle` (chat v2) and `MockExtractor` (legacy v1 rules) on the synthetic fixture; no network, no Gemini, no `.env`/CSV.

## Corrected diagnosis (supersedes plan §1.1a/§0 first draft)
| Observation | Evidence |
|---|---|
| The user's panel was the **legacy v1 `ChatPanel`** (`POST /messages`). | The string "Trích xuất thông tin (bộ luật cục bộ)" exists only in `frontend/app/components/ChatPanel.jsx:126-129`. |
| v1 **did capture** the allergy (`allergies=('đậu phộng',)`), `max_stops=3`, `meal=dinner`, interests `('bún','phở','chả')`, and asked "Ngân sách này là cho mỗi người hay cả nhóm?". | `MockExtractor().extract(S0)` output. |
| v1 panel **never renders** allergies, party size, area, stops or meal — only duration, budget, interests, mode. | `ChatPanel.jsx:131-143`. This is why it looked like "allergy not recorded": a display gap, not an extraction loss. |
| No Gemini in v1 because `needs_llm()` returns true only when `origin`/`duration_min` is missing (or an unresolved edit); S0 supplies both. | `backend/app/llm/provider.py:299-318`. Rules-first is by design there. |
| v2 engine (`FOODTOUR_CHAT_V2=1`) **also captures** the allergy (`đậu phộng`/peanut), `duration=120`, party 2, budget 500000, area, `prefs.max_stops=3`. | `ChatEngine.handle` output; tests A1, A1b, A5, A8 PASS on C6 (pinned). |
| v2 gaps (fail-before, 6 tests): interests/tastes dropped (A3), `profile.stops` / `profile.day_part` absent (A4, A7), no budget-scope clarify (A6), no `understood` card (A9), no LLM escalation although signals are uncovered (A11). | `test_a3/a4/a6/a7/a9/a11` raw run: `AssertionError 'phở' not found in ''`, `KeyError: 'stops'`, `KeyError: 'day_part'`, `0 != 1`, `[] is not true`, `0 != 1`. |

Caveat: which UI/flag the user's session used is inferred from the label; the live dev server on :8000 was not inspected (rule: do not touch 3000/8000). The plan's UI work therefore also makes the guided v2 panel the default path under `features.guided_ui` and retires the v1 panel from the main flow.

## Results
- With `expectedFailure` markers: Ran 15, OK (expected failures=6).
- Markers stripped (raw): 4 failures + 2 errors = the 6 target cases above; the 9 other tests pass.
- Unexpected-success guard: removing the code that makes a case pass without deleting its marker is an error (cannot rot).
