const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authenticateUser } = require('../middleware/auth');
const walletService = require('../services/walletService'); // Assuming this is where walletService is defined

// Example route definitions
router.get('/balance', authenticateUser, walletController.getBalance);
router.post('/addbalance', authenticateUser, walletController.addBalance); // Changed from '/add' to '/addbalance'
router.get('/transactions', authenticateUser, walletController.getTransactions);

router.post('/purchase-credits', authenticateUser, walletController.purchaseCredits);

// Protect this route with authentication middleware
router.get('/credit-spent', authenticateUser, walletController.getCreditSpent);

router.get('/purchased-credits', authenticateUser, walletController.getPurchasedCredits);

module.exports = router;
