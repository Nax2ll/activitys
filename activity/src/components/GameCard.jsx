import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const MOBILE_BREAKPOINT = 820;

export default function GameCard({ title, subtitle, path, image, accent = '#314a5e' }) {
  const navigate = useNavigate();
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

  return (
    <button
      onClick={() => navigate(path)}
      style={{
        overflow: 'hidden',
        borderRadius: isMobile ? 20 : 24,
        background: '#1a2c38',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 14px 40px rgba(0,0,0,0.22)',
        color: 'white',
        textAlign: 'left',
        cursor: 'pointer',
        padding: 0,
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        width: '100%'
      }}
      onMouseEnter={(e) => {
        if (isMobile) return;
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 20px 50px rgba(0,0,0,0.28)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0px)';
        e.currentTarget.style.boxShadow = '0 14px 40px rgba(0,0,0,0.22)';
      }}
    >
      <div
        style={{
          height: isMobile ? 120 : 190,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${accent}, #132634)`,
          fontSize: isMobile ? 24 : 34,
          fontWeight: 900,
          color: 'rgba(255,255,255,0.95)',
          letterSpacing: isMobile ? 0.4 : 1,
          padding: isMobile ? '0 12px' : '0 16px',
          textAlign: 'center',
          lineHeight: 1.15
        }}
      >
        {image || title}
      </div>

      <div style={{ padding: isMobile ? 14 : 18 }}>
        <div
          style={{
            fontSize: isMobile ? 20 : 24,
            fontWeight: 900,
            lineHeight: 1.15,
            wordBreak: 'break-word'
          }}
        >
          {title}
        </div>

        <div
          style={{
            fontSize: isMobile ? 14 : 15,
            color: '#b1bad3',
            marginTop: 8,
            lineHeight: 1.5
          }}
        >
          {subtitle}
        </div>
      </div>
    </button>
  );
}
