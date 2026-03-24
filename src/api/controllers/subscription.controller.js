const prisma = require('../../config/db');

exports.getSubscriptionStatus = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
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
    const { type } = req.body; // Only 'MONTHLY' is supported now
    if (type !== 'MONTHLY' && type !== 'FREE') {
      return res.status(400).json({ message: 'Only monthly plan is available' });
    }

    let expiryDate = null;
    if (type === 'MONTHLY') {
      const now = new Date();
      expiryDate = new Date(now.setMonth(now.getMonth() + 1));
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        subscriptionType: type,
        subscriptionExpiry: expiryDate
      }
    });

    res.status(200).json({
      message: type === 'FREE' ? 'Subscription cancelled' : 'Successfully upgraded to Monthly plan!',
      subscriptionType: user.subscriptionType,
      subscriptionExpiry: user.subscriptionExpiry
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.verifyPurchase = async (req, res) => {
  try {
    const { purchaseToken, productId } = req.body;
    console.log(`[SUBSCRIPTION] Verification request: Product=${productId}, Token=${purchaseToken.substring(0, 15)}...`);
    
    if (!purchaseToken) {
      console.log('[SUBSCRIPTION] FAILED: Missing token');
      return res.status(400).json({ message: 'Purchase token is required' });
    }

    console.log(`[SUBSCRIPTION] Upgrading user ${req.user.id} to MONTHLY...`);

    // Default all purchases to MONTHLY for now
    const now = new Date();
    const expiryDate = new Date(now.setMonth(now.getMonth() + 1));

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        subscriptionType: 'MONTHLY',
        subscriptionExpiry: expiryDate
      }
    });

    res.status(200).json({
      success: true,
      message: 'Monthly subscription activated!',
      subscriptionType: user.subscriptionType,
      subscriptionExpiry: user.subscriptionExpiry
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

