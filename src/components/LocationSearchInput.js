import { useState, useRef, useEffect, useCallback } from 'react';
import { ImTarget } from 'react-icons/im';
import { useLocationSearch } from '../hooks/useLocationSearch';

/**
 * LocationSearchInput
 *
 * Props:
 *  - value          {string}   현재 입력값
 *  - onChange       {fn}       텍스트 변경 콜백 (string)
 *  - onSelect       {fn}       추천 항목 선택 콜백 ({ label, lat, lng })
 *                              ※ 변경: 이전엔 label(string)만 전달했으나, 좌표도 함께 전달
 *  - placeholder    {string}
 *  - showLocateBtn  {boolean}  현 위치 버튼 표시 여부 (출발지 전용)
 *  - userLocation   {{ lat, lng } | null}  현 위치 좌표 (근거리 우선 정렬용)
 *  - onLocate       {fn}       현 위치 버튼 클릭 콜백 ({ lat, lng, address })
 */

function LocationSearchInput({
  value,
  onChange,
  onSelect,
  placeholder,
  showLocateBtn = false,
  userLocation,
  onLocate,
}) {
  const [open, setOpen] = useState(false);
  // 마운트 직후 드롭다운/포커스 차단 guard — 내비게이션 종료 후 자동 열림 방지
  const blockFocusRef = useRef(true);
  useEffect(() => {
    const timer = setTimeout(() => { blockFocusRef.current = false; }, 500);
    return () => clearTimeout(timer);
  }, []);
  const [locating, setLocating] = useState(false);
  const containerRef = useRef(null);

  const { suggestions, loading } = useLocationSearch(value, userLocation);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleLocate() {
    if (!navigator.geolocation) {
      alert('이 브라우저에서는 현 위치 기능을 사용할 수 없어요.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko&addressdetails=1`
          );
          const data = await res.json();
          const addr = data.address || {};
          // 한국식 주소 순서: 시/도 → 구 → 동 → 도로명
          // 지역에 따라 borough(구)나 quarter(동)가 없을 수 있어 필터링 후 조립
          const address = [
            addr.city || addr.province,
            addr.borough,
            addr.quarter || addr.suburb || addr.village,
            addr.road,
          ].filter(Boolean).join(' ')
            || data.display_name
            || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

          onChange(address);
          // 현 위치는 좌표가 확정이므로 onSelect에 좌표 포함
          onSelect && onSelect({ label: address, lat, lng });
          onLocate && onLocate({ lat, lng, address });
        } catch {
          alert('현 위치 주소를 가져오지 못했어요.');
        } finally {
          setLocating(false);
          setOpen(false);
        }
      },
      () => {
        alert('현 위치 권한이 거부되었어요. 브라우저 설정에서 허용해 주세요.');
        setLocating(false);
      }
    );
  }

  // 드롭다운 항목 선택 — label(표시용 텍스트) + 좌표를 함께 상위로 전달
  function handleSelect(suggestion) {
    onChange(suggestion.label);
    onSelect && onSelect({ label: suggestion.label, lat: suggestion.lat, lng: suggestion.lng });
    setOpen(false);
  }

  /* ─── 스타일 ─────────────────────────────────────────── */
  const wrapStyle = {
    position: 'relative',
    width: '100%',
  };

  const inputRowStyle = {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#1e2d3d',
    borderRadius: '12px',
    border: '1px solid #2a3f55',
    overflow: 'visible',
    transition: 'border-color 0.2s',
  };

  const inputStyle = {
    flex: 1,
    boxSizing: 'border-box', // padding이 너비에 추가로 더해지며 버튼을 밀어내는 현상 방지
    minWidth: 0,             // flex item이 콘텐츠 크기로 인해 부모를 넘치지 않도록
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#e0eaf5',
    fontSize: '15px',
    padding: '16px 14px',
    fontFamily: 'inherit',
  };

  const locateBtnStyle = {
    flexShrink: 0,
    width: '38px',
    height: '38px',
    margin: '0 8px 0 0',
    background: locating ? '#2a5a7a' : '#1a3a52',
    border: '1px solid #2a6090',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: locating ? 'not-allowed' : 'pointer',
    color: locating ? '#aaa' : '#56CCF2',
    transition: 'background 0.15s, color 0.15s',
  };

  const dropdownStyle = {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    right: 0,
    backgroundColor: '#1a2a3a',
    border: '1px solid #2a4a64',
    borderRadius: '10px',
    overflow: 'hidden',
    zIndex: 1000,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  };

  const itemBaseStyle = {
    padding: '11px 14px',
    cursor: 'pointer',
    borderBottom: '1px solid #1e3448',
    transition: 'background 0.1s',
  };

  const loadingStyle = {
    padding: '12px 14px',
    fontSize: '13px',
    color: '#6a8faa',
  };

  return (
    <div style={wrapStyle} ref={containerRef}>
      <div style={inputRowStyle}>
        <input
          style={inputStyle}
          type="text"
          placeholder={placeholder}
          value={value}
          autoComplete="off"
          autoFocus={false}
          onChange={(e) => {
            onChange(e.target.value);
            // 사용자가 직접 타이핑할 때만 드롭다운 열기
            // (swap 등 외부에서 value가 바뀌는 경우는 onChange가 발생하지 않으므로 자연히 차단됨)
            if (!blockFocusRef.current) {
              if (e.target.value.trim().length >= 2) setOpen(true);
              else setOpen(false);
            }
          }}
          onFocus={() => {
            if (blockFocusRef.current) return;
            if (value.trim().length >= 2) setOpen(true);
          }}
        />
        {showLocateBtn && (
          <button
            style={locateBtnStyle}
            onClick={handleLocate}
            title="현 위치 사용"
            disabled={locating}
            onMouseEnter={(e) => {
              if (!locating) e.currentTarget.style.background = '#1e4a6a';
            }}
            onMouseLeave={(e) => {
              if (!locating) e.currentTarget.style.background = '#1a3a52';
            }}
          >
            <ImTarget size={16} />
          </button>
        )}
      </div>

      {open && (
        <div style={dropdownStyle}>
          {loading ? (
            <div style={loadingStyle}>검색 중…</div>
          ) : suggestions.length === 0 ? (
            <div style={loadingStyle}>검색 결과가 없어요.</div>
          ) : (
            suggestions.map((s, i) => (
              <div
                key={`${s.id}-${i}`}
                style={{
                  ...itemBaseStyle,
                  borderBottom: i === suggestions.length - 1 ? 'none' : itemBaseStyle.borderBottom,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#1e3a52')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onMouseDown={() => handleSelect(s)}
              >
                {/* 장소명 + 거리 뱃지 — 한 줄 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{
                    fontSize: '15px',
                    fontWeight: '500',
                    color: '#c8dcea',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}>
                    {s.label}
                  </div>
                  {s.distKm !== null && s.distKm !== undefined && (
                    <span style={{
                      fontSize: '11px',
                      color: '#56CCF2',
                      whiteSpace: 'nowrap',
                      marginLeft: '8px',
                      flexShrink: 0,
                    }}>
                      {s.distKm < 1
                        ? `${Math.round(s.distKm * 1000)}m`
                        : `${s.distKm.toFixed(1)}km`}
                    </span>
                  )}
                </div>
                {/* 주소 — 작은 글씨 */}
                {s.address && (
                  <div style={{
                    fontSize: '12px',
                    color: '#5a7a94',
                    marginTop: '3px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {s.address}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default LocationSearchInput;
