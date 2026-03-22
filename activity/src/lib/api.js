import { initDiscordUser, getCachedDiscordUser } from './discord';

// 💡 الحل الأكيد: استخدم رابط Render الكامل دائماً لتجنب خطأ 405 في ديسكورد
const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://your-app-name.onrender.com').replace(/\/+$/, '');

function normalizeUser(userOrId) {
  if (typeof userOrId === 'string') return { userId: userOrId, username: '' };
  return { userId: userOrId?.id || userOrId?.userId || '', username: userOrId?.username || '' };
}

async function parseResponse(res) {
  try {
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error || `Error ${res.status}` };
    return data;
  } catch { return { ok: false, error: "Invalid Server Response" }; }
}

async function resolveUser(userOrId) {
  if (userOrId) return normalizeUser(userOrId);
  const cached = getCachedDiscordUser();
  if (cached?.userId) return normalizeUser(cached);
  return normalizeUser(await initDiscordUser());
}

export async function getBalance(userOrId) {
  const { userId, username } = await resolveUser(userOrId);
  const res = await fetch(`${API_BASE}/balance/${userId}${username ? `?username=${username}` : ''}`);
  return await parseResponse(res);
}

export async function placeBet(userOrId, amount, game = 'unknown', reason = 'game bet', meta = {}) {
  const { userId, username } = await resolveUser(userOrId);
  const res = await fetch(`${API_BASE}/games/bet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, username, amount: Number(amount), game, reason, meta })
  });
  return await parseResponse(res);
}

export async function settleGame(userOrId, roundId, payout, game = 'unknown', reason = 'game payout', finalState = {}, result) {
  const { userId, username } = await resolveUser(userOrId);
  const res = await fetch(`${API_BASE}/games/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, username, roundId, payout: Number(payout), game, reason, finalState, result })
  });
  return await parseResponse(res);
}

export async function getTopProfitGames(userOrId) {
  const { userId } = await resolveUser(userOrId);
  const res = await fetch(`${API_BASE}/games/top-profit/${userId}`);
  return await parseResponse(res);
}

export { API_BASE };
