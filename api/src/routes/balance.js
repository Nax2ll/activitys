const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ ok: false, error: 'Missing userId' });
    }

    let user = await User.findOne({ userId });

    if (!user) {
      user = await User.create({
        userId,
        wallet: 0
      });
    }

    return res.json({
      ok: true,
      balance: Number(user.wallet || 0),
      user: {
        userId: user.userId
      }
    });
  } catch (error) {
    console.error('GET /balance error:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

module.exports = router;
