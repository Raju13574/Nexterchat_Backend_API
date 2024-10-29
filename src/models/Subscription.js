const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  plan: {
    type: String,
    enum: ['free', 'monthly', 'three_month', 'six_month', 'yearly'],
    required: true
  },
  priceInPaisa: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'Price must be an integer (in paisa)'
    }
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  active: {
    type: Boolean,
    default: true
  },
  creditsPerDay: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    validate: {
      validator: function(v) {
        return v === 'Unlimited' || (typeof v === 'number' && v >= 0);
      },
      message: props => `${props.value} is not a valid value for creditsPerDay`
    }
  },
  remainingCredits: {
    type: Number,
    required: true,
    default: function() {
      return this.creditsPerDay === 'Unlimited' ? Infinity : this.creditsPerDay;
    }
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'expired', 'upgraded', 'downgraded', 'renewed'],
    default: 'active'
  }
}, { timestamps: true });

// Virtual for formatted price
subscriptionSchema.virtual('formattedPrice').get(function() {
  return `₹${(this.priceInPaisa/100).toFixed(2)}`;
});

// Virtual for price in rupees
subscriptionSchema.virtual('priceInRupees').get(function() {
  return this.priceInPaisa / 100;
});

module.exports = mongoose.model('Subscription', subscriptionSchema);
