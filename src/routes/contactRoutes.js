const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');

router.post('/', contactController.submitContactForm);

// Add a logging middleware to this router
router.use((req, res, next) => {
  console.log(`Contact route hit: ${req.method} ${req.originalUrl}`);
  next();
});

module.exports = router;
