const cron = require('node-cron');
const Promotion = require('../models/Promotion');
const User = require('../models/User');

cron.schedule('0 0 * * *', async () => {
  try {
    const now = new Date();
    const activePromotions = await Promotion.find({
      startDate: { $lte: now },
      endDate: { $gte: now }
    });

    const users = await User.find();

    for (const user of users) {
      for (const promotion of activePromotions) {
        if (!user.credits.promotional.some(promo => promo.offerName === promotion.offerName)) {
          user.credits.promotional.push({
            amount: promotion.credits,
            offerName: promotion.offerName,
            startDate: promotion.startDate,
            endDate: promotion.endDate
          });
        }
      }
      await user.save();
    }
    console.log('Promotions applied successfully');
  } catch (error) {
    console.error('Error applying promotions:', error);
  }
});
