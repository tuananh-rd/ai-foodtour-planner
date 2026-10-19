# Báo cáo Triển khai TavilySearch Provider (OA3)

**Tác giả:** Antigravity (Worker)  
**Điều phối & Tích hợp:** Codex (Coordinator)  
**Nhiệm vụ:** `task_cafccd0b53b1` | **Dispatch:** `ctx_7cfcf1f8c1a9`  
**Ngày thực hiện:** 2026-10-19  
**Tài liệu hợp đồng chuẩn:** `docs/ONLINE_ASSISTANT_CONTRACT.md`

---

## 1. Tóm tắt Thực hiện (Executive Summary)

Em (Antigravity) đã hoàn thành trọn vẹn việc hiện thực hóa provider tìm kiếm `TavilySearch` tại [`backend/app/providers/tavily.py`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/backend/app/providers/tavily.py) cùng bộ kiểm thử đơn vị độc lập tại [`backend/tests/providers/test_tavily.py`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/backend/tests/providers/test_tavily.py). 

Provider tuân thủ nghiêm ngặt hợp đồng đóng băng của Online Assistant, áp dụng nguyên tắc fail-closed bảo vệ ngân sách: xác thực tài khoản free qua `GET /usage` trước khi admit/POST, trừ hạn mức nguyên tử qua SQLite ledger, kiểm tra usage credits trả về (khóa cứng cả tháng nếu phát hiện tính phí bất thường), giới hạn tải basic an toàn, làm sạch dữ liệu đầu vào/đầu ra, và hỗ trợ LRU cache kèm singleflight in-flight deduplication bằng process-salted hash key.

Tất cả 18 test cases unit test hermetic đã vượt qua thành công 100% với thời gian chạy dưới 0.5s mà không có bất kỳ regression nào trên các provider helpers hiện hữu.

---

## 2. Kiến trúc & Hiện thực Chi tiết

### 2.1. Cấu hình & Factory `TavilySearch.from_env`
- **Tên biến môi trường đầy đủ:**
  - `FOODTOUR_TAVILY_ENABLED`: Bắt buộc phải là `"1"`.
  - `FOODTOUR_TAVILY_FREE_ONLY`: Bắt buộc phải là `"1"`.
  - `TAVILY_API_KEY`: Chuỗi không rỗng sau khi trim.
  - `FOODTOUR_TAVILY_BUDGET_DB`: Đường dẫn tuyệt đối đến file SQLite ledger.
  - `FOODTOUR_TAVILY_DAILY_CREDITS`: Giới hạn ngày (mặc định 20, ràng buộc $0 < \text{daily} \le \text{monthly} \le 900$).
  - `FOODTOUR_TAVILY_MONTHLY_CREDITS`: Giới hạn tháng (mặc định 500, ràng buộc $\text{daily} \le \text{monthly} \le 900$).
- **Thuộc tính `configured: bool`:**
  - Báo hiệu trạng thái sẵn sàng của cấu hình cho các tầng trên (router/planner).
  - Nếu thiếu key, cờ tắt, sai đường dẫn DB hoặc budget không hợp lệ, `configured` trả về `False` và provider lập tức trả về status `"disabled"` (0 credits, không gọi mạng).

### 2.2. Kiểm soát An toàn Ngân sách & Luồng Thực thi
1. **Làm sạch truy vấn đầu vào:** Sử dụng `public_food_query(query)`. Nếu vi phạm an toàn (injection, từ khóa cấm, rỗng, không liên quan ẩm thực Hà Nội), trả về `"rejected"` (0 credits, không gọi mạng).
2. **LRU Cache & Singleflight:**
   - Khóa cache được băm SHA-256 kết hợp salt ngẫu nhiên sinh theo tiến trình (`secrets.token_hex(16)`), không bao giờ ghi lại truy vấn gốc dạng văn bản thô.
   - Cache hit: trả về bản sao sâu (deep copy) để tránh mutation bên ngoài, gán `"cached": True`, `"credits": 0`, giữ nguyên `fetched_at` ban đầu.
   - Singleflight: sử dụng `threading.Event` đồng bộ hóa các luồng cùng truy vấn đồng thời trong một tiến trình, chỉ 1 luồng leader thực thi POST, các luồng follower chia sẻ kết quả với `"credits": 0`.
3. **Fresh Usage Snapshot (`GET /usage`) - Account Gate:**
   - Trước khi gửi POST tìm kiếm, gọi `usage_transport(api_key, deadline_s)`.
   - Kiểm tra hạn ngạch thông qua `free_account_remaining(snapshot)`.
   - Nếu tài khoản không phải gói free (`Researcher`), là tài khoản trả phí / PAYGO, hoặc hạn ngạch còn lại $\le 0$, provider lập tức dừng lại, trả về `"quota"` hoặc `"unavailable"` với **0 credits** và **0 lần gọi POST**, **0 lượt trừ ledger**.
4. **Trừ hạn mức nguyên tử (Atomic Ledger Admission):**
   - Chỉ khi snapshot xác nhận tài khoản free còn hạn mức, provider mới gọi `self.budget.admit()`.
   - Nếu vượt hạn mức ngày/tháng trong local ledger, trả về `"quota"` (0 credits).
   - Nếu admission thành công, 1 credit được bảo lưu. Kể cả khi lệnh POST sau đó gặp lỗi mạng hoặc timeout, credit này vẫn được tính bảo thủ trong kết quả trả về (`credits: 1`).
5. **Payload Basic Tối thiểu:**
   - Gửi POST tới endpoint tìm kiếm với payload cố định:
     ```json
     {
       "query": sanitized_query,
       "search_depth": "basic",
       "topic": "general",
       "max_results": 3,
       "include_usage": true,
       "safe_search": true,
       "auto_parameters": false
     }
     ```
6. **Kiểm tra Response Usage Credits & Khóa Cứng Tháng (Durable Monthly Block):**
   - Bắt buộc kiểm tra trường `usage.credits` trong JSON response.
   - Kiểm tra chặt chẽ kiểu số nguyên: `type(credits_val) is int and not isinstance(credits_val, bool) and credits_val == 1`.
   - Nếu trường credits bị thiếu, không phải số nguyên, hoặc giá trị $\ne 1$, provider gọi ngay lập tức `self.budget.block_current_month("unexpected usage credits: ...")` vào SQLite ledger.
   - Khóa cứng này có hiệu lực bền vững qua mọi lần khởi động lại ứng dụng, ngăn chặn hoàn toàn việc gọi API cho đến hết tháng hiện tại, và trả về status `"unavailable"` (1 credit).
7. **Làm sạch Kết quả Đầu ra:**
   - URL được xác thực qua `public_source_url(url)` (chỉ chấp nhận HTTPS công khai, loại trừ hoàn toàn IP nội bộ / loopback / SSRF).
   - Title và Snippet được làm sạch HTML tags, ký tự điều khiển, redact dữ liệu nhạy cảm (API key, token, email, số điện thoại).
   - Snippet chứa dấu hiệu instruction prompt injection bị loại bỏ hoàn toàn.
   - Giới hạn tối đa 3 nguồn, title $\le 160$ ký tự, snippet $\le 500$ ký tự, url $\le 2048$ ký tự.

---

## 3. Đánh giá Read-Only Các Helper Được Tái sử dụng (Affected-Implementer Review)

Em đã xem xét cẩn thận và tái sử dụng các helper do Codex phát triển mà không sửa đổi bất kỳ file nào:

1. [`backend/app/providers/search_safety.py`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/backend/app/providers/search_safety.py):
   - `public_food_query`: Kiểm tra an toàn truy vấn ẩm thực rất chặt chẽ, loại bỏ injection và các câu hỏi không an toàn.
   - `public_source_url`: Ngăn chặn SSRF hoàn hảo qua việc phân giải host và kiểm tra dải IP riêng tư (RFC 1918, RFC 4193, loopback, link-local).
   - `free_account_remaining`: Phân tích chính xác snapshot từ GET `/usage`, từ chối nghiêm ngặt các gói paid/PAYGO hoặc snapshot không hợp lệ.
2. [`backend/app/providers/search_transport.py`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/backend/app/providers/search_transport.py):
   - `tavily_usage` và `tavily_post`: Sử dụng urllib tiêu chuẩn không phụ thuộc bên ngoài, áp đặt deadline rõ ràng và ánh xạ lỗi sang `ProviderError` (quota vs transport).
3. [`backend/app/providers/search_budget.py`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/backend/app/providers/search_budget.py):
   - `SearchCreditBudget`: Quản lý SQLite ledger với transaction nguyên tử (`BEGIN IMMEDIATE`), roll-over ngày và tháng chính xác, và phương thức `block_current_month` bền vững giúp bảo vệ tuyệt đối ngân sách.

---

## 4. Kết quả Kiểm thử (Test Evidence)

Bộ kiểm thử đơn vị [`backend/tests/providers/test_tavily.py`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/backend/tests/providers/test_tavily.py) bao gồm 5 nhóm kiểm thử với 18 test cases hermetic:

| Test Class | Test Case | Mục đích & Trạng thái |
| :--- | :--- | :--- |
| **`TavilyConfigTests`** | `test_missing_or_blank_api_key_disables_search` | Trả về `configured=False` khi thiếu API key (PASS) |
| | `test_flags_not_one_disables_search` | Trả về `configured=False` khi `ENABLED` hoặc `FREE_ONLY` $\ne 1$ (PASS) |
| | `test_relative_or_invalid_budget_db_path_disables_search` | Từ chối đường dẫn DB tương đối hoặc rỗng (PASS) |
| | `test_invalid_limits_disables_search` | Từ chối limits không hợp lệ ($> 900$, daily $>$ monthly, số âm) (PASS) |
| | `test_valid_env_configures_searcher_with_defaults` | Cấu hình thành công với các giá trị mặc định hợp lệ (PASS) |
| **`TavilySearchExecutionTests`** | `test_search_disabled_when_not_configured` | Không thực thi mạng khi chưa được cấu hình (PASS) |
| | `test_successful_search_full_pipeline` | Pipeline thành công: snapshot OK $\to$ admit $\to$ POST basic $\to$ sanitize sources (PASS) |
| | `test_account_not_free_plan_fails_closed_zero_admission` | Từ chối gói trả phí / PAYGO / không rõ, 0 admit, 0 POST (PASS) |
| | `test_account_exhausted_fails_closed_zero_admission` | Từ chối khi snapshot báo remaining $\le 0$, 0 admit, 0 POST (PASS) |
| **`TransportErrorAndLimitsTests`** | `test_usage_snapshot_quota_or_transport_error` | Xử lý lỗi 429 hoặc timeout ở bước usage snapshot (PASS) |
| | `test_search_post_transport_error_conservatively_charges_admitted_credit` | Tính phí bảo thủ 1 credit khi POST thất bại sau khi đã admit (PASS) |
| | `test_local_budget_limit_exhausted_rejects_without_post` | Hạn mức local SQLite hết thì trả về quota, không gọi POST (PASS) |
| | `test_unexpected_usage_credits_triggers_durable_monthly_block` | Usage credits $\ne 1$ kích hoạt khóa cứng tháng, duy trì qua restart (PASS) |
| **`CacheAndConcurrencyTests`** | `test_cache_hit_returns_deepcopy_zero_credits_and_same_timestamp` | Cache hit trả về deepcopy, 0 credits, giữ nguyên timestamp (PASS) |
| | `test_cache_ttl_expiration` | Hết hạn TTL sẽ kích hoạt lượt tìm kiếm mới (PASS) |
| | `test_singleflight_deduplicates_concurrent_calls` | 4 luồng đồng thời cùng query chỉ sinh ra duy nhất 1 lệnh POST (PASS) |
| **`PrivacyAndSafetyTests`** | `test_food_query_rejection_for_injection_or_non_food` | Từ chối query injection hoặc không liên quan ẩm thực Hà Nội (PASS) |
| | `test_source_sanitization_and_privacy_redaction` | Loại trừ SSRF IP riêng tư, lọc mã độc, cắt tỉa HTML và redact dữ liệu nhạy cảm (PASS) |

**Kết quả chạy lệnh:**
```text
$env:PYTHONPATH="backend"; .venv\Scripts\python.exe -m unittest backend/tests/providers/test_tavily.py
..................
----------------------------------------------------------------------
Ran 18 tests in 0.476s

OK
```

---

## 5. Giới hạn & Bước tiếp theo (Limitations & Next Steps)

- **Giới hạn kiểm thử:** Theo nguyên tắc không kích hoạt dịch vụ có phí và không đưa secret vào môi trường thử nghiệm, toàn bộ kiểm thử đơn vị được thực hiện dạng hermetic (mock transport). Không có cuộc gọi mạng thực tế nào ra API Tavily bên ngoài.
- **Tích hợp:** Provider `TavilySearch` đã sẵn sàng để Codex tích hợp vào router/planner của Online Assistant theo đúng hợp đồng `docs/ONLINE_ASSISTANT_CONTRACT.md`.
