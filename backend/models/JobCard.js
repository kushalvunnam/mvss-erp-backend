const mongoose = require('mongoose');

// Primary Standard Payment Modes supported by MVSS ERP
const PRIMARY_PAYMENT_MODES = [
  'Cash',
  'UPI',
  'Card',
  'Bank Transfer',
  'Cheque',
  'QR / Scanner Payment',
  'Other'
];

// All supported payment modes including historical values for 100% backward compatibility
const ALL_SUPPORTED_PAYMENT_MODES = [
  'Cash',
  'UPI',
  'Card',
  'Bank Transfer',
  'Cheque',
  'QR / Scanner Payment',
  'Other',
  // Historical / legacy values
  'Card Swipe',
  'Online',
  'Scanner Payment (QR)',
  'Scanner Payment',
  'QR'
];

const normalizePaymentModeValue = (mode) => {
  if (!mode || typeof mode !== 'string') return 'Cash';
  const m = mode.trim();
  const lower = m.toLowerCase();
  if (lower === 'cash') return 'Cash';
  if (lower === 'upi') return 'UPI';
  if (lower === 'card' || lower === 'card swipe' || lower === 'debit card' || lower === 'credit card' || lower === 'pos') return 'Card';
  if (lower === 'bank transfer' || lower === 'bank' || lower === 'neft' || lower === 'rtgs' || lower === 'imps' || lower === 'net banking') return 'Bank Transfer';
  if (lower === 'cheque' || lower === 'check') return 'Cheque';
  if (lower === 'qr / scanner payment' || lower === 'scanner payment (qr)' || lower === 'scanner payment' || lower === 'qr' || lower.includes('qr') || lower.includes('scanner')) return 'QR / Scanner Payment';
  if (lower === 'online') return 'Online';
  if (lower === 'other' || lower === 'others') return 'Other';
  return m;
};

const AdvancePaymentSchema = new mongoose.Schema({
  amount: { 
    type: Number, 
    required: [true, 'Advance amount is required'],
    min: [0.01, 'Advance amount must be greater than zero']
  },
  type: { 
    type: String, 
    enum: {
      values: ALL_SUPPORTED_PAYMENT_MODES,
      message: '{VALUE} is not a valid enum value for path type'
    },
    default: 'Cash',
    set: normalizePaymentModeValue,
    required: true 
  },
  paymentMode: { 
    type: String, 
    enum: {
      values: ALL_SUPPORTED_PAYMENT_MODES,
      message: '{VALUE} is not a valid enum value for path paymentMode'
    },
    default: 'Cash',
    set: normalizePaymentModeValue,
    required: true 
  },
  paymentDate: { type: Date, default: Date.now },
  transactionId: { type: String, default: '', trim: true },
  remarks: { type: String, default: '', trim: true },
  recordedBy: { type: String, default: '', trim: true }
}, { _id: true });

AdvancePaymentSchema.pre('validate', function(next) {
  if (this.paymentMode) this.paymentMode = normalizePaymentModeValue(this.paymentMode);
  if (this.type) this.type = normalizePaymentModeValue(this.type);
  if (!this.paymentMode && this.type) this.paymentMode = this.type;
  if (!this.type && this.paymentMode) this.type = this.paymentMode;
  next();
});

const FinalPaymentSchema = new mongoose.Schema({
  amount: { 
    type: Number, 
    required: [true, 'Final payment amount is required'],
    min: [0.01, 'Final payment amount must be greater than zero']
  },
  paymentType: { 
    type: String, 
    enum: {
      values: ALL_SUPPORTED_PAYMENT_MODES,
      message: '{VALUE} is not a valid enum value for path paymentType'
    },
    default: 'Cash',
    set: normalizePaymentModeValue,
    required: true 
  },
  transactionId: { type: String, default: '', trim: true },
  referenceNumber: { type: String, default: '', trim: true },
  remarks: { type: String, default: '', trim: true },
  recordedBy: { type: String, default: '', trim: true },
  paymentDate: { type: Date, default: Date.now }
}, { _id: true });

FinalPaymentSchema.pre('validate', function(next) {
  if (this.paymentType) this.paymentType = normalizePaymentModeValue(this.paymentType);
  next();
});

const JobCardSchema = new mongoose.Schema({
  jobCardNo: {
    type: String,
    required: true,
    unique: true,
    index: true,
    get: function(val) {
      const { formatLegacyNumber } = require('../utils/documentNumbering');
      return formatLegacyNumber(val, 'JC', this.date || this.createdAt);
    }
  },
  date: {
    type: Date,
    default: Date.now,
    index: true,
  },
  time: {
    type: String,
    required: true,
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    index: true,
  },
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true,
    index: true,
  },
  odometerReading: {
    type: Number,
    required: true,
  },
  contactPerson: {
    type: String,
    trim: true,
    default: '',
  },
  estimation: {
    type: String,
    trim: true,
    default: '',
  },
  color: {
    type: String,
    trim: true,
    default: '',
  },
  insuranceName: {
    type: String,
    trim: true,
    default: '',
  },
  claimNo: {
    type: String,
    trim: true,
    default: '',
  },
  serviceType: {
    type: String,
    enum: ['General Servicing', 'Paid Service', 'Accident Repair', 'Warranty Work', 'Water Wash', 'Other'],
    default: 'General Servicing',
  },
  serviceTypes: {
    type: [String],
    default: ['General Servicing']
  },
  workCategory: {
    type: String,
    enum: ['RR', 'PMS', 'B/P', 'Insurance Jobs', 'Corporate', 'General Service'],
    default: 'RR',
  },
  jobType: {
    type: String,
    enum: ['Cash Job', 'Insurance Job', 'Credit Job'],
    default: 'Cash Job',
  },
  
  // 32 Servicing and Maintenance Checks (Mixed type to support backward compatibility & Yes/No/Remarks)
  inspectionChecklist: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Fuel Gauge Position (represented as number 0 to 1, or string like 'E', '1/4', '1/2', '3/4', 'F')
  fuelLevel: {
    type: String,
    default: 'E',
  },

  // Vehicle Accessories Checklist
  accessories: {
    serviceBook: { type: String, enum: ['Yes', 'No'], default: 'No' },
    toolKit: { type: String, enum: ['Yes', 'No'], default: 'No' },
    spareWheel: { type: String, enum: ['Yes', 'No'], default: 'No' },
    jack: { type: String, enum: ['Yes', 'No'], default: 'No' },
    jackHandle: { type: String, enum: ['Yes', 'No'], default: 'No' },
    carPerfume: { type: String, enum: ['Yes', 'No'], default: 'No' },
    clock: { type: String, enum: ['Yes', 'No'], default: 'No' },
    stereo: { type: String, enum: ['Yes', 'No'], default: 'No' },
    cdPlayer: { type: String, enum: ['Yes', 'No'], default: 'No' },
    mouthPiece: { type: String, enum: ['Yes', 'No'], default: 'No' },
    cdChanger: { type: String, enum: ['Yes', 'No'], default: 'No' },
    battery: { type: String, enum: ['Yes', 'No'], default: 'No' },
    tyres: { type: String, enum: ['Yes', 'No'], default: 'No' },
    idols: { type: String, default: '' },
    wheelCover: { type: String, default: '' },
    wheelCap: { type: String, default: '' },
    mudFlaps: { type: String, default: '' },
    mats: { type: String, default: '' },
    dickyMat: { type: String, default: '' },
    cigaretteLighter: { type: String, enum: ['Yes', 'No'], default: 'No' },
    speakerRR: { type: String, default: '' },
    speakerFR: { type: String, default: '' },
    tweeters: { type: String, default: '' },
    extWarranty: { type: String, enum: ['Yes', 'No'], default: 'No' },
  },

  // Interactive marking on car diagrams
  damageMarkings: [{
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    type: { type: String, enum: ['Scratch', 'Dent', 'Crack', 'Paint Damage', 'Glass Damage', 'Bumper Damage'], required: true },
    description: { type: String, trim: true, default: '' },
  }],

  // Image Uploads
  photos: [{
    url: String,
    publicId: String,
    photoType: { type: String, enum: ['Vehicle', 'Damage', 'Document', 'Before Repair', 'During Repair', 'After Repair'], default: 'Vehicle' }
  }],

  // Advisor & Delivery details
  promDate: { type: Date },
  promTime: { type: String, default: '' },
  estAmt: { type: Number, default: 0 },
  
  // Customer complaints list
  complaints: [{
    type: String,
    trim: true,
  }],

  advisorNotes: {
    type: String,
    trim: true,
    default: '',
  },

  internalRemarks: {
    type: String,
    trim: true,
    default: '',
  },

  technicianNotes: {
    type: String,
    trim: true,
    default: '',
  },

  technicianRemarks: {
    type: String,
    trim: true,
    default: '',
  },

  estimatedCompletionDate: {
    type: Date,
  },

  jobProgress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
  },

  qcRemarks: {
    type: String,
    trim: true,
    default: '',
  },

  qcStatus: {
    type: String,
    enum: ['Pass', 'Fail', 'Rework Required', ''],
    default: '',
  },

  // Service advisor tracking
  serviceAdvisorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  serviceAdvisorName: {
    type: String,
    default: '',
    trim: true,
  },
  technicianName: {
    type: String,
    default: '',
    trim: true,
  },
  qcName: {
    type: String,
    default: '',
    trim: true,
  },
  floorInchargeName: {
    type: String,
    default: '',
    trim: true,
  },

  bodyShopDetails: {
    type: String,
    default: '',
  },

  bodyShopStatus: {
    type: String,
    enum: [
      '',
      'Vehicle Reported',
      'Customer Not Responding',
      'Survey Pending',
      'Awaiting for Documents',
      'Awaiting for Work Approval',
      'Work in Progress',
      'Part not Available',
      'Awaiting for Reinspection',
      'Awaiting for Delivery Order',
      'Ready for Delivery',
      'Delivered – Payment Pending',
      'Delivered - Payment Pending',
      'Delivered',
      'Closed',
      'Estimation Pending'
    ],
    default: '',
    trim: true,
  },

  bodyShopStage: {
    type: String,
    default: '',
    trim: true,
  },

  status: {
    type: String,
    enum: [
      'Created', 'Inspect Stage', 'Estimation', 'Customer Approval', 'Work In Progress', 'Body Shop', 'Surveyor Approval', 'Repair', 'Quality Check', 'Ready for Delivery', 'Vehicle Ready', 'Delivered – Payment Pending', 'Delivered - Payment Pending', 'Delivered', 'Closed',
      'Waiting for Customer Approval', 'Waiting for Allotment', 'Allotted', 'Parts Procuring', 'Work in Progress', 'Quality Test', 'Final Quality Inspection', 'Pre-Delivery Inspection',
      'Vehicle Reported', 'Customer Not Responding', 'Survey Pending', 'Awaiting for Documents', 'Awaiting for Work Approval', 'Part not Available', 'Awaiting for Reinspection', 'Awaiting for Delivery Order', 'Estimation Pending'
    ],
    default: 'Waiting for Customer Approval',
  },

  statusHistory: [{
    status: { type: String, required: true },
    previousStatus: { type: String, default: '' },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: String, default: '' },
    remarks: { type: String, default: '' }
  }],

  advancePayments: [AdvancePaymentSchema],
  finalPayments: [FinalPaymentSchema],
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Unpaid', 'Partially Paid', 'Paid', 'Fully Paid', 'Overpaid', 'Settled', 'Settled (Waived Off)', 'Waived', 'Waived / Fully Settled'],
    default: 'Pending'
  },
  waivers: [{
    amount: { type: Number, required: true },
    reason: { type: String, required: true, trim: true },
    category: { 
      type: String, 
      enum: [
        'Customer Negotiation',
        'Goodwill Gesture',
        'Management Approval',
        'Service Delay Compensation',
        'Disputed Amount',
        'Round-off / Minor Adjustment',
        'Corporate Discount',
        'Service Recovery',
        'Other'
      ],
      default: 'Customer Negotiation'
    },
    approvedBy: { type: String, required: true, trim: true },
    approvedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    remarks: { type: String, default: '', trim: true },
    status: { type: String, enum: ['Active', 'Reversed'], default: 'Active' },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: String, default: '' },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reversedAt: { type: Date },
    reversedBy: { type: String, default: '' },
    reversedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reversalReason: { type: String, default: '' }
  }],
  waiver: {
    originalBillAmount: { type: Number, default: 0 },
    amountReceived: { type: Number, default: 0 },
    waivedAmount: { type: Number, default: 0 },
    finalCollectedAmount: { type: Number, default: 0 },
    category: { type: String, default: 'Customer Negotiation' },
    approvedBy: { type: String, default: '' },
    remarks: { type: String, default: '' },
    waivedAt: { type: Date },
    reason: { type: String, default: '' }
  },

  financialSummary: {
    estimatedRepairAmount: { type: Number, default: 0 },
    estimatedBalanceDue: { type: Number, default: 0 },
    excessAdvanceCredit: { type: Number, default: 0 },
    finalBillAmount: { type: Number, default: 0 },
    totalAdvance: { type: Number, default: 0 },
    totalFinal: { type: Number, default: 0 },
    totalReceived: { type: Number, default: 0 },
    totalWaived: { type: Number, default: 0 },
    waivedAmount: { type: Number, default: 0 },
    netAmountPayable: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    pendingAmount: { type: Number, default: 0 },
    outstandingBalance: { type: Number, default: 0 },
    customerCredit: { type: Number, default: 0 },
    paymentStatus: { type: String, default: 'Pending' },
    lastCalculatedAt: { type: Date, default: Date.now }
  },

  creditDueDate: {
    type: Date
  },
  creditTerms: {
    type: String,
    default: ''
  },

  billingSummary: {
    totalPartsUsed: { type: Number, default: 0 },
    totalPartsSellingValue: { type: Number, default: 0 },
    totalPartsDiscount: { type: Number, default: 0 },
    partsGST: { type: Number, default: 0 },
    netPartsAmount: { type: Number, default: 0 },
    totalPurchaseCostOfPartsUsed: { type: Number, default: 0 },
    totalPurchaseGST: { type: Number, default: 0 },
    totalPurchaseAmount: { type: Number, default: 0 },
    totalLabourHours: { type: Number, default: 0 },
    totalLabourCharges: { type: Number, default: 0 },
    labourDiscount: { type: Number, default: 0 },
    labourGST: { type: Number, default: 0 },
    netLabourAmount: { type: Number, default: 0 },
    partsSaleAmount: { type: Number, default: 0 },
    partsPurchaseAmount: { type: Number, default: 0 },
    labourAmount: { type: Number, default: 0 },
    totalDiscount: { type: Number, default: 0 },
    totalGST: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    grossProfit: { type: Number, default: 0 },
    profitPercentage: { type: Number, default: 0 }
  },

  // Spare Parts and Labour recorded against Job Card
  parts: [{
    partId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
    name: { type: String, default: '' },
    partNo: { type: String, default: '' },
    hsnCode: { type: String, default: '' },
    description: { type: String, default: '' },
    unit: { type: String, default: 'Pcs' },
    qty: { type: Number, default: 1 },
    rate: { type: Number, default: 0 },
    mrp: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    discountType: { type: String, default: 'Fixed' },
    taxableValue: { type: Number, default: 0 },
    gstPercent: { type: Number, default: 18 },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  }],
  labour: [{
    description: { type: String, default: '' },
    qty: { type: Number, default: 1 },
    rate: { type: Number, default: 0 },
    mrp: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    discountType: { type: String, default: 'Fixed' },
    taxableValue: { type: Number, default: 0 },
    gstPercent: { type: Number, default: 18 },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  }],

  // Signatures
  signatures: {
    customer: { type: String }, // Base64 or Cloudinary URL
    advisor: { type: String },  // Base64 or Cloudinary URL
    technician: { type: String }, // Base64 or Cloudinary URL for Technician Signature
  },

  // Delivery details
  deliveredBy: {
    name: { type: String, default: '' },
    date: { type: Date },
    time: { type: String, default: '' },
  },

  // Post inspection
  finalInspection: {
    status: { type: String, enum: ['OK', 'Not OK', ''], default: '' },
    name: { type: String, default: '' },
    signature: { type: String }, // Base64 or URL
  },

  // Customer satisfaction
  customerSatisfaction: {
    date: { type: Date },
    signature: { type: String }, // Base64 or URL
    rating: { type: Number, min: 1, max: 5 },
    feedback: { type: String, trim: true },
    source: { type: String, default: 'WhatsApp' }
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

JobCardSchema.pre('validate', function(next) {
  if (this.advancePayments && Array.isArray(this.advancePayments)) {
    this.advancePayments.forEach(p => {
      if (p.paymentMode) p.paymentMode = normalizePaymentModeValue(p.paymentMode);
      if (p.type) p.type = normalizePaymentModeValue(p.type);
      if (!p.paymentMode && p.type) p.paymentMode = p.type;
      if (!p.type && p.paymentMode) p.type = p.paymentMode;
    });
  }
  if (this.finalPayments && Array.isArray(this.finalPayments)) {
    this.finalPayments.forEach(p => {
      if (p.paymentType) p.paymentType = normalizePaymentModeValue(p.paymentType);
    });
  }
  next();
});

JobCardSchema.pre('save', function(next) {
  if (this.serviceTypes && this.serviceTypes.length > 0) {
    this.serviceType = this.serviceTypes[0];
  } else if (this.serviceType) {
    this.serviceTypes = [this.serviceType];
  }
  next();
});

JobCardSchema.index({ status: 1 });
JobCardSchema.index({ bodyShopStatus: 1 });
JobCardSchema.index({ status: 1, updatedAt: 1 });
JobCardSchema.index({ createdAt: 1 });

module.exports = mongoose.model('JobCard', JobCardSchema);
