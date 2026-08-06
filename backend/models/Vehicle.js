const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  vehicleNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    index: true,
  },
  chassisNumber: {
    type: String,
    trim: true,
    default: '',
    index: true,
  },
  engineNumber: {
    type: String,
    trim: true,
    default: '',
    index: true,
  },
  make: {
    type: String,
    required: true,
    trim: true,
  },
  model: {
    type: String,
    required: true,
    trim: true,
  },
  variant: {
    type: String,
    trim: true,
    default: '',
  },
  fuelType: {
    type: String,
    enum: ['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid'],
    required: true,
  },
  transmission: {
    type: String,
    enum: ['Manual', 'Automatic', 'AMT'],
    default: 'Manual',
  },
  color: {
    type: String,
    trim: true,
    default: '',
  },
  insuranceCompany: {
    type: String,
    trim: true,
    default: '',
  },
  insurancePolicyNumber: {
    type: String,
    trim: true,
    default: '',
  },
  insuranceExpiryDate: {
    type: Date,
  },
  odometerReading: {
    type: Number,
    required: true,
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    index: true,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('Vehicle', vehicleSchema);
