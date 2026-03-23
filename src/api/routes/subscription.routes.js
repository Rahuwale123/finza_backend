const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { protect } = require('../middleware/auth.middleware');

router.get('/status', protect, subscriptionController.getSubscriptionStatus);
router.post('/upgrade', protect, subscriptionController.upgradeSubscription);
router.post('/verify-purchase', protect, subscriptionController.verifyPurchase);

module.exports = router;
