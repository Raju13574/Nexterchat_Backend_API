const cron = require('node-cron');
const subscriptionRenewal = require('./subscriptionRenewal');
const applyPromotions = require('./applyPromotions');
const cleanupPromotions = require('./cleanupPromotions');
const activateScheduledSubscriptions = require('./subscriptionActivation');

// Existing cron jobs
// ... your existing cron schedules ...

// Add new subscription activation cron - runs every hour
cron.schedule('0 * * * *', activateScheduledSubscriptions);

module.exports = {
  subscriptionRenewal,
  applyPromotions,
  cleanupPromotions,
  activateScheduledSubscriptions
}; 