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

    // STEP 1: Check if user has yearly plan
    if (subscription && subscription.plan === 'yearly') {
      // For yearly plan:
      // - Set credit source as subscription
      // - Mark as unlimited credits
      // - Skip all other credit checks
      req.creditSource = 'subscription';
      req.subscription = subscription;
      req.unlimitedCredits = true;  // This flag tells system to not deduct any credits
      return next();
    }

    // STEP 2: If not yearly plan, check other credit sources
    if (subscription && subscription.plan !== 'free') {
      // Check regular subscription credits
      const executionsToday = await Execution.countDocuments({
        user: user._id,
        createdAt: { $gte: today },
        creditSource: 'subscription'
      });

      if (executionsToday < subscription.creditsPerDay) {
        req.creditSource = 'subscription';
        req.subscription = subscription;
        return next();
      }

      // Only check purchased credits if not on yearly plan
      if (user.credits.purchased > 0) {
        const purchasedExecutionsToday = await Execution.countDocuments({
          user: user._id,
          creditSource: 'purchased'
        });

        if (purchasedExecutionsToday < user.credits.purchased) {
          req.creditSource = 'purchased';
          return next();
        }
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
        const purchasedExecutionsToday = await Execution.countDocuments({
          user: user._id,
          creditSource: 'purchased'
        });

        if (purchasedExecutionsToday < user.credits.purchased) {
          req.creditSource = 'purchased';
          return next();
        }
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
      message: 'Please purchase credits or upgrade to yearly plan for unlimited executions'
    });

  } catch (error) {
    console.error('Credit check error:', error);
    return res.status(500).json({ error: 'Failed to check credits' });
  }
};

const deductCredit = async (req, res, next) => {
  try {
    // Get the user first
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Skip credit deduction for unlimited plans
    if (req.unlimitedCredits) {
      return next();
    }

    // For other plans, deduct credits based on source
    switch (req.creditSource) {
      case 'subscription':
        // No deduction needed for subscription credits
        break;

      case 'purchased':
        // Check again before deducting
        const purchasedExecutionsToday = await Execution.countDocuments({
          user: user._id,
          creditSource: 'purchased'
        });
        
        if (purchasedExecutionsToday >= user.credits.purchased) {
          return res.status(403).json({ 
            error: 'Insufficient purchased credits',
            message: 'Please purchase more credits to continue'
          });
        }
        break;

      case 'granted':
        if (user.credits.granted > 0) {
          user.credits.granted -= 1;
          await user.save();
        } else {
          return res.status(403).json({ 
            error: 'Insufficient granted credits'
          });
        }
        break;

      case 'promotional':
        const promoIndex = user.credits.promotional.findIndex(
          promo => promo._id.toString() === req.promoId.toString()
        );
        if (promoIndex !== -1 && user.credits.promotional[promoIndex].credits > 0) {
          user.credits.promotional[promoIndex].credits -= 1;
          await user.save();
        } else {
          return res.status(403).json({ 
            error: 'Insufficient promotional credits'
          });
        }
        break;

      case 'free':
        // No deduction needed for free credits
        break;

      default:
        console.warn(`Unknown credit source: ${req.creditSource}`);
        return res.status(400).json({ error: 'Invalid credit source' });
    }

    next();
  } catch (error) {
    console.error('Credit deduction error:', error);
    return res.status(500).json({ error: 'Failed to deduct credit' });
  }
};

module.exports = { 
  checkCredits,
  deductCredit 
};