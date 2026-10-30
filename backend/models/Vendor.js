const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  vendorCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    enum: ['Spares', 'Lubricants', 'Batteries & Tyres', 'Accessories', 'Tools & Equipment', 'Sublet Service', 'General'],
    default: 'Spares',
  },
  supplierBrand: {
    type: String,
    default: '',
    trim: true,
  },
  brands: {
    type: [String],
    default: [],
  },
  type: {
    type: String,
    enum: ['Manufacturer', 'Authorized Distributor', 'Wholesaler', 'Local Dealer', 'Service Provider'],
    default: 'Wholesaler',
  },
  gstNumber: {
    type: String,
    default: '',
    trim: true,
  },
  contactPerson: {
    type: String,
    default: '',
    trim: true,
  },
  mobile: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    default: '',
    trim: true,
    lowercase: true,
  },
  address: {
    type: String,
    default: '',
    trim: true,
  },
  city: {
    type: String,
    default: 'Hyderabad',
    trim: true,
  },
  state: {
    type: String,
    default: 'Telangana',
    trim: true,
  },
  paymentTerms: {
    type: String,
    enum: ['Immediate', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Custom'],
    default: 'Net 30',
  },
  outstandingBalance: {
    type: Number,
    default: 0,
  },
  totalPurchaseValue: {
    type: Number,
    default: 0,
  },
  totalPaidAmount: {
    type: Number,
    default: 0,
  },
  bankDetails: {
    bankName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    upiId: { type: String, default: '' },
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
  },
  notes: {
    type: String,
    default: '',
  }
}, {
  timestamps: true,
});

vendorSchema.index({ mobile: 1 });
vendorSchema.index({ name: 1 });
vendorSchema.index({ status: 1 });

module.exports = mongoose.model('Vendor', vendorSchema);
