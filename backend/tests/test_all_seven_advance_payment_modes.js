/**
 * Comprehensive Verification Suite: ALL SEVEN ADVANCE PAYMENT MODES
 * MVSS Automobiles ERP
 *
 * Tests actual API & MongoDB operations for:
 * 1. Cash
 * 2. UPI
 * 3. Card
 * 4. Bank Transfer
 * 5. Cheque
 * 6. QR / Scanner Payment
 * 7. Other
 *
 * Verifies for each mode:
 * - Successful save via POST /api/jobcards/:id/advance-payments
 * - Exact paymentMode and type stored in MongoDB
 * - Running totalAdvance & estimatedBalanceDue updates
 * - Duplicate payment prevention (HTTP 409)
 * - Historical / legacy payment compatibility
 * - Frontend options and UI verification
 */

const assert = require('assert');
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const JobCard = require('../models/JobCard');
const User = require('../models/User');
const jobcardsRouter = require('../routes/jobcards');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/jobcards', jobcardsRouter);

async function request(server, method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://localhost:${server.address().port}`);
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode, data: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runAllPaymentModeTests() {
  console.log('========================================================================');
  console.log('  TEST SUITE: ALL SEVEN ADVANCE PAYMENT MODES — MVSS ERP AUDIT');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB Atlas.');

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));

  let adminUser = await User.findOne({ role: 'Super Admin', active: true }) || await User.findOne({ role: 'Admin', active: true });
  assert(adminUser, 'Admin or Super Admin user must exist');

  const adminToken = jwt.sign(
    { _id: adminUser._id, role: adminUser.role, name: adminUser.name },
    JWT_SECRET
  );

  const testCustomer = await Customer.create({
    name: 'All Payment Modes Customer',
    mobile: '9876543211',
    type: 'Individual'
  });

  const testVehicle = await Vehicle.create({
    customerId: testCustomer._id,
    vehicleNumber: 'TS09PAY7777',
    make: 'Maruti Suzuki',
    model: 'Swift',
    fuelType: 'Petrol',
    transmission: 'Manual',
    year: 2023,
    odometerReading: 15000
  });

  const testJobCard = await JobCard.create({
    jobCardNo: 'MVSS/JC/TEST/ALL-MODES',
    date: new Date(),
    time: '11:00 AM',
    customerId: testCustomer._id,
    vehicleId: testVehicle._id,
    odometerReading: 15000,
    serviceAdvisorId: adminUser._id,
    status: 'Work in Progress',
    estAmt: 50000,
    financialSummary: {
      estimatedRepairAmount: 50000,
      estimatedBalanceDue: 50000,
      totalAdvance: 0,
      outstandingBalance: 50000
    }
  });

  const paymentModesToTest = [
    {
      mode: 'Cash',
      amount: 5000,
      txnId: '',
      remarks: 'Counter cash deposit'
    },
    {
      mode: 'UPI',
      amount: 6000,
      txnId: 'UPI-REF-20261103-01',
      remarks: 'PhonePe deposit'
    },
    {
      mode: 'Card',
      amount: 7000,
      txnId: 'POS-AUTH-4821',
      remarks: 'HDFC Card Swipe'
    },
    {
      mode: 'Bank Transfer',
      amount: 8000,
      txnId: 'NEFT-AXIS-992211',
      remarks: 'NEFT Transfer'
    },
    {
      mode: 'Cheque',
      amount: 9000,
      txnId: 'CHQ-882200',
      remarks: 'ICICI Bank Cheque'
    },
    {
      mode: 'QR / Scanner Payment',
      amount: 4000,
      txnId: 'QR-TXN-773311',
      remarks: 'BharatPe Scanner deposit'
    },
    {
      mode: 'Other',
      amount: 3000,
      txnId: 'VOUCHER-CORP-01',
      remarks: 'Corporate adjustment voucher'
    }
  ];

  try {
    let expectedRunningTotal = 0;

    for (let i = 0; i < paymentModesToTest.length; i++) {
      const p = paymentModesToTest[i];
      expectedRunningTotal += p.amount;
      const expectedBalance = 50000 - expectedRunningTotal;

      console.log(`\n--- MODE ${i + 1}/7: Testing '${p.mode}' (₹${p.amount}) ---`);

      const res = await request(
        server,
        'POST',
        `/api/jobcards/${testJobCard._id}/advance-payments`,
        { Authorization: `Bearer ${adminToken}` },
        {
          amount: p.amount,
          type: p.mode,
          paymentMode: p.mode,
          transactionId: p.txnId,
          remarks: p.remarks
        }
      );

      assert.strictEqual(
        res.status,
        200,
        `Failed to record '${p.mode}' payment: ${JSON.stringify(res.data)}`
      );

      // Verify returned JobCard data
      assert.strictEqual(
        res.data.advancePayments.length,
        i + 1,
        `Expected ${i + 1} advance payments, got ${res.data.advancePayments.length}`
      );

      const savedPayment = res.data.advancePayments[i];
      assert.strictEqual(savedPayment.paymentMode, p.mode, `paymentMode should be ${p.mode}`);
      assert.strictEqual(savedPayment.type, p.mode, `type should be ${p.mode}`);
      assert.strictEqual(savedPayment.amount, p.amount, `amount should be ${p.amount}`);
      assert.strictEqual(savedPayment.transactionId, p.txnId, `transactionId should match`);
      assert.strictEqual(savedPayment.remarks, p.remarks, `remarks should match`);

      // Verify MongoDB saved document directly
      const dbJobCard = await JobCard.findById(testJobCard._id);
      const dbPayment = dbJobCard.advancePayments[i];
      assert.strictEqual(dbPayment.paymentMode, p.mode);
      assert.strictEqual(dbPayment.type, p.mode);
      assert.strictEqual(dbPayment.amount, p.amount);

      // Verify financial calculations
      assert.strictEqual(
        dbJobCard.financialSummary.totalAdvance,
        expectedRunningTotal,
        `Total advance should be ₹${expectedRunningTotal}`
      );
      assert.strictEqual(
        dbJobCard.financialSummary.estimatedBalanceDue,
        expectedBalance,
        `Estimated balance due should be ₹${expectedBalance}`
      );

      console.log(`  [PASS] '${p.mode}' saved successfully.`);
      console.log(`  [PASS] Stored in MongoDB: type='${dbPayment.type}', paymentMode='${dbPayment.paymentMode}', amount=₹${dbPayment.amount}.`);
      console.log(`  [PASS] Financials updated: Total Advance=₹${dbJobCard.financialSummary.totalAdvance}, Estimated Balance Due=₹${dbJobCard.financialSummary.estimatedBalanceDue}.`);
    }

    // -------------------------------------------------------------
    // DUPLICATE PAYMENT PREVENTION TEST
    // -------------------------------------------------------------
    console.log('\n--- Duplicate Payment Prevention Test ---');
    const duplicateAttempt = await request(
      server,
      'POST',
      `/api/jobcards/${testJobCard._id}/advance-payments`,
      { Authorization: `Bearer ${adminToken}` },
      {
        amount: 3000,
        type: 'Other',
        paymentMode: 'Other',
        transactionId: 'VOUCHER-CORP-01',
        remarks: 'Corporate adjustment voucher'
      }
    );
    assert.strictEqual(duplicateAttempt.status, 409, 'Duplicate payment within 5 seconds must return 409 Conflict');
    console.log('  [PASS] Duplicate payment cleanly rejected with HTTP 409.');

    // -------------------------------------------------------------
    // HISTORICAL RECORD COMPATIBILITY TEST
    // -------------------------------------------------------------
    console.log('\n--- Historical / Legacy Records Compatibility Test ---');
    const legacyJobCard = new JobCard({
      jobCardNo: 'MVSS/JC/TEST/LEGACY-MODES',
      date: new Date(),
      time: '12:00 PM',
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      odometerReading: 15000,
      serviceAdvisorId: adminUser._id,
      status: 'Work in Progress',
      advancePayments: [
        {
          amount: 1500,
          type: 'Card Swipe',
          paymentMode: 'Card Swipe',
          transactionId: 'LEGACY-SWIPE-01'
        },
        {
          amount: 2500,
          type: 'Online',
          paymentMode: 'Online',
          transactionId: 'LEGACY-ONLINE-02'
        },
        {
          amount: 3500,
          type: 'Scanner Payment (QR)',
          paymentMode: 'Scanner Payment (QR)',
          transactionId: 'LEGACY-SCANNER-03'
        }
      ]
    });

    await legacyJobCard.validate();
    console.log('  [PASS] Mongoose validation passed for existing historical records (Card Swipe, Online, Scanner Payment (QR)).');

    // -------------------------------------------------------------
    // FRONTEND VERIFICATION TEST
    // -------------------------------------------------------------
    console.log('\n--- Frontend UI Options & QR Absence Test ---');
    const frontendFile = path.join(__dirname, '../../frontend/src/pages/JobCardDetails.jsx');
    const frontendContent = fs.readFileSync(frontendFile, 'utf8');

    // Check all 7 options in frontend select
    const expectedOptions = [
      '<option value="Cash">Cash</option>',
      '<option value="UPI">UPI</option>',
      '<option value="Card">Card</option>',
      '<option value="Bank Transfer">Bank Transfer</option>',
      '<option value="Cheque">Cheque</option>',
      '<option value="QR / Scanner Payment">QR / Scanner Payment</option>',
      '<option value="Other">Other</option>'
    ];

    for (const opt of expectedOptions) {
      assert(frontendContent.includes(opt), `Dropdown must include: ${opt}`);
    }
    console.log('  [PASS] All 7 payment mode options verified in frontend dropdown.');

    // Check that Dynamic UPI QR Code is completely absent from JobCardDetails
    assert(!frontendContent.includes('Dynamic UPI QR Code'), 'Dynamic UPI QR Code must not be present');
    assert(!frontendContent.includes('api.qrserver.com'), 'QR code generation must not be present');
    assert(!frontendContent.includes('Dynamic UPI Settlement QR'), 'Dynamic UPI Settlement QR must not be present');
    console.log('  [PASS] No QR code generation or instructions in frontend.');

    console.log('\n========================================================================');
    console.log('  ALL SEVEN PAYMENT MODES TESTED AND PASSED WITH 100% SUCCESS!');
    console.log('========================================================================\n');
  } finally {
    await JobCard.deleteMany({ jobCardNo: { $regex: 'TEST/' } });
    await Customer.deleteOne({ _id: testCustomer._id });
    await Vehicle.deleteOne({ _id: testVehicle._id });
    server.close();
    await mongoose.disconnect();
  }
}

runAllPaymentModeTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
