import { useMemo, useState, useEffect, useRef } from 'react';
import PageShell from '../components/PageShell';
import { placeBet, settleGame, getBalance } from '../lib/api';

const REELS_COUNT = 3;
const MOBILE_BREAKPOINT = 820;

const SYMBOLS = [
  { id: 'crown', char: '👑', weight: 1, payout: 100 },
  { id: 'seven', char: '7️⃣', weight: 3, payout: 50 },
  { id: 'gem', char: '💎', weight: 6, payout: 20 },
  { id: 'lemon', char: '🍋', weight: 12, payout: 5 },
  { id: 'cherry', char: '🍒', weight: 18, payout: 2 },
];

const EXPANDED_SYMBOLS = SYMBOLS.flatMap(sym => Array(sym.weight).fill(sym));

function formatMoney(val) {
  if (val <= 0) return '0.00';
  if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getRandomSymbol() { return EXPANDED_SYMBOLS[Math.floor(Math.random() * EXPANDED_SYMBOLS.length)]; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function emitBalanceUpdated(balance) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('casino:balance-updated', { detail: { balance } }));
  }
}

export default function SlotsPage() {
  const [bet, setBet] = useState('10');
  const [userBalance, setUserBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [message, setMessage] = useState('Pull the lever to start the spin!');
  const [history, setHistory] = useState([]);
  const [roundId, setRoundId] = useState(null);
  const [reels, setReels] = useState([getRandomSymbol(), getRandomSymbol(), getRandomSymbol()]);
  const reelRefs = useRef([]);
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

  const maxPayoutFactor = Math.max(...SYMBOLS.map(s => s.payout));
  const potentialBest = useMemo(() => Math.floor((Number(bet) || 0) * maxPayoutFactor), [bet]);

  function setFractionBet(fraction) {
    const newBet = Math.floor(userBalance * fraction);
    setBet(String(newBet > 0 ? newBet : 1));
  }

  async function pullLever() {
    if (busy || spinning) return;
    const amount = Number(bet);
    if (!amount || amount <= 0) { setMessage('Enter a valid bet amount.'); return; }

    setBusy(true); setSpinning(true); setMessage('Spinning...'); setRoundId(null);

    const betRes = await placeBet(undefined, amount, 'slots', 'slots spin bet', { amount });
    if (!betRes.ok) { setBusy(false); setSpinning(false); setMessage(betRes.error || 'Bet failed'); return; }

    emitBalanceUpdated(betRes.balance);
    const currentRoundId = betRes.roundId;
    setRoundId(currentRoundId);

    let finalSymbols;
    if (Math.random() < 0.30) {
      const winSymbol = getRandomSymbol();
      finalSymbols = [winSymbol, winSymbol, winSymbol];
    } else {
      finalSymbols = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
    }

    reelRefs.current.forEach(ref => {
      if (ref) { ref.classList.remove('stop-bump'); ref.classList.add('spinning-blur'); }
    });

    const intervals = reelRefs.current.map((ref, i) => setInterval(() => {
      if (ref) ref.innerText = getRandomSymbol().char;
    }, 50 + i * 15));

    await sleep(1000);

    for (let i = 0; i < REELS_COUNT; i++) {
      clearInterval(intervals[i]);
      if (reelRefs.current[i]) {
        reelRefs.current[i].classList.remove('spinning-blur');
        reelRefs.current[i].classList.add('stop-bump');
        reelRefs.current[i].innerText = finalSymbols[i].char;
      }
      setReels(prev => { const next = [...prev]; next[i] = finalSymbols[i]; return next; });
      await sleep(350);
    }

    setSpinning(false);
    const allSame = finalSymbols.every(s => s.id === finalSymbols[0].id);
    let payout = 0;

    if (allSame) {
      const winnerSymbol = finalSymbols[0];
      payout = Math.floor(amount * winnerSymbol.payout);
    }

    const win = payout > 0;
    const settleRes = await settleGame(undefined, currentRoundId, payout, 'slots', 'slots spin payout', { multiplier: allSame ? finalSymbols[0].payout : 0 }, win ? 'win' : 'loss');

    setBusy(false);
    setRoundId(null);

    if (!settleRes.ok) { setMessage(settleRes.error || 'Failed to settle payout'); return; }

    emitBalanceUpdated(settleRes.balance);

    if (win) {
      const winner = finalSymbols[0];
      setMessage(`Jackpot! x${winner.payout} Profit! payout: $${formatMoney(payout)}`);
    } else {
      setMessage('Unlucky. Better luck next time!');
    }

    setHistory(prev => [{ payout, reels: finalSymbols, id: currentRoundId }, ...prev].slice(0, 3));
  }

  return (
    <PageShell title="Slot Machine">
      <style>{`
        .spinning-blur { animation: fastRoll 0.15s infinite linear; filter: blur(2px); opacity: 0.8; }
        @keyframes fastRoll { 0% { transform: translateY(-40%); } 100% { transform: translateY(40%); } }
        .stop-bump { animation: reelBump 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        @keyframes reelBump { 0% { transform: translateY(30px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0); } }
        @keyframes slotsLeverPull { 0% { transform: scaleY(1); } 50% { transform: scaleY(0.3) translateY(40px); } 100% { transform: scaleY(1); } }
        .reel-symbol { font-size: 70px; display: flex; align-items: center; justify-content: center; height: 100%; width: 100%; position: absolute; top: 0; left: 0; will-change: transform; }
        @media (max-width: 820px) { .reel-symbol { font-size: 50px; } }
      `}</style>
      
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '390px 1fr', gap: isMobile ? 16 : 24, alignItems: 'start' }}>
        
        {/* Controls Section */}
        <div style={{ background: '#1a2c38', borderRadius: isMobile ? 20 : 24, padding: isMobile ? 16 : 20, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', minWidth: 0, order: isMobile ? 2 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 900 }}>Spin</div>
            <div style={{ color: busy ? '#00e701' : '#b1bad3', fontSize: 12, fontWeight: 800 }}>{busy ? 'SPINNING' : 'READY'}</div>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>Bet Amount</div>
          <div style={{ marginBottom: 18 }}>
            <input type="number" lang="en" dir="ltr" inputMode="decimal" min="1" value={bet} onChange={(e) => setBet(e.target.value)} disabled={busy} style={{ ...inputStyle, marginBottom: 8 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              <button onClick={() => setFractionBet(0.25)} disabled={busy} style={actionBtn}>1/4</button>
              <button onClick={() => setFractionBet(0.3333)} disabled={busy} style={actionBtn}>1/3</button>
              <button onClick={() => setFractionBet(0.5)} disabled={busy} style={actionBtn}>1/2</button>
              <button onClick={() => setFractionBet(1)} disabled={busy} style={actionBtn}>Full</button>
            </div>
          </div>

          <button onClick={pullLever} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.65 : 1, fontSize: isMobile ? 15 : 16 }}>
            {busy ? 'Spinning...' : 'Pull Lever (Spin)'}
          </button>

          <div style={{ marginTop: 18, background: '#132634', borderRadius: 18, padding: 16, border: '1px solid rgba(255,255,255,0.05)', lineHeight: 1.9 }}>
            <div style={statRow}><span style={statLabel}>Current Bet</span><span style={statValue}>${formatMoney(Number(bet) || 0)}</span></div>
            <div style={statRow}><span style={statLabel}>Max Payout</span><span style={{ ...statValue, color: '#00e701' }}>${formatMoney(potentialBest)}</span></div>
          </div>

          <div style={{ marginTop: 16, color: '#b1bad3', minHeight: 24, lineHeight: 1.6, fontSize: isMobile ? 14 : 15 }}>{message}</div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Last Results</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {history.length === 0 ? <div style={{ background: '#132634', borderRadius: 14, padding: 14, color: '#b1bad3' }}>No spins yet.</div> : history.map((item, index) => (
                <div key={index} style={{ background: '#132634', borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: item.payout > 0 ? '#00e701' : 'white' }}>{item.reels[0].char} {item.reels[1].char} {item.reels[2].char}</div>
                    <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 4 }}>{item.payout > 0 ? `Win!` : 'Loss'}</div>
                  </div>
                  <div style={{ fontWeight: 900, color: item.payout > 0 ? '#00e701' : 'white' }}>${formatMoney(item.payout)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Board Section */}
        <div style={{ background: '#1a2c38', borderRadius: isMobile ? 20 : 24, padding: isMobile ? 16 : 24, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', minWidth: 0, order: isMobile ? 1 : 2 }}>
          
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <SummaryItem label="Multiplier" value={busy ? "x?" : SYMBOLS.some(s => reels.every(r => r.id === s.id)) ? `x${reels[0].payout}` : "x0"} accent={busy ? "white" : reels.every(r => r.id === reels[0].id) ? "#00e701" : "white"} />
            <SummaryItem label="Potential Payout" value={`$${formatMoney(potentialBest)}`} />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f212e', borderRadius: 22, border: '1px solid rgba(255,255,255,0.05)', padding: isMobile ? '30px 10px' : '40px 20px', position: 'relative' }}>
            
            {/* Slot Machine & Lever Container */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', transform: isMobile ? 'scale(0.85)' : 'scale(1)' }}>
              
              {/* Reels Box */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${REELS_COUNT}, 1fr)`, gap: isMobile ? 10 : 15, background: '#0a151d', padding: isMobile ? '12px' : '20px', borderRadius: 24, border: '4px solid #233847', boxShadow: '0 20px 50px rgba(0,0,0,0.5), inset 0 10px 20px rgba(0,0,0,0.3)', width: isMobile ? 300 : 450, height: isMobile ? 160 : 220, zIndex: 10 }}>
                {reels.map((symbol, i) => (
                  <div key={i} style={{ background: '#ffffff', borderRadius: 14, boxShadow: 'inset 0 10px 20px rgba(0,0,0,0.1)', overflow: 'hidden', position: 'relative' }}>
                    <div ref={el => reelRefs.current[i] = el} className="reel-symbol">{symbol.char}</div>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.3) 100%)', pointerEvents: 'none' }} />
                  </div>
                ))}
              </div>

              {/* Lever Box */}
              <div style={{ width: 50, height: 180, marginLeft: -5, position: 'relative', cursor: busy ? 'default' : 'pointer', zIndex: 5 }} onClick={pullLever}>
                <div style={{ width: 25, height: 80, background: '#132634', borderTopRightRadius: 16, borderBottomRightRadius: 16, position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 0, border: '3px solid #233847', borderLeft: 'none', boxShadow: '5px 0 10px rgba(0,0,0,0.3)' }} />
                <div style={{ width: 14, height: 120, background: 'linear-gradient(90deg, #b1bad3, #ffffff)', borderRadius: 8, position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 15, transformOrigin: 'bottom center', animation: spinning ? 'slotsLeverPull 500ms ease-in-out' : 'none' }}>
                  <div style={{ position: 'absolute', top: -25, left: '50%', transform: 'translateX(-50%)', width: 45, height: 45, borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, #ff7373, #ff4d4d 40%, #b31c1c 100%)', boxShadow: '0 5px 15px rgba(179,28,28,0.5)', border: '2px solid rgba(0,0,0,0.2)' }} />
                </div>
              </div>
            </div>

            {/* Paytable */}
            <div style={{ marginTop: 40, width: '100%', maxWidth: 550 }}>
              <div style={{ fontSize: 13, color: '#b1bad3', fontWeight: 800, textAlign: 'center', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Winning Combinations</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: isMobile ? 8 : 15, flexWrap: 'wrap' }}>
                {SYMBOLS.map(sym => (
                  <div key={sym.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#132634', padding: isMobile ? '8px 12px' : '12px 20px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: isMobile ? 18 : 22, letterSpacing: 2, marginBottom: 4 }}>{sym.char}{sym.char}{sym.char}</div>
                    <div style={{ fontWeight: 900, color: '#00e701' }}>x{sym.payout}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </PageShell>
  );
}

function SummaryItem({ label, value, accent = 'white' }) {
  return (
    <div style={{ background: '#132634', borderRadius: 16, padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)', flex: 1, minWidth: 0 }}>
      <span style={{ color: '#b1bad3', fontWeight: 700, fontSize: 13, marginBottom: 6, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ color: accent, fontWeight: 900, fontSize: 20, whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

const inputStyle = { width: '100%', borderRadius: 14, background: '#0f212e', border: '1px solid rgba(255,255,255,0.1)', padding: '14px 16px', color: 'white' };
const actionBtn = { background: '#233847', color: 'white', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 0', cursor: 'pointer', fontWeight: 800, fontSize: 13, textAlign: 'center' };
const primaryBtn = { width: '100%', borderRadius: 14, background: '#00e701', color: 'black', fontWeight: 900, padding: '15px 16px', border: 'none', cursor: 'pointer', marginTop: 18, transition: 'transform 0.05s ease' };
const statRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 };
const statLabel = { color: '#b1bad3' };
const statValue = { color: 'white', fontWeight: 800 };
