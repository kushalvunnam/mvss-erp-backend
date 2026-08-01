const mongoose = require('mongoose');

const externalRepairSchema = new mongoose.Schema({
  repairNo: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  jobCardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobCard'
  },
  jobCardNo: {
    type: String,
    trim: true,
    default: ''
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  },
  vendorName: {
    type: String,
    trim: true,
    required: true
  },
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle'
  },
  vehicleNo: {
    type: String,
    trim: true,
    required: true
  },
  repairDescription: {
    type: String,
    trim: true,
    required: true
  },
  cost: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  status: {
    type: String,
    enum: ['Pending', 'Sent', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  date: {
    type: Date,
    default: Date.now
  },
  remarks: {
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

module.exports = mongoose.model('ExternalRepair', externalRepairSchema);
