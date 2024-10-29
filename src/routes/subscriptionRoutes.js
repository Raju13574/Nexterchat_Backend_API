const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const subscriptionController = require('../controllers/subscriptionController');

const plans = [
  { id: 'free', name: 'Free Plan', price: 0, creditsPerDay: 50, duration: 'daily' },
  { id: 'monthly', name: 'Monthly Plan', price: 4.99, creditsPerMonth: 45000, duration: 'monthly' },
  { id: 'quarterly', name: 'Three Months Plan', price: 12.99, creditsPerDay: 2000, duration: 'quarterly' },
  { id: 'semiannual', name: 'Six Months Plan', price: 19.99, creditsPerDay: 3000, duration: 'semiannual' },
  { id: 'annual', name: 'Yearly Plan', price: 35.99, creditsPerDay: 'unlimited', duration: 'annual' }
];

// Get all plans
router.get('/plans', subscriptionController.getPlans);

// Subscribe to a plan
router.post('/plans/:plan_id/subscribe', authenticateUser, subscriptionController.subscribe);

// Upgrade subscription
router.post('/plans/:plan_id/upgrade', authenticateUser, subscriptionController.upgrade);

// Cancel subscription
router.post('/cancel', authenticateUser, subscriptionController.cancel);

// Get subscription status
router.get('/status', authenticateUser, subscriptionController.getStatus);

// Keep existing routes
router.get('/plans', (req, res) => {
  res.json(plans);
});

// Subscribe to a plan
router.post('/subscribe', authenticateUser, async (req, res) => {
  const { planId } = req.body;
  const userId = req.user._id;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user already has an active subscription
    const activeSubscription = await Subscription.findOne({ user: userId, active: true });
    if (activeSubscription) {
      return res.status(400).json({ error: 'User already has an active subscription', subscription: activeSubscription });
    }

    const plan = plans.find(p => p.id === planId);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid subscription plan' });
    }

    // Handle free plan subscription
    const newSubscription = new Subscription({
      user: userId,
      type: planId,
      startDate: new Date(),
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day for free plan
      active: true,
    });
    await newSubscription.save();

    res.json({
      message: 'Subscribed successfully',
      subscription: newSubscription,
    });
  } catch (err) {
    console.error('Error in subscription process:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Get subscription status
router.get('/status', authenticateUser, async (req, res) => {
  const userId = req.user._id;

  try {
    const subscription = await Subscription.findOne({ user: userId, active: true });
    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    res.json({
      active: subscription.active,
      expiresAt: subscription.endDate,
      type: subscription.type
    });
  } catch (err) {
    console.error('Error in get subscription status:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});


// Add these new routes
router.post('/plans/:plan_id/create-razorpay-order', authenticateUser, subscriptionController.createRazorpayOrder);
router.post('/verify-razorpay-payment', authenticateUser, subscriptionController.verifyRazorpayPayment);

router.get('/history', authenticateUser, subscriptionController.getSubscriptionHistory);

router.post('/plans/:plan_id/downgrade', authenticateUser, subscriptionController.downgrade);

module.exports = router;
