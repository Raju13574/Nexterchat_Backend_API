const cron = require('node-cron');
const User = require('../models/User');

cron.schedule('0 1 * * *', async () => {
  try {
    const now = new Date();
    await User.updateMany(
      {},
      { $pull: { 'credits.promotional': { endDate: { $lt: now } } } }
    );
  } catch (error) {
    console.error('Error cleaning up expired promotions:', error);
  }
});
