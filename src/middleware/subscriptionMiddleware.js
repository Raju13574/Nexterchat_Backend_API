const subscriptionService = require('../services/subscriptionService');
const User = require('../models/User');

const checkSubscriptionMiddleware = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
    }

    // Reset daily free credits if necessary
    req.user.resetDailyFreeCredits();
    await req.user.save();

    const canProceed = await subscriptionService.handleRequest(req.user._id);
    if (canProceed) {
      next();
    } else {
      res.status(403).json({ 
        success: false,
        error: 'Daily limit reached or invalid subscription. Please upgrade your plan or wait for credit reset.',
        upgradeLink: '/api/subscription/plans'
      });
    }
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(402).json({ 
      success: false,
      message: error.message,
      error: 'Failed to verify subscription status'
    });
  }
};

module.exports = { checkSubscriptionMiddleware };
