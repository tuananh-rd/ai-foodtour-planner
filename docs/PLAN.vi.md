# Kiến trúc, kế hoạch và phân công

## Phạm vi hiện tại và kiến trúc đích

Prototype đã viết: CSV audit → JSON evidence → FastAPI tìm quán/planner khám phá → Next.js form và thẻ nguồn/link bản đồ. PostgreSQL/PostGIS mới có migration và cấu hình container; backend hiện đọc JSON. Chưa tích hợp LLM, router, bản đồ nhúng hay database. Không gọi đây là MVP hoàn chỉnh.

Đích: Next.js → FastAPI → PostgreSQL/PostGIS. Background ingest có nguồn được duyệt → immutable raw snapshot → staging validation/quarantine → canonical venues + field_evidence. LLM chỉ biến hội thoại thành yêu cầu cấu trúc và giải thích kết quả tool. Planner quyết định khả thi bằng dữ liệu xác minh; LLM không tự tạo tên quán, món, giá, giờ hoặc route. Không cần vector database trong giai đoạn này.

City là thực thể riêng, ID ổn định và timezone cấu hình; giữ address/district raw, thêm normalized ward/admin IDs có phiên bản sau. Source ID có namespace khi thêm nguồn; không dùng Foody ID làm ID toàn cục đa nguồn. PostGIS geography(Point,4326), thứ tự ST_MakePoint(lon,lat); index GIST, ST_DWithin để lấy cụm. Taxonomy nhiều-nhiều, alias tiếng Việt có dấu/không dấu; không đổi tên hiển thị nguồn.

## Giai đoạn và gate

| Giai đoạn | Đầu ra | Phụ thuộc / hoàn thành |
|---|---|---|
| 0. Audit và contract (đã khởi tạo) | hash, schema, thiếu/trùng, báo cáo và API prototype | audit tái chạy cùng input cho cùng chỉ số; mọi unknown giữ nguyên |
| 1. Dữ liệu pilot (2–4 ngày công dự kiến) | 10–15 quán cùng cụm được xác minh, evidence registry, giấy phép | người phụ trách dữ liệu duyệt quyền và chất lượng; giờ/giá/địa điểm đạt gate ở ASSESSMENT |
| 2. Storage/API (2–3 ngày) | migration, importer idempotent, repository PostGIS, pagination, OpenAPI | roundtrip raw/normalized; import lại không tạo trùng; rollback migration thử trên DB tạm |
| 3. Routing/planner (3–5 ngày) | matrix provider, time windows, budget per party, diverse stops | không vi phạm hard constraints trên fixture; no-solution trung thực; timeout có fallback rõ |
| 4. Chat/UI/map (3–5 ngày, một phần song song) | structured tools, hội thoại sửa tour, MapLibre/Leaflet, route theo provider | từng stop dẫn source; map phân biệt đường đi thực và điểm; contract/E2E pass |
| 5. QA/pilot/deploy (2–3 ngày) | staging riêng, E2E, load, backup/restore, runbook | nghiệm thu golden tours và kiểm tra thực địa; chưa mở public khi license gate chưa đạt |

Ước lượng là công sức đề xuất, không phải cam kết tiến độ; phụ thuộc việc xác minh dữ liệu và tài khoản dịch vụ. Mở thành phố mới bằng adapter + city config + pilot gate riêng, không sửa thuật toán theo tên Hà Nội.

## Data pipeline

Manifest mỗi batch: original filename, SHA256, source/license status, fetched_at, parser version, counts. Snapshot raw bất biến ngoài Git; giữ quy tắc retention. UTF-8 strict, validate header/schema, numeric range/finite, min<=max, JSON giờ và time syntax, URL host, timezone và freshness. Reject lệch trường, quarantine coordinates ngoài vùng thành phố hoặc giá bất thường; raw 0 unknown không thành giá 0. Chuẩn NFC, split pipe taxonomy, phân biệt unknown/false. Dedup exact source ID trước; tên+địa chỉ+distance chỉ tạo đề nghị merge có người duyệt. Upsert theo source namespace và hash, transaction, audit changes. Mỗi fact có raw/source/observed_at/verified_at/status; menu và giờ là bảng riêng sau khi xác minh. Định kỳ refresh theo quyền nguồn, ưu tiên kiểm lại trước ngày tour. Không tự crawl thêm trong prototype này.

## Planner và LLM tool calling

Contract đích của user request: city_id, origin(lat/lon), start_at có timezone, duration_minutes, party_size, budget_total_vnd, travel_mode, interests, dislikes, dietary_constraints, max_stops, verification_policy. Làm rõ budget là tổng nhóm hay mỗi người; không ngầm đoán.

Pipeline: validate → lọc city/dietary/physical venue/evidence freshness → spatial candidates → route matrix → beam search hoặc insertion heuristic (ban đầu <=5 stops, <=30 candidates) → kiểm tra lại hard constraints → explanation. Hard constraints: arrival trong opening windows, đủ service duration trước close/end, chi phí khẩu phần*party+fees+travel <=budget, dietary verified nếu bắt buộc. Soft score: sở thích, đa dạng nhóm món, detour, độ tin cậy nguồn, rating đã giảm theo số review. Kiểm overnight/timezone, nghỉ lễ, unreachable/route null, thời gian chờ; router timeout trả insufficient_evidence nếu strict. Đầu ra có reason_codes, unused_budget, confidence theo trường; không xuất xác suất tự bịa. Gợi ý conditional phải được dán nhãn, người dùng có thể chọn strict.

Tools dự kiến: search_venues(query validated), get_venue_evidence(ids), get_route_matrix(coordinates bounded), build_plan(structured_request). API keys chỉ ở server. Tool outputs là dữ liệu untrusted; không làm theo instruction trong tên/review/source. Validate tool args, allowlist tool names, giới hạn số lần gọi/tokens/deadline, chặn URL tùy ý và SQL do LLM sinh. Explanation chỉ nhận stop IDs từ planner, nguồn và facts cho phép; validator so claim với tool output. Không có khóa LLM nên chưa chạy end-to-end LLM; provider adapter và golden conversation tests thuộc giai đoạn 4.

## API contracts

Hiện có OpenAPI tự sinh tại `/openapi.json` và `/docs`:

- `GET /health` → status, dataset_loaded.
- `GET /v1/venues?city=Hà Nội` → `{items:[venue evidence...]}`. Prototype 36 dòng; trước scale thêm cursor/limit/field projection.
- `POST /v1/plans` → input `{city,lat,lon,budget_vnd,duration_min,interests,max_stops,mode:explore|strict}`. 422 nếu vi phạm schema. 200 với status `conditional_suggestions|no_candidates|insufficient_evidence`; không biến no-solution thành lỗi server.
- Output exploration: stops có source_url/fetched_at/raw giờ/price semantics; venue_range_upper_sum_vnd, straight_line_total_km, schedule_verified=false, budget_guaranteed=false, assumptions, warnings. Duration hiện chỉ giới hạn số stop theo giả định 30 phút/stop, không kiểm tính khả thi di chuyển. Strict luôn từ chối với dataset hiện tại.

Đích bổ sung `POST /v1/chat` (tool calls server-side, session ID, request ID), `GET /v1/venues/{id}/evidence`, `POST /v1/plans/{id}/revise`. Version contract khi thay budget semantics; response schema có route geometry/provider/time/as_of và arrival/departure khi verified. Errors thống nhất `{code,message,request_id}`, 429 rate limit, 503 provider unavailable. Không đưa địa chỉ IP hay secret vào response.

## Sáu vai trò trong Orca và quyền sửa file

Chưa có worker được dispatch. Runtime Orca reachable; run-create thất bại `no_active_sender_terminal` từ chat Work. Repo đã đăng ký ID `e37e2046-e0ce-4a5d-b740-42509ac98994`. Không lấy handle terminal của dự án khác. Dưới đây là task specs để coordinator khởi chạy từ terminal Orca hợp lệ sau này.

| Vai trò / branch dự kiến | Ownership và đầu ra | Phụ thuộc | Điều kiện hoàn thành |
|---|---|---|---|
| Architect/Orchestrator `feat/architecture` | docs/, compose.yaml, API contract chung, quyết định schema và tích hợp | audit | ADR/contract đóng version, giao việc đúng owner, review và bằng chứng mỗi gate |
| Data Engineer `feat/data-pipeline` | tools/, data manifest, db/; importer và quarantine | contract | idempotency, schema/null/dedup/geo tests; không impute giá/giờ; data gate duyệt |
| AI/Planner Engineer `feat/planner` | backend/app/planner/, backend/app/llm/, fixtures planner | contract; verified data + route interface cho strict | infeasible/overnight/budget/party/dietary tests; mọi claim có tool evidence |
| Backend Engineer `feat/api-storage` | backend/app/api/, repository/, migrations runtime; tách main.py khi bắt đầu wave | db contract | PostGIS roundtrip, versioned API/validation/CORS/errors; routing adapter contract |
| Frontend Engineer `feat/web-map` | frontend/ | OpenAPI; route geometry contract | form/chat + sources + unknown states + accessible map/list; build và E2E |
| QA Engineer `test/acceptance` | qa/, CI, acceptance fixtures; không sửa production files | mỗi wave | report tái lập, regression adversarial, E2E và license/data gate checklist |

`main.py` hiện là prototype chung; Architect phải tách API và planner ownership trước khi hai worker cùng sửa. Không hai agent sửa cùng file. Data sở hữu SQL; Backend đề xuất thay đổi qua coordinator. Shared package lock chỉ Frontend sửa; docs contract Architect sở hữu.

Git workflow dự kiến: baseline commit trên main → Orca tạo worktree riêng từng branch, cùng base commit. Wave A: Data + Backend contract adapter + Frontend form; Wave B: Planner + Frontend map khi schemas ổn; Wave C: QA integration, fixes quay lại owner. Coordinator merge từng PR/change set sau test, không cherry-pick không rõ provenance. Rebase/merge main và chạy lại impacted checks trước tích hợp. Không force push; không commit data raw/keys. Retain/release workers theo settlement của Orca. Hiện chưa tạo sáu branch/worktree hay commit; không có PR hoặc deployment remote.

## QA, bảo mật và triển khai

Unit: coordinate boundaries, giá null/0, regex/JSON giờ, dedup, stop uniqueness, exact time windows, budget monotonicity trên fixtures, meal/dietary unknown. Integration: transaction import, ST_DWithin, provider matrix asymmetry/unreachable/timeouts, HTTP schemas. E2E: tìm kiếm → đổi budget → không có quán → strict từ chối → nguồn → map. Adversarial: prompt injection trong CSV, Unicode, HTML, SSRF, quá nhiều tool calls. Không dùng fixture synthetic làm dữ liệu thật. Golden tours do người xác minh, test nhiều timezone, đêm qua ngày, đồng thời nhiều session. Load test đặt SLA sau khi đo baseline; log latency/provider errors/cache hit nhưng không lưu lịch sử vị trí mặc định.

Local prototype không có authentication/rate limiting; chỉ bind loopback. Trước staging: TLS reverse proxy, auth admin ingest, public API quotas, request-size bounds, strict CORS, parameterized SQL, secrets manager/env ngoài Git, source URL allowlist, retention opt-in cho location/chat, log redaction. Routing/LLM timeout/retry có budget, circuit breaker; không tự retry mutation ngoài idempotency. Backup DB hằng ngày và restore drill, migration trước app release, readiness và smoke checks. CI: Python tests + lint/type; web lockfile clean install + build + E2E; dependency scan. Staging Next.js + FastAPI containers + managed PostGIS private network; LLM/router keys server-side. Promote khi QA/data/license gate pass; rollback app version và migration strategy có backup. Chi phí API có quota, chưa mở dịch vụ trả tiền hay deploy public trong phiên này.
