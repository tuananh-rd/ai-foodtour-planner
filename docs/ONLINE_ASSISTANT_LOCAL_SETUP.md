# Online assistant local operation

Implementation acceptance is tracked in [ONLINE_ASSISTANT_BOARD](reports/ONLINE_ASSISTANT_BOARD.md) and [CODEX_REVIEW](reports/online-assistant/CODEX_REVIEW.md). A running process, successful build or mock response is not live-provider acceptance.

## Configuration boundaries

Configure external credentials only in the ignored local `backend/.env`, never chat, a frontend environment variable, screenshots or a committed file. Existing Gemini configuration and persistent limits are reused; no grounding, billing, account registration or paid Maps service is activated. Do not erase a usage ledger when restarting.

Tavily is disabled unless all required local settings are supplied:

- `TAVILY_API_KEY`: an existing account credential, configured locally only.
- `FOODTOUR_TAVILY_ENABLED=1` and `FOODTOUR_TAVILY_FREE_ONLY=1`: explicit opt-in after checking the account remains free-only.
- `FOODTOUR_TAVILY_BUDGET_DB`: an absolute path to a persistent SQLite file in an existing writable private directory, for example the ignored project `.venv` directory.
- `FOODTOUR_TAVILY_DAILY_CREDITS=20` and `FOODTOUR_TAVILY_MONTHLY_CREDITS=500`: conservative defaults; lower existing limits must be preserved. Caps must be positive integers, daily <= monthly <=900.

These are credits, not a promised number of requests. Explicit BASIC normally reports1 credit; missing or unexpected usage blocks the current month persistently. Attempts are reserved before transport, including failed attempts; retries are never automatic. Local counters cannot measure other applications sharing the account or certify its billing settings. Missing configuration, exhausted caps and network errors must remain visible; no simulated search is labelled live.

The user explicitly opts into each web query. Only a bounded public food/area query is eligible; no GPS, private venue records or complete conversation history is attached. Sensitive or instruction-bearing input is rejected locally. Provider text is untrusted quoted content with source URLs and retrieval time, never proof of current opening or allergy safety. Search cannot update planner constraints, confirm a tour or write venue data.

## Local preview modes

Use an available port pair and verify its owner before starting. Do not stop a user server. The task-owned development pair is web3060/API8060; verify current health/build before treating it as a test target.

API launcher examples, from the repository root:

```powershell
.venv/Scripts/python.exe tools/run_online_assistant.py --port8060 --web-port3060 --dataset synthetic --llm off
.venv/Scripts/python.exe tools/run_online_assistant.py --port8060 --web-port3060 --dataset local --llm existing
```

Run only one API process on that port. Synthetic/rules mode is for reproducible regression evidence. Local/existing mode requires the already-configured dataset and Gemini settings; a local dataset must never be relabelled synthetic or committed with screenshots/records. The launcher refuses a missing local dataset rather than substituting fixtures. It bounds the existing Gemini daily cap and reuses persistent accounting; it does not authorize unlimited provider calls.

Frontend launcher:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/run_upgrade_preview.ps1 -Component frontend -WebPort3060 -ApiPort8060
```

The frontend API URL is a build-time setting. A production build created with another API URL must be rebuilt with the intended settings; changing only the start-process environment is insufficient. A separate web port also needs the corresponding API CORS origin, using the API launcher matching `--web-port`.

## Local basemap

The pilot PMTiles asset is2,138,597 bytes, limited to the documented Hoan Kiem bounds/zooms, with OSM source freshness2026-10-18T04:00Z. Provenance, SHA256 and licensing are in `frontend/public/maps/README.md`; retain visible OSM/Protomaps attribution. Serve same-origin with HTTP Range206 and versioned caching. No remote tile fallback or Google Maps API is configured.

Markers represent supplied stop coordinates. The basemap does not provide a computed walking route; free Google Maps URLs open actual external navigation. Missing coordinates, outside-pilot points and failed loading must be disclosed. Archive size is measured for this pilot only; browser/server bandwidth, storage, freshness maintenance and broader-area hosting are finite resources.

## Acceptance limits

Live Tavily is blocked until the local credential/configuration exists. Earlier bounded Gemini probing produced one accepted greeting and one rejected reply; multi-turn live quality remains partial. Final integrated browser/visual/regression evidence must be recorded separately from these setup instructions.
