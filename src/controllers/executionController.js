const User = require('../models/User');
const Execution = require('../models/Execution');
const Subscription = require('../models/Subscription');
const codeExecutionService = require('../services/codeExecutionService');
const subscriptionService = require('../services/subscriptionService');
const CustomError = require('../utils/CustomError');
const creditService = require('../services/creditService');

exports.executeCode = async (req, res) => {
  try {
    console.log('Executing code with body:', req.body);
    const { language, code, input } = req.body;
    
    if (!language || !code) {
      return res.status(400).json({ error: "Language and code parameters are required" });
    }

    const startTime = Date.now();
    
    // Execute the code
    const result = await codeExecutionService.execute(language, code, input);
    const executionTime = Date.now() - startTime;
    
    // Determine status based on result
    const status = result.error ? 'failed' : 'success';
    
    // Convert result to string format for storage
    const outputString = result.error 
      ? `Error: ${result.error}`
      : String(result.result || result.output || '');

    // Create execution record
    const execution = new Execution({
      user: req.user._id,
      language,
      code,
      input: input || '',
      output: outputString,
      status: status,
      error: result.error ? String(result.error) : null,
      executionTime: parseFloat((executionTime / 1000).toFixed(3)),
      creditsUsed: 1,
      creditSource: req.creditSource // This will be 'free', 'purchased', or 'granted'
    });
    
    await execution.save();
    console.log('Execution record saved:', execution);

    if (result.error) {
      return res.status(400).json({ 
        error: result.error,
        executionTime: `${(executionTime / 1000).toFixed(3)} seconds`
      });
    }

    return res.json({ 
      result: result.result || result.output || '', 
      executionTime: `${(executionTime / 1000).toFixed(3)} seconds`,
      status: 'success'
    });

  } catch (error) {
    console.error('Execution error:', error);
    
    // Try to save error execution record
    try {
      const execution = new Execution({
        user: req.user._id,
        language: req.body.language,
        code: req.body.code,
        input: req.body.input || '',
        output: `Error: ${error.message}`,
        status: 'failed',
        error: String(error.message),
        executionTime: 0,
        creditsUsed: 1,
        creditSource: req.creditSource
      });
      await execution.save();
    } catch (saveError) {
      console.error('Failed to save error execution:', saveError);
    }

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
