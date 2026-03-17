const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');

const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const ALLOWED_GAMES = new Set([
  'plinko',
  'mines',
  'keno',
  'dice',
  'dragonTower',
  'chickenCross'
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
      // لاحظ: شلنا الـ username من هنا عشان ما يصير تعارض
      balance: 10000, 
      totalWagered: 0,
      totalWon: 0
    }
  };

  // الـ username بيتحدث أو ينضاف من هنا فقط
  if (cleanUsername) {
    update.$set = { username: cleanUsername };
  }

  await User.updateOne({ userId }, update, {
    upsert: true,
    session
  });
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
          balance: { $gte: stake }
        },
        {
          $inc: {
            balance: -stake,
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
            balanceAfter: user.balance,
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
        balance: user.balance
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
        inc.balance = cashout;
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
              balanceAfter: user.balance,
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
        balance: user.balance,
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

module.exports = router;
