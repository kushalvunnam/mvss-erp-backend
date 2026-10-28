const mongoose = require('mongoose');

const feedbackReminderSchema = new mongoose.Schema({
  gatePassId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GatePass',
    required: true,
    index: true
  },
  gatePassNo: {
    type: String,
    required: true,
    trim: true
  },
  jobCardNumber: {
    type: String,
    trim: true,
    default: ''
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  customerMobile: {
    type: String,
    required: true,
    trim: true
  },
  vehicleNumber: {
    type: String,
    required: true,
    trim: true
  },
  scheduledAt: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'cancelled', 'failed'],
    default: 'pending',
    index: true
  },
  sentAt: {
    type: Date
  },
  messageId: {
    type: String,
    trim: true
  },
  idempotencyKey: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  cancellationReason: {
    type: String,
    trim: true
  },
  error: {
    type: String,
    trim: true
  },
  responseReceived: {
    type: Boolean,
    default: false,
    index: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  feedbackText: {
    type: String,
    trim: true,
    default: ''
  },
  rawResponse: {
    type: String,
    trim: true
  },
  respondedAt: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('FeedbackReminder', feedbackReminderSchema);
