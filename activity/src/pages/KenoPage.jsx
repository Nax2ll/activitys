import { useMemo, useState } from 'react';
import PageShell from '../components/PageShell';
import { mockDiscordUser } from '../lib/mockUser';
import { placeBet, settleGame } from '../lib/api';

const TOTAL_NUMBERS = 40;
const DRAW_COUNT = 10;

const PAYOUT_TABLE = {
  1: { 1: 3.8 },
  2: { 2: 11, 1: 1.1 },
  3: { 3: 27, 2: 2.2 },
  4: { 4: 80, 3: 5.5, 2: 1.2 },
  5: { 5: 220, 4: 18, 3: 3.2 },
  6: { 6: 600, 5: 75, 4: 8, 3: 1.4 },
  7: { 7: 1400, 6: 220, 5: 25, 4: 4 },
  8: { 8: 3000, 7: 700, 6: 90, 5: 10, 4: 1.8 },
  9: { 9: 4200, 8: 1100, 7: 180, 6: 22, 5: 4 },
  10: { 10: 5000, 9: 1500, 8: 300, 7: 45, 6: 8, 5: 1.5 }
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shuffle(arr) {
  const copy = [...arr];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function generateDraws() {
  const nums = Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1);
  return shuffle(nums).slice(0, DRAW_COUNT);
}

function generateQuickPick(count) {
  const nums = Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1);
  return shuffle(nums).slice(0, count).sort((a, b) => a - b);
}

function getMultiplier(pickCount, hitCount) {
  return PAYOUT_TABLE[pickCount]?.[hitCount] || 0;
}

function formatMultiplier(value) {
  if (value >= 1000) return String(Math.round(value));
  if (value >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

export default function KenoPage() {
  const [bet, setBet] = useState('10');
  const [pickCount, setPickCount] = useState(4);
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [drawnNumbers, setDrawnNumbers] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle | drawing | finished
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Select your numbers and start the round.');
  const [history, setHistory] = useState([]);

  const selectedSet = useMemo(() => new Set(selectedNumbers), [selectedNumbers]);
  const drawnSet = useMemo(() => new Set(drawnNumbers), [drawnNumbers]);

  const hitsList = useMemo(() => {
    return selectedNumbers.filter((n) => drawnSet.has(n)).sort((a, b) => a - b);
  }, [selectedNumbers, drawnSet]);

  const hitCount = hitsList.length;
  const multiplier = getMultiplier(pickCount, hitCount);
  const payout = Math.floor((Number(bet) || 0) * multiplier);

  const payoutRows = useMemo(() => {
    return Array.from({ length: pickCount + 1 }, (_, idx) => pickCount - idx).map((hits) => ({
      hits,
      multiplier: getMultiplier(pickCount, hits)
    }));
  }, [pickCount]);

  const maxMultiplier = useMemo(() => {
    const values = Object.values(PAYOUT_TABLE[pickCount] || {});
    return values.length ? Math.max(...values) : 0;
  }, [pickCount]);

  function multiplyBet() {
    setBet(String((Number(bet) || 0) * 2));
  }

  function divideBet() {
    const newBet = (Number(bet) || 0) / 2;
    setBet(String(newBet < 1 ? 1 : newBet));
  }

  function resetRoundVisuals(nextMessage = 'Select your numbers and start the round.') {
    setDrawnNumbers([]);
    setMessage(nextMessage);
    setPhase('idle');
  }

  function toggleNumber(num) {
    if (phase === 'drawing' || busy) return;

    setDrawnNumbers([]);

    setSelectedNumbers((prev) => {
      const exists = prev.includes(num);

      if (exists) {
        return prev.filter((n) => n !== num).sort((a, b) => a - b);
      }

      if (prev.length >= pickCount) {
        return prev;
      }

      return [...prev, num].sort((a, b) => a - b);
    });
  }

  function setNewPickCount(count) {
    if (phase === 'drawing' || busy) return;
    setPickCount(count);
    setSelectedNumbers([]);
    resetRoundVisuals(`Pick exactly ${count} numbers.`);
  }

  function quickPick() {
    if (phase === 'drawing' || busy) return;
    setSelectedNumbers(generateQuickPick(pickCount));
    resetRoundVisuals('Quick pick applied.');
  }

  function clearSelection() {
    if (phase === 'drawing' || busy) return;
    setSelectedNumbers([]);
    resetRoundVisuals('Selection cleared.');
  }

  async function startRound() {
    const amount = Number(bet);

    if (busy || phase === 'drawing') return;

    if (!amount || amount <= 0) {
      setMessage('Enter a valid bet amount.');
      return;
    }

    if (selectedNumbers.length !== pickCount) {
      setMessage(`Select exactly ${pickCount} numbers first.`);
      return;
    }

    setBusy(true);
    setPhase('drawing');
    setDrawnNumbers([]);
    setMessage('Placing bet and drawing numbers...');

    const betRes = await placeBet(
      mockDiscordUser.id,
      amount,
      'keno',
      `keno ${pickCount} picks`
    );

    if (!betRes.ok) {
      setBusy(false);
      setPhase('idle');
      setMessage(betRes.error || 'Bet failed');
      return;
    }

    const finalDraws = generateDraws();

    for (const num of finalDraws) {
      setDrawnNumbers((prev) => [...prev, num]);
      await sleep(130);
    }

    const finalHits = selectedNumbers.filter((n) => finalDraws.includes(n)).length;
    const finalMultiplier = getMultiplier(pickCount, finalHits);
    const finalPayout = Math.floor(amount * finalMultiplier);

    if (finalPayout > 0) {
      const settleRes = await settleGame(
        mockDiscordUser.id,
        finalPayout,
        'keno',
        `keno ${pickCount} picks ${finalHits} hits x${finalMultiplier}`
      );

      if (!settleRes.ok) {
        setBusy(false);
        setPhase('finished');
        setMessage(settleRes.error || 'Failed to settle payout');
        return;
      }
    }

    const round = {
      picks: [...selectedNumbers],
      draws: [...finalDraws].sort((a, b) => a - b),
      hitCount: finalHits,
      multiplier: finalMultiplier,
      payout: finalPayout,
      pickCount
    };

    setHistory((prev) => [round, ...prev].slice(0, 8));
    setBusy(false);
    setPhase('finished');

    if (finalPayout > 0) {
      setMessage(`You hit ${finalHits}. Payout: $${finalPayout}`);
    } else {
      setMessage(`You hit ${finalHits}. No payout this round.`);
    }
  }

  function getNumberStyle(num) {
    const selected = selectedSet.has(num);
    const drawn = drawnSet.has(num);
    const hit = selected && drawn;
    const missedSelected = selected && drawnNumbers.length === DRAW_COUNT && !drawn;
    const drawnOnly = drawn && !selected;

    // تم اختياره وجاء بالسحب (فوز للرقم)
    if (hit) {
      return {
        background: 'linear-gradient(180deg, #00e701, #00b90b)',
        border: '3px solid #fff', // إطار أبيض عشان يبرز
        color: '#08120b',
        boxShadow: '0 0 20px rgba(0,231,1,0.6)'
      };
    }

    // اخترته بس ما جاء السحب عليه (خسارة للرقم)
    if (missedSelected) {
      return {
        background: 'linear-gradient(180deg, #7a4d12, #59380d)',
        border: '1px solid rgba(255,255,255,0.12)',
        color: 'white'
      };
    }

    // رقم طلع بالسحب بس إنت مو مختاره
    if (drawnOnly) {
      return {
        background: 'linear-gradient(180deg, #8b1e2f, #681523)',
        border: '1px solid rgba(255,255,255,0.12)',
        color: 'white'
      };
    }

    // تم اختياره (لون أخضر كامل)
    if (selected) {
      return {
        background: 'linear-gradient(180deg, #00e701, #00b90b)',
        border: '1px solid rgba(255,255,255,0.2)',
        color: '#08120b',
        boxShadow: '0 8px 16px rgba(0,231,1,0.2)'
      };
    }

    // خلية عادية
    return {
      background: 'linear-gradient(180deg, #223543, #1a2b37)',
      border: '1px solid rgba(255,255,255,0.06)',
      color: 'white'
    };
  }

  return (
    <PageShell title="Keno">
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
                color: phase === 'drawing' ? '#00e701' : '#b1bad3'
              }}
            >
              {phase === 'drawing' ? 'DRAWING' : 'READY'}
            </div>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>
            Bet Amount
          </div>

          {/* Bet Input with 1/2 and 2x buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <input
              type="number"
              min="1"
              value={bet}
              onChange={(e) => setBet(e.target.value)}
              disabled={phase === 'drawing' || busy}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={divideBet} disabled={phase === 'drawing' || busy} style={actionBtn}>
              1/2
            </button>
            <button onClick={multiplyBet} disabled={phase === 'drawing' || busy} style={actionBtn}>
              2x
            </button>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>
            Pick Count
          </div>

          {/* Pick Count Dropdown */}
          <select
            value={pickCount}
            onChange={(e) => setNewPickCount(Number(e.target.value))}
            disabled={phase === 'drawing' || busy}
            style={{ ...selectStyle, marginBottom: 16, opacity: phase === 'drawing' || busy ? 0.6 : 1 }}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              marginTop: 16
            }}
          >
            <button
              onClick={quickPick}
              disabled={phase === 'drawing' || busy}
              style={secondaryBtn}
            >
              Quick Pick
            </button>

            <button
              onClick={clearSelection}
              disabled={phase === 'drawing' || busy}
              style={secondaryBtn}
            >
              Clear
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
              <span style={statLabel}>Selected</span>
              <span style={statValue}>
                {selectedNumbers.length}/{pickCount}
              </span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Draw Count</span>
              <span style={statValue}>{DRAW_COUNT}</span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Max multiplier</span>
              <span style={{ ...statValue, color: '#00e701' }}>
                x{formatMultiplier(maxMultiplier)}
              </span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Potential top payout</span>
              <span style={statValue}>
                ${Math.floor((Number(bet) || 0) * maxMultiplier)}
              </span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Hits</span>
              <span style={statValue}>{drawnNumbers.length === DRAW_COUNT ? hitCount : '-'}</span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Payout</span>
              <span style={statValue}>{drawnNumbers.length === DRAW_COUNT ? `$${payout}` : '-'}</span>
            </div>
          </div>

          <button
            onClick={startRound}
            disabled={phase === 'drawing' || busy}
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
              opacity: phase === 'drawing' || busy ? 0.65 : 1,
              transition: 'transform 0.05s ease',
            }}
            onMouseDown={(e) => phase !== 'drawing' && !busy && (e.currentTarget.style.transform = 'scale(0.97)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {phase === 'drawing' ? 'Drawing...' : 'Bet'}
          </button>

          <div
            style={{
              marginTop: 16,
              color: drawnNumbers.length === DRAW_COUNT && payout > 0 ? '#7df9a6' : '#b1bad3',
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
                  No rounds yet.
                </div>
              ) : (
                history.map((item, index) => (
                  <div
                    key={`${item.pickCount}-${item.hitCount}-${index}`}
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
                      <div style={{ fontWeight: 800 }}>
                        {item.hitCount} hit{item.hitCount === 1 ? '' : 's'}
                      </div>
                      <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 4 }}>
                        {item.pickCount} picks · x{formatMultiplier(item.multiplier)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 900 }}>${item.payout}</div>
                  </div>
                ))
              )}
            </div>
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
              gridTemplateColumns: '1fr 260px',
              gap: 20,
              alignItems: 'start'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div
                style={{
                  background:
                    'radial-gradient(circle at top, rgba(68,98,121,0.38), rgba(15,33,46,0.98) 65%)',
                  borderRadius: 22,
                  padding: 18,
                  border: '1px solid rgba(255,255,255,0.05)'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 16
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 900 }}>Board</div>
                  <div style={{ color: '#b1bad3', fontSize: 14 }}>
                    {selectedNumbers.length}/{pickCount} selected
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(8, 1fr)',
                    gap: 12
                  }}
                >
                  {Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1).map((num) => {
                    const styleSet = getNumberStyle(num);

                    return (
                      <button
                        key={num}
                        onClick={() => toggleNumber(num)}
                        disabled={
                          phase === 'drawing' ||
                          busy ||
                          (!selectedSet.has(num) && selectedNumbers.length >= pickCount)
                        }
                        style={{
                          height: 58,
                          borderRadius: 16,
                          fontWeight: 900,
                          fontSize: 18,
                          cursor: phase === 'drawing' || busy ? 'default' : 'pointer',
                          transition: 'transform 0.12s ease, box-shadow 0.16s ease',
                          ...styleSet
                        }}
                        onMouseEnter={(e) => {
                          if (phase !== 'drawing' && !busy) {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0px)';
                        }}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  background: '#132634',
                  borderRadius: 18,
                  padding: 16,
                  border: '1px solid rgba(255,255,255,0.05)'
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
                  Drawn Numbers
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: 10
                  }}
                >
                  {Array.from({ length: DRAW_COUNT }, (_, i) => {
                    const number = drawnNumbers[i];
                    const isHit = number && selectedSet.has(number);

                    return (
                      <div
                        key={i}
                        style={{
                          height: 56,
                          borderRadius: 16,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: number
                            ? isHit
                              ? 'linear-gradient(180deg, #00e701, #00b90b)'
                              : 'linear-gradient(180deg, #8b1e2f, #681523)'
                            : '#1a2c38',
                          border: number && isHit ? '2px solid #fff' : '1px solid rgba(255,255,255,0.06)',
                          fontWeight: 900,
                          fontSize: 18,
                          color: number && isHit ? '#08120b' : 'white',
                          boxShadow: number && isHit ? '0 0 10px rgba(0,231,1,0.5)' : (number ? '0 10px 18px rgba(0,0,0,0.16)' : 'none')
                        }}
                      >
                        {number || '—'}
                      </div>
                    );
                  })}
                </div>

                <div
                  style={{
                    marginTop: 16,
                    color: '#b1bad3',
                    lineHeight: 1.8
                  }}
                >
                  <div>
                    Hits:{' '}
                    <span style={{ color: 'white', fontWeight: 900 }}>
                      {drawnNumbers.length === DRAW_COUNT ? hitCount : '-'}
                    </span>
                  </div>

                  <div>
                    Hit Numbers:{' '}
                    <span style={{ color: 'white', fontWeight: 900 }}>
                      {drawnNumbers.length === DRAW_COUNT
                        ? hitsList.length
                          ? hitsList.join(', ')
                          : 'None'
                        : '-'}
                    </span>
                  </div>

                  <div>
                    Multiplier:{' '}
                    <span style={{ color: '#00e701', fontWeight: 900 }}>
                      {drawnNumbers.length === DRAW_COUNT ? `x${formatMultiplier(multiplier)}` : '-'}
                    </span>
                  </div>

                  <div>
                    Payout:{' '}
                    <span style={{ color: 'white', fontWeight: 900 }}>
                      {drawnNumbers.length === DRAW_COUNT ? `$${payout}` : '-'}
                    </span>
                  </div>
                </div>
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
                Payout Table
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {payoutRows.map((row) => {
                  const active = drawnNumbers.length === DRAW_COUNT && row.hits === hitCount;

                  return (
                    <div
                      key={row.hits}
                      style={{
                        background: active
                          ? 'linear-gradient(180deg, #2f4553, #233847)'
                          : '#1a2c38',
                        border: active
                          ? '1px solid rgba(0,231,1,0.28)'
                          : '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 14,
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>
                        {row.hits} Hit{row.hits === 1 ? '' : 's'}
                      </div>
                      <div
                        style={{
                          fontWeight: 900,
                          color: row.multiplier > 0 ? 'white' : '#7f93a3'
                        }}
                      >
                        {row.multiplier > 0 ? `x${formatMultiplier(row.multiplier)}` : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  marginTop: 16,
                  padding: 14,
                  borderRadius: 14,
                  background: '#1a2c38',
                  color: '#b1bad3',
                  lineHeight: 1.7,
                  fontSize: 14
                }}
              >
                Pick exactly {pickCount} numbers, then reveal 10 drawn numbers.
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

const secondaryBtn = {
  background: '#233847',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: '12px 14px',
  cursor: 'pointer',
  fontWeight: 800
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