require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('./src/models/Admin');

async function resetAdminPassword() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const newPassword = 'admin'; // Choose a new secure password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const updatedAdmin = await Admin.findOneAndUpdate(
      { username: 'admin' },
      { $set: { password: hashedPassword } },
      { new: true }
    );

    if (updatedAdmin) {
      console.log('Admin password reset successfully');
    } else {
      console.log('Admin not found');
    }
  } catch (error) {
    console.error('Error resetting admin password:', error);
  } finally {
    await mongoose.disconnect();
  }
}

resetAdminPassword();