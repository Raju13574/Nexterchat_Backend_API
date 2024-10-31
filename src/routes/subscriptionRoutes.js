const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const subscriptionController = require('../controllers/subscriptionController');

// Get all plans
router.get('/plans', subscriptionController.getPlans);

// Subscribe to a plan
router.post('/plans/:plan_id/subscribe', authenticateUser, subscriptionController.subscribe);

// Upgrade subscription
router.post('/plans/:plan_id/upgrade', authenticateUser, subscriptionController.upgrade);

// Cancel subscription
router.post('/cancel', authenticateUser, subscriptionController.cancelSubscription);

// Get subscription status
router.get('/status', authenticateUser, subscriptionController.getStatus);

// Get subscription transactions
router.get('/transactions', authenticateUser, subscriptionController.getSubscriptionTransactions);

module.exports = router;
