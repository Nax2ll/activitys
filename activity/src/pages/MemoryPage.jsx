import { useState, useMemo, useEffect, useRef } from 'react';
import PageShell from '../components/PageShell';
import { placeBet, settleGame } from '../lib/api';

const PAIRS_COUNT = 10;
const MEMORIZE_TIME = 10; // 10 ثوانٍ للحفظ
const MAX_MISTAKES = 3;
const PAYOUT_MULTIPLIER = 5; // مضاعف الفوز 5 أضعاف!

// الأشكال المستخدمة في اللعبة
const SYMBOLS = ['🍎', '👑', '🐪', '💎', '🍒', '🍋', '🔔', '🍉', '🍇', '🌟'];

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

// دالة لخلط المصفوفة (Random Shuffle)
function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

export default function MemoryPage() {
  const [bet, setBet] = useState('10');
  const [phase, setPhase] = useState('idle'); // 'idle' | 'memorize' | 'playing' | 'finished'
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Place your bet and test your memory!');
  const [history, setHistory] = useState([]);
  
  // Game States
  const [roundId, setRoundId] = useState(null);
  const [cards, setCards] = useState([]);
  const [flippedIndices, setFlippedIndices] = useState([]); // البطاقات المقلوبة حالياً (بحد أقصى 2)
  const [matchedPairs, setMatchedPairs] = useState(0); // عدد الأزواج المتطابقة
  const [mistakes, setMistakes] = useState(0); // عدد الأخطاء
  const [timeLeft, setTimeLeft] = useState(MEMORIZE_TIME); // عداد وقت الحفظ

  const potentialPayout = useMemo(() => {
    return Math.floor((Number(bet) || 0) * PAYOUT_MULTIPLIER);
  }, [bet]);

  function multiplyBet() { setBet(String((Number(bet) || 0) * 2)); }
  function divideBet() {
    const newBet = (Number(bet) || 0) / 2;
    setBet(String(newBet < 1 ? 1 : newBet));
  }

  // عداد الحفظ (10 ثوانٍ)
  useEffect(() => {
    let timer;
    if (phase === 'memorize' && timeLeft > 0) {
      timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (phase === 'memorize' && timeLeft === 0) {
      // انتهى وقت الحفظ، اخفِ البطاقات وابدأ اللعب
      setPhase('playing');
      setMessage('Find all the matching pairs!');
    }
    return () => clearTimeout(timer);
  }, [phase, timeLeft]);

  // دالة بدء اللعبة
  async function startGame() {
    if (busy || phase === 'memorize' || phase === 'playing') return;

    const amount = Number(bet);
    if (!amount || amount <= 0) {
      setMessage('Enter a valid bet amount.');
      return;
    }

    setBusy(true);
    setMessage('Placing bet...');

    // 1. استدعاء الـ API لسحب الرصيد
    const betRes = await placeBet(
      undefined,
      amount,
      'memory',
      'memory game bet',
      { cards: PAIRS_COUNT * 2 }
    );

    if (!betRes.ok) {
      setBusy(false);
      setMessage(betRes.error || 'Bet failed');
      return;
    }

    emitBalanceUpdated(betRes.balance);
    setRoundId(betRes.roundId);

    // 2. تجهيز البطاقات (دبلجة الرموز وخلطها)
    const deck = [...SYMBOLS, ...SYMBOLS];
    const shuffledDeck = shuffleArray(deck).map((symbol, index) => ({
      id: index,
      symbol,
      isMatched: false
    }));

    setCards(shuffledDeck);
    setMatchedPairs(0);
    setMistakes(0);
    setFlippedIndices([]);
    setTimeLeft(MEMORIZE_TIME);
    setPhase('memorize');
    setMessage(`Memorize the cards! (${MEMORIZE_TIME}s remaining)`);
    setBusy(false);
  }

  // دالة النقر على البطاقة
  async function handleCardClick(index) {
    if (phase !== 'playing' || busy) return;
    if (flippedIndices.length === 2) return; // منع النقر إذا كان فيه بطاقتين مكشوفة
    if (flippedIndices.includes(index) || cards[index].isMatched) return; // منع النقر على نفس البطاقة أو بطاقة مطابقة

    const newFlipped = [...flippedIndices, index];
    setFlippedIndices(newFlipped);

    // إذا كشف بطاقتين، نتحقق من التطابق
    if (newFlipped.length === 2) {
      setBusy(true); // نوقف النقر مؤقتاً
      
      const firstIndex = newFlipped[0];
      const secondIndex = newFlipped[1];
      const isMatch = cards[firstIndex].symbol === cards[secondIndex].symbol;

      if (isMatch) {
        // تطابق صحيح
        setTimeout(async () => {
          const newCards = [...cards];
          newCards[firstIndex].isMatched = true;
          newCards[secondIndex].isMatched = true;
          setCards(newCards);
          setFlippedIndices([]);
          setBusy(false);

          const newMatchedCount = matchedPairs + 1;
          setMatchedPairs(newMatchedCount);

          // التحقق من الفوز (اكتشف كل الأزواج)
          if (newMatchedCount === PAIRS_COUNT) {
            await finishGame(true, mistakes);
          }
        }, 500); // تأخير بسيط للأنيميشن
      } else {
        // خطأ (عدم تطابق)
        setTimeout(async () => {
          const newMistakes = mistakes + 1;
          setMistakes(newMistakes);
          setFlippedIndices([]); // إخفاء البطاقتين
          setBusy(false);

          // التحقق من الخسارة (3 أخطاء)
          if (newMistakes >= MAX_MISTAKES) {
            await finishGame(false, newMistakes);
          }
        }, 1000); // انتظار ثانية عشان يشوف اللاعب وش كانت البطاقة
      }
    }
  }

  // دالة إنهاء اللعبة (فوز أو خسارة)
  async function finishGame(isWin, totalMistakes) {
    setBusy(true);
    setPhase('settling');
    setMessage('Settling game...');

    const amount = Number(bet);
    const payout = isWin ? amount * PAYOUT_MULTIPLIER : 0;

    const settleRes = await settleGame(
      undefined,
      roundId,
      payout,
      'memory',
      `memory game finished. win: ${isWin}, mistakes: ${totalMistakes}`,
      { win: isWin, mistakes: totalMistakes, multiplier: isWin ? PAYOUT_MULTIPLIER : 0 },
      isWin ? 'win' : 'loss'
    );

    if (!settleRes.ok) {
      setBusy(false);
      setMessage(settleRes.error || 'Failed to settle payout');
      return;
    }

    emitBalanceUpdated(settleRes.balance);
    setPhase('finished');
    setRoundId(null);
    setBusy(false);

    if (isWin) {
      setMessage(`🎉 PERFECT MEMORY! You won $${formatMoney(payout)}!`);
    } else {
      setMessage(`💀 Game Over! You made ${MAX_MISTAKES} mistakes.`);
      // نكشف كل البطاقات كنوع من حسرة اللاعب
      const revealedCards = cards.map(c => ({ ...c, isMatched: true }));
      setCards(revealedCards);
    }

    setHistory(prev => [{
      won: isWin,
      payout,
      mistakes: totalMistakes,
      id: Math.random()
    }, ...prev].slice(0, 5));
  }

  // رسم القلوب (عدد الأخطاء المتبقية)
  const lives = [];
  for (let i = 0; i < MAX_MISTAKES; i++) {
    lives.push(i < (MAX_MISTAKES - mistakes) ? '❤️' : '🖤');
  }

  return (
    <PageShell title="Memory Gamble">
      <style>{`
        .memory-card {
          perspective: 1000px;
          cursor: pointer;
          aspect-ratio: 1 / 1.1;
          width: 100%;
        }
        .memory-card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transition: transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1);
          transform-style: preserve-3d;
        }
        /* إذا كانت البطاقة مكشوفة أو مطابقة، نقلبها */
        .memory-card.flipped .memory-card-inner {
          transform: rotateY(180deg);
        }
        .memory-card-front, .memory-card-back {
          position: absolute;
          width: 100%;
          height: 100%;
          backface-visibility: hidden;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 38px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        }
        /* الوجه المخفي للبطاقة (علامة استفهام أو لوقو) */
        .memory-card-front {
          background: linear-gradient(135deg, #233847 0%, #1a2c38 100%);
          border: 2px solid rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.1);
        }
        .memory-card-front:hover {
          background: #2a4152;
        }
        /* الوجه المكشوف (الرمز) */
        .memory-card-back {
          background: #0f212e;
          transform: rotateY(180deg);
          border: 2px solid #334f66;
        }
        /* إذا طابقت، نعطيها إطار أخضر */
        .memory-card.matched .memory-card-back {
          border-color: #00e701;
          box-shadow: 0 0 15px rgba(0,231,1,0.2);
          opacity: 0.8;
        }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: '390px 1fr', gap: 24 }}>
        
        {/* Controls Section */}
        <div style={{ background: '#1a2c38', borderRadius: 24, padding: 20, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 24, fontWeight: 900 }}>Manual</div>
            <div style={{ color: phase === 'idle' || phase === 'finished' ? '#b1bad3' : (phase === 'memorize' ? '#ff9800' : '#00e701'), fontSize: 12, fontWeight: 800 }}>
              {phase === 'idle' && 'READY'}
              {phase === 'memorize' && 'MEMORIZING'}
              {phase === 'playing' && 'PLAYING'}
              {phase === 'settling' && 'SETTLING'}
              {phase === 'finished' && 'FINISHED'}
            </div>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>Bet Amount</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <input type="number" min="1" value={bet} onChange={(e) => setBet(e.target.value)} disabled={phase !== 'idle' && phase !== 'finished'} style={{ ...inputStyle, flex: 1, opacity: (phase !== 'idle' && phase !== 'finished') ? 0.6 : 1 }} />
            <button onClick={divideBet} disabled={phase !== 'idle' && phase !== 'finished'} style={actionBtn}>1/2</button>
            <button onClick={multiplyBet} disabled={phase !== 'idle' && phase !== 'finished'} style={actionBtn}>2x</button>
          </div>

          {(phase === 'idle' || phase === 'finished') ? (
            <button
              onClick={startGame}
              disabled={busy}
              style={{ ...primaryBtn, opacity: busy ? 0.65 : 1 }}
              onMouseDown={(e) => !busy && (e.currentTarget.style.transform = 'scale(0.97)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {busy ? 'Starting...' : 'Start Game'}
            </button>
          ) : (
            <div style={{ background: '#132634', padding: 16, borderRadius: 16, border: '1px solid #334f66', textAlign: 'center' }}>
              <div style={{ color: 'white', fontWeight: 800, fontSize: 18 }}>
                Lives: {lives.join(' ')}
              </div>
              <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 6 }}>
                {MAX_MISTAKES - mistakes} mistakes left before Game Over
              </div>
            </div>
          )}

          <div style={{ marginTop: 18, background: '#132634', borderRadius: 18, padding: 16, border: '1px solid rgba(255,255,255,0.05)', lineHeight: 1.9 }}>
            <div style={statRow}><span style={statLabel}>Cards</span><span style={statValue}>{PAIRS_COUNT * 2}</span></div>
            <div style={statRow}><span style={statLabel}>Multiplier</span><span style={{ ...statValue, color: '#00e701' }}>x{PAYOUT_MULTIPLIER}</span></div>
            <div style={statRow}><span style={statLabel}>Potential Payout</span><span style={statValue}>${formatMoney(potentialPayout)}</span></div>
          </div>

          <div style={{ marginTop: 16, color: '#b1bad3', minHeight: 48, lineHeight: 1.6, fontWeight: 600 }}>{message}</div>

          {/* History */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Last Results</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {history.length === 0 ? (
                <div style={{ background: '#132634', borderRadius: 14, padding: 14, color: '#b1bad3' }}>No games yet.</div>
              ) : (
                history.map((item, index) => (
                  <div key={index} style={{ background: '#132634', borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, color: item.won ? '#00e701' : '#ff4d4d' }}>
                        {item.won ? 'Win' : 'Loss'}
                      </div>
                      <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 4 }}>
                        Mistakes: {item.mistakes}
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

        {/* Board Section */}
        <div style={{ background: '#1a2c38', borderRadius: 24, padding: 24, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <SummaryItem label="Pairs Found" value={`${matchedPairs} / ${PAIRS_COUNT}`} accent={matchedPairs === PAIRS_COUNT ? '#00e701' : 'white'} />
            <SummaryItem label="Time Left" value={phase === 'memorize' ? `${timeLeft}s` : '-'} accent={phase === 'memorize' ? '#ff9800' : 'white'} />
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f212e', borderRadius: 22, border: '1px solid rgba(255,255,255,0.05)', padding: '30px', position: 'relative' }}>
            
            {phase === 'idle' && cards.length === 0 && (
              <div style={{ textAlign: 'center', color: '#b1bad3' }}>
                <div style={{ fontSize: 60, opacity: 0.2, marginBottom: 10 }}>🧠</div>
                <h2>Memory Gamble</h2>
                <p>Find all 10 pairs without making 3 mistakes.</p>
              </div>
            )}

            {(phase !== 'idle' || cards.length > 0) && (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(5, 1fr)', // 5 أعمدة
                gridTemplateRows: 'repeat(4, 1fr)',    // 4 صفوف = 20 بطاقة
                gap: 12, 
                width: '100%', 
                maxWidth: 550 
              }}>
                {cards.map((card, index) => {
                  // متى نكشف البطاقة؟ (في وقت الحفظ، أو إذا كانت متطابقة، أو إذا تم النقر عليها الآن)
                  const isFlipped = phase === 'memorize' || card.isMatched || flippedIndices.includes(index);
                  
                  return (
                    <div 
                      key={index}
                      className={`memory-card ${isFlipped ? 'flipped' : ''} ${card.isMatched ? 'matched' : ''}`}
                      onClick={() => handleCardClick(index)}
                    >
                      <div className="memory-card-inner">
                        <div className="memory-card-front">
                          ❓
                        </div>
                        <div className="memory-card-back">
                          {card.symbol}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Overlay during memorize phase */}
            {phase === 'memorize' && (
              <div style={{
                position: 'absolute',
                top: 20,
                background: 'rgba(0,0,0,0.7)',
                padding: '10px 30px',
                borderRadius: 50,
                color: '#ff9800',
                fontWeight: 900,
                fontSize: 24,
                border: '2px solid #ff9800',
                backdropFilter: 'blur(5px)',
                zIndex: 10
              }}>
                MEMORIZE: {timeLeft}s
              </div>
            )}

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