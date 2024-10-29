const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  clientId: {
    type: String,
    unique: true,
    sparse: true
  },
  clientSecret: {
    type: String
  },
  lastFreeCreditsReset: { type: Date, default: Date.now },
  subscriptionPlan: { type: String, default: 'free' },
  freeCredits: { type: Number, default: 15 },
  purchasedCredits: { type: Number, default: 0 },
  balanceInPaisa: { 
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'Balance must be an integer (in paisa)'
    }
  },
  __v: { type: Number, select: false },
  hadPaidSubscription: { type: Boolean, default: false },
  registrationDate: { type: Date, default: Date.now },
  freePlanEndDate: { type: Date },
  freePlanOnHold: { type: Boolean, default: false },
  activeSubscription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription'
  },
  lastFreeCreditsBeforeUpgrade: { type: Number },
  lastFreeCreditsResetBeforeUpgrade: { type: Date },
  walletBalance: { 
    type: Number, // Stored in paisa
    default: 0,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'Wallet balance must be an integer (in paisa)'
    }
  },
  autoRenew: { type: Boolean, default: true },
  credits: {
    free: { type: Number, default: 15 },
    purchased: { type: Number, default: 0 },
    granted: { type: Number, default: 0 },
    promotional: [{
      credits: Number,
      offerName: String,
      startDate: Date,
      endDate: Date
    }]
  }
});

// Virtual property for total credits
userSchema.virtual('totalCredits').get(function() {
  return this.freeCredits + this.purchasedCredits;
});

// Add virtual for formatted balance
userSchema.virtual('formattedBalance').get(function() {
  return `₹${(this.balanceInPaisa / 100).toFixed(2)}`;
});

userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  if (this.isNew) {
    this.freePlanEndDate = new Date(this.registrationDate.getTime() + 365 * 24 * 60 * 60 * 1000);
  }
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.resetDailyFreeCredits = function() {
  const now = new Date();
  const lastReset = this.lastFreeCreditsReset;
  
  if (now.getDate() !== lastReset.getDate() || now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    this.freeCredits = 15; // Reset to the daily limit
    this.lastFreeCreditsReset = now;
  }
};

const User = mongoose.model('User', userSchema);
module.exports = User;
