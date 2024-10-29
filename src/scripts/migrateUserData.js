const User = require('../models/User');

async function migrateUserData() {
  try {
    const users = await User.find();
    for (let user of users) {
      user.credits = {
        free: user.freeCredits || 15,
        purchased: user.purchasedCredits || 0,
        promotional: user.credits?.promotional || [],
        adminGranted: user.credits?.adminGranted || 0
      };
      user.registrationDate = new Date(user.registrationDate);
      user.freePlanEndDate = new Date(user.registrationDate.getFullYear() + 1, user.registrationDate.getMonth(), user.registrationDate.getDate());
      user.lastFreeCreditsReset = new Date(user.lastFreeCreditsReset);
      await user.save();
    }
    console.log('User data migration completed');
  } catch (error) {
    console.error('Error migrating user data:', error);
  }
}

migrateUserData();
