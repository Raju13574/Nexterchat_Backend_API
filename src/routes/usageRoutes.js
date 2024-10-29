const express = require('express');
const router = express.Router();
const usageController = require('../controllers/usageController');
const { authenticateUser } = require('../middleware/auth');

router.get('/', authenticateUser, usageController.getOverallUsage);
router.get('/language/:language', authenticateUser, usageController.getLanguageUsage);

// New endpoints
router.get('/api-analytics/usage', authenticateUser, usageController.getApiUsageAnalytics);
router.get('/api-analytics/languages', authenticateUser, usageController.getLanguageAnalytics);
router.get('/api-analytics/performance', authenticateUser, usageController.getPerformanceAnalytics);

module.exports = router;
