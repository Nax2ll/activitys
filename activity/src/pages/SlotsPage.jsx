import { useMemo, useState, useEffect, useRef } from 'react';
import PageShell from '../components/PageShell';
import { mockDiscordUser } from '../lib/mockUser';
import { placeBet, settleGame } from '../lib/api';

const REELS_COUNT = 3;
const SPIN_DURATION = 1500; // وقت دوران البكرات بالملي ثانية
const REEL_ANIM_DURATION = 100; // سرعة الأنيميشن للبكرة

// تعريف الرموز (Symbols) وقيمتها
const SYMBOLS = [
  { id: 'crown', char: '👑', weight: 1, payout: 100 }, // التيجان (نادرة جداً)
  { id: 'seven', char: '7️⃣', weight: 3, payout: 50 },  // الـ 7
  { id: 'gem', char: '💎', weight: 6, payout: 20 },   // الجوهرة
  { id: 'lemon', char: '🍋', weight: 12, payout: 5 },  // الليمون
  { id: 'cherry', char: '🍒', weight: 18, payout: 2 }, // الكرز (الأكثر شيوعاً)
];

// إنشاء مصفوفة موسعة للرموز بناءً على الوزن (weight)
const EXPANDED_SYMBOLS = SYMBOLS.flatMap(sym => Array(sym.weight).fill(sym));

function formatMoney(val) {
  if (val <= 0) return '0.00';
  if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getRandomSymbol() {
  return EXPANDED_SYMBOLS[Math.floor(Math.random() * EXPANDED_SYMBOLS.length)];
}

export default function SlotsPage() {
  const [bet, setBet] = useState('10');
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [message, setMessage] = useState('Pull the lever to start the spin!');
  const [history, setHistory] = useState([]);
  const [roundId, setRoundId] = useState(null);

  const [reels, setReels] = useState([getRandomSymbol(), getRandomSymbol(), getRandomSymbol()]);

  const reelRefs = useRef([]);

  const maxPayoutFactor = Math.max(...SYMBOLS.map(s => s.payout));
  const potentialBest = useMemo(() => {
    return Math.floor((Number(bet) || 0) * maxPayoutFactor);
  }, [bet]);

  function multiplyBet() { setBet(String((Number(bet) || 0) * 2)); }
  function divideBet() {
    const newBet = (Number(bet) || 0) / 2;
    setBet(String(newBet < 1 ? 1 : newBet));
  }

  async function pullLever() {
    if (busy || spinning) return;

    const amount = Number(bet);
    if (!amount || amount <= 0) {
      setMessage('Enter a valid bet amount.');
      return;
    }

    setBusy(true);
    setSpinning(true);
    setMessage('Spinning...');
    setRoundId(null);

    // 1. استدعاء API الـ placeBet مع إضافة .id
    const betRes = await placeBet(
      mockDiscordUser.id,
      amount,
      'slots',
      'slots spin bet',
      { amount }
    );

    if (!betRes.ok) {
      setBusy(false);
      setSpinning(false);
      setMessage(betRes.error || 'Bet failed');
      return;
    }

    const currentRoundId = betRes.roundId;
    setRoundId(currentRoundId);

    // 2. تفعيل أنيميشن البكرات
    reelRefs.current.forEach((ref) => {
      if (ref) {
        ref.style.animation = 'none';
        void ref.offsetHeight; // Force reflow
        ref.style.animation = `slotsReelSpin ${REEL_ANIM_DURATION}ms linear infinite`;
      }
    });

    const resultReels = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];

    // 3. الانتظار لوقت الدوران
    await new Promise(resolve => setTimeout(resolve, SPIN_DURATION));

    // 4. إيقاف الأنيميشن بالتدريج
    for (let i = 0; i < REELS_COUNT; i++) {
      if (reelRefs.current[i]) {
        await new Promise(resolve => setTimeout(resolve, 200));
        
        reelRefs.current[i].style.animation = 'none';
        setReels(prev => {
          const next = [...prev];
          next[i] = resultReels[i];
          return next;
        });
      }
    }

    setSpinning(false);

    // 5. حساب النتيجة
    const finalSymbols = resultReels;
    const allSame = finalSymbols.every(s => s.id === finalSymbols[0].id);

    let payout = 0;
    let profit = -amount;

    if (allSame) {
      const winnerSymbol = finalSymbols[0];
      payout = Math.floor(amount * winnerSymbol.payout);
      profit = payout - amount;
    }

    const win = payout > 0;

    // 6. استدعاء API الـ settleGame مع إضافة .id وتمرير الـ roundId
    const settleRes = await settleGame(
      mockDiscordUser.id,
      currentRoundId,
      payout,
      'slots',
      'slots spin payout',
      { multiplier: allSame ? finalSymbols[0].payout : 0 },
      win ? 'win' : 'loss'
    );

    setBusy(false);
    setRoundId(null);

    if (!settleRes.ok) {
      setMessage(settleRes.error || 'Failed to settle payout');
      return;
    }

    if (win) {
      const winner = finalSymbols[0];
      setMessage(`Jackpot! x${winner.payout} Profit! payout: $${formatMoney(payout)}`);
    } else {
      setMessage('Unlucky. Better luck next time!');
    }

    setHistory(prev => [{ payout, profit, reels: finalSymbols, id: currentRoundId }, ...prev].slice(0, 8));
  }

  return (
    <PageShell title="Slot Machine">
      <style>{`
        @keyframes slotsReelSpin {
          0% { transform: translateY(-20px); opacity: 0.7; }
          50% { transform: translateY(20px); opacity: 1; }
          100% { transform: translateY(-20px); opacity: 0.7; }
        }
        
        @keyframes slotsLeverPull {
          0% { transform: scaleY(1); }
          50% { transform: scaleY(0.3) translateY(40px); }
          100% { transform: scaleY(1); }
        }

        .reel-symbol {
          font-size: 75px;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          width: 100%;
          position: absolute;
          top: 0;
          left: 0;
        }
      `}</style>
      
      <div style={{ display: 'grid', gridTemplateColumns: '390px 1fr', gap: 24 }}>
        
        {/* Controls Section */}
        <div style={{ background: '#1a2c38', borderRadius: 24, padding: 20, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 24, fontWeight: 900 }}>Spin</div>
            <div style={{ color: busy ? '#00e701' : '#b1bad3', fontSize: 12, fontWeight: 800 }}>
              {busy ? 'SPINNING' : 'READY'}
            </div>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>Bet Amount</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <input type="number" min="1" value={bet} onChange={(e) => setBet(e.target.value)} disabled={busy} style={{ ...inputStyle, flex: 1, opacity: busy ? 0.6 : 1 }} />
            <button onClick={divideBet} disabled={busy} style={actionBtn}>1/2</button>
            <button onClick={multiplyBet} disabled={busy} style={actionBtn}>2x</button>
          </div>

          <button
            onClick={pullLever}
            disabled={busy}
            style={{
              ...primaryBtn,
              opacity: busy ? 0.65 : 1
            }}
            onMouseDown={(e) => !busy && (e.currentTarget.style.transform = 'scale(0.97)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {busy ? 'Spinning...' : 'Pull Lever (Spin)'}
          </button>

          <div style={{ marginTop: 18, background: '#132634', borderRadius: 18, padding: 16, border: '1px solid rgba(255,255,255,0.05)', lineHeight: 1.9 }}>
            <div style={statRow}><span style={statLabel}>Current Bet</span><span style={statValue}>${formatMoney(Number(bet) || 0)}</span></div>
            <div style={statRow}><span style={statLabel}>Max Possible Payout</span><span style={{ ...statValue, color: '#00e701' }}>${formatMoney(potentialBest)}</span></div>
          </div>

          <div style={{ marginTop: 16, color: '#b1bad3', minHeight: 24, lineHeight: 1.6 }}>{message}</div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Last Results</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {history.length === 0 ? (
                <div style={{ background: '#132634', borderRadius: 14, padding: 14, color: '#b1bad3' }}>No spins yet.</div>
              ) : (
                history.map((item, index) => (
                  <div key={index} style={{ background: '#132634', borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, color: item.payout > 0 ? '#00e701' : 'white' }}>
                        {item.reels[0].char} {item.reels[1].char} {item.reels[2].char}
                      </div>
                      <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 4 }}>
                        {item.payout > 0 ? `Win!` : 'Loss'}
                      </div>
                    </div>
                    <div style={{ fontWeight: 900, color: item.payout > 0 ? '#00e701' : 'white' }}>
                      ${formatMoney(item.payout)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Board Section */}
        <div style={{ background: '#1a2c38', borderRadius: 24, padding: 24, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <SummaryItem label="Current Match" value={busy ? "?" : reels.every(r => r.id === reels[0].id) ? reels[0].char : "None"} />
            <SummaryItem label="Multiplier" value={busy ? "x?" : SYMBOLS.some(s => reels.every(r => r.id === s.id)) ? `x${reels[0].payout}` : "x0"} accent={busy ? "white" : reels.every(r => r.id === reels[0].id) ? "#00e701" : "white"} />
            <SummaryItem label="Potential Payout" value={`$${formatMoney(potentialBest)}`} />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f212e', borderRadius: 22, border: '1px solid rgba(255,255,255,0.05)', padding: '40px 20px', position: 'relative' }}>
            
            {/* Slot Machine & Lever Container */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              
              {/* Reels Box */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: `repeat(${REELS_COUNT}, 1fr)`, 
                gap: 15, 
                background: '#0a151d', 
                padding: '20px', 
                borderRadius: 24, 
                border: '4px solid #233847',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5), inset 0 10px 20px rgba(0,0,0,0.3)',
                width: 450,
                height: 220,
                zIndex: 10
              }}>
                {reels.map((symbol, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#ffffff',
                      borderRadius: 14,
                      boxShadow: 'inset 0 10px 20px rgba(0,0,0,0.1)',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <div
                      ref={el => reelRefs.current[i] = el}
                      className="reel-symbol"
                    >
                      {symbol.char}
                    </div>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.3) 100%)', pointerEvents: 'none' }} />
                  </div>
                ))}
              </div>

              {/* Lever Box (المقربة واللاصقة بالآلة) */}
              <div
                style={{
                  width: 50,
                  height: 180,
                  marginLeft: -5, // تسحب الذراع لليسار عشان يلزق تماماً
                  position: 'relative',
                  cursor: busy ? 'default' : 'pointer',
                  zIndex: 5
                }}
                onClick={pullLever}
              >
                {/* قاعدة الذراع */}
                <div style={{ width: 25, height: 80, background: '#132634', borderTopRightRadius: 16, borderBottomRightRadius: 16, position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 0, border: '3px solid #233847', borderLeft: 'none', boxShadow: '5px 0 10px rgba(0,0,0,0.3)' }} />
                
                {/* عصا الذراع */}
                <div
                  style={{
                    width: 14,
                    height: 120,
                    background: 'linear-gradient(90deg, #b1bad3, #ffffff)',
                    borderRadius: 8,
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    left: 15,
                    transformOrigin: 'bottom center',
                    animation: spinning ? 'slotsLeverPull 500ms ease-in-out' : 'none'
                  }}
                >
                  {/* الكرة الحمراء */}
                  <div
                    style={{
                      position: 'absolute',
                      top: -25,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 45,
                      height: 45,
                      borderRadius: '50%',
                      background: 'radial-gradient(circle at 30% 30%, #ff7373, #ff4d4d 40%, #b31c1c 100%)',
                      boxShadow: '0 5px 15px rgba(179,28,28,0.5)',
                      border: '2px solid rgba(0,0,0,0.2)'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Paytable (جدول الفوز أسفل المكينة مباشرة) */}
            <div style={{ marginTop: 40, width: '100%', maxWidth: 550 }}>
              <div style={{ fontSize: 14, color: '#b1bad3', fontWeight: 800, textAlign: 'center', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                Winning Combinations
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 15, flexWrap: 'wrap' }}>
                {SYMBOLS.map(sym => (
                  <div key={sym.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#132634', padding: '12px 20px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.04)', boxShadow: '0 8px 20px rgba(0,0,0,0.2)' }}>
                    <div style={{ fontSize: 22, letterSpacing: 2, marginBottom: 4 }}>{sym.char}{sym.char}{sym.char}</div>
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

// UI Components
function SummaryItem({ label, value, accent = 'white' }) {
  return (
    <div style={{ background: '#132634', borderRadius: 16, padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)', flex: 1, minWidth: 0 }}>
      <span style={{ color: '#b1bad3', fontWeight: 700, fontSize: 13, marginBottom: 6, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ color: accent, fontWeight: 900, fontSize: 20, whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

const inputStyle = { width: '100%', borderRadius: 14, background: '#0f212e', border: '1px solid rgba(255,255,255,0.1)', padding: '14px 16px', color: 'white' };
const actionBtn = { background: '#233847', color: 'white', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '0 20px', cursor: 'pointer', fontWeight: 800, fontSize: 16 };
const primaryBtn = { width: '100%', borderRadius: 14, background: '#00e701', color: 'black', fontWeight: 900, padding: '15px 16px', border: 'none', cursor: 'pointer', marginTop: 18, transition: 'transform 0.05s ease' };
const statRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 };
const statLabel = { color: '#b1bad3' };
const statValue = { color: 'white', fontWeight: 800 };
