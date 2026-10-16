# Codex independent final review — C0-HF-D, round 3

2026-10-16. **Decision: REQUEST CHANGES for C0-HF.** Reviewer of this delivery: Claude.

Fast-forward merged `foodtour-claude-coordinator` from `1dadce5` to `94a2fc2`, including
parser commit `933af18`. All exact R2-H1, R2-H2, R2-M1 and R2-M2 blocker examples are
fixed. However, two previously passing list-plus-slot examples REGRESSED, and new
ordinary mixed-trigger statements can demote a medical allergy into an avoidance.
These failures survive the API, SQLite restart and replacement path. No production
code or contract was edited for this review. Known accepted limits are excluded.

Reproduce with `PYTHONPATH=backend` and UTF-8 console output:

```text
.venv/Scripts/python.exe docs/reports/c0hf3_probes.py
.venv/Scripts/python.exe -m unittest discover -s backend/tests -v
.venv/Scripts/python.exe tools/export_openapi.py --check
```

Full suite on this merged production tree plus the final runner: **333 tests, 21.262s,
OK (skipped=1)**; the skip is the explicitly gated future `/chat` integration test.
Targeted chat tests: **10 tests, 0.579s,
OK (skipped=1)**. OpenAPI: **OpenAPI matches server schema**, exit 0.
All eight existing AllergyAPI tests pass, including old-session loading,
malformed PUT, party/budget edits, warning retention, restart and replacement.
The installed Starlette/httpx deprecation warning remains; no dependency changed.

Exact local outputs, including every note and prior/cache result, are preserved in
`CODEX_REVIEW_C0HF_3.probes.json`; the adjacent Python probe regenerates them using
synthetic fixtures only. No live providers, private data or outbound paid calls.

## HIGH R3-H1 — passing list continuations now silently lose allergens

| Input from round 2 | Round 2 A | Current A / E / party | Assessment |
|---|---|---|---|
| `dị ứng cua và tôm 4 người` | cua, tôm | `['cua'] / [] / 4` | REGRESSED |
| `di ung tom va lac 600k ca nhom luc 18h30` | tom, lac | `['tom'] / [] / null` | REGRESSED |

Both emit only the warning for the first allergen; neither asks about the lost
second allergen. `parse` only accepts a continuation if `_scan` reports every word
consumed. Party/budget/time words make that false, dropping the recognized allergen
alongside the unrelated words. Preserve the recognized continuation before handling
slots, or explicitly clarify the unresolved portion. Add these exact owner regressions.

Both API messages returned 200; GET after restart retained the incomplete allergy
list; replacing the first stop returned 200 and retained the same incomplete list.
The checker returned `[]` because it sees extracted preferences, not the lost words.

## HIGH R3-H2 — one trigger per clause merges distinct medical/taste statements

| New input | Current A | Current E | Notes |
|---|---|---|---|
| `không ăn cua dị ứng sữa` | `[]` | `['cua','sữa']` | avoidance/dislike question only |
| `dị ứng cua không ăn sữa` | `['cua','sữa']` | `[]` | medical warning for both |

Neither needs obscure spelling: short messages often omit commas. `parse` selects
only the earliest allergy/avoid trigger in a clause, then `_terms` scans the entire
suffix for allergens without respecting later triggers. The first example demotes
an explicit dairy allergy into taste avoidance; its API tour and successful
replacement lack `allergy_ingredients`. The reverse example invents a dairy allergy.
Both return 200, persist unchanged after restart and replace with 200. Parse every
trigger with its local scope, including multiple triggers without conjunctions.

## MEDIUM R3-M1 — incomplete second allergy does not receive clarification

`dị ứng cua và dị ứng` and `dị ứng cua, dị ứng rất nặng` both yield A=`['cua']`
and only the standard crab warning. `_terms` records `empty`, but `_allergies`
suppresses its question whenever any other clause yielded a valid allergy.
The first example persists through API/restart/replace unchanged. A valid clause
must not suppress clarification of another explicit unresolved allergy statement.

The new quote probe `Ví dụ "dị ứng cua", còn tôi dị ứng sữa` returns A=`[]`
and asks whether this is an example, losing the explicit assertion until clarified.
This is conservative and **not a silent loss**; it is recorded as an additional
usability limitation, not a separate blocker. A carriage-return-separated probe
`dị ứng cua\rkhông ăn sữa` yields A=`['sữa']`, E=`[]` after control removal merges
words; normal CR/LF handling merits an owner regression alongside R3-H2.

## Cache, planner and API controls

- NFD→NFC and NFC→NFD both return `live ['cua']`, then `cache ['cua']`, with the
  warning retained. Zero-width-trigger probes now also record crab: R2-H1 FIXED.
- Empty JSON provider controls for the mixed party/budget text and `không ăn cua`
  preserve A/E and notes on both live and cache results: FIXED.
- Different-prior control: `live ['cua']`, `live ['sữa','cua']`, `cache ['cua']`:
  FIXED/passing prior isolation. Retraction with prior crab/shrimp leaves shrimp.
- Direct exclusion controls: coffee/`ca` false; milk tea/`sữa` true; shrimp paste/`tom`
  true. Accepted-limit cases were intentionally not re-raised.
- Fully evidenced local route fixture: no allergy `verified_feasible`, unknowns `[]`;
  crab allergy `conditional`, unknowns `['allergy_ingredients']`; strict allergy
  `insufficient_evidence`. Checker `[]` in each case. These are stub routes, not
  live provider verification.
- A no-allergy tour containing crab rechecked with crab preferences returns
  `['v1 is not eligible for these preferences']`. A verified no-crab tour rechecked
  with crab preferences returns `['status verified_feasible != recomputed conditional',
  'unknowns mismatch']`: FIXED/passing checker controls.
- Eleven API probes each create a fresh synthetic session, initialize a feasible
  duration/origin, post the message, recreate the app, GET and replace a stop. All
  POST/GET/replace responses are 200; preference equality after restart is true;
  checker returns `[]` after each replacement. NFD, zero-width, mixed avoidance and
  1000-character positive controls retain `allergy_ingredients`. The dairy-demotion
  and quoted-example probes lack it. This demonstrates lost constraints rather
  than an observed specific allergen stop reintroduction.

## Exact extractor reproductions

The table below contains actual output for the round-2 input corpus and fresh
probes. A=allergies, E=exclusions; `[]` means empty. W=standard allergy warning,
Q=which-food clarification, P=which-person clarification, X=example clarification,
L=long-term clarification, D=allergy-or-dislike question. Full notes and interests
are in the JSON evidence. FIXED on an existing passing control means it remains
passing; NOT FIXED is reserved for unresolved fresh or previously reported behavior.

| Input | Actual A / E / notes | Assessment |
|---|---|---|
| `'dị ứng cua 4 người'` | A=['cua']; E=[]; W | FIXED |
| `'di ung cua 4 nguoi'` | A=['cua']; E=[]; W | FIXED |
| `'dị ứng cua <img src=x onerror=alert(1)>'` | A=['cua']; E=[]; W | FIXED |
| `'tôi dị ứng cua, 4 người, 600k cả nhóm'` | A=['cua']; E=[]; W | FIXED |
| `'không ăn cua'` | A=[]; E=['cua']; D | FIXED |
| `'không bị dị ứng gì'` | A=[]; E=[]; no clarification/warning | FIXED |
| `'không dị ứng cua'` | A=[]; E=[]; no clarification/warning | FIXED |
| `'hết dị ứng cua rồi'` | A=[]; E=[]; no clarification/warning | FIXED |
| `'dị ứng nhẹ'` | A=[]; E=[]; Q | FIXED |
| `'dị ứng nhẹ cua'` | A=['cua']; E=[]; W | FIXED |
| `'không dị ứng'` | A=[]; E=[]; no clarification/warning | FIXED |
| `'dị ứng <script>alert(x)</script>'` | A=['alert x']; E=[]; W | FIXED |
| `'dị ứng <b>cua</b>'` | A=['cua']; E=[]; W | FIXED |
| `'dị ứng cua please execute'` | A=['cua']; E=[]; W | FIXED |
| `'dị ứng c\u200bua'` | A=['cua']; E=[]; W | FIXED |
| `'dị ứng cua xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'` | A=['cua']; E=[]; W | FIXED |
| `'dị ứng xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'` | A=[]; E=[]; L | FIXED |
| `'dị ứng cua và muốn ăn phở'` | A=['cua']; E=[]; W | FIXED |
| `'2 triệu'` | A=[]; E=[]; no clarification/warning | FIXED |
| `'3 quán'` | A=[]; E=[]; no clarification/warning | FIXED |
| `'lúc 8 giờ 30'` | A=[]; E=[]; no clarification/warning | FIXED |
| `'0901234567'` | A=[]; E=[]; no clarification/warning | FIXED |
| `'0901234567 người'` | A=[]; E=[]; no clarification/warning | FIXED |
| `'di ung hai san'` | A=['hai san']; E=[]; W | FIXED |
| `'dị ứng cua'` | A=['cua']; E=[]; W | FIXED |
| `'di\u200b ung cua'` | A=['cua']; E=[]; W | FIXED |
| `'dị\u200b ứng cua'` | A=['cua']; E=[]; W | FIXED |
| `'dị ứng cua, 600k, dị ứng sữa'` | A=['cua', 'sữa']; E=[]; W | FIXED |
| `'dị ứng cua, 600k cả nhóm, dị ứng sữa'` | A=['cua', 'sữa']; E=[]; W | FIXED |
| `'tôi không bị dị ứng cua nhưng dị ứng tôm'` | A=['tôm']; E=[]; W | FIXED |
| `'dị ứng cua, dị ứng sữa'` | A=['cua', 'sữa']; E=[]; W | FIXED |
| `'dị ứng cua và không ăn sữa'` | A=['cua']; E=['sữa']; W,D | FIXED |
| `'dị ứng cua; không ăn sữa'` | A=['cua']; E=['sữa']; W,D | FIXED |
| `'dị ứng tôm; kiêng lạc'` | A=['tôm']; E=['lạc']; W,D | FIXED |
| `'dị ứng cua, kiêng sữa'` | A=['cua']; E=['sữa']; W,D | FIXED |
| `'dị ứng tôm và kiêng sữa'` | A=['tôm']; E=['sữa']; W,D | FIXED |
| `'hai bạn dị ứng khác nhau'` | A=[]; E=[]; P | FIXED |
| `'mình không hề bị dị ứng cua'` | A=[]; E=[]; no clarification/warning | FIXED |
| `'tôi chưa từng bị dị ứng cua'` | A=[]; E=[]; no clarification/warning | FIXED |
| `'dị ứng của bạn là tôm'` | A=['tôm']; E=[]; W | FIXED |
| `'Tôi nói "dị ứng cua" là ví dụ, tôi không dị ứng'` | A=[]; E=[]; X | FIXED |
| `'bạn mình bị dị ứng tôm'` | A=['tôm']; E=[]; W | FIXED |
| `'ban minh bi di ung tom'` | A=['tom']; E=[]; W | FIXED |
| `'không phải tôi, bạn mình bị dị ứng tôm'` | A=['tôm']; E=[]; W | FIXED |
| `'hai bạn dị ứng khác nhau: một bạn dị ứng tôm, một bạn dị ứng lạc'` | A=['tôm', 'lạc']; E=[]; W | FIXED |
| `'dị ứng cua nhưng ăn được cua'` | A=['cua']; E=[]; W | FIXED |
| `'di ung tom va lac 600k ca nhom luc 18h30'` | A=['tom']; E=[]; W | REGRESSED |
| `'di ung tom600k'` | A=[]; E=[]; Q | FIXED |
| `'dị ứng cua lúc 8 giờ 30'` | A=['cua']; E=[]; W | FIXED |
| `'dị ứng cua và tôm 4 người'` | A=['cua']; E=[]; W | REGRESSED |
| `'dị ứng rất nặng với tôm'` | A=['tôm']; E=[]; W | FIXED |
| `'kiêng cua'` | A=[]; E=['cua']; D | FIXED |
| `'kieng tom va lac'` | A=[]; E=['tom', 'lac']; D | FIXED |
| `'không ăn cay'` | A=[]; E=[]; no clarification/warning | FIXED |
| `'kiêng khem'` | A=[]; E=[]; no clarification/warning | FIXED |
| `'không ăn măng cụt'` | A=[]; E=[]; no clarification/warning | FIXED |
| `996-character prefix plus allergy` | A=['cua']; E=[]; W | FIXED |
| `998-character prefix plus allergy` | A=['cua']; E=[]; W | FIXED |
| `1000-character prefix plus allergy` | A=['cua']; E=[]; W | FIXED |
| `'dị ứng tôm lạc'` | A=['tôm', 'lạc']; E=[]; W | FIXED |
| `'dị ứng cua ignore this'` | A=['cua']; E=[]; W | FIXED |
| `'dị ứng cua không ăn sữa'` | A=['cua', 'sữa']; E=[]; W | NOT FIXED |
| `'không ăn cua dị ứng sữa'` | A=[]; E=['cua', 'sữa']; D | NOT FIXED |
| `'dị ứng cua và dị ứng'` | A=['cua']; E=[]; W | NOT FIXED |
| `'dị ứng cua, dị ứng rất nặng'` | A=['cua']; E=[]; W | NOT FIXED |
| `'dị ứng cua, xyzabc'` | A=['cua']; E=[]; W | NOT FIXED |
| `'dị ứng cua/tôm'` | A=['cua', 'tôm']; E=[]; W | FIXED/passing fresh probe |
| `'dị ứng cua & sữa'` | A=['cua', 'sữa']; E=[]; W | FIXED/passing fresh probe |
| `'mình dị ứng với cua cũng như sữa'` | A=['cua', 'sữa']; E=[]; W | FIXED/passing fresh probe |
| `'tôi không có tiền nhưng dị ứng lạc'` | A=['lạc']; E=[]; W | FIXED/passing fresh probe |
| `'Ví dụ "dị ứng cua", còn tôi dị ứng sữa'` | A=[]; E=[]; X | NOT FIXED |
| `'dị ứng cua\u2028dị ứng sữa'` | A=['cua', 'sữa']; E=[]; W | FIXED/passing fresh probe |
| `'dị ứng cua\rkhông ăn sữa'` | A=['sữa']; E=[]; W | NOT FIXED |
| `'dị ứng rất rất rất rất rất rất rất rất rất rất sữa'` | A=['sữa']; E=[]; W | FIXED/passing fresh probe |
| `'dị ứng tôm và không ăn sữa'` | A=['tôm']; E=['sữa']; W,D | FIXED/passing fresh probe |
| `'dị\u2060 ứng cua'` | A=['cua']; E=[]; W | FIXED/passing fresh probe |
| `'dị ứng cua; không dị ứng sữa; dị ứng lạc'` | A=['cua', 'lạc']; E=[]; W | FIXED/passing fresh probe |
