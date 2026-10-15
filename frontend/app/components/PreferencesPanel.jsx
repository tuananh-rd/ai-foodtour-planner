'use client';

import { useState, useEffect } from 'react';

const PRESET_LOCATIONS = [
  { id: 'hoankiem', name: 'Hồ Hoàn Kiếm / Phố Cổ', lat: 21.033, lon: 105.850 },
  { id: 'nhatho', name: 'Nhà Thờ Lớn Hà Nội', lat: 21.0287, lon: 105.8490 },
  { id: 'dongxuan', name: 'Chợ Đồng Xuân', lat: 21.038, lon: 105.849 },
  { id: 'tayho', name: 'Hồ Tây / Trấn Quốc', lat: 21.047, lon: 105.836 },
  { id: 'custom', name: 'Tự nhập tọa độ GPS…', lat: 21.030, lon: 105.850 }
];

const QUICK_INTERESTS = ['Phở', 'Bún chả', 'Bánh mì', 'Chè', 'Cà phê', 'Nem rán', 'Xôi'];
const QUICK_EXCLUSIONS = ['Ốc', 'Thịt chó', 'Mắm tôm', 'Ăn cay'];

export default function PreferencesPanel({
  preferences,
  revision,
  onUpdatePreferences,
  onPlanTour,
  busy,
  isMock
}) {
  const [originPreset, setOriginPreset] = useState('hoankiem');
  const [customLat, setCustomLat] = useState(21.033);
  const [customLon, setCustomLon] = useState(105.850);
  const [startTime, setStartTime] = useState(preferences.start_time || '08:30');
  const [weekday, setWeekday] = useState(preferences.weekday ?? 0);
  const [durationMin, setDurationMin] = useState(preferences.duration_min || 120);
  const [budgetVnd, setBudgetVnd] = useState(preferences.budget_vnd || 150000);
  const [budgetScope, setBudgetScope] = useState(preferences.budget_scope || 'per_person');
  const [partySize, setPartySize] = useState(preferences.party_size || 1);
  const [interestsStr, setInterestsStr] = useState((preferences.interests || []).join(', '));
  const [exclusionsStr, setExclusionsStr] = useState((preferences.exclusions || []).join(', '));
  const [maxStops, setMaxStops] = useState(preferences.max_stops || 3);
  const [mode, setMode] = useState(preferences.mode || 'explore');

  // Sync state if preferences change from chat extraction
  useEffect(() => {
    if (preferences.start_time) setStartTime(preferences.start_time);
    if (preferences.weekday !== undefined && preferences.weekday !== null) setWeekday(preferences.weekday);
    if (preferences.duration_min) setDurationMin(preferences.duration_min);
    if (preferences.budget_vnd) setBudgetVnd(preferences.budget_vnd);
    if (preferences.budget_scope) setBudgetScope(preferences.budget_scope);
    if (preferences.party_size) setPartySize(preferences.party_size);
    if (preferences.interests) setInterestsStr(preferences.interests.join(', '));
    if (preferences.exclusions) setExclusionsStr(preferences.exclusions.join(', '));
    if (preferences.max_stops) setMaxStops(preferences.max_stops);
    if (preferences.mode) setMode(preferences.mode);
    if (preferences.origin) {
      setCustomLat(preferences.origin.lat);
      setCustomLon(preferences.origin.lon);
    }
  }, [preferences]);

  const handlePresetChange = (presetId) => {
    setOriginPreset(presetId);
    const loc = PRESET_LOCATIONS.find((p) => p.id === presetId);
    if (loc && presetId !== 'custom') {
      setCustomLat(loc.lat);
      setCustomLon(loc.lon);
    }
  };

  const handleAddInterest = (item) => {
    const list = interestsStr.split(',').map(s => s.trim()).filter(Boolean);
    if (!list.includes(item)) {
      setInterestsStr([...list, item].join(', '));
    }
  };

  const handleAddExclusion = (item) => {
    const list = exclusionsStr.split(',').map(s => s.trim()).filter(Boolean);
    if (!list.includes(item)) {
      setExclusionsStr([...list, item].join(', '));
    }
  };

  const buildPreferencesPayload = () => {
    return {
      city: 'Hà Nội',
      origin: { lat: Number(customLat), lon: Number(customLon) },
      start_time: startTime || null,
      weekday: Number(weekday),
      duration_min: Number(durationMin),
      budget_vnd: budgetVnd ? Number(budgetVnd) : null,
      budget_scope: budgetScope || 'per_person',
      party_size: Number(partySize),
      interests: interestsStr.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10),
      exclusions: exclusionsStr.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10),
      max_stops: Number(maxStops),
      mode
    };
  };

  const handleSavePreferences = (e) => {
    e.preventDefault();
    if (busy) return;
    const payload = buildPreferencesPayload();
    onUpdatePreferences(payload);
  };

  const handlePlanNow = (e) => {
    e.preventDefault();
    if (busy) return;
    const payload = buildPreferencesPayload();
    onPlanTour(payload);
  };

  return (
    <div
      role="region"
      aria-label="Bảng tùy chọn foodtour có cấu trúc"
      style={{
        background: '#fff',
        borderRadius: 16,
        padding: 20,
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>⚙️</span>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Tùy Chọn Có Cấu Trúc
          </h2>
        </div>
        <span
          style={{
            fontSize: 11,
            background: '#edf2f7',
            color: '#4a5568',
            padding: '3px 8px',
            borderRadius: 6,
            fontWeight: 600
          }}
        >
          Bản #{revision}
        </span>
      </div>

      <form onSubmit={handlePlanNow} style={{ display: 'grid', gap: 14 }}>
        {/* Điểm xuất phát Preset */}
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
            Điểm xuất phát (Hà Nội)
          </label>
          <select
            value={originPreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff' }}
          >
            {PRESET_LOCATIONS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Custom Coordinates */}
        {originPreset === 'custom' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: '#f5f4ef', padding: 10, borderRadius: 8 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Vĩ độ (Lat)</label>
              <input
                type="number"
                step="any"
                value={customLat}
                onChange={(e) => setCustomLat(Number(e.target.value))}
                required
                style={{ width: '100%', minHeight: 38, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Kinh độ (Lon)</label>
              <input
                type="number"
                step="any"
                value={customLon}
                onChange={(e) => setCustomLon(Number(e.target.value))}
                required
                style={{ width: '100%', minHeight: 38, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)' }}
              />
            </div>
          </div>
        )}

        {/* Giờ xuất phát & Thứ trong tuần */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Giờ bắt đầu
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Ngày trong tuần
            </label>
            <select
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
              style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff' }}
            >
              <option value={0}>Thứ 2</option>
              <option value={1}>Thứ 3</option>
              <option value={2}>Thứ 4</option>
              <option value={3}>Thứ 5</option>
              <option value={4}>Thứ 6</option>
              <option value={5}>Thứ 7</option>
              <option value={6}>Chủ Nhật</option>
            </select>
          </div>
        </div>

        {/* Thời lượng & Số điểm dừng */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Thời lượng (phút): {durationMin}p
            </label>
            <input
              type="range"
              min="30"
              max="720"
              step="15"
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              style={{ width: '100%', minHeight: 40 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>30p</span>
              <span>2 giờ</span>
              <span>4 giờ</span>
              <span>12 giờ</span>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Số điểm dừng (1–5)
            </label>
            <select
              value={maxStops}
              onChange={(e) => setMaxStops(Number(e.target.value))}
              style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff' }}
            >
              <option value={1}>1 điểm</option>
              <option value={2}>2 điểm</option>
              <option value={3}>3 điểm (chuẩn)</option>
              <option value={4}>4 điểm</option>
              <option value={5}>5 điểm (tối đa)</option>
            </select>
          </div>
        </div>

        {/* Ngân sách & Phạm vi & Số người */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr', gap: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Ngân sách (₫)
            </label>
            <input
              type="number"
              min="10000"
              step="10000"
              value={budgetVnd}
              onChange={(e) => setBudgetVnd(Number(e.target.value))}
              style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Phạm vi
            </label>
            <select
              value={budgetScope}
              onChange={(e) => setBudgetScope(e.target.value)}
              style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff' }}
            >
              <option value="per_person">Mỗi người</option>
              <option value="group">Cả nhóm</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Số người
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
            />
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -6 }}>
          * Khoảng giá tham khảo từ quán, không đảm bảo chi phí chính xác từng món
        </span>

        {/* Món ăn yêu thích & Chips */}
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
            Sở thích món ăn (tối đa 10 món)
          </label>
          <input
            type="text"
            placeholder="Ví dụ: Phở, Bún chả, Chè..."
            value={interestsStr}
            onChange={(e) => setInterestsStr(e.target.value)}
            style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {QUICK_INTERESTS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleAddInterest(item)}
                style={chipStyle}
              >
                + {item}
              </button>
            ))}
          </div>
        </div>

        {/* Món loại trừ */}
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
            Món / Thành phần loại trừ (tối đa 10 món)
          </label>
          <input
            type="text"
            placeholder="Ví dụ: Ốc, Mắm tôm..."
            value={exclusionsStr}
            onChange={(e) => setExclusionsStr(e.target.value)}
            style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {QUICK_EXCLUSIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleAddExclusion(item)}
                style={chipStyle}
              >
                ✕ {item}
              </button>
            ))}
          </div>
        </div>

        {/* Chế độ kiểm định */}
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
            Chế độ kiểm định (Mode)
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff' }}
          >
            <option value="explore">Khám phá có điều kiện (Explore - chấp nhận giờ/giá tham khảo)</option>
            <option value="strict">Yêu cầu đủ bằng chứng (Strict - từ chối nếu thiếu routing/giờ)</option>
          </select>
        </div>

        {/* Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
          <button
            type="button"
            onClick={handleSavePreferences}
            disabled={busy}
            style={{
              minHeight: 44,
              padding: '10px 14px',
              background: '#f2f0e8',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer'
            }}
          >
            Lưu tùy chọn (PUT)
          </button>
          <button
            type="submit"
            disabled={busy}
            style={{
              minHeight: 44,
              padding: '10px 14px',
              background: busy ? '#aaa' : 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              boxShadow: 'var(--shadow-sm)',
              cursor: busy ? 'not-allowed' : 'pointer'
            }}
          >
            {busy ? 'Đang tối ưu…' : '🚀 Lập lịch trình'}
          </button>
        </div>
      </form>
    </div>
  );
}

const chipStyle = {
  fontSize: 12,
  padding: '4px 8px',
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border-color)',
  borderRadius: 12,
  color: 'var(--text-secondary)',
  cursor: 'pointer'
};
