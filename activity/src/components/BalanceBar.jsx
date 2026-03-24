import { useEffect, useState } from 'react';
import { getBalance } from '../lib/api';

const MOBILE_BREAKPOINT = 820;

function formatMoney(val) {
  const absVal = Math.abs(val);
  if (absVal >= 1e12) return (val / 1e12).toFixed(2) + 'T';
  if (absVal >= 1e9) return (val / 1e9).toFixed(2) + 'B';
  if (absVal >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  return Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BalanceBar() {
  const [balance, setBalance] = useState(0);
  const [status, setStatus] = useState('loading');
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= MOBILE_BREAKPOINT;
  });

  useEffect(() => {
    let mounted = true;
    function handleResize() { setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT); }

    async function load() {
      try {
        const data = await getBalance();
        if (!mounted) return;
        if (data?.ok) {
          setBalance(Number(data.wallet ?? data.balance) || 0);
          setStatus('ready');
        } else {
          setStatus('error');
        }
      } catch (error) {
        if (mounted) setStatus('error');
      }
    }

    function handleBalanceUpdated(event) {
      if (!mounted) return;
      const next = Number(event?.detail?.wallet ?? event?.detail?.balance);
      if (Number.isFinite(next)) {
        setBalance(next);
        setStatus('ready');
      }
    }

    handleResize();
    load();
    window.addEventListener('resize', handleResize);
    window.addEventListener('casino:balance-updated', handleBalanceUpdated);

    return () => {
      mounted = false;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('casino:balance-updated', handleBalanceUpdated);
    };
  }, []);

  return (
    <div style={{
      background: '#132634', borderRadius: 14,
      padding: isMobile ? '6px 8px' : '10px 16px', // تصغير الحواف في الجوال
      border: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column', 
      alignItems: isMobile ? 'center' : 'flex-end', // توسط النص في الجوال
      width: '100%', minWidth: 0
    }}>
      <div style={{ color: '#b1bad3', fontSize: isMobile ? 10 : 12, fontWeight: 700, marginBottom: 2 }}>Balance</div>
      <div style={{ fontSize: isMobile ? 15 : 20, fontWeight: 900, color: '#00e701', lineHeight: 1, whiteSpace: 'nowrap' }}>
        {status === 'loading' ? '...' : `$${formatMoney(balance)}`}
      </div>
    </div>
  );
}
