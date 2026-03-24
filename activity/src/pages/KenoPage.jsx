import { useEffect, useMemo, useState } from 'react';
import PageShell from '../components/PageShell';
import { placeBet, settleGame, getBalance } from '../lib/api';

const TOTAL_NUMBERS = 40;
const DRAW_COUNT = 10;
const MOBILE_BREAKPOINT = 820;

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

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function emitBalanceUpdated(balance) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('casino:balance-updated', { detail: { balance } }));
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function generateDraws() { return shuffle(Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1)).slice(0, DRAW_COUNT); }
function generateQuickPick(count) { return shuffle(Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1)).slice(0, count).sort((a, b) => a - b); }
function getMultiplier(pickCount, hitCount) { return PAYOUT_TABLE[pickCount]?.[hitCount] || 0; }
function formatMultiplier(value) {
  if (value >= 1000) return String(Math.round(value));
  if (value >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

export default function KenoPage() {
  const [bet, setBet] = useState('10');
  const [userBalance, setUserBalance] = useState(0);
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [drawnNumbers, setDrawnNumbers] = useState([]);
  const [phase, setPhase] = useState('idle');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Select your numbers and start the round.');
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

  const pickCount = selectedNumbers.length;
  const selectedSet = useMemo(() => new Set(selectedNumbers), [selectedNumbers]);
  const drawnSet = useMemo(() => new Set(drawnNumbers), [drawnNumbers]);
  const hitsList = useMemo(() => selectedNumbers.filter((n) => drawnSet.has(n)).sort((a, b) => a - b), [selectedNumbers, drawnSet]);
  const hitCount = hitsList.length;
  const multiplier = getMultiplier(pickCount, hitCount);
  const payout = Math.floor((Number(bet) || 0) * multiplier);

  const payoutRows = useMemo(() => {
    if (pickCount === 0) return [];
    return Array.from({ length: pickCount + 1 }, (_, idx) => pickCount - idx).map((hits) => ({ hits, multiplier: getMultiplier(pickCount, hits) }));
  }, [pickCount]);

  const maxMultiplier = useMemo(() => {
    if (pickCount === 0) return 0;
    const values = Object.values(PAYOUT_TABLE[pickCount] || {});
    return values.length ? Math.max(...values) : 0;
  }, [pickCount]);

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

  function resetRoundVisuals(nextMessage = 'Select your numbers and start the round.') {
    setDrawnNumbers([]); setMessage(nextMessage); setPhase('idle'); setRoundId(null);
  }

  function toggleNumber(num) {
    if (phase === 'drawing' || busy) return;
    setDrawnNumbers([]);
    setSelectedNumbers((prev) => {
      if (prev.includes(num)) return prev.filter((n) => n !== num).sort((a, b) => a - b);
      if (prev.length >= 10) return prev;
      return [...prev, num].sort((a, b) => a - b);
    });
  }

  function quickPick() {
    if (phase === 'drawing' || busy) return;
    setSelectedNumbers(generateQuickPick(10));
    resetRoundVisuals('Quick pick applied.');
  }

  function clearSelection() {
    if (phase === 'drawing' || busy) return;
    setSelectedNumbers([]); resetRoundVisuals('Selection cleared.');
  }

  async function startRound() {
    const amount = Number(bet);
    if (busy || phase === 'drawing') return;
    if (!amount || amount <= 0) { setMessage('Enter a valid bet amount.'); return; }
    if (pickCount < 1 || pickCount > 10) { setMessage('Select between 1 and 10 numbers first.'); return; }

    setBusy(true); setPhase('drawing'); setDrawnNumbers([]); setMessage('Placing bet and drawing numbers...');
    const betRes = await placeBet(undefined, amount, 'keno', `keno ${pickCount} picks`, { pickCount, selectedNumbers });
    if (!betRes.ok) { setBusy(false); setPhase('idle'); setMessage(betRes.error || 'Bet failed'); return; }

    emitBalanceUpdated(betRes.balance);
    const currentRoundId = betRes.roundId; setRoundId(currentRoundId);
    const finalDraws = generateDraws();

    for (const num of finalDraws) {
      setDrawnNumbers((prev) => [...prev, num]);
      await sleep(130);
    }

    const finalHits = selectedNumbers.filter((n) => finalDraws.includes(n)).length;
    const finalMultiplier = getMultiplier(pickCount, finalHits);
    const finalPayout = Math.floor(amount * finalMultiplier);
    const settleRes = await settleGame(undefined, currentRoundId, finalPayout, 'keno', `keno ${pickCount} picks ${finalHits} hits x${finalMultiplier}`, { pickCount, selectedNumbers, drawnNumbers: [...finalDraws].sort((a, b) => a - b), hitCount: finalHits, multiplier: finalMultiplier, bet: amount }, finalPayout > 0 ? 'win' : 'loss');

    if (!settleRes.ok) { setBusy(false); setPhase('finished'); setMessage(settleRes.error || 'Failed to settle payout'); return; }

    emitBalanceUpdated(settleRes.balance); setRoundId(null);
    const round = { picks: [...selectedNumbers], draws: [...finalDraws].sort((a, b) => a - b), hitCount: finalHits, multiplier: finalMultiplier, payout: finalPayout, pickCount };
    setHistory((prev) => [round, ...prev].slice(0, 3)); setBusy(false); setPhase('finished');

    if (finalPayout > 0) setMessage(`You hit ${finalHits}. Payout: $${finalPayout}`);
    else setMessage(`You hit ${finalHits}. No payout this round.`);
  }

  function getNumberStyle(num) {
    const selected = selectedSet.has(num); const drawn = drawnSet.has(num);
    const hit = selected && drawn; const missedSelected = selected && drawnNumbers.length === DRAW_COUNT && !drawn; const drawnOnly = drawn && !selected;
    if (hit) return { background: 'linear-gradient(180deg, #00e701, #00b90b)', border: '3px solid #fff', color: '#08120b', boxShadow: '0 0 20px rgba(0,231,1,0.6)' };
    if (missedSelected) return { background: 'linear-gradient(180deg, #7a4d12, #59380d)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' };
    if (drawnOnly) return { background: 'linear-gradient(180deg, #8b1e2f, #681523)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' };
    if (selected) return { background: 'linear-gradient(180deg, #00e701, #00b90b)', border: '1px solid rgba(255,255,255,0.2)', color: '#08120b', boxShadow: '0 8px 16px rgba(0,231,1,0.2)' };
    return { background: 'linear-gradient(180deg, #223543, #1a2c37)', border: '1px solid rgba(255,255,255,0.06)', color: 'white' };
  }

  return (
    <PageShell title="Keno">
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(340px, 400px) minmax(0, 1fr)', gap: isMobile ? 16 : 24, alignItems: 'start' }}>
        
        {/* Controls Section */}
        <div style={{ background: '#1a2c38', borderRadius: isMobile ? 20 : 24, padding: isMobile ? 16 : 20, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', minWidth: 0, order: isMobile ? 2 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12 }}>
            <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 900 }}>Manual</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: phase === 'drawing' ? '#00e701' : '#b1bad3', flexShrink: 0 }}>{phase === 'drawing' ? 'DRAWING' : 'READY'}</div>
          </div>

          <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>Bet Amount</div>
          <div style={{ marginBottom: 18 }}>
            
            {/* الصف الأول: مربع النص (مع تحويل تلقائي للإنجليزي) + أزرار الضرب والقسمة */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input 
                type="text" lang="en" dir="ltr" inputMode="decimal"
                value={bet} 
                onChange={(e) => {
                  let val = e.target.value.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
                  val = val.replace(/[^0-9.]/g, '');
                  setBet(val);
                }} 
                disabled={phase === 'drawing' || busy} 
                style={{ ...inputStyle, marginBottom: 0, flex: 1, outline: 'none' }} 
              />
              <button onClick={() => modifyBet(0.5)} disabled={phase === 'drawing' || busy} style={{ ...actionBtn, padding: '0 16px', fontSize: 15 }}>
                1/2
              </button>
              <button onClick={() => modifyBet(2)} disabled={phase === 'drawing' || busy} style={{ ...actionBtn, padding: '0 16px', fontSize: 15 }}>
                2x
              </button>
            </div>

            {/* الصف الثاني: أزرار النسب (1/4, 1/2, 3/4, Full) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              <button onClick={() => setFractionBet(0.25)} disabled={phase === 'drawing' || busy} style={actionBtn}>1/4</button>
              <button onClick={() => setFractionBet(0.5)} disabled={phase === 'drawing' || busy} style={actionBtn}>1/2</button>
              <button onClick={() => setFractionBet(0.75)} disabled={phase === 'drawing' || busy} style={actionBtn}>3/4</button>
              <button onClick={() => setFractionBet(1)} disabled={phase === 'drawing' || busy} style={actionBtn}>Full</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
            <button onClick={quickPick} disabled={phase === 'drawing' || busy} style={secondaryBtn}>Quick Pick</button>
            <button onClick={clearSelection} disabled={phase === 'drawing' || busy} style={secondaryBtn}>Clear</button>
          </div>

          <button onClick={startRound} disabled={phase === 'drawing' || busy} style={{ width: '100%', borderRadius: 14, background: '#00e701', color: 'black', fontWeight: 900, padding: '15px 16px', border: 'none', cursor: 'pointer', marginTop: 18, opacity: phase === 'drawing' || busy ? 0.65 : 1, transition: 'transform 0.05s ease', fontSize: isMobile ? 15 : 16 }}>
            {phase === 'drawing' ? 'Drawing...' : 'Bet'}
          </button>

          <div style={{ marginTop: 16, color: drawnNumbers.length === DRAW_COUNT && payout > 0 ? '#7df9a6' : '#b1bad3', minHeight: 24, lineHeight: 1.6, fontSize: isMobile ? 14 : 15 }}>{message}</div>

          <div style={{ marginTop: 18, background: '#132634', borderRadius: 18, padding: isMobile ? 14 : 16, border: '1px solid rgba(255,255,255,0.05)', lineHeight: 1.9 }}>
            <div style={statRow}><span style={statLabel}>Selected</span><span style={statValue}>{selectedNumbers.length}/10</span></div>
            <div style={statRow}><span style={statLabel}>Draw Count</span><span style={statValue}>{DRAW_COUNT}</span></div>
            <div style={statRow}><span style={statLabel}>Max multiplier</span><span style={{ ...statValue, color: '#00e701' }}>x{formatMultiplier(maxMultiplier)}</span></div>
            <div style={statRow}><span style={statLabel}>Potential top payout</span><span style={statValue}>${Math.floor((Number(bet) || 0) * maxMultiplier)}</span></div>
            <div style={statRow}><span style={statLabel}>Hits</span><span style={statValue}>{drawnNumbers.length === DRAW_COUNT ? hitCount : '-'}</span></div>
            <div style={statRow}><span style={statLabel}>Payout</span><span style={statValue}>{drawnNumbers.length === DRAW_COUNT ? `$${payout}` : '-'}</span></div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Last Results</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {history.length === 0 ? <div style={{ background: '#132634', borderRadius: 14, padding: 14, color: '#b1bad3' }}>No rounds yet.</div> : history.map((item, index) => (
                <div key={`${item.pickCount}-${item.hitCount}-${index}`} style={{ background: '#132634', borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.hitCount} hit{item.hitCount === 1 ? '' : 's'}</div>
                    <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.pickCount} picks · x{formatMultiplier(item.multiplier)}</div>
                  </div>
                  <div style={{ fontWeight: 900, flexShrink: 0 }}>${item.payout}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Board & Info Section */}
        <div style={{ background: '#1a2c38', borderRadius: isMobile ? 20 : 24, padding: isMobile ? 16 : 24, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', minWidth: 0, order: isMobile ? 1 : 2 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 260px', gap: isMobile ? 16 : 20, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
              <div style={{ background: 'radial-gradient(circle at top, rgba(68,98,121,0.38), rgba(15,33,46,0.98) 65%)', borderRadius: 22, padding: isMobile ? 12 : 18, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 16, gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
                  <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900 }}>Board</div>
                  <div style={{ color: '#b1bad3', fontSize: isMobile ? 13 : 14 }}>{selectedNumbers.length}/10 selected</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: isMobile ? 6 : 12 }}>
                  {Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1).map((num) => {
                    const styleSet = getNumberStyle(num);
                    return (
                      <button key={num} onClick={() => toggleNumber(num)} disabled={phase === 'drawing' || busy || (!selectedSet.has(num) && selectedNumbers.length >= 10)} style={{ height: isMobile ? 40 : 58, borderRadius: isMobile ? 10 : 16, fontWeight: 900, fontSize: isMobile ? 14 : 18, cursor: phase === 'drawing' || busy ? 'default' : 'pointer', transition: 'transform 0.12s ease, box-shadow 0.16s ease', minWidth: 0, ...styleSet }}>
                        {num}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ background: '#132634', borderRadius: 18, padding: isMobile ? 14 : 16, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>Drawn Numbers</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: isMobile ? 8 : 10 }}>
                  {Array.from({ length: DRAW_COUNT }, (_, i) => {
                    const number = drawnNumbers[i];
                    const isHit = number && selectedSet.has(number);
                    return (
                      <div key={i} style={{ height: isMobile ? 46 : 56, borderRadius: isMobile ? 12 : 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: number ? (isHit ? 'linear-gradient(180deg, #00e701, #00b90b)' : 'linear-gradient(180deg, #8b1e2f, #681523)') : '#1a2c38', border: number && isHit ? '2px solid #fff' : '1px solid rgba(255,255,255,0.06)', fontWeight: 900, fontSize: isMobile ? 15 : 18, color: number && isHit ? '#08120b' : 'white', boxShadow: number && isHit ? '0 0 10px rgba(0,231,1,0.5)' : (number ? '0 10px 18px rgba(0,0,0,0.16)' : 'none') }}>
                        {number || '—'}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ background: '#132634', borderRadius: 22, padding: 16, border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>Payout Table</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {payoutRows.map((row) => {
                  const active = drawnNumbers.length === DRAW_COUNT && row.hits === hitCount;
                  return (
                    <div key={row.hits} style={{ background: active ? 'linear-gradient(180deg, #2f4553, #233847)' : '#1a2c38', border: active ? '1px solid rgba(0,231,1,0.28)' : '1px solid rgba(255,255,255,0.05)', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ fontWeight: 800 }}>{row.hits} Hit{row.hits === 1 ? '' : 's'}</div>
                      <div style={{ fontWeight: 900, color: row.multiplier > 0 ? 'white' : '#7f93a3', flexShrink: 0 }}>{row.multiplier > 0 ? `x${formatMultiplier(row.multiplier)}` : '—'}</div>
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
const actionBtn = { background: '#233847', color: 'white', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 0', cursor: 'pointer', fontWeight: 800, fontSize: 13, textAlign: 'center' };
const secondaryBtn = { background: '#233847', color: 'white', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', fontWeight: 800 };
const statRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 };
const statLabel = { color: '#b1bad3' };
const statValue = { color: 'white', fontWeight: 800, minWidth: 0, textAlign: 'right' };
