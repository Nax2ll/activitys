import PageShell from '../components/PageShell';
import GameCard from '../components/GameCard';

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
  }
];

export default function HomePage() {
  return (
    <PageShell title="Casino">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.3fr 1fr',
          gap: 24,
          marginBottom: 24
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #1a2c38, #233f52)',
            borderRadius: 28,
            padding: 28,
            minHeight: 210,
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.22)'
          }}
        >
          <div
            style={{
              color: '#00e701',
              fontWeight: 800,
              fontSize: 14,
              marginBottom: 10
            }}
          >
            FEATURED
          </div>

          <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1.1 }}>
            Play Casino Games
            <br />
            Inside Discord
          </div>

          <div
            style={{
              color: '#b1bad3',
              fontSize: 16,
              marginTop: 14,
              maxWidth: 650,
              lineHeight: 1.6
            }}
          >
            A Stake-style activity with clean UI, smooth navigation, wallet support,
            and room to expand into multiplayer later.
          </div>
        </div>

        <div
          style={{
            background: '#1a2c38',
            borderRadius: 28,
            padding: 24,
            border: '1px solid rgba(255,255,255,0.06)'
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 16 }}>
            Popular Right Now
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {['Mines', 'Dice', 'Plinko'].map((name, i) => (
              <div
                key={name}
                style={{
                  background: '#233847',
                  borderRadius: 16,
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: 800 }}>{name}</div>
                  <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 4 }}>
                    {i === 0
                      ? 'High risk, high reward'
                      : i === 1
                      ? 'Fast betting'
                      : 'Animated drop game'}
                  </div>
                </div>
                <div style={{ color: '#00e701', fontWeight: 900 }}>Live</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 24
        }}
      >
        {games.map((game) => (
          <GameCard key={game.title} {...game} />
        ))}
      </div>
    </PageShell>
  );
}