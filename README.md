# AI FoodTour Planner — conditional prototype

> Current discovery-first upgrade: [requirements](docs/DISCOVERY_ASSISTANT_REQUIREMENTS.md), [contract](docs/DISCOVERY_ASSISTANT_CONTRACT.md), [task board](docs/reports/DISCOVERY_ASSISTANT_BOARD.md). Tavily/web lookup is retired; existing credentials/ledgers are preserved but unused. Discovery chat no longer requires a complete tour profile. Live Gemini acceptance is tracked separately from synthetic/rules tests.

Đọc [đánh giá dữ liệu](docs/ASSESSMENT.vi.md), [kế hoạch và phân công](docs/PLAN.vi.md), [audit đầy đủ](docs/audit.json).

## Chạy cục bộ

Python 3.11+, Node 20+. Tạo virtualenv trước khi cài dependencies.

```powershell
python tools/audit.py 'PATH/TO/restaurants_enriched (1).csv'
python -m pip install -r backend/requirements.txt
cd backend
python -m unittest discover -v
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Terminal thứ hai:

```powershell
cd frontend
npm ci
npm run dev -- --hostname 127.0.0.1
```

Mở http://localhost:3000; API docs http://127.0.0.1:8000/docs. WEB_ORIGIN mặc định http://localhost:3000; NEXT_PUBLIC_API_URL mặc định http://localhost:8000. Nếu đổi origin phải đổi CORS tương ứng.

`compose.yaml` chỉ khởi tạo PostGIS, cần POSTGRES_PASSWORD; backend chưa dùng DB. Migration chưa thử trên Docker. JSON dữ liệu và raw CSV không theo Git do quyền tái sử dụng chưa rõ. Đường dẫn tệp đính kèm tạm có thể hết hạn; audit trước khi thay bằng nguồn khác.

Prototype có tìm gợi ý theo vị trí, sở thích nhóm món, cận trên khoảng giá và số điểm; khoảng cách là đường chim bay. Không có lịch trình khả thi theo giờ, ETA thực, LLM hay ngân sách chắc chắn. Chế độ strict từ chối trung thực. Nguồn và unknown được giữ trong kết quả.
