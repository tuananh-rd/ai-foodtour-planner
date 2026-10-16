# Chat v2 — private dataset aggregate run (Claude, 2026-10-16)

Script: `qa/live/chat_private_agg.py` with `FOODTOUR_DATA_PATH` pointing at the private CSV (not committed). **Aggregates only — no venue names, addresses or ids.** Engine-level (no HTTP, no providers, no LLM).

```json
{
 "dataset_rows": 1702,
 "conversations": 40,
 "searches_with_zero_results": 0,
 "cards_total": 190,
 "flag_counts": {
  "few_reviews": 56,
  "price_unknown": 2
 },
 "cards_hours_missing": 0,
 "cards_price_missing": 2,
 "cards_few_reviews": 56,
 "plan_status": {
  "conditional": 36,
  "no_solution": 3
 },
 "errors": 0,
 "latency_ms": {
  "search": {
   "n": 80,
   "p50": 54.2,
   "p95": 68.7
  },
  "compare": {
   "n": 39,
   "p50": 49.9,
   "p95": 65.2
  },
  "add": {
   "n": 78,
   "p50": 50.4,
   "p95": 56.2
  },
  "allergy_search": {
   "n": 40,
   "p50": 61.0,
   "p95": 70.6
  },
  "plan_summary": {
   "n": 78,
   "p50": 48.7,
   "p95": 59.6
  },
  "plan": {
   "n": 39,
   "p50": 0.5,
   "p95": 0.6
  }
 }
}
```

Reading: 40 scripted conversations (10 dishes × 4 districts) + 40 allergy searches (cua). No search returned zero results within 1.5 km; 56/190 cards carry the 'ít đánh giá' flag and 2/190 'giá chưa rõ'; every card had source hours text (shown as 'nguồn ghi', never as open-now). 3 of 39 confirmed plans were honest conflicts (`no_solution`, options offered) instead of silently smaller tours. Turn latency p50≈50 ms, p95≈70 ms; zero exceptions.
