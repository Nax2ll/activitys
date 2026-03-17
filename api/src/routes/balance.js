const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const username = String(req.query.username || '').trim();

    if (!userId) {
      return res.status(400).json({ ok: false, error: 'Missing userId' });
    }

    let user = await User.findOne({ userId });

    if (!user) {
      user = await User.create({
        userId,
        username,
        wallet: 0
      });
    } else if (username && username !== user.username) {
      user.username = username;
      await user.save();
    }

    const wallet = Number(user.wallet || 0);

    return res.json({
      ok: true,
      balance: wallet,
      wallet,
      user: {
        userId: user.userId,
        username: user.username || ''
      }
    });
  } catch (error) {
    console.error('GET /balance error:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

module.exports = router;
