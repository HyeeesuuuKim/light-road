/**
 * RouteCard — 안심 경로와 최단 경로를 나란히 표시하는 비교 카드.
 * 카드를 클릭하면 해당 경로가 선택됨.
 */
function RouteCard({ selectedRoute, safeRoute, shortRoute, onSelect, disabled }) {
  if (!safeRoute || !shortRoute) return null;

  const routes = [
    {
      type:  'safe',
      data:  safeRoute,
      label: '안심 경로',
      icon:  '🛡',
      color: '#56CCF2',
      badge: '추천',
    },
    {
      type:  'short',
      data:  shortRoute,
      label: '최단 경로',
      icon:  '⚡',
      color: '#FAC775',
      badge: null,
    },
  ];

  return (
    <div className="route-card-row">
      {routes.map(({ type, data, label, icon, color, badge }) => {
        const isActive = selectedRoute === type;
        return (
          <div
            key={type}
            className={`route-card ${isActive ? 'route-card--active' : ''}`}
            style={{
              '--card-color': color,
              opacity: disabled ? 0.6 : 1,
              cursor: disabled ? 'not-allowed' : 'pointer',
              pointerEvents: disabled ? 'none' : 'auto',
            }}
            onClick={() => onSelect && onSelect(type)}
          >
            {/* 헤더 */}
            <div className="route-card-header">
              <span className="route-card-title">
                {icon} {label}
              </span>
              {badge && (
                <span className="route-card-badge" style={{ color, borderColor: color }}>
                  {badge}
                </span>
              )}
            </div>

            {/* 핵심 지표 */}
            <div className="route-card-stats">
              <div className="stat">
                <span className="stat-label">소요</span>
                <span className="stat-value">{Math.round(data.duration)}분</span>
              </div>
              <div className="stat-divider" />
              <div className="stat">
                <span className="stat-label">거리</span>
                <span className="stat-value">{data.distance}km</span>
              </div>
              <div className="stat-divider" />
              <div className="stat">
                <span className="stat-label">안전점수</span>
                <span className="stat-value" style={{ color }}>
                  {data.score}
                </span>
              </div>
            </div>

            {/* 시설물 현황 */}
            <div className="route-card-footer">
              <span>💡 가로등 {data.lights}개</span>
              <span>📷 CCTV {data.cctv}개</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default RouteCard;