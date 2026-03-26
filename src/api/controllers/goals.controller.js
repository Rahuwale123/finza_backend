const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getGoals = async (req, res) => {
  try {
    const userId = req.user.id;
    const goals = await prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    // Link currentAmount with Saving Account balance
    const savingAccount = await prisma.bankAccount.findFirst({
      where: { userId, accountName: 'Saving Account' }
    });

    const balance = savingAccount ? savingAccount.balance : 0;

    // Map goals to use the actual saving account balance as current progress
    const linkedGoals = goals.map(goal => ({
      ...goal,
      currentAmount: balance
    }));

    res.json(linkedGoals);
  } catch (error) {
    console.error('Get Goals Error:', error);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
};

const createGoal = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, targetAmount, currentAmount, category, color, icon } = req.body;

    const goal = await prisma.goal.create({
      data: {
        userId,
        title,
        targetAmount: parseFloat(targetAmount),
        currentAmount: parseFloat(currentAmount || 0),
        category,
        color,
        icon,
      },
    });
    res.status(201).json(goal);
  } catch (error) {
    console.error('Create Goal Error:', error);
    res.status(500).json({ error: 'Failed to create goal' });
  }
};

const updateGoal = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { title, targetAmount, currentAmount, category, color, icon } = req.body;

    // Ensure goal belongs to user
    const existingGoal = await prisma.goal.findUnique({
      where: { id },
    });

    if (!existingGoal || existingGoal.userId !== userId) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const goal = await prisma.goal.update({
      where: { id },
      data: {
        title,
        targetAmount: targetAmount !== undefined ? parseFloat(targetAmount) : undefined,
        currentAmount: currentAmount !== undefined ? parseFloat(currentAmount) : undefined,
        category,
        color,
        icon,
      },
    });
    res.json(goal);
  } catch (error) {
    console.error('Update Goal Error:', error);
    res.status(500).json({ error: 'Failed to update goal' });
  }
};

const deleteGoal = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Ensure goal belongs to user
    const existingGoal = await prisma.goal.findUnique({
      where: { id },
    });

    if (!existingGoal || existingGoal.userId !== userId) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    await prisma.goal.delete({
      where: { id },
    });
    res.json({ message: 'Goal deleted successfully' });
  } catch (error) {
    console.error('Delete Goal Error:', error);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
};

module.exports = {
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal,
};
