const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.post('/register/phone', authController.registerPhone);
router.post('/register/email', authController.registerEmail);
router.post('/verify-otp', authController.verifyOtp);

module.exports = router;
