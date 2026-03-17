import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 820;

export default function QuickBetButtons({ bet, setBet }) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= MOBILE_BREAKPOINT;
  });

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    }

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function applyValue(value) {
    setBet(String(value));
  }

  function increaseBy(value) {
    const current = Number(bet) || 0;
    setBet(String(current + value));
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: 10,
        marginTop: 12
      }}
    >
      <button onClick={() => applyValue(10)} style={{ ...btnStyle, fontSize: isMobile ? 13 : 14 }}>
        10
      </button>

      <button onClick={() => applyValue(50)} style={{ ...btnStyle, fontSize: isMobile ? 13 : 14 }}>
        50
      </button>

      <button onClick={() => increaseBy(100)} style={{ ...btnStyle, fontSize: isMobile ? 13 : 14 }}>
        +100
      </button>

      <button onClick={() => increaseBy(500)} style={{ ...btnStyle, fontSize: isMobile ? 13 : 14 }}>
        +500
      </button>
    </div>
  );
}

const btnStyle = {
  background: '#233847',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: '10px 12px',
  cursor: 'pointer',
  fontWeight: 700,
  transition: 'all 0.15s ease'
};
