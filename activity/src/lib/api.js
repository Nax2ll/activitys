import { initDiscordUser, getCachedDiscordUser } from './discord';

const API_BASE = import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '')
  : '/api';

function normalizeUser(userOrId) {
  if (typeof userOrId === 'string') {
    return {
      userId: userOrId,
      username: ''
    };
  }

  return {
    userId: userOrId?.id || userOrId?.userId || '',
    username: userOrId?.username || ''
  };
}

async function parseResponse(res) {
  let data = null;

  try {
    data = await res.json();
  } catch {
    return {
      ok: false,
      error: `Server returned invalid JSON (HTTP ${res.status})`
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: data?.error || `Request failed with status ${res.status}`
    };
  }

  return data;
}

async function resolveUser(userOrId) {
  if (userOrId) return normalizeUser(userOrId);

  const cached = getCachedDiscordUser();
  if (cached?.userId) {
    return normalizeUser(cached);
  }

  return normalizeUser(await initDiscordUser());
}

export async function getBalance(userOrId) {
  try {
    const { userId, username } = await resolveUser(userOrId);

    if (!userId) {
      return { ok: false, error: 'Missing userId' };
    }

    const query = username ? `?username=${encodeURIComponent(username)}` : '';
    const res = await fetch(`${API_BASE}/balance/${encodeURIComponent(userId)}${query}`, {
      method: 'GET'
    });

    return await parseResponse(res);
  } catch (error) {
    return {
      ok: false,
      error: error?.message || `Could not connect to API on ${API_BASE}`
    };
  }
}

export async function placeBet(
  userOrId,
  amount,
  game = 'unknown',
  reason = 'game bet',
  meta = {}
) {
  try {
    const { userId, username } = await resolveUser(userOrId);

    if (!userId) {
      return { ok: false, error: 'Missing userId' };
    }

    const res = await fetch(`${API_BASE}/games/bet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        username,
        amount: Number(amount),
        game,
        reason,
        meta
      })
    });

    return await parseResponse(res);
  } catch (error) {
    return {
      ok: false,
      error: error?.message || `Could not connect to API on ${API_BASE}`
    };
  }
}

export async function getTopProfitGames(userOrId) {
  try {
    const { userId } = await resolveUser(userOrId);

    if (!userId) {
      return { ok: false, error: 'Missing userId' };
    }

    const res = await fetch(`${API_BASE}/games/top-profit/${encodeURIComponent(userId)}`, {
      method: 'GET'
    });

    return await parseResponse(res);
  } catch (error) {
    return {
      ok: false,
      error: error?.message || `Could not connect to API on ${API_BASE}`
    };
  }
}
export async function settleGame(
  userOrId,
  roundId,
  payout,
  game = 'unknown',
  reason = 'game payout',
  finalState = {},
  result
) {
  try {
    const { userId, username } = await resolveUser(userOrId);

    if (!userId) {
      return { ok: false, error: 'Missing userId' };
    }

    if (!roundId) {
      return { ok: false, error: 'Missing roundId' };
    }

    const payload = {
      userId,
      username,
      roundId,
      payout: Number(payout),
      game,
      reason,
      finalState
    };

    if (result) {
      payload.result = result;
    }

    const res = await fetch(`${API_BASE}/games/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    return await parseResponse(res);
  } catch (error) {
    return {
      ok: false,
      error: error?.message || `Could not connect to API on ${API_BASE}`
    };
  }
}

export { API_BASE };
