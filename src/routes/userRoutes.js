const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateUser } = require('../middleware/auth');
const { validatePaymentMethod } = require('../services/userService');
const userService = require('../services/userService');

// Public routes
router.post('/register', userController.registerUser);
router.post('/login', userController.loginUser);

// Protected routes (require authentication)
router.get('/profile', authenticateUser, userController.getUserProfile);
router.put('/profile', authenticateUser, userController.updateUserProfile);
router.put('/change-password', authenticateUser, userController.changeUserPassword);
router.get('/transactions', authenticateUser, userController.getUserTransactions);
router.post('/addbalance', authenticateUser, userController.addBalance);
router.get('/client-credentials', authenticateUser, userController.getClientCredentials);

// Delete account route
router.delete('/delete-account', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    await userService.deleteAccount(userId);
    res.status(200).json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'An error occurred while deleting the account' });
  }
});



// Payment validation route
router.post('/payment-validation', authenticateUser, async (req, res) => {
  try {
    const { paymentMethodId } = req.body;
    const result = await validatePaymentMethod(req.user.id, paymentMethodId);
    if (result.isValid) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error during payment validation' });
  }
});


// Replace existing credit-related routes with this single route
router.get('/credits', authenticateUser, userController.getCredits);

module.exports = router;
