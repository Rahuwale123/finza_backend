const prisma = require('../../config/db');
const UsageService = require('../../services/usage.service');

exports.createTransaction = async (req, res) => {
  try {
    const { title, amount, category, isExpense, date, bankAccountId, goalId } = req.body;
    const userId = req.user.id;

    if (!bankAccountId) {
      return res.status(400).json({ message: 'A bank account is required for transactions. Please add a bank account first.' });
    }

    // Verify bank account exists and belongs to user
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { id: bankAccountId }
    });

    if (!bankAccount || bankAccount.userId !== userId) {
      return res.status(403).json({ message: 'Invalid bank account or access denied.' });
    }

    // Rule: Negative balance protection (only for expenses/savings)
    if (isExpense && bankAccount.balance < parseFloat(amount)) {
      return res.status(400).json({ message: `Insufficient balance in ${bankAccount.accountName}. Your current balance is ₹${bankAccount.balance}.` });
    }

    // Rule: Received funds (Income) cannot go into "Saving Account"
    // But "Savings" category IS allowed (that's how user adds money to savings)
    if (!isExpense && category !== 'Savings' && bankAccount.accountName === 'Saving Account') {
      return res.status(400).json({ message: 'Only dedicated savings can be added to the Saving Account. Please select a regular bank account for regular income.' });
    }

    // If goalId is provided, verify it exists and belongs to user
    if (goalId) {
      const goal = await prisma.goal.findUnique({
        where: { id: goalId }
      });
      if (!goal || goal.userId !== userId) {
        return res.status(403).json({ message: 'Invalid goal or access denied.' });
      }
    }
    
    // Check usage limit for FREE tier
    const canAdd = await UsageService.canAddTransaction(userId);
    if (!canAdd.allowed) {
      return res.status(403).json({ message: canAdd.message, limitReached: true });
    }
    
    // Use a transaction to create the transaction and update bank balance/goal progress
    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          title,
          amount: parseFloat(amount),
          category,
          isExpense,
          date: date ? new Date(date) : new Date(),
          userId,
          bankAccountId,
          goalId // Link to goal
        }
      });

      // Update bank balance
      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: {
          balance: {
            [isExpense ? 'decrement' : 'increment']: parseFloat(amount)
          }
        }
      });

      // Update goal progress if linked or if it's a "Savings" category
      if (category === 'Savings') {
        await tx.goal.updateMany({
          where: { userId },
          data: {
            currentAmount: {
              increment: parseFloat(amount)
            }
          }
        });
      } else if (goalId) {
        await tx.goal.update({
          where: { id: goalId },
          data: {
            currentAmount: {
              increment: parseFloat(amount)
            }
          }
        });
      }

      // Fetch updated goals for feedback
      const updatedGoals = await tx.goal.findMany({ where: { userId } });

      return { transaction, updatedGoals };
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
    
    const [user, transactions, bankAccounts] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { 
          name: true,
          phoneNumber: true,
          subscriptionType: true,
          subscriptionExpiry: true
        }
      }),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { date: 'desc' }
      }),
      prisma.bankAccount.findMany({
        where: { userId }
      })
    ]);

    const isPremium = UsageService.isUserPremium(user);

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
    const { period = 'month', month, year, week } = req.query;

    let startDate, endDate, prevStartDate, prevEndDate;
    const now = new Date();
    const queryYear = year ? parseInt(year) : now.getFullYear();
    const queryMonth = month ? parseInt(month) : now.getMonth();
    const queryWeek = week ? parseInt(week) : null;

    if (period === 'week') {
      if (queryWeek !== null) {
        // Calculate week of the month (1, 2, 3, 4, 5)
        startDate = new Date(queryYear, queryMonth, (queryWeek - 1) * 7 + 1);
        endDate = new Date(queryYear, queryMonth, queryWeek * 7, 23, 59, 59, 999);
        
        // Cap end date to month end
        const monthEnd = new Date(queryYear, queryMonth + 1, 0, 23, 59, 59, 999);
        if (endDate > monthEnd) endDate = monthEnd;
      } else {
        // Last 7 days (default)
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0,0,0,0);
        endDate = new Date();
      }
      
      prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - 7);
      prevEndDate = new Date(startDate);
      prevEndDate.setHours(23, 59, 59, 999);
    } else if (period === 'year') {
      startDate = new Date(queryYear, 0, 1);
      endDate = (queryYear === now.getFullYear()) ? new Date() : new Date(queryYear, 11, 31, 23, 59, 59);
      
      prevStartDate = new Date(queryYear - 1, 0, 1);
      prevEndDate = new Date(queryYear - 1, 11, 31, 23, 59, 59);
    } else {
      // Month
      startDate = new Date(queryYear, queryMonth, 1);
      endDate = (queryYear === now.getFullYear() && queryMonth === now.getMonth()) 
        ? new Date() 
        : new Date(queryYear, queryMonth + 1, 0, 23, 59, 59);
      
      prevStartDate = new Date(queryYear, queryMonth - 1, 1);
      prevEndDate = new Date(queryYear, queryMonth, 0, 23, 59, 59);
    }

    // Get first transaction year for availableYears
    const oldestTransaction = await prisma.transaction.findFirst({
      where: { userId },
      orderBy: { date: 'asc' },
      select: { date: true }
    });
    
    const startYear = oldestTransaction ? oldestTransaction.date.getFullYear() : now.getFullYear();
    const availableYears = [];
    for (let y = now.getFullYear(); y >= startYear; y--) {
      availableYears.push(y);
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

    // Extraordinary Insight: Top category analysis
    let extraordinaryInsight = "Your spending is balanced across all categories.";
    if (expenseCategoryBreakdown.length > 0) {
      const top = expenseCategoryBreakdown[0];
      if (top.percentage > 40) {
        extraordinaryInsight = `Warning: ${top.category} accounts for over ${top.percentage.toFixed(0)}% of your spending. Consider setting a budget here.`;
      } else {
        extraordinaryInsight = `Insight: ${top.category} is your highest spending category this period. Healthy distribution!`;
      }
    }

    res.status(200).json({
      totalExpenses: currentTotal.toLocaleString('en-IN'),
      totalExpensesRaw: currentTotal,
      totalIncome: currentIncomeTotal.toLocaleString('en-IN'),
      totalIncomeRaw: currentIncomeTotal,
      percentageChange: percentageChange.toFixed(1),
      isUp: currentTotal >= prevTotal,
      periodLabel: period === 'week' ? (queryWeek ? `Week ${queryWeek}` : 'this week') : period === 'year' ? `Year ${queryYear}` : DateFormat(startDate, 'MMMM yyyy'),
      compareLabel: period === 'week' ? 'previous week' : period === 'year' ? 'previous year' : 'previous month',
      expenseCategoryBreakdown,
      incomeCategoryBreakdown,
      extraordinaryInsight,
      availableYears,
      currentYear: queryYear,
      currentMonth: queryMonth
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Helper inside the file since intl might not be there
function DateFormat(date, format) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  if (format === 'MMMM yyyy') {
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  }
  return date.toDateString();
}
