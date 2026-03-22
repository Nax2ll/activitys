import { useMemo, useState, useEffect, useRef } from 'react';
import PageShell from '../components/PageShell';
import { mockDiscordUser } from '../lib/mockUser';
import { placeBet, settleGame } from '../lib/api';

const REELS_COUNT = 3;
const SPIN_DURATION = 1500; // وقت دوران البكرات بالملي ثانية
const REEL_ANIM_DURATION = 100; // وقت الأنيميشن المتكرر داخل البكرة

// تعريف الرموز (Symbols) وقيمتها
const SYMBOLS = [
  { id: 'crown', char: '👑', weight: 1, payout: 100 }, // التيجان (نادرة جداً)
  { id: 'seven', char: '7️⃣', weight: 3, payout: 50 },  // الـ 7
  { id: 'gem', char: '💎', weight: 6, payout: 20 },   // الجوهرة
  { id: 'lemon', char: '🍋', weight: 12, payout: 5 },  // الليمون
  { id: 'cherry', char: '🍒', weight: 18, payout: 2 }, // الكرز (الأكثر شيوعاً)
];

// إنشاء مصفوفة موسعة للرموز بناءً على الـ weight عشان عشوائية أصدق
const EXPANDED_SYMBOLS = SYMBOLS.flatMap(sym => Array(sym.weight).fill(sym));

function formatMoney(val) {
  if (val <= 0) return '0.00';
  if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// دالة لاختيار رمز عشوائي
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

  // حالة البكرات الحالية
  const [reels, setReels] = useState([getRandomSymbol(), getRandomSymbol(), getRandomSymbol()]);

  // refs للتعامل مع الـ Animation
  const reelRefs = useRef([]);
  const animIntervals = useRef([]);

  // حساب أفضل فوز ممكن (التيجان)
  const maxPayoutFactor = Math.max(...SYMBOLS.map(s => s.payout));
  const potentialBest = useMemo(() => {
    return Math.floor((Number(bet) || 0) * maxPayoutFactor);
  }, [bet]);

  // دالة لمضاعفة أو تقسيم الرهان
  function multiplyBet() { setBet(String((Number(bet) || 0) * 2)); }
  function divideBet() {
    const newBet = (Number(bet) || 0) / 2;
    setBet(String(newBet < 1 ? 1 : newBet));
  }

  // دالة الـ Spin الأساسية (السحب من الذراع)
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
    setActiveRoundId(null);

    // 1. استدعاء API الـ placeBet
    const betRes = await placeBet(
      mockDiscordUser,
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
    setActiveRoundId(currentRoundId);

    // 2. تفعيل أنيميشن دوران البكرات (CSS Keyframes)
    reelRefs.current.forEach((ref, i) => {
      // إيقاف أي أنيميشن سابق وإعطاؤه وقت قليل للراحة
      if (ref) {
        ref.style.animation = 'none';
        void ref.offsetHeight; // Force reflow
        ref.style.animation = `slotsReelSpin ${REEL_ANIM_DURATION}ms linear infinite`;
      }
    });

    // 3. اختيار النتيجة عشوائياً (الـ Reels النهائية)
    const resultReels = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];

    // 4. الانتظار لوقت الدوران (SPIN_DURATION)
    await new Promise(resolve => setTimeout(resolve, SPIN_DURATION));

    // 5. إيقاف أنيميشن البكرات (تدريجياً من اليسار لليمين)
    for (let i = 0; i < REELS_COUNT; i++) {
      if (reelRefs.current[i]) {
        // الانتظار قليلاً قبل إيقاف البكرة التالية عشان الترتيب
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // إيقاف الـ Animation وتثبيت النتيجة النهائية
        reelRefs.current[i].style.animation = 'none';
        setReels(prev => {
          const next = [...prev];
          next[i] = resultReels[i];
          return next;
        });
      }
    }

    setSpinning(false);

    // 6. التحقق من النتيجة وحساب الـ payout
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

    // 7. استدعاء API الـ settleGame
    const settleRes = await settleGame(
      mockDiscordUser,
      currentRoundId,
      payout,
      'slots',
      'slots spin payout',
      { multiplier: allSame ? finalSymbols[0].payout : 0 },
      win ? 'win' : 'loss'
    );

    setBusy(false);
    setActiveRoundId(null);

    if (!settleRes.ok) {
      setMessage(settleRes.error || 'Failed to settle payout');
      return;
    }

    // 8. تحديث الـ UI بالنتيجة
    if (win) {
      const winner = finalSymbols[0];
      setMessage(`Jackpot! x${winner.payout} Profit! ${winner.char}${winner.char}${winner.char} payout: $${formatMoney(payout)}`);
    } else {
      setMessage('Unlucky. Better luck next time!');
    }

    setHistory(prev => [{ payout, profit, reels: finalSymbols, id: currentRoundId }, ...prev].slice(0, 8));
  }

  return (
    <PageShell title="Slot Machine">
      <style>{`
        /* أنيميشن دوران البكرة السريع */
        @keyframes slotsReelSpin {
          0% { transform: translateY(-5px); }
          50% { transform: translateY(5px); }
          100% { transform: translateY(-5px); }
        }
        
        /* أنيميشن حركة الذراع (الـ Lever) */
        @keyframes slotsLeverPull {
          0% { transform: scaleY(1); }
          50% { transform: scaleY(0.4) translateY(30px); }
          100% { transform: scaleY(1); }
        }

        .reel-symbol {
          font-size: 70px;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          position: relative;
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
            {busy ? 'Busy...' : 'Pull Lever (Spin)'}
          </button>

          <div style={{ marginTop: 18, background: '#132634', borderRadius: 18, padding: 16, border: '1px solid rgba(255,255,255,0.05)', lineHeight: 1.9 }}>
            <div style={statRow}><span style={statLabel}>Current Bet</span><span style={statValue}>${formatMoney(Number(bet) || 0)}</span></div>
            <div style={statRow}><span style={statLabel}>Max Possible Payout</span><span style={{ ...statValue, color: '#00e701' }}>${formatMoney(potentialBest)}</span></div>
            <div style={statRow}><span style={statLabel}>Winning Combos</span><span style={statValue}>{SYMBOLS.length}</span></div>
          </div>

          <div style={{ marginTop: 16, color: '#b1bad3', minHeight: 24, lineHeight: 1.6 }}>{message}</div>

          {/* Paytable (شروط الفوز) */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Paytable</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {SYMBOLS.map(sym => (
                <div key={sym.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#132634', padding: 10, borderRadius: 14, border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: 24 }}>{sym.char}{sym.char}{sym.char}</div>
                  <div style={{ fontWeight: 800 }}>x{sym.payout}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Board Section */}
        <div style={{ background: '#1a2c38', borderRadius: 24, padding: 24, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <SummaryItem label="Current Symbol" value={busy ? "?" : reels.map(r => r.char).join(' ')} />
            <SummaryItem label="Multiplier" value={busy ? "x?" : SYMBOLS.some(s => reels.every(r => r.id === s.id)) ? `x${reels[0].payout}` : "x0"} accent={busy ? "white" : reels.every(r => r.id === reels[0].id) ? "#00e701" : "white"} />
            <SummaryItem label="Potential Payout" value={`$${formatMoney(potentialBest)}`} />
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f212e', borderRadius: 22, border: '1px solid rgba(255,255,255,0.05)', padding: '40px 60px', position: 'relative', overflow: 'hidden' }}>
            
            {/* Slot Machine UI */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${REELS_COUNT}, 1fr)`, gap: 15, width: '100%', maxWidth: 500, height: 180, position: 'relative', zIndex: 10 }}>
              {reels.map((symbol, i) => (
                <div
                  key={i}
                  style={{
                    background: 'white',
                    borderRadius: 14,
                    boxShadow: '0 10px 20px rgba(0,0,0,0.15), inset 0 0 10px rgba(0,0,0,0.05)',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    ref={el => reelRefs.current[i] = el}
                    className="reel-symbol"
                    style={{ transform: 'translateY(0)' }}
                  >
                    {symbol.char}
                  </div>
                </div>
              ))}
            </div>

            {/* الذراع الأحمر (Lever) */}
            <div
              style={{
                position: 'absolute',
                right: -25,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 60,
                height: 180,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: busy ? 'default' : 'pointer',
                zIndex: 5
              }}
              onClick={pullLever}
            >
              <div
                style={{
                  width: 16,
                  height: 140,
                  background: '#2f4553',
                  borderRadius: 8,
                  position: 'relative',
                  transformOrigin: 'top center',
                  animation: spinning ? 'slotsLeverPull 400ms ease-in-out' : 'none'
                }}
              >
                {/* الكرة الحمراء في أعلى الذراع */}
                <div
                  style={{
                    position: 'absolute',
                    top: -25,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 50,
                    height: 50,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle at 35% 35%, #ff4d4d, #b31c1c 80%)',
                    boxShadow: '0 5px 15px rgba(179,28,28,0.4)',
                    border: '3px solid #0f212e'
                  }}
                />
              </div>
            </div>

          </div>
          
          <div style={{ marginTop: 24, textAlign: 'center', color: '#b1bad3' }}>
            Pull the red lever to start the spin! Match three of a kind in the reels to win.
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