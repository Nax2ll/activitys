import { useEffect, useState } from 'react';
import PageShell from '../components/PageShell';
import GameCard from '../components/GameCard';
import { getTopProfitGames } from '../lib/api';

const MOBILE_BREAKPOINT = 820;

const games = [
  {
    title: 'Plinko',
    subtitle: 'Drop balls through pins and land on multipliers.',
    path: '/plinko',
    image: '🔴 PLINKO',
    accent: '#7a1f2c'
  },
  {
    title: 'Dice',
    subtitle: 'Fast over/under rolls with instant results.',
    path: '/dice',
    image: '🎲 DICE',
    accent: '#2b5172'
  },
  {
    title: 'Mines',
    subtitle: 'Pick tiles, avoid mines, and cash out in time.',
    path: '/mines',
    image: '💣 MINES',
    accent: '#4f3a19'
  },
  {
    title: 'Dragon Tower',
    subtitle: 'Climb floors and avoid the hidden danger.',
    path: '/dragon-tower',
    image: '🐉 DRAGON',
    accent: '#244d37'
  },
  {
    title: 'Keno',
    subtitle: 'Choose numbers and match the draw.',
    path: '/keno',
    image: '🔵 KENO',
    accent: '#334572'
  },
  {
    title: 'Chicken Cross',
    subtitle: 'Cross the road, survive the lanes, and cash out.',
    path: '/chicken-cross',
    image: '🐔 CROSS',
    accent: '#5b3f24'
  }
];

// دالة بسيطة عشان ترتب أسماء الألعاب بشكل حلو
function formatGameName(key) {
  const names = {
    dice: 'Dice',
    mines: 'Mines',
    chickenCross: 'Chicken Cross',
    dragonTower: 'Dragon Tower',
    plinko: 'Plinko',
    keno: 'Keno'
  };
  return names[key] || key;
}

export default function HomePage() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= MOBILE_BREAKPOINT;
  });

  // ستيت جديدة عشان نحفظ فيها أعلى 3 ألعاب
  const [topGames, setTopGames] = useState([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    }

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // UseEffect جديد عشان يجيب بيانات اليوزر من الباك اند
  useEffect(() => {
    async function fetchUserStats() {
      try {
        // تنبيه: غير الرابط هذا للـ API اللي يرجع بيانات اليوزر من المونقو داتا بيز حقك
        const res = await fetch('/api/user/profile'); 
        const data = await res.json();

        if (data && data.stats) {
          // نحول أوبجكت الstats إلى مصفوفة (Array) عشان نقدر نرتبها
          const gamesArray = Object.entries(data.stats).map(([key, value]) => ({
            id: key,
            name: formatGameName(key),
            profit: value.profit || 0
          }));

          // نرتب الألعاب من الأعلى ربحاً إلى الأقل، وناخذ أول 3 بس
          const sortedTop3 = gamesArray
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 3);

          setTopGames(sortedTop3);
        }
      } catch (error) {
        console.error('Error fetching user stats:', error);
      } finally {
        setIsLoadingStats(false);
      }
    }

    fetchUserStats();
  }, []);

  return (
    <PageShell title="Casino">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr',
          gap: isMobile ? 16 : 24,
          marginBottom: isMobile ? 16 : 24
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #1a2c38, #233f52)',
            borderRadius: isMobile ? 22 : 28,
            padding: isMobile ? 18 : 28,
            minHeight: isMobile ? 180 : 210,
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              color: '#00e701',
              fontWeight: 800,
              fontSize: isMobile ? 12 : 14,
              marginBottom: 10,
              letterSpacing: 0.3
            }}
          >
            FEATURED
          </div>

          <div
            style={{
              fontSize: isMobile ? 'clamp(28px, 7vw, 36px)' : 42,
              fontWeight: 900,
              lineHeight: 1.08,
              wordBreak: 'break-word'
            }}
          >
            Play Casino Games
            <br />
            Inside Discord
          </div>

          <div
            style={{
              color: '#b1bad3',
              fontSize: isMobile ? 14 : 16,
              marginTop: 14,
              maxWidth: 650,
              lineHeight: 1.6
            }}
          >
            A Stake-style activity with clean UI, smooth navigation, wallet support,
            and room to expand into multiplayer later.
          </div>
        </div>

        {/* المربع اللي تم تعديله */}
        <div
          style={{
            background: '#1a2c38',
            borderRadius: isMobile ? 22 : 28,
            padding: isMobile ? 18 : 24,
            border: '1px solid rgba(255,255,255,0.06)'
          }}
        >
          <div
            style={{
              fontSize: isMobile ? 18 : 20,
              fontWeight: 900,
              marginBottom: 16
            }}
          >
            Your Top Profitable Games
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {isLoadingStats ? (
              <div style={{ color: '#b1bad3', fontSize: 14 }}>Loading stats...</div>
            ) : topGames.length > 0 ? (
              topGames.map((game, i) => (
                <div
                  key={game.id}
                  style={{
                    background: '#233847',
                    borderRadius: 16,
                    padding: isMobile ? '12px 14px' : '14px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: isMobile ? 14 : 15
                      }}
                    >
                      {game.name}
                    </div>
                    <div
                      style={{
                        color: '#b1bad3',
                        fontSize: isMobile ? 12 : 13,
                        marginTop: 4,
                        lineHeight: 1.45
                      }}
                    >
                      Rank #{i + 1}
                    </div>
                  </div>
                  <div
                    style={{
                      color: game.profit >= 0 ? '#00e701' : '#ff4d4d',
                      fontWeight: 900,
                      fontSize: isMobile ? 13 : 14,
                      flexShrink: 0
                    }}
                  >
                    {game.profit >= 0 ? '+' : ''}{game.profit}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: '#b1bad3', fontSize: 14 }}>No games played yet.</div>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile
            ? '1fr'
            : 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: isMobile ? 16 : 24
        }}
      >
        {games.map((game) => (
          <GameCard key={game.title} {...game} />
        ))}
      </div>
    </PageShell>
  );
}
