const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');

const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// 💡 التعديل هنا: إضافة كل الألعاب الجديدة للقائمة
const ALLOWED_GAMES = new Set([
  'plinko',
  'mines',
  'keno',
  'dice',
  'dragonTower',
  'chickenCross',
  'slots',
  'guess',
  'memory',
  'camel_racing',
  'guess_who'
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
    $setOnInsert: {
      userId,
      wallet: 0,
      totalWagered: 0,
      totalWon: 0,
      stats: {}
    }
  };

  if (cleanUsername) {
    update.$set = { username: cleanUsername };
  }

  await User.updateOne(
    { userId },
    update,
    {
      upsert: true,
      session
    }
  );
}

router.post('/bet', async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const {
      userId,
      username = '',
      amount,
      game = 'unknown',
      reason = 'game bet',
      meta = {}
    } = req.body;

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
        {
          userId,
          wallet: { $gte: stake }
        },
        {
          $inc: {
            wallet: -stake,
            totalWagered: stake
          },
          ...(cleanUsername ? { $set: { username: cleanUsername } } : {})
        },
        {
          new: true,
          session
        }
      );

      if (!user) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      const roundId = crypto.randomUUID();

      await Transaction.create(
        [
          {
            userId,
            game: normalizedGame,
            roundId,
            type: 'bet',
            amount: stake,
            reason,
            balanceAfter: user.wallet,
            status: 'open',
            result: 'pending',
            meta
          }
        ],
        { session }
      );

      responsePayload = {
        ok: true,
        roundId,
        balance: user.wallet,
        wallet: user.wallet
      };
    });

    return res.json(responsePayload);
  } catch (error) {
    console.error('POST /games/bet error:', error);

    if (error.message === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ ok: false, error: 'Insufficient balance' });
    }

    return res.status(500).json({ ok: false, error: 'Internal server error' });
  } finally {
    session.endSession();
  }
});

router.post('/settle', async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const {
      userId,
      username = '',
      roundId,
      payout = 0,
      game,
      reason = 'game payout',
      result,
      finalState = {}
    } = req.body;

    const cleanUsername = normalizeUsername(username);
    const cashout = Number(payout);

    if (!userId || !roundId || !Number.isFinite(cashout) || cashout < 0) {
      return res.status(400).json({ ok: false, error: 'Invalid input' });
    }

    let responsePayload = null;

    await session.withTransaction(async () => {
      const betTx = await Transaction.findOneAndUpdate(
        {
          userId,
          roundId,
          type: 'bet',
          status: 'open'
        },
        {
          $set: {
            status: 'closed',
            settledAt: new Date()
          }
        },
        {
          new: true,
          session
        }
      );

      if (!betTx) {
        throw new Error('ROUND_NOT_FOUND_OR_SETTLED');
      }

      const normalizedGame = normalizeGame(game || betTx.game);
      const net = cashout - betTx.amount;

      const ledgerResult =
        ['win', 'loss', 'cashout'].includes(String(result))
          ? String(result)
          : cashout <= 0
          ? 'loss'
          : cashout < betTx.amount
          ? 'cashout'
          : 'win';

      const inc = {
        [`stats.${normalizedGame}.played`]: 1,
        [`stats.${normalizedGame}.profit`]: net
      };

      if (net >= 0) {
        inc[`stats.${normalizedGame}.wins`] = 1;
      } else {
        inc[`stats.${normalizedGame}.losses`] = 1;
      }

      if (cashout > 0) {
        inc.wallet = cashout;
        inc.totalWon = cashout;
      }

      const user = await User.findOneAndUpdate(
        { userId },
        {
          $inc: inc,
          ...(cleanUsername ? { $set: { username: cleanUsername } } : {})
        },
        {
          new: true,
          session
        }
      );

      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      await Transaction.updateOne(
        { _id: betTx._id },
        {
          $set: {
            game: normalizedGame,
            result: ledgerResult
          }
        },
        { session }
      );

      if (cashout > 0) {
        await Transaction.create(
          [
            {
              userId,
              game: normalizedGame,
              roundId,
              type: 'payout',
              amount: cashout,
              reason,
              balanceAfter: user.wallet,
              status: 'closed',
              result: ledgerResult,
              meta: finalState,
              settledAt: new Date()
            }
          ],
          { session }
        );
      }

      responsePayload = {
        ok: true,
        roundId,
        result: ledgerResult,
        balance: user.wallet,
        wallet: user.wallet,
        totalWagered: user.totalWagered,
        totalWon: user.totalWon,
        stats: user.stats
      };
    });

    return res.json(responsePayload);
  } catch (error) {
    console.error('POST /games/settle error:', error);

    if (error.message === 'ROUND_NOT_FOUND_OR_SETTLED') {
      return res.status(404).json({
        ok: false,
        error: 'Round not found or already settled'
      });
    }

    if (error.message === 'USER_NOT_FOUND') {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    return res.status(500).json({ ok: false, error: 'Internal server error' });
  } finally {
    session.endSession();
  }
});

router.get('/top-profit/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ ok: false, error: 'Missing userId' });
    }

    const user = await User.findOne({ userId }).lean();

    const stats = user?.stats || {};

    // 💡 التعديل هنا: إضافة تسميات الألعاب الجديدة
    const labels = {
      dice: 'Dice',
      mines: 'Mines',
      chickenCross: 'Chicken Cross',
      dragonTower: 'Dragon Tower',
      plinko: 'Plinko',
      keno: 'Keno',
      slots: 'Slots',
      guess: 'Number Guess',
      memory: 'Memory Gamble',
      camel_racing: 'Camel Racing',
      guess_who: 'AI Guess Who'
    };

    const items = Object.entries(stats)
      .map(([key, value]) => ({
        key,
        name: labels[key] || key,
        played: Number(value?.played || 0),
        wins: Number(value?.wins || 0),
        losses: Number(value?.losses || 0),
        profit: Number(value?.profit || 0)
      }))
      .filter((item) => item.played > 0)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 3);

    return res.json({
      ok: true,
      items
    });
  } catch (error) {
    console.error('GET /games/top-profit/:userId error:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// 💡 التعديل هنا: المسار الجديد للتواصل مع الذكاء الاصطناعي (Gemini Proxy)
router.post('/gemini', async (req, res) => {
  try {
    const { prompt } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY in server environment" });
    }

    // استخدام النسخة المستقرة السريعة
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    
    // استخدام dynamic import لـ node-fetch عشان يشتغل على كل إصدارات Node.js
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2, // تقليل العشوائية للالتزام بالـ JSON
          response_mime_type: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API Error from Google:", errText);
      return res.status(response.status).json({ error: "Gemini API rejected the request" });
    }

    const data = await response.json();
    const rawText = data.candidates[0].content.parts[0].text;
    
    // تنظيف المخرجات وتحويلها لـ JSON آمن
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    res.json(JSON.parse(cleanJson));
  } catch (error) {
    console.error("Backend Gemini Proxy Error:", error);
    res.status(500).json({ error: "Internal Server Error during AI generation" });
  }
});

module.exports = router;
