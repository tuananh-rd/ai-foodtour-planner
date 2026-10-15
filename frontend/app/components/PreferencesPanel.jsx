'use client';

import { useState, useEffect, useRef } from 'react';
import { geocodeAddress } from '../../lib/api';
import { loadGoogleMaps } from '../../lib/googleMapsLoader';

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
  isMock,
  clientConfig,
  sessionToken = ''
}) {
  const [originPreset, setOriginPreset] = useState('hoankiem');
  const [customLat, setCustomLat] = useState(21.033);
  const [customLon, setCustomLon] = useState(105.850);
  const [originLabel, setOriginLabel] = useState(preferences.origin_label || null);
  const [originSource, setOriginSource] = useState(preferences.origin_source || null);

  // Origin selection race guard token
  const originGenerationRef = useRef(0);
  const geocodeAbortRef = useRef(null);

  // Geolocation state
  const [geoError, setGeoError] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);

  // Manual Geocoding fallback state
  const [addressQuery, setAddressQuery] = useState('');
  const [geocodingLoading, setGeocodingLoading] = useState(false);
  const [geocodingResults, setGeocodingResults] = useState([]);
  const [geocodingStatusMsg, setGeocodingStatusMsg] = useState(null);

  // Place Autocomplete container
  const autocompleteContainerRef = useRef(null);
  const [placesAvailable, setPlacesAvailable] = useState(false);

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

  // Cancel geocode search and bump generation on unmount
  useEffect(() => {
    return () => {
      originGenerationRef.current++;
      if (geocodeAbortRef.current) {
        geocodeAbortRef.current.abort();
      }
    };
  }, []);

  // Sync state when preferences change from external source
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
    setOriginLabel(preferences.origin_label || null);
    setOriginSource(preferences.origin_source || null);
  }, [preferences]);

  // Setup Google Maps PlaceAutocompleteElement if available
  useEffect(() => {
    let active = true;
    if (typeof window === 'undefined') return;

    async function initPlacesAutocomplete() {
      const isTestFake = typeof window !== 'undefined' && Boolean(window.__TEST_FAKE_GOOGLE_MAPS__);
      const mapsConfig = clientConfig?.maps;
      const isConfigReady = mapsConfig && mapsConfig.status === 'ready' && mapsConfig.js_api_key;

      if (!isConfigReady && !isTestFake) {
        setPlacesAvailable(false);
        return;
      }

      try {
        const { places } = await loadGoogleMaps({
          apiKey: mapsConfig?.js_api_key || 'TEST_KEY',
          language: mapsConfig?.language || 'vi',
          region: mapsConfig?.region || 'VN'
        });
        const { PlaceAutocompleteElement } = places || {};
        if (!active || !PlaceAutocompleteElement || !autocompleteContainerRef.current) return;

        autocompleteContainerRef.current.innerHTML = '';
        const autocomplete = new PlaceAutocompleteElement({
          includedRegionCodes: ['vn'],
          locationBias: {
            center: { lat: 21.0285, lng: 105.8522 },
            radius: 20000
          }
        });
        try {
          if (Array.isArray(autocomplete.includedRegionCodes)) {
            autocomplete.includedRegionCodes = ['vn'];
          }
          if (autocomplete.locationBias !== undefined) {
            autocomplete.locationBias = {
              center: { lat: 21.0285, lng: 105.8522 },
              radius: 20000
            };
          }
        } catch (_) {}
        autocomplete.setAttribute('aria-label', 'Tìm kiếm địa điểm với Google Maps (Hà Nội)');

        autocomplete.addEventListener('gmp-select', async ({ placePrediction }) => {
          if (!placePrediction) return;
          const currentGen = ++originGenerationRef.current;
          try {
            const place = typeof placePrediction.toPlace === 'function' ? placePrediction.toPlace() : placePrediction;
            if (typeof place?.fetchFields === 'function') {
              await place.fetchFields({
                fields: ['displayName', 'formattedAddress', 'location']
              });
            }
            if (!active || currentGen !== originGenerationRef.current) return;

            const loc = place?.location;
            if (loc) {
              const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
              const lon = typeof loc.lng === 'function' ? loc.lng() : (loc.lon || loc.lng);
              const label = place.displayName || place.formattedAddress || 'Địa điểm Google Maps';
              setCustomLat(Math.round(lat * 1e6) / 1e6);
              setCustomLon(Math.round(lon * 1e6) / 1e6);
              setOriginLabel(typeof label === 'string' ? label.slice(0, 120) : String(label).slice(0, 120));
              setOriginSource('place');
              setOriginPreset('custom');
            }
          } catch (err) {
            console.warn('[Places] fetchFields failed');
          }
        });

        autocompleteContainerRef.current.appendChild(autocomplete);
        setPlacesAvailable(true);
      } catch (_) {
        if (active) setPlacesAvailable(false);
      }
    }

    initPlacesAutocomplete();

    const handleTestInit = () => initPlacesAutocomplete();
    if (typeof window !== 'undefined') {
      window.addEventListener('__TEST_INIT_FAKE_MAPS__', handleTestInit);
    }

    return () => {
      active = false;
      originGenerationRef.current++;
      if (typeof window !== 'undefined') {
        window.removeEventListener('__TEST_INIT_FAKE_MAPS__', handleTestInit);
      }
    };
  }, [clientConfig]);

  // Explicit Click: Dùng vị trí hiện tại
  const handleGetCurrentPosition = (e) => {
    e.preventDefault();
    setGeoError(null);
    const currentGen = ++originGenerationRef.current;

    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGeoError('Trình duyệt của bạn không hỗ trợ định vị (Geolocation API).');
      return;
    }

    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setGeoError('Định vị yêu cầu kết nối bảo mật HTTPS hoặc môi trường localhost.');
      return;
    }

    setGeoLoading(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (currentGen !== originGenerationRef.current) return;
        setGeoLoading(false);
        const lat = Math.round(position.coords.latitude * 1e6) / 1e6;
        const lon = Math.round(position.coords.longitude * 1e6) / 1e6;
        setCustomLat(lat);
        setCustomLon(lon);
        setOriginLabel('Vị trí hiện tại');
        setOriginSource('current_location');
        setOriginPreset('custom');
      },
      (error) => {
        if (currentGen !== originGenerationRef.current) return;
        setGeoLoading(false);
        if (error.code === 1) { // PERMISSION_DENIED
          setGeoError('Bạn đã từ chối quyền truy cập vị trí. Hãy bật lại quyền trong cài đặt trình duyệt hoặc chọn địa điểm thủ công.');
        } else if (error.code === 2) { // POSITION_UNAVAILABLE
          setGeoError('Không thể xác định được vị trí hiện tại của thiết bị. Vui lòng nhập địa chỉ hoặc toạ độ thủ công.');
        } else if (error.code === 3) { // TIMEOUT
          setGeoError('Quá thời gian xác định vị trí GPS. Vui lòng thử lại hoặc nhập toạ độ thủ công.');
        } else {
          setGeoError(`Lỗi định vị: ${error.message || 'Không rõ nguyên nhân'}`);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    );
  };

  // Manual Geocode Address search fallback
  const handleGeocodeSearch = async (e) => {
    e.preventDefault();
    const query = (addressQuery || '').trim();
    if (!query) return;

    if (geocodeAbortRef.current) {
      geocodeAbortRef.current.abort();
    }
    const controller = new AbortController();
    geocodeAbortRef.current = controller;

    const currentGen = ++originGenerationRef.current;
    setGeocodingLoading(true);
    setGeocodingStatusMsg(null);
    setGeocodingResults([]);

    try {
      const res = await geocodeAddress(query, sessionToken, { signal: controller.signal });
      if (currentGen !== originGenerationRef.current) return;
      if (res.status === 'ok' && Array.isArray(res.results) && res.results.length > 0) {
        setGeocodingResults(res.results);
      } else if (res.status === 'zero_results') {
        setGeocodingStatusMsg('Không tìm thấy toạ độ cho địa chỉ này. Hãy thử địa chỉ khác hoặc nhập toạ độ.');
      } else if (res.status === 'quota') {
        setGeocodingStatusMsg('Dịch vụ tìm toạ độ tạm thời vượt hạn ngạch (quota). Vui lòng nhập toạ độ thủ công.');
      } else {
        setGeocodingStatusMsg('Dịch vụ tìm toạ độ hiện không khả dụng. Vui lòng nhập toạ độ thủ công.');
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (currentGen !== originGenerationRef.current) return;
      setGeocodingStatusMsg(err.message || 'Lỗi khi tìm toạ độ địa chỉ.');
    } finally {
      if (currentGen === originGenerationRef.current) {
        setGeocodingLoading(false);
      }
    }
  };

  const handleSelectGeocodeResult = (result) => {
    originGenerationRef.current++;
    setCustomLat(Math.round(result.lat * 1e6) / 1e6);
    setCustomLon(Math.round(result.lon * 1e6) / 1e6);
    setOriginLabel(result.label.slice(0, 120));
    setOriginSource('geocoded');
    setOriginPreset('custom');
    setGeocodingResults([]);
    setAddressQuery('');
  };

  const handlePresetChange = (presetId) => {
    originGenerationRef.current++;
    setOriginPreset(presetId);
    const loc = PRESET_LOCATIONS.find((p) => p.id === presetId);
    if (loc && presetId !== 'custom') {
      setCustomLat(loc.lat);
      setCustomLon(loc.lon);
      setOriginLabel(loc.name);
      setOriginSource('landmark');
    }
  };

  const handleAddInterest = (item) => {
    const list = interestsStr.split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.includes(item)) {
      setInterestsStr([...list, item].join(', '));
    }
  };

  const handleAddExclusion = (item) => {
    const list = exclusionsStr.split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.includes(item)) {
      setExclusionsStr([...list, item].join(', '));
    }
  };

  const buildPreferencesPayload = () => {
    return {
      city: 'Hà Nội',
      origin: customLat != null && customLon != null ? { lat: Number(customLat), lon: Number(customLon) } : null,
      origin_label: originLabel || null,
      origin_source: originSource || null,
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
        {/* Origin Selection Section */}
        <div style={{ background: '#fafafa', border: '1px solid var(--border-color)', borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label
              htmlFor="pref-origin-preset"
              style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}
            >
              Điểm xuất phát (Hà Nội)
            </label>

            {/* Current Location Button */}
            <button
              type="button"
              onClick={handleGetCurrentPosition}
              disabled={busy || geoLoading}
              data-testid="use-current-location-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: 600,
                color: '#065f46',
                background: '#d1fae5',
                border: '1px solid #a7f3d0',
                borderRadius: 8,
                cursor: busy || geoLoading ? 'not-allowed' : 'pointer'
              }}
            >
              <span>📍</span>
              <span>{geoLoading ? 'Đang định vị…' : 'Dùng vị trí hiện tại'}</span>
            </button>
          </div>

          {/* Geolocation Error Alert */}
          {geoError && (
            <div
              role="alert"
              data-testid="geo-error-alert"
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                padding: '8px 10px',
                borderRadius: 8,
                fontSize: 12,
                marginBottom: 10,
                lineHeight: 1.4
              }}
            >
              ⚠️ {geoError}
            </div>
          )}

          {/* Selected Origin Tag */}
          {customLat != null && customLon != null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 6,
                fontSize: 12,
                color: '#166534',
                marginBottom: 10
              }}
            >
              <span style={{ fontWeight: 700 }}>Đã chọn:</span>
              <span>{originLabel || 'Toạ độ'} ({customLat.toFixed(4)}, {customLon.toFixed(4)})</span>
              {originSource && (
                <span
                  style={{
                    background: '#dcfce7',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600
                  }}
                >
                  [{originSource}]
                </span>
              )}
            </div>
          )}

          {/* Google Place Autocomplete Container */}
          <div
            ref={autocompleteContainerRef}
            data-testid="place-autocomplete-container"
            style={{ marginBottom: 10, minHeight: placesAvailable ? 40 : 0 }}
          />

          {/* Manual Address Search Fallback (Server Geocoding) */}
          <div style={{ marginBottom: 10 }}>
            <label htmlFor="pref-address-query" style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Tìm địa chỉ xuất phát tại Hà Nội
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                id="pref-address-query"
                type="text"
                placeholder="Tìm địa chỉ tại Hà Nội (hoặc phố, ngõ)…"
                value={addressQuery}
                onChange={(e) => setAddressQuery(e.target.value)}
                disabled={busy || geocodingLoading}
                style={{
                  flex: 1,
                  minHeight: 38,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border-color)',
                  fontSize: 12
                }}
              />
              <button
                type="button"
                onClick={handleGeocodeSearch}
                disabled={busy || geocodingLoading || !addressQuery.trim()}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  background: '#f1f5f9',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6,
                  cursor: busy || geocodingLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {geocodingLoading ? 'Đang tìm…' : 'Tìm toạ độ'}
              </button>
            </div>

            {/* Geocoding Status Message */}
            {geocodingStatusMsg && (
              <div role="status" style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>
                {geocodingStatusMsg}
              </div>
            )}

            {/* Geocoding Results Dropdown */}
            {geocodingResults.length > 0 && (
              <div
                style={{
                  marginTop: 6,
                  background: '#fff',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6,
                  maxHeight: 140,
                  overflowY: 'auto'
                }}
              >
                {geocodingResults.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelectGeocodeResult(r)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      fontSize: 12,
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer'
                    }}
                  >
                    📍 {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Landmark Preset Dropdown */}
          <div style={{ marginBottom: 10 }}>
            <label
              htmlFor="pref-origin-preset"
              style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}
            >
              Chọn nhanh địa danh hoặc nhập toạ độ
            </label>
            <select
              id="pref-origin-preset"
              value={originPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              disabled={busy}
              style={{
                width: '100%',
                minHeight: 40,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: '#fff',
                fontSize: 13
              }}
            >
              {PRESET_LOCATIONS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Custom Coordinates Inputs (Always accessible for manual entry) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              background: '#f8fafc',
              padding: 10,
              borderRadius: 8,
              border: '1px solid #e2e8f0'
            }}
          >
            <div>
              <label htmlFor="pref-custom-lat" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                Vĩ độ (Lat)
              </label>
              <input
                id="pref-custom-lat"
                type="number"
                step="any"
                value={customLat}
                onChange={(e) => {
                  originGenerationRef.current++;
                  setCustomLat(Number(e.target.value));
                  setOriginSource('manual_coordinates');
                  setOriginPreset('custom');
                }}
                disabled={busy}
                required
                style={{ width: '100%', minHeight: 36, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 12 }}
              />
            </div>
            <div>
              <label htmlFor="pref-custom-lon" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                Kinh độ (Lon)
              </label>
              <input
                id="pref-custom-lon"
                type="number"
                step="any"
                value={customLon}
                onChange={(e) => {
                  originGenerationRef.current++;
                  setCustomLon(Number(e.target.value));
                  setOriginSource('manual_coordinates');
                  setOriginPreset('custom');
                }}
                disabled={busy}
                required
                style={{ width: '100%', minHeight: 36, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 12 }}
              />
            </div>
          </div>

          {/* Privacy Note (Mandatory per docs/PHASE4.md 'Data sent to Google') */}
          <div
            role="note"
            data-testid="privacy-disclosure"
            style={{
              marginTop: 10,
              padding: '8px 12px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              fontSize: 11,
              color: 'var(--text-secondary)',
              lineHeight: 1.5
            }}
          >
            🔒 <strong>Dữ liệu gửi tới Google:</strong>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: 16 }}>
              <li>
                <strong>Vị trí hiện tại:</strong> Ứng dụng chỉ hỏi vị trí khi bạn bấm nút &quot;Dùng vị trí hiện tại&quot;. Tuỳ trình duyệt, trình duyệt có thể dùng dịch vụ vị trí riêng của hãng (nằm ngoài kiểm soát của ứng dụng). Toạ độ được lưu vào phiên làm việc trên máy chủ (TTL/SQLite) khi lưu tuỳ chọn hoặc lập lịch trình.
              </li>
              <li>
                <strong>Tuyến đi bộ (Google Routes):</strong> Khi lập lịch trình hoặc đổi quán, toạ độ xuất phát cùng toạ độ các quán ăn ứng viên (≤ 16 điểm khi lập, ≤ 45 điểm khi đổi quán) được gửi tới Google Routes để tính đường đi.
              </li>
              <li>
                <strong>Tìm kiếm địa chỉ:</strong> Ký tự bạn gõ vào ô tìm kiếm được gửi tới Google Places / Geocoding. Nhập toạ độ thủ công không gửi dữ liệu tới Google.
              </li>
              <li>
                <strong>Trợ lý AI (Gemini):</strong> Nội dung chat và tiêu chí lọc được gửi tới Gemini nếu được cấu hình; toạ độ GPS chính xác không bao giờ gửi tới Gemini.
              </li>
              <li>
                <strong>Bản đồ:</strong> Trình duyệt tải các ô bản đồ hiển thị; danh sách quán ăn nội bộ không bao giờ tải lên Google.
              </li>
            </ul>
          </div>
        </div>

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
