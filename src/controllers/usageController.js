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

