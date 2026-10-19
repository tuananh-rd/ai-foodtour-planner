"""TavilySearch provider module (OA3 / frozen contract).

Safety, account gate, persistent ledger, and bounding guarantees:
- Pure Python synchronous interface adhering strictly to docs/ONLINE_ASSISTANT_CONTRACT.md.
- Strict from_env factory checking TAVILY_API_KEY, FOODTOUR_TAVILY_ENABLED=1,
  FOODTOUR_TAVILY_FREE_ONLY=1, absolute FOODTOUR_TAVILY_BUDGET_DB, and caps <= 900.
- Missing or invalid configuration results in configured=False and immediate fail-closed disabled status.
- Before uncached outbound search, obtains fresh read-only account usage snapshot (GET /usage).
- Free account gate: verifies Researcher free plan, 0 PAYGO usage/limit, and bounded counters.
- Persistent SQLite ledger reserves 1 credit atomically immediately before POST; failures charged.
- Any reported usage != 1 credit (or missing/malformed) triggers durable block_current_month().
- Explicit basic search payload: basic, general, max_results=3, safe_search=True, auto_parameters=False.
- Public-only HTTPS source URLs; stripped HTML, control characters, and redacted sensitive text.
- Process-salted hash keys only for cache and singleflight; deep copies returned; max 64 items, TTL <= 300s.
- Zero query/key/metadata plaintext logging; zero remote source-page fetching.
"""

from collections import OrderedDict
import copy
from datetime import datetime, timezone
import hashlib
from pathlib import Path
import re
import secrets
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.assistant.conversation import redact_sensitive
from app.llm.provider import ProviderError
from app.providers.search_safety import (
    free_account_remaining,
    public_food_query,
    public_source_url,
)
from app.providers.search_transport import tavily_post, tavily_usage
from app.repositories.search_budget import SearchCreditBudget

CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
HTML_TAGS = re.compile(r"<[^>]*?>")
INSTRUCTION_PATTERNS = re.compile(
    r"\b(?:ignore\s+(?:previous\s+)?instructions?|system\s+prompt|bo\s+qua\s+quy\s+tac|thuc\s+thi\s+code)\b",
    re.IGNORECASE,
)


class TavilySearch:
    def __init__(
        self,
        api_key: str = "",
        *,
        configured: bool = False,
        budget: Optional[SearchCreditBudget] = None,
        clock: Optional[Callable[[], datetime]] = None,
        search_transport: Optional[Callable[..., dict]] = None,
        usage_transport: Optional[Callable[..., dict]] = None,
        max_cache_size: int = 64,
        cache_ttl_s: float = 300.0,
    ):
        self.api_key = api_key
        self.configured = bool(configured and budget and budget.valid and api_key)
        self.budget = budget
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.search_transport = search_transport or tavily_post
        self.usage_transport = usage_transport or tavily_usage
        self.max_cache_size = min(max(1, int(max_cache_size)), 64)
        self.cache_ttl_s = min(max(0.0, float(cache_ttl_s)), 300.0)

        # Process-salted hash key salt (random 16 bytes hex, never logs query plaintext)
        self._salt = secrets.token_hex(16)
        self._lock = threading.Lock()
        self._cache: OrderedDict[str, Tuple[dict, float]] = OrderedDict()
        self._in_flight: Dict[str, Tuple[threading.Event, Dict[str, Any]]] = {}

    @classmethod
    def from_env(
        cls,
        env: Optional[Dict[str, str]] = None,
        *,
        clock: Optional[Callable[[], datetime]] = None,
        search_transport: Optional[Callable[..., dict]] = None,
        usage_transport: Optional[Callable[..., dict]] = None,
        budget: Optional[SearchCreditBudget] = None,
    ) -> "TavilySearch":
        if env is None:
            import os
            env = os.environ

        # Read configuration parameters
        api_key = env.get("TAVILY_API_KEY", "")
        enabled = env.get("FOODTOUR_TAVILY_ENABLED", "")
        free_only = env.get("FOODTOUR_TAVILY_FREE_ONLY", "")
        db_path = env.get("FOODTOUR_TAVILY_BUDGET_DB", "")
        daily_raw = env.get("FOODTOUR_TAVILY_DAILY_CREDITS")
        monthly_raw = env.get("FOODTOUR_TAVILY_MONTHLY_CREDITS")

        # 1. API key: non-empty string when stripped
        if not isinstance(api_key, str) or not api_key.strip():
            return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)

        # 2. Enabled flag must be exactly '1'
        if enabled != "1":
            return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)

        # 3. Free only flag must be exactly '1'
        if free_only != "1":
            return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)

        # 4. Limits parsing and bound checks
        try:
            daily_limit = int(daily_raw) if daily_raw is not None and str(daily_raw).strip() != "" else 20
            monthly_limit = int(monthly_raw) if monthly_raw is not None and str(monthly_raw).strip() != "" else 500
        except (ValueError, TypeError):
            return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)

        if not (0 < daily_limit <= monthly_limit <= 900):
            return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)

        # 5. Persistent budget database path
        if budget is None:
            if not isinstance(db_path, str) or not db_path.strip():
                return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)
            path_obj = Path(db_path.strip())
            if not path_obj.is_absolute():
                return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)

            budget_inst = SearchCreditBudget(
                str(path_obj),
                daily_limit=daily_limit,
                monthly_limit=monthly_limit,
                clock=clock,
            )
        else:
            budget_inst = budget

        if not budget_inst.valid:
            return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)

        return cls(
            api_key=api_key.strip(),
            configured=True,
            budget=budget_inst,
            clock=clock,
            search_transport=search_transport,
            usage_transport=usage_transport,
        )

    def _now_iso(self) -> str:
        moment = self.clock()
        if isinstance(moment, (int, float)):
            moment = datetime.fromtimestamp(moment, timezone.utc)
        elif not hasattr(moment, "tzinfo") or moment.tzinfo is None:
            moment = moment.replace(tzinfo=timezone.utc)
        else:
            moment = moment.astimezone(timezone.utc)
        return moment.strftime("%Y-%m-%dT%H:%M:%SZ")

    @staticmethod
    def _empty_result(status: str, credits: int = 0, cached: bool = False) -> dict:
        return {
            "status": status,
            "sources": [],
            "fetched_at": None,
            "credits": credits,
            "cached": cached,
        }

    def search(self, query: str, *, deadline_s: float = 6.0) -> dict:
        """Executes a bounded search query conforming exactly to docs/ONLINE_ASSISTANT_CONTRACT.md."""
        if not self.configured or not self.budget or not self.budget.valid:
            return self._empty_result("disabled", credits=0, cached=False)

        sanitized_query = public_food_query(query)
        if sanitized_query is None:
            return self._empty_result("rejected", credits=0, cached=False)

        # Process-salted hash key (never persists or maps raw query plaintext)
        cache_key = hashlib.sha256((self._salt + sanitized_query).encode("utf-8")).hexdigest()
        now_mono = time.monotonic()

        # 1. Check cache (atomic lock)
        with self._lock:
            if cache_key in self._cache:
                entry, expires_at = self._cache[cache_key]
                if now_mono < expires_at:
                    self._cache.move_to_end(cache_key)
                    cached_res = copy.deepcopy(entry)
                    cached_res["cached"] = True
                    cached_res["credits"] = 0
                    return cached_res
                else:
                    del self._cache[cache_key]

            # 2. Check singleflight (concurrency deduplication)
            if cache_key in self._in_flight:
                event, holder = self._in_flight[cache_key]
                is_leader = False
            else:
                event = threading.Event()
                holder = {}
                self._in_flight[cache_key] = (event, holder)
                is_leader = True

        if not is_leader:
            # Follower: wait for leader execution
            wait_timeout = max(0.01, float(deadline_s))
            completed = event.wait(timeout=wait_timeout)
            if not completed or "result" not in holder:
                return self._empty_result("unavailable", credits=0, cached=False)
            shared = copy.deepcopy(holder["result"])
            shared["credits"] = 0
            if shared.get("status") == "ok":
                shared["cached"] = True
            return shared

        # Leader: execute uncached pipeline
        t0 = time.monotonic()
        result = None
        try:
            result = self._execute_uncached_search(sanitized_query, cache_key, float(deadline_s), t0)
            return copy.deepcopy(result)
        finally:
            with self._lock:
                holder["result"] = result or self._empty_result("unavailable", credits=0, cached=False)
                event.set()
                self._in_flight.pop(cache_key, None)

    def _execute_uncached_search(
        self,
        sanitized_query: str,
        cache_key: str,
        deadline_s: float,
        t0: float,
    ) -> dict:
        def remaining() -> float:
            return max(0.0, deadline_s - (time.monotonic() - t0))

        if remaining() <= 0.05:
            return self._empty_result("unavailable", credits=0, cached=False)

        # --- Step 1: Fresh read-only account usage snapshot (GET /usage) ---
        usage_dl = min(3.0, remaining())
        if usage_dl <= 0.05:
            return self._empty_result("unavailable", credits=0, cached=False)

        try:
            usage_snapshot = self.usage_transport(self.api_key, deadline_s=usage_dl)
        except ProviderError as e:
            if e.kind == "quota":
                return self._empty_result("quota", credits=0, cached=False)
            return self._empty_result("unavailable", credits=0, cached=False)
        except Exception:
            return self._empty_result("unavailable", credits=0, cached=False)

        remaining_credits = free_account_remaining(usage_snapshot)
        if remaining_credits is None:
            # Unknown, paid, missing, malformed, or PAYGO account -> fail closed
            return self._empty_result("unavailable", credits=0, cached=False)
        if remaining_credits <= 0:
            return self._empty_result("quota", credits=0, cached=False)

        if remaining() <= 0.05:
            return self._empty_result("unavailable", credits=0, cached=False)

        # --- Step 2: Persistent ledger admission (SearchCreditBudget.admit) ---
        try:
            self.budget.admit()
        except ProviderError as e:
            if e.kind == "quota":
                return self._empty_result("quota", credits=0, cached=False)
            return self._empty_result("unavailable", credits=0, cached=False)
        except Exception:
            return self._empty_result("unavailable", credits=0, cached=False)

        # From this point on, 1 credit is committed; transport failures are conservatively charged
        if remaining() <= 0.05:
            return self._empty_result("unavailable", credits=1, cached=False)

        # --- Step 3: Outbound search POST (/search) ---
        post_dl = remaining()
        payload = {
            "query": sanitized_query,
            "search_depth": "basic",
            "topic": "general",
            "max_results": 3,
            "include_answer": False,
            "include_raw_content": False,
            "include_images": False,
            "include_usage": True,
            "safe_search": True,
            "auto_parameters": False,
        }

        try:
            response = self.search_transport(payload, self.api_key, deadline_s=post_dl)
        except ProviderError as e:
            if e.kind == "quota":
                return self._empty_result("quota", credits=1, cached=False)
            return self._empty_result("unavailable", credits=1, cached=False)
        except Exception:
            return self._empty_result("unavailable", credits=1, cached=False)

        # --- Step 4: Validate reported usage ---
        # Missing/malformed usage.credits or anything != exact 1 (reject bool) => block_current_month()
        usage_block = response.get("usage") if isinstance(response, dict) else None
        credits_reported = usage_block.get("credits") if isinstance(usage_block, dict) else None

        is_exact_one = (
            (type(credits_reported) is int)
            and (not isinstance(credits_reported, bool))
            and (credits_reported == 1)
        )

        if not is_exact_one:
            try:
                self.budget.block_current_month()
            except Exception:
                pass
            return self._empty_result("unavailable", credits=1, cached=False)

        # --- Step 5: Sanitize results and build sources ---
        raw_results = response.get("results")
        if not isinstance(raw_results, list):
            raw_results = []

        sources = []
        for item in raw_results:
            if not isinstance(item, dict):
                continue
            url = item.get("url")
            if not public_source_url(url):
                continue

            raw_title = item.get("title")
            title_str = str(raw_title) if raw_title is not None else ""
            title_str = HTML_TAGS.sub(" ", title_str)
            title_str = CONTROL_CHARS.sub(" ", title_str)
            title_str = redact_sensitive(title_str)
            title_clean = " ".join(title_str.split())[:160]

            raw_snippet = item.get("content") or item.get("snippet") or ""
            snippet_str = str(raw_snippet) if raw_snippet is not None else ""
            snippet_str = HTML_TAGS.sub(" ", snippet_str)
            snippet_str = CONTROL_CHARS.sub(" ", snippet_str)
            snippet_str = redact_sensitive(snippet_str)
            if INSTRUCTION_PATTERNS.search(snippet_str):
                continue
            snippet_clean = " ".join(snippet_str.split())[:500]

            sources.append({
                "title": title_clean or "Nguồn tham khảo",
                "url": str(url)[:2048],
                "snippet": snippet_clean,
            })
            if len(sources) >= 3:
                break

        result = {
            "status": "ok",
            "sources": sources,
            "fetched_at": self._now_iso(),
            "credits": 1,
            "cached": False,
        }

        # Store in LRU cache
        with self._lock:
            if len(self._cache) >= self.max_cache_size:
                self._cache.popitem(last=False)
            self._cache[cache_key] = (copy.deepcopy(result), time.monotonic() + self.cache_ttl_s)

        return result
