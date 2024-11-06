const Execution = require('../models/Execution');

exports.getOverallUsage = async (req, res) => {
  try {
    const userId = req.user._id;

    const usage = await Execution.aggregate([
      { $match: { user: userId } },
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
  const userId = req.user._id;
  
  try {
    const usage = await Execution.aggregate([
      { $match: { user: userId, language: language.toLowerCase() } },
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

// Update getRecentCompilations function
exports.getRecentCompilations = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get the most recent 5 executions with more details
    const recentCompilations = await Execution.aggregate([
      { $match: { user: userId } },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
      {
        $project: {
          filename: { $ifNull: ['$filename', 'untitled'] },
          language: { $toLower: '$language' },
          status: 1,
          createdAt: 1,
          executionTime: 1,
          creditsUsed: 1,
          codeSize: { $strLenCP: '$code' },
          outputSize: { $strLenCP: { $ifNull: ['$output', ''] } }
        }
      }
    ]);

    const formattedCompilations = recentCompilations.map(comp => ({
      filename: comp.filename,
      language: comp.language,
      status: comp.status,
      time: getTimeAgo(comp.createdAt),
      executionTime: `${comp.executionTime}ms`,
      creditsUsed: comp.creditsUsed,
      metrics: {
        codeSize: `${Math.round(comp.codeSize / 1024)}KB`,
        outputSize: `${Math.round(comp.outputSize / 1024)}KB`
      }
    }));

    res.json(formattedCompilations);
  } catch (error) {
    console.error('Error in getRecentCompilations:', error);
    res.status(500).json({ error: 'Failed to fetch recent compilations' });
  }
};

// Update getPopularLanguages function
exports.getPopularLanguages = async (req, res) => {
  try {
    const userId = req.user._id;
    const { timeRange = 'month' } = req.query;

    const startDate = new Date();
    if (timeRange === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    }

    const languageStats = await Execution.aggregate([
      { 
        $match: { 
          user: userId,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$language',
          totalExecutions: { $sum: 1 },
          successful: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
          },
          avgExecutionTime: { $avg: '$executionTime' },
          totalCredits: { $sum: '$creditsUsed' }
        }
      },
      {
        $project: {
          language: '$_id',
          totalExecutions: 1,
          successful: 1,
          avgExecutionTime: { $round: ['$avgExecutionTime', 2] },
          successRate: {
            $multiply: [
              { $divide: ['$successful', '$totalExecutions'] },
              100
            ]
          },
          totalCredits: 1
        }
      },
      { $sort: { totalExecutions: -1 } },
      { $limit: 5 }
    ]);

    const totalExecutions = languageStats.reduce((sum, lang) => sum + lang.totalExecutions, 0);

    const popularLanguages = languageStats.map(lang => ({
      name: lang.language.toLowerCase(),
      usage: Math.round((lang.totalExecutions / totalExecutions) * 100),
      successRate: Math.round(lang.successRate),
      avgExecutionTime: `${lang.avgExecutionTime}ms`,
      totalCredits: lang.totalCredits,
      bgColor: getLanguageColor(lang.language),
      progressColor: `bg-${getLanguageColor(lang.language).split('-')[1]}-500`
    }));

    res.json(popularLanguages);
  } catch (error) {
    console.error('Error in getPopularLanguages:', error);
    res.status(500).json({ error: 'Failed to fetch popular languages' });
  }
};

// Utility function for time ago
const getTimeAgo = (date) => {
  const seconds = Math.floor((new Date() - date) / 1000);
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval === 1 ? '' : 's'} ago`;
    }
  }
  return 'just now';
};

// Utility function for language colors
const getLanguageColor = (language) => {
  const colors = {
    python: 'bg-blue-500',
    javascript: 'bg-yellow-500',
    java: 'bg-orange-500',
    cpp: 'bg-purple-500',
    c: 'bg-red-500'
  };
  return colors[language.toLowerCase()] || 'bg-gray-500';
};

