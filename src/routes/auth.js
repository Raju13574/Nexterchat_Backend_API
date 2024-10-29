const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController'); // Adjust the path as necessary
const { authenticateUser } = require('../middleware/auth'); // Change this line

// Define authentication routes
router.post('/register', userController.registerUser);
router.post('/login', userController.loginUser);

// Protected routes
router.get('/profile', authenticateUser, userController.getUserProfile);
// Add other protected routes here

module.exports = router;