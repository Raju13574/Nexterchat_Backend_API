const express = require('express');
const router = express.Router();
const usageController = require('../controllers/usageController');
const { authenticateUser } = require('../middleware/auth');

router.get('/', authenticateUser, usageController.getOverallUsage);
router.get('/language/:language', authenticateUser, usageController.getLanguageUsage);

module.exports = router;
