const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const { checkCredits } = require('../middleware/creditMiddleware');

// Remove duplicate execution routes
// router.post('/execute', ...); // Remove this

// Keep other routes
router.post('/request', 
  authenticateUser, 
  checkCredits,
  (req, res) => {
    res.json({ message: 'Request processed successfully' });
  }
);

module.exports = router;
