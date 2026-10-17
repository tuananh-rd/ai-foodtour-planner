# U5d independent evaluation

Freeze receipt (recorded before scoring): dataset `qa/chat/guided_blind_v4.jsonl`, 220 synthetic cases, SHA256 `88bfb7627ede1e19b1b60163ef0e8eda2f044f3f4ddd8f513b10a6b8e32e8c91`; freeze commit `08dd4d7fc0853371cd6aa8dd3c5fe85a48d43c84`.

Engine commit `0dde2116c6d5d2421000bb3afa90c158e081b350`. Restricted engine diffs were not read before freeze. Only v3 schema/first-row expected values were inspected, with text/prior omitted. New structures and dishes were authored without reading previous sentences. Mix: 88 one-shot / 55 allergy / 33 numeric / 22 preference / 22 adversarial. Ambiguous cases expect hold/question; exact accuracy and safety are separate. No live providers, servers, private CSV, keys, or deployment.

First-run results pending.
