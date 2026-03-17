import { useMemo, useState } from 'react';
import PageShell from '../components/PageShell';
import { placeBet, settleGame } from '../lib/api';

const LEVELS = 9;
const RTP = 0.98;

const MODE_CONFIG = {
  easy: {
    label: 'Easy',
    safeCount: 3,
    tileCount: 4,
    color: '#2d8a5b'
  },
  medium: {
    label: 'Medium',
    safeCount: 2,
    tileCount: 3,
    color: '#3c78a8'
  },
  hard: {
    label: 'Hard',
    safeCount: 1,
    tileCount: 2,
    color: '#b7791f'
  },
  expert: {
    label: 'Expert',
    safeCount: 1,
    tileCount: 3,
    color: '#c05621'
  },
  master: {
    label: 'Master',
    safeCount: 1,
    tileCount: 4,
    color: '#c53030'
  }
};

function emitBalanceUpdated(balance) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('casino:balance-updated', {
        detail: { balance }
      })
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
  const [mode, setMode] = useState('easy');
  const [tower, setTower] = useState(() => createTower('easy'));
  const [phase, setPhase] = useState('idle'); // idle | playing | lost | cashed | completed
  const [currentLevel, setCurrentLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Choose your mode and start climbing.');
  const [lastPayout, setLastPayout] = useState(0);
  const [history, setHistory] = useState([]);
  const [roundId, setRoundId] = useState(null);

  const modeConfig = MODE_CONFIG[mode];

  const currentMultiplier = useMemo(() => {
    return currentLevel > 0 ? getMultiplier(mode, currentLevel) : 0;
  }, [mode, currentLevel]);

  const nextMultiplier = useMemo(() => {
    if (currentLevel >= LEVELS) return currentMultiplier;
    return getMultiplier(mode, currentLevel + 1);
  }, [mode, currentLevel, currentMultiplier]);

  const currentPayout = useMemo(() => {
    return Math.floor((Number(bet) || 0) * currentMultiplier);
  }, [bet, currentMultiplier]);

  const nextPayout = useMemo(() => {
    return Math.floor((Number(bet) || 0) * nextMultiplier);
  }, [bet, nextMultiplier]);

  const ladder = useMemo(() => {
    return Array.from({ length: LEVELS }, (_, i) => ({
      level: i + 1,
      multiplier: getMultiplier(mode, i + 1)
    }));
  }, [mode]);

  const displayRows = useMemo(() => {
    return [...tower].reverse();
  }, [tower]);

  function multiplyBet() {
    setBet(String((Number(bet) || 0) * 2));
  }

  function divideBet() {
    const newBet = (Number(bet) || 0) / 2;
    setBet(String(newBet < 1 ? 1 : newBet));
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

    if (!amount || amount <= 0) {
      setMessage('Enter a valid bet amount.');
      return;
    }

    setBusy(true);
    setMessage('Starting round...');

    const betRes = await placeBet(
      undefined,
      amount,
      'dragonTower',
      `dragon tower ${mode}`,
      { mode, levels: LEVELS, tileCount: modeConfig.tileCount, safeCount: modeConfig.safeCount }
    );

    if (!betRes.ok) {
      setBusy(false);
      setMessage(betRes.error || 'Bet failed');
      return;
    }

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
    if (!roundId) {
      setBusy(false);
      setMessage('Missing roundId.');
      return false;
    }

    setBusy(true);

    const settleRes = await settleGame(
      undefined,
      roundId,
      payout,
      'dragonTower',
      reason,
      {
        mode,
        levelsCleared,
        completed,
        multiplier: getMultiplier(mode, levelsCleared),
        bet: Number(bet) || 0
      },
      'win'
    );

    if (!settleRes.ok) {
      setBusy(false);
      setMessage(settleRes.error || 'Failed to settle payout.');
      return false;
    }

    emitBalanceUpdated(settleRes.balance);

    setRoundId(null);
    setPhase(completed ? 'completed' : 'cashed');
    setLastPayout(payout);
    setHistory((prev) => [
      {
        type: 'win',
        payout,
        levels: levelsCleared,
        multiplier: getMultiplier(mode, levelsCleared),
        mode
      },
      ...prev
    ].slice(0, 8));
    setBusy(false);
    return true;
  }

  async function finalizeLoss(levelsCleared) {
    if (!roundId) {
      setBusy(false);
      setMessage('Missing roundId.');
      return;
    }

    const settleRes = await settleGame(
      undefined,
      roundId,
      0,
      'dragonTower',
      `dragon tower loss at level ${levelsCleared + 1}`,
      {
        mode,
        levelsCleared,
        bet: Number(bet) || 0
      },
      'loss'
    );

    if (!settleRes.ok) {
      setBusy(false);
      setMessage(settleRes.error || 'Failed to settle round.');
      return;
    }

    emitBalanceUpdated(settleRes.balance);

    setRoundId(null);
    setPhase('lost');
    setBusy(false);
    setLastPayout(0);
    setMessage('The dragon got you. Round lost.');
    setHistory((prev) => [
      {
        type: 'lose',
        payout: 0,
        levels: levelsCleared,
        multiplier: 0,
        mode
      },
      ...prev
    ].slice(0, 8));
  }

  async function pickTile(tileIndex) {
    if (busy) return;
    if (phase !== 'playing') return;
    if (currentLevel >= LEVELS) return;

    const row = tower[currentLevel];
    if (row.resolved) return;

    const isSafe = row.safeIndices.includes(tileIndex);

    const updatedTower = tower.map((entry, idx) => {
      if (idx !== currentLevel) return entry;
      return {
        ...entry,
        pickedIndex: tileIndex,
        resolved: true,
        won: isSafe
      };
    });

    setTower(updatedTower);
    setBusy(true);

    await new Promise((resolve) => setTimeout(resolve, 250));

    if (!isSafe) {
      await finalizeLoss(currentLevel);
      return;
    }

    const cleared = currentLevel + 1;
    const completed = cleared >= LEVELS;

    if (completed) {
      const finalMultiplier = getMultiplier(mode, cleared);
      const payout = Math.floor((Number(bet) || 0) * finalMultiplier);
      setCurrentLevel(cleared);
      setMessage(`Top reached. Settling $${payout}...`);

      const ok = await finalizeWin(
        payout,
        `dragon tower completed x${finalMultiplier}`,
        cleared,
        true
      );

      if (ok) {
        setMessage(`Tower completed. Payout: $${payout}`);
      }
      return;
    }

    setCurrentLevel(cleared);
    setBusy(false);
    setMessage(
      `Safe tile found. Level ${cleared} cleared. Next multiplier x${getMultiplier(mode, cleared + 1)}.`
    );
  }

  function pickRandomTile() {
    if (busy || phase !== 'playing' || currentLevel >= LEVELS) return;
    const row = tower[currentLevel];
    if (row.resolved) return;

    const randomIndex = Math.floor(Math.random() * modeConfig.tileCount);
    pickTile(randomIndex);
  }

  async function cashOut() {
    if (busy) return;
    if (phase !== 'playing') return;
    if (currentLevel <= 0) {
      setMessage('Clear at least one level before cashing out.');
      return;
    }

    const payout = Math.floor((Number(bet) || 0) * currentMultiplier);
    setMessage(`Cashing out $${payout}...`);

    const ok = await finalizeWin(
      payout,
      `dragon tower cashout x${currentMultiplier}`,
      currentLevel,
      false
    );

    if (ok) {
      setMessage(`Cashed out successfully: $${payout}`);
    }
  }

  return (
    <PageShell title="Dragon Tower">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '400px 1fr',
          gap: 24
        }}
      >
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
                color:
                  phase === 'playing'
                    ? '#00e701'
                    : phase === 'lost'
                    ? '#ff8d8d'
                    : phase === 'cashed' || phase === 'completed'
                    ? '#7df9a6'
                    : '#b1bad3'
              }}
            >
              {phase === 'playing'
                ? 'CLIMBING'
                : phase === 'lost'
                ? 'LOST'
                : phase === 'cashed'
                ? 'CASHED OUT'
                : phase === 'completed'
                ? 'COMPLETED'
                : 'READY'}
            </div>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>
            Bet Amount
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <input
              type="number"
              min="1"
              value={bet}
              onChange={(e) => setBet(e.target.value)}
              disabled={phase === 'playing' || busy}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={divideBet} disabled={phase === 'playing' || busy} style={actionBtn}>
              1/2
            </button>
            <button onClick={multiplyBet} disabled={phase === 'playing' || busy} style={actionBtn}>
              2x
            </button>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>
            Difficulty
          </div>
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              resetTowerConfig(e.target.value);
            }}
            disabled={phase === 'playing' || busy}
            style={{ ...selectStyle, marginBottom: 18, opacity: phase === 'playing' || busy ? 0.6 : 1 }}
          >
            {Object.entries(MODE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </select>

          <div
            style={{
              background: '#132634',
              borderRadius: 18,
              padding: 16,
              border: '1px solid rgba(255,255,255,0.05)',
              lineHeight: 1.9
            }}
          >
            <div style={statRow}>
              <span style={statLabel}>Cleared levels</span>
              <span style={statValue}>{currentLevel}</span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Current multiplier</span>
              <span style={{ ...statValue, color: '#00e701' }}>
                {currentLevel > 0 ? `x${currentMultiplier}` : '-'}
              </span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Next multiplier</span>
              <span style={statValue}>{currentLevel < LEVELS ? `x${nextMultiplier}` : '-'}</span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Current payout</span>
              <span style={statValue}>${currentPayout}</span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Next payout</span>
              <span style={statValue}>${nextPayout}</span>
            </div>
          </div>

          <button
            onClick={startRound}
            disabled={phase === 'playing' || busy}
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
              opacity: phase === 'playing' || busy ? 0.65 : 1,
              transition: 'transform 0.05s ease',
            }}
            onMouseDown={(e) => phase !== 'playing' && !busy && (e.currentTarget.style.transform = 'scale(0.97)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {busy && phase !== 'playing' ? 'Starting...' : phase === 'playing' ? 'Game Running' : 'Bet'}
          </button>

          <button
            onClick={cashOut}
            disabled={phase !== 'playing' || currentLevel <= 0 || busy}
            style={{
              width: '100%',
              borderRadius: 14,
              background: '#2f4553',
              color: 'white',
              fontWeight: 800,
              padding: '15px 16px',
              border: 'none',
              cursor: 'pointer',
              marginTop: 10,
              opacity: phase !== 'playing' || currentLevel <= 0 || busy ? 0.6 : 1
            }}
          >
            {busy && phase === 'playing' ? 'Processing...' : `Cash Out $${currentPayout}`}
          </button>

          <button
            onClick={pickRandomTile}
            disabled={phase !== 'playing' || busy}
            style={{
              width: '100%',
              borderRadius: 14,
              background: '#233847',
              color: 'white',
              fontWeight: 700,
              padding: '13px 16px',
              border: 'none',
              cursor: phase === 'playing' && !busy ? 'pointer' : 'default',
              marginTop: 10,
              opacity: phase !== 'playing' || busy ? 0.6 : 1
            }}
          >
            Random Pick
          </button>

          <div
            style={{
              marginTop: 16,
              color:
                phase === 'lost'
                  ? '#ff8d8d'
                  : phase === 'cashed' || phase === 'completed'
                  ? '#7df9a6'
                  : '#b1bad3',
              minHeight: 22,
              lineHeight: 1.6
            }}
          >
            {message}
          </div>
        </div>

        <div
          style={{
            background: '#1a2c38',
            borderRadius: 24,
            padding: 24,
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.18)'
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 220px',
              gap: 24,
              alignItems: 'start'
            }}
          >
            <div
              style={{
                background:
                  'radial-gradient(circle at top, rgba(68,98,121,0.38), rgba(15,33,46,0.98) 65%)',
                borderRadius: 22,
                padding: '30px 20px',
                border: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 760,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                {displayRows.map((row) => {
                  const realLevel = row.level;
                  const active = phase === 'playing' && realLevel === currentLevel;
                  const future = realLevel > currentLevel;

                  return (
                    <div
                      key={realLevel}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${modeConfig.tileCount}, 1fr)`,
                        gap: 12,
                        padding: 8,
                        borderRadius: 20,
                        border: active ? '2px solid rgba(0, 231, 1, 0.7)' : '2px solid transparent',
                        background: active ? 'rgba(0, 231, 1, 0.05)' : 'transparent',
                        boxShadow: active ? '0 0 18px rgba(0, 231, 1, 0.25), inset 0 0 10px rgba(0, 231, 1, 0.15)' : 'none',
                        transition: 'all 0.2s ease',
                        position: 'relative',
                        zIndex: active ? 2 : 1
                      }}
                    >
                      {Array.from({ length: modeConfig.tileCount }, (_, tileIndex) => {
                        const revealed = row.resolved;
                        const isSafe = row.safeIndices.includes(tileIndex);
                        const isPicked = row.pickedIndex === tileIndex;

                        return (
                          <button
                            key={tileIndex}
                            onClick={() => pickTile(tileIndex)}
                            disabled={!active || busy || row.resolved}
                            style={{
                              height: 64,
                              borderRadius: 14,
                              border: isPicked
                                ? '1px solid rgba(255,255,255,0.18)'
                                : '1px solid rgba(255,255,255,0.06)',
                              background: revealed
                                ? isSafe
                                  ? 'linear-gradient(180deg, #2e8b57, #216944)'
                                  : 'linear-gradient(180deg, #8b1e2f, #681523)'
                                : future
                                ? 'linear-gradient(180deg, #223543, #1a2b37)'
                                : 'linear-gradient(180deg, #2b4150, #233847)',
                              color: 'white',
                              fontSize: 30,
                              fontWeight: 900,
                              cursor: active && !busy && !row.resolved ? 'pointer' : 'default',
                              transition: 'transform 0.12s ease, box-shadow 0.16s ease, background 0.16s ease',
                              boxShadow: isPicked
                                ? '0 10px 20px rgba(0,0,0,0.18)'
                                : '0 6px 12px rgba(0,0,0,0.12)'
                            }}
                            onMouseEnter={(e) => {
                              if (active && !busy && !row.resolved) {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'translateY(0px)';
                            }}
                          >
                            {revealed ? (isSafe ? '🥚' : '🐉') : ''}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                background: '#132634',
                borderRadius: 22,
                padding: 16,
                border: '1px solid rgba(255,255,255,0.05)'
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
                Ladder
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {[...ladder].reverse().map((item) => {
                  const active = item.level === currentLevel + 1 && phase === 'playing';
                  const cleared = item.level <= currentLevel;

                  return (
                    <div
                      key={item.level}
                      style={{
                        background: active
                          ? 'linear-gradient(180deg, #2f4553, #233847)'
                          : cleared
                          ? 'linear-gradient(180deg, #245b3d, #1d4d33)'
                          : '#1a2c38',
                        border: active
                          ? '1px solid rgba(0,231,1,0.3)'
                          : '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 14,
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>L{item.level}</div>
                      <div style={{ fontWeight: 900, color: active ? '#00e701' : 'white' }}>
                        x{item.multiplier}
                      </div>
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

const inputStyle = {
  width: '100%',
  borderRadius: 14,
  background: '#0f212e',
  border: '1px solid rgba(255,255,255,0.1)',
  padding: '14px 16px',
  color: 'white'
};

const selectStyle = {
  width: '100%',
  borderRadius: 14,
  background: '#0f212e',
  border: '1px solid rgba(255,255,255,0.1)',
  padding: '14px 16px',
  color: 'white',
  cursor: 'pointer',
  outline: 'none'
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
