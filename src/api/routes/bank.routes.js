const express = require('express');
const router = express.Router();
const bankController = require('../controllers/bank.controller');
const { protect } = require('../middleware/auth.middleware');

router.get('/', protect, bankController.getBankAccounts);
router.post('/', protect, bankController.createBankAccount);
router.put('/:id', protect, bankController.updateBankAccount);
router.delete('/:id', protect, bankController.deleteBankAccount);

module.exports = router;
