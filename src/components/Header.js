import { useState, useEffect } from 'react';
import { FaShieldAlt } from 'react-icons/fa';
import { MdVideocam } from 'react-icons/md';
import { IoIosNotifications } from 'react-icons/io';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL
  || ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'https://127.0.0.1:8000'
      : 'http://127.0.0.1:8000');

/**
 * Header — 앱 타이틀 + 최근접 안전시설 배지
 *
 * 배지 기준 좌표:
 *   - originCoord(출발지 좌표)가 있으면 그 좌표 기준으로 /nearest 조회
 *   - 없으면(초기 화면) 현재 GPS 위치로 폴백
 *   → 출발지를 선택/검색하면 "출발지 주변 안전시설"로 갱신됨
 */
function Header({ cctvCount, lightsCount, originCoord }) {
  const [nearest, setNearest] = useState(null);
  const [locError, setLocError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadNearest(lat, lng) {
      try {
        const res  = await fetch(`${BACKEND_URL}/nearest?lat=${lat}&lng=${lng}`);
        const data = await res.json();
        if (!cancelled) { setNearest(data); setLocError(false); }
      } catch (e) {
        console.error('최근접 시설 조회 실패:', e);
        if (!cancelled) setLocError(true);
      }
    }

    if (originCoord && originCoord.lat != null && originCoord.lng != null) {
      // 출발지 좌표 기준
      loadNearest(originCoord.lat, originCoord.lng);
    } else if (navigator.geolocation) {
      // 폴백: 현재 위치 기준
      navigator.geolocation.getCurrentPosition(
        (pos) => loadNearest(pos.coords.latitude, pos.coords.longitude),
        () => { if (!cancelled) setLocError(true); },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setLocError(true);
    }

    return () => { cancelled = true; };
  }, [originCoord]);

  // 거리를 보기 좋은 문자열로 변환 (1km 이상은 km, 미만은 m)
  const fmt = (d) => {
    if (d == null) return '—';
    return d >= 1000 ? `${(d / 1000).toFixed(2)} km` : `${d} m`;
  };

  const badges = [
    { key: 'police', icon: <FaShieldAlt size={16} />,        label: '가까운 경찰서', color: '#4A90E2' },
    { key: 'cctv',   icon: <MdVideocam size={18} />,         label: '가까운 CCTV',  color: '#56CCF2' },
    { key: 'bell',   icon: <IoIosNotifications size={18} />, label: '가까운 비상벨', color: '#E24B4A' },
  ];

  const basisLabel = originCoord ? '출발지 주변 안전시설' : '내 주변 안전시설';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '100%', maxWidth: '480px' }}>
      {/* 타이틀 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', marginTop: '4px' }}>
        <span style={{ fontSize: '2.2rem', lineHeight: 1 }}>🌃</span>
        <h1 style={{
          color: '#56CCF2',
          fontSize: '1.9rem',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          margin: '2px 0 0',
          textShadow: '0 0 24px rgba(86, 204, 242, 0.45)',
        }}>
          Light-Road
        </h1>
        <p style={{ color: '#8aabb8', fontSize: '0.88rem', margin: 0 }}>야간 보행 안심 귀가 경로 추천</p>
      </div>

      {/* 최근접 안전시설 배지 */}
      <div style={{
        width: '100%',
        background: '#152030',
        border: '1px solid #2a3f55',
        borderRadius: '14px',
        padding: '6px 4px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}>
        {/* 기준 라벨 */}
        <div style={{
          padding: '6px 16px 4px',
          fontSize: '0.72rem',
          color: '#5a7a94',
          letterSpacing: '0.02em',
        }}>
          {basisLabel}
        </div>
        {badges.map((b, i) => (
          <div key={b.key}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: b.color, display: 'flex' }}>{b.icon}</span>
                <span style={{ color: '#e0eaf5', fontSize: '0.95rem', fontWeight: 500 }}>{b.label}</span>
              </div>
              <span style={{ color: locError ? '#E24B4A' : b.color, fontSize: '1rem', fontWeight: 'bold' }}>
                {locError ? '위치 확인 불가' : fmt(nearest?.[b.key]?.dist)}
              </span>
            </div>
            {i < badges.length - 1 && (
              <div style={{ height: '1px', background: '#22344a', margin: '0 12px' }} />
            )}
          </div>
        ))}
      </div>

      {/* 경로 시설물 로드 현황 */}
      {(cctvCount > 0 || lightsCount > 0) && (
        <p style={{ color: '#1D9E75', fontSize: '0.8rem', margin: 0 }}>
          📷 경로 주변 CCTV {cctvCount}개 · 💡 가로등 {lightsCount}개
        </p>
      )}
    </div>
  );
}

export default Header;
