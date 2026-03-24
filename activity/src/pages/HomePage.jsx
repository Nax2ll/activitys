import { useEffect, useState } from 'react';
import PageShell from '../components/PageShell';
import GameCard from '../components/GameCard';
import { getTopProfitGames } from '../lib/api';

const MOBILE_BREAKPOINT = 820;

const games = [
  { title: 'Plinko', subtitle: 'Drop balls through pins and land on multipliers.', path: '/plinko', image: '🔴 PLINKO', accent: '#7a1f2c' },
  { title: 'Dice', subtitle: 'Fast over/under rolls with instant results.', path: '/dice', image: '🎲 DICE', accent: '#2b5172' },
  { title: 'Mines', subtitle: 'Pick tiles, cash out before hitting a mine.', path: '/mines', image: '💣 MINES', accent: '#4f3a19' },
  { title: 'Dragon Tower', subtitle: 'Climb floors and avoid the hidden danger.', path: '/dragon-tower', image: '🐉 DRAGON', accent: '#244d37' },
  { title: 'Keno', subtitle: 'Choose numbers and match the draw.', path: '/keno', image: '🔵 KENO', accent: '#334572' },
  { title: 'Chicken Cross', subtitle: 'Cross the road, survive the lanes.', path: '/chicken-cross', image: '🐔 CHICKEN', accent: '#a67b27' },
  { title: 'Slots Machine', subtitle: 'Spin the reels and hit the jackpot.', path: '/slots-machine', image: '🎰 SLOTS', accent: '#5c1a5e' },
  { title: 'Guess Number', subtitle: 'Guess the secret number to win big.', path: '/guess', image: '🔢 GUESS', accent: '#1a5e5c' },
  { title: 'Memory Gamble', subtitle: 'Match pairs without making mistakes.', path: '/memory', image: '🧠 MEMORY', accent: '#5e481a' },
  { title: 'Camel Racing', subtitle: 'Pick your winning camel and race.', path: '/camel-racing', image: '🐪 CAMELS', accent: '#5e2a1a' }
];

export default function HomePage() {
  const [stats, setStats] = useState([]);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= MOBILE_BREAKPOINT;
  });

  useEffect(() => {
    let mounted = true;
    function handleResize() { setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT); }
    
    async function fetchStats() {
      try {
        const data = await getTopProfitGames();
        if (mounted && data?.ok) setStats(data.games || []);
      } catch (e) {}
    }

    handleResize();
    fetchStats();
    window.addEventListener('resize', handleResize);
    return () => {
      mounted = false;
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <PageShell title="Casino Lobby">
      
      {/* قسم الإحصائيات (قابل للسحب أفقياً في الجوال) */}
      <div style={{ marginBottom: isMobile ? 24 : 36 }}>
        <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, marginBottom: 16 }}>Top Games by Profit</div>
        <div style={{ 
          display: 'flex', 
          gap: 16, 
          overflowX: 'auto', 
          paddingBottom: 8,
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch'
        }}>
          {stats.length > 0 ? (
            stats.map((game, i) => (
              <div key={i} style={{ 
                background: '#1a2c38', borderRadius: 20, padding: isMobile ? 16 : 20, 
                border: '1px solid rgba(255,255,255,0.06)', 
                minWidth: isMobile ? 260 : 300,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                scrollSnapAlign: 'start', flexShrink: 0
              }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: isMobile ? 15 : 17 }}>{game.gameType.toUpperCase()}</div>
                  <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 4 }}>Played: {game.played} | Wins: {game.wins}</div>
                </div>
                <div style={{ color: game.profit >= 0 ? '#00e701' : '#ff4d4d', fontWeight: 900, fontSize: isMobile ? 14 : 16 }}>
                  {game.profit >= 0 ? '+' : ''}${Number(game.profit).toLocaleString()}
                </div>
              </div>
            ))
          ) : (
            <div style={{ background: '#1a2c38', borderRadius: 20, padding: 16, color: '#b1bad3', fontSize: 14, flex: 1 }}>No game stats yet.</div>
          )}
        </div>
      </div>

      {/* قسم الألعاب */}
      <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, marginBottom: 16 }}>All Games</div>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(280px, 1fr))', 
        gap: isMobile ? 12 : 24 
      }}>
        {games.map((game) => <GameCard key={game.title} {...game} />)}
      </div>
    </PageShell>
  );
}
