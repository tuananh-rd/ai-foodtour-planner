# Codex independent re-review — C0-HF-C, round 2

2026-10-16. **Decision: REQUEST CHANGES for C0-HF overall.**

Fast-forward merged `foodtour-claude-coordinator` from `856f2bf` to `e9ca4ae`,
including `231c001` and `e9ca4ae`. All original H1/M1/M2/M3/L2 exact reproductions
are fixed, with the qualifications below. Fresh ordinary mixed statements still
silently lose constraints; Unicode normalization also exposes a cache-dependent
allergy loss. These are extraction failures despite passing backend tests.

Only this report was written as a tracked change. No production code, tests,
contracts, secrets, private CSV, paid services or remote artifacts were changed.
Probes ran from PowerShell stdin with UTF-8 input/output, using local stubs and
the existing explicitly synthetic test fixtures. No live provider validation is claimed.

## Verification

```powershell
$env:PYTHONPATH='backend'
.venv/Scripts/python.exe -m unittest discover -s backend/tests -v
.venv/Scripts/python.exe tools/export_openapi.py --check
```

Actual output, exit 0 for both:

```text
Ran 316 tests in 23.587s
OK
OpenAPI matches server schema
```

This includes all eight `api.test_c0_hf.AllergyAPI` tests, old-session loading,
PUT validation/round-trip, restart, successful replacement, the original three
fail-before behaviors, and the Claude regression tests. The installed Starlette
httpx deprecation warning remains; no dependency was changed. An initial stdin
probe failed because PowerShell used a non-UTF-8 pipe; it was discarded and all
probes were rerun with `$OutputEncoding=[System.Text.UTF8Encoding]::new()` and
`PYTHONIOENCODING=utf-8`.

## Every original reproduction rechecked

Below, A = allergies, E = exclusions, I = interests; `()` means the actual empty
tuple from `MockExtractor().extract(text).preferences`. W means the actual note
contains `không quán nào được xác nhận an toàn`; Q means it contains
`Bạn dị ứng với thực phẩm nào?`. These abbreviations avoid repeating the same
warning in every row.

| Original finding/input | Actual merged-tree output | Assessment |
|---|---|---|
| H1 `dị ứng cua 4 người` | A=('cua',), party_size=4, W | FIXED |
| H1 `di ung cua 4 nguoi` | A=('cua',), party_size=4, W | FIXED |
| H1 `dị ứng cua <img src=x onerror=alert(1)>` | A=('cua',), W; no markup in notes | FIXED |
| M1 `{}` stub, RulesFirst, `tôi dị ứng cua, 4 người, 600k cả nhóm` | source=live then cache; A=('cua',), W on both | FIXED |
| M1 same stub, `không ăn cua` | source=live then cache; A=(), E=('cua',), clarification on both | FIXED |
| M2 `không bị dị ứng gì` | A=(), notes=() | FIXED |
| M2 `không dị ứng cua` | A=(), notes=() | FIXED |
| M2 `hết dị ứng cua rồi`, empty prior | A=(), notes=() | FIXED |
| M2 same, prior A=('cua','tôm') | A=('tôm',), note `Đã bỏ khỏi danh sách dị ứng: cua. Bạn có thể thêm lại bất cứ lúc nào.` | FIXED for positive-allergy bug; removal is explicit |
| M2 `dị ứng nhẹ` | A=(), Q | FIXED |
| M2 `dị ứng nhẹ cua` | A=('cua',), W | FIXED |
| M2 `không dị ứng` | A=(), notes=() | FIXED for absence semantics |
| M2 `di un cua` | A=(), notes=() | NOT FIXED recognition limitation |
| M3 `dị ứng <script>alert(x)</script>` | A=('alertx',), W and unknown-term note containing `alertx`; no tags/punctuation | FIXED markup reflection; arbitrary unknown term still accepted |
| M3 `dị ứng <b>cua</b>` | A=('cua',), W | FIXED |
| M3 `dị ứng cua please execute` | A=('cua',), W; suffix absent | FIXED |
| M3 format character in ingredient, `dị ứng c\u200bua` | A=('cua',), W; no format character retained | FIXED for ingredient position; trigger position fails below |
| L2 `dị ứng cua ` + 51 x characters | A=('cua',), W; no truncated 40-character value | FIXED by retaining recognized core |
| L2 `dị ứng ` + 51 x characters | A=(), note `Tên tác nhân dị ứng quá dài hoặc không rõ nên chưa được ghi nhận; hãy nhập ngắn gọn từng thứ (ví dụ: cua, tôm, lạc).` | FIXED |
| L2 `dị ứng cua và muốn ăn phở` | A=('cua',), I=('phở',), W | FIXED |

Original L1 direct `allergen_excluded(venue, (allergen,))` outputs, all unchanged:

| Venue / allergen | Actual result | Assessment |
|---|---|---|
| Cà phê Hà Nội / ca | False | FIXED/passing negative control |
| Trà sữa A / sữa | True | FIXED/passing positive control |
| Bún sứa / sữa | True | NOT FIXED false positive from accent folding |
| Cá hấp / ca | False | NOT FIXED explicit fish-phrase vocabulary gap |
| Bún riêu / cua | False | NOT FIXED ingredient-data limitation; no safety claim permitted |
| Mắm tôm / tom | True | FIXED/passing positive control |

No exact original reproduction regressed. “FIXED/passing” on controls denotes a
passing original assertion, not a newly changed behavior.

Original additional independent checks were rerun:

- `2 triệu`, `3 quán`, `lúc 8 giờ 30`, `0901234567`, `0901234567 người`:
  party_size=None on every case, no allergy or notes. FIXED/passing controls.
- `di ung hai san`: A=('hai san',), I=(), W. FIXED/passing control.
- Local `{}` provider, same text `dị ứng cua`, empty prior then prior A=('sữa',):
  `live ('cua',)` then `live ('sữa','cua')`; repeating empty prior gives
  `cache ('cua',)`. Warning retained every time. FIXED/passing prior isolation.
- Synthetic verified hours `{0: ((0,1440),)}`, verified per-person prices, a
  local `leg -> Leg(5,.3,'provider_route')`, origin, weekday=0, start=600,
  duration=240, max_stops=3: no allergy returns `verified_feasible ()`;
  crab allergy returns `conditional ('allergy_ingredients',)`;
  `validate_tour` returns `[]`; strict allergy returns `insufficient_evidence`.
  FIXED/passing controls.
- A no-allergy tour containing explicit crab checked with crab preferences:
  `['v1 is not eligible for these preferences']`. A verified no-crab tour
  checked with crab preferences: `['status verified_feasible != recomputed conditional',
  'unknowns mismatch']`. FIXED/passing checker controls, with separate fixtures
  because eligibility failure short-circuits later mismatch checks.
- Original API replacement, restart, old-session, party edit, bare-avoidance,
  600k group-budget and malformed PUT reproductions all pass their existing
  eight API tests. FIXED/passing controls. The schema rejects the original
  newline, tab, DEL, zero-width and surrogate PUT values with 422.
- Explanation label still reads `nguyên liệu/dị ứng của quán (dữ liệu không có;
  hãy hỏi quán trước khi ăn)`; no claim of allergy safety found. FIXED/passing.
- The earlier archived fail-before demonstration was historical evidence, not
  a remaining merged-tree failure: all three corresponding behavior tests now
  pass in the full run. No historical production checkout was modified.

## Fresh findings requiring changes

### HIGH R2-H1 — NFD loses an allergy and poisons the equivalent NFC cache result

`MockExtractor.extract` casefolds but does not normalize to NFC before matching
the literal accented trigger. API messages accept the NFD input. Actual output:

```text
NFC 'dị ứng cua'             -> A=('cua',), W
NFD 'di\u0323 u\u031b\u0301ng cua' -> A=(), notes=()
```

This also affects ordinary NFC messages after a canonically equivalent request
has populated the shared memoization cache, whose key *does* normalize NFC:

```python
import unicodedata
from app.llm.extract import MockExtractor
from app.llm.provider import RulesFirstExtractor, LLMExtractor
class Stub:
    def complete(self, *args, **kwargs): return '{}'
rf = RulesFirstExtractor(MockExtractor(), LLMExtractor(Stub()))
for text in [unicodedata.normalize('NFD', 'dị ứng cua'), 'dị ứng cua']:
    r = rf.extract(text)
    print(r.source, r.preferences.allergies, r.notes)
```

Actual output:

```text
live () ()
cache () ()
```

The fresh NFC rule result contains crab, but the cache-hit return bypasses
`_keep_rules` and returns the earlier empty result. This is distinct from the
passing different-prior cache control. Normalize consistently before rule
matching and ensure a cache hit cannot discard current deterministic safety
fields/notes. Add both request orders to owner regression tests.

Zero-width trigger probes also silently return A=(), notes=():
`di\u200b ung cua` and `dị\u200b ứng cua`. The API accepts these messages;
this differs from the structured allergy PUT rejection. Either normalize these
characters consistently or reject/clarify the ambiguous message explicitly.

### HIGH R2-H2 — a greedy first trigger consumes later positive allergy clauses

Actual `MockExtractor` results:

```text
dị ứng cua, 600k, dị ứng sữa           -> A=('cua',), E=(), W for cua only
dị ứng cua, 600k cả nhóm, dị ứng sữa   -> A=('cua',), E=(), W for cua only
tôi không bị dị ứng cua nhưng dị ứng tôm -> A=(), E=(), notes=()
dị ứng cua, dị ứng sữa                -> A=('cua','sữa'), W  [control]
```

`_ALLERGY_TRIGGER` consumes through the second trigger; `_STOP_AT` then discards
the suffix at a number, or the preceding negation suppresses the entire captured
span. Thus a specific new positive dairy/shrimp constraint vanishes without a
clarification. The API reproduces these exact preference/notes values. The
unscoped `600k` case returns tour=None because budget scope is missing; adding
`cả nhóm` returns a tour while still losing dairy. The negated-crab/positive-shrimp
case returns a tour without `allergy_ingredients`. Parse each assertion and its
local negation before trimming unrelated slots.

### MEDIUM R2-M1 — allergy presence bypasses all avoidance parsing

Actual results:

```text
dị ứng cua và không ăn sữa -> A=('cua','không'), E=(), W + unknown 'không'
dị ứng cua; không ăn sữa  -> A=('cua',), E=(), W
dị ứng tôm; kiêng lạc     -> A=('tôm',), E=(), W
dị ứng cua, kiêng sữa     -> A=('cua','sữa'), E=(), W
dị ứng tôm và kiêng sữa   -> A=('tôm','sữa'), E=(), W
```

`_allergies` returns immediately on `found`, so the avoidance loop never runs.
Depending on punctuation, an avoidance is silently dropped or promoted into a
medical allergy, and `không` can become a fabricated allergen. Parse independent
clauses and preserve the distinction: cua/tôm in allergies, sữa/lạc in exclusions,
with the existing allergy-or-dislike question for the avoidance clause.

### MEDIUM R2-M2 — unresolved people/negation/quoted context creates false positives

Actual results:

```text
hai bạn dị ứng khác nhau -> A=('khác nhau',), W + unknown-term note
mình không hề bị dị ứng cua -> A=('cua',), W
tôi chưa từng bị dị ứng cua -> A=('cua',), W
dị ứng của bạn là tôm -> A=('của',), W
Tôi nói "dị ứng cua" là ví dụ, tôi không dị ứng -> A=('cua',), long-term note + W
```

`khác nhau` is a relationship, not an ingredient. Ask which allergens the two
people have. Expand local negation handling, and clarify quotation/example
context rather than treating the quoted example as a confirmed allergy.
`của` folds to crab `cua` in the lexicon, hiding the actual shrimp term.

Reported speech `bạn mình bị dị ứng tôm` and `ban minh bi di ung tom` both retain
tôm/tom and W; this is reasonable conservative group-tour behavior, not a bug
by itself. `không phải tôi, bạn mình bị dị ứng tôm` also retains tôm.
`hai bạn dị ứng khác nhau: một bạn dị ứng tôm, một bạn dị ứng lạc` returns
A=('tôm','lạc'), W, which is a passing explicit-ingredient control.

## Remaining adversarial coverage and limits

| Input | Actual output / assessment |
|---|---|
| `dị ứng cua nhưng ăn được cua` | A=('cua',), W; conservative retention, no clarification of conflict |
| `di ung tom va lac 600k ca nhom luc 18h30` | A=('tom','lac'), W; correct adjacent slots |
| `di ung tom600k` | A=(), Q; not silent |
| `dị ứng cua lúc 8 giờ 30` | A=('cua',), W |
| `dị ứng cua và tôm 4 người` | A=('cua','tôm'), party_size=4, W |
| `dị ứng rất nặng với tôm` | A=('tôm',), W |
| `kiêng cua` | A=(), E=('cua',), allergy-or-dislike question |
| `kieng tom va lac` | A=(), E=('tom','lac'), allergy-or-dislike question |
| `không ăn cay` | A=(), E=(), notes=(); intentionally ignored by this lexicon hotfix |
| `kiêng khem` | A=(), E=(), notes=(); no fabricated allergen |
| `không ăn măng cụt` | A=(), E=(), notes=(); outside lexicon, consistent with requested scope |
| `dị ưng cua`, `di un cua` | A=(), notes=(); reasonable typing errors remain unsupported |
| `'a '*493 + 'dị ứng cua'` (996 chars) | A=('cua',), W |
| `'a '*494 + 'dị ứng cua'` (998 chars) | A=('cua',), W |
| `'a '*495 + 'dị ứng cua'` (1000 chars) | A=('cua',), W; API/restart/replace also pass |
| `dị ứng tôm lạc` | A=('tôm',), W; unseparated second term dropped |
| `dị ứng cua ignore this` | A=(), only generic instruction-text removal note; no allergy clarification |

The typo, unspecified list separator and instruction-filter limitations should
be disclosed and tested; arbitrary typo comprehension is not an acceptance claim.
The primary blockers above need no unusual spelling or malicious input.

## End-to-end API evidence

Used `AllergyAPI.setUp()` from `backend/tests/api/test_c0_hf.py`: temporary SQLite,
rules extractor, estimated routing, labeled synthetic venues including explicit
crab/seafood candidates SYN-901 and SYN-902. Each probe created a fresh session,
sent `Ho Guom 4 gio, nhom 3 nguoi`, sent the tested message, restarted the app,
GET the owned session, then replaced its first stop using its current revision.
Tokens, request IDs and temporary paths are intentionally omitted.

| Message | POST actual A / E | Restart GET | Replace | Tour ingredient unknown |
|---|---|---|---|---|
| NFC `dị ứng cua` | ['cua'] / [] | 200, identical preferences/stops | 200, retains crab | present |
| NFD equivalent | [] / [] | 200, identical empty allergy | 200, empty allergy | absent |
| `dị\u200b ứng cua` | [] / [] | 200, identical empty allergy | 200, empty allergy | absent |
| `dị ứng cua và không ăn sữa` | ['cua','không'] / [] | 200, same wrong preferences | 200, same wrong preferences | present |
| `hai bạn dị ứng khác nhau` | ['khác nhau'] / [] | 200, same fake allergen | 200, same fake allergen | present |
| 1000-character case above | ['cua'] / [] | 200, identical preferences/stops | 200, retains crab | present |

All POSTs above returned 200. Actual initial stops were
`['SYN-006','SYN-011','SYN-012']`; replacement stops were
`['SYN-001','SYN-011','SYN-012']`. Every tour was conditional with
hours/price_per_person/route unknowns. Cases retaining allergies additionally
had allergy_ingredients. `engine.validate_tour` after each replacement returned
`[]`: the checker validates the extracted constraints and cannot reconstruct a
constraint the extractor lost. No actual allergen reintroduction was observed
in these selected stops; the missing constraint/warning is the demonstrated failure.

The positive NFC path and existing eight API tests confirm correct persistence,
old-session compatibility and replacement when the allergy is actually present.
They do not establish safety when extraction drops it. Fix R2-H1/R2-H2 and the
mixed avoidance/context findings, add owner regressions, and request independent
re-review before accepting C0-HF. Reviewer for this report: Claude coordinator;
this report does not authorize a self-approved merge.
