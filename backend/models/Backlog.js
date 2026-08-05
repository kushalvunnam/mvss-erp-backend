const mongoose = require('mongoose');

const backlogSchema = new mongoose.Schema({
  backlogId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  vehicleNo: {
    type: String,
    required: true,
    trim: true
  },
  customerName: {
    type: String,
    trim: true,
    default: ''
  },
  jobCardNo: {
    type: String,
    trim: true,
    default: ''
  },
  vehicleModel: {
    type: String,
    required: true,
    trim: true
  },
  partNumber: {
    type: String,
    required: true,
    trim: true
  },
  partName: {
    type: String,
    required: true,
    trim: true
  },
  brand: {
    type: String,
    trim: true,
    default: ''
  },
  qty: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  vendorName: {
    type: String,
    required: true,
    trim: true
  },
  vendorContact: {
    type: String,
    trim: true,
    default: ''
  },
  poNumber: {
    type: String,
    trim: true,
    default: ''
  },
  orderedDate: {
    type: Date,
    default: Date.now
  },
  expectedDeliveryDate: {
    type: Date,
    required: true
  },
  receivedDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['Pending', 'Ordered', 'Received', 'In Stock', 'Issued', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  remarks: {
    type: String,
    trim: true,
    default: ''
  },
  serviceAdvisorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  serviceAdvisorName: {
    type: String,
    trim: true,
    default: ''
  },
  createdBy: {
    type: String,
    required: true
  },
  lastUpdatedBy: {
    type: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Backlog', backlogSchema);
