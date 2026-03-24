import { useEffect, useState, useMemo } from 'react';
import PageShell from '../components/PageShell';
import { placeBet, settleGame, getBalance } from '../lib/api';

const CAMEL_COUNT = 5;
const PAYOUT_MULTIPLIER = 4.8;
const TRACK_FINISH_LINE = 85;
const MOBILE_BREAKPOINT = 820;

const CAMEL_COLORS = [
  { id: 1, color: '#ff4d4d', name: 'زعبيل' },
  { id: 2, color: '#3b82f6', name: 'مبشرة' },
  { id: 3, color: '#10b981', name: 'الشملال' },
  { id: 4, color: '#f59e0b', name: 'المضبر' },
  { id: 5, color: '#8b5cf6', name: 'العذافره' }
];

function formatMoney(val) {
  if (val <= 0) return '0.00';
  if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function emitBalanceUpdated(balance) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('casino:balance-updated', { detail: { balance } }));
  }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export default function CamelRacingPage() {
  const [bet, setBet] = useState('10');
  const [userBalance, setUserBalance] = useState(0);
  const [selectedCamel, setSelectedCamel] = useState(1);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [message, setMessage] = useState('Pick your camel and start the race!');
  const [history, setHistory] = useState([]);
  const [roundId, setRoundId] = useState(null);
  const [positions, setPositions] = useState(Array(CAMEL_COUNT).fill(0));
  const [winner, setWinner] = useState(null);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= MOBILE_BREAKPOINT;
  });

  useEffect(() => {
    let mounted = true;
    function handleResize() { setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT); }
    handleResize();
    window.addEventListener('resize', handleResize);

    async function fetchBalance() {
      try {
        const res = await getBalance();
        if (mounted && res?.ok) setUserBalance(Number(res.wallet ?? res.balance) || 0);
      } catch (e) {}
    }
    fetchBalance();

    const handleBalanceUpdate = (e) => {
      if (mounted) setUserBalance(Number(e.detail.balance));
    };
    window.addEventListener('casino:balance-updated', handleBalanceUpdate);

    return () => {
      mounted = false;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('casino:balance-updated', handleBalanceUpdate);
    };
  }, []);

  const potentialPayout = useMemo(() => Math.floor((Number(bet) || 0) * PAYOUT_MULTIPLIER), [bet]);

  // دالة ضرب أو قسمة الرهان الحالي (x2, /2)
  function modifyBet(multiplier) {
    const current = Number(bet) || 0;
    let newBet = Math.floor(current * multiplier);
    if (newBet < 1) newBet = 1;
    if (newBet > userBalance && userBalance > 0) newBet = Math.floor(userBalance);
    setBet(String(newBet));
  }

  // دالة تحديد نسبة الرهان من الرصيد الكلي
  function setFractionBet(fraction) {
    const newBet = Math.floor(userBalance * fraction);
    setBet(String(newBet > 0 ? newBet : 1));
  }

  async function startRace() {
    if (busy || phase === 'racing') return;
    const amount = Number(bet);
    if (!amount || amount <= 0) { setMessage('Enter a valid bet amount.'); return; }

    setBusy(true); setPhase('idle'); setMessage('Placing bet and lining up camels...');
    setPositions(Array(CAMEL_COUNT).fill(0)); setWinner(null); setRoundId(null);

    const betRes = await placeBet(undefined, amount, 'camel_racing', 'camel racing bet', { selectedCamel });
    if (!betRes.ok) { setBusy(false); setMessage(betRes.error || 'Bet failed'); return; }

    emitBalanceUpdated(betRes.balance);
    const currentRoundId = betRes.roundId;
    setRoundId(currentRoundId);
    setPhase('racing'); setMessage('And they are off! 🐪💨');

    let currentPos = Array(CAMEL_COUNT).fill(0);
    const frames = [];
    let raceWinnerIndex = -1;

    while (true) {
      currentPos = currentPos.map(p => p + (Math.random() * 1.5 + 0.3));
      frames.push([...currentPos]);
      const maxPos = Math.max(...currentPos);
      if (maxPos >= TRACK_FINISH_LINE) { raceWinnerIndex = currentPos.findIndex(p => p === maxPos); break; }
    }

    for (const frame of frames) { setPositions(frame); await sleep(40); }

    const actualWinnerCamel = raceWinnerIndex + 1;
    const actualWinnerName = CAMEL_COLORS[raceWinnerIndex].name;
    setWinner(actualWinnerCamel); setPhase('finished');

    const isWin = selectedCamel === actualWinnerCamel;
    const payout = isWin ? amount * PAYOUT_MULTIPLIER : 0;
    setMessage('Settling race results...');

    const settleRes = await settleGame(undefined, currentRoundId, payout, 'camel_racing', `camel racing payout. Winner: ${actualWinnerName}`, { selectedCamel, winner: actualWinnerCamel, multiplier: isWin ? PAYOUT_MULTIPLIER : 0 }, isWin ? 'win' : 'loss');
    setBusy(false); setRoundId(null);

    if (!settleRes.ok) { setMessage(settleRes.error || 'Failed to settle payout'); return; }
    emitBalanceUpdated(settleRes.balance);

    if (isWin) setMessage(`🎉 ${actualWinnerName} won! You bagged $${formatMoney(payout)}!`);
    else setMessage(`❌ ${actualWinnerName} took the lead. Better luck next race!`);

    setHistory(prev => [{ selected: selectedCamel, winner: actualWinnerCamel, won: isWin, payout, id: currentRoundId }, ...prev].slice(0, 3));
  }

  return (
    <PageShell title="Camel Racing">
      <style>{`
        @keyframes gallop { 0% { transform: translateY(0) rotate(0deg); } 25% { transform: translateY(-4px) rotate(-3deg); } 50% { transform: translateY(0) rotate(0deg); } 75% { transform: translateY(-2px) rotate(3deg); } 100% { transform: translateY(0) rotate(0deg); } }
        .camel-icon { font-size: 38px; position: absolute; top: 50%; margin-top: -24px; transition: left 40ms linear; z-index: 10; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4)); }
        .racing-anim { animation: gallop 0.4s infinite linear; }
        .track-lane { position: relative; height: 56px; background: #132634; border-radius: 12px; margin-bottom: 12px; border-bottom: 3px solid rgba(0,0,0,0.2); overflow: hidden; box-shadow: inset 0 2px 10px rgba(0,0,0,0.3); }
        .finish-line { position: absolute; left: ${TRACK_FINISH_LINE}%; top: 0; bottom: 0; width: 8px; background: repeating-linear-gradient(0deg, #ffffff, #ffffff 8px, #000000 8px, #000000 16px); box-shadow: -2px 0 10px rgba(0,0,0,0.5); z-index: 5; }
        .dust-trail { position: absolute; top: 60%; width: 30px; height: 10px; background: rgba(194, 160, 119, 0.4); border-radius: 50%; filter: blur(4px); z-index: 1; transition: left 40ms linear; }
      `}</style>
      
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '390px 1fr', gap: isMobile ? 16 : 24, alignItems: 'start' }}>
        
        {/* Controls Section */}
        <div style={{ background: '#1a2c38', borderRadius: isMobile ? 20 : 24, padding: isMobile ? 16 : 20, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', minWidth: 0, order: isMobile ? 2 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 900 }}>Race Book</div>
            <div style={{ color: phase === 'racing' ? '#ff9800' : '#00e701', fontSize: 12, fontWeight: 800 }}>{phase === 'racing' ? 'RACING' : 'READY'}</div>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>Bet Amount</div>
          <div style={{ marginBottom: 18 }}>
            
            {/* الصف الأول: مربع النص + أزرار الضرب والقسمة */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input 
                type="text" lang="en" dir="ltr" inputMode="decimal"
                value={bet} 
                onChange={(e) => {
                  let val = e.target.value.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
                  val = val.replace(/[^0-9.]/g, '');
                  setBet(val);
                }} 
                disabled={busy || phase === 'racing'} 
                style={{ ...inputStyle, marginBottom: 0, flex: 1, outline: 'none' }} 
              />
              <button onClick={() => modifyBet(0.5)} disabled={busy || phase === 'racing'} style={{ ...actionBtn, padding: '0 16px', fontSize: 15 }}>
                1/2
              </button>
              <button onClick={() => modifyBet(2)} disabled={busy || phase === 'racing'} style={{ ...actionBtn, padding: '0 16px', fontSize: 15 }}>
                2x
              </button>
            </div>

            {/* الصف الثاني: أزرار النسب (1/4, 1/2, 3/4, Full) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              <button onClick={() => setFractionBet(0.25)} disabled={busy || phase === 'racing'} style={actionBtn}>1/4</button>
              <button onClick={() => setFractionBet(0.5)} disabled={busy || phase === 'racing'} style={actionBtn}>1/2</button>
              <button onClick={() => setFractionBet(0.75)} disabled={busy || phase === 'racing'} style={actionBtn}>3/4</button>
              <button onClick={() => setFractionBet(1)} disabled={busy || phase === 'racing'} style={actionBtn}>Full</button>
            </div>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>Select Your Camel</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 18 }}>
            {CAMEL_COLORS.map(camel => (
              <div key={camel.id} onClick={() => !busy && phase !== 'racing' && setSelectedCamel(camel.id)} style={{ background: selectedCamel === camel.id ? camel.color : '#132634', border: `2px solid ${camel.color}`, color: selectedCamel === camel.id ? '#fff' : camel.color, borderRadius: 12, padding: isMobile ? '8px 0' : '10px 0', textAlign: 'center', fontWeight: 900, fontSize: isMobile ? 16 : 18, cursor: busy || phase === 'racing' ? 'default' : 'pointer', opacity: (busy || phase === 'racing') && selectedCamel !== camel.id ? 0.4 : 1, boxShadow: selectedCamel === camel.id ? `0 4px 15px ${camel.color}60` : 'none', transition: 'all 0.2s ease' }}>
                {camel.id}
              </div>
            ))}
          </div>

          <button onClick={startRace} disabled={busy || phase === 'racing'} style={{ ...primaryBtn, opacity: busy || phase === 'racing' ? 0.65 : 1, fontSize: isMobile ? 15 : 16 }}>
            {busy || phase === 'racing' ? 'Race in progress...' : 'Start Race'}
          </button>

          <div style={{ marginTop: 18, background: '#132634', borderRadius: 18, padding: 16, border: '1px solid rgba(255,255,255,0.05)', lineHeight: 1.9 }}>
            <div style={statRow}><span style={statLabel}>Multiplier</span><span style={{ ...statValue, color: '#00e701' }}>x{PAYOUT_MULTIPLIER}</span></div>
            <div style={statRow}><span style={statLabel}>Potential Payout</span><span style={statValue}>${formatMoney(potentialPayout)}</span></div>
          </div>

          <div style={{ marginTop: 16, color: '#b1bad3', minHeight: 24, lineHeight: 1.6, fontSize: isMobile ? 14 : 15 }}>{message}</div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Last Races</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {history.length === 0 ? <div style={{ background: '#132634', borderRadius: 14, padding: 14, color: '#b1bad3' }}>No races yet.</div> : history.map((item, index) => (
                <div key={index} style={{ background: '#132634', borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: item.won ? '#00e701' : '#ff4d4d' }}>{item.won ? 'Win!' : 'Loss'}</div>
                    <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 4 }}>Picked: {CAMEL_COLORS[item.selected - 1].name} | Winner: {CAMEL_COLORS[item.winner - 1].name}</div>
                  </div>
                  <div style={{ fontWeight: 900, color: item.won ? '#00e701' : 'white' }}>${formatMoney(item.payout)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Race Track Section */}
        <div style={{ background: '#1a2c38', borderRadius: isMobile ? 20 : 24, padding: isMobile ? 16 : 24, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', minWidth: 0, order: isMobile ? 1 : 2 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <SummaryItem label="Your Camel" value={CAMEL_COLORS[selectedCamel-1].name} accent={CAMEL_COLORS[selectedCamel-1].color} isMobile={isMobile} />
            <SummaryItem label="Winner" value={winner ? CAMEL_COLORS[winner-1].name : '-'} accent={winner ? CAMEL_COLORS[winner-1].color : 'white'} isMobile={isMobile} />
          </div>

          <div style={{ flex: 1, background: '#0f212e', borderRadius: 22, border: '1px solid rgba(255,255,255,0.05)', padding: isMobile ? '16px 10px' : '20px', position: 'relative' }}>
            <div style={{ textAlign: 'center', marginBottom: 15, color: '#b1bad3', fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', fontSize: 14 }}>Desert Derby</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {CAMEL_COLORS.map((camel, index) => {
                const pos = positions[index];
                const isRacing = phase === 'racing';
                const isWinner = winner === camel.id;
                return (
                  <div key={camel.id} className="track-lane">
                    <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 2, display: 'flex', alignItems: 'center', gap: 10, opacity: 0.3 }}>
                      <div style={{ background: camel.color, width: 24, height: 24, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14 }}>{camel.id}</div>
                      <span style={{ color: '#fff', fontWeight: 800, fontSize: 14, display: isMobile ? 'none' : 'block' }}>{camel.name}</span>
                    </div>
                    <div className="finish-line" />
                    {pos > 2 && <div className="dust-trail" style={{ left: `calc(${pos}% - 25px)`, opacity: isRacing ? 1 : 0 }} />}
                    <div className={`camel-icon ${isRacing ? 'racing-anim' : ''}`} style={{ left: `${pos}%`, filter: isWinner ? `drop-shadow(0 0 10px ${camel.color})` : 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))' }}>
                      🐪
                      <div style={{ position: 'absolute', top: -5, left: 15, width: 12, height: 12, background: camel.color, border: '2px solid #fff', borderRadius: '50%', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }} />
                    </div>
                    {isWinner && phase === 'finished' && <div style={{ position: 'absolute', left: `calc(${pos}% + 45px)`, top: '50%', transform: 'translateY(-50%)', fontSize: 24, animation: 'gallop 1s infinite ease-in-out' }}>🏆</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ height: 10, marginTop: 15, background: 'linear-gradient(90deg, transparent, rgba(194, 160, 119, 0.2), transparent)' }} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function SummaryItem({ label, value, accent = 'white', isMobile = false }) {
  return (
    <div style={{ background: '#132634', borderRadius: 16, padding: isMobile ? '14px 10px' : '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)', flex: 1, minWidth: 0 }}>
      <span style={{ color: '#b1bad3', fontWeight: 700, fontSize: isMobile ? 12 : 13, marginBottom: 6, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ color: accent, fontWeight: 900, fontSize: isMobile ? 16 : 20, whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

const inputStyle = { width: '100%', borderRadius: 14, background: '#0f212e', border: '1px solid rgba(255,255,255,0.1)', padding: '14px 16px', color: 'white', outline: 'none' };
const actionBtn = { background: '#233847', color: 'white', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 0', cursor: 'pointer', fontWeight: 800, fontSize: 13, textAlign: 'center' };
const primaryBtn = { width: '100%', borderRadius: 14, background: '#00e701', color: 'black', fontWeight: 900, padding: '15px 16px', border: 'none', cursor: 'pointer', marginTop: 18, transition: 'transform 0.05s ease' };
const statRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 };
const statLabel = { color: '#b1bad3' };
const statValue = { color: 'white', fontWeight: 800 };
