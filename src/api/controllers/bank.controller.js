const prisma = require('../../config/db');
const UsageService = require('../../services/usage.service');

exports.getBankAccounts = async (req, res) => {
  try {
    const userId = req.user.id;
    const accounts = await prisma.bankAccount.findMany({
      where: { userId }
    });

    res.status(200).json(accounts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createBankAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check usage limit for FREE tier
    const canAdd = await UsageService.canAddBank(userId);
    if (!canAdd.allowed) {
      return res.status(403).json({ message: canAdd.message, limitReached: true });
    }

    const { accountName, accountNumber, bankName, balance } = req.body;
    
    const account = await prisma.bankAccount.create({
      data: {
        userId,
        accountName,
        accountNumber: accountNumber || '',
        bankName,
        balance: parseFloat(balance || 0)
      }
    });
    
    res.status(201).json(account);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateBankAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { accountName, accountNumber, bankName, balance } = req.body;

    const account = await prisma.bankAccount.updateMany({
      where: { id, userId },
      data: {
        accountName,
        accountNumber,
        bankName,
        balance: balance !== undefined ? parseFloat(balance) : undefined
      }
    });

    if (account.count === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const updatedAccount = await prisma.bankAccount.findUnique({ where: { id } });
    res.status(200).json(updatedAccount);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteBankAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if there are transactions linked to this account
    const transactionCount = await prisma.transaction.count({
      where: { bankAccountId: id }
    });

    if (transactionCount > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete account with existing transactions' 
      });
    }

    const result = await prisma.bankAccount.deleteMany({
      where: { id, userId }
    });

    if (result.count === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }

    res.status(200).json({ message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
