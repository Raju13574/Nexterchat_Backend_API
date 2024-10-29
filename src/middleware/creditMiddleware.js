const User = require('../models/User');
const Execution = require('../models/Execution');
const Subscription = require('../models/Subscription');
const Transaction = require('../models/Transaction');

const checkCredits = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(403).json({ error: 'User not found' });
    }

    // Get active subscription
    const subscription = await Subscription.findOne({ 
      user: user._id, 
      active: true 
    }).sort({ endDate: -1 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get usage statistics
    const [todayFreeUsed, purchasedUsed, grantedUsed] = await Promise.all([
      Execution.countDocuments({
        user: user._id,
        createdAt: { $gte: today },
        creditSource: 'free'
      }),
      Execution.countDocuments({
        user: user._id,
        creditSource: 'purchased'
      }),
      Execution.countDocuments({
        user: user._id,
        creditSource: 'granted'
      })
    ]);

    // Handle subscription-based credits
    if (subscription && subscription.active) {
      if (subscription.plan === 'yearly') {
        // Unlimited credits for yearly plan
        req.creditSource = 'free';
        return next();
      }

      const todayExecutions = await Execution.countDocuments({
        user: user._id,
        createdAt: { $gte: today }
      });

      if (todayExecutions < subscription.creditsPerDay) {
        req.creditSource = 'free';
        return next();
      }
    }

    // If subscription credits are exhausted or no subscription, check other credit sources
    const freeCredits = user.credits?.free || 15;
    const purchasedCredits = user.credits?.purchased || 0;
    const grantedCredits = user.credits?.granted || 0;

    // Calculate remaining credits
    const freeRemaining = Math.max(0, freeCredits - todayFreeUsed);
    const purchasedRemaining = Math.max(0, purchasedCredits - purchasedUsed);
    const grantedRemaining = Math.max(0, grantedCredits - grantedUsed);

    // If no credits available at all
    if (freeRemaining === 0 && purchasedRemaining === 0 && grantedRemaining === 0) {
      return res.status(403).json({
        error: "No credits available. Please wait for daily reset, purchase more credits, or upgrade your plan to continue.",
        details: {
          subscription: subscription ? {
            plan: subscription.plan,
            creditsPerDay: subscription.creditsPerDay,
            remainingToday: Math.max(0, subscription.creditsPerDay - todayExecutions)
          } : null,
          credits: {
            free: { total: freeCredits, used: todayFreeUsed, remaining: freeRemaining },
            purchased: { total: purchasedCredits, used: purchasedUsed, remaining: purchasedRemaining },
            granted: { total: grantedCredits, used: grantedUsed, remaining: grantedRemaining }
          }
        }
      });
    }

    // Determine which type of credit to use (priority: subscription > free > granted > purchased)
    if (freeRemaining > 0) {
      req.creditSource = 'free';
    } else if (grantedRemaining > 0) {
      req.creditSource = 'granted';
    } else if (purchasedRemaining > 0) {
      req.creditSource = 'purchased';
    }

    next();
  } catch (error) {
    console.error('Credit check error:', error);
    return res.status(500).json({ error: 'Failed to check credits' });
  }
};

const deductCredit = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(403).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    // Ensure credits object exists
    if (!user.credits) {
      user.credits = { free: 15, purchased: 0, granted: 0 };
    }

    // If using purchased credits, deduct 0.50 rupees (50 paisa) from balance
    if (req.creditSource === 'purchased') {
      const deductionAmount = 50; // 50 paisa = ₹0.50
      if (user.balanceInPaisa < deductionAmount) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient balance for code execution',
          requiredAmount: '₹0.50',
          currentBalance: `₹${(user.balanceInPaisa/100).toFixed(2)}`
        });
      }
      user.balanceInPaisa -= deductionAmount;
      
      // Create transaction for the deduction
      await Transaction.create({
        user: user._id,
        type: 'code_execution',
        amountInPaisa: deductionAmount,
        credits: 1,
        description: 'Code execution using purchased credit (₹0.50)',
        status: 'completed'
      });
    }

    // Deduct from the appropriate credit source
    switch (req.creditSource) {
      case 'free':
        if (user.credits.free <= 0) {
          return res.status(403).json({ 
            success: false,
            error: 'No free credits available' 
          });
        }
        user.credits.free--;
        break;

      case 'purchased':
        if (user.credits.purchased <= 0) {
          return res.status(403).json({ 
            success: false,
            error: 'No purchased credits available' 
          });
        }
        user.credits.purchased--;
        break;

      case 'granted':
        if (user.credits.granted <= 0) {
          return res.status(403).json({ 
            success: false,
            error: 'No granted credits available' 
          });
        }
        user.credits.granted--;
        break;

      default:
        return res.status(403).json({ 
          success: false,
          error: 'Invalid credit source' 
        });
    }

    await user.save();
    
    req.creditDeduction = {
      source: req.creditSource,
      remaining: {
        free: user.credits.free,
        granted: user.credits.granted,
        purchased: user.credits.purchased
      },
      balanceDeducted: req.creditSource === 'purchased' ? 0.50 : 0,
      newBalance: user.balanceInPaisa / 100
    };

    next();
  } catch (error) {
    console.error('Credit deduction error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to deduct credit',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = { checkCredits, deductCredit };
