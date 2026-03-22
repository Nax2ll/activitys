const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// قائمة الألعاب المسموحة (تشمل الـ 10 ألعاب كاملة)
const ALLOWED_GAMES = new Set([
  'plinko', 'mines', 'keno', 'dice', 'dragonTower', 
  'chickenCross', 'slots', 'guess', 'memory', 'camel_racing', 'guess_who'
]);

function normalizeGame(game) {
  const value = String(game || 'unknown').trim();
  return ALLOWED_GAMES.has(value) ? value : 'unknown';
}

function normalizeUsername(username) {
  return String(username || '').trim();
}

async function ensureUser(userId, username = '', session = null) {
  const cleanUsername = normalizeUsername(username);
  const update = {
    $setOnInsert: { userId, wallet: 0, totalWagered: 0, totalWon: 0, stats: {} }
  };
  if (cleanUsername) update.$set = { username: cleanUsername };

  await User.updateOne({ userId }, update, { upsert: true, session });
}

// مسار الرهان (Bet)
router.post('/bet', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { userId, username = '', amount, game = 'unknown', reason = 'game bet', meta = {} } = req.body;
    const stake = Number(amount);
    const cleanUsername = normalizeUsername(username);
    const normalizedGame = normalizeGame(game);

    if (!userId || !Number.isFinite(stake) || stake <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid input' });
    }

    let responsePayload = null;
    await session.withTransaction(async () => {
      await ensureUser(userId, cleanUsername, session);
      const user = await User.findOneAndUpdate(
        { userId, wallet: { $gte: stake } },
        { $inc: { wallet: -stake, totalWagered: stake }, ...(cleanUsername ? { $set: { username: cleanUsername } } : {}) },
        { new: true, session }
      );

      if (!user) throw new Error('INSUFFICIENT_BALANCE');
      const roundId = crypto.randomUUID();
      await Transaction.create([{
        userId, game: normalizedGame, roundId, type: 'bet', amount: stake,
        reason, balanceAfter: user.wallet, status: 'open', result: 'pending', meta
      }], { session });

      responsePayload = { ok: true, roundId, balance: user.wallet, wallet: user.wallet };
    });
    return res.json(responsePayload);
  } catch (error) {
    if (error.message === 'INSUFFICIENT_BALANCE') return res.status(400).json({ ok: false, error: 'Insufficient balance' });
    res.status(500).json({ ok: false, error: 'Internal server error' });
  } finally { session.endSession(); }
});

// مسار التسوية (Settle)
router.post('/settle', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { userId, username = '', roundId, payout = 0, game, reason = 'game payout', result, finalState = {} } = req.body;
    const cashout = Number(payout);
    if (!userId || !roundId || !Number.isFinite(cashout) || cashout < 0) return res.status(400).json({ ok: false, error: 'Invalid input' });

    let responsePayload = null;
    await session.withTransaction(async () => {
      const betTx = await Transaction.findOneAndUpdate({ userId, roundId, type: 'bet', status: 'open' }, { $set: { status: 'closed', settledAt: new Date() } }, { new: true, session });
      if (!betTx) throw new Error('ROUND_NOT_FOUND_OR_SETTLED');

      const normalizedGame = normalizeGame(game || betTx.game);
      const net = cashout - betTx.amount;
      const ledgerResult = ['win', 'loss', 'cashout'].includes(String(result)) ? String(result) : (cashout <= 0 ? 'loss' : (cashout < betTx.amount ? 'cashout' : 'win'));

      const inc = { [`stats.${normalizedGame}.played`]: 1, [`stats.${normalizedGame}.profit`]: net };
      if (net >= 0) inc[`stats.${normalizedGame}.wins`] = 1; else inc[`stats.${normalizedGame}.losses`] = 1;
      if (cashout > 0) { inc.wallet = cashout; inc.totalWon = cashout; }

      const user = await User.findOneAndUpdate({ userId }, { $inc: inc }, { new: true, session });
      await Transaction.updateOne({ _id: betTx._id }, { $set: { result: ledgerResult } }, { session });

      if (cashout > 0) {
        await Transaction.create([{ userId, game: normalizedGame, roundId, type: 'payout', amount: cashout, reason, balanceAfter: user.wallet, status: 'closed', result: ledgerResult, meta: finalState, settledAt: new Date() }], { session });
      }
      responsePayload = { ok: true, roundId, result: ledgerResult, balance: user.wallet, stats: user.stats };
    });
    return res.json(responsePayload);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  } finally { session.endSession(); }
});

// مسار إحصائيات الأرباح
router.get('/top-profit/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ userId }).lean();
    const stats = user?.stats || {};
    const labels = {
      plinko: 'Plinko', mines: 'Mines', keno: 'Keno', dice: 'Dice',
      dragonTower: 'Dragon Tower', chickenCross: 'Chicken Cross',
      slots: 'Slots', guess: 'Number Guess', memory: 'Memory Gamble',
      camel_racing: 'Camel Racing', guess_who: 'AI Guess Who'
    };
    const items = Object.entries(stats).map(([key, value]) => ({
      key, name: labels[key] || key, played: value.played, wins: value.wins, losses: value.losses, profit: value.profit
    })).filter(i => i.played > 0).sort((a, b) => b.profit - a.profit).slice(0, 3);
    res.json({ ok: true, items });
  } catch (e) { res.status(500).json({ ok: false }); }
});

// مسار Gemini AI Proxy
router.post('/gemini', async (req, res) => {
  try {
    const { prompt } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing API Key" });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, response_mime_type: "application/json" }
      })
    });

    const data = await response.json();
    if (data.candidates && data.candidates[0].content.parts[0].text) {
      const rawText = data.candidates[0].content.parts[0].text;
      const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      res.json(JSON.parse(cleanJson));
    } else {
      res.status(500).json({ error: "AI failed to respond" });
    }
  } catch (error) { res.status(500).json({ error: "Server Error" }); }
});

module.exports = router;
