import { useEffect, useState } from 'react';
import { getBalance } from '../lib/api';

export default function BalanceBar() {
  const [balance, setBalance] = useState(0);
  const [status, setStatus] = useState('loading');
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const data = await Promise.race([
          getBalance(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Balance request timed out')), 12000)
          )
        ]);

        if (!mounted) return;

        if (data?.ok) {
          setBalance(Number(data.balance) || 0);
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

    load();

    return () => {
      mounted = false;
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
