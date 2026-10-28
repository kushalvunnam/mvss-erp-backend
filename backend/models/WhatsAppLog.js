const mongoose = require('mongoose');

const whatsappLogSchema = new mongoose.Schema({
  recipientName: { 
    type: String, 
    required: true 
  },
  recipientPhone: { 
    type: String, 
    required: true 
  },
  templateName: { 
    type: String 
  },
  messageType: { 
    type: String, 
    enum: ['template', 'text', 'interactive'], 
    default: 'template' 
  },
  direction: {
    type: String,
    enum: ['outbound', 'inbound'],
    default: 'outbound'
  },
  status: { 
    type: String, 
    enum: ['pending', 'sent', 'delivered', 'read', 'failed'], 
    default: 'pending' 
  },
  messageId: { 
    type: String, 
    sparse: true // Unique handled by Meta, but allowing multiple nulls
  },
  relatedEntity: { 
    type: mongoose.Schema.Types.ObjectId, 
    refPath: 'onModel' 
  },
  onModel: { 
    type: String, 
    enum: [
      'Customer',
      'JobCard',
      'Estimate',
      'Invoice',
      'GatePass',
      'InsuranceClaim',
      'Booking',
      'Purchase',
      'FeedbackReminder'
    ] 
  },
  errorMessage: { 
    type: String 
  },
  metaErrorCode: {
    type: String
  },
  attempts: {
    type: Number,
    default: 1
  },
  lastAttemptAt: {
    type: Date,
    default: Date.now
  },
  language: {
    type: String,
    default: 'en'
  },
  components: {
    type: Array,
    default: []
  },
  idempotencyKey: { 
    type: String, 
    unique: true, 
    sparse: true 
  }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('WhatsAppLog', whatsappLogSchema);
