# Online assistant local operation

Latest UI delivery: **http://127.0.0.1:3100**, Warm editorial production frontend9af6126 compiled for isolated API8100 (synthetic/rules, process-only Tavily disabled and LLM off). Read reports/FIGMA_WARM_EDITORIAL_ACCEPTANCE.md for final evidence and visual limits. This supersedes older3060 references as the current Figma UI test URL; old servers and local backend/.env/caps remain preserved. No provider calls occur in this isolated mode. Citation success/failure is separately tested using explicit mocked external transport, not live Tavily/Gemini.

Implementation acceptance is tracked in [ONLINE_ASSISTANT_BOARD](reports/ONLINE_ASSISTANT_BOARD.md) and [CODEX_REVIEW](reports/online-assistant/CODEX_REVIEW.md). A running process, successful build or mock response is not live-provider acceptance.

## Configuration boundaries

Configure external credentials only in the ignored local `backend/.env`, never chat, a frontend environment variable, screenshots or a committed file. Existing Gemini configuration and persistent limits are reused; no grounding, billing, account registration or paid Maps service is activated. Do not erase a usage ledger when restarting.

Tavily is disabled unless all required local settings are supplied:

- `TAVILY_API_KEY`: an existing account credential, configured locally only.
- `FOODTOUR_TAVILY_ENABLED=1` and `FOODTOUR_TAVILY_FREE_ONLY=1`: explicit opt-in after checking the account remains free-only.
- `FOODTOUR_TAVILY_BUDGET_DB`: an absolute path to a persistent SQLite file in an existing writable private directory, for example the ignored project `.venv` directory.
- `FOODTOUR_TAVILY_DAILY_CREDITS=20` and `FOODTOUR_TAVILY_MONTHLY_CREDITS=500`: conservative defaults; lower existing limits must be preserved. Caps must be positive integers, daily <= monthly <=900.

These are credits, not a promised number of requests. Explicit BASIC normally reports1 credit; missing or unexpected usage blocks the current month persistently. Attempts are reserved before transport, including failed attempts; retries are never automatic. A fresh read-only /usage gate must prove the supported Researcher plan with zero PAYGO settings and a bounded provider-side key limit before uncached search. Unknown/missing/paid account responses fail closed. Local counters cannot measure other applications sharing the account or prevent a human concurrently changing its settings. Missing configuration, exhausted caps and network errors must remain visible; no simulated search is labelled live.

The user explicitly opts into each web query. Only a bounded public food/area query is eligible; no GPS, private venue records or complete conversation history is attached. Sensitive or instruction-bearing input is rejected locally. Provider text is untrusted quoted content with source URLs and retrieval time, never proof of current opening or allergy safety. Search cannot update planner constraints, confirm a tour or write venue data.

## Local preview modes

Use an available port pair and verify its owner before starting. Do not stop a user server. The task-owned development pair is web3060/API8060; verify current health/build before treating it as a test target.

API launcher examples, from the repository root:

```powershell
.venv/Scripts/python.exe tools/run_online_assistant.py --port=8060 --web-port=3060 --dataset synthetic --llm off
.venv/Scripts/python.exe tools/run_online_assistant.py --port=8060 --web-port=3060 --dataset local --llm existing
```

Run only one API process on that port. Synthetic/rules mode is for reproducible regression evidence. Local/existing mode requires the already-configured dataset and Gemini settings; a local dataset must never be relabelled synthetic or committed with screenshots/records. The launcher refuses a missing local dataset rather than substituting fixtures. It bounds the existing Gemini daily cap and reuses persistent accounting; it does not authorize unlimited provider calls.

Frontend launcher:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/run_upgrade_preview.ps1 -Component frontend -WebPort 3060 -ApiPort 8060
```

The frontend API URL is a build-time setting. A production build created with another API URL must be rebuilt with the intended settings; changing only the start-process environment is insufficient. A separate web port also needs the corresponding API CORS origin, using the API launcher matching `--web-port`.

## Local basemap

The pilot PMTiles asset is2,138,597 bytes, limited to the documented Hoan Kiem bounds/zooms, with OSM source freshness2026-10-18T04:00Z. Provenance, SHA256 and licensing are in `frontend/public/maps/README.md`; retain visible OSM/Protomaps attribution. Serve same-origin with HTTP Range206 and versioned caching. No remote tile fallback or Google Maps API is configured.

Markers represent supplied stop coordinates. The basemap does not provide a computed walking route; free Google Maps URLs open actual external navigation. Missing coordinates, outside-pilot points and failed loading must be disclosed. Archive size is measured for this pilot only; browser/server bandwidth, storage, freshness maintenance and broader-area hosting are finite resources.

## Acceptance limits

Local credential is now present (one nonempty entry, ignored backend/.env; never printed). Current local smoke caps are1 credit/day and3/month, preserving any lower configured limits and the persistent ledger. Gemini settings/limits are unchanged; no Gemini calls occurred in this step.

Live Tavily remains BLOCKED despite successful read-only /usage HTTP200: supported free plan is recognized, but account.paygo_limit and key.limit are null. The existing adapter requires an integer zero PAYGO limit and a positive bounded provider-side key limit. Null is not evidence of zero or a safe limit; no search POST was sent, no citations were fabricated, local reserved-credit delta is0. Sanitized evidence: reports/online-assistant/tavily-live-smoke.json. No account/billing setting or guard was modified.

Current test URL remains http://127.0.0.1:3060 (production frontend3696001), synthetic venue data/deterministic rules, real Tavily credential configured but account gate blocked. Configured in health means the credential/local settings exist, not that the account gate has passed. Gemini live quality remains PARTIAL. Source code/UI did not change, so the already-green full suites were not repeated.

To use after resolving the provider-side metadata blocker, open the chat tab, explicitly select Tra web, and send only a public food/area query. The backend freshly checks /usage before every uncached search. Do not include GPS, personal history or private venue records. Do not repeatedly retry the blocked search. Inspect the existing Tavily dashboard/key settings manually if needed; keep the account free, require PAYGO disabled/zero and a finite positive key limit. No setting change is performed by the app, and no new live attempt is authorized by these instructions alone. A UI failure must remain honest until a later bounded probe establishes success.
> RETIRED WEB SETUP — direct user direction2026-10-19: do not configure/activate/probe Tavily. The new discovery runtime ignores old Tavily settings; local credentials and ledgers must be preserved. Use DISCOVERY_ASSISTANT_REQUIREMENTS.md and reports/DISCOVERY_ASSISTANT_BOARD.md for current behavior. Remaining content is historical and not an execution guide.

