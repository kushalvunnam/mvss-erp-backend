const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  mobile: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^\+?\d{7,15}$/.test(v);
      },
      message: props => `${props.value} is not a valid phone number!`
    }
  },
  vehicleNumber: { type: String, required: true },
  vehicleModel: { type: String, default: '' },
  serviceType: { type: String, required: true },
  bookingDate: { type: String, required: true },
  bookingTime: { type: String, required: true },
  preferredDate: { type: String, required: true },
  email: { type: String, default: '' },
  remarks: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Pre-save hook to normalize phone numbers to E.164 format
BookingSchema.pre('save', function(next) {
  if (this.mobile && typeof this.mobile === 'string') {
    // Remove all non-digit characters except +
    let cleanPhone = this.mobile.replace(/[^\d+]/g, '');
    // Ensure it starts with +
    if (cleanPhone && !cleanPhone.startsWith('+')) {
      cleanPhone = '+' + cleanPhone;
    }
    this.mobile = cleanPhone;
  }
  next();
});

module.exports = mongoose.model('Booking', BookingSchema);
