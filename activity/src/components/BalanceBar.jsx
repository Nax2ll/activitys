import { useEffect, useState } from 'react';
import { getBalance } from '../lib/api';

export default function BalanceBar() {
  const [balance, setBalance] = useState(0);
  const [status, setStatus] = useState('loading');
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    let mounted = true;

    async function load() {
      const data = await getBalance();

      if (!mounted) return;

      if (data?.ok) {
        setBalance(Number(data.balance) || 0);
        setStatus('ready');
        setErrorText('');
      } else {
        setStatus('error');
        setErrorText(data?.error || 'Unknown error');
      }
    }

    function handleBalanceUpdated(event) {
      const nextBalance = Number(event?.detail?.balance);

      if (!mounted || !Number.isFinite(nextBalance)) return;

      setBalance(nextBalance);
      setStatus('ready');
      setErrorText('');
    }

    load();

    window.addEventListener('casino:balance-updated', handleBalanceUpdated);

    const interval = setInterval(load, 15000);

    return () => {
      mounted = false;
      window.removeEventListener('casino:balance-updated', handleBalanceUpdated);
      clearInterval(interval);
    };
  }, []);

  return (
    <div
      style={{
        background: '#1a2c38',
        borderRadius: 18,
        padding: '14px 18px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
        border: '1px solid rgba(255,255,255,0.05)'
      }}
    >
      <div style={{ color: '#b1bad3', fontSize: 12, marginBottom: 6 }}>
        Balance
      </div>

      <div style={{ fontSize: 28, fontWeight: 900 }}>
        {status === 'loading' ? 'Loading...' : `$ ${Number(balance).toLocaleString()}`}
      </div>

      {status === 'error' ? (
        <div style={{ color: '#ff8d8d', fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
          {errorText}
        </div>
      ) : null}
    </div>
  );
}
