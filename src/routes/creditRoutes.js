const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

router.post('/purchase', authenticateUser, async (req, res) => {
  const { amount } = req.body; // Amount in dollars
  const userId = req.user._id;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add credits to the user's account
    const credits = amount * 100; // 1 dollar = 100 credits
    user.credits.purchased += credits;
    await user.save();

    // Record the transaction
    const transaction = new Transaction({
      user: userId,
      type: 'credit_purchase',
      amount,
      description: `Purchased ${credits} credits`,
    });
    await transaction.save();

    res.json({
      message: 'Credits purchased successfully',
      credits: user.credits.purchased,
    });
  } catch (err) {
    console.error('Error in credit purchase process:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

module.exports = router;
