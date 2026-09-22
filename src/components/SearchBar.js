import { useState, useEffect } from 'react';
import { HiSwitchVertical } from 'react-icons/hi';
import LocationSearchInput from './LocationSearchInput';

function SearchBar({ origin, dest, setOrigin, setDest, onSearch, onSelectOrigin, onSelectDest, onSwap, loading }) {
  const [userLocation, setUserLocation] = useState(null);
  const [swapPressed, setSwapPressed] = useState(false);
  const [searchPressed, setSearchPressed] = useState(false);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      );
    }
  }, []);

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '100%',
    maxWidth: '480px',
  };

  const inputsWrapStyle = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  };

  const swapBtnStyle = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: `translate(-50%, -50%) scale(${swapPressed ? 0.88 : 1})`,
    width: '32px',
    height: '32px',
    background: '#1e2d3d',
    border: '1px solid #2a3f55',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: '#56CCF2',
    zIndex: 10,
    transition: 'transform 0.1s, background 0.15s, border-color 0.15s',
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
  };

  const searchBtnBaseStyle = {
    width: '100%',
    padding: '16px',
    color: '#06121e',
    border: 'none',
    borderRadius: '13px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    transform: searchPressed ? 'scale(0.97)' : 'scale(1)',
    transition: 'background 0.25s, transform 0.1s, filter 0.15s, box-shadow 0.2s',
    background: 'linear-gradient(135deg, #56CCF2, #2F80ED)',
    boxShadow: '0 4px 18px rgba(86, 204, 242, 0.3)',
    opacity: loading ? 0.6 : 1,
    cursor: loading ? 'not-allowed' : 'pointer',
  };

  return (
    <div style={containerStyle}>
      <div style={inputsWrapStyle}>
        <LocationSearchInput
          value={origin}
          onChange={setOrigin}
          onSelect={({ label, lat, lng }) => {
            setOrigin(label);
            onSelectOrigin && onSelectOrigin({ lat, lng });
          }}
          placeholder="출발지를 입력하세요"
          showLocateBtn={true}
          userLocation={userLocation}
          onLocate={({ lat, lng, address }) => {
            setUserLocation({ lat, lng });
            setOrigin(address);
            onSelectOrigin && onSelectOrigin({ lat, lng });
          }}
        />

        <button
          style={swapBtnStyle}
          title="출발지 ↔ 목적지 교환"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#1a3a52';
            e.currentTarget.style.borderColor = '#3a5f7f';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#1e2d3d';
            e.currentTarget.style.borderColor = '#2a3f55';
            setSwapPressed(false);
          }}
          onMouseDown={() => setSwapPressed(true)}
          onMouseUp={() => { setSwapPressed(false); onSwap && onSwap(); }}
        >
          <HiSwitchVertical size={16} />
        </button>

        <LocationSearchInput
          value={dest}
          onChange={setDest}
          onSelect={({ label, lat, lng }) => {
            setDest(label);
            onSelectDest && onSelectDest({ lat, lng });
          }}
          placeholder="목적지를 입력하세요"
          showLocateBtn={false}
          userLocation={userLocation}
        />
      </div>

      <button
        style={searchBtnBaseStyle}
        onClick={onSearch}
        disabled={loading}
        onMouseEnter={(e) => {
          if (loading) return;
          e.currentTarget.style.background = 'linear-gradient(315deg, #56CCF2, #2F80ED)';
          e.currentTarget.style.filter = 'brightness(1.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'linear-gradient(135deg, #56CCF2, #2F80ED)';
          e.currentTarget.style.filter = 'brightness(1)';
          setSearchPressed(false);
        }}
        onMouseDown={() => setSearchPressed(true)}
        onMouseUp={() => setSearchPressed(false)}
      >
        {loading ? '탐색 중...' : '경로 탐색'}
      </button>
    </div>
  );
}

export default SearchBar;