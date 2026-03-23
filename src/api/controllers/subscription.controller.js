const prisma = require('../../config/db');

exports.getSubscriptionStatus = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        subscriptionType: true,
        subscriptionExpiry: true
      }
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    const isPremium = user.subscriptionType !== 'FREE' && 
                     (!user.subscriptionExpiry || user.subscriptionExpiry > new Date());

    res.status(200).json({
      subscriptionType: user.subscriptionType,
      subscriptionExpiry: user.subscriptionExpiry,
      isPremium
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.upgradeSubscription = async (req, res) => {
  try {
    const { type } = req.body; // 'MONTHLY' or 'YEARLY'
    if (!['MONTHLY', 'YEARLY', 'FREE'].includes(type)) {
      return res.status(400).json({ message: 'Invalid subscription type' });
    }

    let expiryDate = null;
    const now = new Date();
    if (type === 'MONTHLY') {
      expiryDate = new Date(now.setMonth(now.getMonth() + 1));
    } else if (type === 'YEARLY') {
      expiryDate = new Date(now.setFullYear(now.getFullYear() + 1));
    }

    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        subscriptionType: type,
        subscriptionExpiry: expiryDate
      }
    });

    res.status(200).json({
      message: `Successfully upgraded to ${type} plan!`,
      subscriptionType: user.subscriptionType,
      subscriptionExpiry: user.subscriptionExpiry
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.verifyPurchase = async (req, res) => {
  try {
    const { purchaseToken, productId, type } = req.body;
    
    // NOTE: In a real app, you would verify this token with Google Play Developer API
    // const googlePlay = new GooglePlayDeveloperApi(...);
    // const isValid = await googlePlay.verify(purchaseToken);
    
    // For demo/dev, we'll assume it's valid if token is provided
    if (!purchaseToken) {
      return res.status(400).json({ message: 'Purchase token is required' });
    }

    let expiryDate = null;
    const now = new Date();
    if (type === 'MONTHLY' || productId.toLowerCase().includes('monthly')) {
      expiryDate = new Date(now.setMonth(now.getMonth() + 1));
    } else if (type === 'YEARLY' || productId.toLowerCase().includes('yearly')) {
      expiryDate = new Date(now.setFullYear(now.getFullYear() + 1));
    }

    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        subscriptionType: type || (productId.toLowerCase().includes('yearly') ? 'YEARLY' : 'MONTHLY'),
        subscriptionExpiry: expiryDate
      }
    });

    res.status(200).json({
      success: true,
      message: 'Purchase verified successfully!',
      subscriptionType: user.subscriptionType,
      subscriptionExpiry: user.subscriptionExpiry
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
