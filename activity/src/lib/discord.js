import { DiscordSDK } from '@discord/embedded-app-sdk';

export const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

let cachedAuth = null;
let cachedUser = null;

export async function initDiscordUser() {
  if (cachedUser) return cachedUser;

  await discordSdk.ready();

  const { code } = await discordSdk.commands.authorize({
    client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify']
  });

  const tokenRes = await fetch('/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ code })
  });

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData?.access_token) {
    throw new Error(tokenData?.error || 'OAuth token exchange failed');
  }

  cachedAuth = await discordSdk.commands.authenticate({
    access_token: tokenData.access_token
  });

  const meRes = await fetch('/api/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`
    }
  });

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
}