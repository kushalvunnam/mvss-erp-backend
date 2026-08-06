const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
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
  qty: {
    type: Number,
    required: true,
  },
  rate: {
    type: Number,
    required: true,
  },
  discountPercent: {
    type: Number,
    required: true,
    default: 0,
  },
  discountAmount: {
    type: Number,
    required: true,
    default: 0,
  },
  discountType: {
    type: String,
    enum: ['Percent', 'Fixed'],
    default: 'Percent'
  },
  gstPercent: {
    type: Number,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  gstAmount: {
    type: Number,
    required: true,
  },
  cgstAmount: {
    type: Number,
    required: true,
    default: 0,
  },
  sgstAmount: {
    type: Number,
    required: true,
    default: 0,
  },
  igstAmount: {
    type: Number,
    required: true,
    default: 0,
  },
  total: {
    type: Number,
    required: true,
  }
});

const invoiceLabourSchema = new mongoose.Schema({
  description: {
    type: String,
    required: true,
  },
  qty: {
    type: Number,
    required: true,
    default: 1,
  },
  rate: {
    type: Number,
    required: true,
  },
  discountPercent: {
    type: Number,
    required: true,
    default: 0,
  },
  discountAmount: {
    type: Number,
    required: true,
    default: 0,
  },
  discountType: {
    type: String,
    enum: ['Percent', 'Fixed'],
    default: 'Percent'
  },
  gstPercent: {
    type: Number,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  gstAmount: {
    type: Number,
    required: true,
  },
  cgstAmount: {
    type: Number,
    required: true,
    default: 0,
  },
  sgstAmount: {
    type: Number,
    required: true,
    default: 0,
  },
  igstAmount: {
    type: Number,
    required: true,
    default: 0,
  },
  total: {
    type: Number,
    required: true,
  }
});

const invoiceSchema = new mongoose.Schema({
  invoiceNo: {
    type: String,
    required: true,
    unique: true,
    index: true,
    get: function(val) {
      const { formatLegacyNumber } = require('../utils/documentNumbering');
      return formatLegacyNumber(val, 'INV', this.date || this.createdAt);
    }
  },
  jobCardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobCard',
    required: true,
    index: true,
  },
  estimateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Estimate',
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    index: true,
  },
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true,
    index: true,
  },
  date: {
    type: Date,
    default: Date.now,
    index: true,
  },
  poNumber: {
    type: String,
    default: '',
  },
  roNumber: {
    type: String,
    default: '',
  },
  preparedBy: {
    type: String,
    default: '',
  },
  manualInvoiceRef: {
    type: String,
    default: '',
  },
  gstDetails: {
    companyGSTIN: { type: String, default: '' },
    customerGSTIN: { type: String, default: '' },
    isInterstate: {
      type: Boolean,
      default: false,
      set: function(val) {
        if (val === '' || val === null || val === undefined) return false;
        if (typeof val === 'string') {
          return val.trim().toLowerCase() === 'true';
        }
        return Boolean(val);
      }
    }
  },
  parts: [invoiceItemSchema],
  labour: [invoiceLabourSchema],
  totals: {
    partsTotal: { type: Number, required: true, default: 0 },
    labourTotal: { type: Number, required: true, default: 0 },
    cgstTotal: { type: Number, required: true, default: 0 },
    sgstTotal: { type: Number, required: true, default: 0 },
    igstTotal: { type: Number, required: true, default: 0 },
    gstTotal: { type: Number, required: true, default: 0 },
    discountTotal: { type: Number, required: true, default: 0 },
    grandTotal: { type: Number, required: true, default: 0 },
    roundedGrandTotal: { type: Number, required: true, default: 0 },
  },
  grandTotalWords: {
    type: String,
    required: true,
  },
  invoiceType: {
    type: String,
    enum: ['Proforma invoice', 'Tax Invoice', 'Retail invoice'],
    default: 'Tax Invoice',
  },
  paymentStatus: {
    type: String,
    enum: ['Unpaid', 'Partially Paid', 'Paid'],
    default: 'Unpaid',
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Insurance Claim', 'Split'],
    default: 'Cash',
  },
  amountPaid: {
    type: Number,
    default: 0,
  },
  advanceReceived: {
    type: Number,
    default: 0,
  },
  balanceDue: {
    type: Number,
    default: 0,
  },
  isSent: {
    type: Boolean,
    default: false,
  },
  sentStatus: {
    type: String,
    enum: ['Unsent', 'Sent'],
    default: 'Unsent',
  },
  insuranceClaimDetails: {
    claimNo: { type: String, default: '' },
    insuranceCompany: { type: String, default: '' },
    surveyorName: { type: String, default: '' },
    surveyDate: { type: Date },
    approvedAmount: { type: Number, default: 0 },
    customerPayableAmount: { type: Number, default: 0 },
  },
  status: {
    type: String,
    enum: ['Draft', 'Finalized', 'Cancelled'],
    default: 'Draft',
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

invoiceSchema.pre('validate', function(next) {
  if (!this.gstDetails) {
    this.gstDetails = { companyGSTIN: '36AAJCM4778P1ZI', customerGSTIN: '', isInterstate: false };
  } else {
    if (this.gstDetails.isInterstate === '' || this.gstDetails.isInterstate === null || this.gstDetails.isInterstate === undefined) {
      this.gstDetails.isInterstate = false;
    } else if (typeof this.gstDetails.isInterstate === 'string') {
      this.gstDetails.isInterstate = this.gstDetails.isInterstate.trim().toLowerCase() === 'true';
    } else {
      this.gstDetails.isInterstate = Boolean(this.gstDetails.isInterstate);
    }
  }
  next();
});

invoiceSchema.index({ paymentStatus: 1 });
invoiceSchema.index({ status: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
