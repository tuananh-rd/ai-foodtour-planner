# U5a independent guided-engine evaluation

Reviewer: Codex; author/reviewer of fixes: Claude. Synthetic fixtures only; zero live LLM calls.

## Blind freeze (recorded before evaluation or engine inspection)

Engine baseline: `23fc905` (merged `foodtour-claude-coordinator`). Corpus commit:
`305e2f1553a14035b00e2d9eebe0618ad36bd309`.

| Frozen file | Cases | SHA256 (working file bytes) |
| --- | ---: | --- |
| qa/chat/guided_blind_v1.jsonl | 190 | 48f30ebb3bccc5e230f247a2ab2a1a7d2f1e8c78a8bc903b0521842d8cbc68da |
| qa/chat/guided_blind_v2.jsonl | 152 | 998eeab138b5ef07a5f31df9ce7a4891562163d99e9cd06ae1d3bc304e609585 |

Both corpora and the application-independent generator were committed before opening
`backend/app/chat/*.py`. Only the two permitted usage tests were read. v1 contains
48 one-shot multi-clause requests, 32 dedicated allergy examples plus removal sequences,
24 duration/leg examples, 24 dedicated budget examples, 16 dedicated time examples,
16 dedicated stop examples, 16 dislike examples, and 12 slot-injection examples.
Categories overlap with the one-shot requests. v2 is held out and must not be run
until Claude fixes the v1 findings. No gold labels will be changed after first run;
any ambiguous-label caveats will be recorded separately.

## First run

Pending; no evaluation has been executed at this freeze checkpoint.
