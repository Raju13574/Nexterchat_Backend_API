const mongoose = require('mongoose');

const executionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  language: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true
  },
  input: {
    type: String,
    default: ''
  },
  output: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['success', 'error', 'failed'],
    required: true,
    default: 'success'
  },
  error: {
    type: String
  },
  executionTime: {
    type: Number,
    required: true,
    default: 0
  },
  creditsUsed: {
    type: Number,
    required: true,
    default: 1
  },
  creditSource: {
    type: String,
    enum: ['free', 'purchased', 'granted'], // Add adminGranted to allowed sources
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Execution', executionSchema);
