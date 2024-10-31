const User = require('../models/User');
const Execution = require('../models/Execution');
const Subscription = require('../models/Subscription');

const checkCredits = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('activeSubscription');
    if (!user) {
      return res.status(403).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get active subscription
    const subscription = await Subscription.findOne({ 
      user: user._id, 
      active: true,
      endDate: { $gt: new Date() }
    }).sort({ startDate: -1 });

    // Check if user has an active paid subscription
    if (subscription && subscription.plan !== 'free') {
      // 1. First check subscription plan credits
      const executionsToday = await Execution.countDocuments({
        user: user._id,
        createdAt: { 
          $gte: today,
          $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        },
        creditSource: 'subscription'
      });

      if (executionsToday < subscription.creditsPerDay) {
        req.creditSource = 'subscription';
        req.subscription = subscription;
        return next();
      }

      // 2. Then check purchased credits
      if (user.credits.purchased > 0) {
        req.creditSource = 'purchased';
        return next();
      }

      // 3. Then check granted credits
      if (user.credits.granted > 0) {
        req.creditSource = 'granted';
        return next();
      }

      // 4. Finally check promotional credits
      const validPromo = user.credits.promotional.find(promo => 
        promo.credits > 0 && 
        new Date() >= promo.startDate && 
        new Date() <= promo.endDate
      );
      if (validPromo) {
        req.creditSource = 'promotional';
        req.promoId = validPromo._id;
        return next();
      }
    } else {
      // Free plan or no active subscription logic
      // 1. First check free plan credits
      const freeExecutionsToday = await Execution.countDocuments({
        user: user._id,
        createdAt: { 
          $gte: today,
          $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        },
        creditSource: 'free'
      });

      if (freeExecutionsToday < 15) {
        req.creditSource = 'free';
        return next();
      }

      // 2. Then check purchased credits
      if (user.credits.purchased > 0) {
        req.creditSource = 'purchased';
        return next();
      }

      // 3. Then check granted credits
      if (user.credits.granted > 0) {
        req.creditSource = 'granted';
        return next();
      }

      // 4. Finally check promotional credits
      const validPromo = user.credits.promotional.find(promo => 
        promo.credits > 0 && 
        new Date() >= promo.startDate && 
        new Date() <= promo.endDate
      );
      if (validPromo) {
        req.creditSource = 'promotional';
        req.promoId = validPromo._id;
        return next();
      }
    }

    return res.status(403).json({ 
      success: false,
      error: 'No credits available',
      message: subscription?.plan === 'free' ? 
        'Please purchase credits or upgrade your subscription plan' :
        'Daily subscription credits exhausted. Please purchase additional credits or wait for tomorrow.',
      upgradeLink: '/api/subscription/plans'
    });

  } catch (error) {
    console.error('Credit check error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to check credits'
    });
  }
};

const deductCredit = async (req, res, next) => {
  try {
    if (req.skipCreditDeduction) {
      return next();
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(403).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    // Only track credit source, don't create execution record here
    switch (req.creditSource) {
      case 'subscription':
      case 'free':
        // These are tracked by execution records in executionController
        break;

      case 'purchased':
        user.credits.purchased -= 1;
        await user.save();
        break;

      case 'granted':
        user.credits.granted -= 1;
        await user.save();
        break;

      case 'promotional':
        const promoIndex = user.credits.promotional.findIndex(
          promo => promo._id.toString() === req.promoId.toString()
        );
        if (promoIndex !== -1) {
          user.credits.promotional[promoIndex].credits -= 1;
          await user.save();
        }
        break;

      default:
        console.warn(`Unknown credit source: ${req.creditSource}, defaulting to free`);
    }

    next();
  } catch (error) {
    console.error('Credit deduction error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to deduct credit'
    });
  }
};

module.exports = { 
  checkCredits,
  deductCredit 
};