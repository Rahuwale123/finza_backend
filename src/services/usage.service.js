const prisma = require('../config/db');

class UsageService {
  /**
   * Check if user can add a new transaction (Limit: 3/day for FREE)
   */
  static async canAddTransaction(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionType: true, subscriptionExpiry: true }
    });

    const isPremium = user?.subscriptionType !== 'FREE' && 
                     (!user?.subscriptionExpiry || user?.subscriptionExpiry > new Date());
    
    if (isPremium) return { allowed: true };

    // Count today's transactions
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const count = await prisma.transaction.count({
      where: {
        userId,
        createdAt: { gte: startOfToday }
      }
    });

    if (count >= 3) {
      return { 
        allowed: false, 
        message: 'Daily limit reached. Free users can add only 3 transactions per day. Upgrade to Premium for unlimited tracking!' 
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can ask AI (Limit: 2/day for FREE)
   */
  static async canAskAi(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionType: true, subscriptionExpiry: true }
    });

    const isPremium = user?.subscriptionType !== 'FREE' && 
                     (!user?.subscriptionExpiry || user?.subscriptionExpiry > new Date());
    
    if (isPremium) return { allowed: true };

    // Count today's AI messages (user queries only)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const count = await prisma.aiMessage.count({
      where: {
        userId,
        isUser: true,
        createdAt: { gte: startOfToday }
      }
    });

    if (count >= 2) {
      return { 
        allowed: false, 
        message: 'Daily AI limit reached. Free users can ask 2 questions per day. Upgrade to Premium for unlimited AI advice!' 
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can add a bank account (Limit: 1 for FREE)
   */
  static async canAddBank(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionType: true, subscriptionExpiry: true }
    });

    const isPremium = user?.subscriptionType !== 'FREE' && 
                     (!user?.subscriptionExpiry || user?.subscriptionExpiry > new Date());
    
    if (isPremium) return { allowed: true };

    const count = await prisma.bankAccount.count({
      where: { userId }
    });

    if (count >= 1) {
      return { 
        allowed: false, 
        message: 'Bank account limit reached. Free users can add only 1 bank account. Upgrade to Premium for multi-bank support!' 
      };
    }

    return { allowed: true };
  }

  /**
   * Log AI message usage
   */
  static async logAiUsage(userId, content, isUser = true) {
    await prisma.aiMessage.create({
      data: { userId, content, isUser }
    });
  }
}

module.exports = UsageService;
