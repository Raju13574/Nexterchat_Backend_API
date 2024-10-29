const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');

exports.authenticateUser = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      throw new Error('No token provided');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      throw new Error('User not found');
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Please authenticate' });
  }
};

exports.authenticateAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization').replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findOne({ _id: decoded.id, isAdmin: true });

    if (!admin) {
      throw new Error();
    }

    req.token = token;
    req.user = admin;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Please authenticate as admin' });
  }
};

exports.protect = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let user = await User.findById(decoded.id);
    if (!user) {
      user = await Admin.findById(decoded.id);
      if (!user) {
        return res.status(401).json({ error: 'Token is not valid' });
      }
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is not valid' });
  }
};

exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized to access this route' });
    }
    next();
  };
};

exports.subscribe = async (req, res) => {
  try {
    const { plan_id } = req.params;
    const userId = req.user._id;

    const plan = plans.find(p => p.id === plan_id);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.walletBalance >= plan.price) {
      // Deduct from wallet
      user.walletBalance -= plan.price;
      // Create subscription
      const subscription = new Subscription({
        user: userId,
        plan: plan_id,
        startDate: new Date(),
        endDate: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000),
        creditsPerDay: plan.creditsPerDay || (plan.creditsPerMonth / 30),
        active: true
      });
      await subscription.save();
      await user.save();
      res.json({ message: 'Subscription successful', subscription });
    } else {
      // Redirect to Razorpay
      const order = await createRazorpayOrder(plan.price);
      res.json({ message: 'Insufficient wallet balance', razorpayOrder: order });
    }
  } catch (error) {
    res.status(500).json({ error: 'Subscription failed', details: error.message });
  }
};

// Add this new middleware function
exports.requireAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findOne({ _id: decoded.id, isAdmin: true });

    if (!admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = admin;
    req.token = token;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Please authenticate as admin' });
  }
};

// Add this new middleware function
exports.requireAdminOrUser = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Try to find admin first
    let user = await Admin.findOne({ _id: decoded.id, isAdmin: true });
    
    // If not admin, try to find regular user
    if (!user) {
      user = await User.findById(decoded.id);
      if (!user) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Please authenticate' });
  }
};
