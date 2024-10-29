const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, authorize, authenticateAdmin } = require('../middleware/auth');

// Apply authenticateAdmin middleware to all routes
router.use(protect, authorize('admin'));

router.get('/profile', adminController.getAdminProfile);
router.put('/profile', adminController.updateAdminProfile);
router.put('/change-password', adminController.changeAdminPassword);
router.get('/users', adminController.getAllUsers);
router.post('/users', adminController.createUser);
router.get('/users/:id', adminController.getUserById);
router.put('/users/:id', adminController.updateUserById);
router.delete('/users/:id', adminController.deleteUser);
router.get('/users/:id/transactions', adminController.getUserTransactions);
router.put('/users/:id/balance', adminController.updateUserBalance);
router.get('/transactions', adminController.getAllTransactions);
router.post('/users/:id/promote', adminController.promoteUserToAdmin);
router.put('/users/:id/password', adminController.updateUserPassword);
router.get('/api-usage-stats', adminController.getAPIUsageStats);
router.get('/user-statistics', adminController.getUserStatistics);
router.get('/subscription-metrics', adminController.getSubscriptionMetrics);
router.get('/top-users', adminController.getTopUsers);
router.get('/dashboard-stats', adminController.getDashboardStats);
router.post('/grant-promotional-credits', adminController.grantPromotionalCredits);
router.post('/grant-credits', authenticateAdmin, adminController.grantCredits);
router.put('/promotions/:promotionId', adminController.updatePromotion);
router.get('/promotions', adminController.getAllPromotions);
router.post('/promotions', adminController.createPromotion);

module.exports = router;
