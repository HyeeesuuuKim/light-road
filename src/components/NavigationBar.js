import { FiArrowUp, FiX } from 'react-icons/fi';
import { GoAlert } from 'react-icons/go';

function NavigationBar({
  mode, arrowRotation, instruction, distToStep,
  isOffRoute, onStop,
}) {
  const subText = (() => {
    if (distToStep === null || distToStep === undefined) return null;
    if (distToStep <= 15) return null;
    if (mode === 'toStart') return `출발지까지 ${distToStep}m`;
    return `${distToStep}m 후 다음 안내`;
  })();

  function onEnter(e) {
    e.currentTarget.style.setProperty('background', 'rgba(255,255,255,0.38)', 'important');
  }
  function onLeave(e) {
    e.currentTarget.style.setProperty('background', 'rgba(255,255,255,0.2)', 'important');
    e.currentTarget.style.setProperty('transform', 'scale(1)', 'important');
  }
  function onDown(e) {
    e.currentTarget.style.setProperty('transform', 'scale(0.88)', 'important');
  }
  function onUp(e) {
    e.currentTarget.style.setProperty('transform', 'scale(1)', 'important');
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      zIndex: 1000,
      boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
    }}>
      {/* 경로 이탈 경고 배너 */}
      {mode === 'onRoute' && isOffRoute && (
        <div style={{
          background: '#dc2626',
          padding: '8px 20px',
          textAlign: 'center',
          color: 'white',
          fontSize: '14px',
          fontWeight: 'bold',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: '6px',
        }}>
          <GoAlert size={16} />
          경로를 이탈했습니다 — 방향을 다시 확인해 주세요
        </div>
      )}

      {/* 안내 행 */}
      <div style={{
        background: '#1d4ed8',
        padding: '16px 20px 12px',
        display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          transform: `rotate(${arrowRotation}deg)`,
          transformOrigin: 'center center',
          transition: 'transform 0.3s ease',
          willChange: 'transform',
        }}>
          <FiArrowUp size={36} strokeWidth={2.5} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>
            {instruction || '경로를 따라 이동하세요'}
          </div>
          {subText && (
            <div style={{ color: '#93c5fd', fontSize: '14px', marginTop: '2px' }}>
              {subText}
            </div>
          )}
        </div>

        <button
          onClick={onStop}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          onMouseDown={onDown}
          onMouseUp={onUp}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            color: 'white',
            cursor: 'pointer',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s, transform 0.1s',
          }}
        >
          <FiX size={20} />
        </button>
      </div>
    </div>
  );
}

export default NavigationBar;