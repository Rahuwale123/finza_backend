const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/register/phone', authController.registerPhone);
router.post('/register/email', authController.registerEmail);
router.post('/verify-otp', authController.verifyOtp);

router.get('/me', protect, authController.getMe);
router.put('/profile', protect, authController.updateProfile);

module.exports = router;
