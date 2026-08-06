console.log('Starting backend...');
console.log('Loading environment variables...');
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Disable Mongoose command buffering when database is offline to prevent hanging requests
mongoose.set('bufferCommands', false);
const path = require('path');
const dotenv = require('dotenv');

// Load env vars
dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/autoworkshop';
const isLocalhostMongo = !MONGODB_URI || MONGODB_URI.includes('localhost') || MONGODB_URI.includes('127.0.0.1');

if (isLocalhostMongo) {
  console.log('[AI Studio] No remote MONGODB_URI provided (or localhost specified). Running in-memory database fallback.');
  global.isInMemoryFallback = true;
} else {
  global.isInMemoryFallback = false;
}

// Hijack mongoose.model BEFORE routes require any models
const originalModel = mongoose.model.bind(mongoose);
mongoose.model = function(name, schema) {
  if (global.isInMemoryFallback) {
    const { getMockModel } = require('./utils/inMemoryDB');
    return getMockModel(name, schema);
  }
  return originalModel(name, schema);
};

// Mock mongoose.Types.ObjectId
mongoose.Types = mongoose.Types || {};
const originalObjectId = mongoose.Types.ObjectId;
mongoose.Types.ObjectId = function(id) {
  if (global.isInMemoryFallback) {
    if (id) return id;
    const { generateId } = require('./utils/inMemoryDB');
    return generateId();
  }
  return originalObjectId ? new originalObjectId(id) : id;
};

// Mock mongoose.connect if in-memory fallback
if (global.isInMemoryFallback) {
  mongoose.connect = async () => {
    console.log('[AI Studio] Connected to In-Memory Mock MongoDB successfully');
    // Trigger seed after next tick so that server startup proceeds
    process.nextTick(async () => {
      try {
        await seedDatabase();
      } catch (err) {
        console.error('Seeding fallback DB failed:', err);
      }
    });
    return mongoose;
  };
}


// Verify required environment variables on startup
if (!process.env.MONGODB_URI) {
  console.warn('====================================================');
  console.warn('DEPLOYMENT WARNING: MONGODB_URI is not set in environment.');
  console.warn('Falling back to: mongodb://localhost:27017/autoworkshop');
  console.warn('====================================================');
}
if (!process.env.JWT_SECRET) {
  console.warn('====================================================');
  console.warn('DEPLOYMENT WARNING: JWT_SECRET is not set in environment.');
  console.warn('Falling back to default secret key.');
  console.warn('====================================================');
}

// Verify required email environment variables on startup
console.log('--- Email Environment Verification ---');
console.log(`RESEND_API_KEY: ${process.env.RESEND_API_KEY ? 'Present' : 'Missing'}`);
console.log(`RESEND_FROM_EMAIL: ${process.env.RESEND_FROM_EMAIL ? 'Present' : 'Missing'}`);
console.log(`ADMIN_EMAIL: ${process.env.ADMIN_EMAIL ? 'Present' : 'Missing'}`);
console.log('--------------------------------------');

const compression = require('compression');

console.log('Starting Express...');
const app = express();
const PORT = process.env.PORT || 10000;

// Enable HTTP Response Compression (Gzip / Brotli)
app.use(compression());

// Enable CORS & Request Parsing
app.use(cors());

// Global Request Logger Middleware
app.use((req, res, next) => {
  console.log(`[REQUEST LOGGER] ${req.method} request received on ${req.originalUrl}`);
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Set Performance & Keep-Alive Headers
app.use((req, res, next) => {
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=15, max=100');
  next();
});

// Serve static uploaded photos with caching
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '1d' }));

// Database connection health check middleware to prevent 504 gateway timeouts when offline
app.use('/api', (req, res, next) => {
  if (req.originalUrl.startsWith('/api/branches')) return next();
  if (!global.isInMemoryFallback && mongoose.connection.readyState !== 1) {
    console.warn(`[Database Offline] Request to ${req.originalUrl} failed: mongoose connection state is ${mongoose.connection.readyState}`);
    return res.status(503).json({ error: 'Database is currently offline. Please ensure MongoDB is running and MONGODB_URI is correct.' });
  }
  next();
});

// Routes mapping
app.use('/api/auth', require('./routes/auth'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/jobcards', require('./routes/jobcards'));
app.use('/api/estimates', require('./routes/estimates'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/adjustments', require('./routes/adjustments'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/backlogs', require('./routes/backlogs'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/claims', require('./routes/claims'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/gatepasses', require('./routes/gatepasses'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/external-repairs', require('./routes/externalRepairs'));
app.use('/api/insurance', require('./routes/insurance'));

// Resend Email Diagnostic Endpoint
app.get('/api/test-email', async (req, res) => {
  const { sendEmail } = require('./services/emailService');
  const recipient = req.query.to || process.env.ADMIN_EMAIL;

  console.log(`[EMAIL TEST] Sending test email via sendEmail helper to ${recipient}`);

  try {
    const result = await sendEmail({
      to: recipient,
      subject: 'Test Email - MVSS Automobiles Resend Diagnostic',
      html: '<h3>Test Email</h3><p>This is a test email sent from the MVSS Automobiles Resend SDK Diagnostic Suite.</p>'
    });

    if (!result.success) {
      console.error('[EMAIL TEST] sendEmail Helper Error:', result.error);
      const isMissingVars = result.error?.missingVariables && result.error.missingVariables.length > 0;
      return res.status(isMissingVars ? 400 : 500).send({
        status: 'error',
        message: result.error?.message || 'Failed to send email',
        error: result.error,
        missingVariables: result.error?.missingVariables || []
      });
    }

    console.log('[EMAIL TEST] Email sent successfully via sendEmail helper. Result:', result.data);
    res.send({
      status: 'success',
      data: result.data
    });
  } catch (err) {
    console.error('[EMAIL TEST] sendEmail Exception:', err);
    res.status(500).send({
      status: 'error',
      message: err.message,
      stack: err.stack ? err.stack.toString() : ''
    });
  }
});

// Base status endpoint
app.get('/', (req, res) => {
  res.json({
    status: "ok",
    service: "MVSS ERP Backend",
    version: "production"
  });
});

// Base API route
app.get('/api', (req, res) => {
  res.json({ success: true, message: 'AutoWorkshop Pro API is running.' });
});

// JSON 404 Handler for all unmatched API routes across ALL HTTP methods (GET, POST, PUT, DELETE)
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found"
  });
});

// Global Express JSON Error Handler to prevent HTML error pages
app.use((err, req, res, next) => {
  console.error('[API Error]:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    message: err.message || 'Internal server error'
  });
});

// Fallback JSON 404 Handler for all other unmatched routes
app.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found"
  });
});

// Database Seed function
async function seedDatabase() {
  const User = require('./models/User');
  const Inventory = require('./models/Inventory');

  try {
    // 1. Seed Users
    console.log('Configuring default user accounts...');
    const defaultUsers = [
      { name: 'System Admin', email: 'admin@mvssautomobiles.com', password: 'admin_mvss@2026', role: 'Admin' },
      { name: 'Accounts Executive', email: 'accounts@mvssautomobiles.com', password: 'accounts_mvss@2026', role: 'Accounts Executive' },
      { name: 'Service Advisor', email: 'service@mvssautomobiles.com', password: 'service_mvss@2026', role: 'Service' },
      { name: 'Store Manager', email: 'store@mvssautomobiles.com', password: 'store_mvss@2026', role: 'Spares' },
      { name: 'Body Shop Manager', email: 'bodyshop@mvssautomobiles.com', password: 'bodyshop_mvss@2026', role: 'Body Shop' },
      { name: 'Front Desk Receptionist', email: 'reception@mvssautomobiles.com', password: 'reception_mvss@2026', role: 'Reception' }
    ];
    for (const u of defaultUsers) {
      const existing = await User.findOne({ email: u.email });
      if (!existing) {
        const user = new User(u);
        await user.save();
        console.log(` - Created ${u.role}: ${u.email} / ${u.password}`);
      } else if (existing.role !== u.role || existing.name !== u.name) {
        existing.role = u.role;
        existing.name = u.name;
        await existing.save();
        console.log(` - Updated seed user ${u.email} to role ${u.role}`);
      }
    }

    // 2. Seed Inventory Catalog
    const inventoryCount = await Inventory.countDocuments();
    if (inventoryCount === 0) {
      console.log('Seeding default inventory items...');
      const defaultParts = [
        { partName: 'Engine Oil (10W-40)', partNumber: 'SP-ENG-OIL', hsnCode: '27101980', brand: 'Castrol', model: 'Universal', variant: 'All', stockQuantity: 50, lowStockThreshold: 10, purchasePrice: 400, sellingPrice: 600, gstPercent: 18 },
        { partName: 'Brake Pads (Front)', partNumber: 'SP-BRK-FRT', hsnCode: '87083000', brand: 'Bosch', model: 'Swift / Dzire', variant: 'LXI / VXI', stockQuantity: 15, lowStockThreshold: 5, purchasePrice: 1100, sellingPrice: 1650, gstPercent: 18 },
        { partName: 'Air Filter', partNumber: 'SP-FIL-AIR', hsnCode: '84213100', brand: 'MGP', model: 'Swift', variant: 'VXI', stockQuantity: 25, lowStockThreshold: 8, purchasePrice: 200, sellingPrice: 320, gstPercent: 18 },
        { partName: 'Oil Filter', partNumber: 'SP-FIL-OIL', hsnCode: '84212300', brand: 'MGP', model: 'Alto / Swift', variant: 'All', stockQuantity: 30, lowStockThreshold: 8, purchasePrice: 120, sellingPrice: 220, gstPercent: 18 },
        { partName: 'Gear Box Fluid (80W-90)', partNumber: 'SP-GRB-FLD', hsnCode: '27101980', brand: 'Castrol', model: 'Universal', variant: 'All', stockQuantity: 18, lowStockThreshold: 5, purchasePrice: 300, sellingPrice: 450, gstPercent: 18 },
        { partName: 'Automatic Transmission Fluid', partNumber: 'SP-ATF-FLD', hsnCode: '27101980', brand: 'Castrol', model: 'Universal', variant: 'All', stockQuantity: 12, lowStockThreshold: 4, purchasePrice: 550, sellingPrice: 800, gstPercent: 18 },
        { partName: 'Differential Fluid (90W)', partNumber: 'SP-DFF-FLD', hsnCode: '27101980', brand: 'Castrol', model: 'Universal', variant: 'All', stockQuantity: 10, lowStockThreshold: 4, purchasePrice: 320, sellingPrice: 480, gstPercent: 18 },
        { partName: 'Brake & Clutch Fluid (DOT 4)', partNumber: 'SP-BRK-DOT4', hsnCode: '38190000', brand: 'Bosch', model: 'Universal', variant: 'All', stockQuantity: 22, lowStockThreshold: 6, purchasePrice: 120, sellingPrice: 220, gstPercent: 18 },
        { partName: 'Power Steering Fluid', partNumber: 'SP-PST-FLD', hsnCode: '27101980', brand: 'Castrol', model: 'Universal', variant: 'All', stockQuantity: 15, lowStockThreshold: 5, purchasePrice: 180, sellingPrice: 290, gstPercent: 18 },
        { partName: 'Battery Water / Fluid', partNumber: 'SP-BAT-WTR', hsnCode: '28539030', brand: 'Exide', model: 'Universal', variant: 'All', stockQuantity: 60, lowStockThreshold: 15, purchasePrice: 15, sellingPrice: 40, gstPercent: 18 },
        { partName: 'Windscreen Washer Concentrate', partNumber: 'SP-WSH-CONC', hsnCode: '34022090', brand: '3M', model: 'Universal', variant: 'All', stockQuantity: 45, lowStockThreshold: 10, purchasePrice: 25, sellingPrice: 60, gstPercent: 18 },
        { partName: 'Coolant Concentrate', partNumber: 'SP-CLT-CONC', hsnCode: '38200000', brand: 'Golden Crux', model: 'Universal', variant: 'All', stockQuantity: 20, lowStockThreshold: 5, purchasePrice: 210, sellingPrice: 350, gstPercent: 18 },
        { partName: 'Cabin A/C Filter', partNumber: 'SP-FIL-CABIN', hsnCode: '84213100', brand: 'Bosch', model: 'Swift', variant: 'VXI / ZXI', stockQuantity: 15, lowStockThreshold: 5, purchasePrice: 220, sellingPrice: 380, gstPercent: 18 },
        { partName: 'Fuel Filter Assembly', partNumber: 'SP-FIL-FUEL', hsnCode: '84212300', brand: 'MGP', model: 'Swift Diesel', variant: 'LDI / VDI', stockQuantity: 12, lowStockThreshold: 4, purchasePrice: 310, sellingPrice: 550, gstPercent: 18 },
        { partName: 'Alternator Fan Belt', partNumber: 'SP-BLT-ALT', hsnCode: '40103190', brand: 'Gates', model: 'Swift', variant: 'All', stockQuantity: 8, lowStockThreshold: 3, purchasePrice: 240, sellingPrice: 450, gstPercent: 18 },
        { partName: 'Spark Plug (Iridium)', partNumber: 'SP-SPK-IRID', hsnCode: '85111000', brand: 'NGK', model: 'Swift / Dzire', variant: 'VXI', stockQuantity: 40, lowStockThreshold: 12, purchasePrice: 150, sellingPrice: 280, gstPercent: 18 },
        { partName: 'Suspension Front Bushing Kit', partNumber: 'SP-SUS-BSH', hsnCode: '87088000', brand: 'MGP', model: 'Swift / Dzire', variant: 'All', stockQuantity: 6, lowStockThreshold: 2, purchasePrice: 600, sellingPrice: 1100, gstPercent: 18 },
        { partName: 'Rubber Mud Flap Set', partNumber: 'SP-MUD-FLAP', hsnCode: '40169990', brand: 'MGP', model: 'Swift', variant: 'All', stockQuantity: 14, lowStockThreshold: 4, purchasePrice: 180, sellingPrice: 320, gstPercent: 18 },
        { partName: 'Fuel Injector Assembly', partNumber: 'SP-INJ-FUEL', hsnCode: '84099199', brand: 'Bosch', model: 'i20', variant: 'Asta', stockQuantity: 5, lowStockThreshold: 2, purchasePrice: 1800, sellingPrice: 2800, gstPercent: 18 },
        { partName: 'Headlight Bulb (H4 12V)', partNumber: 'SP-BLB-H4', hsnCode: '85392120', brand: 'Philips', model: 'Universal', variant: 'All', stockQuantity: 30, lowStockThreshold: 8, purchasePrice: 90, sellingPrice: 180, gstPercent: 18 },
        { partName: 'Tail / Brake Light Bulb', partNumber: 'SP-BLB-TAIL', hsnCode: '85392990', brand: 'Philips', model: 'Universal', variant: 'All', stockQuantity: 25, lowStockThreshold: 5, purchasePrice: 30, sellingPrice: 70, gstPercent: 18 },
        { partName: 'Turn Signal Indicator Bulb', partNumber: 'SP-BLB-SIG', hsnCode: '85392990', brand: 'Philips', model: 'Universal', variant: 'All', stockQuantity: 25, lowStockThreshold: 5, purchasePrice: 25, sellingPrice: 60, gstPercent: 18 },
        { partName: 'Premium Wiper Blades Set', partNumber: 'SP-WIP-PREM', hsnCode: '85124000', brand: 'Bosch', model: 'Swift', variant: 'All', stockQuantity: 12, lowStockThreshold: 4, purchasePrice: 280, sellingPrice: 480, gstPercent: 18 },
        { partName: 'Dual Tone Horn Assembly', partNumber: 'SP-HRN-DUAL', hsnCode: '85123010', brand: 'Hella', model: 'Universal', variant: 'All', stockQuantity: 8, lowStockThreshold: 3, purchasePrice: 350, sellingPrice: 650, gstPercent: 18 },
        { partName: 'Drive Shaft Dust Cover (CV Boot)', partNumber: 'SP-SHF-BOOT', hsnCode: '40169990', brand: 'MGP', model: 'Swift / Dzire', variant: 'All', stockQuantity: 16, lowStockThreshold: 5, purchasePrice: 140, sellingPrice: 260, gstPercent: 18 }
      ];
      await Inventory.insertMany(defaultParts);
      console.log('Seeded default inventory parts catalog.');
    }

    // 3. Seed Customers, Vehicles, and Job Cards (Enabled for in-memory / testing mode)
    const JobCard = require('./models/JobCard');
    const jobCardCount = await JobCard.countDocuments();
    if (global.isInMemoryFallback && jobCardCount === 0) {
      console.log('Seeding default customers, vehicles and job cards...');
      
      const Customer = require('./models/Customer');
      const Vehicle = require('./models/Vehicle');

      const advisorUser = await User.findOne({ role: 'Service' }) || await User.findOne({ role: 'Admin' });
      const advisorId = advisorUser ? advisorUser._id : new mongoose.Types.ObjectId();
      const advisorName = advisorUser ? advisorUser.name : 'Demo Advisor';

      // Seed Customers
      const cust1 = new Customer({
        name: 'Rahul Sharma',
        mobile: '9949479765',
        email: 'rahul@example.com',
        address: 'Plot 45, Jubilee Hills, Hyderabad',
        gstNumber: '36AABCM1234F1Z0',
        type: 'Individual'
      });
      await cust1.save();

      const cust3 = new Customer({
        name: 'National Insurance Agency',
        mobile: '9900112233',
        email: 'claims@nationalins.com',
        address: 'Koti, Hyderabad',
        gstNumber: '36AAACN9999A1Z9',
        type: 'Insurance'
      });
      await cust3.save();

      // Seed Vehicles
      const veh1 = new Vehicle({
        vehicleNumber: 'TS09EP1234',
        chassisNumber: 'MA3FDB123456789',
        engineNumber: 'K12M12345',
        make: 'Maruti Suzuki',
        model: 'Swift',
        variant: 'VXI',
        fuelType: 'Petrol',
        odometerReading: 45000,
        customerId: cust1._id
      });
      await veh1.save();

      const veh2 = new Vehicle({
        vehicleNumber: 'AP28TV9999',
        chassisNumber: 'MA3FDB987654321',
        engineNumber: 'D13A98765',
        make: 'Hyundai',
        model: 'i20',
        variant: 'Asta',
        fuelType: 'Diesel',
        odometerReading: 82000,
        customerId: cust3._id
      });
      await veh2.save();

      // Seed Job Cards
      const jc1 = new JobCard({
        jobCardNo: 'JC-20260619-001',
        time: '10:30',
        customerId: cust1._id,
        vehicleId: veh1._id,
        odometerReading: 45000,
        serviceType: 'General Servicing',
        workCategory: 'RR',
        jobType: 'Cash Job',
        status: 'Ready for Delivery',
        fuelLevel: '1/2',
        inspectionChecklist: { engineOil: 'OK', gearboxFluid: 'OK', brakeClutchFluid: 'Not OK' },
        accessories: { toolKit: 'Yes', spareWheel: 'Yes' },
        complaints: ['Front bumper damaged', 'Slight brake noise'],
        damageMarkings: [{ x: 150, y: 200, type: 'Scratch', description: 'Left bumper scratch' }],
        advisorNotes: 'Suggest brake pad replacement',
        serviceAdvisorId: advisorId,
        serviceAdvisorName: advisorName,
        technicianName: 'Suresh Kumar',
        qcName: 'Anil Kumar',
        floorInchargeName: 'Vikram Singh',
        estAmt: 3500
      });
      await jc1.save();

      const jc2 = new JobCard({
        jobCardNo: 'JC-20260626-002',
        time: '11:15',
        customerId: cust1._id,
        vehicleId: veh1._id,
        odometerReading: 45200,
        serviceType: 'Accident Repair',
        workCategory: 'B/P',
        jobType: 'Cash Job',
        status: 'Body Shop',
        fuelLevel: '1/4',
        inspectionChecklist: { engineOil: 'OK', gearboxFluid: 'OK' },
        accessories: { toolKit: 'Yes', spareWheel: 'Yes' },
        complaints: ['Rear panel dent and scratches', 'Bumper misalignment'],
        damageMarkings: [{ x: 300, y: 150, type: 'Dent', description: 'Rear panel dent' }],
        advisorNotes: 'Repair rear dent and repaint panel',
        serviceAdvisorId: advisorId,
        serviceAdvisorName: advisorName,
        technicianName: 'Rajesh Patil',
        qcName: 'Anil Kumar',
        floorInchargeName: 'Vikram Singh',
        estAmt: 8500,
        bodyShopDetails: JSON.stringify({
          dentProgress: 40,
          paintProgress: 10,
          chassisProgress: 0,
          glassProgress: 0,
          bumperProgress: 20,
          labourDetails: 'Dent pulling completed, prepping for paint.',
          notes: 'Bumper brackets need correction.'
        })
      });
      await jc2.save();

      const jc3 = new JobCard({
        jobCardNo: 'JC-20260626-003',
        time: '09:00',
        customerId: cust3._id,
        vehicleId: veh2._id,
        odometerReading: 82500,
        serviceType: 'Accident Repair',
        workCategory: 'Insurance Jobs',
        jobType: 'Insurance Job',
        status: 'Body Shop',
        fuelLevel: '1/2',
        inspectionChecklist: { engineOil: 'OK', gearboxFluid: 'OK' },
        accessories: { toolKit: 'Yes', spareWheel: 'Yes', jack: 'Yes' },
        complaints: ['Front end impact damage', 'Right fender dent', 'Windshield cracked'],
        damageMarkings: [
          { x: 100, y: 120, type: 'Crack', description: 'Front windshield crack' },
          { x: 140, y: 180, type: 'Paint Damage', description: 'Right fender scrape' }
        ],
        advisorNotes: 'Surveyor claim approved. Replace windshield, repair and paint fender.',
        serviceAdvisorId: advisorId,
        serviceAdvisorName: advisorName,
        technicianName: 'Suresh Kumar',
        qcName: 'Anil Kumar',
        floorInchargeName: 'Vikram Singh',
        estAmt: 24000,
        bodyShopDetails: JSON.stringify({
          dentProgress: 80,
          paintProgress: 60,
          chassisProgress: 50,
          glassProgress: 100,
          bumperProgress: 90,
          labourDetails: 'Windshield replaced. Fender dent removed, base coat applied.',
          notes: 'Waiting for paint curing.'
        })
      });
      await jc3.save();

      // Seed default Estimates and Invoices matching jc1
      const Estimate = require('./models/Estimate');
      const Invoice = require('./models/Invoice');

      const est1 = new Estimate({
        estimateNo: 'EST-20260619-001',
        jobCardId: jc1._id,
        parts: [
          { name: 'Engine Oil (10W-40)', qty: 1, rate: 600, gstPercent: 18, amount: 600, gstAmount: 108, total: 708 },
          { name: 'Oil Filter', qty: 1, rate: 220, gstPercent: 18, amount: 220, gstAmount: 39.6, total: 259.6 }
        ],
        labour: [
          { description: 'General Service Labour', rate: 1200, gstPercent: 18, amount: 1200, gstAmount: 216, total: 1416 }
        ],
        totals: {
          partsTotal: 820,
          labourTotal: 1200,
          gstTotal: 363.6,
          grandTotal: 2383.6
        },
        status: 'Approved',
        date: new Date('2026-06-19T11:00:00Z')
      });
      await est1.save();

      const inv1 = new Invoice({
        invoiceNo: 'INV-20260619-001',
        jobCardId: jc1._id,
        estimateId: est1._id,
        customerId: cust1._id,
        vehicleId: veh1._id,
        gstDetails: {
          companyGSTIN: '36AAJCM4778P1Z0',
          customerGSTIN: cust1.gstNumber || '36AABCM1234F1Z0',
          isInterstate: false
        },
        parts: [
          { name: 'Engine Oil (10W-40)', qty: 1, rate: 600, gstPercent: 18, amount: 600, gstAmount: 108, cgstAmount: 54, sgstAmount: 54, total: 708 },
          { name: 'Oil Filter', qty: 1, rate: 220, gstPercent: 18, amount: 220, gstAmount: 39.6, cgstAmount: 19.8, sgstAmount: 19.8, total: 259.6 }
        ],
        labour: [
          { description: 'General Service Labour', rate: 1200, gstPercent: 18, amount: 1200, gstAmount: 216, cgstAmount: 108, sgstAmount: 108, total: 1416 }
        ],
        totals: {
          partsTotal: 820,
          labourTotal: 1200,
          cgstTotal: 181.8,
          sgstTotal: 181.8,
          igstTotal: 0,
          gstTotal: 363.6,
          grandTotal: 2383.6
        },
        grandTotalWords: 'Rupees Two Thousand Three Hundred and Eighty Three and Sixty Paise Only',
        invoiceType: 'Tax Invoice',
        paymentStatus: 'Paid',
        paymentMethod: 'Cash',
        amountPaid: 2383.6,
        status: 'Finalized',
        date: new Date('2026-06-19T12:00:00Z')
      });
      await inv1.save();

      console.log('Seeded default customers, vehicles, job cards, estimates, and invoices.');
    }
  } catch (err) {
    console.error('Error seeding database:', err);
  }
}

// Connect to MongoDB & Start Server
mongoose.connection.on('connected', () => {
  console.log('Connected to MongoDB');
});
mongoose.connection.on('error', (err) => {
  console.error('MongoDB Error:', err);
});
mongoose.connection.on('disconnected', () => {
  console.log('MongoDB Disconnected');
});
mongoose.connection.on('reconnected', () => {
  console.log('MongoDB Reconnected successfully');
});

console.log('Connecting MongoDB...');
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  family: 4, // Force IPv4 to resolve querySrv/DNS issues on Atlas connections
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000
})
.then(async () => {
  console.log('Connected to MongoDB successfully at', MONGODB_URI);
  await seedDatabase();
  await migrateWeeklyOffAttendance();
})
.catch((err) => {
  console.error('MongoDB connection error (Starting server anyway in warning mode):', err);
});

// Self-healing migration for Weekly Off attendance records
async function migrateWeeklyOffAttendance() {
  try {
    const Employee = require('./models/Employee');
    const employees = await Employee.find({});
    let totalMigrated = 0;
    
    for (const emp of employees) {
      let isUpdated = false;
      emp.attendance = emp.attendance.map((att) => {
        if (att.status === 'Weekly Off') {
          totalMigrated++;
          isUpdated = true;
          return {
            ...att.toObject(),
            status: 'Present',
            isWeeklyOff: true,
            weeklyOff: true
          };
        }
        return att;
      });
      if (isUpdated) {
        await emp.save();
      }
    }
    if (totalMigrated > 0) {
      console.log(`[Self-healing Migration] Standardized ${totalMigrated} legacy 'Weekly Off' records to 'Present' with weeklyOff=true.`);
    }
  } catch (err) {
    console.error('[Self-healing Migration] Weekly Off standardization failed:', err);
  }
}

console.log('Listening on PORT...');
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
