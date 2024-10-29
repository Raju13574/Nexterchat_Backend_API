const User = require('../models/User');
const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { isValidUserDomain } = require('../utils/emailValidator');
const Transaction = require('../models/Transaction');
const walletService = require('../services/walletService');
const subscriptionService = require('../services/subscriptionService');
const Subscription = require('../models/Subscription'); // Add this line
const nodemailer = require('nodemailer');
const ContactMessage = require('../models/ContactMessage');
const Execution = require('../models/Execution');
const formatCredits = require('../utils/creditFormatter');
const Promotion = require('../models/Promotion');
const AdminGrant = require('../models/AdminGrant');

// Create a transporter using Elastic Email SMTP
const transporter = nodemailer.createTransport({
  host: 'smtp.elasticemail.com',
  port: 2525,
  secure: false,
  auth: {
    user: process.env.ELASTIC_EMAIL_USER,
    pass: process.env.ELASTIC_EMAIL_PASSWORD
  },
  debug: console.log
});

// Test the connection
transporter.verify(function(error, success) {
  if (error) {
    console.log('SMTP connection error:', error);
  } else {
    console.log('SMTP connection is ready to take our messages');
  }
});

// Helper functions to generate client ID and secret
const generateClientId = () => crypto.randomBytes(16).toString('hex');
const generateClientSecret = () => crypto.randomBytes(32).toString('hex');

const allowedDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];

exports.registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    console.log('Attempting to register user:', { username, email });

    // Check if the email domain is allowed
    const emailDomain = email.split('@')[1];
    console.log('Email domain:', emailDomain);
    console.log('Allowed domains:', allowedDomains);
    console.log('Is domain allowed:', allowedDomains.includes(emailDomain));

    if (!allowedDomains.includes(emailDomain)) {
      console.log('Rejecting registration due to invalid email domain');
      return res.status(400).json({ error: 'Invalid email domain. Please use an email from allowed domains.' });
    }

    // Password validation
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    console.log('Email domain is valid, proceeding with registration');

    const now = new Date();
    const user = new User({
      username,
      email,
      password,
      registrationDate: now,
      freePlanEndDate: new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()),
      subscriptionPlan: 'free',
      freeCredits: 15,
      lastFreeCreditsReset: now,
      clientId: uuidv4(),
      clientSecret: uuidv4(),
      apiSecret: uuidv4()
    });

    await user.save();

    // Check for active promotions
    const activePromotions = await Promotion.find({
      startDate: { $lte: now },
      endDate: { $gte: now }
    });

    for (const promotion of activePromotions) {
      user.credits.promotional.push({
        amount: promotion.credits,
        offerName: promotion.offerName,
        startDate: promotion.startDate,
        endDate: promotion.endDate
      });
    }

    await user.save();

    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    const freeSubscription = new Subscription({
      user: user._id,
      plan: 'free',
      startDate: new Date(),
      endDate: oneYearFromNow,
      active: true,
      creditsPerDay: 15
    });

    await freeSubscription.save();

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 11000) {
      // Duplicate key error
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ error: `${field} already exists.` });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: 'Invalid input. Please check your information and try again.' });
    }
    res.status(500).json({ error: 'An unexpected error occurred during registration. Please try again later.' });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;
    console.log('Login attempt:', { emailOrUsername });
    
    if (!emailOrUsername || !password) {
      return res.status(400).json({ error: 'Please provide both email/username and password.' });
    }

    // Check for user in both User and Admin collections
    let user = await User.findOne({
      $or: [{ email: emailOrUsername }, { username: emailOrUsername }]
    });

    let isAdmin = false;

    if (!user) {
      // If not found in User collection, check Admin collection
      user = await Admin.findOne({
        $or: [{ email: emailOrUsername }, { username: emailOrUsername }]
      });
      if (user) {
        isAdmin = true;
      }
    }

    if (!user) {
      console.log('User not found');
      return res.status(401).json({ error: 'Invalid email/username or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log('Password mismatch');
      return res.status(401).json({ error: 'Invalid email/username or password.' });
    }

    let subscriptionInfo = null;

    if (!isAdmin) {
      // Only check subscription for regular users
      let subscription = await Subscription.findOne({ user: user._id, active: true });

      // If no active subscription, create a free plan subscription
      if (!subscription) {
        try {
          subscription = new Subscription({
            user: user._id,
            plan: 'free',
            startDate: new Date(),
            endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            active: true,
            creditsPerDay: 15
          });
          await subscription.save();

          // Update user's subscription plan
          user.subscriptionPlan = 'free';
          await user.save();
        } catch (subscriptionError) {
          console.error('Error creating free subscription:', subscriptionError);
          // Continue with login even if subscription creation fails
        }
      }

      subscriptionInfo = subscription ? {
        plan: subscription.plan,
        creditsPerDay: subscription.creditsPerDay,
        active: subscription.active
      } : null;
    }

    const token = jwt.sign(
      { 
        id: user._id, 
        isAdmin: isAdmin,
        username: user.username,
        email: user.email
      },
      process.env.JWT_SECRET
    );

    console.log('Generated token:', token);
    console.log('JWT_SECRET used for signing:', process.env.JWT_SECRET ? 'Set' : 'Not set');

    // Set the token in a cookie
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    const responseData = {
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isAdmin: isAdmin
      },
      token
    };

    res.json(responseData);
  } catch (error) {
    console.error('Login error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: 'Invalid input. Please check your credentials and try again.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(500).json({ error: 'Error generating authentication token. Please try again.' });
    }
    if (error.name === 'MongoError') {
      return res.status(500).json({ error: 'Database error. Please try again later.' });
    }
    res.status(500).json({ error: 'An unexpected error occurred during login. Please try again later.' });
  }
};

exports.getUserProfile = async (req, res) => {
  res.json({
    id: req.user._id,
    username: req.user.username,
    email: req.user.email
  });
};

exports.updateUserProfile = async (req, res) => {
  try {
    console.log('Updating profile for user:', req.user.id);
    console.log('Update data received:', req.body);

    const { username, email } = req.body;
    
    // Validate input
    if (!username && !email) {
      console.log('No valid update data provided');
      return res.status(400).json({ message: 'No valid update data provided' });
    }

    // Prepare update object
    const updateData = {};
    if (username) updateData.username = username;
    if (email) {
      // Check if the email domain is allowed
      const domain = email.split('@')[1];
      if (!allowedDomains.includes(domain)) {
        console.log('Invalid email domain:', domain);
        return res.status(400).json({ error: 'Invalid email domain. Please use an official email service.' });
      }
      updateData.email = email;
    }

    console.log('Update data to be applied:', updateData);

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      console.log('User not found');
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('User updated successfully:', user);
    res.json({ message: 'User profile updated successfully', user });
  } catch (error) {
    console.error('Error updating user profile:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ error: `${field} already exists. Please choose a different ${field}.` });
    }
    res.status(500).json({ error: 'An unexpected error occurred while updating the profile. Please try again later.' });
  }
};

exports.changeUserPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    console.log('Change password attempt:', { userId: req.user.id, currentPassword, newPassword });

    // Password validation
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      console.log('User not found');
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('User found:', user);

    const isMatch = await user.comparePassword(currentPassword);
    console.log('Current password match:', isMatch);

    if (!isMatch) {
      console.log('Current password is incorrect');
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    console.log('Password changed successfully');
    return res.status(200).json({ 
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Error changing password:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: 'Invalid password. Please check the password requirements and try again.' });
    }
    res.status(500).json({ error: 'An unexpected error occurred while changing the password. Please try again later.' });
  }
};

exports.getUserTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id });
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching user transactions:', error);
    res.status(500).json({ error: 'Failed to fetch user transactions. Please try again later.' });
  }
};

exports.addBalance = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount. Please enter a valid amount in INR.' });
    }

    const { user, transaction } = await walletService.addBalance(req.user._id, amount);

    res.json({ 
      message: 'Balance added successfully', 
      balance: `₹${(user.balance / 100).toFixed(2)}`,
      credits: user.credits,
      transaction: {
        ...transaction,
        amount: `₹${(transaction.amount / 100).toFixed(2)}`,
        timestamp: new Date(transaction.timestamp).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata'
        })
      }
    });
  } catch (error) {
    console.error('Error adding balance:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: 'Invalid amount. Please provide a valid amount in INR.' });
    }
    res.status(500).json({ error: 'An unexpected error occurred while adding balance. Please try again later.' });
  }
};

exports.getClientCredentials = async (req, res) => {
  try {
    const user = req.user; // This should be set by the authenticateUser middleware

    if (!user.clientId || !user.clientSecret) {
      return res.status(404).json({ error: 'Client credentials not found' });
    }

    res.json({
      clientId: user.clientId,
      clientSecret: user.clientSecret
    });
  } catch (error) {
    console.error('Error retrieving client credentials:', error);
    res.status(500).json({ error: 'An unexpected error occurred while retrieving client credentials. Please try again later.' });
  }
};

exports.deleteOwnAccount = async (req, res) => {
  try {
    const userId = req.user._id; // Assuming you have middleware that sets req.user

    // Delete the user
    const deletedUser = await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Optionally, delete associated data (e.g., transactions)
    await Transaction.deleteMany({ user: userId });

    res.json({ message: 'Your account has been successfully deleted' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'An unexpected error occurred while deleting the account. Please try again later.' });
  }
};


exports.getSubscriptionStatus = async (req, res) => {
  try {
    const isSubscribed = await subscriptionService.checkSubscription(req.user._id);
    res.json({ subscribed: isSubscribed });
  } catch (error) {
    console.error('Error checking subscription status:', error);
    res.status(500).json({ error: 'An unexpected error occurred while checking subscription status. Please try again later.' });
  }
};

exports.getCreditSpent = async (req, res) => {
  try {
    const apiKey = req.header('X-API-Key');
    if (!apiKey) {
      return res.status(401).json({ error: "No API key provided" });
    }

    const [clientId, clientSecret] = apiKey.split(':');
    if (!clientId || !clientSecret) {
      return res.status(401).json({ error: "Invalid API key format" });
    }

    const user = await User.findOne({ clientId, clientSecret });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const subscription = await Subscription.findOne({ user: user._id, active: true });
    const totalDailyCredits = subscription ? subscription.creditsPerDay : 15;
    const executionsToday = await Execution.countDocuments({
      user: user._id,
      createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
    });

    const freeCreditsSpent = Math.min(executionsToday, 15);
    const paidCreditsSpent = Math.max(0, executionsToday - 15);

    res.json({
      username: user.username,
      freeCreditsSpent,
      freeCreditsRemaining: Math.max(0, 15 - freeCreditsSpent),
      paidCreditsSpent,
      paidCreditsRemaining: user.paidCredits - paidCreditsSpent,
      totalPaidCredits: user.paidCredits,
      totalDailyCredits
    });
  } catch (error) {
    console.error('Error in getCreditSpent:', error);
    res.status(500).json({ error: 'An unexpected error occurred while fetching credit information.' });
  }
};

exports.generateClientCredentials = async (req, res) => {
  try {
    // Generate a unique client ID (you might want to use a library like uuid for this)
    const clientId = 'client_' + Math.random().toString(36).substr(2, 9);
    
    // Generate a secure client secret
    const clientSecret = require('crypto').randomBytes(32).toString('hex');

    // Save these credentials to the user's document in the database
    req.user.clientId = clientId;
    req.user.clientSecret = clientSecret;
    await req.user.save();

    res.status(200).json({
      clientId: clientId,
      clientSecret: clientSecret,
      message: 'Client credentials generated successfully'
    });
  } catch (error) {
    console.error('Error generating client credentials:', error);
    res.status(500).json({ error: 'An unexpected error occurred while generating client credentials. Please try again later.' });
  }
};

exports.submitContactForm = async (req, res) => {
  console.log('submitContactForm function called');
  try {
    const { name, email, message } = req.body;
    console.log('Received form data:', { name, email, message });
    
    // Save to database
    const newMessage = new ContactMessage({ name, email, message });
    await newMessage.save();

    // Send notification email to admin
    await transporter.sendMail({
      from: email, // User's email as the sender
      to: process.env.ADMIN_EMAIL,
      subject: 'New Contact Form Submission',
      html: `<html><body>
        <h2>New contact form submission:</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong> ${message}</p>
      </body></html>`
    });

    // Send confirmation email to user
    await transporter.sendMail({
      from: process.env.ADMIN_EMAIL, // Admin email as the sender
      to: email,
      subject: 'Thank you for contacting NeXTerChat API',
      html: `<html><body>
        <p>Dear ${name},</p>
        <p>Thank you for reaching out to us. We have received your message and will get back to you as soon as possible.</p>
        <p>Best regards,<br>The NeXTerChat API Team</p>
      </body></html>`
    });

    res.status(201).json({ message: 'Your message has been received and stored successfully. We will contact you soon.' });
  } catch (error) {
    console.error('Error in submitContactForm:', error);
    res.status(500).json({ error: 'An error occurred while processing your message. Please try again later.' });
  }
};

exports.getCredits = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('credits');
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all usage statistics and admin grant in parallel for better performance
    const [todayFreeUsed, purchasedUsed, grantedUsed, adminGrant] = await Promise.all([
      Execution.countDocuments({
        user: user._id,
        createdAt: { $gte: today },
        creditSource: 'free'
      }),
      Execution.countDocuments({
        user: user._id,
        creditSource: 'purchased'
      }),
      Execution.countDocuments({
        user: user._id,
        creditSource: 'granted'
      }),
      AdminGrant.findOne({ user: user._id }).sort({ createdAt: -1 })
    ]);

    const response = {
      success: true,
      data: {
        planCredits: {
          total: user.credits?.free || 15,
          used: todayFreeUsed,
          remaining: Math.max(0, (user.credits?.free || 15) - todayFreeUsed)
        },
        purchasedCredits: {
          total: user.credits?.purchased || 0,
          used: purchasedUsed,
          remaining: Math.max(0, (user.credits?.purchased || 0) - purchasedUsed)
        }
      }
    };

    // Only add granted credits if they exist and were granted
    if (adminGrant && user.credits?.granted > 0) {
      response.data.grantedCredits = {
        total: user.credits.granted,
        used: grantedUsed,
        remaining: Math.max(0, user.credits.granted - grantedUsed),
        lastGrantDate: adminGrant.createdAt
      };
    }

    // Calculate totals
    const totalCredits = response.data.planCredits.total + 
                        response.data.purchasedCredits.total + 
                        (response.data.grantedCredits?.total || 0);

    const totalUsed = response.data.planCredits.used + 
                     response.data.purchasedCredits.used + 
                     (response.data.grantedCredits?.used || 0);

    response.data.totals = {
      total: totalCredits,
      used: totalUsed,
      remaining: Math.max(0, totalCredits - totalUsed)
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Error in getCredits:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch credits information',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

console.log('ELASTIC_EMAIL_USER:', process.env.ELASTIC_EMAIL_USER);
console.log('ELASTIC_EMAIL_PASSWORD:', process.env.ELASTIC_EMAIL_PASSWORD ? 'Set' : 'Not set');
console.log('ADMIN_EMAIL:', process.env.ADMIN_EMAIL);

