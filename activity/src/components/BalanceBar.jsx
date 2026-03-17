import { useEffect, useState } from 'react';
import { getBalance } from '../lib/api';

const MOBILE_BREAKPOINT = 820;

export default function BalanceBar() {
  const [balance, setBalance] = useState(0);
  const [status, setStatus] = useState('loading');
  const [errorText, setErrorText] = useState('');
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= MOBILE_BREAKPOINT;
  });

  useEffect(() => {
    let mounted = true;

    function handleResize() {
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    }

    async function load() {
      try {
        const data = await getBalance();

        if (!mounted) return;

        if (data?.ok) {
          setBalance(Number(data.wallet ?? data.balance) || 0);
          setStatus('ready');
          setErrorText('');
        } else {
          setStatus('error');
          setErrorText(data?.error || 'Unknown error');
        }
      } catch (error) {
        if (!mounted) return;
        setStatus('error');
        setErrorText(error?.message || 'Balance load failed');
      }
    }

    function handleBalanceUpdated(event) {
      if (!mounted) return;
      const next = Number(event?.detail?.wallet ?? event?.detail?.balance);
      if (!Number.isFinite(next)) return;
      setBalance(next);
      setStatus('ready');
      setErrorText('');
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
    <div
      style={{
        background: '#1a2c38',
        borderRadius: isMobile ? 16 : 18,
        padding: isMobile ? '12px 14px' : '14px 18px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
        border: '1px solid rgba(255,255,255,0.05)',
        width: '100%',
        minWidth: 0
      }}
    >
      <div
        style={{
          color: '#b1bad3',
          fontSize: isMobile ? 11 : 12,
          marginBottom: 6
        }}
      >
        Balance
      </div>

      <div
        style={{
          fontSize: isMobile ? 22 : 28,
          fontWeight: 900,
          lineHeight: 1.15,
          wordBreak: 'break-word'
        }}
      >
        {status === 'loading' ? 'Loading...' : `$ ${Number(balance).toLocaleString()}`}
      </div>

      {status === 'error' ? (
        <div
          style={{
            color: '#ff8d8d',
            fontSize: isMobile ? 11 : 12,
            marginTop: 6,
            lineHeight: 1.5,
            wordBreak: 'break-word'
          }}
        >
          {errorText}
        </div>
      ) : null}
    </div>
  );
}
