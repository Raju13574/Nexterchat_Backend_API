const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const dotenv = require('dotenv');
const validateRoutes = require('./middleware/routeValidator');
const path = require('path');
const analyticsRoutes = require('./routes/analyticsRoutes');

// Add swagger options
const swaggerOptions = {
  explorer: true,
  swaggerOptions: {
    url: '/swagger.json'
  },
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "Code Compiler API Documentation"
};

// Import routes
const adminRoutes = require('./routes/adminRoutes');
const requestRoutes = require('./routes/requestRoutes');
const userRoutes = require('./routes/userRoutes');
const executionRoutes = require('./routes/executionRoutes');
const walletRoutes = require('./routes/walletRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const authRoutes = require('./routes/auth');
const creditRoutes = require('./routes/creditRoutes');
const usageRoutes = require('./routes/usageRoutes');
const contactRoutes = require('./routes/contactRoutes');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const { checkSubscriptionMiddleware } = require('./middleware/subscriptionMiddleware');
const { auth } = require('./middleware/auth');

dotenv.config();
const app = express();

// CORS configuration
const corsOptions = {
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Logging middleware
app.use((req, res, next) => {
  console.log(`Received ${req.method} request to ${req.path}`);
  next();
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB successfully'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/execute', executionRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/analytics', analyticsRoutes);

// Serve Swagger documentation
app.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerDocument);
});

app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', swaggerUi.setup(swaggerDocument, swaggerOptions));

// Debug route to check registered routes
app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach(handler => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });
  res.json(routes);
});

// Error handling middleware
app.use(errorHandler);

// Single catch-all route for unmatched routes
app.use((req, res) => {
  console.log(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Not Found' });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Debug route to check registered routes
app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach(handler => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });
  res.json(routes);
});

// Debug: Log all users in the database
const User = require('./models/User');
mongoose.connection.once('open', async () => {
  try {
    const users = await User.find({});
    console.log('All users in database:', users);
  } catch (err) {
    console.error('Error fetching users:', err);
  }
});

// Add a simple API endpoint to check users
app.get('/api/check-users', async (req, res) => {
  try {
    const users = await User.find({});
    res.json({ users });
  } catch (error) {
    console.error('Error checking users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set up MongoDB connection listeners
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

require('./cron/subscriptionRenewal');
require('./cron/applyPromotions');
require('./cron/cleanupPromotions');

module.exports = app;
