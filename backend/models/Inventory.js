const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Part', 'Labour'],
    default: 'Part',
  },
  partName: {
    type: String,
    required: true,
    trim: true,
  },
  partNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  partCode: {
    type: String,
    default: '',
    trim: true,
  },
  barcode: {
    type: String,
    default: '',
    trim: true,
  },
  alias: {
    type: String,
    default: '',
    trim: true,
  },
  hsnCode: {
    type: String,
    default: '8708',
    trim: true,
  },
  brand: {
    type: String,
    default: '',
    trim: true,
  },
  category: {
    type: String,
    default: 'General Spares',
    trim: true,
  },
  subCategory: {
    type: String,
    default: '',
    trim: true,
  },
  model: {
    type: String,
    default: '',
    trim: true,
  },
  variant: {
    type: String,
    default: '',
    trim: true,
  },
  vehicleCompatibility: {
    type: String,
    default: '',
    trim: true,
  },
  oemBrand: {
    type: String,
    default: '',
    trim: true,
  },
  warranty: {
    type: String,
    default: '',
    trim: true,
  },
  stockQuantity: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  currentStock: {
    type: Number,
    min: 0,
    default: 0,
  },
  reservedStock: {
    type: Number,
    min: 0,
    default: 0,
  },
  lowStockThreshold: {
    type: Number,
    required: true,
    min: 0,
    default: 5,
  },
  minimumStock: {
    type: Number,
    min: 0,
    default: 5,
  },
  maxStock: {
    type: Number,
    default: 100,
  },
  reorderLevel: {
    type: Number,
    min: 0,
    default: 5,
  },
  purchasePrice: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  sellingPrice: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  mrp: {
    type: Number,
    default: 0,
  },
  marginPercent: {
    type: Number,
    default: 0,
  },
  discountPercent: {
    type: Number,
    default: 0,
  },
  discountAmount: {
    type: Number,
    default: 0,
  },
  discountType: {
    type: String,
    enum: ['Percent', 'Fixed', 'Flat'],
    default: 'Percent'
  },
  chargeAmount: {
    type: Number,
    default: 0,
  },
  gstPercent: {
    type: Number,
    required: true,
    default: 18,
  },
  supplier: {
    type: String,
    default: '',
    trim: true,
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
  },
  vendorName: {
    type: String,
    default: '',
  },
  warehouse: {
    type: String,
    default: 'Main Store',
    trim: true,
  },
  locationRack: {
    type: String,
    default: '',
    trim: true,
  },
  unit: {
    type: String,
    default: 'Pcs',
    enum: ['Pcs', 'Ltr', 'Kg', 'Set', 'Meter', 'Box', 'Pairs', 'Hours', 'Job'],
  },
  image: {
    type: String,
    default: '',
  },
  expiryDate: {
    type: Date,
  },
  movementSpeed: {
    type: String,
    enum: ['Fast', 'Medium', 'Slow'],
    default: 'Fast',
  },
  status: {
    type: String,
    enum: ['Active', 'Discontinued', 'Out of Stock'],
    default: 'Active',
  }
}, {
  timestamps: true,
});

inventorySchema.pre('save', function(next) {
  if (this.isModified('stockQuantity') || this.isNew) {
    this.currentStock = this.stockQuantity;
  } else if (this.isModified('currentStock')) {
    this.stockQuantity = this.currentStock;
  }
  if (this.isModified('lowStockThreshold') || this.isNew) {
    this.minimumStock = this.lowStockThreshold;
  } else if (this.isModified('minimumStock')) {
    this.lowStockThreshold = this.minimumStock;
  }

  // Calculate Margin % automatically if purchasePrice and sellingPrice exist
  if (this.purchasePrice > 0 && this.sellingPrice > 0) {
    this.marginPercent = Math.round(((this.sellingPrice - this.purchasePrice) / this.purchasePrice) * 100 * 100) / 100;
  }

  // Auto set Part Code if missing
  if (!this.partCode && this.partNumber) {
    this.partCode = 'PART-' + this.partNumber;
  }

  next();
});

inventorySchema.post('save', async function(doc) {
  try {
    const Notification = mongoose.model('Notification');
    const curStock = doc.currentStock !== undefined ? doc.currentStock : doc.stockQuantity;
    const minStock = doc.minimumStock !== undefined ? doc.minimumStock : doc.lowStockThreshold;

    if (curStock <= minStock) {
      const isOut = curStock === 0;
      const severity = isOut ? 'CRITICAL' : 'WARNING';
      const title = isOut ? 'OUT OF STOCK ALERT' : 'LOW STOCK ALERT';
      const alertMessage = `${doc.partName} (${doc.partNumber})\nCurrent Stock: ${curStock}\nMinimum Stock: ${minStock}\nSeverity Level: ${severity}`;

      const existing = await Notification.findOne({
        type: 'low_stock',
        title: title,
        customerName: doc.partName,
        status: 'unread'
      });

      if (!existing) {
        const notif = new Notification({
          type: 'low_stock',
          title: title,
          message: alertMessage,
          serviceType: severity,
          vehicleNumber: doc.partNumber,
          customerName: doc.partName,
          status: 'unread'
        });
        await notif.save();
      }
    }
  } catch (err) {
    console.error('Failed to trigger post-save stock alert:', err);
  }
});

inventorySchema.index({ partName: 1 });
inventorySchema.index({ brand: 1 });
inventorySchema.index({ category: 1 });
inventorySchema.index({ type: 1 });
inventorySchema.index({ vendorName: 1 });

module.exports = mongoose.model('Inventory', inventorySchema);
