const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'deposit', 
      'withdrawal', 
      'credit_purchase', 
      'subscription_payment', 
      'subscription_cancellation',
      'subscription_upgrade',
      'subscription_downgrade',
      'subscription'
    ],
    required: true
  },
  amountInPaisa: {
    type: Number,
    required: true,
    default: 0
  },
  credits: {
    type: Number,
    default: 0
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'completed'
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add virtuals for formatted values
transactionSchema.virtual('formattedAmount').get(function() {
  const prefix = this.type === 'deposit' ? '+' : '-';
  return `${prefix}₹${(this.amountInPaisa / 100).toFixed(2)}`;
});

transactionSchema.virtual('formattedDate').get(function() {
  return new Date(this.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

module.exports = mongoose.model('Transaction', transactionSchema);
