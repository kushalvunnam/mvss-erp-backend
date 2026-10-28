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
  },
  whatsappOptIn: {
    type: Boolean,
    default: true,
  }
}, {
  timestamps: true,
});

// Pre-save hook to normalize phone numbers safely into E.164 format
customerSchema.pre('save', function(next) {
  const normalize = (phoneStr) => {
    if (!phoneStr || typeof phoneStr !== 'string') return phoneStr;
    const raw = phoneStr.trim();
    const digits = raw.replace(/\D/g, '');
    if (raw.startsWith('+')) {
      if (digits.length === 10 && (/^[7-9]/.test(digits) || (digits.startsWith('6') && !digits.startsWith('65')))) {
        return '+91' + digits;
      }
      return '+' + digits;
    }
    // Standard 10-digit Indian mobile
    if (digits.length === 10 && /^[6-9]/.test(digits)) {
      return '+91' + digits;
    }
    // 11-digit Indian mobile with trunk 0
    if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.substring(1))) {
      return '+91' + digits.substring(1);
    }
    // 12-digit Indian mobile with 91
    if (digits.length === 12 && digits.startsWith('91')) {
      return '+' + digits;
    }
    if (digits.length > 0) {
      return '+' + digits;
    }
    return phoneStr;
  };

  if (this.mobile) {
    this.mobile = normalize(this.mobile);
  }
  if (this.alternateNumber) {
    this.alternateNumber = normalize(this.alternateNumber);
  }
  
  next();
});

module.exports = mongoose.model('Customer', customerSchema);
