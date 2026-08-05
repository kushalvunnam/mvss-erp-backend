const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  status: { type: String, enum: ['Present', 'Absent', 'Half Day', 'Leave', 'Weekly Off', 'Present (Worked on Weekly Off)'], required: true },
  isWeeklyOff: { type: Boolean, default: false },
  weeklyOff: { type: Boolean, default: false },
  updatedBy: { type: String, default: '' },
  updatedTime: { type: Date, default: Date.now },
  remarks: { type: String, default: '' }
}, {
  toJSON: {
    transform: function(doc, ret) {
      if (ret.isWeeklyOff || ret.weeklyOff) {
        ret.status = 'Weekly Off';
      }
      return ret;
    }
  },
  toObject: {
    transform: function(doc, ret) {
      if (ret.isWeeklyOff || ret.weeklyOff) {
        ret.status = 'Weekly Off';
      }
      return ret;
    }
  }
});

const salarySchema = new mongoose.Schema({
  monthYear: { type: String, required: true }, // 'YYYY-MM'
  basicSalary: { type: Number, required: true },
  leaves: { type: Number, default: 0 },
  advances: { type: Number, default: 0 },
  deductions: { type: Number, default: 0 },
  deductionsDescription: { type: String, default: '' },
  specialAllowance: { type: Number, default: 0 },
  otherAllowance: { type: Number, default: 0 },
  otherAllowanceDescription: { type: String, default: '' },
  epfPercent: { type: Number, default: 0 },
  epfAmount: { type: Number, default: 0 },
  professionalTax: { type: Number, default: 0 },
  additionalDeductions: [{
    name: { type: String, required: true },
    amount: { type: Number, required: true }
  }],
  netSalary: { type: Number, required: true },
  generatedAt: { type: Date, default: Date.now }
});

const employeeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: false, default: '', lowercase: true, trim: true },
  employeeId: { type: String, unique: true },
  department: { type: String, enum: ['Service', 'Spares', 'Accounts', 'Body Shop', 'Administration'], default: 'Service' },
  role: { type: String, default: '' },
  address: { type: String, default: '' },
  panNumber: { type: String, default: '', trim: true, uppercase: true },
  dateOfBirth: { type: Date },
  designation: { type: String, default: '', trim: true },
  aadharDocUrl: { type: String, default: '' },
  photoUrl: { type: String, default: '' },
  phone: {
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
  dateOfJoining: { type: Date, required: true },
  basicDetails: { type: String, default: '' },
  aadharNumber: { type: String, required: true },
  resumeUrl: { type: String, default: '' }, // Path to uploaded file
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  attendance: [attendanceSchema],
  salaries: [salarySchema]
}, { timestamps: true });

// Pre-save hook to normalize phone numbers to E.164 format
employeeSchema.pre('save', function(next) {
  if (this.phone && typeof this.phone === 'string') {
    // Remove all non-digit characters except +
    let cleanPhone = this.phone.replace(/[^\d+]/g, '');
    // Ensure it starts with +
    if (cleanPhone && !cleanPhone.startsWith('+')) {
      cleanPhone = '+' + cleanPhone;
    }
    this.phone = cleanPhone;
  }
  next();
});

// Sequential employeeId auto-generation
employeeSchema.pre('save', async function(next) {
  if (this.isNew && !this.employeeId) {
    try {
      const lastEmp = await this.constructor.findOne(
        { employeeId: { $regex: '^EMP-\\d+$' } },
        { employeeId: 1 },
        { sort: { createdAt: -1 } }
      );
      let nextNum = 1001;
      if (lastEmp && lastEmp.employeeId) {
        const match = lastEmp.employeeId.match(/EMP-(\d+)/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      
      // Defensive check to guarantee absolute uniqueness
      let isUnique = false;
      while (!isUnique) {
        const existing = await this.constructor.findOne({ employeeId: `EMP-${nextNum}` });
        if (!existing) {
          isUnique = true;
        } else {
          nextNum++;
        }
      }

      this.employeeId = `EMP-${nextNum}`;
      next();
    } catch (err) {
      next(err);
    }
  } else {
    next();
  }
});

employeeSchema.index({ phone: 1 });
employeeSchema.index({ email: 1 });
employeeSchema.index({ status: 1 });

module.exports = mongoose.model('Employee', employeeSchema);
