import { useState, useMemo, useRef } from 'react';
import PageShell from '../components/PageShell';
import { placeBet, settleGame } from '../lib/api';

const CAMEL_COUNT = 5;
const PAYOUT_MULTIPLIER = 4.8; // مضاعف الفوز (قريب من 5 للحفاظ على حافة الكازينو)
const TRACK_FINISH_LINE = 85; // خط النهاية عند 85% من الشاشة عشان يوقف الجمل بشكل حلو

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
    window.dispatchEvent(
      new CustomEvent('casino:balance-updated', {
        detail: { balance }
      })
    );
  }
}

// دالة للنوم (تأخير)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function CamelRacingPage() {
  const [bet, setBet] = useState('10');
  const [selectedCamel, setSelectedCamel] = useState(1); // الجمل المختار (1 إلى 5)
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('idle'); // 'idle' | 'racing' | 'finished'
  const [message, setMessage] = useState('Pick your camel and start the race!');
  const [history, setHistory] = useState([]);
  const [roundId, setRoundId] = useState(null);

  // مواقع النياق في المسار (من 0 إلى 100)
  const [positions, setPositions] = useState(Array(CAMEL_COUNT).fill(0));
  const [winner, setWinner] = useState(null);

  const potentialPayout = useMemo(() => {
    return Math.floor((Number(bet) || 0) * PAYOUT_MULTIPLIER);
  }, [bet]);

  function multiplyBet() { setBet(String((Number(bet) || 0) * 2)); }
  function divideBet() {
    const newBet = (Number(bet) || 0) / 2;
    setBet(String(newBet < 1 ? 1 : newBet));
  }

  // بدء السباق
  async function startRace() {
    if (busy || phase === 'racing') return;

    const amount = Number(bet);
    if (!amount || amount <= 0) {
      setMessage('Enter a valid bet amount.');
      return;
    }

    setBusy(true);
    setPhase('idle');
    setMessage('Placing bet and lining up camels...');
    setPositions(Array(CAMEL_COUNT).fill(0));
    setWinner(null);
    setRoundId(null);

    // 1. استدعاء API الـ placeBet
    const betRes = await placeBet(
      undefined,
      amount,
      'camel_racing',
      'camel racing bet',
      { selectedCamel }
    );

    if (!betRes.ok) {
      setBusy(false);
      setMessage(betRes.error || 'Bet failed');
      return;
    }

    emitBalanceUpdated(betRes.balance);
    const currentRoundId = betRes.roundId;
    setRoundId(currentRoundId);

    setPhase('racing');
    setMessage('And they are off! 🐪💨');

    // 2. محاكاة السباق بشكل مسبق لضمان نتيجة دقيقة بدون أخطاء تزامن
    let currentPos = Array(CAMEL_COUNT).fill(0);
    const frames = [];
    let raceWinnerIndex = -1;

    while (true) {
      // تحريك كل جمل بسرعة عشوائية مختلفة في كل إطار
      currentPos = currentPos.map(p => p + (Math.random() * 1.5 + 0.3));
      frames.push([...currentPos]);

      const maxPos = Math.max(...currentPos);
      if (maxPos >= TRACK_FINISH_LINE) {
        raceWinnerIndex = currentPos.findIndex(p => p === maxPos);
        break;
      }
    }

    // 3. تشغيل إطارات الأنيميشن بسلاسة
    for (const frame of frames) {
      setPositions(frame);
      await sleep(40); // 40ms للإطار = حركة سلسة جداً
    }

    // 4. إعلان الفائز
    const actualWinnerCamel = raceWinnerIndex + 1; // الاندكس يبدأ من 0، والنياق من 1
    const actualWinnerName = CAMEL_COLORS[raceWinnerIndex].name;
    setWinner(actualWinnerCamel);
    setPhase('finished');

    const isWin = selectedCamel === actualWinnerCamel;
    const payout = isWin ? amount * PAYOUT_MULTIPLIER : 0;
    const profit = payout - amount;

    setMessage('Settling race results...');

    // 5. استدعاء API الـ settleGame
    const settleRes = await settleGame(
      undefined,
      currentRoundId,
      payout,
      'camel_racing',
      `camel racing payout. Winner: ${actualWinnerName}`,
      { selectedCamel, winner: actualWinnerCamel, multiplier: isWin ? PAYOUT_MULTIPLIER : 0 },
      isWin ? 'win' : 'loss'
    );

    setBusy(false);
    setRoundId(null);

    if (!settleRes.ok) {
      setMessage(settleRes.error || 'Failed to settle payout');
      return;
    }

    emitBalanceUpdated(settleRes.balance);

    if (isWin) {
      setMessage(`🎉 ${actualWinnerName} won! You bagged $${formatMoney(payout)}!`);
    } else {
      setMessage(`❌ ${actualWinnerName} took the lead. Better luck next race!`);
    }

    // تحديث السجل إلى 3 نتائج فقط
    setHistory(prev => [{
      selected: selectedCamel,
      winner: actualWinnerCamel,
      won: isWin,
      payout,
      id: currentRoundId
    }, ...prev].slice(0, 3));
  }

  return (
    <PageShell title="Camel Racing">
      <style>{`
        /* أنيميشن الركض (ارتداد الجمل للأعلى والأسفل) */
        @keyframes gallop {
          0% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-4px) rotate(-3deg); }
          50% { transform: translateY(0) rotate(0deg); }
          75% { transform: translateY(-2px) rotate(3deg); }
          100% { transform: translateY(0) rotate(0deg); }
        }

        .camel-icon {
          font-size: 38px;
          position: absolute;
          top: 50%;
          margin-top: -24px; /* لضبط المركز */
          transition: left 40ms linear; /* حركة خطية سلسة */
          z-index: 10;
          filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4));
        }

        /* تفعيل الأنيميشن فقط أثناء الركض */
        .racing-anim {
          animation: gallop 0.4s infinite linear;
        }

        .track-lane {
          position: relative;
          height: 56px;
          background: #132634;
          border-radius: 12px;
          margin-bottom: 12px;
          border-bottom: 3px solid rgba(0,0,0,0.2);
          overflow: hidden;
          box-shadow: inset 0 2px 10px rgba(0,0,0,0.3);
        }

        /* خط النهاية */
        .finish-line {
          position: absolute;
          left: ${TRACK_FINISH_LINE}%;
          top: 0;
          bottom: 0;
          width: 8px;
          background: repeating-linear-gradient(
            0deg,
            #ffffff,
            #ffffff 8px,
            #000000 8px,
            #000000 16px
          );
          box-shadow: -2px 0 10px rgba(0,0,0,0.5);
          z-index: 5;
        }

        /* غبار الركض */
        .dust-trail {
          position: absolute;
          top: 60%;
          width: 30px;
          height: 10px;
          background: rgba(194, 160, 119, 0.4);
          border-radius: 50%;
          filter: blur(4px);
          z-index: 1;
          transition: left 40ms linear;
        }
      `}</style>
      
      <div style={{ display: 'grid', gridTemplateColumns: '390px 1fr', gap: 24 }}>
        
        {/* قسم التحكم (الرهان واختيار الجمل) */}
        <div style={{ background: '#1a2c38', borderRadius: 24, padding: 20, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 24, fontWeight: 900 }}>Race Book</div>
            <div style={{ color: phase === 'racing' ? '#ff9800' : '#00e701', fontSize: 12, fontWeight: 800 }}>
              {phase === 'racing' ? 'RACING' : 'READY'}
            </div>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>Bet Amount</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <input type="number" min="1" value={bet} onChange={(e) => setBet(e.target.value)} disabled={busy || phase === 'racing'} style={{ ...inputStyle, flex: 1, opacity: (busy || phase === 'racing') ? 0.6 : 1 }} />
            <button onClick={divideBet} disabled={busy || phase === 'racing'} style={actionBtn}>1/2</button>
            <button onClick={multiplyBet} disabled={busy || phase === 'racing'} style={actionBtn}>2x</button>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>Select Your Camel</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 18 }}>
            {CAMEL_COLORS.map(camel => (
              <div 
                key={camel.id}
                onClick={() => !busy && phase !== 'racing' && setSelectedCamel(camel.id)}
                style={{
                  background: selectedCamel === camel.id ? camel.color : '#132634',
                  border: `2px solid ${camel.color}`,
                  color: selectedCamel === camel.id ? '#fff' : camel.color,
                  borderRadius: 12,
                  padding: '10px 0',
                  textAlign: 'center',
                  fontWeight: 900,
                  fontSize: 18,
                  cursor: busy || phase === 'racing' ? 'default' : 'pointer',
                  opacity: (busy || phase === 'racing') && selectedCamel !== camel.id ? 0.4 : 1,
                  boxShadow: selectedCamel === camel.id ? `0 4px 15px ${camel.color}60` : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                {camel.id}
              </div>
            ))}
          </div>

          <button
            onClick={startRace}
            disabled={busy || phase === 'racing'}
            style={{ ...primaryBtn, opacity: busy || phase === 'racing' ? 0.65 : 1 }}
            onMouseDown={(e) => !busy && phase !== 'racing' && (e.currentTarget.style.transform = 'scale(0.97)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {busy || phase === 'racing' ? 'Race in progress...' : 'Start Race'}
          </button>

          <div style={{ marginTop: 18, background: '#132634', borderRadius: 18, padding: 16, border: '1px solid rgba(255,255,255,0.05)', lineHeight: 1.9 }}>
            <div style={statRow}><span style={statLabel}>Multiplier</span><span style={{ ...statValue, color: '#00e701' }}>x{PAYOUT_MULTIPLIER}</span></div>
            <div style={statRow}><span style={statLabel}>Potential Payout</span><span style={statValue}>${formatMoney(potentialPayout)}</span></div>
          </div>

          <div style={{ marginTop: 16, color: '#b1bad3', minHeight: 48, lineHeight: 1.6, fontWeight: 600 }}>{message}</div>

          {/* سجل النتائج */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Last Races</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {history.length === 0 ? (
                <div style={{ background: '#132634', borderRadius: 14, padding: 14, color: '#b1bad3' }}>No races yet.</div>
              ) : (
                history.map((item, index) => (
                  <div key={index} style={{ background: '#132634', borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, color: item.won ? '#00e701' : '#ff4d4d' }}>
                        {item.won ? 'Win!' : 'Loss'}
                      </div>
                      <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 4 }}>
                        Picked: {CAMEL_COLORS[item.selected - 1].name} | Winner: {CAMEL_COLORS[item.winner - 1].name}
                      </div>
                    </div>
                    <div style={{ fontWeight: 900, color: item.won ? '#00e701' : 'white' }}>
                      ${formatMoney(item.payout)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* قسم حلبة السباق (Race Track) */}
        <div style={{ background: '#1a2c38', borderRadius: 24, padding: 24, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {/* استخدام الاسم العربي بدلاً من الرقم */}
            <SummaryItem label="Your Camel" value={CAMEL_COLORS[selectedCamel-1].name} accent={CAMEL_COLORS[selectedCamel-1].color} />
            <SummaryItem label="Winner" value={winner ? CAMEL_COLORS[winner-1].name : '-'} accent={winner ? CAMEL_COLORS[winner-1].color : 'white'} />
          </div>

          <div style={{ flex: 1, background: '#0f212e', borderRadius: 22, border: '1px solid rgba(255,255,255,0.05)', padding: '20px', position: 'relative' }}>
            
            {/* عنوان المسار */}
            <div style={{ textAlign: 'center', marginBottom: 15, color: '#b1bad3', fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', fontSize: 14 }}>
              Desert Derby
            </div>

            {/* المسارات */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {CAMEL_COLORS.map((camel, index) => {
                const pos = positions[index];
                const isRacing = phase === 'racing';
                const isWinner = winner === camel.id;

                return (
                  <div key={camel.id} className="track-lane">
                    {/* رقم المسار واسم الجمل */}
                    <div style={{ 
                      position: 'absolute', 
                      left: 10, 
                      top: '50%', 
                      transform: 'translateY(-50%)', 
                      zIndex: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      opacity: 0.3
                    }}>
                      <div style={{ background: camel.color, width: 24, height: 24, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14 }}>
                        {camel.id}
                      </div>
                      <span style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>{camel.name}</span>
                    </div>

                    <div className="finish-line" />

                    {/* غبار الجمل */}
                    {pos > 2 && (
                      <div 
                        className="dust-trail" 
                        style={{ left: `calc(${pos}% - 25px)`, opacity: isRacing ? 1 : 0 }} 
                      />
                    )}

                    {/* أيقونة الجمل */}
                    <div 
                      className={`camel-icon ${isRacing ? 'racing-anim' : ''}`}
                      style={{ 
                        left: `${pos}%`, 
                        // تمييز الجمل الفائز بتوهج خفيف
                        filter: isWinner ? `drop-shadow(0 0 10px ${camel.color})` : 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))'
                      }}
                    >
                      🐪
                      {/* طاقية/مؤشر يوضح لون الجمل فوق ظهره */}
                      <div style={{
                        position: 'absolute',
                        top: -5,
                        left: 15,
                        width: 12,
                        height: 12,
                        background: camel.color,
                        border: '2px solid #fff',
                        borderRadius: '50%',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.5)'
                      }} />
                    </div>

                    {/* تأثير تتويج الفائز في نهاية المسار */}
                    {isWinner && phase === 'finished' && (
                      <div style={{
                        position: 'absolute',
                        left: `calc(${pos}% + 45px)`,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: 24,
                        animation: 'gallop 1s infinite ease-in-out'
                      }}>
                        🏆
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ديكورات رملية (اختياري أسفل الحلبة) */}
            <div style={{ height: 10, marginTop: 15, background: 'linear-gradient(90deg, transparent, rgba(194, 160, 119, 0.2), transparent)' }} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}

// مكونات الواجهة المتكررة
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
