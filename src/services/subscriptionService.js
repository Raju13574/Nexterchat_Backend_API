const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Execution = require('../models/Execution');
const Transaction = require('../models/Transaction');
const plans = require('../config/plans');

// Price per credit in paisa
const CREDIT_PRICE_IN_PAISA = 50; // ₹0.5 = 50 paisa per credit

// Update per request price to INR
const PER_REQUEST_PRICE = 0.5; // ₹0.5 per request

function calculateUpgradeCost(currentPlan, newPlan, daysUsed) {
  const dailyRate = currentPlan.price / currentPlan.duration;
  const unusedDays = Math.max(0, currentPlan.duration - daysUsed);
  const credit = dailyRate * unusedDays;
  const upgradeCost = Math.max(0, newPlan.price - credit);
  return Number(upgradeCost.toFixed(2));
}

const createSubscription = async (userId, planId) => {
  const plan = plans.find(p => p.id === planId);
  if (!plan) {
    throw new Error('Invalid plan selected');
  }

  // Convert plan price to paisa for storage
  const priceInPaisa = plan.priceInPaisa;

  // Create transaction record
  await Transaction.create({
    user: userId,
    type: 'subscription_purchase',
    amount: priceInPaisa,
    description: `Purchased ${plan.name} subscription`,
    status: 'completed',
    currency: 'INR'
  });

  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Calculate plan duration based on plan type
  const startDate = new Date();
  let endDate = new Date();
  
  switch (planId) {
    case 'monthly':
      endDate.setDate(endDate.getDate() + 30); // 30 days
      break;
    case 'three_month':
      endDate.setDate(endDate.getDate() + 90); // 90 days
      break;
    case 'six_month':
      endDate.setDate(endDate.getDate() + 180); // 180 days
      break;
    case 'yearly':
      endDate.setDate(endDate.getDate() + 365); // 365 days
      break;
    default:
      throw new Error('Invalid plan duration');
  }

  // Create new subscription
  const subscription = new Subscription({
    user: userId,
    plan: planId,
    startDate: startDate,
    endDate: endDate,
    creditsPerDay: plan.creditsPerDay || (plan.creditsPerMonth ? Math.floor(plan.creditsPerMonth / 30) : 0),
    active: true,
    price: plan.price
  });

  await subscription.save();

  // Update user's subscription plan
  user.subscriptionPlan = planId;
  await user.save();

  return {
    success: true,
    message: `Successfully subscribed to ${plan.name}`,
    subscription: {
      plan: planId,
      startDate: startDate,
      endDate: endDate,
      creditsPerDay: subscription.creditsPerDay,
      price: plan.price,
      daysRemaining: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
    }
  };
};

// Add this function to update subscription status
const updateSubscriptionStatus = async (subscriptionId, status) => {
  await Subscription.findByIdAndUpdate(subscriptionId, { status });
};

const cancelSubscription = async (userId) => {
  const subscription = await Subscription.findOne({ 
    user: userId, 
    active: true 
  });

  if (!subscription) {
    throw new Error('No active subscription found');
  }

  if (subscription.plan === 'free') {
    throw new Error('Free plan cannot be cancelled');
  }

  // Check if 24 hours have passed since subscription start
  const hoursSinceSubscription = Math.abs(new Date() - subscription.startDate) / 36e5;
  if (hoursSinceSubscription < 24) {
    throw new Error(`Cannot cancel subscription within 24 hours of purchase. Please wait ${Math.ceil(24 - hoursSinceSubscription)} more hours.`);
  }

  const now = new Date();
  
  // Deactivate current subscription
  subscription.active = false;
  subscription.endDate = now;
  subscription.cancelledAt = now;
  await subscription.save();

  return subscription;
};

exports.getSubscriptionStatus = async (userId) => {
  try {
    const subscription = await Subscription.findOne({ 
      user: userId, 
      active: true 
    });

    if (!subscription) {
      return {
        success: true,
        plan: 'free',
        status: 'active',
        creditsPerDay: 15,
        message: 'You are on the free plan with 15 credits per day.'
      };
    }

    // Get today's usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const executionsToday = await Execution.countDocuments({
      user: userId,
      createdAt: { 
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    });

    const creditsPerDay = subscription.creditsPerDay;
    const remainingCredits = creditsPerDay - executionsToday;

    return {
      success: true,
      plan: subscription.plan,
      status: subscription.status,
      creditsPerDay: creditsPerDay,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      remainingCredits: remainingCredits,
      message: `Your ${subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)} Plan is currently active. You have ${remainingCredits} credits remaining for today. Your daily credit limit is ${creditsPerDay}.`
    };
  } catch (error) {
    console.error('Error getting subscription status:', error);
    throw error;
  }
};

exports.handleRequest = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const now = new Date();
    const subscription = await Subscription.findOne({ user: userId, active: true });

    if (subscription && now <= subscription.endDate) {
      if (subscription.plan === 'yearly') {
        return true; // Unlimited requests for yearly plan
      }
      
      // Check if daily limit is reached
      const today = new Date().setHours(0, 0, 0, 0);
      const requestsToday = await Execution.countDocuments({
        user: userId,
        createdAt: { $gte: today }
      });

      if (requestsToday < subscription.creditsPerDay) {
        return true;
      }
    }

    // If no active subscription or subscription expired, check for pay-per-request
    if (user.balance >= PER_REQUEST_PRICE) {
      user.balance -= PER_REQUEST_PRICE;
      await user.save();
      return true;
    }

    return false; // Not enough credits or balance
  } catch (error) {
    console.error('Error handling request:', error);
    return false;
  }
};

exports.upgradeSubscription = async (userId, newPlanId) => {
  try {
    const user = await User.findById(userId);
    const oldSubscription = await Subscription.findOne({ 
      user: userId, 
      active: true 
    });

    const newPlan = plans.find(p => p.id === newPlanId);
    if (!newPlan) throw new Error('Invalid plan selected');

    // Deduct balance from wallet
    user.balanceInPaisa -= newPlan.priceInPaisa;
    await user.save();

    // Create transaction record for the upgrade payment
    await Transaction.create({
      user: userId,
      type: 'subscription_upgrade',
      amountInPaisa: -newPlan.priceInPaisa, // Negative amount for deduction
      description: `Upgraded from ${oldSubscription?.plan || 'free'} to ${newPlanId} plan`,
      status: 'completed'
    });

    // Deactivate old subscription
    if (oldSubscription) {
      oldSubscription.active = false;
      oldSubscription.status = 'upgraded';
      await oldSubscription.save();
    }

    // Create new subscription
    const now = new Date();
    const newSubscription = await Subscription.create({
      user: userId,
      plan: newPlanId,
      priceInPaisa: newPlan.priceInPaisa,
      creditsPerDay: newPlan.creditsPerDay,
      startDate: now,
      endDate: new Date(now.getTime() + (newPlan.duration * 24 * 60 * 60 * 1000)),
      active: true
    });

    // Update user's subscription
    user.activeSubscription = newSubscription._id;
    await user.save();

    // Mark previous executions
    await Execution.updateMany(
      {
        user: userId,
        createdAt: { 
          $gte: new Date(now.setHours(0, 0, 0, 0)),
          $lt: now
        }
      },
      {
        $set: { 
          previousPlan: oldSubscription?.plan || 'free',
          creditSource: 'previous_plan'
        }
      }
    );

    return {
      success: true,
      newSubscription,
      walletBalance: user.balanceInPaisa / 100 // Return updated wallet balance
    };
  } catch (error) {
    throw error;
  }
};

exports.useCredit = async (userId) => {
  const subscription = await Subscription.findOne({ user: userId, active: true });
  if (!subscription) {
    throw new Error('No active subscription found');
  }

  if (subscription.remainingCredits > 0) {
    subscription.remainingCredits -= 1;
    await subscription.save();
    return true;
  }
  return false;
};

exports.checkAndUpdateCredits = async (userId) => {
  const user = await User.findById(userId).populate('activeSubscription');
  if (!user) throw new Error('User not found');

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Check subscription status
  const subscription = await Subscription.findOne({ 
    user: userId, 
    active: true,
    endDate: { $gt: now }
  });

  // If user has yearly plan, don't count executions or deduct credits
  if (subscription && subscription.plan === 'yearly') {
    return { 
      canExecute: true, 
      creditsRemaining: 'Unlimited',
      creditSource: 'subscription' // Force using subscription credits for yearly plan
    };
  }

  // For other plans, continue with normal credit checking...
  const executionsToday = await Execution.countDocuments({
    user: userId,
    createdAt: { $gte: today }
  });

  // Rest of the logic for non-yearly plans...
};

exports.deductCredit = async (userId) => {
  const user = await User.findById(userId).populate('activeSubscription');
  if (!user) throw new CustomError('User not found', 404);

  // If yearly plan, don't deduct any credits
  if (user.activeSubscription && user.activeSubscription.plan === 'yearly') {
    return; // No credit deduction needed for yearly plan
  }

  // Otherwise continue with normal credit deduction logic...
  if (user.activeSubscription && user.activeSubscription.plan !== 'free') {
    user.activeSubscription.remainingCredits = Math.max(0, user.activeSubscription.remainingCredits - 1);
    await user.activeSubscription.save();
  } else {
    user.freeCredits = Math.max(0, user.freeCredits - 1);
    await user.save();
  }
};

exports.downgradeSubscription = async (userId, newPlanId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const currentSubscription = await Subscription.findOne({ user: userId, active: true });
  if (currentSubscription) {
    currentSubscription.active = false;
    currentSubscription.endDate = new Date();
    currentSubscription.status = 'downgraded';
    await currentSubscription.save();
  }

  const newPlan = plans.find(p => p.id === newPlanId);
  if (!newPlan) throw new Error('Invalid plan');

  const newSubscription = new Subscription({
    user: userId,
    plan: newPlanId,
    creditsPerDay: newPlan.creditsPerDay,
    startDate: new Date(),
    endDate: newPlan.duration === Infinity ? null : new Date(Date.now() + newPlan.duration * 24 * 60 * 60 * 1000),
    active: true,
    status: 'active'
  });

  await newSubscription.save();
  user.activeSubscription = newSubscription._id;
  await user.save();

  return newSubscription;
};

exports.checkAndFixUserSubscription = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new CustomError('User not found', 404);

  const activeSubscription = await Subscription.findOne({ user: userId, active: true });

  if (user.subscriptionPlan !== 'free' && !activeSubscription) {
    console.log('Fixing user subscription: User has paid plan but no active subscription');
    user.subscriptionPlan = 'free';
    user.activeSubscription = null;
    await user.save();
  } else if (user.subscriptionPlan === 'free' && activeSubscription) {
    console.log('Fixing user subscription: User has free plan but an active subscription exists');
    user.subscriptionPlan = activeSubscription.plan;
    user.activeSubscription = activeSubscription._id;
    await user.save();
  }

  return user;
};

exports.handleAutoRenewal = async (userId) => {
  const user = await User.findById(userId);
  const subscription = await Subscription.findOne({ user: userId, active: true });
  const plan = plans.find(p => p.id === subscription.plan);

  if (user.autoRenew && user.walletBalance >= plan.price) {
    user.walletBalance -= plan.price;
    subscription.startDate = new Date();
    subscription.endDate = new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000);
    subscription.status = 'renewed';
    await user.save();
    await subscription.save();
    return true;
  } else {
    subscription.active = false;
    subscription.status = 'expired';
    await subscription.save();
    return false;
  }
};

const cancelAndCreateFreePlan = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const subscription = await Subscription.findOne({ 
    user: userId, 
    active: true 
  });

  if (!subscription) {
    throw new Error('No active subscription found');
  }

  // Check if 24 hours have passed since subscription start
  const hoursSinceSubscription = Math.abs(new Date() - subscription.startDate) / 36e5;
  if (hoursSinceSubscription < 24) {
    throw new Error(`Cannot cancel subscription within 24 hours of purchase. Please wait ${Math.ceil(24 - hoursSinceSubscription)} more hours.`);
  }

  // Deactivate current subscription
  subscription.active = false;
  subscription.endDate = new Date();
  await subscription.save();

  // Calculate free plan end date based on registration date
  const registrationDate = user.registrationDate || user.createdAt;
  const oneYearFromRegistration = new Date(registrationDate);
  oneYearFromRegistration.setFullYear(oneYearFromRegistration.getFullYear() + 1);

  // Create new free plan subscription
  const freePlan = new Subscription({
    user: userId,
    plan: 'free',
    startDate: new Date(),
    endDate: oneYearFromRegistration,
    creditsPerDay: 15,
    active: true
  });

  await freePlan.save();

  // Update user's subscription plan
  user.subscriptionPlan = 'free';
  user.freePlanEndDate = oneYearFromRegistration;
  await user.save();

  // Create a transaction record for the cancellation
  await Transaction.create({
    user: userId,
    type: 'subscription_cancellation',
    amount: 0,
    description: `Cancelled ${subscription.plan} plan subscription and reverted to free plan`,
    status: 'completed'
  });

  return {
    success: true,
    message: 'Subscription cancelled successfully. Reverted to free plan.',
    newPlan: {
      type: 'free',
      creditsPerDay: 15,
      startDate: freePlan.startDate,
      endDate: oneYearFromRegistration,
      daysRemaining: Math.ceil((oneYearFromRegistration - new Date()) / (1000 * 60 * 60 * 24))
    }
  };
};

