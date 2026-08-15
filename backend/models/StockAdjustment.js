const mongoose = require('mongoose');

const stockAdjustmentSchema = new mongoose.Schema({
  adjustmentNo: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  partId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inventory',
    required: true,
  },
  partNumber: {
    type: String,
    required: true,
    index: true,
  },
  partName: {
    type: String,
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['Stock Increase', 'Stock Decrease', 'Damaged Items', 'Missing Items', 'Returned Items', 'Manual Correction'],
    required: true,
    index: true,
  },
  qty: {
    type: Number,
    required: true,
    min: 1,
  },
  previousStock: {
    type: Number,
    required: true,
  },
  newStock: {
    type: Number,
    required: true,
  },
  reference: {
    type: String,
    default: '',
  },
  reason: {
    type: String,
    required: true,
  },
  comments: {
    type: String,
    default: '',
  },
  createdBy: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Approved',
    index: true,
  },
  approvedBy: {
    type: String,
    default: '',
  },
  approvedAt: {
    type: Date,
  }
}, {
  timestamps: true,
});

stockAdjustmentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('StockAdjustment', stockAdjustmentSchema);
