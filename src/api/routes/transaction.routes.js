const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transaction.controller');
const { protect } = require('../middleware/auth.middleware');

router.get('/', protect, transactionController.getTransactions);
router.post('/', protect, transactionController.createTransaction);
router.get('/summary', protect, transactionController.getDashboardSummary);
router.get('/insights', protect, transactionController.getInsightsData);

module.exports = router;
