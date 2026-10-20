"""TavilySearch provider module (OA3 / frozen contract).

Safety, account gate, persistent ledger, and bounding guarantees:
- Pure Python synchronous interface adhering strictly to docs/ONLINE_ASSISTANT_CONTRACT.md.
- Strict from_env factory checking TAVILY_API_KEY, FOODTOUR_TAVILY_ENABLED=1,
  FOODTOUR_TAVILY_FREE_ONLY=1, absolute FOODTOUR_TAVILY_BUDGET_DB, and caps <= 900.
- Explicit blank or invalid environment limit caps fail closed (configured=False).
- Injected budget cannot exceed explicit configured limits.
- Before uncached outbound search, obtains fresh read-only account usage snapshot (GET /usage).
- Free account gate: verifies Researcher free plan, 0 PAYGO usage/limit, and bounded counters.
- Persistent SQLite ledger reserves 1 credit atomically immediately before POST; failures charged.
- Any reported usage != exact 1 credit (missing, malformed, bool, !=1) sets in-process fail-closed
  fuse BEFORE attempting persistent month block.
- In-process fail-closed fuse blocks future searches even if SQLite block write fails.
- Distinct-query concurrency bounded by configurable cap (default 2, max <= 4); inflight registry
  capacity exhaustion returns honest unavailable with 0 credits and 0 POSTs.
- Same-query singleflight coalesces duplicate queries to exactly 1 POST.
- Finite positive deadline validated and clamped overall <= 6.0s for leaders/followers.
- Expired POST rejected before caching success.
- Strict response schema: results must exist and be list; non-dict items and invalid types dropped.
- Malformed response never successfully cached.
- Both titles and snippets validated against instruction patterns, sensitive redaction leaks,
  allergy-clearance claims, and health disclosures using fold_uncached.
- LRU cache validity checks both monotonic TTL and injected wall-clock window (rejects backwards/stale drift).
- Process-salted hash keys only for cache and singleflight; deep copies returned; max 64 items, TTL <= 300s.
- Zero query/key/metadata plaintext logging; zero remote source-page fetching.
"""

from collections import OrderedDict
import copy
from datetime import datetime, timezone
import hashlib
import math
from pathlib import Path
import re
import secrets
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.assistant.conversation import (
    RE_ALLERGY_CLEARANCE,
    is_health_or_allergy_disclosure,
    redact_sensitive,
)
from app.llm.provider import ProviderError
from app.planner.relevance import fold_uncached
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
    r"\b(?:"
    r"ignore(?:\s+all|\s+previous)?\s+instructions?"
    r"|instructions?"
    r"|system(?:\s+prompt)?"
    r"|prompt"
    r"|bo\s+qua\s+(?:quy\s+tac|huong\s+dan|chi\s+dan)"
    r"|thuc\s+thi(?:\s+code)?"
    r"|ghi\s+db"
    r"|api\s*key"
    r"|token"
    r"|secret"
    r"|password"
    r")\b",
    re.IGNORECASE,
)
FOLDED_ALLERGY_PATTERNS = re.compile(
    r"(?:"
    r"an\s+toan.*di\s+ung"
    r"|khong\s+(?:lo|so)\s+di\s+ung"
    r"|dam\s+bao\s+khong\s+(?:bi\s+)?di\s+ung"
    r"|hoan\s+toan\s+an\s+toan"
    r"|cam\s+ket\s+an\s+toan"
    r"|tuyet\s+doi\s+an\s+toan"
    r"|khong\s+chua\s+chat\s+di\s+ung"
    r"|khong\s+(?:he\s+)?co\s+(?:lac|dau\s+phong|hai\s+san|tom|cua|trung|sua|gluten)"
    r"|allergy\s+free"
    r"|guaranteed\s+allergy"
    r"|100%\s+safe"
    r")",
    re.IGNORECASE,
)


def _is_source_unsafe(title: str, snippet: str) -> bool:
    """Validate both title and snippet against injections, allergy claims, and redactions."""
    for text in (title, snippet):
        if not text:
            continue
        # Sensitive redaction tags or unredacted leaks
        if redact_sensitive(text) != text or "[redacted_" in text:
            return True
        # Health disclosures
        if is_health_or_allergy_disclosure(text):
            return True
        # Allergy clearance claims (exact diacritics)
        if RE_ALLERGY_CLEARANCE.search(text):
            return True
        # Folded checks (diacritics stripped, lowercase)
        folded = fold_uncached(text)
        if INSTRUCTION_PATTERNS.search(folded):
            return True
        if FOLDED_ALLERGY_PATTERNS.search(folded):
            return True
    return False


class TavilySearch:
    _process_fuse_blown: bool = False

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
        max_concurrent_searches: int = 2,
    ):
        self.api_key = api_key
        self.configured = bool(configured and budget and budget.valid and api_key)
        self.budget = budget
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.search_transport = search_transport or tavily_post
        self.usage_transport = usage_transport or tavily_usage
        self.max_cache_size = min(max(1, int(max_cache_size)), 64)
        self.cache_ttl_s = min(max(0.0, float(cache_ttl_s)), 300.0)
        self.max_concurrent_searches = min(max(1, int(max_concurrent_searches)), 4)

        # Thread-safe in-process fail-closed fuse
        self._fuse_blown: bool = False

        # Process-salted hash key salt (never logs query plaintext)
        self._salt = secrets.token_hex(16)
        self._lock = threading.Lock()
        # _cache: key -> (deepcopy(result), wall_time, expires_mono)
        self._cache: OrderedDict[str, Tuple[dict, datetime, float]] = OrderedDict()
        self._in_flight: Dict[str, Tuple[threading.Event, Dict[str, Any]]] = {}

    @classmethod
    def _reset_process_fuse_for_testing(cls) -> None:
        """Reset in-process fuse for clean hermetic testing only."""
        cls._process_fuse_blown = False

    @classmethod
    def from_env(
        cls,
        env: Optional[Dict[str, str]] = None,
        *,
        clock: Optional[Callable[[], datetime]] = None,
        search_transport: Optional[Callable[..., dict]] = None,
        usage_transport: Optional[Callable[..., dict]] = None,
        budget: Optional[SearchCreditBudget] = None,
        max_concurrent_searches: int = 2,
    ) -> "TavilySearch":
        if env is None:
            import os
            env = os.environ

        # Read configuration parameters
        api_key = env.get("TAVILY_API_KEY", "")
        enabled = env.get("FOODTOUR_TAVILY_ENABLED", "")
        free_only = env.get("FOODTOUR_TAVILY_FREE_ONLY", "")
        db_path = env.get("FOODTOUR_TAVILY_BUDGET_DB", "")

        # 1. API key: non-empty string when stripped
        if not isinstance(api_key, str) or not api_key.strip():
            return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)

        # 2. Enabled flag must be exactly '1'
        if enabled != "1":
            return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)

        # 3. Free only flag must be exactly '1'
        if free_only != "1":
            return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)

        # 4. Limits parsing: explicit blank or invalid values fail closed
        if "FOODTOUR_TAVILY_DAILY_CREDITS" in env:
            daily_raw = env.get("FOODTOUR_TAVILY_DAILY_CREDITS")
            if daily_raw is None or (isinstance(daily_raw, str) and not daily_raw.strip()):
                return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)
            try:
                daily_limit = int(daily_raw)
            except (ValueError, TypeError):
                return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)
        else:
            daily_limit = 20

        if "FOODTOUR_TAVILY_MONTHLY_CREDITS" in env:
            monthly_raw = env.get("FOODTOUR_TAVILY_MONTHLY_CREDITS")
            if monthly_raw is None or (isinstance(monthly_raw, str) and not monthly_raw.strip()):
                return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)
            try:
                monthly_limit = int(monthly_raw)
            except (ValueError, TypeError):
                return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)
        else:
            monthly_limit = 500

        if not (0 < daily_limit <= monthly_limit <= 900):
            return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)

        # 5. Persistent budget database or injected budget
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
            # Injected budget cannot exceed explicit configured caps
            if not budget.valid:
                return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)
            if budget.daily_limit > daily_limit or budget.monthly_limit > monthly_limit:
                return cls(configured=False, clock=clock, search_transport=search_transport, usage_transport=usage_transport)
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
            max_concurrent_searches=max_concurrent_searches,
        )

    def _current_wall_time(self) -> datetime:
        moment = self.clock()
        if isinstance(moment, (int, float)):
            return datetime.fromtimestamp(moment, timezone.utc)
        if not hasattr(moment, "tzinfo") or moment.tzinfo is None:
            return moment.replace(tzinfo=timezone.utc)
        return moment.astimezone(timezone.utc)

    def _now_iso(self) -> str:
        return self._current_wall_time().strftime("%Y-%m-%dT%H:%M:%SZ")

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
        # 0. Check in-process fail-closed broken-credit fuse
        if self._fuse_blown or TavilySearch._process_fuse_blown:
            return self._empty_result("unavailable", credits=0, cached=False)

        # 1. Config readiness & budget validity
        if not self.configured or not self.budget or not self.budget.valid:
            return self._empty_result("disabled", credits=0, cached=False)

        # 2. Finite positive deadline validation & overall clamping
        if (
            not isinstance(deadline_s, (int, float))
            or isinstance(deadline_s, bool)
            or not math.isfinite(deadline_s)
            or deadline_s <= 0.0
        ):
            return self._empty_result("unavailable", credits=0, cached=False)
        clamped_deadline = min(float(deadline_s), 6.0)

        # 3. Input query sanitization
        sanitized_query = public_food_query(query)
        if sanitized_query is None:
            return self._empty_result("rejected", credits=0, cached=False)

        # Process-salted hash key (never persists or maps raw query plaintext)
        cache_key = hashlib.sha256((self._salt + sanitized_query).encode("utf-8")).hexdigest()
        now_mono = time.monotonic()
        now_wall = self._current_wall_time()

        # 4. Cache & Concurrency check (atomic lock)
        with self._lock:
            if cache_key in self._cache:
                entry, cached_wall_time, expires_mono = self._cache[cache_key]
                wall_diff_s = (now_wall - cached_wall_time).total_seconds()
                # Validate monotonic TTL AND wall-clock window (no backward drift, no stale drift)
                if now_mono < expires_mono and 0.0 <= wall_diff_s <= self.cache_ttl_s:
                    self._cache.move_to_end(cache_key)
                    cached_res = copy.deepcopy(entry)
                    cached_res["cached"] = True
                    cached_res["credits"] = 0
                    return cached_res
                else:
                    del self._cache[cache_key]

            # Inflight singleflight or concurrency check
            if cache_key in self._in_flight:
                event, holder = self._in_flight[cache_key]
                is_leader = False
            elif len(self._in_flight) >= self.max_concurrent_searches:
                # Inflight registry at capacity for distinct queries -> honest unavailable
                return self._empty_result("unavailable", credits=0, cached=False)
            else:
                event = threading.Event()
                holder = {}
                self._in_flight[cache_key] = (event, holder)
                is_leader = True

        if not is_leader:
            # Follower: wait for leader execution within bounded deadline
            wait_timeout = clamped_deadline
            completed = event.wait(timeout=wait_timeout)
            elapsed = time.monotonic() - now_mono
            if not completed or elapsed > clamped_deadline or "result" not in holder:
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
            result = self._execute_uncached_search(sanitized_query, cache_key, clamped_deadline, t0)
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

        # Reject late/expired POST before caching success
        elapsed_after_post = time.monotonic() - t0
        if elapsed_after_post > deadline_s:
            return self._empty_result("unavailable", credits=1, cached=False)

        # --- Step 4: Validate reported usage ---
        # Missing/malformed usage.credits or anything != exact 1 (reject bool) => in-process fuse & block_current_month()
        usage_block = response.get("usage") if isinstance(response, dict) else None
        credits_reported = usage_block.get("credits") if isinstance(usage_block, dict) else None

        is_exact_one = (
            (type(credits_reported) is int)
            and (not isinstance(credits_reported, bool))
            and (credits_reported == 1)
        )

        if not is_exact_one:
            # 1. Thread-safe in-process fail-closed broken-credit fuse set FIRST
            with self._lock:
                self._fuse_blown = True
                TavilySearch._process_fuse_blown = True
            # 2. Durable month block in ledger
            try:
                self.budget.block_current_month()
            except Exception:
                pass
            return self._empty_result("unavailable", credits=1, cached=False)

        # --- Step 5: Strict response schema validation ---
        # results key must exist and must be a list
        if not isinstance(response, dict) or "results" not in response or not isinstance(response["results"], list):
            # Malformed response never successfully cached empty
            return self._empty_result("unavailable", credits=1, cached=False)

        raw_results = response["results"]
        sources = []
        for item in raw_results:
            # Non-dict item or typed-invalid entries fail closed as malformed schema
            if not isinstance(item, dict):
                return self._empty_result("unavailable", credits=1, cached=False)

            raw_url = item.get("url")
            if raw_url is not None and not isinstance(raw_url, str):
                return self._empty_result("unavailable", credits=1, cached=False)

            raw_title = item.get("title")
            if raw_title is not None and not isinstance(raw_title, str):
                return self._empty_result("unavailable", credits=1, cached=False)

            raw_content = item.get("content")
            if raw_content is not None and not isinstance(raw_content, str):
                return self._empty_result("unavailable", credits=1, cached=False)

            raw_snippet = item.get("snippet")
            if raw_snippet is not None and not isinstance(raw_snippet, str):
                return self._empty_result("unavailable", credits=1, cached=False)

            # Public URL validation (content filter, skips non-public URL)
            if not isinstance(raw_url, str) or not public_source_url(raw_url):
                continue

            # Bound raw text before regex / sanitization
            title_str = (raw_title or "")[:1000]
            title_str = HTML_TAGS.sub(" ", title_str)
            title_str = CONTROL_CHARS.sub(" ", title_str)
            title_clean = " ".join(title_str.split())[:160]

            snippet_raw = (raw_content or raw_snippet or "")[:5000]
            snippet_str = HTML_TAGS.sub(" ", snippet_raw)
            snippet_str = CONTROL_CHARS.sub(" ", snippet_str)
            snippet_clean = " ".join(snippet_str.split())[:500]

            # Validate BOTH title and snippet for injections, allergy claims, sensitive disclosures
            if _is_source_unsafe(title_clean, snippet_clean):
                continue

            sources.append({
                "title": title_clean or "Nguồn tham khảo",
                "url": str(raw_url)[:2048],
                "snippet": snippet_clean,
            })
            if len(sources) >= 3:
                break

        # Check overall deadline after sanitization before caching or returning ok
        if time.monotonic() - t0 > deadline_s:
            return self._empty_result("unavailable", credits=1, cached=False)

        result = {
            "status": "ok",
            "sources": sources,
            "fetched_at": self._now_iso(),
            "credits": 1,
            "cached": False,
        }

        # Store in LRU cache with monotonic TTL and wall time
        with self._lock:
            if len(self._cache) >= self.max_cache_size:
                self._cache.popitem(last=False)
            self._cache[cache_key] = (
                copy.deepcopy(result),
                self._current_wall_time(),
                time.monotonic() + self.cache_ttl_s,
            )

        return result
