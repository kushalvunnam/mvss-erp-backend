const mongoose = require('mongoose');

const estimateItemSchema = new mongoose.Schema({
  partId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inventory',
  },
  name: {
    type: String,
    required: true,
  },
  partNo: {
    type: String,
    default: '',
  },
  hsnCode: {
    type: String,
    default: '',
  },
  unit: {
    type: String,
    default: 'Pcs',
  },
  qty: {
    type: Number,
    required: true,
    min: 1,
  },
  qtyIssued: {
    type: Number,
    default: 0,
    min: 0,
  },
  qtyReturned: {
    type: Number,
    default: 0,
    min: 0,
  },
  rate: {
    type: Number,
    required: true,
    min: 0,
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
  },
  taxableValue: {
    type: Number,
    required: true,
    default: 0,
  },
  cgstAmount: {
    type: Number,
    default: 0,
  },
  sgstAmount: {
    type: Number,
    default: 0,
  },
  igstAmount: {
    type: Number,
    default: 0,
  },
  gstPercent: {
    type: Number,
    required: true,
    default: 18,
  },
  amount: {
    type: Number,
    required: true,
  },
  gstAmount: {
    type: Number,
    required: true,
  },
  total: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Ordered', 'Received', 'Installed', 'Cancelled'],
    default: 'Pending',
  }
});

const labourItemSchema = new mongoose.Schema({
  description: {
    type: String,
    required: true,
  },
  rate: {
    type: Number,
    required: true,
    min: 0,
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
  },
  taxableValue: {
    type: Number,
    required: true,
    default: 0,
  },
  cgstAmount: {
    type: Number,
    default: 0,
  },
  sgstAmount: {
    type: Number,
    default: 0,
  },
  igstAmount: {
    type: Number,
    default: 0,
  },
  gstPercent: {
    type: Number,
    required: true,
    default: 18,
  },
  amount: {
    type: Number,
    required: true,
  },
  gstAmount: {
    type: Number,
    required: true,
  },
  total: {
    type: Number,
    required: true,
  }
});

const estimateSchema = new mongoose.Schema({
  estimateNo: {
    type: String,
    required: true,
    unique: true,
    index: true,
    get: function(val) {
      const { formatLegacyNumber } = require('../utils/documentNumbering');
      return formatLegacyNumber(val, 'EST', this.date || this.createdAt);
    }
  },
  jobCardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobCard',
    required: true,
    index: true,
  },
  parts: [estimateItemSchema],
  labour: [labourItemSchema],
  totals: {
    partsTotal: { type: Number, required: true, default: 0 },
    labourTotal: { type: Number, required: true, default: 0 },
    gstTotal: { type: Number, required: true, default: 0 },
    grandTotal: { type: Number, required: true, default: 0 },
  },
  status: {
    type: String,
    enum: ['Draft', 'Sent', 'Approved', 'Rejected', 'Revised'],
    default: 'Draft',
  },
  amountInWords: {
    type: String,
    default: '',
  },
  revisionHistory: [{
    version: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    status: String,
    totals: mongoose.Schema.Types.Mixed,
    parts: Array,
    labour: Array,
  }],
  date: {
    type: Date,
    default: Date.now,
    index: true,
  },
  validUntil: {
    type: Date,
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

module.exports = mongoose.model('Estimate', estimateSchema);
