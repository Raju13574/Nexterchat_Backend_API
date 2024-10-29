const formatCredits = (user, isAdmin = false) => {
  // Ensure user and credits exist to prevent null/undefined errors
  if (!user?.credits) {
    return { credits: { free: 0, purchased: 0, adminGranted: 0 }, totalCredits: 0 };
  }

  let credits = {
    free: user.credits.free || 0,
    purchased: user.credits.purchased || 0,
    adminGranted: user.credits.adminGranted || 0
  };

  // Use Number() to ensure numeric values
  let totalCredits = Number(credits.free) + Number(credits.purchased) + Number(credits.adminGranted);

  // Safely handle promotional credits
  if (Array.isArray(user.credits.promotional) && user.credits.promotional.length > 0) {
    credits.promotional = user.credits.promotional;
    totalCredits += user.credits.promotional.reduce((sum, promo) => sum + Number(promo.amount || 0), 0);
  }

  return { credits, totalCredits };
};

module.exports = formatCredits;
