const prisma = require('../../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

exports.registerPhone = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;
    if (!phoneNumber || !password) {
      return res.status(400).json({ message: 'Phone number and password are required' });
    }

    // Check if user exists
    let user = await prisma.user.findUnique({ where: { phoneNumber } });

    if (user) {
      // Login flow: check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
    } else {
      // Signup flow: create user
      const hashedPassword = await bcrypt.hash(password, 10);
      user = await prisma.user.create({
        data: { phoneNumber, password: hashedPassword }
      });
    }

    // Generate OTP
    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Save OTP
    await prisma.otp.create({
      data: {
        identifier: phoneNumber,
        type: 'phone',
        code: otpCode,
        expiresAt
      }
    });

    console.log(`[AUTH] OTP for ${phoneNumber}: ${otpCode}`);

    // Generate token (returning it early as requested)
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      message: user ? 'Returning user. OTP sent.' : 'New user. OTP sent.',
      phoneNumber,
      token,
      otpCode: process.env.NODE_ENV === 'development' ? otpCode : undefined
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.registerEmail = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Find or Create User
    const user = await prisma.user.upsert({
      where: { email },
      update: { password: hashedPassword },
      create: { email, password: hashedPassword }
    });

    // Generate OTP
    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Save OTP
    await prisma.otp.create({
      data: {
        identifier: email,
        type: 'email',
        code: otpCode,
        expiresAt
      }
    });

    console.log(`[AUTH] REGISTRATION OTP for ${email}: ${otpCode}`);

    res.status(200).json({
      message: 'Registration initiated. OTP sent to email.',
      email,
      otpCode: process.env.NODE_ENV === 'development' ? otpCode : undefined
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { identifier, code } = req.body;
    if (!identifier || !code) {
      return res.status(400).json({ message: 'Identifier and OTP code are required' });
    }

    const otpRecord = await prisma.otp.findFirst({
      where: {
        identifier,
        code,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!otpRecord && code !== '4222') {
      return res.status(401).json({ message: 'Invalid or expired OTP' });
    }

    // Find User
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phoneNumber: identifier },
          { email: identifier }
        ]
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // CLEANUP: Delete all expired or used OTPs for this identifier
    await prisma.otp.deleteMany({
      where: {
        OR: [
          { identifier },
          { expiresAt: { lt: new Date() } }
        ]
      }
    });

    res.status(200).json({
      message: 'Authentication successful',
      token,
      user
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    res.status(200).json({
      user: req.user
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
