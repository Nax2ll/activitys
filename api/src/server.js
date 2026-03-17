require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const balanceRoute = require('./routes/balance');
const gamesRoute = require('./routes/games');

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const HOST = '0.0.0.0';

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://activitys.naelhimself.workers.dev'
  ],
  credentials: false
}));

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Casino API running' });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

app.post('/token', async (req, res) => {
  try {
    const { code } = req.body;

    console.log('[POST /token] code exists:', Boolean(code));
    console.log('[POST /token] DISCORD_CLIENT_ID exists:', Boolean(process.env.DISCORD_CLIENT_ID));
    console.log('[POST /token] DISCORD_CLIENT_SECRET exists:', Boolean(process.env.DISCORD_CLIENT_SECRET));

    if (!code) {
      return res.status(400).json({ ok: false, error: 'Missing code' });
    }

    if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
      return res.status(500).json({
        ok: false,
        error: 'Missing Discord OAuth environment variables'
      });
    }

    const params = new URLSearchParams();
    params.append('client_id', process.env.DISCORD_CLIENT_ID);
    params.append('client_secret', process.env.DISCORD_CLIENT_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await response.json();

    console.log('[POST /token] discord status:', response.status);
    console.log('[POST /token] discord data:', data);

    if (!response.ok) {
      return res.status(400).json({
        ok: false,
        error: data?.error_description || data?.error || 'OAuth exchange failed',
        details: data
      });
    }

    return res.json({
      ok: true,
      access_token: data.access_token
    });
  } catch (error) {
    console.error('POST /token error:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Internal server error'
    });
  }
});

app.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

    console.log('[GET /me] token exists:', Boolean(token));

    if (!token) {
      return res.status(401).json({ ok: false, error: 'Missing bearer token' });
    }

    const response = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();

    console.log('[GET /me] discord status:', response.status);
    console.log('[GET /me] discord data:', data);

    if (!response.ok) {
      return res.status(400).json({
        ok: false,
        error: data?.message || 'Failed to fetch current user',
        details: data
      });
    }

    return res.json({
      ok: true,
      user: {
        id: data.id,
        username: data.username
      }
    });
  } catch (error) {
    console.error('GET /me error:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Internal server error'
    });
  }
});

app.use('/balance', balanceRoute);
app.use('/games', gamesRoute);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Mongo connected');
    app.listen(PORT, HOST, () => {
      console.log(`API listening on http://${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Mongo connection error:', err);
  });
