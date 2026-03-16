import { useMemo, useState } from 'react';
import PageShell from '../components/PageShell';
import { mockDiscordUser } from '../lib/mockUser';
import { placeBet, settleGame } from '../lib/api';

const GRID_SIZE = 25;
const HOUSE_EDGE = 0.99;
const MINE_OPTIONS = [1, 3, 5, 7, 10, 15, 20];

function combination(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;

  let result = 1;
  const m = Math.min(k, n - k);

  for (let i = 1; i <= m; i++) {
    result = (result * (n - m + i)) / i;
  }

  return result;
}

function calcMultiplier(mines, safePicks) {
  if (safePicks <= 0) return 1;

  const totalTiles = 25;
  const safeTiles = totalTiles - mines;

  if (safePicks > safeTiles) return 1;

  const fair = combination(totalTiles, safePicks) / combination(safeTiles, safePicks);
  return Number((fair * HOUSE_EDGE).toFixed(2));
}

function createBoard(minesCount) {
  const mines = new Set();

  while (mines.size < minesCount) {
    mines.add(Math.floor(Math.random() * GRID_SIZE));
  }

  return Array.from({ length: GRID_SIZE }, (_, i) => ({
    id: i,
    isMine: mines.has(i),
    revealed: false
  }));
}

export default function MinesPage() {
  const [bet, setBet] = useState('10');
  const [minesCount, setMinesCount] = useState(3);
  const [board, setBoard] = useState(() => createBoard(3));
  const [phase, setPhase] = useState('idle'); // idle | playing | lost | cashed
  const [message, setMessage] = useState('Choose your bet and start the round.');
  const [busy, setBusy] = useState(false);
  const [lastPayout, setLastPayout] = useState(0);

  const revealedSafeCount = useMemo(() => {
    return board.filter((tile) => tile.revealed && !tile.isMine).length;
  }, [board]);

  const currentMultiplier = useMemo(() => {
    return calcMultiplier(minesCount, revealedSafeCount);
  }, [minesCount, revealedSafeCount]);

  const nextMultiplier = useMemo(() => {
    return calcMultiplier(minesCount, revealedSafeCount + 1);
  }, [minesCount, revealedSafeCount]);

  const potentialPayout = useMemo(() => {
    return Math.floor((Number(bet) || 0) * currentMultiplier);
  }, [bet, currentMultiplier]);

  const nextPayout = useMemo(() => {
    return Math.floor((Number(bet) || 0) * nextMultiplier);
  }, [bet, nextMultiplier]);

  // حساب عدد الجواهر المتبقية
  const remainingGems = useMemo(() => {
    const totalGems = 25 - minesCount;
    return totalGems - revealedSafeCount;
  }, [minesCount, revealedSafeCount]);

  function multiplyBet() {
    setBet(String((Number(bet) || 0) * 2));
  }

  function divideBet() {
    const newBet = (Number(bet) || 0) / 2;
    setBet(String(newBet < 1 ? 1 : newBet));
  }

  function resetBoardConfig(newMinesCount) {
    if (phase === 'playing') return;
    setBoard(createBoard(newMinesCount));
    setPhase('idle');
    setMessage('Choose your bet and start the round.');
    setLastPayout(0);
    setBusy(false);
  }

  async function startGame() {
    const amount = Number(bet);

    if (busy) return;

    if (!amount || amount <= 0) {
      setMessage('Enter a valid bet amount.');
      return;
    }

    if (minesCount < 1 || minesCount > 24) {
      setMessage('Mines count must be between 1 and 24.');
      return;
    }

    setBusy(true);
    setMessage('Starting round...');

    const betRes = await placeBet(
      mockDiscordUser.id,
      amount,
      'mines',
      `mines start with ${minesCount} mines`
    );

    if (!betRes.ok) {
      setBusy(false);
      setMessage(betRes.error || 'Bet failed');
      return;
    }

    setBoard(createBoard(minesCount));
    setPhase('playing');
    setMessage('Round started. Pick a tile.');
    setLastPayout(0);
    setBusy(false);
  }

  async function finishWin(payout, reasonText) {
    setBusy(true);

    const res = await settleGame(
      mockDiscordUser.id,
      payout,
      'mines',
      reasonText
    );

    if (!res.ok) {
      setMessage(res.error || 'Failed to settle payout.');
      setBusy(false);
      return;
    }

    setPhase('cashed');
    setLastPayout(payout);
    setBusy(false);
  }

  async function revealTile(index) {
    if (busy) return;
    if (phase !== 'playing') return;
    if (board[index].revealed) return;

    const nextBoard = [...board];
    nextBoard[index] = { ...nextBoard[index], revealed: true };

    if (nextBoard[index].isMine) {
      const fullyRevealed = nextBoard.map((tile) => ({
        ...tile,
        revealed: true
      }));

      setBoard(fullyRevealed);
      setPhase('lost');
      setLastPayout(0);
      setMessage('Boom! You hit a mine.');
      return;
    }

    const safeRevealed = nextBoard.filter((tile) => tile.revealed && !tile.isMine).length;
    const safeTotal = 25 - minesCount;
    const newMultiplier = calcMultiplier(minesCount, safeRevealed);

    setBoard(nextBoard);

    if (safeRevealed >= safeTotal) {
      const payout = Math.floor((Number(bet) || 0) * newMultiplier);
      setMessage(`Perfect round! Auto cashout: $${payout}`);
      await finishWin(payout, `mines perfect clear x${newMultiplier}`);
      return;
    }

    setMessage(`Safe pick! Current multiplier: x${newMultiplier}`);
  }

  function pickRandomTile() {
    if (busy || phase !== 'playing') return;
    
    // إيجاد جميع الخلايا غير المفتوحة
    const unrevealedIndices = board
      .map((tile, idx) => (!tile.revealed ? idx : -1))
      .filter((idx) => idx !== -1);

    if (unrevealedIndices.length > 0) {
      const randomIndex = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
      revealTile(randomIndex);
    }
  }

  async function cashOut() {
    if (busy) return;
    if (phase !== 'playing') return;
    if (revealedSafeCount <= 0) {
      setMessage('Pick at least one safe tile before cashing out.');
      return;
    }

    const payout = Math.floor((Number(bet) || 0) * currentMultiplier);
    setMessage(`Cashing out $${payout}...`);

    await finishWin(payout, `mines cashout x${currentMultiplier}`);
    setMessage(`Cashed out successfully: $${payout}`);
  }

  const gameEnded = phase === 'lost' || phase === 'cashed';

  return (
    <PageShell title="Mines">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '390px 1fr',
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
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 18
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 24 }}>Manual</div>
            <div
              style={{
                fontSize: 12,
                color:
                  phase === 'playing'
                    ? '#00e701'
                    : phase === 'lost'
                    ? '#ff8d8d'
                    : phase === 'cashed'
                    ? '#7df9a6'
                    : '#b1bad3',
                fontWeight: 800
              }}
            >
              {phase === 'playing'
                ? 'ACTIVE'
                : phase === 'lost'
                ? 'LOST'
                : phase === 'cashed'
                ? 'CASHED OUT'
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
            Remaining Gems
          </div>
          
          <div
            style={{
              ...inputStyle,
              marginBottom: 18,
              background: '#132634',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <span>💎</span>
            <span style={{ fontWeight: 900, fontSize: 16, color: '#00e701' }}>
              {remainingGems}
            </span>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>
            Mines
          </div>

          <select
            value={minesCount}
            onChange={(e) => {
              const val = Number(e.target.value);
              setMinesCount(val);
              resetBoardConfig(val);
            }}
            disabled={phase === 'playing' || busy}
            style={{ ...selectStyle, opacity: phase === 'playing' || busy ? 0.6 : 1 }}
          >
            {MINE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <div
            style={{
              background: '#132634',
              borderRadius: 18,
              padding: 16,
              marginTop: 18,
              lineHeight: 1.9,
              border: '1px solid rgba(255,255,255,0.05)'
            }}
          >
            <div style={statRow}>
              <span style={statLabel}>Safe picks</span>
              <span style={statValue}>{revealedSafeCount}</span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Current multiplier</span>
              <span style={{ ...statValue, color: '#00e701' }}>x{currentMultiplier}</span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Next multiplier</span>
              <span style={statValue}>x{nextMultiplier}</span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Current payout</span>
              <span style={statValue}>${potentialPayout}</span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Next payout</span>
              <span style={statValue}>${nextPayout}</span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Last payout</span>
              <span style={statValue}>${lastPayout}</span>
            </div>
          </div>

          <button
            onClick={startGame}
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
            disabled={phase !== 'playing' || revealedSafeCount <= 0 || busy}
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
              opacity: phase !== 'playing' || revealedSafeCount <= 0 || busy ? 0.6 : 1
            }}
          >
            {busy && phase === 'playing' ? 'Cashing Out...' : `Cash Out $${potentialPayout}`}
          </button>

          {/* New Random Pick Button */}
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
            Pick Random Tile
          </button>

          <div
            style={{
              marginTop: 16,
              color:
                phase === 'lost'
                  ? '#ff8d8d'
                  : phase === 'cashed'
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 18
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 900 }}>Board</div>
            <div style={{ color: '#b1bad3', fontSize: 14 }}>
              5 × 5 Grid · {minesCount} Mines
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 14
            }}
          >
            {board.map((tile, index) => {
              const unrevealed = !tile.revealed;
              const safe = tile.revealed && !tile.isMine;

              return (
                <button
                  key={tile.id}
                  onClick={() => revealTile(index)}
                  disabled={phase !== 'playing' || busy || tile.revealed}
                  style={{
                    aspectRatio: '1 / 1',
                    borderRadius: 18,
                    border: '1px solid rgba(255,255,255,0.06)',
                    background: unrevealed
                      ? 'linear-gradient(180deg, #2b4150, #233847)'
                      : safe
                      ? 'linear-gradient(180deg, #245b3d, #1d4d33)'
                      : 'linear-gradient(180deg, #7f1d1d, #5f1414)',
                    color: 'white',
                    fontSize: 28,
                    fontWeight: 900,
                    cursor:
                      phase === 'playing' && !busy && !tile.revealed ? 'pointer' : 'default',
                    transition:
                      'transform 0.12s ease, background 0.18s ease, box-shadow 0.18s ease',
                    boxShadow: tile.revealed
                      ? 'inset 0 0 0 1px rgba(255,255,255,0.06)'
                      : '0 10px 18px rgba(0,0,0,0.16)'
                  }}
                  onMouseEnter={(e) => {
                    if (phase === 'playing' && !busy && !tile.revealed) {
                      e.currentTarget.style.transform = 'translateY(-3px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0px)';
                  }}
                >
                  {tile.revealed ? (tile.isMine ? '💣' : '💎') : ''}
                </button>
              );
            })}
          </div>

          {gameEnded ? (
            <div
              style={{
                marginTop: 18,
                padding: 16,
                borderRadius: 16,
                background: '#132634',
                color: '#b1bad3',
                lineHeight: 1.8
              }}
            >
              {phase === 'lost' ? (
                <span>
                  Round ended with a mine hit. Change your bet or press Bet to play again.
                </span>
              ) : (
                <span>
                  Round completed successfully. Change your bet or press Bet to play again.
                </span>
              )}
            </div>
          ) : (
            <div
              style={{
                marginTop: 18,
                padding: 16,
                borderRadius: 16,
                background: '#132634',
                color: '#b1bad3',
                lineHeight: 1.8
              }}
            >
              Pick safe tiles to increase your multiplier, then cash out before hitting a mine.
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

// Styles
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