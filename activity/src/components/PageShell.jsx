import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import BalanceBar from './BalanceBar';

const MOBILE_BREAKPOINT = 820;

const NAV_LINKS = [
  { path: '/', label: '🏠 Home' },
  { path: '/plinko', label: '🔴 Plinko' },
  { path: '/dice', label: '🎲 Dice' },
  { path: '/mines', label: '💣 Mines' },
  { path: '/dragon-tower', label: '🐉 Dragon Tower' },
  { path: '/keno', label: '🔵 Keno' },
  { path: '/chicken-cross', label: '🐔 Chicken Cross' },
  { path: '/slots-machine', label: '🎰 Slots' },
  { path: '/guess', label: '🔢 Guess' },
  { path: '/memory', label: '🧠 Memory' },
  { path: '/camel-racing', label: '🐪 Camel Racing' }
];

export default function PageShell({ title, children }) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= MOBILE_BREAKPOINT;
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
      if (window.innerWidth > MOBILE_BREAKPOINT) setMenuOpen(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f212e', color: 'white', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Sidebar / Mobile Drawer */}
      <div style={{ 
        position: isMobile ? 'fixed' : 'sticky', 
        top: 0, left: 0, bottom: 0, 
        width: 260, 
        background: '#1a2c38', 
        borderRight: '1px solid rgba(255,255,255,0.05)', 
        zIndex: 50,
        transform: isMobile ? (menuOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none',
        transition: 'transform 0.3s ease',
        display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '24px 20px', fontSize: 24, fontWeight: 900, color: '#00e701', letterSpacing: 1, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>NaelBet</span>
          {isMobile && (
            <button onClick={() => setMenuOpen(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer' }}>✖</button>
          )}
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ color: '#b1bad3', fontSize: 13, fontWeight: 800, padding: '0 8px 10px', textTransform: 'uppercase', letterSpacing: 1 }}>Casino Games</div>
          {NAV_LINKS.map(link => {
            const active = location.pathname === link.path;
            return (
              <Link key={link.path} to={link.path} style={{
                display: 'block', padding: '12px 16px', borderRadius: 12, textDecoration: 'none',
                color: active ? 'white' : '#b1bad3',
                background: active ? '#2f4553' : 'transparent',
                fontWeight: active ? 800 : 600,
                transition: 'all 0.15s ease'
              }}>
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>

      {isMobile && menuOpen && (
        <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40, backdropFilter: 'blur(2px)' }} />
      )}

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        
        {/* Top Unified Header (Desktop & Mobile) */}
        <div style={{ 
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
          padding: isMobile ? '12px 16px' : '20px 32px', 
          background: isMobile ? '#1a2c38' : 'transparent',
          borderBottom: isMobile ? '1px solid rgba(255,255,255,0.05)' : 'none',
          position: 'sticky', top: 0, zIndex: 30,
          gap: isMobile ? 8 : 16
        }}>
          
          {/* 1. اللعبة (يسار) */}
          <h1 style={{ 
            margin: 0, fontSize: isMobile ? 18 : 28, fontWeight: 900, 
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 
          }}>
            {title}
          </h1>
          
          {/* 2. الرصيد (بالنص في الجوال، ويمين في الديسكتوب) */}
          <div style={{ 
            flex: isMobile ? 1 : 'none', 
            display: 'flex', justifyContent: isMobile ? 'center' : 'flex-end',
            width: isMobile ? 'auto' : 250,
            minWidth: 0
          }}>
            <div style={{ width: '100%', maxWidth: isMobile ? 160 : '100%' }}>
              <BalanceBar />
            </div>
          </div>

          {/* 3. زر القائمة (يمين - يظهر فقط بالجوال) */}
          {isMobile && (
            <button 
              onClick={() => setMenuOpen(true)} 
              style={{ 
                background: '#233847', border: '1px solid rgba(255,255,255,0.1)', 
                color: 'white', fontSize: 16, cursor: 'pointer', 
                padding: '8px 12px', borderRadius: 12, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              ☰
            </button>
          )}
        </div>

        {/* Page Content */}
        <div style={{ padding: isMobile ? '16px' : '0 32px 32px', flex: 1, maxWidth: 1400, margin: '0 auto', width: '100%' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
