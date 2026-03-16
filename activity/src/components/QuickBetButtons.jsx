export default function QuickBetButtons({ bet, setBet }) {
  function applyValue(value) {
    setBet(String(value));
  }

  function increaseBy(value) {
    const current = Number(bet) || 0;
    setBet(String(current + value));
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
      <button
        onClick={() => applyValue(10)}
        style={btnStyle}
      >
        10
      </button>
      <button
        onClick={() => applyValue(50)}
        style={btnStyle}
      >
        50
      </button>
      <button
        onClick={() => increaseBy(100)}
        style={btnStyle}
      >
        +100
      </button>
      <button
        onClick={() => increaseBy(500)}
        style={btnStyle}
      >
        +500
      </button>
    </div>
  );
}

const btnStyle = {
  background: '#233847',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: '10px 12px',
  cursor: 'pointer',
  fontWeight: 700
};