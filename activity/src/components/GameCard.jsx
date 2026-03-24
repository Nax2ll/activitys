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
    function handleResize() { setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT); }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <button
      onClick={() => navigate(path)}
      style={{
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', borderRadius: isMobile ? 16 : 24,
        background: '#1a2c38', border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
        color: 'white', textAlign: 'left', cursor: 'pointer', padding: 0,
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        width: '100%', height: '100%'
      }}
      onMouseEnter={(e) => {
        if (isMobile) return;
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 16px 40px rgba(0,0,0,0.25)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0px)';
        e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.15)';
      }}
      onMouseDown={(e) => isMobile && (e.currentTarget.style.transform = 'scale(0.97)')}
      onMouseUp={(e) => isMobile && (e.currentTarget.style.transform = 'scale(1)')}
    >
      <div style={{
        height: isMobile ? 100 : 160, width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(135deg, ${accent}, #132634)`,
        fontSize: isMobile ? 20 : 34, fontWeight: 900,
        color: 'rgba(255,255,255,0.95)', letterSpacing: 0.5,
        textAlign: 'center', padding: '0 10px'
      }}>
        {image || title}
      </div>

      <div style={{ padding: isMobile ? 12 : 18, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ fontSize: isMobile ? 15 : 20, fontWeight: 900, marginBottom: isMobile ? 4 : 8 }}>
          {title}
        </div>
        <div style={{ fontSize: isMobile ? 11 : 13, color: '#b1bad3', lineHeight: 1.4, opacity: 0.8 }}>
          {subtitle}
        </div>
      </div>
    </button>
  );
}
