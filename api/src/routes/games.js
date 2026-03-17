const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');

const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const activeRounds = new Map();

function makeRoundKey(userId, roundId) {
  return `${userId}:${roundId}`;
}

router.post('/bet', async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const {
      userId,
      amount,
      game = 'unknown'
    } = req.body;

    const betAmount = Number(amount);

    if (!userId || !Number.isFinite(betAmount) || betAmount <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid input' });
    }

    let responsePayload = null;

    await session.withTransaction(async () => {
      let user = await User.findOne({ userId }).session(session);

      if (!user) {
        user = await User.create(
          [{ userId, wallet: 0 }],
          { session }
        ).then((docs) => docs[0]);
      }

      if ((user.wallet || 0) < betAmount) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      user.wallet -= betAmount;
      await user.save({ session });

      await Transaction.create(
        [
          {
            userId,
            amount: -betAmount,
            reason: `🎰 Bet on ${game}`,
            timestamp: new Date()
          }
        ],
        { session }
      );

      const roundId = crypto.randomUUID();

      activeRounds.set(
        makeRoundKey(userId, roundId),
        {
          userId,
          game,
          betAmount
        }
      );

      responsePayload = {
        ok: true,
        roundId,
        balance: user.wallet
      };
    });

    return res.json(responsePayload);
  } catch (error) {
    console.error('POST /games/bet error:', error);

    if (error.message === 'INSUFFICIENT_FUNDS') {
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
      roundId,
      payout = 0,
      game = 'unknown'
    } = req.body;

    const finalPayout = Number(payout);

    if (!userId || !roundId || !Number.isFinite(finalPayout) || finalPayout < 0) {
      return res.status(400).json({ ok: false, error: 'Invalid input' });
    }

    const roundKey = makeRoundKey(userId, roundId);
    const round = activeRounds.get(roundKey);

    if (!round) {
      return res.status(404).json({
        ok: false,
        error: 'Round not found or already settled'
      });
    }

    let responsePayload = null;

    await session.withTransaction(async () => {
      const user = await User.findOne({ userId }).session(session);

      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      if (finalPayout > 0) {
        user.wallet += finalPayout;
        await user.save({ session });

        await Transaction.create(
          [
            {
              userId,
              amount: finalPayout,
              reason: `🎰 ${game} payout`,
              timestamp: new Date()
            }
          ],
          { session }
        );
      }

      responsePayload = {
        ok: true,
        balance: user.wallet
      };
    });

    activeRounds.delete(roundKey);

    return res.json(responsePayload);
  } catch (error) {
    console.error('POST /games/settle error:', error);

    if (error.message === 'USER_NOT_FOUND') {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    return res.status(500).json({ ok: false, error: 'Internal server error' });
  } finally {
    session.endSession();
  }
});

module.exports = router;
