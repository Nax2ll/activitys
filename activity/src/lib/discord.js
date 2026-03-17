import { DiscordSDK } from '@discord/embedded-app-sdk';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;
const STORAGE_KEY = 'casino.discord.user';

export const discordSdk = new DiscordSDK(CLIENT_ID);

let cachedUser = readStoredUser();
let cachedUserPromise = null;

function withTimeout(promise, label, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

function readStoredUser() {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.userId) return null;

    return {
      id: parsed.userId,
      userId: parsed.userId,
      username: parsed.username || ''
    };
  } catch {
    return null;
  }
}

function storeUser(user) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        userId: user.userId,
        username: user.username || ''
      })
    );
  } catch {}
}

export function getCachedDiscordUser() {
  return cachedUser || readStoredUser();
}

export function clearCachedDiscordUser() {
  cachedUser = null;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}

export async function initDiscordUser(options = {}) {
  const { forceRefresh = false } = options;

  if (!forceRefresh) {
    const existing = cachedUser || readStoredUser();
    if (existing?.userId) {
      cachedUser = existing;
      return existing;
    }
  }

  if (cachedUserPromise) return cachedUserPromise;

  if (!CLIENT_ID) {
    throw new Error('Missing VITE_DISCORD_CLIENT_ID');
  }

  cachedUserPromise = (async () => {
    await withTimeout(discordSdk.ready(), 'discordSdk.ready');

    const authCodeRes = await withTimeout(
      discordSdk.commands.authorize({
        client_id: CLIENT_ID,
        response_type: 'code',
        state: 'activity-auth',
        prompt: 'none',
        scope: ['identify']
      }),
      'authorize'
    );

    const code = authCodeRes?.code;
    if (!code) {
      throw new Error('No OAuth code returned from Discord');
    }

    const tokenRes = await withTimeout(
      fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      }),
      'POST /api/token'
    );

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData?.access_token) {
      throw new Error(tokenData?.error || 'OAuth token exchange failed');
    }

    await withTimeout(
      discordSdk.commands.authenticate({
        access_token: tokenData.access_token
      }),
      'authenticate'
    );

    const meRes = await withTimeout(
      fetch('/api/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }),
      'GET /api/me'
    );

    const meData = await meRes.json();
    if (!meRes.ok || !meData?.user?.id) {
      throw new Error(meData?.error || 'Failed to fetch Discord user');
    }

    cachedUser = {
      id: meData.user.id,
      userId: meData.user.id,
      username: meData.user.username || ''
    };

    storeUser(cachedUser);
    return cachedUser;
  })();

  try {
    return await cachedUserPromise;
  } finally {
    cachedUserPromise = null;
  }
}
