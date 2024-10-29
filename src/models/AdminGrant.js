const mongoose = require('mongoose');

const AdminGrantSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  credits: {
    type: Number,
    required: true
  }
});

module.exports = mongoose.model('AdminGrant', AdminGrantSchema);
