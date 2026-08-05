const mongoose = require('mongoose');

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
  },
  time: {
    type: String,
    required: true,
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
  },
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true,
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

  status: {
    type: String,
    enum: [
      'Created', 'Inspect Stage', 'Estimation', 'Customer Approval', 'Work In Progress', 'Body Shop', 'Surveyor Approval', 'Repair', 'Quality Check', 'Ready for Delivery', 'Delivered', 'Closed',
      'Waiting for Customer Approval', 'Parts Procuring', 'Work in Progress', 'Quality Test'
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

  advancePayments: [{
    amount: { type: Number, required: true },
    type: { type: String, enum: ['Cash', 'Online', 'Card Swipe'], required: true },
    paymentMode: { type: String, enum: ['Cash', 'Online', 'Card Swipe', 'Scanner Payment (QR)'], required: true },
    paymentDate: { type: Date, default: Date.now },
    transactionId: { type: String, default: '' },
    remarks: { type: String, default: '' },
    recordedBy: { type: String, default: '' }
  }],
  finalPayments: [{
    amount: { type: Number, required: true },
    paymentType: { type: String, enum: ['Cash', 'Online', 'Card Swipe', 'Scanner Payment'], required: true },
    transactionId: { type: String, default: '' },
    referenceNumber: { type: String, default: '' },
    remarks: { type: String, default: '' },
    recordedBy: { type: String, default: '' },
    paymentDate: { type: Date, default: Date.now }
  }],
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Partially Paid', 'Fully Paid'],
    default: 'Pending'
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
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

JobCardSchema.pre('save', function(next) {
  if (this.serviceTypes && this.serviceTypes.length > 0) {
    this.serviceType = this.serviceTypes[0];
  } else if (this.serviceType) {
    this.serviceTypes = [this.serviceType];
  }
  next();
});

module.exports = mongoose.model('JobCard', JobCardSchema);
