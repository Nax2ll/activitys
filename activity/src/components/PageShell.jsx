import { Link, useLocation } from 'react-router-dom';
import BalanceBar from './BalanceBar';

const sidebarItems = [
  { label: 'Casino', path: '/' },
  { label: 'Plinko', path: '/plinko' },
  { label: 'Dice', path: '/dice' },
  { label: 'Mines', path: '/mines' },
  { label: 'Dragon Tower', path: '/dragon-tower' },
  { label: 'Keno', path: '/keno' },
  // أضف السطر هذا
  { label: 'Chicken Cross', path: '/chicken-cross' } ,
  { label: 'Slots Machine', path: '/slots-machine' },
  { label: 'Guessing Game', path: '/guess' },
    { label: 'Memory Game', path: '/memory' },
  { label: 'Camel Racing', path: '/camel-racing' },

];

export default function PageShell({ title, children }) {
  const location = useLocation();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f212e',
        color: 'white',
        display: 'grid',
        gridTemplateColumns: '260px 1fr'
      }}
    >
      <aside
        style={{
          background: '#112331',
          borderRight: '1px solid rgba(255,255,255,0.05)',
          padding: 20
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
          Milkyway
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
                  border: '1px solid rgba(255,255,255,0.04)'
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </aside>

      <main style={{ padding: 20 }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
              gap: 20
            }}
          >
            <div>
              <div style={{ fontSize: 34, fontWeight: 900 }}>{title}</div>
              <div style={{ color: '#b1bad3', marginTop: 6, fontSize: 14 }}>
                Stake-style casino activity inside Discord
              </div>
            </div>

            <div style={{ minWidth: 340 }}>
              <BalanceBar />
            </div>
          </div>

          {location.pathname !== '/' ? (
            <div style={{ marginBottom: 20 }}>
              <Link
                to="/"
                style={{
                  background: '#1a2c38',
                  padding: '10px 16px',
                  borderRadius: 12,
                  display: 'inline-block'
                }}
              >
                ← Back to Casino
              </Link>
            </div>
          ) : null}

          {children}
        </div>
      </main>
    </div>
  );
}
