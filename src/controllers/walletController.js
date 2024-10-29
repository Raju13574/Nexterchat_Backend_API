const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Subscription = require('../models/Subscription');
const Execution = require('../models/Execution');
const walletService = require('../services/walletService');
const moment = require('moment');
const { razorpay } = require('./subscriptionController');

exports.getBalance = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "User is not authenticated" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return balance in both paisa and rupees format
    res.json({ 
      balance: user.balanceInPaisa || 0,  // Send in paisa
      balanceInRupees: (user.balanceInPaisa || 0) / 100  // Send in rupees too
    });
  } catch (error) {
    console.error('Error in getBalance:', error);
    res.status(500).json({ error: "An error occurred while fetching balance" });
  }
};

exports.addBalance = async (req, res) => {
  try {
    const { amountInRupees } = req.body;
    if (!amountInRupees || amountInRupees < 100) {
      return res.status(400).json({ 
        message: 'Invalid amount. Minimum deposit amount is ₹100',
        minimumAmount: 100
      });
    }

    const amountInPaisa = Math.round(amountInRupees * 100);
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Add to balance in paisa
    user.balanceInPaisa = (user.balanceInPaisa || 0) + amountInPaisa;
    await user.save();

    const transaction = await Transaction.create({
      user: user._id,
      type: 'deposit',
      amountInPaisa: amountInPaisa,
      credits: 0,
      description: `Added ₹${amountInRupees.toFixed(2)} to balance`
    });

    res.json({
      message: 'Amount added successfully',
      addedAmountInRupees: amountInRupees,
      totalAmountInRupees: user.balanceInPaisa / 100,
      formattedBalance: `₹${(user.balanceInPaisa/100).toFixed(2)}`,
      transaction: {
        id: transaction._id,
        type: 'deposit',
        amountInRupees: amountInRupees,
        amountInPaisa: transaction.amountInPaisa,
        createdAt: transaction.createdAt,
        status: 'completed'
      }
    });
  } catch (error) {
    console.error('Error in addBalance:', error);
    res.status(500).json({ message: 'Failed to add balance', error: error.message });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    // Remove any limit on the number of transactions
    const transactions = await Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    const formattedTransactions = transactions.map(transaction => ({
      id: transaction._id,
      type: transaction.type,
      description: transaction.description,
      amountInRupees: transaction.amountInPaisa / 100,
      formattedAmount: transaction.type === 'deposit' 
        ? `+₹${(transaction.amountInPaisa / 100).toFixed(2)}` 
        : `-₹${(transaction.amountInPaisa / 100).toFixed(2)}`,
      credits: transaction.credits || 0,
      status: transaction.status || 'completed',
      formattedDate: new Date(transaction.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    }));

    res.json({
      success: true,
      transactions: formattedTransactions,
      totalCount: transactions.length
    });
  } catch (error) {
    console.error('Error in getTransactions:', error);
    res.status(400).json({ 
      success: false, 
      message: 'Failed to retrieve transactions' 
    });
  }
};

async function recalculateUserBalanceAndCredits(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const transactions = await Transaction.find({ user: userId });

  let balance = 0;
  let paidCredits = 0;

  for (const transaction of transactions) {
    if (transaction.type === 'deposit') {
      balance += transaction.amount;
      paidCredits += transaction.credits;
    }
    // Add other transaction types here if needed
  }

  user.balance = balance;
  user.paidCredits = paidCredits;
  await user.save();
}

exports.getCreditSpent = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get today's executions
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayUsed = await Execution.countDocuments({
      user: user._id,
      createdAt: { $gte: today }
    });

    // Get user's subscription plan
    const activeSubscription = await Subscription.findOne({ 
      user: user._id, 
      active: true 
    });

    const planType = activeSubscription ? activeSubscription.plan : 'free';
    const totalDailyCredits = user.credits.free || 15; // Default free credits
    const purchasedCredits = user.credits.purchased || 0;

    // Calculate free credits usage
    const freeCreditsUsed = Math.min(todayUsed, totalDailyCredits);
    const freeCreditsRemaining = Math.max(0, totalDailyCredits - freeCreditsUsed);

    // Calculate purchased credits usage
    const purchasedCreditsUsed = Math.max(0, todayUsed - totalDailyCredits);
    const purchasedCreditsRemaining = Math.max(0, purchasedCredits - purchasedCreditsUsed);

    // Calculate today's remaining credits
    const todayRemaining = freeCreditsRemaining + purchasedCreditsRemaining;

    res.json({
      planType,
      todayUsed,
      totalDailyCredits,
      purchasedCredits: {
        total: purchasedCredits,
        used: purchasedCreditsUsed,
        remaining: purchasedCreditsRemaining
      },
      freeCredits: {
        total: totalDailyCredits,
        used: freeCreditsUsed,
        remaining: freeCreditsRemaining
      },
      todayRemaining
    });

  } catch (error) {
    console.error('Error in getCreditSpent:', error);
    res.status(500).json({ error: 'Failed to fetch credit spent information' });
  }
};

exports.purchaseCredits = async (req, res) => {
  try {
    const { credits } = req.body;
    if (!credits || credits <= 0) {
      return res.status(400).json({ error: 'Invalid credit amount' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 1 credit costs ₹0.50 (50 paisa)
    const costInPaisa = credits * 50;

    if (user.balanceInPaisa >= costInPaisa) {
      user.balanceInPaisa -= costInPaisa;
      user.credits.purchased += parseInt(credits);
      await user.save();

      const transaction = await Transaction.create({
        user: user._id,
        type: 'credit_purchase',
        amountInPaisa: costInPaisa,
        credits: parseInt(credits),
        description: `Purchased ${credits} credits for ₹${(costInPaisa/100).toFixed(2)} (₹0.50 per credit)`
      });

      return res.json({
        message: 'Credits purchased successfully',
        newBalanceInRupees: user.balanceInPaisa / 100,
        formattedBalance: `₹${(user.balanceInPaisa/100).toFixed(2)}`,
        purchasedCredits: user.credits.purchased,
        costPerCredit: 0.50,
        transaction: {
          id: transaction._id,
          amountInPaisa: transaction.amountInPaisa,
          credits: transaction.credits,
          description: transaction.description
        }
      });
    } else {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        message: `You need ₹${(costInPaisa/100).toFixed(2)} to purchase ${credits} credits. Your current balance is ₹${(user.balanceInPaisa/100).toFixed(2)}.`,
        requiredAmountInPaisa: costInPaisa,
        currentBalanceInPaisa: user.balanceInPaisa,
        costPerCredit: 0.50
      });
    }
  } catch (error) {
    console.error('Purchase credits error:', error);
    res.status(500).json({ error: 'Failed to process credit purchase', details: error.message });
  }
};

async function createRazorpayOrder(amount) {
  const options = {
    amount: Math.ceil(amount * 100), // Razorpay expects amount in paise
    currency: "INR",
    receipt: "order_rcptid_" + Math.random().toString(36).substring(7),
  };

  try {
    const order = await razorpay.orders.create(options);
    return order;
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    throw new Error('Failed to create Razorpay order');
  }
}

exports.getPurchasedCredits = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      purchasedCredits: {
        total: user.paidCredits,
        used: 0,  // You'll need to calculate this based on your business logic
        remaining: user.paidCredits
      }
    });
  } catch (error) {
    console.error('Error in getPurchasedCredits:', error);
    res.status(500).json({ error: 'An error occurred while fetching purchased credit information' });
  }
};
