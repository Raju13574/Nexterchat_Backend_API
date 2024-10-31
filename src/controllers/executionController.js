const User = require('../models/User');
const Execution = require('../models/Execution');
const Subscription = require('../models/Subscription');
const codeExecutionService = require('../services/codeExecutionService');
const subscriptionService = require('../services/subscriptionService');
const CustomError = require('../utils/CustomError');
const creditService = require('../services/creditService');

exports.executeCode = async (req, res) => {
  try {
    const { language, code, input } = req.body;
    
    if (!language || !code) {
      req.skipCreditDeduction = true;
      return res.status(400).json({ error: "Language and code parameters are required" });
    }

    const startTime = Date.now();
    
    // Execute the code
    const result = await codeExecutionService.execute(language, code, input);
    const executionTime = Date.now() - startTime;
    
    // Create single execution record here
    await Execution.create({
      user: req.user._id,
      language,
      code,
      input: input || '',
      output: result.result || '',
      error: result.error || '',
      status: result.error ? 'failed' : 'completed',
      executionTime,
      creditSource: req.creditSource || 'free'
    });

    return res.json({ 
      result: result.result || result.output || '', 
      executionTime: `${(executionTime / 1000).toFixed(3)} seconds`,
      status: 'success'
    });

  } catch (error) {
    console.error('Execution error:', error);
    return res.status(500).json({ 
      error: 'Code execution failed',
      details: error.message
    });
  }
};

exports.getExecutionHistory = async (req, res, next) => {
  try {
    const executions = await Execution.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json(executions);
  } catch (error) {
    next(error);
  }
};

exports.getSupportedLanguages = (req, res) => {
  console.log('getSupportedLanguages function called');
  try {
    const languages = codeExecutionService.getSupportedLanguages();
    console.log('Supported languages:', languages);
    res.json({ languages });
  } catch (error) {
    console.error('Error in getSupportedLanguages:', error);
    res.status(500).json({ error: 'An unexpected error occurred while fetching supported languages' });
  }
};

module.exports = exports;
