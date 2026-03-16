const express = require('express');
const router = express.Router();
const User = require('../models/User');

async function ensureUser(userId, username = '') {
  const cleanUsername = String(username || '').trim();

  const update = {
    $setOnInsert: {
      userId,
      username: cleanUsername,
      balance: 10000,
      totalWagered: 0,
      totalWon: 0
    }
  };

  if (cleanUsername) {
    update.$set = { username: cleanUsername };
  }

  await User.updateOne({ userId }, update, { upsert: true });
  return User.findOne({ userId });
}

router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const username = req.query.username || '';

    if (!userId) {
      return res.status(400).json({ ok: false, error: 'Missing userId' });
    }

    const user = await ensureUser(userId, username);

    return res.json({
      ok: true,
      balance: user.balance,
      totalWagered: user.totalWagered,
      totalWon: user.totalWon,
      stats: user.stats,
      user: {
        userId: user.userId,
        username: user.username,
        avatar: user.avatar || ''
      }
    });
  } catch (error) {
    console.error('GET /balance error:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

module.exports = router;