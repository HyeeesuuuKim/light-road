import { FiCheckCircle } from 'react-icons/fi';

function ArrivalCard({ countdown, onStop }) {

  function onEnter(e) {
    e.currentTarget.style.setProperty('background', '#32b8e0', 'important');
  }
  function onLeave(e) {
    e.currentTarget.style.setProperty('background', '#56CCF2', 'important');
    e.currentTarget.style.setProperty('transform', 'scale(1)', 'important');
  }
  function onDown(e) {
    e.currentTarget.style.setProperty('background', '#28a8ce', 'important');
    e.currentTarget.style.setProperty('transform', 'scale(0.97)', 'important');
  }
  function onUp(e) {
    e.currentTarget.style.setProperty('background', '#32b8e0', 'important');
    e.currentTarget.style.setProperty('transform', 'scale(1)', 'important');
  }

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#1a2635',
      borderRadius: '20px 20px 0 0',
      padding: '20px 24px 32px',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
      zIndex: 1000, textAlign: 'center',
      border: '1px solid #56CCF2',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: '8px',
        fontSize: '20px', fontWeight: 'bold',
        color: '#56CCF2', marginBottom: '16px',
      }}>
        <FiCheckCircle size={22} />
        목적지에 도착했습니다
      </div>
      <button
        onClick={onStop}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onMouseDown={onDown}
        onMouseUp={onUp}
        style={{
          width: '100%', padding: '16px',
          background: '#56CCF2',
          color: '#0f1923', border: 'none',
          borderRadius: '14px',
          fontSize: '16px', fontWeight: 'bold',
          cursor: 'pointer',
          transition: 'background 0.15s, transform 0.1s',
        }}>
        안내 종료 ({countdown})
      </button>
    </div>
  );
}

export default ArrivalCard;