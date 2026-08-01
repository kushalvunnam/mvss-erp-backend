const express = require('express');
const Expense = require('../models/Expense');
const { auth, restrictTo } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const router = express.Router();

router.use((req, res, next) => {
  console.log(`[EXPENSES] Route request received: ${req.method} ${req.baseUrl}${req.path}`);
  next();
});

// Auto-generate Expense ID: EXP-YYYYMM-0001
const generateExpenseId = async () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const dateStr = `${year}${month}`;

  const count = await Expense.countDocuments();
  const sequence = String(count + 1).padStart(4, '0');
  return `EXP-${dateStr}-${sequence}`;
};

router.use(auth, restrictTo('Admin', 'Accounts', 'Service', 'Spares'));

// GET /api/expenses - List expenses with filters and summary statistics
router.get('/', async (req, res) => {
  console.log('[EXPENSES] GET request received');
  try {
    const { fromDate, toDate, expenseType, paymentMode, status, search } = req.query;
    let query = {};

    if (expenseType) query.expenseType = expenseType;
    if (paymentMode) query.paymentMode = paymentMode;
    if (status) query.status = status;

    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) {
        const start = new Date(fromDate);
        start.setHours(0, 0, 0, 0);
        query.date.$gte = start;
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    if (search) {
      const sLower = search.trim();
      query.$or = [
        { expenseId: { $regex: sLower, $options: 'i' } },
        { description: { $regex: sLower, $options: 'i' } },
        { paidTo: { $regex: sLower, $options: 'i' } },
        { referenceNo: { $regex: sLower, $options: 'i' } },
        { expenseType: { $regex: sLower, $options: 'i' } },
        { enteredBy: { $regex: sLower, $options: 'i' } }
      ];
    }

    const expenses = await Expense.find(query).sort({ date: -1, createdAt: -1 });

    // Fetch all expenses to compute dashboard summary metrics
    const allExpenses = await Expense.find();

    const roundToTwo = num => Math.round(((num || 0) + Number.EPSILON) * 100) / 100;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let todayExpense = 0;
    let weekExpense = 0;
    let monthExpense = 0;
    let totalExpenseSum = 0;
    let pendingCount = 0;
    let pendingAmount = 0;

    allExpenses.forEach(exp => {
      const amt = Number(exp.amount) || 0;
      const expDate = new Date(exp.date || exp.createdAt);

      totalExpenseSum += amt;

      if (expDate >= startOfToday) {
        todayExpense += amt;
      }
      if (expDate >= startOfWeek) {
        weekExpense += amt;
      }
      if (expDate >= startOfMonth) {
        monthExpense += amt;
      }
      if (exp.status === 'Pending') {
        pendingCount += 1;
        pendingAmount += amt;
      }
    });

    // Compute summary metrics for filtered report list
    let totalCashExpense = 0;
    let totalOnlineExpense = 0;
    let grandTotalExpense = 0;

    expenses.forEach(exp => {
      const amt = Number(exp.amount) || 0;
      grandTotalExpense += amt;
      if (exp.paymentMode === 'Cash') {
        totalCashExpense += amt;
      } else {
        totalOnlineExpense += amt;
      }
    });

    console.log('[EXPENSES] Expenses returned');
    res.json({
      success: true,
      expenses,
      data: expenses,
      summary: {
        todayExpense: roundToTwo(todayExpense),
        weekExpense: roundToTwo(weekExpense),
        monthExpense: roundToTwo(monthExpense),
        totalExpenses: roundToTwo(totalExpenseSum),
        pendingPayments: roundToTwo(pendingAmount),
        pendingCount,
        // Report filtered summary
        totalCashExpense: roundToTwo(totalCashExpense),
        totalOnlineExpense: roundToTwo(totalOnlineExpense),
        grandTotalExpense: roundToTwo(grandTotalExpense),
        count: expenses.length
      }
    });
  } catch (error) {
    console.error('[EXPENSES] Database error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch expenses: ' + error.message });
  }
});

// GET /api/expenses/:id - Single expense details
router.get('/:id', async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, error: 'Expense record not found.' });
    }
    res.json({ success: true, expense });
  } catch (error) {
    console.error('[EXPENSES] Database error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch expense: ' + error.message });
  }
});

// POST /api/expenses - Create new expense record
router.post('/', async (req, res) => {
  try {
    const { date, expenseType, description, amount, paymentMode, paidTo, referenceNo, remarks, status } = req.body;

    if (!date) {
      return res.status(400).json({ success: false, error: 'Date is mandatory.' });
    }
    if (!expenseType || !expenseType.trim()) {
      return res.status(400).json({ success: false, error: 'Expense Type is mandatory.' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, error: 'Description is mandatory.' });
    }
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be greater than zero.' });
    }
    if (!paymentMode) {
      return res.status(400).json({ success: false, error: 'Payment Mode is mandatory.' });
    }

    const expenseId = await generateExpenseId();
    const enteredBy = req.user ? (req.user.name || req.user.email || 'Staff') : 'Staff';

    const expense = new Expense({
      expenseId,
      date: new Date(date),
      expenseType: expenseType.trim(),
      description: description.trim(),
      amount: parsedAmount,
      paymentMode,
      paidTo: paidTo ? paidTo.trim() : '',
      referenceNo: referenceNo ? referenceNo.trim() : '',
      remarks: remarks ? remarks.trim() : '',
      enteredBy,
      status: status || 'Paid'
    });

    await expense.save();
    await logAction(req.user, 'EXPENSE_CREATE', `Added expense ${expense.expenseId} (${expense.expenseType} - ₹${expense.amount})`, req);
    res.status(201).json({ success: true, expense });
  } catch (error) {
    console.error('[EXPENSES] Database error:', error);
    res.status(400).json({ success: false, error: 'Failed to record expense: ' + error.message });
  }
});

// PUT /api/expenses/:id - Update expense record
router.put('/:id', async (req, res) => {
  try {
    const { amount, expenseType, description, paymentMode, date } = req.body;

    if (amount !== undefined) {
      const parsedAmount = Number(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ success: false, error: 'Amount must be greater than zero.' });
      }
    }
    if (expenseType !== undefined && (!expenseType || !expenseType.trim())) {
      return res.status(400).json({ success: false, error: 'Expense Type cannot be empty.' });
    }
    if (description !== undefined && (!description || !description.trim())) {
      return res.status(400).json({ success: false, error: 'Description cannot be empty.' });
    }
    if (paymentMode !== undefined && !paymentMode) {
      return res.status(400).json({ success: false, error: 'Payment Mode cannot be empty.' });
    }

    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, error: 'Expense record not found.' });
    }

    if (date) expense.date = new Date(date);
    if (expenseType) expense.expenseType = expenseType.trim();
    if (description) expense.description = description.trim();
    if (amount !== undefined) expense.amount = Number(amount);
    if (paymentMode) expense.paymentMode = paymentMode;
    if (req.body.paidTo !== undefined) expense.paidTo = req.body.paidTo.trim();
    if (req.body.referenceNo !== undefined) expense.referenceNo = req.body.referenceNo.trim();
    if (req.body.remarks !== undefined) expense.remarks = req.body.remarks.trim();
    if (req.body.status) expense.status = req.body.status;

    await expense.save();
    await logAction(req.user, 'EXPENSE_UPDATE', `Updated expense ${expense.expenseId}`, req);
    res.json({ success: true, expense });
  } catch (error) {
    console.error('[EXPENSES] Database error:', error);
    res.status(400).json({ success: false, error: 'Failed to update expense: ' + error.message });
  }
});

// DELETE /api/expenses/:id - Delete expense record
router.delete('/:id', restrictTo('Admin', 'Accounts'), async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, error: 'Expense record not found.' });
    }

    await Expense.findByIdAndDelete(req.params.id);
    await logAction(req.user, 'EXPENSE_DELETE', `Deleted expense ${expense.expenseId} (${expense.description})`, req);
    res.json({ success: true, message: 'Expense deleted successfully.' });
  } catch (error) {
    console.error('[EXPENSES] Database error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete expense: ' + error.message });
  }
});

module.exports = router;
