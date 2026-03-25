const prisma = require('../../config/db');
const UsageService = require('../../services/usage.service');

exports.createTransaction = async (req, res) => {
  try {
    const { title, amount, category, isExpense, date, bankAccountId } = req.body;
    const userId = req.user.id;
    
    // Check usage limit for FREE tier
    const canAdd = await UsageService.canAddTransaction(userId);
    if (!canAdd.allowed) {
      return res.status(403).json({ message: canAdd.message, limitReached: true });
    }
    
    // Use a transaction to create the transaction and update bank balance
    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          title,
          amount: parseFloat(amount),
          category,
          isExpense,
          date: date ? new Date(date) : new Date(),
          userId,
          bankAccountId: bankAccountId || null
        }
      });

      if (bankAccountId) {
        await tx.bankAccount.update({
          where: { id: bankAccountId },
          data: {
            balance: {
              [isExpense ? 'decrement' : 'increment']: parseFloat(amount)
            }
          }
        });
      }

      return transaction;
    });

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [transactions, totalCount] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: req.user.id },
        orderBy: { date: 'desc' },
        skip,
        take: limit
      }),
      prisma.transaction.count({
        where: { userId: req.user.id }
      })
    ]);

    res.status(200).json({
      transactions,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNextPage: skip + transactions.length < totalCount
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getDashboardSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        name: true,
        subscriptionType: true,
        subscriptionExpiry: true
      }
    });

    const isPremium = user?.subscriptionType !== 'FREE' && 
                     (!user?.subscriptionExpiry || user?.subscriptionExpiry > new Date());

    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: 'desc' }
    });

    const bankAccounts = await prisma.bankAccount.findMany({
      where: { userId }
    });

    const totalBalance = bankAccounts.reduce((sum, b) => sum + b.balance, 0);
    const totalSpent = transactions.filter(t => t.isExpense).reduce((sum, t) => sum + t.amount, 0);
    const totalReceived = transactions.filter(t => !t.isExpense).reduce((sum, t) => sum + t.amount, 0);

    res.status(200).json({
      userName: user?.name || 'User',
      subscriptionType: user?.subscriptionType || 'FREE',
      isPremium,
      totalBalance: totalBalance.toLocaleString('en-IN'),
      spentAmount: totalSpent.toLocaleString('en-IN'),
      receivedAmount: totalReceived.toLocaleString('en-IN'),
      recentTransactions: transactions.slice(0, 5).map(t => ({
        ...t,
        amountFormatted: `${t.isExpense ? '- ' : '+ '}₹ ${t.amount.toLocaleString('en-IN')}`
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getInsightsData = async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = 'month' } = req.query;

    let startDate, endDate, prevStartDate, prevEndDate;
    const now = new Date();

    if (period === 'week') {
      // Last 7 days
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      endDate = new Date();
      
      prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - 7);
      prevEndDate = new Date(startDate);
    } else if (period === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date();
      
      prevStartDate = new Date(now.getFullYear() - 1, 0, 1);
      prevEndDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
    } else {
      // Month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date();
      
      prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    }

    const currentExpenses = await prisma.transaction.findMany({
      where: {
        userId,
        isExpense: true,
        date: { gte: startDate, lte: endDate }
      }
    });

    const currentIncome = await prisma.transaction.findMany({
      where: {
        userId,
        isExpense: false,
        date: { gte: startDate, lte: endDate }
      }
    });

    const prevExpensesAgg = await prisma.transaction.aggregate({
      where: {
        userId,
        isExpense: true,
        date: { gte: prevStartDate, lte: prevEndDate }
      },
      _sum: { amount: true }
    });

    const currentTotal = currentExpenses.reduce((sum, t) => sum + t.amount, 0);
    const prevTotal = prevExpensesAgg._sum.amount || 0;
    const currentIncomeTotal = currentIncome.reduce((sum, t) => sum + t.amount, 0);

    let percentageChange = 0;
    if (prevTotal > 0) {
      percentageChange = Math.abs(((currentTotal - prevTotal) / prevTotal) * 100);
    } else if (currentTotal > 0) {
      percentageChange = 100;
    }

    const expenseCategoryMap = {};
    currentExpenses.forEach(t => {
      expenseCategoryMap[t.category] = (expenseCategoryMap[t.category] || 0) + t.amount;
    });

    const incomeCategoryMap = {};
    currentIncome.forEach(t => {
      incomeCategoryMap[t.category] = (incomeCategoryMap[t.category] || 0) + t.amount;
    });

    const expenseCategoryBreakdown = Object.keys(expenseCategoryMap).map(category => ({
      category,
      amount: expenseCategoryMap[category],
      amountFormatted: `₹ ${expenseCategoryMap[category].toLocaleString('en-IN')}`,
      percentage: currentTotal > 0 ? (expenseCategoryMap[category] / currentTotal) * 100 : 0
    })).sort((a, b) => b.amount - a.amount);

    const incomeCategoryBreakdown = Object.keys(incomeCategoryMap).map(category => ({
      category,
      amount: incomeCategoryMap[category],
      amountFormatted: `₹ ${incomeCategoryMap[category].toLocaleString('en-IN')}`,
      percentage: currentIncomeTotal > 0 ? (incomeCategoryMap[category] / currentIncomeTotal) * 100 : 0
    })).sort((a, b) => b.amount - a.amount);

    res.status(200).json({
      totalExpenses: currentTotal.toLocaleString('en-IN'),
      totalExpensesRaw: currentTotal,
      totalIncome: currentIncomeTotal.toLocaleString('en-IN'),
      totalIncomeRaw: currentIncomeTotal,
      percentageChange: percentageChange.toFixed(1),
      isUp: currentTotal >= prevTotal,
      periodLabel: period === 'week' ? 'this week' : period === 'year' ? 'this year' : 'this month',
      compareLabel: period === 'week' ? 'last week' : period === 'year' ? 'last year' : 'last month',
      expenseCategoryBreakdown,
      incomeCategoryBreakdown
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
