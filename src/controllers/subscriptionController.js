const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Execution = require('../models/Execution'); // Add this line
const Razorpay = require('razorpay');
const crypto = require('crypto');
const subscriptionService = require('../services/subscriptionService');

const plans = [
  { 
    id: 'free', 
    name: 'Free Plan', 
    creditsPerDay: 15, 
    priceInPaisa: 0,
    duration: 365 
  },
  { 
    id: 'monthly', 
    name: 'Monthly Plan', 
    creditsPerDay: 1500, 
    priceInPaisa: 49900, // ₹499 = 49,900 paisa
    duration: 30 
  },
  { 
    id: 'three_month', 
    name: 'Three Months Plan', 
    creditsPerDay: 2000, 
    priceInPaisa: 129900, // ₹1,299 = 1,29,900 paisa
    duration: 90 
  },
  { 
    id: 'six_month', 
    name: 'Six Months Plan', 
    creditsPerDay: 3000, 
    priceInPaisa: 199900, // ₹1,999 = 1,99,900 paisa
    duration: 180 
  },
  { 
    id: 'yearly', 
    name: 'Yearly Plan', 
    creditsPerDay: Infinity, 
    priceInPaisa: 359900, // ₹3,599 = 3,59,900 paisa
    duration: 365 
  }
];

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

exports.getPlans = (req, res) => {
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

exports.subscribe = async (req, res) => {
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

exports.upgrade = async (req, res) => {
  try {
    const { plan_id } = req.params;
    const userId = req.user._id;

    const newPlan = plans.find(p => p.id === plan_id);
    if (!newPlan) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const user = await User.findById(userId);
    const currentSubscription = await Subscription.findOne({ user: userId, active: true });

    if (!currentSubscription) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    const currentPlan = plans.find(p => p.id === currentSubscription.plan);
    
    if (newPlan.price <= currentPlan.price) {
      return res.status(400).json({ error: 'New plan must be more expensive to upgrade' });
    }

    const now = new Date();
    const unusedDays = Math.max(0, Math.ceil((currentSubscription.endDate - now) / (1000 * 60 * 60 * 24)));
    const unusedValue = parseFloat(((unusedDays / currentPlan.duration) * currentPlan.price).toFixed(2));
    const newPlanFullPrice = newPlan.price;
    const proratedPrice = parseFloat(Math.max(0, newPlanFullPrice - unusedValue).toFixed(2));

    if (user.balance < proratedPrice) {
      return res.status(400).json({ error: 'Insufficient balance for upgrade' });
    }

    user.balance -= proratedPrice;

    // Deactivate the current subscription
    currentSubscription.active = false;
    currentSubscription.endDate = now;
    await currentSubscription.save();

    // Create a new subscription for the upgraded plan
    const newSubscription = new Subscription({
      user: userId,
      plan: newPlan.id,
      creditsPerDay: newPlan.creditsPerDay || (newPlan.creditsPerMonth / 30),
      startDate: now,
      endDate: new Date(now.getTime() + newPlan.duration * 24 * 60 * 60 * 1000),
      active: true
    });

    await newSubscription.save();
    user.activeSubscription = newSubscription._id;
    await user.save();

    // Create transaction record
    await Transaction.create({
      user: userId,
      type: 'upgrade',
      amount: proratedPrice,
      description: `Upgraded to ${newPlan.name} (prorated)`,
      credits: newPlan.id === 'yearly' ? 'Unlimited' : (newSubscription.creditsPerDay * newPlan.duration)
    });

    res.json({ 
      message: 'Subscription upgraded successfully', 
      subscription: newSubscription,
      billingDetails: {
        newPlanFullPrice: newPlanFullPrice,
        unusedValueFromPreviousPlan: unusedValue,
        proratedPrice: proratedPrice,
        totalPayableAmount: proratedPrice,
        savings: unusedValue
      }
    });
  } catch (error) {
    console.error('Upgrade error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    const currentSubscription = await Subscription.findOne({ user: userId, active: true });

    if (!currentSubscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    if (currentSubscription.plan === 'free') {
      return res.status(400).json({ error: 'Free plan cannot be cancelled' });
    }

    const now = new Date();

    // Deactivate the current paid subscription
    currentSubscription.active = false;
    currentSubscription.cancelledAt = now;
    currentSubscription.endDate = now;
    await currentSubscription.save();

    // Find the user's original free plan subscription
    const freePlanSubscription = await Subscription.findOne({ 
      user: userId, 
      plan: 'free',
      active: false
    }).sort({ startDate: -1 });

    if (freePlanSubscription) {
      // Calculate remaining credits from the free plan
      const freePlanDuration = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      const timeUsedInFreePlan = currentSubscription.startDate - freePlanSubscription.startDate;
      const fractionOfDayUsed = timeUsedInFreePlan / freePlanDuration;
      const remainingCredits = Math.max(0, Math.floor(15 * (1 - fractionOfDayUsed)));

      // Reactivate the free plan subscription
      freePlanSubscription.active = true;
      freePlanSubscription.startDate = now;
      freePlanSubscription.endDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year from now
      freePlanSubscription.remainingCredits = remainingCredits;
      await freePlanSubscription.save();

      // Update user's active subscription
      const user = await User.findById(userId);
      user.activeSubscription = freePlanSubscription._id;
      await user.save();

      res.json({ 
        message: 'Your paid subscription has been cancelled successfully. You have been reverted to the free plan.',
        status: {
          plan: 'free',
          cancellationDate: currentSubscription.cancelledAt,
          newPlanStartDate: freePlanSubscription.startDate,
          newPlanEndDate: freePlanSubscription.endDate,
          creditsPerDay: 15,
          remainingCredits: remainingCredits,
          message: `Your paid subscription has been cancelled. You are now back on the free plan with ${remainingCredits} credits remaining for today.`
        }
      });
    } else {
      // In the unlikely event that no free plan is found, create a new one
      const newFreeSubscription = new Subscription({
        user: userId,
        plan: 'free',
        startDate: now,
        endDate: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
        creditsPerDay: 15,
        remainingCredits: 15,
        active: true
      });

      await newFreeSubscription.save();

      // Update user's subscription
      const user = await User.findById(userId);
      user.activeSubscription = newFreeSubscription._id;
      await user.save();

      res.json({ 
        message: 'Your paid subscription has been cancelled successfully. A new free plan has been created for you.',
        status: {
          plan: 'free',
          cancellationDate: currentSubscription.cancelledAt,
          newPlanStartDate: newFreeSubscription.startDate,
          newPlanEndDate: newFreeSubscription.endDate,
          creditsPerDay: 15,
          remainingCredits: 15,
          message: 'Your paid subscription has been cancelled. You are now on a new free plan with 15 credits for today.'
        }
      });
    }
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const subscription = await Subscription.findOne({ user: user._id, active: true }).sort({ endDate: -1 });
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let status = {
      plan: subscription ? subscription.plan : 'free',
      status: subscription && subscription.active ? 'Active' : 'Inactive',
      creditsPerDay: subscription ? subscription.creditsPerDay : 15, // Default for free plan
      startDate: subscription ? subscription.startDate : new Date(),
      endDate: subscription ? subscription.endDate : new Date(now.setFullYear(now.getFullYear() + 1)),
    };

    // Calculate remaining credits
    const executionsToday = await Execution.countDocuments({
      user: user._id,
      createdAt: { $gte: Math.max(today, subscription ? subscription.startDate : today) }
    });

    if (subscription && subscription.plan === 'yearly') {
      status.remainingCredits = 'Unlimited';
    } else {
      status.remainingCredits = Math.max(0, status.creditsPerDay - executionsToday);
    }

    if (!subscription || !subscription.active) {
      status.message = 'You currently have no active subscription. You can still use the compiler with pay-per-request pricing.';
    } else if (now > subscription.endDate) {
      status.status = 'Expired';
      status.message = 'Your subscription has expired. You can still use the compiler with pay-per-request pricing or renew your plan.';
    } else {
      status.message = `Your ${status.plan} plan is currently active. You can use the compiler according to your plan limits.`;
    }

    res.json(status);
  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({ error: 'An error occurred while fetching subscription status' });
  }
};

exports.createRazorpayOrder = async (req, res) => {
  try {
    const { plan_id } = req.params;
    const plan = plans.find(p => p.id === plan_id);
    
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const options = {
      amount: plan.price * 100, // Razorpay expects amount in paise
      currency: "INR",
      receipt: "order_rcptid_" + Math.random().toString(36).substring(7),
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    res.status(500).json({ error: 'Failed to create Razorpay order' });
  }
};

exports.verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature === expectedSign) {
      // Payment is successful, update user's subscription
      await exports.subscribe(req, res);
    } else {
      res.status(400).json({ error: "Invalid signature sent!" });
    }
  } catch (error) {
    console.error('Razorpay payment verification error:', error);
    res.status(500).json({ error: 'Failed to verify Razorpay payment' });
  }
};

exports.getSubscriptionHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const subscriptions = await Subscription.find({ user: userId, plan: { $ne: 'free' } }).sort({ startDate: -1 });

    const now = new Date();
    const history = subscriptions.map((sub, index) => {
      let status;
      if (sub.active && now <= sub.endDate) {
        status = 'Active';
      } else if (sub.status === 'cancelled') {
        status = 'Cancelled';
      } else {
        status = 'Expired';
      }

      let subscriptionDetails = {
        plan: sub.plan,
        status: status,
        creditsPerDay: sub.creditsPerDay,
        startDate: sub.startDate.toISOString(),
        endDate: sub.endDate.toISOString(),
        price: plans.find(p => p.id === sub.plan).price,
        dateTime: sub.startDate.toISOString() // Add dateTime field
      };

      if (status === 'Active') {
        subscriptionDetails.message = `Your ${sub.plan} plan is currently active until ${sub.endDate.toDateString()}.`;
      } else if (status === 'Cancelled') {
        subscriptionDetails.message = `This ${sub.plan} subscription was cancelled on ${sub.endDate.toDateString()}.`;
      } else {
        subscriptionDetails.message = `This ${sub.plan} subscription expired on ${sub.endDate.toDateString()}.`;
      }

      // Add transition information
      if (index === subscriptions.length - 1) {
        subscriptionDetails.transition = `Upgraded from free to ${sub.plan}`;
      } else {
        const previousSub = subscriptions[index + 1];
        const currentPlanPrice = plans.find(p => p.id === sub.plan).price;
        const previousPlanPrice = plans.find(p => p.id === previousSub.plan).price;

        if (currentPlanPrice > previousPlanPrice) {
          subscriptionDetails.transition = `Upgraded from ${previousSub.plan} to ${sub.plan}`;
        } else if (currentPlanPrice < previousPlanPrice) {
          subscriptionDetails.transition = `Downgraded from ${previousSub.plan} to ${sub.plan}`;
        } else if (sub.plan !== previousSub.plan) {
          subscriptionDetails.transition = `Changed from ${previousSub.plan} to ${sub.plan}`;
        } else {
          subscriptionDetails.transition = `Renewed ${sub.plan} subscription`;
        }
      }

      return subscriptionDetails;
    });

    // Add current free plan if not on a paid plan
    const currentSubscription = await Subscription.findOne({ user: userId, active: true });
    if (!currentSubscription || currentSubscription.plan === 'free') {
      const freePlanStartDate = currentSubscription ? currentSubscription.startDate : new Date();
      const freePlan = {
        plan: 'free',
        status: 'Active',
        creditsPerDay: 15,
        startDate: freePlanStartDate.toISOString(),
        endDate: new Date(freePlanStartDate.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        price: 0,
        message: 'Your free plan is currently active.',
        transition: history.length > 0 ? 'Downgraded from paid plan to free' : 'Initial free plan',
        dateTime: freePlanStartDate.toISOString() // Add dateTime field for free plan
      };
      history.unshift(freePlan);
    }

    res.json({
      message: 'Subscription history retrieved successfully',
      history: history
    });
  } catch (error) {
    console.error('Error fetching subscription history:', error);
    res.status(500).json({ error: 'An error occurred while fetching subscription history' });
  }
};

exports.downgrade = async (req, res) => {
  try {
    const { plan_id } = req.params;
    const userId = req.user._id;

    const newPlan = plans.find(p => p.id === plan_id);
    if (!newPlan) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const newSubscription = await subscriptionService.downgradeSubscription(userId, plan_id);

    // Create transaction record
    await Transaction.create({
      user: userId,
      type: 'downgrade',
      amount: 0, // No charge for downgrade
      description: `Downgraded to ${newPlan.name}`,
      credits: newPlan.id === 'yearly' ? 'Unlimited' : (newSubscription.creditsPerDay * newPlan.duration)
    });

    res.json({ 
      message: 'Subscription downgraded successfully', 
      subscription: newSubscription
    });
  } catch (error) {
    console.error('Downgrade error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getSubscriptionStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('activeSubscription');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let status = {
      plan: user.subscriptionPlan,
      status: 'Active',
      creditsPerDay: 15, // Default for free plan
      startDate: user.registrationDate,
      endDate: user.freePlanEndDate,
      remainingCredits: 0
    };

    if (user.activeSubscription) {
      status.plan = user.activeSubscription.plan;
      status.creditsPerDay = user.activeSubscription.creditsPerDay;
      status.startDate = user.activeSubscription.startDate;
      status.endDate = user.activeSubscription.endDate;
    }

    // Calculate remaining credits
    const todayExecutions = await Execution.countDocuments({
      user: user._id,
      createdAt: { $gte: today }
    });

    if (status.plan === 'free') {
      status.remainingCredits = Math.max(0, status.creditsPerDay - todayExecutions);
    } else {
      status.remainingCredits = Math.max(0, status.creditsPerDay - todayExecutions);
    }

    // Get total API usage (executions) since account creation
    const totalApiUsage = await Execution.countDocuments({ user: user._id });
    status.totalApiUsage = totalApiUsage;

    status.message = `Your ${status.plan} plan is currently active. You have ${status.remainingCredits} credits remaining for today. Your daily credit limit is ${status.creditsPerDay}.`;

    res.json(status);
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ error: 'An error occurred while fetching subscription status' });
  }
};

// Helper function to get today's executions
async function getTodayExecutions(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return await Execution.countDocuments({
    user: userId,
    createdAt: { $gte: today }
  });
}

exports.cancel = async (req, res) => {
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

    // Cancel current subscription and create free plan
    const result = await subscriptionService.cancelAndCreateFreePlan(userId);
    res.json(result);

  } catch (error) {
    console.error('Cancellation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to cancel subscription',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const { planId } = req.body;
    const plan = plans.find(p => p.id === planId);
    
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    const order = await razorpay.orders.create({
      amount: plan.priceInPaisa,
      currency: 'INR',
      receipt: `order_${Date.now()}`
    });

    res.json({
      orderId: order.id,
      amountInPaisa: plan.priceInPaisa,
      amountInRupees: plan.priceInPaisa / 100,
      formattedAmount: `₹${(plan.priceInPaisa/100).toFixed(2)}`,
      currency: 'INR',
      plan: {
        ...plan,
        formattedPrice: `₹${(plan.priceInPaisa/100).toFixed(2)}`
      }
    });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
};
