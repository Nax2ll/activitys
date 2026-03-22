import { useState, useRef, useEffect } from 'react';
import PageShell from '../components/PageShell';
import { placeBet, settleGame } from '../lib/api';

const MAX_QUESTIONS = 3;
const MAX_GUESSES = 3;

// إعدادات Gemini API
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''; // تأكد من وضع المفتاح في ملف .env
// استخدمنا الموديل الأسرع للردود الفورية
const GEMINI_MODEL = 'gemini-2.5-flash-lite'; 

function formatMoney(val) {
  if (val <= 0) return '0.00';
  if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function emitBalanceUpdated(balance) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('casino:balance-updated', { detail: { balance } }));
  }
}

export default function GuessWhoPage() {
  const [bet, setBet] = useState('10');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('idle'); // 'idle' | 'playing' | 'finished'
  const [message, setMessage] = useState('Place your bet to generate 9 secret items!');
  const [history, setHistory] = useState([]);
  
  // Game States
  const [roundId, setRoundId] = useState(null);
  const [theme, setTheme] = useState('');
  const [secretItem, setSecretItem] = useState('');
  const [grid, setGrid] = useState([]); // [{ name: 'Luffy', eliminated: false }]
  const [questionsLeft, setQuestionsLeft] = useState(MAX_QUESTIONS);
  const [guessesLeft, setGuessesLeft] = useState(MAX_GUESSES);
  
  // Chat / Questions
  const [chatLog, setChatLog] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const chatEndRef = useRef(null);

  // Auto-scroll للدردشة
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatLog]);

  function multiplyBet() { setBet(String((Number(bet) || 0) * 2)); }
  function divideBet() {
    const newBet = (Number(bet) || 0) / 2;
    setBet(String(newBet < 1 ? 1 : newBet));
  }

  // الاتصال بـ Gemini API
  async function callGemini(prompt) {
    if (!GEMINI_API_KEY) {
      throw new Error("Gemini API Key is missing in .env (VITE_GEMINI_API_KEY)");
    }
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2, // تقليل العشوائية عشان الـ JSON يرجع مضبوط
          response_mime_type: "application/json"
        }
      })
    });

    if (!response.ok) throw new Error("Gemini API request failed.");
    const data = await response.json();
    const rawText = data.candidates[0].content.parts[0].text;
    
    // تنظيف المخرجات في حال أضاف ماردكداون
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  }

  // بدء اللعبة واختيار الشخصيات
  async function startGame() {
    if (busy || phase === 'playing') return;

    const amount = Number(bet);
    if (!amount || amount <= 0) {
      setMessage('Enter a valid bet amount.');
      return;
    }

    if (!GEMINI_API_KEY) {
      setMessage('⚠️ Error: VITE_GEMINI_API_KEY is not set in .env');
      return;
    }

    setBusy(true);
    setPhase('idle');
    setMessage('AI is preparing the board. Please wait... 🤖');
    setChatLog([]);

    // 1. طلب التجهيز من Gemini
    try {
      const initPrompt = `
      أنت مدير لعبة "خمن الشخصية/العنصر". 
      اختر ثيم واحد عشوائياً من هذه الثيمات المحددة فقط: (شخصيات مارفل رايفل، شخصيات ون بيس، شخصيات هجوم العمالقة، مدن ومناطق السعودية، شخصيات من أفلام ومسلسلات مشهورة جداً).
      قم باختيار 9 عناصر/شخصيات معروفة جداً من هذا الثيم.
      اختر واحداً منها سراً ليكون هو "العنصر السري" الذي يجب على اللاعب تخمينه.
      رد بصيغة JSON فقط بهذا الشكل المعماري:
      {
        "theme": "اسم الثيم بالعربي",
        "items": ["عنصر1", "عنصر2", "عنصر3", "عنصر4", "عنصر5", "عنصر6", "عنصر7", "عنصر8", "عنصر9"],
        "secret": "العنصر السري"
      }
      `;

      const aiData = await callGemini(initPrompt);
      
      // 2. خصم الرهان من السيرفر
      const betRes = await placeBet(undefined, amount, 'guess_who', 'guess who bet', { theme: aiData.theme });
      
      if (!betRes.ok) {
        setBusy(false);
        setMessage(betRes.error || 'Bet failed');
        return;
      }

      emitBalanceUpdated(betRes.balance);
      setRoundId(betRes.roundId);
      
      // 3. تجهيز اللوحة
      setTheme(aiData.theme);
      setSecretItem(aiData.secret);
      setGrid(aiData.items.map(name => ({ name, eliminated: false })));
      setQuestionsLeft(MAX_QUESTIONS);
      setGuessesLeft(MAX_GUESSES);
      setPhase('playing');
      setMessage('Board ready! Ask a question or guess the secret item.');
      
      setChatLog([{ sender: 'ai', text: `أهلاً بك! لقد اخترت 9 عناصر من ثيم "${aiData.theme}". لقد اخترت واحداً منها سراً... ابدأ بطرح أسئلتك (نعم/لا) أو قم بتخمين العنصر مباشرة بالضغط عليه!` }]);

    } catch (err) {
      console.error(err);
      setMessage('Failed to connect to Gemini AI. Try again.');
    }

    setBusy(false);
  }

  // طرح سؤال للذكاء الاصطناعي
  async function askQuestion(e) {
    if (e) e.preventDefault();
    if (busy || phase !== 'playing' || questionsLeft <= 0 || !currentQuestion.trim()) return;

    const question = currentQuestion.trim();
    setCurrentQuestion('');
    setBusy(true);

    const updatedChat = [...chatLog, { sender: 'user', text: question }];
    setChatLog(updatedChat);

    try {
      const activeItems = grid.filter(i => !i.eliminated).map(i => i.name);
      
      const askPrompt = `
      أنت حكم في لعبة "خمن الشخصية".
      الثيم: ${theme}
      العناصر المتبقية على اللوحة: ${activeItems.join('، ')}
      العنصر السري: ${secretItem}
      
      سؤال اللاعب: "${question}"
      
      المطلوب منك:
      1. أجب بـ "نعم" أو "لا" فقط على السؤال بناءً على (العنصر السري).
      2. بناءً على إجابتك، حدد كل العناصر من القائمة المتبقية التي **يجب شطبها** (التي لا ينطبق عليها الوصف).
      مثال: إذا كان العنصر السري "ذكر" وسأل اللاعب "هل هو أنثى؟"، تجيب بـ "لا"، ويجب أن تضع في قائمة الشطب جميع الشخصيات الإناث من اللوحة.
      
      تحذير: لا تضع أبداً "${secretItem}" (العنصر السري) في قائمة الشطب!
      
      رد بصيغة JSON فقط:
      {
        "answer": "نعم أو لا",
        "eliminated_items": ["عنصر يجب شطبه", "عنصر آخر يجب شطبه"]
      }
      `;

      const aiData = await callGemini(askPrompt);
      
      // تحديث الشات
      setChatLog([...updatedChat, { sender: 'ai', text: aiData.answer }]);
      
      // تحديث اللوحة (شطب العناصر)
      if (aiData.eliminated_items && aiData.eliminated_items.length > 0) {
        setGrid(prev => prev.map(item => ({
          ...item,
          eliminated: item.eliminated || aiData.eliminated_items.includes(item.name)
        })));
      }

      setQuestionsLeft(prev => prev - 1);
      
    } catch (err) {
      console.error(err);
      setChatLog([...updatedChat, { sender: 'ai', text: 'عذراً، حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.' }]);
    }

    setBusy(false);
  }

  // التخمين (الضغط على أحد المربعات)
  async function handleGuess(itemName) {
    if (busy || phase !== 'playing') return;
    
    const itemObj = grid.find(i => i.name === itemName);
    if (itemObj.eliminated) return; // لا يمكنك تخمين شخصية مشطوبة

    setBusy(true);

    const isCorrect = itemName === secretItem;
    let newGuessesLeft = guessesLeft - 1;

    if (isCorrect) {
      // الفوز!
      const amount = Number(bet);
      // حساب المضاعف بناءً على التخمينات المتبقية (أول تخمين = 3 متبقي = x15)
      let multiplier = newGuessesLeft === 2 ? 15 : (newGuessesLeft === 1 ? 10 : 5);
      const payout = amount * multiplier;
      const profit = payout - amount;

      await finishGame(true, payout, multiplier, itemName);
    } else {
      // تخمين خاطئ
      setGuessesLeft(newGuessesLeft);
      
      // شطب العنصر الخاطئ
      setGrid(prev => prev.map(item => item.name === itemName ? { ...item, eliminated: true } : item));
      
      setChatLog(prev => [...prev, { sender: 'ai', text: `تخمين خاطئ! "${itemName}" ليس العنصر السري. (تبقى لك ${newGuessesLeft} محاولات)` }]);

      if (newGuessesLeft <= 0) {
        // الخسارة
        await finishGame(false, 0, 0, itemName);
      } else {
        setBusy(false);
      }
    }
  }

  // إنهاء اللعبة والتسوية
  async function finishGame(isWin, payout, multiplier, finalGuess) {
    setPhase('settling');
    setMessage('Settling game results...');

    const amount = Number(bet);

    const settleRes = await settleGame(
      undefined,
      roundId,
      payout,
      'guess_who',
      `guess who finished. secret: ${secretItem}`,
      { secret: secretItem, theme, multiplier },
      isWin ? 'win' : 'loss'
    );

    if (!settleRes.ok) {
      setMessage(settleRes.error || 'Failed to settle payout');
      setBusy(false);
      return;
    }

    emitBalanceUpdated(settleRes.balance);
    setPhase('finished');
    setRoundId(null);
    setBusy(false);

    if (isWin) {
      setMessage(`🎉 CORRECT! The secret was ${secretItem}. You won $${formatMoney(payout)} (x${multiplier})!`);
      setChatLog(prev => [...prev, { sender: 'ai', text: `أحسنت! إجابة صحيحة، العنصر السري هو "${secretItem}". لقد فزت بـ ${multiplier} ضعف رهانك! 💰` }]);
    } else {
      setMessage(`💀 Game Over! The secret was ${secretItem}.`);
      // إظهار العنصر السري بتلوينه بالأخضر
      setGrid(prev => prev.map(item => item.name === secretItem ? { ...item, eliminated: false, highlight: true } : { ...item, eliminated: true }));
    }

    setHistory(prev => [{
      secret: secretItem,
      theme,
      won: isWin,
      payout,
      multiplier,
      id: Math.random()
    }, ...prev].slice(0, 3)); // الاحتفاظ بآخر 3 نتائج فقط
  }

  return (
    <PageShell title="AI Guess Who">
      <style>{`
        .guess-card {
          background: #233847;
          border: 2px solid #334f66;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 15px;
          min-height: 100px;
          font-weight: 900;
          font-size: 16px;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }
        .guess-card:hover:not(.eliminated) {
          transform: translateY(-3px);
          box-shadow: 0 5px 15px rgba(0,0,0,0.3);
          border-color: #ff9800;
        }
        .guess-card.eliminated {
          opacity: 0.4;
          cursor: not-allowed;
          filter: grayscale(1);
          background: #1a2c38;
          border-color: rgba(255,255,255,0.05);
        }
        /* خط الشطب الأحمر */
        .guess-card.eliminated::after {
          content: '';
          position: absolute;
          width: 120%;
          height: 4px;
          background: #ff4d4d;
          transform: rotate(-35deg);
          box-shadow: 0 0 10px rgba(255,77,77,0.5);
        }
        .guess-card.highlight {
          background: #00e70120;
          border-color: #00e701;
          color: #00e701;
        }
        
        .chat-bubble {
          padding: 12px 16px;
          border-radius: 16px;
          margin-bottom: 10px;
          max-width: 85%;
          font-size: 14px;
          line-height: 1.5;
        }
        .chat-ai {
          background: #233847;
          color: white;
          align-self: flex-start;
          border-bottom-left-radius: 4px;
        }
        .chat-user {
          background: #ff9800;
          color: black;
          font-weight: bold;
          align-self: flex-end;
          border-bottom-right-radius: 4px;
        }
      `}</style>
      
      <div style={{ display: 'grid', gridTemplateColumns: '390px 1fr', gap: 24 }}>
        
        {/* Controls & Chat Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* لوحة التحكم */}
          <div style={{ background: '#1a2c38', borderRadius: 24, padding: 20, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 24, fontWeight: 900 }}>AI Guess Who</div>
              <div style={{ color: phase === 'playing' ? '#ff9800' : '#b1bad3', fontSize: 12, fontWeight: 800 }}>
                {phase === 'playing' ? 'PLAYING' : 'READY'}
              </div>
            </div>

            <div style={{ color: '#b1bad3', fontSize: 14, marginBottom: 8 }}>Bet Amount</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              <input type="number" min="1" value={bet} onChange={(e) => setBet(e.target.value)} disabled={busy || phase === 'playing'} style={{ ...inputStyle, flex: 1, opacity: (busy || phase === 'playing') ? 0.6 : 1 }} />
              <button onClick={divideBet} disabled={busy || phase === 'playing'} style={actionBtn}>1/2</button>
              <button onClick={multiplyBet} disabled={busy || phase === 'playing'} style={actionBtn}>2x</button>
            </div>

            {phase !== 'playing' ? (
              <button
                onClick={startGame}
                disabled={busy}
                style={{ ...primaryBtn, opacity: busy ? 0.65 : 1 }}
                onMouseDown={(e) => !busy && (e.currentTarget.style.transform = 'scale(0.97)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {busy ? 'Starting AI...' : 'Generate Board (Start)'}
              </button>
            ) : (
              <div style={{ background: '#132634', padding: 16, borderRadius: 16, border: '1px solid #ff980040' }}>
                <div style={{ color: '#ff9800', fontWeight: 800, marginBottom: 8, textAlign: 'center' }}>Theme: {theme}</div>
                <div style={{ display: 'flex', justifyContent: 'space-around', color: '#b1bad3', fontSize: 13, fontWeight: 'bold' }}>
                  <span>❓ Qs Left: {questionsLeft}</span>
                  <span>🎯 Guesses: {guessesLeft}</span>
                </div>
              </div>
            )}

            <div style={{ marginTop: 18, background: '#132634', borderRadius: 18, padding: 16, border: '1px solid rgba(255,255,255,0.05)', lineHeight: 1.9 }}>
              <div style={statRow}><span style={statLabel}>1st Guess</span><span style={{ ...statValue, color: '#00e701' }}>x15</span></div>
              <div style={statRow}><span style={statLabel}>2nd Guess</span><span style={{ ...statValue, color: '#ff9800' }}>x10</span></div>
              <div style={statRow}><span style={statLabel}>3rd Guess</span><span style={{ ...statValue, color: '#ff4d4d' }}>x5</span></div>
            </div>
            
            <div style={{ marginTop: 16, color: '#b1bad3', minHeight: 30, lineHeight: 1.6, fontWeight: 600 }}>{message}</div>
          </div>

          {/* صندوق المحادثة (مفصول تحت لوحة التحكم) */}
          <div style={{ background: '#1a2c38', borderRadius: 24, padding: 20, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', height: 400 }}>
            <div style={{ fontWeight: 900, marginBottom: 15, color: 'white' }}>AI Oracle Chat 🤖</div>
            
            {/* منطقة رسائل الشات */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingRight: 5, marginBottom: 15 }}>
              {chatLog.length === 0 && <div style={{ color: '#b1bad3', textAlign: 'center', marginTop: 50 }}>Chat will appear here...</div>}
              {chatLog.map((msg, i) => (
                <div key={i} className={`chat-bubble ${msg.sender === 'ai' ? 'chat-ai' : 'chat-user'}`}>
                  {msg.text}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* إدخال الأسئلة */}
            <form onSubmit={askQuestion} style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                placeholder="Ask a Yes/No question..."
                value={currentQuestion}
                onChange={(e) => setCurrentQuestion(e.target.value)}
                disabled={busy || phase !== 'playing' || questionsLeft <= 0}
                style={{ ...inputStyle, flex: 1, padding: '12px 15px', fontSize: 14, opacity: (busy || phase !== 'playing' || questionsLeft <= 0) ? 0.5 : 1 }}
              />
              <button
                type="submit"
                disabled={busy || phase !== 'playing' || questionsLeft <= 0 || !currentQuestion.trim()}
                style={{ ...actionBtn, background: '#ff9800', color: 'black', padding: '0 15px', opacity: (busy || phase !== 'playing' || questionsLeft <= 0 || !currentQuestion.trim()) ? 0.5 : 1 }}
              >
                Ask
              </button>
            </form>
            {phase === 'playing' && questionsLeft <= 0 && (
              <div style={{ color: '#ff4d4d', fontSize: 12, textAlign: 'center', marginTop: 8, fontWeight: 'bold' }}>Out of questions! Make your guesses.</div>
            )}
          </div>

        </div>

        {/* Board Section */}
        <div style={{ background: '#1a2c38', borderRadius: 24, padding: 24, border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <SummaryItem label="Current Theme" value={theme || '???'} accent={theme ? '#ff9800' : 'white'} />
            <SummaryItem label="Remaining Guesses" value={phase === 'playing' ? guessesLeft : '-'} accent={guessesLeft > 1 ? '#00e701' : '#ff4d4d'} />
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f212e', borderRadius: 22, border: '1px solid rgba(255,255,255,0.05)', padding: '30px', position: 'relative' }}>
            
            {phase === 'idle' && grid.length === 0 && (
              <div style={{ textAlign: 'center', color: '#b1bad3' }}>
                <div style={{ fontSize: 60, opacity: 0.2, marginBottom: 10 }}>🕵️</div>
                <h2>Guess Who?</h2>
                <p>Let AI pick a theme and 9 secret items.</p>
              </div>
            )}

            {(phase !== 'idle' || grid.length > 0) && (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(3, 1fr)', 
                gridTemplateRows: 'repeat(3, 1fr)',
                gap: 15, 
                width: '100%', 
                maxWidth: 550 
              }}>
                {grid.map((item, index) => (
                  <div 
                    key={index}
                    className={`guess-card ${item.eliminated ? 'eliminated' : ''} ${item.highlight ? 'highlight' : ''}`}
                    onClick={() => handleGuess(item.name)}
                    title={item.eliminated ? "Eliminated by AI" : "Click to Guess!"}
                  >
                    {item.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* سجل النتائج أسفل اللوحة */}
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10, color: 'white' }}>Last Results</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {history.length === 0 ? (
                <div style={{ background: '#132634', borderRadius: 14, padding: 14, color: '#b1bad3' }}>No games yet.</div>
              ) : (
                history.map((item, index) => (
                  <div key={index} style={{ background: '#132634', borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, color: item.won ? '#00e701' : '#ff4d4d' }}>
                        {item.won ? `Win (x${item.multiplier})` : 'Loss'}
                      </div>
                      <div style={{ color: '#b1bad3', fontSize: 13, marginTop: 4 }}>
                        Theme: {item.theme} | Secret: {item.secret}
                      </div>
                    </div>
                    <div style={{ fontWeight: 900, color: item.won ? '#00e701' : 'white' }}>
                      ${formatMoney(item.payout)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </PageShell>
  );
}

// UI Components
function SummaryItem({ label, value, accent = 'white' }) {
  return (
    <div style={{ background: '#132634', borderRadius: 16, padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)', flex: 1, minWidth: 0 }}>
      <span style={{ color: '#b1bad3', fontWeight: 700, fontSize: 13, marginBottom: 6, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ color: accent, fontWeight: 900, fontSize: 20, whiteSpace: 'nowrap', textAlign: 'center' }}>{value}</span>
    </div>
  );
}

const inputStyle = { width: '100%', borderRadius: 14, background: '#0f212e', border: '1px solid rgba(255,255,255,0.1)', padding: '14px 16px', color: 'white' };
const actionBtn = { background: '#233847', color: 'white', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '0 20px', cursor: 'pointer', fontWeight: 800, fontSize: 16 };
const primaryBtn = { width: '100%', borderRadius: 14, background: '#00e701', color: 'black', fontWeight: 900, padding: '15px 16px', border: 'none', cursor: 'pointer', marginTop: 18, transition: 'transform 0.05s ease' };
const statRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 };
const statLabel = { color: '#b1bad3' };
const statValue = { color: 'white', fontWeight: 800 };
