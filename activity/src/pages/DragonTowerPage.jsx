import { useEffect, useMemo, useState } from 'react';
import PageShell from '../components/PageShell';
import { placeBet, settleGame, getBalance } from '../lib/api';

const LEVELS = 9;
const RTP = 0.98;
const MOBILE_BREAKPOINT = 820;

const MODE_CONFIG = {
  easy: { label: 'Easy', safeCount: 3, tileCount: 4, color: '#2d8a5b' },
  medium: { label: 'Medium', safeCount: 2, tileCount: 3, color: '#3c78a8' },
  hard: { label: 'Hard', safeCount: 1, tileCount: 2, color: '#b7791f' },
  expert: { label: 'Expert', safeCount: 1, tileCount: 3, color: '#c05621' },
  master: { label: 'Master', safeCount: 1, tileCount: 4, color: '#c53030' }
};

function emitBalanceUpdated(balance) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('casino:balance-updated', { detail: { balance } })
    );
  }
}

function roundMultiplier(value) {
  if (value >= 1000) return Math.round(value);
  if (value >= 100) return Number(value.toFixed(1));
  if (value >= 10) return Number(value.toFixed(2));
  return Number(value.toFixed(3));
}

function getMultiplier(modeKey, clearedLevels) {
  if (clearedLevels <= 0) return 1;
  const mode = MODE_CONFIG[modeKey];
  const factor = mode.tileCount / mode.safeCount;
  return roundMultiplier(RTP * Math.pow(factor, clearedLevels));
}

function getRandomSafeIndices(tileCount, safeCount) {
  const arr = Array.from({ length: tileCount }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, safeCount).sort((a, b) => a - b);
}

function createTower(modeKey) {
  const mode = MODE_CONFIG[modeKey];
  return Array.from({ length: LEVELS }, (_, level) => ({
    level,
    safeIndices: getRandomSafeIndices(mode.tileCount, mode.safeCount),
    pickedIndex: null,
    resolved: false,
    won: null
  }));
}

export default function DragonTowerPage() {
  const [bet, setBet] = useState('10');
  const [userBalance, setUserBalance] = useState(0);
  const [mode, setMode] = useState('easy');
  const [tower, setTower] = useState(() => createTower('easy'));
  const [phase, setPhase] = useState('idle');
  const [currentLevel, setCurrentLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Choose your mode and start climbing.');
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

    // جلب الرصيد
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

  const currentMultiplier = useMemo(() => currentLevel > 0 ? getMultiplier(mode, currentLevel) : 0, [mode, currentLevel]);
  const nextMultiplier = useMemo(() => currentLevel >= LEVELS ? currentMultiplier : getMultiplier(mode, currentLevel + 1), [mode, currentLevel, currentMultiplier]);
  const currentPayout = useMemo(() => Math.floor((Number(bet) || 0) * currentMultiplier), [bet, currentMultiplier]);
  const nextPayout = useMemo(() => Math.floor((Number(bet) || 0) * nextMultiplier), [bet, nextMultiplier]);
  const displayRows = useMemo(() => [...tower].reverse(), [tower]);
  const nextSafeChance = useMemo(() => phase !== 'playing' ? null : ((modeConfig.safeCount / modeConfig.tileCount) * 100).toFixed(2), [phase, modeConfig]);

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

  function resetTowerConfig(nextMode = mode) {
    if (phase === 'playing' || busy) return;
    setTower(createTower(nextMode));
    setPhase('idle');
    setCurrentLevel(0);
    setBusy(false);
    setMessage('Choose your mode and start climbing.');
    setLastPayout(0);
    setRoundId(null);
  }

  async function startRound() {
    const amount = Number(bet);
    if (busy) return;
    if (!amount || amount <= 0) { setMessage('Enter a valid bet amount.'); return; }
    setBusy(true);
    setMessage('Starting round...');

    const betRes = await placeBet(undefined, amount, 'dragonTower', `dragon tower ${mode}`, { mode, levels: LEVELS, tileCount: modeConfig.tileCount, safeCount: modeConfig.safeCount });
    if (!betRes.ok) { setBusy(false); setMessage(betRes.error || 'Bet failed'); return; }

    emitBalanceUpdated(betRes.balance);
    setRoundId(betRes.roundId);
    setTower(createTower(mode));
    setPhase('playing');
    setCurrentLevel(0);
    setLastPayout(0);
    setMessage('Round started. Pick a tile on level 1.');
    setBusy(false);
  }

  async function finalizeWin(payout, reason, levelsCleared, completed = false) {
    if (!roundId) { setBusy(false); setMessage('Missing roundId.'); return false; }
    setBusy(true);

    const settleRes = await settleGame(undefined, roundId, payout, 'dragonTower', reason, { mode, levelsCleared, completed, multiplier: getMultiplier(mode, levelsCleared), bet: Number(bet) || 0 }, 'win');
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
    const settleRes = await settleGame(undefined, roundId, 0, 'dragonTower', `dragon tower loss at level ${levelsCleared + 1}`, { mode, levelsCleared, bet: Number(bet) || 0 }, 'loss');
    if (!settleRes.ok) { setBusy(false); setMessage(settleRes.error || 'Failed to settle round.'); return; }

    emitBalanceUpdated(settleRes.balance);
    setRoundId(null);
    setPhase('lost');
    setBusy(false);
    setLastPayout(0);
    setMessage('The dragon got you. Round lost.');
    setHistory((prev) => [{ type: 'lose', payout: 0, levels: levelsCleared, multiplier: 0, mode }, ...prev].slice(0, 3));
  }

  async function pickTile(tileIndex) {
    if (busy || phase !== 'playing' || currentLevel >= LEVELS) return;
    const row = tower[currentLevel];
    if (row.resolved) return;

    const isSafe = row.safeIndices.includes(tileIndex);
    const updatedTower = tower.map((entry, idx) => idx !== currentLevel ? entry : { ...entry, pickedIndex: tileIndex, resolved: true, won: isSafe });

    setTower(updatedTower);
    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 250));

    if (!isSafe) { await finalizeLoss(currentLevel); return; }

    const cleared = currentLevel + 1;
    const completed = cleared >= LEVELS;

    if (completed) {
      const finalMultiplier = getMultiplier(mode, cleared);
      const payout = Math.floor((Number(bet) || 0) * finalMultiplier);
      setCurrentLevel(cleared);
      setMessage(`Top reached. Settling $${payout}...`);
      const ok = await finalizeWin(payout, `dragon tower completed x${finalMultiplier}`, cleared, true);
      if (ok) setMessage(`Tower completed. Payout: $${payout}`);
      return;
    }

    setCurrentLevel(cleared);
    setBusy(false);
    setMessage(`Safe tile found. Level ${cleared} cleared. Next multiplier x${getMultiplier(mode, cleared + 1)}.`);
  }

  function pickRandomTile() {
    if (busy || phase !== 'playing' || currentLevel >= LEVELS) return;
    const row = tower[currentLevel];
    if (row.resolved) return;
    pickTile(Math.floor(Math.random() * modeConfig.tileCount));
  }

  async function cashOut() {
    if (busy || phase !== 'playing' || currentLevel <= 0) {
      if (currentLevel <= 0) setMessage('Clear at least one level before cashing out.');
      return;
    }
    const payout = Math.floor((Number(bet) || 0) * currentMultiplier);
    setMessage(`Cashing out $${payout}...`);
    const ok = await finalizeWin(payout, `dragon tower cashout x${currentMultiplier}`, currentLevel, false);
    if (ok) setMessage(`Cashed out successfully: $${payout}`);
  }

  return (
    <PageShell title="Dragon Tower">
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(340px, 390px) minmax(0, 1fr)', gap: isMobile ? 16 : 24, alignItems: 'start' }}>
        
        {/* Controls Section */}
        <div style={{ background: '#1a2c38', borderRadius: isMobile ? 20 : 24, padding: isMobile ? 16 : 20, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', minWidth: 0, order: isMobile ? 2 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 900 }}>Manual</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: phase === 'playing' ? '#00e701' : phase === 'lost' ? '#ff8d8d' : (phase === 'cashed' || phase === 'completed') ? '#7df9a6' : '#b1bad3' }}>
              {phase === 'playing' ? 'CLIMBING' : phase === 'lost' ? 'LOST' : phase === 'cashed' ? 'CASHED OUT' : phase === 'completed' ? 'COMPLETED' : 'READY'}
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

            {/* الصف الثاني: أزرار النسب من الرصيد الكلي */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              <button onClick={() => setFractionBet(0.25)} disabled={phase === 'playing' || busy} style={actionBtn}>1/4</button>
              <button onClick={() => setFractionBet(0.5)} disabled={phase === 'playing' || busy} style={actionBtn}>1/2</button>
              <button onClick={() => setFractionBet(0.75)} disabled={phase === 'playing' || busy} style={actionBtn}>3/4</button>
              <button onClick={() => setFractionBet(1)} disabled={phase === 'playing' || busy} style={actionBtn}>Full</button>
            </div>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>Difficulty</div>
          <select value={mode} onChange={(e) => { setMode(e.target.value); resetTowerConfig(e.target.value); }} disabled={phase === 'playing' || busy} style={{ ...selectStyle, marginBottom: 18, opacity: phase === 'playing' || busy ? 0.6 : 1 }}>
            {Object.entries(MODE_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
          </select>

          <button onClick={startRound} disabled={phase === 'playing' || busy} style={{ width: '100%', borderRadius: 14, background: '#00e701', color: 'black', fontWeight: 900, padding: '15px 16px', border: 'none', cursor: 'pointer', opacity: phase === 'playing' || busy ? 0.65 : 1, transition: 'transform 0.05s ease', fontSize: isMobile ? 15 : 16 }}>
            {busy && phase !== 'playing' ? 'Starting...' : phase === 'playing' ? 'Game Running' : 'Bet'}
          </button>

          <button onClick={cashOut} disabled={phase !== 'playing' || currentLevel <= 0 || busy} style={{ width: '100%', borderRadius: 14, background: '#2f4553', color: 'white', fontWeight: 800, padding: '15px 16px', border: 'none', cursor: 'pointer', marginTop: 10, opacity: phase !== 'playing' || currentLevel <= 0 || busy ? 0.6 : 1, fontSize: isMobile ? 15 : 16 }}>
            {busy && phase === 'playing' ? 'Processing...' : `Cash Out $${currentPayout}`}
          </button>

          <button onClick={pickRandomTile} disabled={phase !== 'playing' || busy} style={{ width: '100%', borderRadius: 14, background: '#233847', color: 'white', fontWeight: 700, padding: '13px 16px', border: 'none', cursor: phase === 'playing' && !busy ? 'pointer' : 'default', marginTop: 10, opacity: phase !== 'playing' || busy ? 0.6 : 1, fontSize: isMobile ? 14 : 15 }}>
            Random Pick
          </button>

          <div style={{ marginTop: 16, color: phase === 'lost' ? '#ff8d8d' : (phase === 'cashed' || phase === 'completed') ? '#7df9a6' : '#b1bad3', minHeight: 22, lineHeight: 1.6, fontSize: isMobile ? 14 : 15 }}>{message}</div>

          <div style={{ background: '#132634', borderRadius: 18, padding: isMobile ? 14 : 16, border: '1px solid rgba(255,255,255,0.05)', lineHeight: 1.9, marginTop: 18 }}>
            <div style={statRow}><span style={statLabel}>Cleared levels</span><span style={statValue}>{currentLevel}</span></div>
            <div style={statRow}><span style={statLabel}>Current multiplier</span><span style={{ ...statValue, color: '#00e701' }}>{currentLevel > 0 ? `x${currentMultiplier}` : '-'}</span></div>
            <div style={statRow}><span style={statLabel}>Next multiplier</span><span style={statValue}>{currentLevel < LEVELS ? `x${nextMultiplier}` : '-'}</span></div>
            <div style={statRow}><span style={statLabel}>Current payout</span><span style={statValue}>${currentPayout}</span></div>
          </div>

          {/* History */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Last Results</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {history.length === 0 ? <div style={{ background: '#132634', borderRadius: 14, padding: 14, color: '#b1bad3' }}>No climbs yet.</div> : history.map((item, index) => (
                <div key={index} style={{ background: '#132634', borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: item.type === 'win' ? '#00e701' : 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.type === 'lose' ? 'Lose' : `Win · x${item.multiplier}`}</div>
                    <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 4 }}>{item.mode.toUpperCase()} · Level {item.levels}</div>
                  </div>
                  <div style={{ fontWeight: 900 }}>${item.payout}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Game Board */}
        <div style={{ background: '#1a2c38', borderRadius: isMobile ? 20 : 24, padding: isMobile ? 16 : 24, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', minWidth: 0, order: isMobile ? 1 : 2 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <div style={{ background: 'radial-gradient(circle at top, rgba(68,98,121,0.38), rgba(15,33,46,0.98) 65%)', borderRadius: 22, padding: isMobile ? '16px 10px' : '30px 20px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: isMobile ? 'auto' : 700, width: '100%', maxWidth: isMobile ? '100%' : '440px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 6 : 8, width: '100%' }}>
                {displayRows.map((row) => {
                  const active = phase === 'playing' && row.level === currentLevel;
                  return (
                    <div key={row.level} style={{ display: 'grid', gridTemplateColumns: `repeat(${modeConfig.tileCount}, 1fr)`, gap: isMobile ? 8 : 10, padding: isMobile ? 6 : 8, borderRadius: isMobile ? 16 : 18, border: active ? '2px solid rgba(0, 231, 1, 0.7)' : '2px solid transparent', background: active ? 'rgba(0, 231, 1, 0.05)' : 'transparent', transition: 'all 0.2s ease', position: 'relative', zIndex: active ? 2 : 1 }}>
                      {Array.from({ length: modeConfig.tileCount }, (_, tileIndex) => {
                        const revealed = row.resolved;
                        const isSafe = row.safeIndices.includes(tileIndex);
                        const isPicked = row.pickedIndex === tileIndex;
                        return (
                          <button key={tileIndex} onClick={() => pickTile(tileIndex)} disabled={!active || busy || row.resolved} style={{ height: isMobile ? 50 : 54, borderRadius: isMobile ? 12 : 14, border: isPicked ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.06)', background: revealed ? (isSafe ? 'linear-gradient(180deg, #2e8b57, #216944)' : 'linear-gradient(180deg, #8b1e2f, #681523)') : (row.level > currentLevel ? 'linear-gradient(180deg, #223543, #1a2b37)' : 'linear-gradient(180deg, #2b4150, #233847)'), color: 'white', fontSize: isMobile ? 24 : 26, fontWeight: 900, cursor: active && !busy && !row.resolved ? 'pointer' : 'default', transition: 'transform 0.12s ease', boxShadow: isPicked ? '0 10px 20px rgba(0,0,0,0.18)' : '0 6px 12px rgba(0,0,0,0.12)' }}>
                            {revealed ? (isSafe ? '🥚' : '🐉') : ''}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

const inputStyle = { width: '100%', borderRadius: 14, background: '#0f212e', border: '1px solid rgba(255,255,255,0.1)', padding: '14px 16px', color: 'white' };
const selectStyle = { ...inputStyle, cursor: 'pointer', outline: 'none' };
const actionBtn = { background: '#233847', color: 'white', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 0', cursor: 'pointer', fontWeight: 800, fontSize: 13, textAlign: 'center' };
const statRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 };
const statLabel = { color: '#b1bad3' };
const statValue = { color: 'white', fontWeight: 800, textAlign: 'right' };
