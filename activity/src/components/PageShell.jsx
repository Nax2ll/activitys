import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import BalanceBar from './BalanceBar';

const sidebarItems = [
  { label: 'Main menu', path: '/' },
  { label: 'Plinko', path: '/plinko' },
  { label: 'Dice', path: '/dice' },
  { label: 'Mines', path: '/mines' },
  { label: 'Dragon Tower', path: '/dragon-tower' },
  { label: 'Keno', path: '/keno' },
  { label: 'Chicken Cross', path: '/chicken-cross' }
];

const MOBILE_BREAKPOINT = 820;

export default function PageShell({ title, children }) {
  const location = useLocation();
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
    <div
      style={{
        minHeight: '100vh',
        background: '#0f212e',
        color: 'white',
        display: isMobile ? 'block' : 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '250px minmax(0, 1fr)',
        overflowX: 'hidden'
      }}
    >
      {!isMobile ? (
        <aside
          style={{
            background: '#112331',
            borderRight: '1px solid rgba(255,255,255,0.05)',
            padding: 20,
            minHeight: '100vh',
            position: 'sticky',
            top: 0,
            alignSelf: 'start'
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 900,
              marginBottom: 24,
              letterSpacing: 1
            }}
          >
            NAELBET
          </div>

          <div style={{ color: '#b1bad3', fontSize: 13, marginBottom: 12 }}>
            Games
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {sidebarItems.map((item) => {
              const active = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  style={{
                    background: active ? '#2f4553' : '#1a2c38',
                    color: 'white',
                    padding: '14px 16px',
                    borderRadius: 14,
                    fontWeight: active ? 800 : 600,
                    border: '1px solid rgba(255,255,255,0.04)',
                    textDecoration: 'none',
                    transition: 'transform 0.12s ease, background 0.12s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateX(2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </aside>
      ) : null}

      <main
        style={{
          minWidth: 0,
          padding: isMobile ? '14px' : '20px'
        }}
      >
        <div
          style={{
            maxWidth: isMobile ? 980 : 1400,
            margin: '0 auto',
            minWidth: 0
          }}
        >
          {isMobile ? (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  background: '#112331',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 18,
                  padding: '14px 14px 12px',
                  marginBottom: 12
                }}
              >
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 900,
                    letterSpacing: 1,
                    marginBottom: 12
                  }}
                >
                  NAELBET
                </div>

                <div style={{ marginBottom: 12 }}>
                  <BalanceBar />
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    overflowX: 'auto',
                    paddingBottom: 4,
                    scrollbarWidth: 'none',
                    WebkitOverflowScrolling: 'touch'
                  }}
                >
                  {sidebarItems.map((item) => {
                    const active = location.pathname === item.path;

                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        style={{
                          flex: '0 0 auto',
                          background: active ? '#2f4553' : '#1a2c38',
                          color: 'white',
                          padding: '10px 14px',
                          borderRadius: 12,
                          fontWeight: active ? 800 : 600,
                          border: '1px solid rgba(255,255,255,0.04)',
                          textDecoration: 'none',
                          whiteSpace: 'nowrap',
                          fontSize: 14
                        }}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'stretch' : 'center',
              marginBottom: isMobile ? 16 : 20,
              gap: isMobile ? 14 : 20
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: isMobile ? 'clamp(26px, 7vw, 34px)' : 34,
                  fontWeight: 900,
                  lineHeight: 1.1,
                  wordBreak: 'break-word'
                }}
              >
                {title}
              </div>

              <div
                style={{
                  color: '#b1bad3',
                  marginTop: 6,
                  fontSize: isMobile ? 13 : 14,
                  lineHeight: 1.5
                }}
              >
                Milkyway Gambling Bot
              </div>
            </div>

            {!isMobile ? (
              <div
                style={{
                  width: '100%',
                  maxWidth: 360,
                  minWidth: 0,
                  flexShrink: 0
                }}
              >
                <BalanceBar />
              </div>
            ) : null}
          </div>

          <div style={{ minWidth: 0 }}>{children}</div>
        </div>
      </main>
    </div>
  );
}
