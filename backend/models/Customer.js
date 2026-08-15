const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  mobile: {
    type: String,
    required: true,
    trim: true,
    index: true,
    validate: {
      validator: function(v) {
        return /^\+?\d{7,15}$/.test(v);
      },
      message: props => `${props.value} is not a valid phone number!`
    }
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  alternateNumber: {
    type: String,
    trim: true,
    default: '',
  },
  address: {
    type: String,
    trim: true,
  },
  gstNumber: {
    type: String,
    trim: true,
    default: '',
  },
  aadhaarPan: {
    type: String,
    trim: true,
    default: '',
  },
  type: {
    type: String,
    enum: ['Individual', 'Corporate', 'Insurance'],
    default: 'Individual',
  },
  companyName: {
    type: String,
    trim: true,
    default: '',
  }
}, {
  timestamps: true,
});

// Pre-save hook to normalize phone numbers to E.164 format
customerSchema.pre('save', function(next) {
  if (this.mobile && typeof this.mobile === 'string') {
    // Remove all non-digit characters except +
    let cleanPhone = this.mobile.replace(/[^\d+]/g, '');
    // Ensure it starts with +
    if (cleanPhone && !cleanPhone.startsWith('+')) {
      cleanPhone = '+' + cleanPhone;
    }
    this.mobile = cleanPhone;
  }
  
  if (this.alternateNumber && typeof this.alternateNumber === 'string') {
    let cleanPhone = this.alternateNumber.replace(/[^\d+]/g, '');
    if (cleanPhone && !cleanPhone.startsWith('+')) {
      cleanPhone = '+' + cleanPhone;
    }
    this.alternateNumber = cleanPhone;
  }
  
  next();
});

module.exports = mongoose.model('Customer', customerSchema);
