import { useMemo, useState } from 'react';
import PageShell from '../components/PageShell';
import { mockDiscordUser } from '../lib/mockUser';
import { placeBet, settleGame } from '../lib/api';

const HOUSE_EDGE = 0.99;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatMultiplier(value) {
  if (value >= 1000) return String(Math.round(value));
  if (value >= 100) return value.toFixed(1);
  if (value >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

export default function DicePage() {
  const [bet, setBet] = useState('10');
  const [mode, setMode] = useState('under'); // under | over
  const [target, setTarget] = useState(50);
  const [phase, setPhase] = useState('idle'); // idle | rolling | finished
  const [busy, setBusy] = useState(false);
  const [displayRoll, setDisplayRoll] = useState('--');
  const [message, setMessage] = useState('Choose your target and roll.');
  const [lastResult, setLastResult] = useState(null);
  const [history, setHistory] = useState([]);

  const safeTarget = useMemo(() => {
    return clamp(Number(target) || 50, 2, 98);
  }, [target]);

  const winChance = useMemo(() => {
    return mode === 'under' ? safeTarget - 1 : 100 - safeTarget;
  }, [mode, safeTarget]);

  const multiplier = useMemo(() => {
    if (winChance <= 0) return 0;
    return HOUSE_EDGE * (100 / winChance);
  }, [winChance]);

  const payout = useMemo(() => {
    return Math.floor((Number(bet) || 0) * multiplier);
  }, [bet, multiplier]);

  const rollRuleText = useMemo(() => {
    return mode === 'under' ? `Roll under ${safeTarget}` : `Roll over ${safeTarget}`;
  }, [mode, safeTarget]);

  function multiplyBet() {
    setBet(String((Number(bet) || 0) * 2));
  }

  function divideBet() {
    const newBet = (Number(bet) || 0) / 2;
    setBet(String(newBet < 1 ? 1 : newBet));
  }

  function handleTargetSlider(value) {
    setTarget(clamp(Number(value), 2, 98));
  }

  async function startRoll() {
    const amount = Number(bet);

    if (busy || phase === 'rolling') return;

    if (!amount || amount <= 0) {
      setMessage('Enter a valid bet amount.');
      return;
    }

    setBusy(true);
    setPhase('rolling');
    setLastResult(null);
    setMessage('Placing bet and rolling...');
    setDisplayRoll('--');

    const betRes = await placeBet(
      mockDiscordUser.id,
      amount,
      'dice',
      `dice ${mode} ${safeTarget}`
    );

    if (!betRes.ok) {
      setBusy(false);
      setPhase('idle');
      setMessage(betRes.error || 'Bet failed');
      return;
    }

    // تأثير حركة النرد العشوائية السريعة
    for (let i = 0; i < 12; i += 1) {
      setDisplayRoll(Math.floor(Math.random() * 100) + 1);
      await sleep(50);
    }

    const rolled = Math.floor(Math.random() * 100) + 1;
    const isWin = mode === 'under' ? rolled < safeTarget : rolled > safeTarget;
    const finalPayout = isWin ? payout : 0;

    setDisplayRoll(rolled);

    if (isWin && finalPayout > 0) {
      const settleRes = await settleGame(
        mockDiscordUser.id,
        finalPayout,
        'dice',
        `dice ${mode} ${safeTarget} rolled ${rolled} x${formatMultiplier(multiplier)}`
      );

      if (!settleRes.ok) {
        setBusy(false);
        setPhase('finished');
        setMessage(settleRes.error || 'Failed to settle payout');
        return;
      }
    }

    const result = {
      roll: rolled,
      isWin,
      mode,
      target: safeTarget,
      chance: winChance,
      multiplier,
      payout: finalPayout,
      bet: amount
    };

    setLastResult(result);
    setHistory((prev) => [result, ...prev].slice(0, 10));
    setBusy(false);
    setPhase('finished');

    if (isWin) {
      setMessage(`You won! Rolled ${rolled}. Payout: $${finalPayout}`);
    } else {
      setMessage(`You lost. Rolled ${rolled}.`);
    }
  }

  return (
    <PageShell title="Dice">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '400px 1fr',
          gap: 24
        }}
      >
        {/* Controls Section */}
        <div
          style={{
            background: '#1a2c38',
            borderRadius: 24,
            padding: 20,
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.18)'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 18
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 900 }}>Manual</div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: phase === 'rolling' ? '#00e701' : '#b1bad3'
              }}
            >
              {phase === 'rolling' ? 'ROLLING' : 'READY'}
            </div>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>
            Bet Amount
          </div>

          {/* New Bet Input with 1/2 and 2x buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <input
              type="number"
              min="1"
              value={bet}
              onChange={(e) => setBet(e.target.value)}
              disabled={phase === 'rolling' || busy}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={divideBet} disabled={phase === 'rolling' || busy} style={actionBtn}>
              1/2
            </button>
            <button onClick={multiplyBet} disabled={phase === 'rolling' || busy} style={actionBtn}>
              2x
            </button>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginTop: 18, marginBottom: 10 }}>
            Roll Type
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10
            }}
          >
            <button
              onClick={() => setMode('under')}
              disabled={phase === 'rolling' || busy}
              style={mode === 'under' ? activeBtn : normalBtn}
            >
              Roll Under
            </button>

            <button
              onClick={() => setMode('over')}
              disabled={phase === 'rolling' || busy}
              style={mode === 'over' ? activeBtn : normalBtn}
            >
              Roll Over
            </button>
          </div>

          <div
            style={{
              marginTop: 18,
              background: '#132634',
              borderRadius: 18,
              padding: 16,
              border: '1px solid rgba(255,255,255,0.05)',
              lineHeight: 1.9
            }}
          >
            <div style={statRow}>
              <span style={statLabel}>Rule</span>
              <span style={statValue}>{rollRuleText}</span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Win chance</span>
              <span style={statValue}>{winChance.toFixed(2)}%</span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Multiplier</span>
              <span style={{ ...statValue, color: '#00e701' }}>
                x{formatMultiplier(multiplier)}
              </span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Payout</span>
              <span style={statValue}>${payout}</span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>House edge</span>
              <span style={statValue}>1%</span>
            </div>
          </div>

          <button
            onClick={startRoll}
            disabled={phase === 'rolling' || busy}
            style={{
              width: '100%',
              borderRadius: 14,
              background: '#00e701',
              color: 'black',
              fontWeight: 900,
              padding: '15px 16px',
              border: 'none',
              cursor: 'pointer',
              marginTop: 18,
              opacity: phase === 'rolling' || busy ? 0.65 : 1,
              transition: 'transform 0.05s ease',
            }}
            onMouseDown={(e) => !busy && (e.currentTarget.style.transform = 'scale(0.97)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {phase === 'rolling' ? 'Rolling...' : 'Bet'}
          </button>

          <div
            style={{
              marginTop: 16,
              color: lastResult?.isWin ? '#7df9a6' : '#b1bad3',
              minHeight: 24,
              lineHeight: 1.6
            }}
          >
            {message}
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>
              Last Results
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {history.length === 0 ? (
                <div
                  style={{
                    background: '#132634',
                    borderRadius: 14,
                    padding: 14,
                    color: '#b1bad3'
                  }}
                >
                  No rolls yet.
                </div>
              ) : (
                history.map((item, index) => (
                  <div
                    key={`${item.roll}-${item.target}-${index}`}
                    style={{
                      background: '#132634',
                      borderRadius: 14,
                      padding: 14,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, color: item.isWin ? '#00e701' : 'white' }}>
                        {item.isWin ? 'Win' : 'Lose'} · {item.roll}
                      </div>
                      <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 4 }}>
                        {item.mode.toUpperCase()} {item.target} · x{formatMultiplier(item.multiplier)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 900 }}>${item.payout}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Board Section */}
        <div
          style={{
            background: '#1a2c38',
            borderRadius: 24,
            padding: 24,
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              background: 'radial-gradient(circle at top, rgba(68,98,121,0.38), rgba(15,33,46,0.98) 65%)',
              borderRadius: 22,
              padding: '80px 40px',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {/* The Roll Visual Slider Component */}
            <div style={{ position: 'relative', margin: '20px 0 40px 0' }}>
              
              {/* Background Bar */}
              <div
                style={{
                  height: 16,
                  borderRadius: 8,
                  display: 'flex',
                  overflow: 'hidden',
                  background: '#132634',
                  boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.5)'
                }}
              >
                <div style={{ width: `${safeTarget}%`, background: mode === 'under' ? '#00e701' : '#ff4d4d' }} />
                <div style={{ width: `${100 - safeTarget}%`, background: mode === 'under' ? '#ff4d4d' : '#00e701' }} />
              </div>

              {/* Absolute Overlays (Handle and Stick) */}
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                
                {/* The Target Handle */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${safeTarget}%`,
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 4,
                  }}
                >
                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: '4px solid #1a2c38' }} />
                </div>

                {/* The Dice Marker (Stick) */}
                {displayRoll !== '--' && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${displayRoll}%`,
                      top: -55,
                      transform: 'translateX(-50%)',
                      zIndex: 5,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      transition: phase === 'rolling' ? 'none' : 'left 0.2s ease-out'
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        background: phase === 'rolling' ? '#fff' : (lastResult?.isWin ? '#00e701' : '#ff4d4d'),
                        color: phase === 'rolling' ? '#000' : (lastResult?.isWin ? '#000' : '#fff'),
                        fontWeight: 900,
                        fontSize: 20,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
                        border: '2px solid rgba(0,0,0,0.1)'
                      }}
                    >
                      {displayRoll}
                    </div>
                    <div
                      style={{
                        width: 4,
                        height: 25,
                        background: phase === 'rolling' ? '#fff' : (lastResult?.isWin ? '#00e701' : '#ff4d4d'),
                        borderRadius: 2,
                        marginTop: -2
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Marks (0, 25, 50, 75, 100) */}
              <div style={{ position: 'absolute', top: 30, left: 0, right: 0 }}>
                {[0, 25, 50, 75, 100].map(mark => (
                  <div
                    key={mark}
                    style={{
                      position: 'absolute',
                      left: `${mark}%`,
                      transform: 'translateX(-50%)',
                      color: '#b1bad3',
                      fontSize: 14,
                      fontWeight: 800
                    }}
                  >
                    {mark}
                  </div>
                ))}
              </div>

              {/* Interactive Invisible Range Slider */}
              <input
                type="range"
                min="2"
                max="98"
                value={safeTarget}
                onChange={(e) => handleTargetSlider(e.target.value)}
                disabled={phase === 'rolling' || busy}
                style={{
                  position: 'absolute',
                  top: -10,
                  left: 0,
                  width: '100%',
                  height: 36,
                  opacity: 0,
                  cursor: phase === 'rolling' || busy ? 'default' : 'pointer',
                  zIndex: 10
                }}
              />
            </div>

            {/* Horizontal Summary Section */}
            <div
              style={{
                marginTop: 65,
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap'
              }}
            >
              <SummaryItem label="Target" value={safeTarget} />
              <SummaryItem label="Win Chance" value={`${winChance.toFixed(2)}%`} />
              <SummaryItem label="Multiplier" value={`x${formatMultiplier(multiplier)}`} accent="#00e701" />
              <SummaryItem label="Payout" value={`$${payout}`} />
            </div>

          </div>
        </div>
      </div>
    </PageShell>
  );
}

// UI Components & Styles
function SummaryItem({ label, value, accent = 'white' }) {
  return (
    <div
      style={{
        background: '#132634',
        borderRadius: 16,
        padding: '16px 12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(255,255,255,0.05)',
        flex: 1,
        minWidth: '100px'
      }}
    >
      <span style={{ color: '#b1bad3', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
        {label}
      </span>
      <span style={{ color: accent, fontWeight: 900, fontSize: 18 }}>
        {value}
      </span>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  borderRadius: 14,
  background: '#0f212e',
  border: '1px solid rgba(255,255,255,0.1)',
  padding: '14px 16px',
  color: 'white',
  fontWeight: 'bold'
};

const actionBtn = {
  background: '#233847',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: '0 20px',
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: 16
};

const normalBtn = {
  background: '#233847',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: '12px 14px',
  cursor: 'pointer',
  fontWeight: 800
};

const activeBtn = {
  ...normalBtn,
  background: '#2f4553',
  boxShadow: '0 10px 20px rgba(0,0,0,0.14)'
};

const statRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12
};

const statLabel = {
  color: '#b1bad3'
};

const statValue = {
  color: 'white',
  fontWeight: 800
};