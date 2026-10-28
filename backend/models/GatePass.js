const mongoose = require('mongoose');

const gatePassSchema = new mongoose.Schema({
  gatePassNo: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  jobCardNumber: {
    type: String,
    trim: true,
    default: '',
  },
  vehicleNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  customerName: {
    type: String,
    required: true,
    trim: true,
  },
  customerMobile: {
    type: String,
    required: true,
    trim: true,
  },
  materialName: {
    type: String,
    required: true,
    trim: true,
  },
  quantity: {
    type: Number,
    required: true,
    default: 1,
  },
  unit: {
    type: String,
    required: true,
    default: 'Nos',
    trim: true,
  },
  reasonForIssue: {
    type: String,
    required: true,
    trim: true,
  },
  sentTo: {
    type: String,
    required: true,
    trim: true,
  },
  issuedBy: {
    type: String,
    required: true,
    trim: true,
  },
  authorizedBy: {
    type: String,
    default: '',
    trim: true,
  },
  receiverName: {
    type: String,
    required: true,
    trim: true,
  },
  receiverMobile: {
    type: String,
    required: true,
    trim: true,
  },
  receiverSignature: {
    type: String,
    default: '',
  },
  authorizedSignature: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['Issued', 'Returned', 'Pending'],
    default: 'Issued',
  },
  returnDate: {
    type: Date,
  },
  attachments: [{
    type: String,
  }],
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    index: true,
  },
  invoiceNo: {
    type: String,
    trim: true,
    default: '',
  },
  jobCardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobCard',
    index: true,
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    index: true,
  },
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    index: true,
  },
  passType: {
    type: String,
    enum: ['Vehicle Delivery', 'Vendor Material', 'Material Return', 'General Material', 'Customer Delivery'],
    default: 'Vehicle Delivery',
  },
  paymentStatus: {
    type: String,
    enum: ['Paid', 'Partially Paid', 'Unpaid', 'N/A'],
    default: 'Paid',
  },
  balanceDue: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

gatePassSchema.index({ vehicleNumber: 1, status: 1 });
gatePassSchema.index({ jobCardNumber: 1, status: 1 });
gatePassSchema.index({ invoiceNo: 1 });

module.exports = mongoose.model('GatePass', gatePassSchema);

