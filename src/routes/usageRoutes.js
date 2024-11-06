const express = require('express');
const router = express.Router();
const usageController = require('../controllers/usageController');
const { authenticateUser } = require('../middleware/auth');

router.get('/', authenticateUser, usageController.getOverallUsage);
router.get('/language/:language', authenticateUser, usageController.getLanguageUsage);
router.get('/recent', authenticateUser, usageController.getRecentCompilations);
router.get('/popular', authenticateUser, usageController.getPopularLanguages);

module.exports = router;
