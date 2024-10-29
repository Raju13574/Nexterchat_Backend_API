const mongoose = require('mongoose');
require('dotenv').config(); // Add this line to load environment variables from .env file

const connectDatabase = () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment   variable is not set');
  }

  mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('MongoDB connection error:', err));
};

module.exports = connectDatabase;