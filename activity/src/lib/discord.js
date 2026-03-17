import { DiscordSDK } from '@discord/embedded-app-sdk';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

export const discordSdk = new DiscordSDK(CLIENT_ID);

let cachedUser = null;

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

  if (!CLIENT_ID) {
    throw new Error('Missing VITE_DISCORD_CLIENT_ID');
  }

  console.log('[discord] client id =', CLIENT_ID);
  console.log('[discord] ready start');
  await withTimeout(discordSdk.ready(), 'discordSdk.ready');
  console.log('[discord] ready done');

  console.log('[discord] authorize start');
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
  console.log('[discord] authorize done', authCodeRes);

  const code = authCodeRes?.code;
  if (!code) {
    throw new Error('No OAuth code returned from Discord');
  }

  console.log('[discord] /api/token start');
  const tokenRes = await withTimeout(
    fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    }),
    'POST /api/token'
  );
  console.log('[discord] /api/token response', tokenRes.status);

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData?.access_token) {
    throw new Error(tokenData?.error || 'OAuth token exchange failed');
  }

  console.log('[discord] authenticate start');
  await withTimeout(
    discordSdk.commands.authenticate({
      access_token: tokenData.access_token
    }),
    'authenticate'
  );
  console.log('[discord] authenticate done');

  console.log('[discord] /api/me start');
  const meRes = await withTimeout(
    fetch('/api/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
    }),
    'GET /api/me'
  );
  console.log('[discord] /api/me response', meRes.status);

  const meData = await meRes.json();
  if (!meRes.ok || !meData?.user?.id) {
    throw new Error(meData?.error || 'Failed to fetch Discord user');
  }

  cachedUser = {
    id: meData.user.id,
    userId: meData.user.id,
    username: meData.user.username || ''
  };

  console.log('[discord] final user', cachedUser);
  return cachedUser;
}
