'use client';

import React, { useState } from 'react';

/**
 * StartScreen (UX §2, TASK C3-1)
 *
 * Requirements:
 * - 'Bạn đang ở đâu tại Hà Nội?'
 * - primary 'Bật định vị' (navigator.geolocation -> action set_location {lat,lon};
 *   handle denied/timeout/unsupported with friendly message & fallbacks)
 * - 'Nhập khu vực/đường' (typed text goes to chat)
 * - quick district/landmark chips (Ba Đình, Cầu Giấy, Hai Bà Trưng, Hoàn Kiếm)
 * - show 'Vị trí ước tính … (xấp xỉ)' with 'Đúng vị trí' / 'Chỉnh vị trí'
 * - outside Hà Nội handled by server notice
 * - suggestion chips ('Quanh đây có món gì đáng thử?', 'Tìm quán phở gần tôi', 'Food tour 2 tiếng quanh khu này')
 * - No weather chips (no weather data)
 * - Touch targets >= 44px
 */
export default function StartScreen({
  onAction,
  onSendMessage,
  busy = false,
  clarifyOptions = [],
  outsideNotice = null,
}) {
  const [typedLocation, setTypedLocation] = useState('');
  const [geoState, setGeoState] = useState(null); // null | { status: 'success' | 'error', label: string, lat?: number, lon?: number, errorMsg?: string }
  const [confirmedLocation, setConfirmedLocation] = useState(false);

  // Default district chips if none provided
  const defaultDistricts = ['Ba Đình', 'Cầu Giấy', 'Hai Bà Trưng', 'Hoàn Kiếm'];
  const districtOptions = clarifyOptions.length > 0 
    ? clarifyOptions 
    : defaultDistricts.map((d) => ({ option_id: `district:${d}`, label: d }));

  const suggestionChips = [
    'Quanh đây có món gì đáng thử?',
    'Tìm quán phở gần tôi',
    'Food tour 2 tiếng quanh khu này',
  ];

  const handleGeolocation = () => {
    if (busy) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoState({
        status: 'error',
        errorMsg: 'Trình duyệt của bạn không hỗ trợ định vị. Bạn hãy nhập khu vực hoặc chọn quận bên dưới.',
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setGeoState({
          status: 'success',
          lat,
          lon,
          label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        });
      },
      (err) => {
        setGeoState({
          status: 'error',
          errorMsg: 'Không thể lấy vị trí từ trình duyệt (hoặc bạn đã từ chối cấp quyền). Bạn hãy nhập khu vực hoặc chọn quận bên dưới.',
        });
      },
      { timeout: 10000 }
    );
  };

  const handleConfirmLocation = () => {
    setConfirmedLocation(true);
    if (geoState?.status === 'success' && onAction) {
      onAction({
        type: 'set_location',
        location: {
          lat: geoState.lat,
          lon: geoState.lon,
          label: `Toạ độ ${geoState.label}`,
        },
      });
    }
  };

  const handleEditLocation = () => {
    setGeoState(null);
    setConfirmedLocation(false);
  };

  const handleSubmitText = (e) => {
    e.preventDefault();
    if (busy || !typedLocation.trim()) return;
    if (onSendMessage) {
      onSendMessage(typedLocation.trim());
      setTypedLocation('');
    }
  };

  const handleDistrictClick = (opt) => {
    if (busy) return;
    if (opt.option_id === 'geo') {
      handleGeolocation();
      return;
    }
    const districtName = opt.label || opt.option_id.replace('district:', '');
    if (onAction) {
      onAction({
        type: 'set_location',
        location: { district: districtName, label: districtName },
      });
    }
  };

  const handleSuggestionClick = (text) => {
    if (busy) return;
    if (onSendMessage) {
      onSendMessage(text);
    }
  };

  return (
    <div
      data-testid="start-screen"
      style={{
        maxWidth: 680,
        margin: '40px auto',
        padding: '24px 20px',
        background: '#FFFFFF',
        borderRadius: 16,
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        border: '1px solid #DFD5C6',
      }}
    >
      {/* Title */}
      <h1
        data-testid="start-title"
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: '#1F1B16',
          margin: '0 0 16px',
          textAlign: 'center',
        }}
      >
        Bạn đang ở đâu tại Hà Nội?
      </h1>

      <p style={{ textAlign: 'center', fontSize: 14, color: '#6B6259', margin: '0 0 24px' }}>
        Chọn cách xác định điểm xuất phát để AI gợi ý các món ngon và quán ăn gần bạn nhất.
      </p>

      {/* Outside Hanoi server notice */}
      {outsideNotice && (
        <div
          data-testid="outside-hanoi-notice"
          role="alert"
          style={{
            background: '#FFFBEB',
            border: '1px solid #FDE68A',
            borderLeft: '4px solid #D97706',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 20,
            fontSize: 13,
            color: '#92400E',
          }}
        >
          {outsideNotice}
        </div>
      )}

      {/* Geolocation Section */}
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        {(!geoState || geoState.status === 'error') && (
          <button
            type="button"
            disabled={busy}
            onClick={handleGeolocation}
            data-testid="btn-geolocation"
            style={{
              minHeight: 48,
              minWidth: 200,
              padding: '12px 24px',
              borderRadius: 10,
              border: 'none',
              background: '#C8431A',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: 15,
              cursor: busy ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 6px rgba(200,67,26,0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span>📍</span>
            <span>Bật định vị</span>
          </button>
        )}

        {/* Geolocation Denied / Friendly Error */}
        {geoState?.status === 'error' && (
          <div
            data-testid="geo-denied-message"
            style={{
              marginTop: 12,
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              color: '#991B1B',
              textAlign: 'left',
            }}
          >
            ⚠️ {geoState.errorMsg}
          </div>
        )}

        {/* Geolocation Estimated Display */}
        {geoState?.status === 'success' && (
          <div
            data-testid="geo-estimated-box"
            style={{
              background: '#FFF6E0',
              border: '1px solid #FFD480',
              borderRadius: 10,
              padding: '14px 18px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 14, color: '#6E4300', marginBottom: 12 }}>
              📍 <strong>Vị trí ước tính {geoState.label} (xấp xỉ)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmLocation}
                style={{
                  minHeight: 44,
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#195624',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                Đúng vị trí
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleEditLocation}
                style={{
                  minHeight: 44,
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: '1px solid #DFD5C6',
                  background: '#FFFFFF',
                  color: '#1F1B16',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                Chỉnh vị trí
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0', color: '#8C827A', fontSize: 13 }}>
        <div style={{ flex: 1, height: 1, background: '#DFD5C6' }} />
        <span>hoặc</span>
        <div style={{ flex: 1, height: 1, background: '#DFD5C6' }} />
      </div>

      {/* Manual Input Form */}
      <form onSubmit={handleSubmitText} style={{ marginBottom: 24, display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={typedLocation}
          onChange={(e) => setTypedLocation(e.target.value)}
          placeholder="Nhập khu vực/đường (ví dụ: Cầu Giấy, Xuân Thủy, Phố Cổ...)"
          aria-label="Nhập khu vực hoặc đường"
          data-testid="input-location"
          disabled={busy}
          style={{
            flex: 1,
            minHeight: 44,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #DFD5C6',
            fontSize: 14,
            color: '#1F1B16',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={busy || !typedLocation.trim()}
          style={{
            minHeight: 44,
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: busy || !typedLocation.trim() ? '#E5E7EB' : '#C8431A',
            color: busy || !typedLocation.trim() ? '#6B7280' : '#FFFFFF',
            fontWeight: 700,
            fontSize: 14,
            cursor: busy || !typedLocation.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          Gửi
        </button>
      </form>

      {/* Quick District Chips */}
      <div style={{ marginBottom: 24 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6B6259', display: 'block', marginBottom: 8 }}>
          Chọn nhanh quận trung tâm:
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {districtOptions.map((opt, idx) => (
            <button
              key={opt.option_id || idx}
              type="button"
              disabled={busy}
              onClick={() => handleDistrictClick(opt)}
              style={{
                minHeight: 44,
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #DFD5C6',
                background: '#FBF8F3',
                color: '#1F1B16',
                fontWeight: 600,
                fontSize: 13,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              {opt.label || opt.option_id}
            </button>
          ))}
        </div>
      </div>

      {/* Suggestion Chips */}
      <div>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6B6259', display: 'block', marginBottom: 8 }}>
          Gợi ý khám phá nhanh:
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {suggestionChips.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              disabled={busy}
              onClick={() => handleSuggestionClick(chip)}
              style={{
                minHeight: 44,
                padding: '8px 14px',
                borderRadius: 20,
                border: '1px solid #C8431A',
                background: '#FFFFFF',
                color: '#C8431A',
                fontWeight: 600,
                fontSize: 13,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              💡 {chip}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
