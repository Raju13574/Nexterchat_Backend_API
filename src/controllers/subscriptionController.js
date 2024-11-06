const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Execution = require('../models/Execution');
const subscriptionService = require('../services/subscriptionService');
const plans = require('../config/plans');
const mongoose = require('mongoose');

// Add plan tier levels for proper upgrade validation
const planTiers = {
  'free': 0,
  'monthly': 1,
  'three_month': 2,
  'six_month': 3,
  'yearly': 4
};

function validatePlanUpgrade(currentPlan, newPlan) {
  return {
    isValid: currentPlan !== newPlan,
    isSamePlan: currentPlan === newPlan,
    currentPlanDetails: plans.find(p => p.id === currentPlan),
    newPlanDetails: plans.find(p => p.id === newPlan)
  };
}

const getPlans = (req, res) => {
  const formattedPlans = plans.map(plan => ({
    ...plan,
    creditsPerDay: plan.creditsPerDay === Infinity ? 'Unlimited' : plan.creditsPerDay,
    priceInRupees: plan.priceInPaisa / 100,
    formattedPrice: plan.priceInPaisa === 0 ? 'Free' : `₹${(plan.priceInPaisa/100).toFixed(2)}`,
    pricePerDay: plan.priceInPaisa === 0 ? 'Free' : `₹${((plan.priceInPaisa/100) / plan.duration).toFixed(2)}`,
    duration: plan.duration,
    totalCredits: plan.id === 'yearly' ? 'Unlimited' : (plan.creditsPerDay * plan.duration),
    paymentMethods: plan.id === 'free' ? [] : ['Credit Card', 'PayPal'],
    termsAndConditions: 'Terms and conditions apply. See our website for details.'
  }));
  res.json(formattedPlans);
};

const subscribe = async (req, res) => {
  try {
    const { plan_id } = req.params;
    const userId = req.user._id;

    const plan = plans.find(p => p.id === plan_id);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has enough balance
    if (user.balance < plan.price) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Check if user already has an active subscription
    const existingSubscription = await Subscription.findOne({ user: userId, active: true });
    
    // If user has a free plan and is upgrading to a paid plan, allow it
    if (existingSubscription && existingSubscription.plan === 'free' && plan.price > 0) {
      existingSubscription.active = false;
      existingSubscription.endDate = new Date();
      await existingSubscription.save();
    } else if (existingSubscription && existingSubscription.plan !== 'free') {
      return res.status(400).json({ 
        error: 'Active paid subscription exists. Please manage your plan in account settings.' 
      });
    }

    // Deduct balance and create subscription
    user.balance -= plan.price;
    let creditsPerDay = plan.creditsPerDay || (plan.creditsPerMonth ? Math.floor(plan.creditsPerMonth / 30) : 0);

    // Remove the free plan subscription if it exists
    await Subscription.findOneAndDelete({ user: userId, plan: 'free' });

    // Create new subscription
    const subscription = new Subscription({
      user: userId,
      plan: plan_id,
      startDate: new Date(),
      endDate: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000),
      creditsPerDay: plan.creditsPerDay || (plan.creditsPerMonth / 30),
      active: true
    });

    await subscription.save();

    // Update user's activeSubscription
    user.activeSubscription = subscription._id;
    await user.save();

    // Create transaction record
    await Transaction.create({
      user: userId,
      type: 'subscription',
      amount: plan.price,
      description: `Subscribed to ${plan.name}`,
      credits: creditsPerDay * plan.duration
    });

    if (plan.price > 0) {
      user.hadPaidSubscription = true;
      await user.save();
    }

    res.json({ message: 'Subscription successful', subscription });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ error: 'An error occurred while processing the subscription' });
  }
};

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

    // Get today's executions for all credit sources
    const executionsToday = await Execution.countDocuments({
      user: user._id,
      createdAt: { 
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    });

    // Get active subscription
    const subscription = await Subscription.findOne({ 
      user: user._id, 
      active: true,
      endDate: { $gt: new Date() }
    }).sort({ startDate: -1 });

    // Free plan user
    if (!subscription || subscription.plan === 'free') {
      const freeExecutionsToday = await Execution.countDocuments({
        user: user._id,
        createdAt: { 
          $gte: today,
          $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        },
        creditSource: 'free'
      });

      const remainingFreeCredits = 15 - freeExecutionsToday;
      
      if (remainingFreeCredits > 0) {
        req.creditSource = 'free';
        req.remainingCredits = remainingFreeCredits;
        return next();
      }

      // If free credits exhausted, check other sources
      if (user.credits.purchased > 0) {
        req.creditSource = 'purchased';
        return next();
      }
      // ... rest of the credit checks ...
    }

    // ... rest of the function for paid plans ...

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

    // Create execution record
    await Execution.create({
      user: user._id,
      creditSource: req.creditSource,
      promoId: req.promoId || null
    });

    // Only deduct for credits that need manual tracking
    switch (req.creditSource) {
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

const cancelSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get the active subscription
    const subscription = await Subscription.findOne({ 
      user: userId, 
      active: true 
    });

    if (!subscription) {
      return res.status(404).json({ 
        success: false,
        error: 'No active subscription found' 
      });
    }

    if (subscription.plan === 'free') {
      return res.status(400).json({ 
        success: false,
        error: 'Free plan cannot be cancelled' 
      });
    }

    // Calculate time difference in hours
    const hoursSinceSubscription = Math.abs(new Date() - subscription.startDate) / 36e5;

    // Check if less than 24 hours have passed
    if (hoursSinceSubscription < 24) {
      return res.status(403).json({
        success: false,
        error: 'Subscription cannot be cancelled within 24 hours of purchase',
        remainingHours: Math.ceil(24 - hoursSinceSubscription)
      });
    }

    const now = new Date();

    // Deactivate the current paid subscription
    subscription.active = false;
    subscription.status = 'cancelled';
    subscription.cancelledAt = now;
    subscription.endDate = now;
    await subscription.save();

    // Find and reactivate the original free plan
    const user = await User.findById(userId);
    const registrationDate = user.registrationDate || user.createdAt;
    const oneYearFromRegistration = new Date(registrationDate);
    oneYearFromRegistration.setFullYear(oneYearFromRegistration.getFullYear() + 1);

    // Find the original free plan
    let freePlan = await Subscription.findOne({
      user: userId,
      plan: 'free'
    }).sort({ createdAt: 1 }); // Get the earliest free plan

    if (freePlan) {
      // Update the existing free plan
      freePlan.set({
        active: true,
        status: 'active',
        endDate: oneYearFromRegistration,
        priceInPaisa: 0,
        creditsPerDay: 15,
        remainingCredits: 15
      });
    } else {
      // If no free plan exists, create one with all required fields
      freePlan = new Subscription({
        user: userId,
        plan: 'free',
        startDate: registrationDate,
        endDate: oneYearFromRegistration,
        creditsPerDay: 15,
        priceInPaisa: 0,
        active: true,
        status: 'active',
        remainingCredits: 15
      });
    }

    await freePlan.save();

    // Update user's subscription
    user.subscriptionPlan = 'free';
    user.activeSubscription = freePlan._id;
    await user.save();

    // Create transaction record with all required fields
    await Transaction.create({
      user: userId,
      type: 'subscription_cancellation',
      amountInPaisa: 0,
      credits: 15,
      description: `Cancelled ${subscription.plan} plan subscription and reverted to free plan`,
      status: 'completed',
      balanceAfter: user.balanceInPaisa
    });

    res.json({
      success: true,
      message: 'Subscription cancelled successfully. Reverted to free plan.',
      subscription: {
        plan: 'free',
        creditsPerDay: 15,
        startDate: freePlan.startDate,
        endDate: freePlan.endDate,
        daysRemaining: Math.ceil((oneYearFromRegistration - now) / (1000 * 60 * 60 * 24))
      }
    });

  } catch (error) {
    console.error('Cancellation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to cancel subscription',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const subscription = await Subscription.findOne({ 
      user: userId, 
      active: true 
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get today's executions for subscription/free credits
    const todayUsed = await Execution.countDocuments({
      user: userId,
      createdAt: { 
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      },
      creditSource: subscription?.plan === 'free' ? 'free' : 'subscription'
    });

    // Calculate remaining credits
    const totalDailyCredits = subscription ? subscription.creditsPerDay : 15;
    const remainingCredits = Math.max(0, totalDailyCredits - todayUsed);

    const response = {
      success: true,
      data: {
        plan: subscription?.plan === 'free' ? 'Free Plan' : `${subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)} Plan`,
        creditsPerDay: totalDailyCredits,
        creditsRemaining: remainingCredits,
        status: subscription ? subscription.status : 'active',
        validUntil: subscription ? subscription.endDate : null
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription status'
    });
  }
};

const downgrade = async (req, res) => {
  try {
    const { plan_id } = req.params;
    const userId = req.user._id;

    // Get current subscription
    const currentSubscription = await Subscription.findOne({ 
      user: userId, 
      active: true 
    });

    if (!currentSubscription) {
      return res.status(400).json({
        success: false,
        error: 'No active subscription found'
      });
    }

    // Check if current plan is still active
    const now = new Date();
    if (now < currentSubscription.endDate) {
      return res.status(400).json({
        success: false,
        error: 'Cannot downgrade while current plan is active. Please wait until your current plan expires.',
        currentPlanEndsAt: currentSubscription.endDate
      });
    }

    // Get plan details
    const newPlan = plans.find(p => p.id === plan_id);
    if (!newPlan) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid plan',
        availablePlans: plans.map(p => p.id)
      });
    }

    // Validate downgrade path
    const currentTier = planTiers[currentSubscription.plan];
    const newTier = planTiers[plan_id];

    if (newTier >= currentTier) {
      return res.status(400).json({
        success: false,
        error: `Cannot downgrade from ${currentSubscription.plan} to ${plan_id}. Please select a lower tier plan.`,
        currentPlan: currentSubscription.plan,
        requestedPlan: plan_id,
        availableDowngrades: Object.keys(planTiers).filter(plan => planTiers[plan] < currentTier)
      });
    }

    // Perform the downgrade
    const newSubscription = await subscriptionService.downgradeSubscription(userId, plan_id);

    // Create transaction record
    await Transaction.create({
      user: userId,
      type: 'subscription_downgrade',
      amountInPaisa: 0,
      description: `Downgraded from ${currentSubscription.plan} to ${plan_id}`,
      status: 'completed'
    });

    return res.json({
      success: true,
      message: 'Subscription downgraded successfully',
      previousPlan: currentSubscription.plan,
      newSubscription: {
        plan: newSubscription.plan,
        startDate: newSubscription.startDate,
        endDate: newSubscription.endDate,
        creditsPerDay: newSubscription.creditsPerDay,
        status: newSubscription.status
      }
    });

  } catch (error) {
    console.error('Downgrade error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to downgrade subscription'
    });
  }
};

const getSubscriptionTransactions = async (req, res) => {
  try {
    const transactions = await subscriptionService.getTransactionHistory(req.user._id);
    res.json(transactions);
  } catch (error) {
    console.error('Error getting transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transaction history'
    });
  }
};

// Helper function to format date in IST
const formatDateIST = (date) => {
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    timeZone: 'Asia/Kolkata'
  }) + ' IST';
};

const upgrade = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const result = await subscriptionService.upgradeSubscription(req.user._id, req.params.plan_id);
    
    if (result.success) {
      // Create transaction record with balanceAfter field
      await subscriptionService.createTransactionRecord(req.user._id, {
        type: 'subscription_payment',
        amountInPaisa: result.subscription?.priceInPaisa || 0,
        description: `Upgraded to ${req.params.plan_id} plan`,
        status: 'completed',
        balanceAfter: user.balanceInPaisa
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Upgrade error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  getPlans,
  subscribe,
  upgrade,
  cancelSubscription,
  getStatus,
  getSubscriptionTransactions,
  checkCredits,
  deductCredit,
  downgrade
};

