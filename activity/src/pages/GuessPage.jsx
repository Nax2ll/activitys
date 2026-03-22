import { useState, useMemo, useEffect } from 'react';
import PageShell from '../components/PageShell';
import { placeBet, settleGame } from '../lib/api';

const MIN_NUMBER = 0;
const MAX_NUMBER = 100;
const MAX_GUESSES = 3;
const PAYOUT_MULTIPLIER = 15; // مضاعف الفوز 15 ضعف الرهان!

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

export default function GuessPage() {
  const [bet, setBet] = useState('10');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('idle'); // 'idle' | 'playing' | 'finished'
  const [message, setMessage] = useState('Place your bet and start guessing!');
  const [history, setHistory] = useState([]);
  
  // Game States
  const [roundId, setRoundId] = useState(null);
  const [secretNumber, setSecretNumber] = useState(null);
  const [guesses, setGuesses] = useState([]);
  const [currentGuess, setCurrentGuess] = useState('');

  // حساب النطاق المتوقع (لمساعدة اللاعب)
  const currentRange = useMemo(() => {
    let min = MIN_NUMBER;
    let max = MAX_NUMBER;
    guesses.forEach(g => {
      if (g.hint === 'higher' && g.value >= min) min = g.value + 1;
      if (g.hint === 'lower' && g.value <= max) max = g.value - 1;
    });
    return { min, max };
  }, [guesses]);

  const potentialPayout = useMemo(() => {
    return Math.floor((Number(bet) || 0) * PAYOUT_MULTIPLIER);
  }, [bet]);

  function multiplyBet() { setBet(String((Number(bet) || 0) * 2)); }
  function divideBet() {
    const newBet = (Number(bet) || 0) / 2;
    setBet(String(newBet < 1 ? 1 : newBet));
  }

  // بدء اللعبة وسحب الرصيد
  async function startGame() {
    if (busy || phase === 'playing') return;

    const amount = Number(bet);
    if (!amount || amount <= 0) {
      setMessage('Enter a valid bet amount.');
      return;
    }

    setBusy(true);
    setMessage('Placing bet...');
    setRoundId(null);
    setGuesses([]);
    setCurrentGuess('');

    // اختيار الرقم السري
    const secret = Math.floor(Math.random() * (MAX_NUMBER - MIN_NUMBER + 1)) + MIN_NUMBER;
    setSecretNumber(secret);

    const betRes = await placeBet(
      undefined,
      amount,
      'guess',
      'number guess bet',
      { targetRange: `${MIN_NUMBER}-${MAX_NUMBER}` }
    );

    if (!betRes.ok) {
      setBusy(false);
      setMessage(betRes.error || 'Bet failed');
      return;
    }

    emitBalanceUpdated(betRes.balance);
    setRoundId(betRes.roundId);
    setPhase('playing');
    setMessage('Guess the number between 0 and 100! (3 Tries)');
    setBusy(false);
  }

  // إرسال التوقع
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

      const settleRes = await settleGame(
        undefined,
        roundId,
        payout,
        'guess',
        `guess game finished. secret: ${secretNumber}`,
        { guesses: newGuesses, secret: secretNumber, won: isCorrect },
        isCorrect ? 'win' : 'loss'
      );

      if (!settleRes.ok) {
        setBusy(false);
        setMessage(settleRes.error || 'Failed to settle payout');
        return;
      }

      emitBalanceUpdated(settleRes.balance);
      setPhase('finished');
      setRoundId(null);

      if (isCorrect) {
        setMessage(`🎉 WOW! You guessed it right (${secretNumber}). You won $${formatMoney(payout)}!`);
      } else {
        setMessage(`❌ Out of tries! The secret number was ${secretNumber}.`);
      }

      setHistory(prev => [{ 
        secret: secretNumber, 
        won: isCorrect, 
        payout, 
        tries: newGuesses.length 
      }, ...prev].slice(0, 5));
      
    } else {
      setMessage(hint === 'higher' ? `🔼 The number is higher than ${guessVal}!` : `🔽 The number is lower than ${guessVal}!`);
    }

    setBusy(false);
  }

  return (
    <PageShell title="Number Guess">
      <div style={{ display: 'grid', gridTemplateColumns: '390px 1fr', gap: 24 }}>
        
        {/* Controls Section */}
        <div style={{ background: '#1a2c38', borderRadius: 24, padding: 20, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 24, fontWeight: 900 }}>Manual</div>
            <div style={{ color: phase === 'playing' ? '#ff9800' : '#b1bad3', fontSize: 12, fontWeight: 800 }}>
              {phase === 'playing' ? 'PLAYING' : 'READY'}
            </div>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>Bet Amount</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <input type="number" min="1" value={bet} onChange={(e) => setBet(e.target.value)} disabled={busy || phase === 'playing'} style={{ ...inputStyle, flex: 1, opacity: (busy || phase === 'playing') ? 0.6 : 1 }} />
            <button onClick={divideBet} disabled={busy || phase === 'playing'} style={actionBtn}>1/2</button>
            <button onClick={multiplyBet} disabled={busy || phase === 'playing'} style={actionBtn}>2x</button>
          </div>

          {phase !== 'playing' ? (
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
            <div style={{ background: '#132634', padding: 16, borderRadius: 16, border: '1px solid #ff980040' }}>
              <div style={{ color: '#ff9800', fontWeight: 800, marginBottom: 8, textAlign: 'center' }}>Game in Progress!</div>
              <div style={{ color: '#b1bad3', fontSize: 13, textAlign: 'center' }}>Make your guesses on the right panel.</div>
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
              ) : (
                history.map((item, index) => (
                  <div key={index} style={{ background: '#132634', borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, color: item.won ? '#00e701' : '#ff4d4d' }}>
                        {item.won ? 'Win' : 'Loss'} · Secret: {item.secret}
                      </div>
                      <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 4 }}>
                        Guessed in {item.tries} tries
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
            <SummaryItem label="Tries Left" value={phase === 'playing' ? MAX_GUESSES - guesses.length : '-'} accent={phase === 'playing' ? '#ff9800' : 'white'} />
            <SummaryItem label="Possible Range" value={phase === 'playing' ? `${currentRange.min} - ${currentRange.max}` : `${MIN_NUMBER} - ${MAX_NUMBER}`} />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f212e', borderRadius: 22, border: '1px solid rgba(255,255,255,0.05)', padding: '40px 20px', position: 'relative' }}>
            
            {phase === 'idle' && (
              <div style={{ textAlign: 'center', color: '#b1bad3' }}>
                <div style={{ fontSize: 60, opacity: 0.2, marginBottom: 10 }}>🔢</div>
                <h2>Ready to guess?</h2>
                <p>Place your bet and hit Start Game!</p>
              </div>
            )}

            {phase === 'finished' && (
              <div style={{ textAlign: 'center', color: guesses[guesses.length - 1]?.hint === 'correct' ? '#00e701' : '#ff4d4d' }}>
                <div style={{ fontSize: 70, marginBottom: 10 }}>
                  {guesses[guesses.length - 1]?.hint === 'correct' ? '🎉' : '💀'}
                </div>
                <h1 style={{ fontSize: 48, margin: 0 }}>{secretNumber}</h1>
                <p style={{ color: '#b1bad3', marginTop: 10, fontSize: 18 }}>The Secret Number</p>
              </div>
            )}

            {phase === 'playing' && (
              <form onSubmit={submitGuess} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 300 }}>
                <div style={{ fontSize: 40, marginBottom: 20 }}>🤔</div>
                <input
                  type="number"
                  autoFocus
                  min={MIN_NUMBER}
                  max={MAX_NUMBER}
                  value={currentGuess}
                  onChange={(e) => setCurrentGuess(e.target.value)}
                  disabled={busy}
                  placeholder="Enter 0 - 100"
                  style={{
                    width: '100%',
                    background: '#132634',
                    border: '2px solid #233847',
                    borderRadius: 16,
                    padding: '20px',
                    fontSize: 32,
                    fontWeight: 900,
                    color: 'white',
                    textAlign: 'center',
                    outline: 'none',
                    boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.2)',
                    transition: 'border-color 0.2s ease'
                  }}
                />
                <button
                  type="submit"
                  disabled={busy || currentGuess === ''}
                  style={{
                    ...primaryBtn,
                    background: '#ff9800',
                    marginTop: 20,
                    fontSize: 18,
                    opacity: (busy || currentGuess === '') ? 0.5 : 1
                  }}
                >
                  Submit Guess
                </button>
              </form>
            )}

            {/* عرض التخمينات السابقة (Visual History) */}
            {(phase === 'playing' || phase === 'finished') && guesses.length > 0 && (
              <div style={{ marginTop: 40, width: '100%', display: 'flex', justifyContent: 'center', gap: 15 }}>
                {guesses.map((g, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    background: g.hint === 'correct' ? '#00e70120' : '#132634',
                    border: `1px solid ${g.hint === 'correct' ? '#00e701' : 'rgba(255,255,255,0.05)'}`,
                    padding: '12px 20px',
                    borderRadius: 14,
                    minWidth: 80
                  }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: g.hint === 'correct' ? '#00e701' : 'white' }}>{g.value}</div>
                    <div style={{ fontSize: 20, marginTop: 4 }}>
                      {g.hint === 'higher' && '🔼'}
                      {g.hint === 'lower' && '🔽'}
                      {g.hint === 'correct' && '✅'}
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