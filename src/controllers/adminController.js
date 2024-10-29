const Admin = require('../models/Admin');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const bcrypt = require('bcryptjs');
const Execution = require('../models/Execution');
const Subscription = require('../models/Subscription');
const Promotion = require('../models/Promotion');
const formatCredits = require('../utils/creditFormatter');
const AdminGrant = require('../models/AdminGrant'); // Add this import

const allowedDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];

exports.getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user._id).select('-password');
    res.json({
      message: 'Admin profile retrieved successfully',
      admin: {
        _id: admin._id,
        username: admin.username,
        email: admin.email,
        isAdmin: admin.isAdmin,
        createdAt: admin.createdAt,
        role: 'admin'
      }
    });
  } catch (error) {
    console.error('Error in getAdminProfile:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateAdminProfile = async (req, res) => {
  try {
    const { username, email } = req.body;
    if (email && !allowedDomains.includes(email.split('@')[1])) {
      return res.status(400).json({ error: 'Invalid email domain. Please use an official email service.' });
    }
    const admin = await Admin.findByIdAndUpdate(
      req.user._id,
      { username, email },
      { new: true, runValidators: true }
    ).select('-password');
    res.json({
      message: 'Admin profile updated successfully',
      admin: {
        _id: admin._id,
        username: admin.username,
        email: admin.email,
        isAdmin: admin.isAdmin,
        createdAt: admin.createdAt,
        role: 'admin'
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.changeAdminPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current password and new password are required' });
    }
    const admin = await Admin.findById(req.user._id);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    const salt = await bcrypt.genSalt(10);
    admin.password = await bcrypt.hash(newPassword, salt);
    await admin.save();
    res.json({ message: 'Admin password changed successfully' });
  } catch (error) {
    console.error('Error in changeAdminPassword:', error);
    res.status(500).json({ error: 'An error occurred while changing the password' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    const formattedUsers = await Promise.all(users.map(async user => {
      const activeSubscription = await Subscription.findOne({ user: user._id, active: true });
      
      return {
        _id: user._id,
        username: user.username,
        email: user.email,
        balance: user.balance,
        registrationDate: user.registrationDate,
        purchasedCredits: user.credits.purchased,
        activeSubscription: {
          plan: activeSubscription ? activeSubscription.plan : 'free',
          creditsPerDay: activeSubscription ? activeSubscription.creditsPerDay : user.credits.free,
          startDate: activeSubscription ? activeSubscription.startDate : user.registrationDate,
          endDate: activeSubscription ? activeSubscription.endDate : user.freePlanEndDate
        }
      };
    }));
    res.json(formattedUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if the email domain is allowed
    if (!allowedDomains.includes(email.split('@')[1])) {
      return res.status(400).json({ error: 'Invalid email domain. Please use an official email service.' });
    }
    
    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists. Please choose a different username.' });
    }
    
    // Check if email already exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already in use. Please use a different email address.' });
    }
    
    const user = new User({
      username,
      email,
      password,
      // Other default values can be set here or in the User model
    });
    
    await user.save();
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Error in createUser:', error);
    res.status(400).json({ error: 'An error occurred while creating the user. Please try again.' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('activeSubscription');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Fetch subscription history
    const subscriptions = await Subscription.find({ 
      user: user._id,
      plan: { $ne: 'free' }
    }).sort({ startDate: -1 });

    // Fetch transaction history
    const transactions = await Transaction.find({ user: user._id })
      .sort({ createdAt: -1 })
      .select('type amount credits description createdAt');

    const plans = [
      { id: 'free', name: 'Free Plan', creditsPerDay: 15, price: 0, duration: 365 },
      { id: 'monthly', name: 'Monthly Plan', creditsPerDay: 1500, price: 4.99, duration: 30 },
      // Add other plans as needed
    ];

    const now = new Date();
    const history = subscriptions.map((sub, index) => {
      const plan = plans.find(p => p.id === sub.plan);
      let status = sub.active && now <= sub.endDate ? 'Active' : 'Cancelled';
      
      return {
        plan: sub.plan,
        status: status,
        creditsPerDay: plan.creditsPerDay,
        startDate: sub.startDate.toISOString(),
        endDate: sub.endDate.toISOString(),
        price: plan.price,
        dateTime: sub.startDate.toISOString(),
        message: status === 'Active' 
          ? `Your ${sub.plan} plan is currently active until ${sub.endDate.toDateString()}.`
          : `This ${sub.plan} subscription was cancelled on ${sub.endDate.toDateString()}.`,
        transition: index === subscriptions.length - 1
          ? `Upgraded from free to ${sub.plan}`
          : plan.price > plans.find(p => p.id === subscriptions[index + 1].plan).price
            ? `Upgraded from ${subscriptions[index + 1].plan} to ${sub.plan}`
            : plan.price < plans.find(p => p.id === subscriptions[index + 1].plan).price
              ? `Downgraded from ${subscriptions[index + 1].plan} to ${sub.plan}`
              : `Renewed ${sub.plan} subscription`
      };
    });

    const userDetails = {
      _id: user._id,
      username: user.username,
      email: user.email,
      registrationDate: user.registrationDate,
      credits: {
        free: user.credits.free,
        purchased: user.credits.purchased,
        granted: user.credits.granted,
        promotional: user.credits.promotional
      },
      balance: user.balance,
      subscription: {
        current: user.activeSubscription ? {
          plan: user.activeSubscription.plan,
          startDate: user.activeSubscription.startDate,
          endDate: user.activeSubscription.endDate,
          status: 'active'
        } : {
          plan: 'free',
          startDate: user.registrationDate,
          endDate: new Date(user.registrationDate.getTime() + 365 * 24 * 60 * 60 * 1000),
          status: 'active'
        },
        history: history
      },
      transactions: transactions.map(t => ({
        _id: t._id,
        type: t.type,
        amount: t.amount,
        credits: t.credits,
        description: t.description,
        dateTime: t.createdAt.toISOString()
      }))
    };

    res.json(userDetails);
  } catch (error) {
    console.error('Error in getUserById:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

function getTransitionMessage(currentSub, history) {
  const index = history.findIndex(sub => sub._id.equals(currentSub._id));
  if (index === history.length - 1) {
    return 'Initial subscription';
  }
  const previousSub = history[index + 1];
  if (currentSub.plan === previousSub.plan) {
    return 'Renewal';
  }
  if (currentSub.plan === 'free') {
    return 'Downgraded to free plan';
  }
  if (previousSub.plan === 'free') {
    return 'Upgraded from free plan';
  }
  return currentSub.plan > previousSub.plan ? 'Upgrade' : 'Downgrade';
}

exports.updateUserById = async (req, res) => {
  try {
    const { username, email } = req.body;

    // Check if the email domain is allowed
    if (email) {
      const domain = email.split('@')[1];
      if (!allowedDomains.includes(domain)) {
        return res.status(400).json({ error: 'Invalid email domain. Please use an official email service.' });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { username, email },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User updated successfully',
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        lastFreeCreditsReset: user.lastFreeCreditsReset,
        subscriptionPlan: user.subscriptionPlan,
        freeCredits: user.freeCredits,
        paidCredits: user.paidCredits,
        balance: user.balance,
        hadPaidSubscription: user.hadPaidSubscription,
        registrationDate: user.registrationDate,
        freePlanEndDate: user.freePlanEndDate,
        freePlanOnHold: user.freePlanOnHold,
        freePlanCreditsLeft: user.freePlanCreditsLeft
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getUserTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.params.id });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateUserBalance = async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.balance += amount;
    await user.save();
    res.json({ 
      message: 'User balance updated successfully', 
      newBalance: user.balance 
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .populate('user', 'username')
      .lean();

    const categorizedTransactions = {
      walletDeposits: [],
      subscriptionUpgrades: [],
      creditPurchases: [],
      other: []
    };

    transactions.forEach(t => {
      const baseTransaction = {
        transactionId: t._id,
        username: t.user ? t.user.username : 'Unknown',
        userId: t.user ? t.user._id : null,
        dateTime: t.createdAt.toISOString(),
        description: t.description
      };

      switch (t.type) {
        case 'deposit':
          categorizedTransactions.walletDeposits.push({
            ...baseTransaction,
            amountAdded: t.amount
          });
          break;
        case 'upgrade':
          categorizedTransactions.subscriptionUpgrades.push({
            ...baseTransaction,
            planType: t.description.split(' ')[3], // Extracts plan name
            amount: t.amount
          });
          break;
        case 'credit_purchase':
          categorizedTransactions.creditPurchases.push({
            ...baseTransaction,
            creditsPurchased: t.credits,
            amount: t.amount
          });
          break;
        default:
          categorizedTransactions.other.push({
            ...baseTransaction,
            type: t.type,
            amount: t.amount,
            credits: t.credits
          });
      }
    });

    res.json(categorizedTransactions);
  } catch (error) {
    console.error('Error fetching all transactions:', error);
    res.status(500).json({ error: 'Failed to retrieve transactions' });
  }
};

exports.promoteUserToAdmin = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const admin = new Admin({
      username: user.username,
      email: user.email,
      password: user.password
    });
    await admin.save();
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User promoted to admin successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateUserPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: 'User password updated successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

function getMostUsedLanguage(languageStats) {
    return languageStats.length > 0 ? languageStats[0]._id : 'No data available';
}

exports.getAPIUsageStats = async (req, res, next) => {
    try {
        const { startDate, endDate, userId } = req.query;
        
        let query = {};
        if (startDate && endDate) {
            query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }
        if (userId) {
            query.userId = userId;
        }

        const totalCalls = await Execution.countDocuments(query);
        
        // Language usage statistics
        const languageStats = await Execution.aggregate([
            { $match: query },
            { $group: { _id: "$language", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const mostUsedLanguage = getMostUsedLanguage(languageStats);

        // Daily, weekly, and monthly stats calculation
        // ... (implement aggregation logic here)

        res.status(200).json({
            success: true,
            data: {
                totalCalls,
                languageStats,
                mostUsedLanguage,
                // ... other stats
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.getUserStatistics = async (req, res, next) => {
    try {
        const totalUsers = await User.countDocuments();
        const usersByPlan = await User.aggregate([
            { $group: { _id: "$subscriptionPlan", count: { $sum: 1 } } }
        ]);
        
        // New user growth and daily signup trends calculation
        // ... (implement aggregation logic here)

        res.status(200).json({
            success: true,
            data: {
                totalUsers,
                usersByPlan,
                // ... other stats
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.getSubscriptionMetrics = async (req, res, next) => {
    try {
        const activeSubscriptions = await Subscription.countDocuments({ status: 'active' });
        
        // Subscription conversion rate, revenue metrics, and churn rate calculation
        // ... (implement aggregation logic here)

        res.status(200).json({
            success: true,
            data: {
                activeSubscriptions,
                // ... other metrics
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.getTopUsers = async (req, res, next) => {
  try {
    const { limit = 10, sortBy = 'usage' } = req.query;
    let pipeline = [];
    if (sortBy === 'usage') {
      pipeline = [
        { $group: { _id: "$userId", totalUsage: { $sum: 1 } } },
        { $sort: { totalUsage: -1 } },
        { $limit: parseInt(limit) }
      ];
    } else if (sortBy === 'revenue') {
      pipeline = [
        { $group: { _id: "$userId", totalRevenue: { $sum: "$amount" } } },
        { $sort: { totalRevenue: -1 } },
        { $limit: parseInt(limit) }
      ];
    }
    const topUsers = await Execution.aggregate(pipeline);
    res.status(200).json({
      success: true,
      data: topUsers
    });
  } catch (error) {
    next(error);
  }
};

exports.getDashboardStats = async (req, res, next) => {
  try {
    const today = new Date();
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const dailyStats = await calculateStats(today);
    const weeklyStats = await calculateStats(lastWeek);
    const monthlyStats = await calculateStats(lastMonth);

    const languageStats = await Execution.aggregate([
      { $group: { _id: "$language", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    const mostUsedLanguage = languageStats.length > 0 ? languageStats[0]._id : 'No data available';

    res.status(200).json({
      success: true,
      data: {
        daily: dailyStats,
        weekly: weeklyStats,
        monthly: monthlyStats,
        topLanguages: languageStats,
        mostUsedLanguage
      }
    });
  } catch (error) {
    next(error);
  }
};

async function calculateStats(startDate) {
  const apiCalls = await Execution.countDocuments({ createdAt: { $gte: startDate } });
  const newUsers = await User.countDocuments({ createdAt: { $gte: startDate } });
  const revenue = await Transaction.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);

  return {
    apiCalls,
    newUsers,
    revenue: revenue.length > 0 ? revenue[0].total : 0
  };
}

exports.grantCredits = async (req, res) => {
  try {
    const { userId, credits } = req.body;
    
    // Validate input
    if (!userId || !credits || credits <= 0) {
      return res.status(400).json({ 
        error: 'Invalid input. Please provide userId and a positive number of credits.' 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Initialize credits object if it doesn't exist
    if (!user.credits) {
      user.credits = {
        free: 15,
        purchased: 0,
        granted: 0
      };
    }

    const previousGrantedCredits = user.credits.granted || 0;
    // Add granted credits
    user.credits.granted = previousGrantedCredits + parseInt(credits);
    
    // Create a record of this grant
    const adminGrant = new AdminGrant({
      admin: req.user._id,
      user: userId,
      credits: parseInt(credits)
    });

    // Save both user and admin grant
    await Promise.all([user.save(), adminGrant.save()]);

    res.json({ 
      message: 'Credits granted successfully',
      newlyGrantedCredits: parseInt(credits),
      totalGrantedCredits: user.credits.granted
    });

  } catch (error) {
    console.error('Error granting credits:', error);
    res.status(500).json({ error: 'Failed to grant credits' });
  }
};

exports.createPromotion = async (req, res) => {
  console.log('createPromotion function called');
  console.log('Request body:', req.body);
  try {
    const { offerName, credits, startDate, endDate } = req.body;
    const promotion = new Promotion({
      offerName,
      credits,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      createdBy: req.user._id,
    });
    await promotion.save();
    console.log('Promotion created:', promotion);

    // Apply the promotion to all existing users
    const result = await User.updateMany(
      {},
      {
        $push: {
          'credits.promotional': {
            amount: promotion.credits,
            offerName: promotion.offerName,
            startDate: promotion.startDate,
            endDate: promotion.endDate
          }
        }
      }
    );

    res.json({ 
      message: 'Promotion created and applied to all users successfully', 
      promotion,
      usersUpdated: result.nModified
    });
  } catch (error) {
    console.error('Error in createPromotion:', error);
    res.status(500).json({ error: 'Failed to create and apply promotion' });
  }
};

exports.grantPromotionalCredits = async (req, res) => {
  try {
    const { userId, promotionId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const promotion = await Promotion.findById(promotionId);
    if (!promotion) return res.status(404).json({ error: 'Promotion not found' });

    if (!user.credits) {
      user.credits = { free: user.freeCredits || 0, purchased: user.purchasedCredits || 0, adminGranted: 0, promotional: [] };
    }

    user.credits.promotional.push({
      amount: promotion.credits,
      offerName: promotion.offerName,
      startDate: promotion.startDate,
      endDate: promotion.endDate
    });

    await user.save();

    res.json({ message: 'Promotional credits granted successfully', user });
  } catch (error) {
    console.error('Error granting promotional credits:', error);
    res.status(500).json({ error: error.message });
  }
};



exports.getUserDetails = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userDetails = {
      ...user.toObject(),
      credits: {
        free: user.credits.free,
        purchased: user.credits.purchased
      }
    };

    // Only include promotional credits if they exist
    if (user.credits.promotional && user.credits.promotional.length > 0) {
      userDetails.credits.promotional = user.credits.promotional;
    }

    res.json({ user: userDetails });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
};

exports.getAllPromotions = async (req, res) => {
  try {
    const promotions = await Promotion.find().sort({ createdAt: -1 });
    
    // Get the count of users for each promotion
    const promotionsWithUserCount = await Promise.all(promotions.map(async (promotion) => {
      const userCount = await User.countDocuments({
        'credits.promotional.offerName': promotion.offerName
      });
      
      return {
        ...promotion.toObject(),
        userCount
      };
    }));

    res.json(promotionsWithUserCount);
  } catch (error) {
    console.error('Error in getAllPromotions:', error);
    res.status(500).json({ error: 'Failed to fetch promotions' });
  }
};

exports.updatePromotion = async (req, res) => {
  try {
    const { promotionId } = req.params;
    const { credits, startDate, endDate } = req.body;

    // Find the promotion
    const promotion = await Promotion.findById(promotionId);

    if (!promotion) {
      return res.status(404).json({ error: 'Promotion not found' });
    }

    // Update the promotion
    if (credits !== undefined) promotion.credits = credits;
    if (startDate) promotion.startDate = new Date(startDate);
    if (endDate) promotion.endDate = new Date(endDate);

    await promotion.save();

    // Update the promotion for all users who have it
    const updateResult = await User.updateMany(
      { 'credits.promotional.offerName': promotion.offerName },
      { 
        $set: { 
          'credits.promotional.$[elem].amount': promotion.credits,
          'credits.promotional.$[elem].startDate': promotion.startDate,
          'credits.promotional.$[elem].endDate': promotion.endDate
        }
      },
      { 
        arrayFilters: [{ 'elem.offerName': promotion.offerName }],
        multi: true
      }
    );

    console.log(`Updated promotion for ${updateResult.nModified} users`);

    res.json({ 
      message: 'Promotion updated successfully', 
      promotion,
      usersUpdated: updateResult.nModified
    });
  } catch (error) {
    console.error('Error in updatePromotion:', error);
    res.status(500).json({ error: 'Failed to update promotion' });
  }
};

exports.getUserCredits = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = new Date();
    let freeCredits = user.credits.free || 0;
    let purchasedCredits = user.credits.purchased || 0;
    let promotionalCredits = 0;
    let activePromotionalOffers = [];

    // Calculate promotional credits and filter out expired promotions
    if (user.credits && user.credits.promotional) {
      user.credits.promotional = user.credits.promotional.filter(promo => {
        const startDate = new Date(promo.startDate);
        const endDate = new Date(promo.endDate);
        if (now >= startDate && now <= endDate) {
          promotionalCredits += promo.credits;
          activePromotionalOffers.push({
            offerName: promo.offerName,
            credits: promo.credits,
            startDate: promo.startDate,
            endDate: promo.endDate
          });
          return true;
        }
        return false;
      });
    }

    const totalCredits = freeCredits + purchasedCredits + promotionalCredits;

    // Save the user to remove expired promotions
    await user.save();

    res.json({
      freeCredits,
      purchasedCredits,
      promotionalCredits,
      totalCredits,
      promotionalOffers: activePromotionalOffers
    });
  } catch (error) {
    console.error('Error fetching user credits:', error);
    res.status(500).json({ error: 'Failed to fetch user credits' });
  }
};














































