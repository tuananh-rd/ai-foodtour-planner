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
  const [budgetVnd, setBudgetVnd] = useState(preferences.budget_vnd != null ? preferences.budget_vnd : 150000);
  const [budgetScope, setBudgetScope] = useState(preferences.budget_scope || 'per_person');
  const [partySize, setPartySize] = useState(preferences.party_size || 1);
  const [interestsStr, setInterestsStr] = useState((preferences.interests || []).join(', '));
  const [exclusionsStr, setExclusionsStr] = useState((preferences.exclusions || []).join(', '));
  const [maxStops, setMaxStops] = useState(preferences.max_stops || 3);
  const [mode, setMode] = useState(preferences.mode || 'explore');

  // Sync state if preferences change from chat extraction or server reset.
  // Properly handle null/empty server resets so UI form fields reflect authoritative state.
  useEffect(() => {
    setStartTime(preferences.start_time || '');
    setWeekday(preferences.weekday ?? 0);
    setDurationMin(preferences.duration_min != null ? preferences.duration_min : 120);
    setBudgetVnd(preferences.budget_vnd != null ? preferences.budget_vnd : '');
    setBudgetScope(preferences.budget_scope || 'per_person');
    setPartySize(preferences.party_size != null ? preferences.party_size : 1);
    setInterestsStr((preferences.interests || []).join(', '));
    setExclusionsStr((preferences.exclusions || []).join(', '));
    setMaxStops(preferences.max_stops != null ? preferences.max_stops : 3);
    setMode(preferences.mode || 'explore');
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
      origin: customLat != null && customLon != null ? { lat: Number(customLat), lon: Number(customLon) } : null,
      start_time: startTime || null,
      weekday: weekday !== '' && weekday != null ? Number(weekday) : null,
      duration_min: durationMin !== '' && durationMin != null ? Number(durationMin) : null,
      budget_vnd: budgetVnd !== '' && budgetVnd != null ? Number(budgetVnd) : null,
      budget_scope: budgetScope || null,
      party_size: partySize !== '' && partySize != null ? Number(partySize) : null,
      interests: interestsStr.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10),
      exclusions: exclusionsStr.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10),
      max_stops: maxStops !== '' && maxStops != null ? Number(maxStops) : 3,
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
      aria-label="Bảng tùy chọn chuyến đi có cấu trúc"
      style={{
        background: '#fff',
        borderRadius: 16,
        padding: 20,
        boxShadow: 'var(--shadow-sm)',
        marginBottom: 20
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>⚙️</span>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Tùy Chọn Chuyến Đi (Cấu trúc)
          </h3>
        </div>
        <span
          style={{
            fontSize: 12,
            background: 'var(--bg-subtle)',
            color: 'var(--text-secondary)',
            padding: '4px 8px',
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
          <label htmlFor="pref-origin-preset" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
            Điểm xuất phát (Hà Nội)
          </label>
          <select
            id="pref-origin-preset"
            value={originPreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            disabled={busy}
            style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff' }}
          >
            {PRESET_LOCATIONS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {!preferences.origin && (
            <div role="note" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Chưa xác nhận điểm xuất phát với máy chủ; đang đề xuất vị trí hiển thị phía trên. Bấm lập lịch trình để xác nhận.
            </div>
          )}
        </div>

        {/* Custom Coordinates */}
        {originPreset === 'custom' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: '#f5f4ef', padding: 10, borderRadius: 8 }}>
            <div>
              <label htmlFor="pref-custom-lat" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Vĩ độ (Lat)</label>
              <input
                id="pref-custom-lat"
                type="number"
                step="any"
                value={customLat}
                onChange={(e) => setCustomLat(Number(e.target.value))}
                disabled={busy}
                required
                style={{ width: '100%', minHeight: 38, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)' }}
              />
            </div>
            <div>
              <label htmlFor="pref-custom-lon" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Kinh độ (Lon)</label>
              <input
                id="pref-custom-lon"
                type="number"
                step="any"
                value={customLon}
                onChange={(e) => setCustomLon(Number(e.target.value))}
                disabled={busy}
                required
                style={{ width: '100%', minHeight: 38, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)' }}
              />
            </div>
          </div>
        )}

        {/* Giờ xuất phát & Thứ trong tuần */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label htmlFor="pref-start-time" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Giờ bắt đầu
            </label>
            <input
              id="pref-start-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={busy}
              style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
            />
          </div>
          <div>
            <label htmlFor="pref-weekday" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Ngày trong tuần
            </label>
            <select
              id="pref-weekday"
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
              disabled={busy}
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
            <label htmlFor="pref-duration" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Thời lượng (phút): {durationMin}p
            </label>
            {preferences.duration_min == null && (
              <div role="note" style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                Giá trị gợi ý (chưa được xác nhận); bạn chỉ lập lịch với thời lượng này nếu bấm lập lịch trình.
              </div>
            )}
            <input
              id="pref-duration"
              type="range"
              min="30"
              max="720"
              step="15"
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              disabled={busy}
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
            <label htmlFor="pref-max-stops" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Số điểm dừng (1–5)
            </label>
            <select
              id="pref-max-stops"
              value={maxStops}
              onChange={(e) => setMaxStops(Number(e.target.value))}
              disabled={busy}
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
            <label htmlFor="pref-budget-vnd" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Ngân sách (₫)
            </label>
            <input
              id="pref-budget-vnd"
              type="number"
              min="10000"
              step="10000"
              value={budgetVnd}
              onChange={(e) => setBudgetVnd(e.target.value ? Number(e.target.value) : '')}
              disabled={busy}
              placeholder="150000"
              style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
            />
          </div>
          <div>
            <label htmlFor="pref-budget-scope" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Phạm vi
            </label>
            <select
              id="pref-budget-scope"
              value={budgetScope}
              onChange={(e) => setBudgetScope(e.target.value)}
              disabled={busy}
              style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff' }}
            >
              <option value="per_person">Mỗi người</option>
              <option value="group">Cả nhóm</option>
            </select>
          </div>
          <div>
            <label htmlFor="pref-party-size" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Số người
            </label>
            <input
              id="pref-party-size"
              type="number"
              min="1"
              max="20"
              value={partySize}
              onChange={(e) => setPartySize(e.target.value ? Number(e.target.value) : '')}
              disabled={busy}
              style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
            />
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -6 }}>
          * Khoảng giá tham khảo từ quán, không đảm bảo chi phí chính xác từng món
        </span>

        {/* Món ăn yêu thích & Chips */}
        <div>
          <label htmlFor="pref-interests" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
            Sở thích món ăn (tối đa 10 món)
          </label>
          <input
            id="pref-interests"
            type="text"
            placeholder="Ví dụ: Phở, Bún chả, Chè..."
            value={interestsStr}
            onChange={(e) => setInterestsStr(e.target.value)}
            disabled={busy}
            style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {QUICK_INTERESTS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleAddInterest(item)}
                disabled={busy}
                style={chipStyle}
              >
                + {item}
              </button>
            ))}
          </div>
        </div>

        {/* Món loại trừ */}
        <div>
          <label htmlFor="pref-exclusions" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
            Món / Thành phần loại trừ (tối đa 10 món)
          </label>
          <input
            id="pref-exclusions"
            type="text"
            placeholder="Ví dụ: Ốc, Mắm tôm..."
            value={exclusionsStr}
            onChange={(e) => setExclusionsStr(e.target.value)}
            disabled={busy}
            style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {QUICK_EXCLUSIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleAddExclusion(item)}
                disabled={busy}
                style={chipStyle}
              >
                ✕ {item}
              </button>
            ))}
          </div>
        </div>

        {/* Chế độ kiểm định */}
        <div>
          <label htmlFor="pref-mode" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
            Chế độ kiểm định (Mode)
          </label>
          <select
            id="pref-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={busy}
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
