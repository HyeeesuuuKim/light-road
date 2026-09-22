function RouteButtons({ selectedRoute, setSelectedRoute }) {
  return (
    <div style={{ display: 'flex', gap: '10px', width: '100%', maxWidth: '400px' }}>
      <button
        onClick={() => setSelectedRoute('safe')}
        style={{
          flex: 1, padding: '10px', borderRadius: '8px',
          border: `2px solid ${selectedRoute === 'safe' ? '#56CCF2' : '#333'}`,
          backgroundColor: selectedRoute === 'safe' ? '#1a2635' : 'transparent',
          color: selectedRoute === 'safe' ? '#56CCF2' : '#888',
          cursor: 'pointer', fontWeight: 'bold'
        }}
      >
        🟢 안심 경로
      </button>
      <button
        onClick={() => setSelectedRoute('short')}
        style={{
          flex: 1, padding: '10px', borderRadius: '8px',
          border: `2px solid ${selectedRoute === 'short' ? '#FAC775' : '#333'}`,
          backgroundColor: selectedRoute === 'short' ? '#1a2635' : 'transparent',
          color: selectedRoute === 'short' ? '#FAC775' : '#888',
          cursor: 'pointer', fontWeight: 'bold'
        }}
      >
        ⚡ 최단 경로
      </button>
    </div>
  );
}

export default RouteButtons;