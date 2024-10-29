const express = require('express');
const router = express.Router();
const executionController = require('../controllers/executionController');
const { authenticateUser } = require('../middleware/auth');
const { checkCredits, deductCredit } = require('../middleware/creditMiddleware');

router.post('/', 
  authenticateUser,
  checkCredits,              // First check credits
  executionController.executeCode,  // Execute code
  deductCredit              // Deduct credits after successful execution
);

router.get('/history', authenticateUser, executionController.getExecutionHistory);
router.get('/languages', executionController.getSupportedLanguages);

module.exports = router;
