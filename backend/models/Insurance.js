const mongoose = require('mongoose');

const InsuranceSchema = new mongoose.Schema({
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true,
  },
  ownerName: {
    type: String,
    required: true,
    trim: true,
  },
  ownerMobile: {
    type: String,
    default: '',
    trim: true,
  },
  insuranceCompany: {
    type: String,
    required: true,
    trim: true,
  },
  policyNumber: {
    type: String,
    required: true,
    trim: true,
  },
  startDate: {
    type: Date,
    default: Date.now,
  },
  expiryDate: {
    type: Date,
    required: true,
  },
  idv: {
    type: Number,
    default: 0,
  },
  claimStatus: {
    type: String,
    default: 'No Claim',
    trim: true,
  },
  remarks: {
    type: String,
    default: '',
    trim: true,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('Insurance', InsuranceSchema);
