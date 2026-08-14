const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema({
  partId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inventory',
  },
  partNumber: {
    type: String,
    required: true,
  },
  partName: {
    type: String,
    required: true,
  },
  qty: {
    type: Number,
    required: true,
    min: 1,
  },
  purchasePrice: {
    type: Number,
    required: true,
    min: 0,
  },
  sellingPrice: {
    type: Number,
    min: 0,
    default: 0,
  },
  mrp: {
    type: Number,
    default: 0,
  },
  hsnCode: {
    type: String,
    default: '8708',
  },
  warehouse: {
    type: String,
    default: 'Main Store',
  },
  discountPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  discountType: {
    type: String,
    enum: ['Percent', 'Flat'],
    default: 'Percent'
  },
  discountValue: {
    type: Number,
    default: 0,
    min: 0
  },
  gstPercent: {
    type: Number,
    default: 18,
  },
  taxableAmount: {
    type: Number,
    required: true,
  },
  gstAmount: {
    type: Number,
    required: true,
  },
  cgst: {
    type: Number,
    default: 0
  },
  sgst: {
    type: Number,
    default: 0
  },
  igst: {
    type: Number,
    default: 0
  },
  rackLocation: {
    type: String,
    default: ''
  },
  total: {
    type: Number,
    required: true,
  },
  // New fields for Parts Master integration
  brand: {
    type: String,
    default: ''
  },
  supplierBrand: {
    type: String,
    default: ''
  },
  vehicleMake: {
    type: String,
    default: ''
  },
  vehicleModel: {
    type: String,
    default: ''
  },
  compatibility: {
    type: String,
    default: ''
  },
  oemBrand: {
    type: String,
    default: ''
  },
  warranty: {
    type: String,
    default: ''
  }
});

const purchaseSchema = new mongoose.Schema({
  purchaseNo: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
  },
  vendorName: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
    index: true,
  },
  invoiceNo: {
    type: String,
    default: '',
  },
  invoiceDate: {
    type: Date,
  },
  items: [purchaseItemSchema],
  totals: {
    totalQty: { type: Number, required: true, default: 0 },
    subtotal: { type: Number, required: true, default: 0 },
    totalDiscount: { type: Number, required: true, default: 0 },
    taxableAmount: { type: Number, required: true, default: 0 },
    gstTotal: { type: Number, required: true, default: 0 },
    cgstTotal: { type: Number, required: true, default: 0 },
    sgstTotal: { type: Number, required: true, default: 0 },
    igstTotal: { type: Number, required: true, default: 0 },
    roundOff: { type: Number, required: true, default: 0 },
    grandTotal: { type: Number, required: true, default: 0 },
  },
  paymentStatus: {
    type: String,
    enum: ['Paid', 'Credit', 'Partially Paid', 'Unpaid'],
    default: 'Credit',
  },
  amountPaid: {
    type: Number,
    default: 0,
  },
  notes: {
    type: String,
    default: '',
  },
  createdBy: {
    type: String,
    required: true,
  },
  attachmentUrl: {
    type: String,
    default: ''
  },
  attachmentName: {
    type: String,
    default: ''
  },
  attachmentType: {
    type: String,
    default: ''
  }
}, {
  timestamps: true,
});

purchaseSchema.index({ invoiceNo: 1 });
purchaseSchema.index({ vendorName: 1 });
purchaseSchema.index({ vendorId: 1, invoiceNo: 1 }, { unique: true });

module.exports = mongoose.model('Purchase', purchaseSchema);
