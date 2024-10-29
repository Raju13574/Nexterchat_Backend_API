const User = require('../models/User');
const Transaction = require('../models/Transaction');

exports.addBalance = async (userId, amount) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Convert amount to INR (stored in paisa)
    const amountInPaisa = Math.round(amount * 100);
    user.balance += amountInPaisa;
    await user.save();

    // Create transaction with INR amount
    const transaction = new Transaction({
      user: userId,
      type: 'deposit',
      amount: amountInPaisa,
      credits: 0,
      description: `Added ₹${(amountInPaisa / 100).toFixed(2)} to balance`,
      timestamp: new Date()
    });
    await transaction.save();

    return { 
      user: {
        ...user.toObject(),
        balance: user.balance / 100 // Convert back to rupees for display
      }, 
      transaction: {
        ...transaction.toObject(),
        amount: transaction.amount / 100 // Convert back to rupees for display
      }
    };
  } catch (error) {
    throw error;
  }
};

exports.deductCredits = async (userId, credits) => {
  const user = await User.findById(userId);
  if (user.credits < credits) {
    throw new Error('Insufficient credits');
  }
  user.credits -= credits;
  await user.save();
  return user.credits;
};

exports.purchaseCredits = async (userId, credits) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  // 1 credit costs ₹0.50 (stored as 50 paisa)
  const costInPaisa = credits * 50;
  if (user.balance < costInPaisa) {
    throw new Error(`Insufficient balance. Required: ₹${(costInPaisa / 100).toFixed(2)}, Available: ₹${(user.balance / 100).toFixed(2)}`);
  }

  user.balance -= costInPaisa;
  user.credits.purchased += credits;
  await user.save();

  // Create transaction record
  const transaction = await Transaction.create({
    user: userId,
    type: 'credit_purchase',
    amount: costInPaisa,
    credits: credits,
    description: `Purchased ${credits} credits for ₹${(costInPaisa / 100).toFixed(2)} (₹0.50 per credit)`,
    status: 'completed'
  });

  return { 
    message: `Successfully purchased ${credits} credits for ₹${(costInPaisa / 100).toFixed(2)}`, 
    newBalance: user.balance / 100,
    newPaidCredits: user.credits.purchased,
    costPerCredit: 0.50,
    totalCost: costInPaisa / 100,
    transaction: transaction
  };
};
