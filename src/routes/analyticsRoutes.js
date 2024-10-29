const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { requireAdminOrUser } = require('../middleware/auth');

// Keep the '/data' path since we're mounting at '/api/analytics'
router.get('/data', requireAdminOrUser, analyticsController.getAnalyticsData);

module.exports = router;
