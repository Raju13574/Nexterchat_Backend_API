const mongoose = require('mongoose');

const PromotionSchema = new mongoose.Schema({
  offerName: {
    type: String,
    required: true
  },
  credits: {
    type: Number,
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Promotion', PromotionSchema);
