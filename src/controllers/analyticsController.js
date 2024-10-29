const Execution = require('../models/Execution');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Subscription = require('../models/Subscription');
const Admin = require('../models/Admin');

const getIntervalMilliseconds = (interval) => {
  const units = {
    'm': 60 * 1000,           // minute in milliseconds
    'h': 60 * 60 * 1000,      // hour in milliseconds
    'd': 24 * 60 * 60 * 1000, // day in milliseconds
  };

  // Handle special cases first
  if (interval === '24h') return 24 * 60 * 60 * 1000;
  if (interval === 'weekly') return 7 * 24 * 60 * 60 * 1000;
  if (interval === 'monthly') return 30 * 24 * 60 * 60 * 1000;

  const match = interval.match(/^(\d+)([mh])$/);
  if (!match) throw new Error('Invalid interval format');

  const [_, number, unit] = match;
  return parseInt(number) * units[unit];
};

const formatTimestamp = (timeGroup, startDate, interval) => {
  if (timeGroup.year && timeGroup.month) {
    return new Date(timeGroup.year, timeGroup.month - 1).toISOString();
  } else if (timeGroup.year && timeGroup.week) {
    const date = new Date(timeGroup.year, 0, 1);
    date.setDate(date.getDate() + (timeGroup.week * 7));
    return date.toISOString();
  } else if (timeGroup.interval !== undefined) {
    return new Date(startDate.getTime() + timeGroup.interval).toISOString();
  }
  return timeGroup;
};

exports.getAnalyticsData = async (req, res) => {
  try {
    console.log('Analytics endpoint hit with query:', req.query);
    const { interval, start_time, end_time } = req.query;
    
    // Validate interval format
    if (!interval.match(/^(\d+[mh]|24h|weekly|monthly)$/)) {
      return res.status(400).json({ error: 'Invalid interval format' });
    }

    // Set time range
    const endDate = end_time ? new Date(end_time) : new Date();
    let startDate;

    if (start_time) {
      startDate = new Date(start_time);
    } else {
      startDate = new Date(endDate - 24 * 60 * 60 * 1000);
    }

    // Build base match stage
    const matchStage = {
      $match: {
        createdAt: {
          $gte: startDate,
          $lte: endDate
        }
      }
    };

    // If user is not admin, filter data for their user ID only
    const isAdmin = req.user instanceof Admin;
    if (!isAdmin) {
      matchStage.$match.user = req.user._id;
    }

    // Determine group interval
    let groupInterval;
    if (interval === 'monthly') {
      groupInterval = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' }
      };
    } else if (interval === 'weekly') {
      groupInterval = {
        year: { $year: '$createdAt' },
        week: { $week: '$createdAt' }
      };
    } else {
      const intervalMs = getIntervalMilliseconds(interval);
      groupInterval = {
        interval: {
          $subtract: [
            { $subtract: ['$createdAt', startDate] },
            { $mod: [
              { $subtract: ['$createdAt', startDate] },
              intervalMs
            ]}
          ]
        }
      };
    }

    // Aggregate executions with language statistics
    const executionStats = await Execution.aggregate([
      matchStage,
      {
        $group: {
          _id: {
            timeGroup: groupInterval,
            language: '$language'
          },
          totalExecutions: { $sum: 1 },
          successfulExecutions: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
          },
          failedExecutions: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          },
          averageExecutionTime: { $avg: '$executionTime' },
          creditsUsed: { $sum: '$creditsUsed' }
        }
      },
      {
        $group: {
          _id: '$_id.timeGroup',
          languages: {
            $push: {
              language: '$_id.language',
              metrics: {
                total: '$totalExecutions',
                successful: '$successfulExecutions',
                failed: '$failedExecutions',
                avgTime: { $round: ['$averageExecutionTime', 2] },
                credits: '$creditsUsed'
              }
            }
          },
          totalExecutions: { $sum: '$totalExecutions' },
          totalCreditsUsed: { $sum: '$creditsUsed' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Format response
    const response = {
      timeRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        interval: interval
      },
      executionMetrics: executionStats.map(stat => ({
        timestamp: formatTimestamp(stat._id, startDate, interval),
        total: stat.totalExecutions,
        totalCredits: stat.totalCreditsUsed,
        byLanguage: stat.languages.reduce((acc, lang) => {
          acc[lang.language] = {
            total: lang.metrics.total,
            successful: lang.metrics.successful,
            failed: lang.metrics.failed,
            avgTime: Number(lang.metrics.avgTime.toFixed(2)),
            credits: lang.metrics.credits
          };
          return acc;
        }, {})
      }))
    };

    // Add summary metrics
    const summary = {
      totalExecutions: executionStats.reduce((sum, stat) => sum + stat.totalExecutions, 0),
      totalCreditsUsed: executionStats.reduce((sum, stat) => sum + stat.totalCreditsUsed, 0),
      languageBreakdown: {},
      successRate: 0
    };

    // Calculate language breakdown and success rate
    let totalSuccessful = 0;
    executionStats.forEach(stat => {
      stat.languages.forEach(lang => {
        if (!summary.languageBreakdown[lang.language]) {
          summary.languageBreakdown[lang.language] = {
            total: 0,
            successful: 0,
            failed: 0,
            credits: 0
          };
        }
        const langStats = summary.languageBreakdown[lang.language];
        langStats.total += lang.metrics.total;
        langStats.successful += lang.metrics.successful;
        langStats.failed += lang.metrics.failed;
        langStats.credits += lang.metrics.credits;
        totalSuccessful += lang.metrics.successful;
      });
    });

    if (summary.totalExecutions > 0) {
      summary.successRate = (totalSuccessful / summary.totalExecutions * 100).toFixed(2) + '%';
    }

    response.summary = summary;

    // Add admin-only metrics if user is admin
    if (isAdmin) {
      const [transactionStats, subscriptionStats] = await Promise.all([
        Transaction.aggregate([
          matchStage,
          {
            $group: {
              _id: groupInterval,
              totalTransactions: { $sum: 1 },
              totalAmount: { $sum: '$amountInPaisa' },
              totalCredits: { $sum: '$credits' }
            }
          },
          { $sort: { '_id': 1 } }
        ]),
        Subscription.aggregate([
          matchStage,
          {
            $group: {
              _id: groupInterval,
              newSubscriptions: { $sum: 1 },
              activeSubscriptions: {
                $sum: { $cond: [{ $eq: ['$active', true] }, 1, 0] }
              }
            }
          },
          { $sort: { '_id': 1 } }
        ])
      ]);

      response.transactionMetrics = transactionStats;
      response.subscriptionMetrics = subscriptionStats;
    }

    res.json(response);
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
};
