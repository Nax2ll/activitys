import { useEffect, useMemo, useState } from 'react';
import PageShell from '../components/PageShell';
import { placeBet, settleGame, getBalance } from '../lib/api';

const LEVELS = 25;
const RTP = 0.98;
const MOBILE_BREAKPOINT = 820;

const MODE_CONFIG = {
  easy: { label: 'Easy', winChance: 0.75, factor: 1.333 },
  medium: { label: 'Medium', winChance: 0.666, factor: 1.5 },
  hard: { label: 'Hard', winChance: 0.5, factor: 2.0 },
  expert: { label: 'Expert', winChance: 0.333, factor: 3.0 },
  master: { label: 'Master', winChance: 0.25, factor: 4.0 }
};

function emitBalanceUpdated(balance) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('casino:balance-updated', { detail: { balance } }));
  }
}

function formatMoney(val) {
  if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMult(val) {
  if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getMultiplier(modeKey, clearedLevels) {
  if (clearedLevels <= 0) return 1;
  const mode = MODE_CONFIG[modeKey];
  const value = RTP * Math.pow(mode.factor, clearedLevels);

  if (value >= 1e6) return Math.floor(value);
  if (value >= 1000) return Math.round(value);
  if (value >= 100) return Number(value.toFixed(1));
  if (value >= 10) return Number(value.toFixed(2));
  return Number(value.toFixed(3));
}

export default function ChickenCrossPage() {
  const [bet, setBet] = useState('10');
  const [userBalance, setUserBalance] = useState(0);
  const [mode, setMode] = useState('medium');
  const [road, setRoad] = useState(() => Array.from({ length: LEVELS }, () => ({ resolved: false, won: null })));
  const [phase, setPhase] = useState('idle');
  const [currentStep, setCurrentStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Choose your difficulty and press the manhole to cross.');
  const [lastPayout, setLastPayout] = useState(0);
  const [history, setHistory] = useState([]);
  const [roundId, setRoundId] = useState(null);
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

  const modeConfig = MODE_CONFIG[mode];
  const currentMultiplier = useMemo(() => currentStep > 0 ? getMultiplier(mode, currentStep) : 0, [mode, currentStep]);
  const nextMultiplier = useMemo(() => getMultiplier(mode, currentStep + 1), [mode, currentStep]);
  const currentPayout = useMemo(() => Math.floor((Number(bet) || 0) * currentMultiplier), [bet, currentMultiplier]);
  const nextPayout = useMemo(() => Math.floor((Number(bet) || 0) * getMultiplier(mode, currentStep + 1)), [bet, mode, currentStep]);
  const nextSafeChance = useMemo(() => phase !== 'playing' ? null : (modeConfig.winChance * 100).toFixed(2), [phase, modeConfig]);

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

  function resetGame(nextMode = mode) {
    if (phase === 'playing' || busy) return;
    setRoad(Array.from({ length: LEVELS }, () => ({ resolved: false, won: null })));
    setPhase('idle');
    setCurrentStep(0);
    setBusy(false);
    setMessage('Choose your difficulty and press the manhole to cross.');
    setLastPayout(0);
    setRoundId(null);
  }

  async function startRound() {
    const amount = Number(bet);
    if (busy) return;
    if (!amount || amount <= 0) { setMessage('Enter a valid bet amount.'); return; }

    setBusy(true);
    setMessage('Starting round...');

    const betRes = await placeBet(undefined, amount, 'chickenCross', `chicken cross ${mode}`, { mode, winChance: modeConfig.winChance, factor: modeConfig.factor, levels: LEVELS });
    if (!betRes.ok) { setBusy(false); setMessage(betRes.error || 'Bet failed'); return; }

    emitBalanceUpdated(betRes.balance);
    setRoundId(betRes.roundId);
    setRoad(Array.from({ length: LEVELS }, () => ({ resolved: false, won: null })));
    setPhase('playing');
    setCurrentStep(0);
    setLastPayout(0);
    setMessage('Round started. Click the manhole!');
    setBusy(false);
  }

  async function finalizeWin(payout, reason, levelsCleared, completed = false) {
    if (!roundId) { setBusy(false); setMessage('Missing roundId.'); return false; }
    setBusy(true);

    const settleRes = await settleGame(undefined, roundId, payout, 'chickenCross', reason, { mode, levelsCleared, completed, multiplier: getMultiplier(mode, levelsCleared), bet: Number(bet) || 0 }, 'win');
    if (!settleRes.ok) { setBusy(false); setMessage(settleRes.error || 'Failed to settle payout.'); return false; }

    emitBalanceUpdated(settleRes.balance);
    setRoundId(null);
    setPhase(completed ? 'completed' : 'cashed');
    setLastPayout(payout);
    setHistory((prev) => [{ type: 'win', payout, levels: levelsCleared, multiplier: getMultiplier(mode, levelsCleared), mode }, ...prev].slice(0, 3));
    setBusy(false);
    return true;
  }

  async function finalizeLoss(levelsCleared) {
    if (!roundId) { setBusy(false); setMessage('Missing roundId.'); return; }

    const settleRes = await settleGame(undefined, roundId, 0, 'chickenCross', `chicken cross loss at step ${levelsCleared + 1}`, { mode, levelsCleared, bet: Number(bet) || 0 }, 'loss');
    if (!settleRes.ok) { setBusy(false); setMessage(settleRes.error || 'Failed to settle round.'); return; }

    emitBalanceUpdated(settleRes.balance);
    setRoundId(null);
    setPhase('lost');
    setBusy(false);
    setLastPayout(0);
    setMessage('Splat! The chicken got hit. Round lost.');
    setHistory((prev) => [{ type: 'lose', payout: 0, levels: levelsCleared, multiplier: 0, mode }, ...prev].slice(0, 3));
  }

  async function crossLane() {
    if (busy || phase !== 'playing' || currentStep >= LEVELS) return;
    setBusy(true);

    const isSafe = Math.random() < modeConfig.winChance;
    const updatedRoad = [...road];
    updatedRoad[currentStep] = { resolved: true, won: isSafe };
    setRoad(updatedRoad);

    await new Promise((resolve) => setTimeout(resolve, isMobile ? 260 : 350));

    if (!isSafe) { await finalizeLoss(currentStep); return; }

    const cleared = currentStep + 1;
    const completed = cleared >= LEVELS;

    if (completed) {
      const finalMultiplier = getMultiplier(mode, cleared);
      const payout = Math.floor((Number(bet) || 0) * finalMultiplier);
      setCurrentStep(cleared);
      setMessage(`Road crossed completely! Settling $${formatMoney(payout)}...`);

      const ok = await finalizeWin(payout, `chicken cross completed x${finalMultiplier}`, cleared, true);
      if (ok) setMessage(`Epic win! Payout: $${formatMoney(payout)}`);
      return;
    }

    setCurrentStep(cleared);
    setBusy(false);
    setMessage(`Safe! Multiplier is now x${formatMult(getMultiplier(mode, cleared + 1))}.`);
  }

  async function cashOut() {
    if (busy || phase !== 'playing' || currentStep <= 0) return;
    const payout = Math.floor((Number(bet) || 0) * currentMultiplier);
    setMessage(`Cashing out $${formatMoney(payout)}...`);
    const ok = await finalizeWin(payout, `chicken cross cashout x${currentMultiplier}`, currentStep, false);
    if (ok) setMessage(`Cashed out successfully: $${formatMoney(payout)}`);
  }

  const laneWidth = isMobile ? 88 : 140;
  const manholeSize = isMobile ? 58 : 90;
  const sceneHeight = isMobile ? 250 : 400;
  const chickenTop = isMobile ? 108 : 175;
  const chickenSize = isMobile ? 34 : 50;
  const chickenFontSize = isMobile ? 28 : 40;
  const shiftX = Math.max(0, currentStep - (isMobile ? 1 : 2)) * laneWidth;
  const chickenLane = phase === 'idle' ? -1 : phase === 'lost' ? currentStep : currentStep - 1;
  const chickenX = chickenLane * laneWidth + laneWidth / 2 - chickenSize / 2;

  return (
    <PageShell title="Chicken Cross">
      <style>{`
        @keyframes ambientDriveDown { 0% { top: -100px; } 100% { top: 500px; } }
        @keyframes ambientDriveUp { 0% { top: 500px; } 100% { top: -100px; } }
        @keyframes killerSmash { 0% { top: -100px; } 40% { top: 180px; } 100% { top: 600px; } }
        .ambient-car-down { position: absolute; left: ${isMobile ? 26 : 45}px; font-size: ${isMobile ? 28 : 50}px; animation: ambientDriveDown 2s linear infinite; opacity: 0.15; z-index: 1; pointer-events: none; }
        .ambient-car-up { position: absolute; left: ${isMobile ? 26 : 45}px; font-size: ${isMobile ? 28 : 50}px; animation: ambientDriveUp 2.5s linear infinite; opacity: 0.15; z-index: 1; pointer-events: none; }
        .killer-car { position: absolute; left: ${isMobile ? 18 : 35}px; font-size: ${isMobile ? 42 : 70}px; animation: killerSmash 0.5s linear forwards; z-index: 20; pointer-events: none; }
        .chicken { position: absolute; top: ${chickenTop}px; width: ${chickenSize}px; height: ${chickenSize}px; font-size: ${chickenFontSize}px; display: flex; align-items: center; justify-content: center; transition: left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); z-index: 15; pointer-events: none; }
        .chicken-splat { transform: scale(1.3) scaleY(0.2) translateY(40px); filter: drop-shadow(0 0 15px #ef4444); opacity: 0.85; transition: all 0.2s ease; }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(340px, 390px) minmax(0, 1fr)', gap: isMobile ? 16 : 24, alignItems: 'start' }}>
        
        {/* Controls Section */}
        <div style={{ background: '#1a2c38', borderRadius: isMobile ? 20 : 24, padding: isMobile ? 16 : 20, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', minWidth: 0, order: isMobile ? 2 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12 }}>
            <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 900 }}>Manual</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: phase === 'playing' ? '#00e701' : phase === 'lost' ? '#ff8d8d' : (phase === 'cashed' || phase === 'completed') ? '#7df9a6' : '#b1bad3', flexShrink: 0 }}>
              {phase === 'playing' ? 'CROSSING' : phase === 'lost' ? 'SPLAT' : phase === 'cashed' ? 'CASHED OUT' : phase === 'completed' ? 'SURVIVED' : 'READY'}
            </div>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>Bet Amount</div>
          <div style={{ marginBottom: 18 }}>
            
            {/* الصف الأول: مربع النص + أزرار الضرب والقسمة */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input 
                type="number" lang="en" dir="ltr" inputMode="decimal" min="1" 
                value={bet} 
                onChange={(e) => setBet(e.target.value)} 
                disabled={phase === 'playing' || busy} 
                style={{ ...inputStyle, marginBottom: 0, flex: 1, outline: 'none' }} 
              />
              <button onClick={() => modifyBet(0.5)} disabled={phase === 'playing' || busy} style={{ ...actionBtn, padding: '0 16px', fontSize: 15 }}>
                1/2
              </button>
              <button onClick={() => modifyBet(2)} disabled={phase === 'playing' || busy} style={{ ...actionBtn, padding: '0 16px', fontSize: 15 }}>
                2x
              </button>
            </div>

            {/* الصف الثاني: أزرار النسب (1/4, 1/2, 3/4, Full) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              <button onClick={() => setFractionBet(0.25)} disabled={phase === 'playing' || busy} style={actionBtn}>1/4</button>
              <button onClick={() => setFractionBet(0.5)} disabled={phase === 'playing' || busy} style={actionBtn}>1/2</button>
              <button onClick={() => setFractionBet(0.75)} disabled={phase === 'playing' || busy} style={actionBtn}>3/4</button>
              <button onClick={() => setFractionBet(1)} disabled={phase === 'playing' || busy} style={actionBtn}>Full</button>
            </div>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>Difficulty</div>
          <select value={mode} onChange={(e) => { setMode(e.target.value); resetGame(e.target.value); }} disabled={phase === 'playing' || busy} style={{ ...selectStyle, marginBottom: 18, opacity: phase === 'playing' || busy ? 0.6 : 1 }}>
            {Object.entries(MODE_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
          </select>

          <button onClick={startRound} disabled={phase === 'playing' || busy} style={{ ...primaryBtn, opacity: phase === 'playing' || busy ? 0.65 : 1, fontSize: isMobile ? 15 : 16 }}>
            {busy && phase !== 'playing' ? 'Starting...' : phase === 'playing' ? 'Game Running' : 'Bet'}
          </button>

          <button onClick={cashOut} disabled={phase !== 'playing' || currentStep <= 0 || busy} style={{ ...cashoutBtn, opacity: phase !== 'playing' || currentStep <= 0 || busy ? 0.6 : 1, fontSize: isMobile ? 15 : 16 }}>
            {busy && phase === 'playing' ? 'Processing...' : `Cash Out $${formatMoney(currentPayout)}`}
          </button>

          <div style={{ marginTop: 16, color: phase === 'lost' ? '#ff8d8d' : (phase === 'cashed' || phase === 'completed') ? '#7df9a6' : '#b1bad3', minHeight: 22, lineHeight: 1.6, fontSize: isMobile ? 14 : 15 }}>{message}</div>

          <div style={{ marginTop: 18, background: '#132634', borderRadius: 18, padding: isMobile ? 14 : 16, border: '1px solid rgba(255,255,255,0.05)', lineHeight: 1.9 }}>
            <div style={statRow}><span style={statLabel}>Step</span><span style={statValue}>{currentStep}/{LEVELS}</span></div>
            <div style={statRow}><span style={statLabel}>Current multiplier</span><span style={{ ...statValue, color: '#00e701' }}>{currentStep > 0 ? `x${formatMult(currentMultiplier)}` : '-'}</span></div>
            <div style={statRow}><span style={statLabel}>Next multiplier</span><span style={statValue}>{`x${formatMult(nextMultiplier)}`}</span></div>
            <div style={statRow}><span style={statLabel}>Current payout</span><span style={statValue}>${formatMoney(currentPayout)}</span></div>
            <div style={statRow}><span style={statLabel}>Next safe chance</span><span style={statValue}>{nextSafeChance ? `${nextSafeChance}%` : '-'}</span></div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Last Results</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {history.length === 0 ? <div style={{ background: '#132634', borderRadius: 14, padding: 14, color: '#b1bad3' }}>No crossings yet.</div> : history.map((item, index) => (
                <div key={`${item.type}-${item.levels}-${index}`} style={{ background: '#132634', borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: item.type === 'win' ? '#00e701' : 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.type === 'lose' ? 'Hit' : `x${formatMult(item.multiplier)}`}</div>
                    <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.mode.toUpperCase()} · Step {item.levels}</div>
                  </div>
                  <div style={{ fontWeight: 900, flexShrink: 0 }}>${formatMoney(item.payout)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Board Section */}
        <div style={{ background: '#1a2c38', borderRadius: isMobile ? 20 : 24, padding: isMobile ? 16 : 24, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', minWidth: 0, order: isMobile ? 1 : 2 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
            <SummaryItem label="Step" value={`${currentStep}/${LEVELS}`} isMobile={isMobile} />
            <SummaryItem label="Multiplier" value={`x${formatMult(currentMultiplier)}`} accent="#00e701" isMobile={isMobile} />
            <SummaryItem label="Payout" value={`$${formatMoney(currentPayout)}`} isMobile={isMobile} />
          </div>

          <div style={{ background: '#22283e', borderRadius: 22, border: '1px solid rgba(255,255,255,0.05)', height: sceneHeight, width: '100%', maxWidth: isMobile ? '100%' : 700, margin: '0 auto', overflow: 'hidden', boxShadow: 'inset 0 10px 40px rgba(0,0,0,0.5)', position: 'relative' }}>
            <div style={{ display: 'flex', height: '100%', width: LEVELS * laneWidth, transform: `translateX(-${shiftX}px)`, transition: 'transform 0.4s ease', position: 'relative' }}>
              <div className={`chicken ${phase === 'lost' ? 'chicken-splat' : ''}`} style={{ left: chickenX }}>🐔</div>
              {road.map((col, i) => {
                const isCurrentLane = phase === 'playing' && i === currentStep;
                const isFuture = i > currentStep;
                const showAmbientCar = i !== currentStep && i !== currentStep - 1;
                const carDirection = i % 2 === 0 ? 'down' : 'up';
                const carDelay = (Math.random() * 2).toFixed(2);
                const isKillerCar = phase === 'lost' && i === currentStep;
                
                let manholeBg = '#1a2235';
                let manholeBorder = '2px solid rgba(255,255,255,0.1)';
                let content = `$${formatMoney((Number(bet) || 0) * getMultiplier(mode, i + 1))}`;
                let shadow = 'none';

                if (col.resolved) {
                  manholeBg = 'radial-gradient(circle, #fcd34d 0%, #d97706 100%)';
                  manholeBorder = '2px solid #fbbf24';
                  content = '';
                  shadow = '0 4px 15px rgba(217,119,6,0.5)';
                } else if (isCurrentLane) {
                  manholeBg = 'rgba(0,231,1,0.1)';
                  manholeBorder = '2px solid rgba(0,231,1,0.6)';
                  shadow = '0 0 20px rgba(0,231,1,0.2)';
                }

                return (
                  <div key={i} style={{ width: laneWidth, height: '100%', borderRight: i === LEVELS - 1 ? 'none' : `${isMobile ? 2 : 4}px dashed rgba(255,255,255,0.15)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', opacity: isFuture ? 0.6 : 1, transition: 'opacity 0.3s ease' }}>
                    {showAmbientCar && <div className={`ambient-car-${carDirection}`} style={{ animationDelay: `${carDelay}s` }}>{carDirection === 'down' ? '🚘' : '🚕'}</div>}
                    {isKillerCar && <div className="killer-car">🚓</div>}
                    {col.resolved && col.won && <div style={{ position: 'absolute', top: isMobile ? 78 : 120, fontSize: isMobile ? 20 : 32, zIndex: 10 }}>🚧</div>}
                    <button onClick={crossLane} disabled={!isCurrentLane || busy || col.resolved} style={{ width: manholeSize, height: manholeSize, borderRadius: '50%', background: manholeBg, border: manholeBorder, color: isCurrentLane ? '#00e701' : 'white', fontSize: isMobile ? 10 : 13, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isCurrentLane && !busy && !col.resolved ? 'pointer' : 'default', transition: 'all 0.15s ease', boxShadow: shadow, zIndex: 5, padding: isMobile ? '4px' : '6px', textAlign: 'center', lineHeight: 1.2 }}>
                      {content}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ marginTop: 24, textAlign: 'center', color: '#b1bad3', fontSize: isMobile ? 14 : 15, lineHeight: 1.7 }}>
            Press the glowing manhole to advance. Be careful, a car might cross!
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function SummaryItem({ label, value, accent = 'white', isMobile = false }) {
  return (
    <div style={{ background: '#132634', borderRadius: 16, padding: isMobile ? '14px 10px' : '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)', minWidth: 0 }}>
      <span style={{ color: '#b1bad3', fontWeight: 700, fontSize: isMobile ? 12 : 13, marginBottom: 6, textAlign: 'center' }}>{label}</span>
      <span style={{ color: accent, fontWeight: 900, fontSize: isMobile ? 16 : 18, textAlign: 'center', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

const inputStyle = { width: '100%', borderRadius: 14, background: '#0f212e', border: '1px solid rgba(255,255,255,0.1)', padding: '14px 16px', color: 'white', fontWeight: 'bold', outline: 'none' };
const selectStyle = { ...inputStyle, cursor: 'pointer' };
const actionBtn = { background: '#233847', color: 'white', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 0', cursor: 'pointer', fontWeight: 800, fontSize: 13, textAlign: 'center' };
const primaryBtn = { width: '100%', borderRadius: 14, background: '#00e701', color: 'black', fontWeight: 900, padding: '15px 16px', border: 'none', cursor: 'pointer', marginTop: 18, transition: 'transform 0.05s ease' };
const cashoutBtn = { width: '100%', borderRadius: 14, background: '#2f4553', color: 'white', fontWeight: 800, padding: '15px 16px', border: 'none', cursor: 'pointer', marginTop: 10 };
const statRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 };
const statLabel = { color: '#b1bad3' };
const statValue = { color: 'white', fontWeight: 800, minWidth: 0, textAlign: 'right' };
