import { useEffect, useState } from 'react';
import PageShell from '../components/PageShell';
import GameCard from '../components/GameCard';
import { getTopProfitGames } from '../lib/api';

const MOBILE_BREAKPOINT = 820;

const games = [
  { title: 'Plinko', subtitle: 'Drop balls through pins and land on multipliers.', path: '/plinko', image: '🔴 PLINKO', accent: '#7a1f2c' },
  { title: 'Dice', subtitle: 'Fast over/under rolls with instant results.', path: '/dice', image: '🎲 DICE', accent: '#2b5172' },
  { title: 'Mines', subtitle: 'Pick tiles, avoid mines, and cash out in time.', path: '/mines', image: '💣 MINES', accent: '#4f3a19' },
  { title: 'Dragon Tower', subtitle: 'Climb floors and avoid the hidden danger.', path: '/dragon-tower', image: '🐉 DRAGON', accent: '#244d37' },
  { title: 'Keno', subtitle: 'Choose numbers and match the draw.', path: '/keno', image: '🔵 KENO', accent: '#334572' },
  { title: 'Chicken Cross', subtitle: 'Cross the road, survive the lanes, and cash out.', path: '/chicken-cross', image: '🐔 CROSS', accent: '#5b3f24' },
  { title: 'Slot Machine', subtitle: 'Spin the reels and hit the jackpot combination.', path: '/slots-machine', image: '🎰 SLOTS', accent: '#b8860b' },
  { title: 'Number Guess', subtitle: 'Use logic and hints to find the secret number.', path: '/guess', image: '🔢 GUESS', accent: '#ff9800' },
  { title: 'Memory Gamble', subtitle: 'Test your brain and match the hidden cards.', path: '/memory', image: '🧠 MEMORY', accent: '#673ab7' },
  { title: 'Camel Racing', subtitle: 'Bet on your favorite camel in the Desert Derby.', path: '/camel-racing', image: '🐪 RACING', accent: '#c2a077' }
];

function formatGameName(key) {
  const names = {
    dice: 'Dice', mines: 'Mines', chickenCross: 'Chicken Cross',
    dragonTower: 'Dragon Tower', plinko: 'Plinko', keno: 'Keno',
    slots: 'Slots', guess: 'Number Guess', memory: 'Memory Gamble', camel_racing: 'Camel Racing'
  };
  return names[key] || key || 'Unknown Game';
}

// دالة تنسيق الأرباح (عادي للمبالغ الصغيرة، وبحروف M,B,T للمبالغ الضخمة)
function formatMoney(val) {
  const absVal = Math.abs(val);
  if (absVal >= 1e12) return (val / 1e12).toFixed(2) + 'T';
  if (absVal >= 1e9) return (val / 1e9).toFixed(2) + 'B';
  if (absVal >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  return Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function HomePage() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= MOBILE_BREAKPOINT;
  });

  const [topGames, setTopGames] = useState([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    function handleResize() { setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT); }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let active = true;
    async function fetchTopGames() {
      try {
        setIsLoadingStats(true);
        const res = await getTopProfitGames();
        if (!active) return;
        if (res?.ok && Array.isArray(res.items)) {
          const normalized = res.items.map((item) => ({
            id: item.key || item.gameKey || item.name,
            name: item.name || item.gameName || formatGameName(item.key || item.gameKey),
            played: Number(item.played || 0), wins: Number(item.wins || 0),
            losses: Number(item.losses || 0), profit: Number(item.profit || 0)
          }));
          setTopGames(normalized);
        } else {
          setTopGames([]);
        }
      } catch (error) {
        if (active) setTopGames([]);
      } finally {
        if (active) setIsLoadingStats(false);
      }
    }
    fetchTopGames();
    return () => { active = false; };
  }, []);

  return (
    <PageShell title="Casino">
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '1.3fr minmax(0, 1fr)', gap: isMobile ? 16 : 24, marginBottom: isMobile ? 16 : 24 }}>
        
        {/* Featured Section */}
        <div style={{ background: 'linear-gradient(135deg, #1a2c38, #233f52)', borderRadius: isMobile ? 22 : 28, padding: isMobile ? 18 : 28, minHeight: isMobile ? 180 : 210, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 20px 60px rgba(0,0,0,0.22)', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
          <div style={{ color: '#00e701', fontWeight: 800, fontSize: isMobile ? 12 : 14, marginBottom: 10, letterSpacing: 0.3 }}>FEATURED</div>
          <div style={{ fontSize: isMobile ? 'clamp(26px, 6.5vw, 36px)' : 42, fontWeight: 900, lineHeight: 1.08, wordBreak: 'break-word' }}>
            Play Casino Games<br />Powered by Milkyway
          </div>
          <div style={{ color: '#b1bad3', fontSize: isMobile ? 14 : 16, marginTop: 14, maxWidth: 650, lineHeight: 1.6, wordBreak: 'break-word' }}>
            A Halal way to experience gambling without losing your real money.
          </div>
        </div>

        {/* Top Profitable Games */}
        <div style={{ background: '#1a2c38', borderRadius: isMobile ? 22 : 28, padding: isMobile ? 18 : 24, border: '1px solid rgba(255,255,255,0.06)', minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, marginBottom: 16 }}>Your Top Profitable Games</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {isLoadingStats ? (
              <div style={{ background: '#233847', borderRadius: 16, padding: isMobile ? '12px 14px' : '14px 16px', color: '#b1bad3', fontSize: 14 }}>Loading stats...</div>
            ) : topGames.length > 0 ? (
              topGames.map((game, i) => (
                <div key={game.id} style={{ background: '#233847', borderRadius: 16, padding: isMobile ? '12px 14px' : '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: isMobile ? 14 : 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {i + 1} - {game.name}
                    </div>
                    <div style={{ color: '#b1bad3', fontSize: isMobile ? 12 : 13, marginTop: 4, lineHeight: 1.45, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Played {game.played} • Wins {game.wins} • Losses {game.losses}
                    </div>
                  </div>
                  <div style={{ color: game.profit >= 0 ? '#00e701' : '#ff4d4d', fontWeight: 900, fontSize: isMobile ? 13 : 14, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {game.profit >= 0 ? '+' : ''}${formatMoney(game.profit)}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ background: '#233847', borderRadius: 16, padding: isMobile ? '12px 14px' : '14px 16px', color: '#b1bad3', fontSize: 14 }}>No game stats yet.</div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: isMobile ? 12 : 24 }}>
        {games.map((game) => <GameCard key={game.title} {...game} />)}
      </div>
    </PageShell>
  );
}
