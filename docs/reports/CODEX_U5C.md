# U5c — independent final non-UI engine gate

## Freeze receipt (recorded before evaluation or protected diff review)

- Engine merged from `foodtour-claude-coordinator`: `cd5f6694fc95ebff9d542cbfdead6a7127daa3ae`.
- Corpus commit: `608dcd082cd6acc01d95b0f647e527821f9ad67d`.
- `qa/chat/guided_blind_v3.jsonl` SHA256: `597f0146f86c9efc8dcec43d0f81ef9e071e8fd79d565daa5a6dc0fda20983a1`.
- 225 synthetic cases, including 50 individually authored one-shot requests, 59 allergy-tagged cases, 52 budget-tagged cases, 75 time-tagged cases, 70 stops/party-tagged cases, 50 tastes-tagged cases, 15 style/injection cases and 10 multi-turn sequences. Coverage overlaps.
- Authoring record `qa/chat/build_blind_v3.py` imports no engine. The 50 one-shots use distinct structures; no v1/v2 sentence template expansion. Expected values are evaluator judgement; ambiguous scope stays unknown and ambiguous allergy cues require clarification.
- No engine/chat or LLM diff since `595bde8` read before freeze. No live providers, keys, private CSV, servers, push or deploy.

Evaluation and gate evidence pending.
