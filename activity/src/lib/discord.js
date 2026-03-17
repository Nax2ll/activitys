import { DiscordSDK } from '@discord/embedded-app-sdk';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

export const discordSdk = new DiscordSDK(CLIENT_ID);

let cachedUser = null;
let cachedUserPromise = null;

function withTimeout(promise, label, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

export async function initDiscordUser() {
  if (cachedUser) return cachedUser;
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

    return cachedUser;
  })();

  try {
    return await cachedUserPromise;
  } finally {
    cachedUserPromise = null;
  }
}
