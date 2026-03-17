import { useEffect, useMemo, useState } from 'react';
import PageShell from '../components/PageShell';
import { placeBet, settleGame } from '../lib/api';

const ROW_OPTIONS = [8, 9, 10, 11, 12, 13, 14, 15, 16];
const RISK_OPTIONS = ['low', 'medium', 'high'];
const RTP = 0.97;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;

  let result = 1;
  const m = Math.min(k, n - k);

  for (let i = 1; i <= m; i++) {
    result = (result * (n - m + i)) / i;
  }

  return result;
}

function binomialProbability(rows, bucketIndex) {
  return choose(rows, bucketIndex) / Math.pow(2, rows);
}

function getRiskWeight(distance, risk) {
  if (risk === 'low') {
    return 1 + Math.pow(distance, 1.35) * 1.15;
  }

  if (risk === 'medium') {
    return 0.75 + Math.pow(distance, 2.15) * 4.4;
  }

  return 0.35 + Math.pow(distance, 4.1) * 18;
}

function roundMultiplier(value) {
  if (value >= 100) return Math.round(value);
  if (value >= 10) return Number(value.toFixed(1));
  return Number(value.toFixed(2));
}

function buildMultipliers(rows, risk) {
  const center = rows / 2;
  const weights = [];

  for (let i = 0; i <= rows; i++) {
    const distance = Math.abs(i - center) / center;
    weights.push(getRiskWeight(distance, risk));
  }

  const expectedWeightedValue = weights.reduce((sum, weight, i) => {
    return sum + binomialProbability(rows, i) * weight;
  }, 0);

  const scale = RTP / expectedWeightedValue;

  return weights.map((weight) => {
    const value = weight * scale;
    return Math.max(0.2, roundMultiplier(value));
  });
}

function getBoardMetrics(rows) {
  const width = 760;
  const xStep = Math.min(44, 620 / (rows + 2));
  const rowSpacing = rows >= 14 ? 30 : 34;
  const topY = 70;
  const bottomY = topY + rows * rowSpacing + 64;
  const height = bottomY + 78;
  const centerX = width / 2;

  return {
    width,
    height,
    xStep,
    rowSpacing,
    topY,
    bottomY,
    centerX
  };
}

function getPegPositions(rows) {
  const { centerX, xStep, rowSpacing, topY, width, height } = getBoardMetrics(rows);
  const pegs = [];

  for (let row = 1; row <= rows; row++) {
    const count = row;
    const y = topY + row * rowSpacing - 12;

    for (let i = 0; i < count; i++) {
      const x = centerX + (i - (count - 1) / 2) * xStep;
      pegs.push({
        x,
        y,
        left: `${(x / width) * 100}%`,
        top: `${(y / height) * 100}%`
      });
    }
  }

  return pegs;
}

function getBucketCenters(rows) {
  const { centerX, xStep, bottomY, width, height } = getBoardMetrics(rows);

  return Array.from({ length: rows + 1 }, (_, i) => {
    const x = centerX + (i - rows / 2) * xStep;
    return {
      x,
      y: bottomY,
      left: `${(x / width) * 100}%`,
      top: `${(bottomY / height) * 100}%`
    };
  });
}

function buildPathPoints(bits, rows) {
  const { centerX, xStep, rowSpacing, topY, bottomY, width, height } = getBoardMetrics(rows);
  const points = [];

  points.push({
    x: centerX,
    y: 18,
    left: `${(centerX / width) * 100}%`,
    top: `${(18 / height) * 100}%`
  });

  let rights = 0;

  for (let step = 1; step <= rows; step++) {
    rights += bits[step - 1];
    const x = centerX + (rights - step / 2) * xStep;
    const y = topY + step * rowSpacing - 2;

    points.push({
      x,
      y,
      left: `${(x / width) * 100}%`,
      top: `${(y / height) * 100}%`
    });
  }

  const bucketIndex = rights;
  const finalX = centerX + (bucketIndex - rows / 2) * xStep;

  points.push({
    x: finalX,
    y: bottomY - 8,
    left: `${(finalX / width) * 100}%`,
    top: `${((bottomY - 8) / height) * 100}%`
  });

  return {
    points,
    bucketIndex
  };
}

function getBucketStyle(multiplier, active) {
  if (active) {
    return {
      background: 'linear-gradient(180deg, #00e701, #00b90b)',
      color: '#08120b',
      border: '1px solid rgba(255,255,255,0.18)',
      boxShadow: '0 16px 30px rgba(0,231,1,0.25)'
    };
  }

  if (multiplier >= 20) {
    return {
      background: 'linear-gradient(180deg, #7f1d1d, #5f1414)',
      color: 'white',
      border: '1px solid rgba(255,255,255,0.08)'
    };
  }

  if (multiplier >= 5) {
    return {
      background: 'linear-gradient(180deg, #7a4d12, #59380d)',
      color: 'white',
      border: '1px solid rgba(255,255,255,0.08)'
    };
  }

  if (multiplier >= 1) {
    return {
      background: 'linear-gradient(180deg, #1f5132, #173f27)',
      color: 'white',
      border: '1px solid rgba(255,255,255,0.08)'
    };
  }

  return {
    background: 'linear-gradient(180deg, #2f4553, #243744)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.08)'
  };
}

export default function PlinkoPage() {
  const [bet, setBet] = useState('10');
  const [rows, setRows] = useState(12);
  const [risk, setRisk] = useState('medium');
  const [message, setMessage] = useState('Choose your settings and drop a ball.');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeBucket, setActiveBucket] = useState(null);
  const [balls, setBalls] = useState([]);

  const multipliers = useMemo(() => buildMultipliers(rows, risk), [rows, risk]);
  const pegs = useMemo(() => getPegPositions(rows), [rows]);
  const buckets = useMemo(() => getBucketCenters(rows), [rows]);
  const metrics = useMemo(() => getBoardMetrics(rows), [rows]);

  const potentialBest = useMemo(() => {
    const max = Math.max(...multipliers);
    return Math.floor((Number(bet) || 0) * max);
  }, [bet, multipliers]);

  useEffect(() => {
    setResult(null);
    setActiveBucket(null);
    setBalls([]);
    setMessage('Choose your settings and drop a ball.');
  }, [rows, risk]);

  function multiplyBet() {
    setBet(String((Number(bet) || 0) * 2));
  }

  function divideBet() {
    const newBet = (Number(bet) || 0) / 2;
    setBet(String(newBet < 1 ? 1 : newBet));
  }

  async function dropBall() {
    const amount = Number(bet);

    if (!amount || amount <= 0) {
      setMessage('Enter a valid bet amount.');
      return;
    }

    const ballId = Date.now() + Math.random();

    setBalls((prev) => [...prev, { id: ballId, left: '50%', top: '4%' }]);
    setMessage('Placing bet and dropping ball...');

    const betRes = await placeBet(
      undefined,
      amount,
      'plinko',
      'plinko bet',
      { risk, rows }
    );

    if (!betRes.ok) {
      setMessage(betRes.error || 'Bet failed');
      setBalls((prev) => prev.filter((b) => b.id !== ballId));
      return;
    }

    emitBalanceUpdated(betRes.balance);

    const currentRoundId = betRes.roundId;

    const bits = Array.from({ length: rows }, () => (Math.random() < 0.5 ? 0 : 1));
    const built = buildPathPoints(bits, rows);
    const bucketIndex = built.bucketIndex;
    const multiplier = multipliers[bucketIndex];
    const payout = Math.floor(amount * multiplier);

    for (const point of built.points) {
      setBalls((prev) =>
        prev.map((b) => (b.id === ballId ? { ...b, left: point.left, top: point.top } : b))
      );
      await sleep(115);
    }

    setActiveBucket(bucketIndex);
    await sleep(160);

    const settleRes = await settleGame(
      undefined,
      currentRoundId,
      payout,
      'plinko',
      'plinko payout',
      { multiplier, bucketIndex, risk, rows },
      payout > 0 ? 'win' : 'loss'
    );

    setBalls((prev) => prev.filter((b) => b.id !== ballId));

    if (!settleRes.ok) {
      setMessage(settleRes.error || 'Failed to settle payout');
      return;
    }

    emitBalanceUpdated(settleRes.balance);

    const finalResult = {
      bucketIndex,
      multiplier,
      payout,
      amount,
      id: ballId
    };

    setResult(finalResult);
    setHistory((prev) => [finalResult, ...prev].slice(0, 8));
    setMessage(`Ball landed on x${multiplier}. Payout: $${payout}`);
  }

  const isDropping = balls.length > 0;

  return (
    <PageShell title="Plinko">
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
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 18
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 900 }}>Manual</div>
            <div
              style={{
                color: isDropping ? '#00e701' : '#b1bad3',
                fontSize: 12,
                fontWeight: 800
              }}
            >
              {isDropping ? 'DROPPING' : 'READY'}
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
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={divideBet} style={actionBtn}>1/2</button>
            <button onClick={multiplyBet} style={actionBtn}>2x</button>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>
            Risk
          </div>
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            disabled={isDropping}
            style={{ ...selectStyle, marginBottom: 18, opacity: isDropping ? 0.6 : 1 }}
          >
            {RISK_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value.toUpperCase()}
              </option>
            ))}
          </select>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>
            Rows
          </div>
          <select
            value={rows}
            onChange={(e) => setRows(Number(e.target.value))}
            disabled={isDropping}
            style={{ ...selectStyle, opacity: isDropping ? 0.6 : 1 }}
          >
            {ROW_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

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
              <span style={statLabel}>Risk</span>
              <span style={statValue}>{risk.toUpperCase()}</span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Rows</span>
              <span style={statValue}>{rows}</span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Max multiplier</span>
              <span style={{ ...statValue, color: '#00e701' }}>
                x{Math.max(...multipliers)}
              </span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Best possible payout</span>
              <span style={statValue}>${potentialBest}</span>
            </div>

            <div style={statRow}>
              <span style={statLabel}>Target RTP</span>
              <span style={statValue}>{Math.round(RTP * 100)}%</span>
            </div>
          </div>

          <button
            onClick={dropBall}
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
              transition: 'transform 0.05s ease',
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            Drop Ball
          </button>

          <div
            style={{
              marginTop: 16,
              color: result ? '#7df9a6' : '#b1bad3',
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
                  No drops yet.
                </div>
              ) : (
                history.map((item, index) => (
                  <div
                    key={`${item.id}-${index}`}
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
                      <div style={{ fontWeight: 800 }}>x{item.multiplier}</div>
                      <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 4 }}>
                        Bet ${item.amount}
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
              position: 'relative',
              width: '100%',
              height: metrics.height,
              minHeight: 520,
              overflow: 'hidden',
              borderRadius: 22,
              background:
                'radial-gradient(circle at top, rgba(51,79,102,0.45), rgba(15,33,46,0.95) 62%)'
            }}
          >
            {pegs.map((peg, index) => (
              <div
                key={index}
                style={{
                  position: 'absolute',
                  left: peg.left,
                  top: peg.top,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: 'linear-gradient(180deg, #e8edf2, #9fb0bd)',
                  boxShadow: '0 0 10px rgba(255,255,255,0.2)'
                }}
              />
            ))}

            {balls.map((ball) => (
              <div
                key={ball.id}
                style={{
                  position: 'absolute',
                  left: ball.left,
                  top: ball.top,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: 'radial-gradient(circle at 35% 35%, #ffffff, #ff4d4d 58%, #b31c1c 100%)',
                  boxShadow: '0 0 20px rgba(255,70,70,0.45)',
                  transition: 'left 110ms linear, top 110ms linear',
                  zIndex: 5
                }}
              />
            ))}

            {buckets.map((bucket, index) => {
              const multiplier = multipliers[index];
              const styleSet = getBucketStyle(multiplier, activeBucket === index);

              return (
                <div
                  key={index}
                  style={{
                    position: 'absolute',
                    left: bucket.left,
                    top: bucket.top,
                    transform: 'translate(-50%, 0)',
                    width: Math.max(30, 500 / (rows + 1)),
                    minWidth: 30,
                    height: 68,
                    borderRadius: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: rows >= 14 ? 11 : 12,
                    transition: 'all 0.16s ease',
                    ...styleSet
                  }}
                >
                  x{multiplier}
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${multipliers.length}, 1fr)`,
              gap: 8,
              marginTop: 18
            }}
          >
            {multipliers.map((multiplier, index) => (
              <div
                key={`${multiplier}-${index}`}
                style={{
                  background: activeBucket === index ? '#233f2e' : '#132634',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 12,
                  padding: '10px 6px',
                  textAlign: 'center',
                  fontWeight: 800,
                  color: activeBucket === index ? '#7df9a6' : 'white',
                  fontSize: 13
                }}
              >
                x{multiplier}
              </div>
            ))}
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
