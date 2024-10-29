const cron = require('node-cron');
const subscriptionService = require('../services/subscriptionService');
const Subscription = require('../models/Subscription');

cron.schedule('0 0 * * *', async () => {
  const expiredSubscriptions = await Subscription.find({
    endDate: { $lte: new Date() },
    active: true
  });

  for (let subscription of expiredSubscriptions) {
    const renewed = await subscriptionService.handleAutoRenewal(subscription.user);
    if (!renewed) {
      console.log(`Subscription ${subscription._id} expired for user ${subscription.user}`);
    }
  }
});