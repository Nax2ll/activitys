import { useNavigate } from 'react-router-dom';

export default function GameCard({ title, subtitle, path, image, accent = '#314a5e' }) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(path)}
      style={{
        overflow: 'hidden',
        borderRadius: 24,
        background: '#1a2c38',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 14px 40px rgba(0,0,0,0.22)',
        color: 'white',
        textAlign: 'left',
        cursor: 'pointer',
        padding: 0,
        transition: 'transform 0.18s ease, box-shadow 0.18s ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 20px 50px rgba(0,0,0,0.28)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0px)';
        e.currentTarget.style.boxShadow = '0 14px 40px rgba(0,0,0,0.22)';
      }}
    >
      <div
        style={{
          height: 190,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${accent}, #132634)`,
          fontSize: 34,
          fontWeight: 900,
          color: 'rgba(255,255,255,0.95)',
          letterSpacing: 1
        }}
      >
        {image || title}
      </div>

      <div style={{ padding: 18 }}>
        <div style={{ fontSize: 24, fontWeight: 900 }}>{title}</div>
        <div
          style={{
            fontSize: 15,
            color: '#b1bad3',
            marginTop: 8,
            lineHeight: 1.5
          }}
        >
          {subtitle}
        </div>
      </div>
    </button>
  );
}