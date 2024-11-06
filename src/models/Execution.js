const mongoose = require('mongoose');

const executionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  creditSource: {
    type: String,
    enum: ['free', 'subscription', 'purchased', 'granted', 'promotional'],
    required: true
  },
  code: {
    type: String,
    required: true
  },
  language: {
    type: String,
    required: true
  },
  input: String,
  output: String,
  error: String,
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'success'],
    default: 'completed'
  },
  executionTime: {
    type: Number,
    default: 0
  },
  planAtTime: {
    type: String,
    required: true,
    default: 'free'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Execution', executionSchema);
