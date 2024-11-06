const cron = require('node-cron');
const applyPromotions = require('./applyPromotions');
const cleanupPromotions = require('./cleanupPromotions');

// Existing cron jobs
// ... your existing cron schedules ...

// Add new subscription activation cron - runs every hour
// cron.schedule('0 * * * *', activateScheduledSubscriptions);

module.exports = {
  applyPromotions,
  cleanupPromotions
}; 