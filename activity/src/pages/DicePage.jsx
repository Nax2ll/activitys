import { useEffect, useMemo, useState } from 'react';
import PageShell from '../components/PageShell';
import { placeBet, settleGame } from '../lib/api';

const HOUSE_EDGE = 0.99;
const MOBILE_BREAKPOINT = 820;

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

function emitBalanceUpdated(balance) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('casino:balance-updated', {
        detail: { balance }
      })
    );
  }
}

export default function DicePage() {
  const [bet, setBet] = useState('10');
  const [mode, setMode] = useState('under');
  const [target, setTarget] = useState(50);
  const [phase, setPhase] = useState('idle');
  const [busy, setBusy] = useState(false);
  const [displayRoll, setDisplayRoll] = useState('--');
  const [message, setMessage] = useState('Choose your target and roll.');
  const [lastResult, setLastResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= MOBILE_BREAKPOINT;
  });

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    }

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      undefined,
      amount,
      'dice',
      `dice ${mode} ${safeTarget}`,
      { mode, target: safeTarget, winChance, multiplier }
    );

    if (!betRes.ok) {
      setBusy(false);
      setPhase('idle');
      setMessage(betRes.error || 'Bet failed');
      return;
    }

    emitBalanceUpdated(betRes.balance);

    const currentRoundId = betRes.roundId;

    for (let i = 0; i < 12; i += 1) {
      setDisplayRoll(Math.floor(Math.random() * 100) + 1);
      await sleep(50);
    }

    const rolled = Math.floor(Math.random() * 100) + 1;
    const isWin = mode === 'under' ? rolled < safeTarget : rolled > safeTarget;
    const finalPayout = isWin ? payout : 0;

    setDisplayRoll(rolled);

    const settleRes = await settleGame(
      undefined,
      currentRoundId,
      finalPayout,
      'dice',
      `dice ${mode} ${safeTarget} rolled ${rolled} x${formatMultiplier(multiplier)}`,
      {
        rolled,
        mode,
        target: safeTarget,
        chance: winChance,
        multiplier,
        bet: amount
      },
      isWin ? 'win' : 'loss'
    );

    if (!settleRes.ok) {
      setBusy(false);
      setPhase('finished');
      setMessage(settleRes.error || 'Failed to settle payout');
      return;
    }

    emitBalanceUpdated(settleRes.balance);

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
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(340px, 400px) minmax(0, 1fr)',
          gap: isMobile ? 16 : 24,
          alignItems: 'start'
        }}
      >
        <div
          style={{
            background: '#1a2c38',
            borderRadius: isMobile ? 20 : 24,
            padding: isMobile ? 16 : 20,
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.18)',
            minWidth: 0,
            order: isMobile ? 2 : 1
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 18,
              gap: 12
            }}
          >
            <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 900 }}>Manual</div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: phase === 'rolling' ? '#00e701' : '#b1bad3',
                flexShrink: 0
              }}
            >
              {phase === 'rolling' ? 'ROLLING' : 'READY'}
            </div>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>
            Bet Amount
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr 80px 80px' : '1fr 88px 88px',
              gap: 8,
              marginBottom: 18
            }}
          >
            <input
              type="number"
              min="1"
              value={bet}
              onChange={(e) => setBet(e.target.value)}
              disabled={phase === 'rolling' || busy}
              style={{ ...inputStyle, minWidth: 0 }}
            />
            <button
              onClick={divideBet}
              disabled={phase === 'rolling' || busy}
              style={{ ...actionBtn, padding: isMobile ? '0 12px' : '0 20px' }}
            >
              1/2
            </button>
            <button
              onClick={multiplyBet}
              disabled={phase === 'rolling' || busy}
              style={{ ...actionBtn, padding: isMobile ? '0 12px' : '0 20px' }}
            >
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
              padding: isMobile ? 14 : 16,
              border: '1px solid rgba(255,255,255,0.05)',
              lineHeight: 1.9
            }}
          >
            <div style={statRow}>
              <span style={statLabel}>Rule</span>
              <span style={{ ...statValue, textAlign: 'right' }}>{rollRuleText}</span>
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
              fontSize: isMobile ? 15 : 16
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
              lineHeight: 1.6,
              fontSize: isMobile ? 14 : 15
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
                      alignItems: 'center',
                      gap: 12
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 800,
                          color: item.isWin ? '#00e701' : 'white',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {item.isWin ? 'Win' : 'Lose'} · {item.roll}
                      </div>
                      <div
                        style={{
                          color: '#b1bad3',
                          fontSize: 13,
                          marginTop: 4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {item.mode.toUpperCase()} {item.target} · x{formatMultiplier(item.multiplier)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 900, flexShrink: 0 }}>${item.payout}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#1a2c38',
            borderRadius: isMobile ? 20 : 24,
            padding: isMobile ? 16 : 24,
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minWidth: 0,
            order: isMobile ? 1 : 2
          }}
        >
          <div
            style={{
              background:
                'radial-gradient(circle at top, rgba(68,98,121,0.38), rgba(15,33,46,0.98) 65%)',
              borderRadius: 22,
              padding: isMobile ? '54px 14px 18px' : '80px 40px',
              border: '1px solid rgba(255,255,255,0.05)',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                position: 'relative',
                margin: isMobile ? '8px 0 22px 0' : '20px 0 40px 0'
              }}
            >
              <div
                style={{
                  height: isMobile ? 14 : 16,
                  borderRadius: 999,
                  display: 'flex',
                  overflow: 'hidden',
                  background: '#132634',
                  boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.5)'
                }}
              >
                <div
                  style={{
                    width: `${safeTarget}%`,
                    background: mode === 'under' ? '#00e701' : '#ff4d4d'
                  }}
                />
                <div
                  style={{
                    width: `${100 - safeTarget}%`,
                    background: mode === 'under' ? '#ff4d4d' : '#00e701'
                  }}
                />
              </div>

              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: `${safeTarget}%`,
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: isMobile ? 22 : 28,
                    height: isMobile ? 22 : 28,
                    borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 4
                  }}
                >
                  <div
                    style={{
                      width: isMobile ? 10 : 14,
                      height: isMobile ? 10 : 14,
                      borderRadius: '50%',
                      border: `${isMobile ? 3 : 4}px solid #1a2c38`
                    }}
                  />
                </div>

                {displayRoll !== '--' && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${displayRoll}%`,
                      top: isMobile ? -42 : -55,
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
                        width: isMobile ? 34 : 44,
                        height: isMobile ? 34 : 44,
                        background: phase === 'rolling' ? '#fff' : lastResult?.isWin ? '#00e701' : '#ff4d4d',
                        color: phase === 'rolling' ? '#000' : lastResult?.isWin ? '#000' : '#fff',
                        fontWeight: 900,
                        fontSize: isMobile ? 15 : 20,
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
                        height: isMobile ? 18 : 25,
                        background: phase === 'rolling' ? '#fff' : lastResult?.isWin ? '#00e701' : '#ff4d4d',
                        borderRadius: 2,
                        marginTop: -2
                      }}
                    />
                  </div>
                )}
              </div>

              <div
                style={{
                  position: 'absolute',
                  top: isMobile ? 24 : 30,
                  left: 0,
                  right: 0
                }}
              >
                {[0, 25, 50, 75, 100].map((mark) => (
                  <div
                    key={mark}
                    style={{
                      position: 'absolute',
                      left: `${mark}%`,
                      transform: 'translateX(-50%)',
                      color: '#b1bad3',
                      fontSize: isMobile ? 11 : 14,
                      fontWeight: 800
                    }}
                  >
                    {mark}
                  </div>
                ))}
              </div>

              <input
                type="range"
                min="2"
                max="98"
                value={safeTarget}
                onChange={(e) => handleTargetSlider(e.target.value)}
                disabled={phase === 'rolling' || busy}
                style={{
                  position: 'absolute',
                  top: isMobile ? -8 : -10,
                  left: 0,
                  width: '100%',
                  height: 36,
                  opacity: 0,
                  cursor: phase === 'rolling' || busy ? 'default' : 'pointer',
                  zIndex: 10
                }}
              />
            </div>

            <div
              style={{
                marginTop: isMobile ? 34 : 65,
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))',
                gap: 12
              }}
            >
              <SummaryItem label="Target" value={safeTarget} isMobile={isMobile} />
              <SummaryItem
                label="Win Chance"
                value={`${winChance.toFixed(2)}%`}
                isMobile={isMobile}
              />
              <SummaryItem
                label="Multiplier"
                value={`x${formatMultiplier(multiplier)}`}
                accent="#00e701"
                isMobile={isMobile}
              />
              <SummaryItem label="Payout" value={`$${payout}`} isMobile={isMobile} />
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function SummaryItem({ label, value, accent = 'white', isMobile = false }) {
  return (
    <div
      style={{
        background: '#132634',
        borderRadius: 16,
        padding: isMobile ? '14px 10px' : '16px 12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(255,255,255,0.05)',
        minWidth: 0
      }}
    >
      <span
        style={{
          color: '#b1bad3',
          fontWeight: 700,
          fontSize: isMobile ? 12 : 13,
          marginBottom: 6,
          textAlign: 'center'
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: accent,
          fontWeight: 900,
          fontSize: isMobile ? 16 : 18,
          textAlign: 'center',
          wordBreak: 'break-word'
        }}
      >
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
  fontWeight: 800,
  minWidth: 0
};
