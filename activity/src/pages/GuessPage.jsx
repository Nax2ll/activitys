import { useState, useMemo, useEffect } from 'react';
import PageShell from '../components/PageShell';
import { placeBet, settleGame, getBalance } from '../lib/api';

const MIN_NUMBER = 0;
const MAX_NUMBER = 100;
const MAX_GUESSES = 5;
const PAYOUT_MULTIPLIER = 10;
const MOBILE_BREAKPOINT = 820;

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

export default function GuessPage() {
  const [bet, setBet] = useState('10');
  const [userBalance, setUserBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [message, setMessage] = useState('Place your bet and start guessing!');
  const [history, setHistory] = useState([]);
  const [roundId, setRoundId] = useState(null);
  const [secretNumber, setSecretNumber] = useState(null);
  const [guesses, setGuesses] = useState([]);
  const [currentGuess, setCurrentGuess] = useState('');
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

  const currentRange = useMemo(() => {
    let min = MIN_NUMBER;
    let max = MAX_NUMBER;
    guesses.forEach(g => {
      if (g.hint === 'higher' && g.value >= min) min = g.value + 1;
      if (g.hint === 'lower' && g.value <= max) max = g.value - 1;
    });
    return { min, max };
  }, [guesses]);

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

  async function startGame() {
    if (busy || phase === 'playing') return;
    const amount = Number(bet);
    if (!amount || amount <= 0) { setMessage('Enter a valid bet amount.'); return; }

    setBusy(true);
    setPhase('idle');
    setMessage('Placing bet...');
    setRoundId(null);
    setGuesses([]);
    setCurrentGuess('');

    const secret = Math.floor(Math.random() * (MAX_NUMBER - MIN_NUMBER + 1)) + MIN_NUMBER;
    setSecretNumber(secret);

    const betRes = await placeBet(undefined, amount, 'guess', 'number guess bet', { targetRange: `${MIN_NUMBER}-${MAX_NUMBER}` });
    if (!betRes.ok) { setBusy(false); setMessage(betRes.error || 'Bet failed'); return; }

    emitBalanceUpdated(betRes.balance);
    setRoundId(betRes.roundId);
    setPhase('playing');
    setMessage(`Guess the number between 0 and 100! (${MAX_GUESSES} Tries)`);
    setBusy(false);
  }

  async function submitGuess(e) {
    if (e) e.preventDefault();
    if (busy || phase !== 'playing') return;

    const guessVal = parseInt(currentGuess);
    if (isNaN(guessVal) || guessVal < MIN_NUMBER || guessVal > MAX_NUMBER) {
      setMessage(`Please enter a number between ${MIN_NUMBER} and ${MAX_NUMBER}.`);
      return;
    }

    setBusy(true);
    const isCorrect = guessVal === secretNumber;
    const hint = isCorrect ? 'correct' : (guessVal < secretNumber ? 'higher' : 'lower');
    
    const newGuesses = [...guesses, { value: guessVal, hint }];
    setGuesses(newGuesses);
    setCurrentGuess('');

    const isGameOver = isCorrect || newGuesses.length >= MAX_GUESSES;

    if (isGameOver) {
      const amount = Number(bet);
      const payout = isCorrect ? amount * PAYOUT_MULTIPLIER : 0;
      setMessage('Settling game...');

      const settleRes = await settleGame(undefined, roundId, payout, 'guess', `guess game finished. secret: ${secretNumber}`, { guesses: newGuesses, secret: secretNumber, won: isCorrect }, isCorrect ? 'win' : 'loss');
      if (!settleRes.ok) { setBusy(false); setMessage(settleRes.error || 'Failed to settle payout'); return; }

      emitBalanceUpdated(settleRes.balance);
      setPhase('finished');
      setRoundId(null);

      if (isCorrect) setMessage(`🎉 WOW! You guessed it right (${secretNumber}). You won $${formatMoney(payout)}!`);
      else setMessage(`❌ Out of tries! The secret number was ${secretNumber}.`);

      setHistory(prev => [{ secret: secretNumber, won: isCorrect, payout, tries: newGuesses.length }, ...prev].slice(0, 3));
    } else {
      setMessage(hint === 'higher' ? `🔼 The number is higher than ${guessVal}!` : `🔽 The number is lower than ${guessVal}!`);
    }
    setBusy(false);
  }

  return (
    <PageShell title="Number Guess">
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '390px 1fr', gap: isMobile ? 16 : 24, alignItems: 'start' }}>
        
        {/* Controls Section */}
        <div style={{ background: '#1a2c38', borderRadius: isMobile ? 20 : 24, padding: isMobile ? 16 : 20, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', minWidth: 0, order: isMobile ? 2 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 900 }}>Manual</div>
            <div style={{ color: phase === 'playing' ? '#ff9800' : '#b1bad3', fontSize: 12, fontWeight: 800 }}>{phase === 'playing' ? 'PLAYING' : 'READY'}</div>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>Bet Amount</div>
          <div style={{ marginBottom: 18 }}>
            
            {/* الصف الأول: مربع النص + أزرار الضرب والقسمة */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input 
                type="number" lang="en" dir="ltr" inputMode="decimal" min="1" 
                value={bet} 
                onChange={(e) => setBet(e.target.value)} 
                disabled={busy || phase === 'playing'} 
                style={{ ...inputStyle, marginBottom: 0, flex: 1, outline: 'none' }} 
              />
              <button onClick={() => modifyBet(0.5)} disabled={busy || phase === 'playing'} style={{ ...actionBtn, padding: '0 16px', fontSize: 15 }}>
                1/2
              </button>
              <button onClick={() => modifyBet(2)} disabled={busy || phase === 'playing'} style={{ ...actionBtn, padding: '0 16px', fontSize: 15 }}>
                2x
              </button>
            </div>

            {/* الصف الثاني: أزرار النسب (1/4, 1/2, 3/4, Full) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              <button onClick={() => setFractionBet(0.25)} disabled={busy || phase === 'playing'} style={actionBtn}>1/4</button>
              <button onClick={() => setFractionBet(0.5)} disabled={busy || phase === 'playing'} style={actionBtn}>1/2</button>
              <button onClick={() => setFractionBet(0.75)} disabled={busy || phase === 'playing'} style={actionBtn}>3/4</button>
              <button onClick={() => setFractionBet(1)} disabled={busy || phase === 'playing'} style={actionBtn}>Full</button>
            </div>
          </div>

          {phase !== 'playing' ? (
            <button onClick={startGame} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.65 : 1, fontSize: isMobile ? 15 : 16 }}>
              {busy ? 'Starting...' : 'Start Game'}
            </button>
          ) : (
            <div style={{ background: '#132634', padding: 16, borderRadius: 16, border: '1px solid #ff980040' }}>
              <div style={{ color: '#ff9800', fontWeight: 800, marginBottom: 8, textAlign: 'center' }}>Game in Progress!</div>
              <div style={{ color: '#b1bad3', fontSize: 13, textAlign: 'center' }}>Make your guesses on the board.</div>
            </div>
          )}

          <div style={{ marginTop: 18, background: '#132634', borderRadius: 18, padding: 16, border: '1px solid rgba(255,255,255,0.05)', lineHeight: 1.9 }}>
            <div style={statRow}><span style={statLabel}>Max Tries</span><span style={statValue}>{MAX_GUESSES}</span></div>
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
              ) : history.map((item, index) => (
                <div key={index} style={{ background: '#132634', borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: item.won ? '#00e701' : '#ff4d4d' }}>{item.won ? 'Win' : 'Loss'} · Secret: {item.secret}</div>
                    <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 4 }}>Guessed in {item.tries} tries</div>
                  </div>
                  <div style={{ fontWeight: 900, color: item.won ? '#00e701' : 'white' }}>${formatMoney(item.payout)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Board Section */}
        <div style={{ background: '#1a2c38', borderRadius: isMobile ? 20 : 24, padding: isMobile ? 16 : 24, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', minWidth: 0, order: isMobile ? 1 : 2 }}>
          
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <SummaryItem label="Tries Left" value={phase === 'playing' ? MAX_GUESSES - guesses.length : '-'} accent={phase === 'playing' ? '#ff9800' : 'white'} />
            <SummaryItem label="Possible Range" value={phase === 'playing' ? `${currentRange.min} - ${currentRange.max}` : `${MIN_NUMBER} - ${MAX_NUMBER}`} />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f212e', borderRadius: 22, border: '1px solid rgba(255,255,255,0.05)', padding: isMobile ? '30px 15px' : '40px 20px', minHeight: isMobile ? 300 : 'auto', position: 'relative' }}>
            
            {phase === 'idle' && (
              <div style={{ textAlign: 'center', color: '#b1bad3' }}>
                <div style={{ fontSize: isMobile ? 50 : 60, opacity: 0.2, marginBottom: 10 }}>🔢</div>
                <h2 style={{ fontSize: isMobile ? 20 : 24 }}>Ready to guess?</h2>
                <p style={{ fontSize: isMobile ? 14 : 16 }}>Place your bet and hit Start Game!</p>
              </div>
            )}

            {phase === 'finished' && (
              <div style={{ textAlign: 'center', color: guesses[guesses.length - 1]?.hint === 'correct' ? '#00e701' : '#ff4d4d' }}>
                <div style={{ fontSize: isMobile ? 60 : 70, marginBottom: 10 }}>{guesses[guesses.length - 1]?.hint === 'correct' ? '🎉' : '💀'}</div>
                <h1 style={{ fontSize: isMobile ? 40 : 48, margin: 0 }}>{secretNumber}</h1>
                <p style={{ color: '#b1bad3', marginTop: 10, fontSize: isMobile ? 16 : 18 }}>The Secret Number</p>
              </div>
            )}

            {phase === 'playing' && (
              <form onSubmit={submitGuess} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 300 }}>
                <div style={{ fontSize: isMobile ? 35 : 40, marginBottom: 20 }}>🤔</div>
                <input
                  type="number"
                  lang="en" dir="ltr" inputMode="numeric"
                  autoFocus
                  min={MIN_NUMBER}
                  max={MAX_NUMBER}
                  value={currentGuess}
                  onChange={(e) => setCurrentGuess(e.target.value)}
                  disabled={busy}
                  placeholder="Enter 0 - 100"
                  style={{ width: '100%', background: '#132634', border: '2px solid #233847', borderRadius: 16, padding: isMobile ? '16px' : '20px', fontSize: isMobile ? 26 : 32, fontWeight: 900, color: 'white', textAlign: 'center', outline: 'none', boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.2)' }}
                />
                <button type="submit" disabled={busy || currentGuess === ''} style={{ ...primaryBtn, background: '#ff9800', marginTop: 20, fontSize: isMobile ? 16 : 18, opacity: (busy || currentGuess === '') ? 0.5 : 1 }}>
                  Submit Guess
                </button>
              </form>
            )}

            {(phase === 'playing' || phase === 'finished') && guesses.length > 0 && (
              <div style={{ marginTop: 40, width: '100%', display: 'flex', justifyContent: 'center', gap: isMobile ? 10 : 15, flexWrap: 'wrap' }}>
                {guesses.map((g, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: g.hint === 'correct' ? '#00e70120' : '#132634', border: `1px solid ${g.hint === 'correct' ? '#00e701' : 'rgba(255,255,255,0.05)'}`, padding: isMobile ? '8px 14px' : '12px 20px', borderRadius: 14, minWidth: isMobile ? 60 : 80 }}>
                    <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 900, color: g.hint === 'correct' ? '#00e701' : 'white' }}>{g.value}</div>
                    <div style={{ fontSize: isMobile ? 16 : 20, marginTop: 4 }}>
                      {g.hint === 'higher' && '🔼'}{g.hint === 'lower' && '🔽'}{g.hint === 'correct' && '✅'}
                    </div>
                  </div>
                ))}
              </div>
            )}

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
