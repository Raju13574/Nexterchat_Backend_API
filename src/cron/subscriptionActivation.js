const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const activateScheduledSubscriptions = async () => {
  try {
    const now = new Date();
    
    // Find all scheduled subscriptions that should start now
    const scheduledSubscriptions = await Subscription.find({
      status: 'scheduled',
      startDate: { $lte: now },
      active: false
    });

    for (const subscription of scheduledSubscriptions) {
      // Deactivate any current active subscription
      await Subscription.updateMany(
        { user: subscription.user, active: true },
        { active: false, status: 'expired' }
      );

      // Activate the scheduled subscription
      subscription.active = true;
      subscription.status = 'active';
      await subscription.save();

      // Update user's active subscription
      await User.findByIdAndUpdate(subscription.user, {
        activeSubscription: subscription._id
      });

      // Create activation notification/transaction
      await Transaction.create({
        user: subscription.user,
        type: 'subscription_activation',
        amountInPaisa: 0,
        description: `Activated scheduled ${subscription.plan} plan`,
        status: 'completed'
      });
    }
  } catch (error) {
    console.error('Error in subscription activation cron:', error);
  }
};

module.exports = activateScheduledSubscriptions; 