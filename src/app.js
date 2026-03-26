const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const authRoutes = require('./api/routes/auth.routes');
const transactionRoutes = require('./api/routes/transaction.routes');
const bankRoutes = require('./api/routes/bank.routes');
const aiRoutes = require('./api/routes/ai.routes');
const subscriptionRoutes = require('./api/routes/subscription.routes');
const goalsRoutes = require('./api/routes/goals.routes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/banks', bankRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/goals', goalsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

module.exports = app;
