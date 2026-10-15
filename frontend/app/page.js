'use client';

import { useState } from 'react';

// Cụm điểm xuất phát phổ biến tại Hà Nội (giúp người dùng không phải nhập vĩ độ/kinh độ thô)
const PRESET_LOCATIONS = [
  { id: 'hoankiem', name: 'Hồ Hoàn Kiếm / Phố Cổ', lat: 21.033, lon: 105.850 },
  { id: 'nhatho', name: 'Nhà Thờ Lớn Hà Nội', lat: 21.028, lon: 105.849 },
  { id: 'dongxuan', name: 'Chợ Đồng Xuân', lat: 21.038, lon: 105.849 },
  { id: 'tayho', name: 'Hồ Tây / Chùa Trấn Quốc', lat: 21.047, lon: 105.836 },
  { id: 'custom', name: 'Tự nhập tọa độ GPS…', lat: 21.030, lon: 105.850 },
];

const QUICK_INTERESTS = ['Bún', 'Phở', 'Xôi', 'Chè', 'Bánh mì', 'Cà phê', 'Ăn vặt'];

export default function Home() {
  const [selectedPreset, setSelectedPreset] = useState('hoankiem');
  const [lat, setLat] = useState(21.033);
  const [lon, setLon] = useState(105.850);
  const [budget, setBudget] = useState(200000);
  const [duration, setDuration] = useState(120);
  const [interests, setInterests] = useState('');
  const [mode, setMode] = useState('explore');
  const [activeTab, setActiveTab] = useState('timeline'); // 'preferences' | 'timeline' | 'map'
  
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [highlightedStopId, setHighlightedStopId] = useState(null);

  const handlePresetChange = (presetId) => {
    setSelectedPreset(presetId);
    const loc = PRESET_LOCATIONS.find((p) => p.id === presetId);
    if (loc && presetId !== 'custom') {
      setLat(loc.lat);
      setLon(loc.lon);
    }
  };

  const handleAddInterest = (item) => {
    if (!interests) {
      setInterests(item);
    } else if (!interests.toLowerCase().includes(item.toLowerCase())) {
      setInterests((prev) => `${prev}, ${item}`);
    }
  };

  async function submit(e) {
    if (e) e.preventDefault();
    setBusy(true);
    setError('');
    
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const payload = {
      city: 'Hà Nội',
      lat: Number(lat),
      lon: Number(lon),
      budget_vnd: Number(budget),
      duration_min: Number(duration),
      interests: interests.split(',').map((s) => s.trim()).filter(Boolean),
      mode,
    };

    try {
      const response = await fetch(`${apiUrl}/v1/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let msg = 'Yêu cầu không hợp lệ hoặc máy chủ chưa sẵn sàng.';
        try {
          const errData = await response.json();
          if (errData && errData.detail) {
            msg = Array.isArray(errData.detail)
              ? errData.detail.map((d) => d.msg).join(', ')
              : String(errData.detail);
          }
        } catch (_) {}
        throw new Error(msg);
      }

      const data = await response.json();
      setResult(data);
      // Trên mobile tự động chuyển sang tab lịch trình khi có kết quả
      setActiveTab('timeline');
    } catch (err) {
      setError(err.message || 'Lỗi kết nối máy chủ.');
    } finally {
      setBusy(false);
    }
  }

  // Tính toán khung SVG cho bản đồ tuyến đường mini
  const stops = result?.stops || [];
  let mapBounds = { minLat: lat, maxLat: lat, minLon: lon, maxLon: lon };
  if (stops.length > 0) {
    const allLats = [lat, ...stops.map((s) => s.lat)];
    const allLons = [lon, ...stops.map((s) => s.lon)];
    mapBounds = {
      minLat: Math.min(...allLats) - 0.003,
      maxLat: Math.max(...allLats) + 0.003,
      minLon: Math.min(...allLons) - 0.003,
      maxLon: Math.max(...allLons) + 0.003,
    };
  }

  const projectToSvg = (pLat, pLon) => {
    const latSpan = mapBounds.maxLat - mapBounds.minLat || 0.01;
    const lonSpan = mapBounds.maxLon - mapBounds.minLon || 0.01;
    const x = ((pLon - mapBounds.minLon) / lonSpan) * 280 + 20;
    const y = (1 - (pLat - mapBounds.minLat) / latSpan) * 200 + 20;
    return { x: Math.round(x), y: Math.round(y) };
  };

  const startPt = projectToSvg(lat, lon);
  const projectedStops = stops.map((s) => ({ ...s, pt: projectToSvg(s.lat, s.lon) }));
  const polylinePoints = [
    `${startPt.x},${startPt.y}`,
    ...projectedStops.map((s) => `${s.pt.x},${s.pt.y}`),
  ].join(' ');

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px' }}>
      {/* Top Header */}
      <header style={{
        background: '#fff',
        borderRadius: 16,
        padding: '16px 20px',
        marginBottom: 16,
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>🍜</span>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
              AI FoodTour Planner
            </h1>
            <span style={{
              fontSize: 11,
              background: '#e8f5e9',
              color: '#2e7d32',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 12
            }}>
              HÀ NỘI · PILOT
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Hành trình ẩm thực Phố Cổ minh bạch bằng chứng · Đi bộ tối ưu
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            fontSize: 12,
            padding: '4px 10px',
            borderRadius: 8,
            background: mode === 'strict' ? '#e8f5e9' : '#fff3e0',
            color: mode === 'strict' ? '#2e7d32' : '#e65100',
            fontWeight: 600
          }}>
            {mode === 'strict' ? 'Chế độ Nghiêm ngặt' : 'Khám phá có điều kiện'}
          </span>
        </div>
      </header>

      {/* Mobile Tab Navigation Bar */}
      <nav style={{
        display: 'flex',
        background: '#fff',
        borderRadius: 12,
        padding: 4,
        marginBottom: 16,
        boxShadow: 'var(--shadow-sm)',
        gap: 4
      }} aria-label="Bộ chọn giao diện">
        <button
          type="button"
          onClick={() => setActiveTab('preferences')}
          style={{
            flex: 1,
            padding: '10px 12px',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            background: activeTab === 'preferences' ? 'var(--accent-primary)' : 'transparent',
            color: activeTab === 'preferences' ? '#fff' : 'var(--text-secondary)',
            transition: 'all 0.15s ease'
          }}
        >
          ⚙️ Tùy chọn
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('timeline')}
          style={{
            flex: 1,
            padding: '10px 12px',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            background: activeTab === 'timeline' ? 'var(--accent-primary)' : 'transparent',
            color: activeTab === 'timeline' ? '#fff' : 'var(--text-secondary)',
            transition: 'all 0.15s ease'
          }}
        >
          📍 Lịch trình {stops.length > 0 ? `(${stops.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('map')}
          style={{
            flex: 1,
            padding: '10px 12px',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            background: activeTab === 'map' ? 'var(--accent-primary)' : 'transparent',
            color: activeTab === 'map' ? '#fff' : 'var(--text-secondary)',
            transition: 'all 0.15s ease'
          }}
        >
          🗺️ Bản đồ
        </button>
      </nav>

      {/* Main Responsive Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 20,
        alignItems: 'start'
      }}>
        {/* Left Column: Form & Preferences */}
        <section
          style={{
            background: '#fff',
            borderRadius: 16,
            padding: 20,
            boxShadow: 'var(--shadow-sm)',
            display: activeTab === 'preferences' || typeof window !== 'undefined' && window.innerWidth >= 900 ? 'block' : 'none',
          }}
          aria-labelledby="preferences-heading"
        >
          <h2 id="preferences-heading" style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
            1. Tùy chọn FoodTour
          </h2>

          <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
            {/* Điểm xuất phát Preset */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
                Điểm xuất phát tại Hà Nội
              </label>
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff' }}
              >
                {PRESET_LOCATIONS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Custom Coordinates (nếu chọn custom) */}
            {selectedPreset === 'custom' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: '#f5f4ef', padding: 10, borderRadius: 8 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Vĩ độ (Lat)</label>
                  <input
                    type="number"
                    step="any"
                    value={lat}
                    onChange={(e) => setLat(Number(e.target.value))}
                    required
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Kinh độ (Lon)</label>
                  <input
                    type="number"
                    step="any"
                    value={lon}
                    onChange={(e) => setLon(Number(e.target.value))}
                    required
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>
            )}

            {/* Ngân sách & Thời lượng */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
                  Ngân sách (VND)
                </label>
                <input
                  type="number"
                  min="30000"
                  step="10000"
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Khoảng giá tham khảo</span>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
                  Thời lượng (phút)
                </label>
                <input
                  type="number"
                  min="30"
                  max="720"
                  step="15"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ước tính 30p/quán</span>
              </div>
            </div>

            {/* Món ăn yêu thích & Chips */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
                Món ăn hoặc từ khóa quan tâm
              </label>
              <input
                type="text"
                placeholder="Ví dụ: Bún, Phở, Cà phê"
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {QUICK_INTERESTS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => handleAddInterest(item)}
                    style={{
                      fontSize: 12,
                      padding: '4px 8px',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 12,
                      color: 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    + {item}
                  </button>
                ))}
              </div>
            </div>

            {/* Chế độ kiểm định */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
                Chế độ kiểm định
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff' }}
              >
                <option value="explore">Khám phá có điều kiện (Cho phép giờ/giá tham khảo)</option>
                <option value="strict">Yêu cầu đủ bằng chứng (Từ chối nếu thiếu routing/giờ)</option>
              </select>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={busy}
              style={{
                marginTop: 6,
                padding: '12px 20px',
                background: busy ? '#aaa' : 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 600,
                boxShadow: 'var(--shadow-sm)',
                transition: 'background 0.2s'
              }}
            >
              {busy ? 'Đang tìm kiếm & tối ưu tour…' : '🔍 Tìm gợi ý FoodTour'}
            </button>
          </form>

          {/* Quick Tour Metrics if result available */}
          {result && stops.length > 0 && (
            <div style={{
              marginTop: 20,
              padding: 14,
              background: '#fcfbf8',
              borderRadius: 12,
              border: '1px dashed var(--border-color)',
              fontSize: 13
            }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                📊 Tóm tắt chỉ số tour:
              </div>
              <ul style={{ paddingLeft: 18, color: 'var(--text-secondary)', display: 'grid', gap: 4 }}>
                <li>Số điểm dừng: <strong>{stops.length} điểm</strong></li>
                <li>Tổng cự ly chim bay: <strong>{result.straight_line_total_km} km</strong></li>
                <li>Trần ngân sách quán: <strong>{result.venue_range_upper_sum_vnd?.toLocaleString('vi-VN')} ₫</strong></li>
                <li>Dwell time giả định: <strong>{result.assumptions?.visit_minutes_per_stop || 30} phút/điểm</strong></li>
              </ul>
            </div>
          )}
        </section>

        {/* Right Column: Timeline Cards or Map */}
        <div style={{
          display: activeTab === 'timeline' || activeTab === 'map' || typeof window !== 'undefined' && window.innerWidth >= 900 ? 'block' : 'none',
        }}>
          {/* Error Alert */}
          {error && (
            <div role="alert" style={{
              padding: '14px 18px',
              background: '#ffebee',
              border: '1px solid #ffcdd2',
              color: '#c62828',
              borderRadius: 12,
              marginBottom: 16,
              fontSize: 14
            }}>
              <strong>⚠️ Thông báo lỗi:</strong> {error}
            </div>
          )}

          {/* Map View */}
          {(activeTab === 'map' || typeof window !== 'undefined' && window.innerWidth >= 900) && (
            <div style={{
              background: '#fff',
              borderRadius: 16,
              padding: 16,
              marginBottom: 20,
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  🗺️ Tuyến đường trực quan (Hà Nội)
                </h3>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Đường chim bay ({stops.length} điểm)
                </span>
              </div>

              {/* Lightweight SVG Visual Route Map */}
              <div style={{
                background: '#f4f2ea',
                borderRadius: 12,
                overflow: 'hidden',
                position: 'relative',
                border: '1px solid var(--border-color)',
                textAlign: 'center'
              }}>
                <svg viewBox="0 0 320 240" style={{ width: '100%', height: 240, display: 'block' }}>
                  {/* Grid lines */}
                  <line x1="0" y1="60" x2="320" y2="60" stroke="#e8e4d8" strokeWidth="1" />
                  <line x1="0" y1="120" x2="320" y2="120" stroke="#e8e4d8" strokeWidth="1" />
                  <line x1="0" y1="180" x2="320" y2="180" stroke="#e8e4d8" strokeWidth="1" />
                  <line x1="80" y1="0" x2="80" y2="240" stroke="#e8e4d8" strokeWidth="1" />
                  <line x1="160" y1="0" x2="160" y2="240" stroke="#e8e4d8" strokeWidth="1" />
                  <line x1="240" y1="0" x2="240" y2="240" stroke="#e8e4d8" strokeWidth="1" />

                  {/* Route Polyline (dashed for straight-line estimate) */}
                  {stops.length > 0 && (
                    <polyline
                      points={polylinePoints}
                      fill="none"
                      stroke="var(--accent-primary)"
                      strokeWidth="3"
                      strokeDasharray="6,4"
                    />
                  )}

                  {/* Start Point Pin */}
                  <g transform={`translate(${startPt.x},${startPt.y})`}>
                    <circle r="7" fill="#1565c0" stroke="#fff" strokeWidth="2" />
                    <text y="3" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">S</text>
                  </g>

                  {/* Stop Pins */}
                  {projectedStops.map((s, idx) => (
                    <g
                      key={s.id}
                      transform={`translate(${s.pt.x},${s.pt.y})`}
                      onClick={() => setHighlightedStopId(s.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle
                        r={highlightedStopId === s.id ? '11' : '9'}
                        fill={highlightedStopId === s.id ? '#b84020' : 'var(--accent-primary)'}
                        stroke="#fff"
                        strokeWidth="2"
                      />
                      <text y="3.5" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">
                        {idx + 1}
                      </text>
                    </g>
                  ))}
                </svg>

                {/* Attribution */}
                <div style={{
                  position: 'absolute',
                  bottom: 6,
                  right: 8,
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  background: 'rgba(255,255,255,0.85)',
                  padding: '2px 6px',
                  borderRadius: 4
                }}>
                  © OpenStreetMap & Foody
                </div>
              </div>

              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                * Đường nét đứt biểu thị cự ly chim bay ước tính. Định tuyến theo mạng đường bộ thực sẽ cập nhật khi kết nối routing provider.
              </p>
            </div>
          )}

          {/* Timeline Results */}
          {result && (
            <section aria-live="polite">
              {/* Warnings Header */}
              {result.warnings && result.warnings.length > 0 && (
                <div style={{
                  background: '#fff8e1',
                  border: '1px solid #ffe082',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 16,
                  fontSize: 13,
                  color: '#795548'
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ Lưu ý kiểm định dữ liệu:</div>
                  <ul style={{ paddingLeft: 18, margin: 0 }}>
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Status Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {result.status === 'insufficient_evidence'
                    ? '⚠️ Chưa đủ bằng chứng để lập lịch (Chế độ nghiêm ngặt)'
                    : result.status === 'no_candidates'
                    ? '🔍 Không tìm thấy điểm dừng phù hợp'
                    : '🚩 Lịch trình ẩm thực đề xuất'}
                </h2>
              </div>

              {/* Insufficient Evidence Reason */}
              {result.status === 'insufficient_evidence' && (
                <div style={{
                  background: '#fff',
                  borderRadius: 14,
                  padding: 20,
                  border: '1px solid #ffcc80',
                  color: '#e65100',
                  fontSize: 14
                }}>
                  <p><strong>Lý do từ chối:</strong> {result.reason}</p>
                  <p style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                    Chế độ nghiêm ngặt yêu cầu dữ liệu giờ mở cửa theo ngày cụ thể, giá từng món và ma trận định tuyến thực tế. Bạn có thể chuyển sang chế độ <strong>Khám phá có điều kiện</strong> để xem các gợi ý khả thi với dữ liệu hiện có.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setMode('explore'); setTimeout(() => submit(), 100); }}
                    style={{
                      marginTop: 12,
                      padding: '8px 16px',
                      background: 'var(--accent-primary)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600
                    }}
                  >
                    Chuyển sang Khám phá có điều kiện
                  </button>
                </div>
              )}

              {/* Empty State: No Candidates */}
              {result.status === 'no_candidates' && (
                <div style={{
                  background: '#fff',
                  borderRadius: 14,
                  padding: 24,
                  textAlign: 'center',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🥣</div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Không tìm thấy quán nào thỏa mãn yêu cầu
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                    Có thể ngân sách ({budget.toLocaleString('vi-VN')} ₫) chưa đủ cho các điểm dừng quanh khu vực này hoặc bộ lọc món "{interests}" chưa có trong dữ liệu thí điểm.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
                    <button
                      type="button"
                      onClick={() => { setBudget(250000); setInterests(''); }}
                      style={{
                        padding: '8px 14px',
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600
                      }}
                    >
                      Đặt lại mặc định
                    </button>
                  </div>
                </div>
              )}

              {/* Stop Cards */}
              {stops.map((v, index) => (
                <article
                  key={v.id}
                  id={`stop-${v.id}`}
                  style={{
                    background: '#fff',
                    borderRadius: 14,
                    padding: 18,
                    marginBottom: 16,
                    boxShadow: highlightedStopId === v.id ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                    border: highlightedStopId === v.id ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                >
                  {/* Sequence Badge & Title */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'var(--accent-primary)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 14
                      }}>
                        {index + 1}
                      </span>
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {v.name}
                        </h3>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          {v.address} · {v.district}
                        </p>
                      </div>
                    </div>

                    {/* Replace Stop Button (Preview for FE-03) */}
                    <button
                      type="button"
                      onClick={() => alert(`Tính năng [Đổi điểm dừng] cho "${v.name}" sẽ được tích hợp trong giai đoạn FE-03 (Replace Stop & Lock Mechanism).`)}
                      style={{
                        fontSize: 12,
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--border-color)',
                        background: '#faf9f5',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap'
                      }}
                      title="Đổi điểm dừng này"
                    >
                      🔄 Đổi quán
                    </button>
                  </div>

                  {/* Dish groups & Cuisines */}
                  <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-primary)' }}>
                    <strong>Món đặc trưng:</strong> {v.dish_groups || v.cuisine_styles || 'Món Việt'}
                  </div>

                  {/* Badges Grid (Data Transparency) */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                    {/* Status Badge 1: Geo Verified */}
                    <span style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: 'var(--badge-verified-bg)',
                      color: 'var(--badge-verified-text)',
                      fontWeight: 600
                    }}>
                      ✓ Tọa độ: XÁC MINH
                    </span>

                    {/* Status Badge 2: Price Range Estimate */}
                    <span style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: 'var(--badge-estimate-bg)',
                      color: 'var(--badge-estimate-text)',
                      fontWeight: 600
                    }}>
                      ≈ Giá quán: {v.price_min_vnd_norm?.toLocaleString('vi-VN')}–{v.price_max_vnd_norm?.toLocaleString('vi-VN')} ₫
                    </span>

                    {/* Status Badge 3: Operating Hours Unknown */}
                    <span style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: 'var(--badge-unknown-bg)',
                      color: 'var(--badge-unknown-text)',
                      fontWeight: 600
                    }}>
                      ? Giờ: {v.hours_displayed || 'Chưa rõ'} (Chưa kiểm chứng ngày)
                    </span>
                  </div>

                  {/* Leg distance & travel assumption */}
                  <div style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: '1px solid #f0ede4',
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12,
                    color: 'var(--text-muted)'
                  }}>
                    <span>
                      🚶 Chặng chim bay: <strong>{v.straight_line_leg_km} km</strong> (Ước tính ~{Math.round(v.straight_line_leg_km * 12)} phút đi bộ)
                    </span>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <a href={v.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
                        Nguồn Foody ↗
                      </a>
                      ·
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${v.lat}&mlon=${v.lon}#map=17/${v.lat}/${v.lon}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}
                      >
                        Bản đồ OSM ↗
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}

          {/* Initial landing guidance if no result yet */}
          {!result && !error && (
            <div style={{
              background: '#fff',
              borderRadius: 16,
              padding: 30,
              textAlign: 'center',
              boxShadow: 'var(--shadow-sm)',
              color: 'var(--text-secondary)'
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                Sẵn sàng khám phá ẩm thực Hà Nội
              </h2>
              <p style={{ fontSize: 14, maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>
                Chọn điểm xuất phát (Hồ Hoàn Kiếm, Phố Cổ…), nhập ngân sách dự kiến và nhấn <strong>Tìm gợi ý FoodTour</strong> để nhận hành trình tối ưu đi bộ 3–5 điểm dừng.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
