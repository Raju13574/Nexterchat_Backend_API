const User = require('../models/User');

exports.deductCredits = async (userId, creditsToDeduct) => {
  const user = await User.findById(userId).populate('activeSubscription');
  let remainingToDeduct = creditsToDeduct;

  // Deduct from plan credits first
  if (user.activeSubscription && user.activeSubscription.plan !== 'yearly') {
    const planCreditsUsed = Math.min(user.activeSubscription.creditsPerDay, remainingToDeduct);
    user.activeSubscription.creditsPerDay -= planCreditsUsed;
    remainingToDeduct -= planCreditsUsed;
  } else if (!user.activeSubscription) {
    // Free plan
    const freeCreditsUsed = Math.min(user.credits.free, remainingToDeduct);
    user.credits.free -= freeCreditsUsed;
    remainingToDeduct -= freeCreditsUsed;
  }

  // Deduct from promotional credits
  if (remainingToDeduct > 0) {
    const now = new Date();
    user.credits.promotional = user.credits.promotional.map(promo => {
      if (now >= promo.startDate && now <= promo.endDate && remainingToDeduct > 0) {
        const promoCreditsUsed = Math.min(promo.amount, remainingToDeduct);
        promo.amount -= promoCreditsUsed;
        remainingToDeduct -= promoCreditsUsed;
      }
      return promo;
    }).filter(promo => promo.amount > 0);
  }

  // Deduct from admin-granted credits
  if (remainingToDeduct > 0) {
    const adminGrantedCreditsUsed = Math.min(user.credits.adminGranted, remainingToDeduct);
    user.credits.adminGranted -= adminGrantedCreditsUsed;
    remainingToDeduct -= adminGrantedCreditsUsed;
  }

  // Deduct from purchased credits
  if (remainingToDeduct > 0) {
    const purchasedCreditsUsed = Math.min(user.credits.purchased, remainingToDeduct);
    user.credits.purchased -= purchasedCreditsUsed;
    remainingToDeduct -= purchasedCreditsUsed;
  }

  await user.save();
  if (user.activeSubscription) await user.activeSubscription.save();

  return creditsToDeduct - remainingToDeduct; // Return the number of credits actually deducted
};
