const express = require('express');
const StockAdjustment = require('../models/StockAdjustment');
const Inventory = require('../models/Inventory');
const { auth, restrictTo } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const router = express.Router();

router.use((req, res, next) => {
  console.log(`[ADJUSTMENTS] Route request received: ${req.method} ${req.baseUrl}${req.path}`);
  next();
});

// Auto-generate Adjustment Number
const generateAdjustmentNo = async () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const dateStr = `${year}${month}`;
  
  const count = await StockAdjustment.countDocuments();
  const sequence = String(count + 1).padStart(4, '0');
  return `ADJ-${dateStr}-${sequence}`;
};

router.use(auth, restrictTo('Admin', 'Spares'));

// List stock adjustments with search & type filter (with pagination)
router.get('/', async (req, res) => {
  try {
    const { search, type, status } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    let query = {};

    if (type) query.type = type;
    if (status) query.status = status;

    if (search) {
      query.$or = [
        { adjustmentNo: { $regex: search, $options: 'i' } },
        { partNumber: { $regex: search, $options: 'i' } },
        { partName: { $regex: search, $options: 'i' } },
        { reason: { $regex: search, $options: 'i' } },
        { createdBy: { $regex: search, $options: 'i' } }
      ];
    }

    const totalCount = await StockAdjustment.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    const adjustments = await StockAdjustment.find(query)
      .populate('partId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    if (!req.query.page && !req.query.limit) {
      res.send(adjustments);
    } else {
      res.send({
        adjustments,
        currentPage: page,
        totalPages,
        totalAdjustments: totalCount
      });
    }
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch stock adjustments.' });
  }
});

// Create Stock Adjustment (Automatically updates inventory stock if status is Approved)
router.post('/', async (req, res) => {
  try {
    const { partId, type, qty, reason, comments, reference } = req.body;
    if (!partId || !type || !qty || !reason) {
      return res.status(400).send({ error: 'Part ID, Adjustment Type, Quantity, and Reason are required.' });
    }

    const item = await Inventory.findById(partId);
    if (!item) return res.status(404).send({ error: 'Part not found.' });

    const adjustmentNo = await generateAdjustmentNo();
    const currentQty = Number(item.stockQuantity) || 0;
    const adjustQty = Number(qty);

    let newQty = currentQty;
    if (type === 'Stock Increase' || type === 'Returned Items') {
      newQty = currentQty + adjustQty;
    } else {
      // Decrease, Damaged, Missing, Manual Correction
      if (adjustQty > currentQty) {
        return res.status(400).send({ error: `Cannot decrease ${adjustQty} units. Current stock is ${currentQty}.` });
      }
      newQty = currentQty - adjustQty;
    }

    const createdBy = req.user ? req.user.name : 'Staff';
    const status = (req.user && req.user.role === 'Admin') ? 'Approved' : 'Pending';

    const adjustment = new StockAdjustment({
      adjustmentNo,
      partId: item._id,
      partNumber: item.partNumber,
      partName: item.partName,
      type,
      qty: adjustQty,
      previousStock: currentQty,
      newStock: newQty,
      reference: reference || '',
      reason,
      comments: comments || '',
      createdBy,
      status,
      approvedBy: status === 'Approved' ? createdBy : '',
      approvedAt: status === 'Approved' ? new Date() : null
    });

    await adjustment.save();

    // If approved, update inventory item stock immediately
    if (status === 'Approved') {
      item.stockQuantity = newQty;
      await item.save();
      await logAction(req.user, 'STOCK_ADJUSTMENT', `Adjusted stock for ${item.partName} (${type}: ${adjustQty}). New Stock: ${newQty}`, req);
    }

    res.status(201).send(adjustment);
  } catch (error) {
    res.status(400).send({ error: 'Failed to create stock adjustment: ' + error.message });
  }
});

// Approve Pending Adjustment (Admin Only)
router.put('/:id/approve', restrictTo('Admin'), async (req, res) => {
  try {
    const adjustment = await StockAdjustment.findById(req.params.id);
    if (!adjustment) return res.status(404).send({ error: 'Adjustment not found.' });

    if (adjustment.status !== 'Pending') {
      return res.status(400).send({ error: `Adjustment is already ${adjustment.status}.` });
    }

    const item = await Inventory.findById(adjustment.partId);
    if (!item) return res.status(404).send({ error: 'Part no longer exists.' });

    // Re-verify stock for decrease
    if (adjustment.type !== 'Stock Increase' && adjustment.type !== 'Returned Items') {
      if (adjustment.qty > item.stockQuantity) {
        return res.status(400).send({ error: `Cannot approve. Stock current quantity (${item.stockQuantity}) is less than required adjustment quantity (${adjustment.qty}).` });
      }
    }

    adjustment.status = 'Approved';
    adjustment.approvedBy = req.user ? req.user.name : 'Admin';
    adjustment.approvedAt = new Date();
    adjustment.previousStock = item.stockQuantity;

    if (adjustment.type === 'Stock Increase' || adjustment.type === 'Returned Items') {
      adjustment.newStock = item.stockQuantity + adjustment.qty;
    } else {
      adjustment.newStock = item.stockQuantity - adjustment.qty;
    }

    item.stockQuantity = adjustment.newStock;

    await item.save();
    await adjustment.save();

    await logAction(req.user, 'STOCK_ADJUSTMENT_APPROVE', `Approved adjustment ${adjustment.adjustmentNo} for ${item.partName}. New Stock: ${item.stockQuantity}`, req);
    res.send(adjustment);
  } catch (error) {
    res.status(400).send({ error: 'Failed to approve adjustment: ' + error.message });
  }
});

module.exports = router;
