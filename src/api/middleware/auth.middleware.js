const jwt = require('jsonwebtoken');
const prisma = require('../../config/db');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          phoneNumber: true,
          email: true,
          name: true,
          subscriptionType: true,
          subscriptionExpiry: true,
        }
      });

      if (!user) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }

      // Calculate isPremium and attach to user object
      const isPremium = (user.phoneNumber === '9356853041') || 
                        (user.subscriptionType !== 'FREE' && 
                         (!user.subscriptionExpiry || user.subscriptionExpiry > new Date()));

      req.user = {
        ...user,
        isPremium
      };

      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

module.exports = { protect };
