const Execution = require('../models/Execution');

exports.getOverallUsage = async (req, res) => {
  try {
    const userId = req.user._id; // Get the user ID from the authenticated request

    const usage = await Execution.aggregate([
      { $match: { user: userId } }, // Match executions for this specific user
      {
        $group: {
          _id: { language: '$language', status: '$status' },
          count: { $sum: 1 },
          totalCreditsUsed: { $sum: '$creditsUsed' }
        }
      },
      {
        $group: {
          _id: '$_id.language',
          successful: {
            $sum: {
              $cond: [{ $eq: ['$_id.status', 'success'] }, '$count', 0]
            }
          },
          failed: {
            $sum: {
              $cond: [{ $eq: ['$_id.status', 'failed'] }, '$count', 0]
            }
          },
          totalCreditsUsed: { $sum: '$totalCreditsUsed' }
        }
      },
      {
        $project: {
          language: '$_id',
          successful: 1,
          failed: 1,
          totalCreditsUsed: 1,
          _id: 0
        }
      }
    ]);

    const totalExecutions = usage.reduce((sum, lang) => sum + lang.successful + lang.failed, 0);
    const totalCreditsUsed = usage.reduce((sum, lang) => sum + lang.totalCreditsUsed, 0);

    res.json({
      totalExecutions,
      totalCreditsUsed,
      languageBreakdown: usage
    });
  } catch (error) {
    console.error('Error in getOverallUsage:', error);
    res.status(500).json({ error: 'An error occurred while fetching usage data' });
  }
};

exports.getLanguageUsage = async (req, res) => {
  const { language } = req.params;
  const userId = req.user._id; // Get the user ID from the authenticated request
  
  try {
    const usage = await Execution.aggregate([
      { $match: { user: userId, language: language.toLowerCase() } }, // Match executions for this specific user and language
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalCreditsUsed: { $sum: '$creditsUsed' }
        }
      },
      {
        $group: {
          _id: null,
          successful: {
            $sum: {
              $cond: [{ $eq: ['$_id', 'success'] }, '$count', 0]
            }
          },
          failed: {
            $sum: {
              $cond: [{ $eq: ['$_id', 'failed'] }, '$count', 0]
            }
          },
          totalCreditsUsed: { $sum: '$totalCreditsUsed' }
        }
      },
      {
        $project: {
          _id: 0,
          successful: 1,
          failed: 1,
          totalCreditsUsed: 1
        }
      }
    ]);

    if (usage.length === 0) {
      return res.status(404).json({ error: 'No usage data found for this language' });
    }

    res.json({
      language,
      ...usage[0]
    });
  } catch (error) {
    console.error('Error in getLanguageUsage:', error);
    res.status(500).json({ error: 'An error occurred while fetching language usage data' });
  }
};

exports.getApiUsageAnalytics = async (req, res) => {
  try {
    const userId = req.user._id;
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const usageData = await Execution.aggregate([
      { $match: { user: userId, createdAt: { $gte: last7Days } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          calls: { $sum: 1 },
          errors: {
            $sum: {
              $cond: [{ $eq: ["$status", "failed"] }, 1, 0]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const formattedData = usageData.map(item => ({
      name: item._id,
      calls: item.calls,
      errors: item.errors
    }));

    res.json(formattedData);
  } catch (error) {
    console.error('Error in getApiUsageAnalytics:', error);
    res.status(500).json({ error: 'An error occurred while fetching API usage analytics' });
  }
};

exports.getLanguageAnalytics = async (req, res) => {
  try {
    const userId = req.user._id;

    const languageData = await Execution.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: "$language",
          value: { $sum: 1 }
        }
      }
    ]);

    const formattedData = languageData.map(item => ({
      name: item._id,
      value: item.value
    }));

    res.json(formattedData);
  } catch (error) {
    console.error('Error in getLanguageAnalytics:', error);
    res.status(500).json({ error: 'An error occurred while fetching language analytics' });
  }
};

exports.getPerformanceAnalytics = async (req, res) => {
  try {
    const userId = req.user._id;
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const performanceData = await Execution.aggregate([
      { $match: { user: userId, createdAt: { $gte: last24Hours } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d %H:00", date: "$createdAt" } },
          responseTime: { $avg: "$executionTime" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const formattedData = performanceData.map(item => ({
      time: item._id,
      responseTime: parseFloat(item.responseTime.toFixed(2))
    }));

    res.json(formattedData);
  } catch (error) {
    console.error('Error in getPerformanceAnalytics:', error);
    res.status(500).json({ error: 'An error occurred while fetching performance analytics' });
  }
};
