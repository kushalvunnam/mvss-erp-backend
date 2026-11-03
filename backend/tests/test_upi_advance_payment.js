/**
 * Test Suite: UPI Advance Payment Validation & UI Verification
 * MVSS Automobiles ERP
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

async function runTests() {
  console.log('========================================================================');
  console.log('  TEST SUITE: UPI ADVANCE PAYMENT VALIDATION & UI VERIFICATION');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB.');

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;

  let adminUser = await User.findOne({ role: 'Super Admin', active: true }) || await User.findOne({ role: 'Admin', active: true });
  assert(adminUser, 'Admin or Super Admin user must exist');

  const adminToken = jwt.sign(
    { _id: adminUser._id, role: adminUser.role, name: adminUser.name },
    JWT_SECRET
  );

  const testCustomer = await Customer.create({
    name: 'UPI Advance Test Customer',
    mobile: '9876543210',
    type: 'Individual'
  });

  const testVehicle = await Vehicle.create({
    customerId: testCustomer._id,
    vehicleNumber: 'AP09UP1234',
    make: 'Hyundai',
    model: 'Creta',
    fuelType: 'Petrol',
    transmission: 'Manual',
    year: 2022,
    odometerReading: 20000
  });

  try {
    // -------------------------------------------------------------
    // TEST 1: Direct Mongoose Model Validation with Multiple UPI Advances
    // -------------------------------------------------------------
    console.log('--- TEST 1: Direct Mongoose Model Validation with Multiple UPI Payments ---');
    const directJobCard = new JobCard({
      jobCardNo: 'MVSS/JC/TEST/UPI-DIRECT',
      date: new Date(),
      time: '10:00 AM',
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      odometerReading: 20000,
      serviceAdvisorId: adminUser._id,
      status: 'Work in Progress',
      advancePayments: [
        {
          amount: 1000,
          type: 'Cash',
          paymentMode: 'Cash',
          transactionId: 'TXN-CASH-1'
        },
        {
          amount: 2500,
          type: 'UPI',
          paymentMode: 'UPI',
          transactionId: 'UPI-UTR-99887766'
        },
        {
          amount: 1500,
          type: 'upi', // Lowercase test
          paymentMode: 'upi',
          transactionId: 'UPI-UTR-55443322'
        }
      ]
    });

    // Validate directly
    await directJobCard.validate();
    console.log('  [PASS] Direct document validation passed with no errors.');

    // Assert that payment at index 1 and 2 are normalized to 'UPI'
    assert.strictEqual(directJobCard.advancePayments[1].type, 'UPI');
    assert.strictEqual(directJobCard.advancePayments[1].paymentMode, 'UPI');
    assert.strictEqual(directJobCard.advancePayments[2].type, 'UPI');
    assert.strictEqual(directJobCard.advancePayments[2].paymentMode, 'UPI');
    console.log('  [PASS] Values normalized cleanly to "UPI" in schema.');

    // -------------------------------------------------------------
    // TEST 2: API End-to-End Test: Record Advance 0 (Cash) and Advance 1 (UPI)
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Record Advance Payments via API (Advance 0 = Cash, Advance 1 = UPI) ---');
    const apiJobCard = await JobCard.create({
      jobCardNo: 'MVSS/JC/TEST/UPI-API',
      date: new Date(),
      time: '10:30 AM',
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      odometerReading: 20000,
      serviceAdvisorId: adminUser._id,
      status: 'Work in Progress',
      financialSummary: {
        estimatedRepairAmount: 10000,
        estimatedBalanceDue: 10000,
        totalAdvance: 0,
        outstandingBalance: 10000
      }
    });

    // 1st Deposit: Cash ₹2,000
    const res1 = await request(
      server,
      'POST',
      `/api/jobcards/${apiJobCard._id}/advance-payments`,
      { Authorization: `Bearer ${adminToken}` },
      {
        amount: 2000,
        type: 'Cash',
        paymentMode: 'Cash',
        transactionId: 'CASH-REC-1',
        remarks: 'Initial cash token'
      }
    );
    assert.strictEqual(res1.status, 200, `Expected 200, got: ${JSON.stringify(res1.data)}`);
    assert.strictEqual(res1.data.advancePayments.length, 1);
    console.log('  [PASS] Advance payment 0 (Cash ₹2,000) recorded.');

    // 2nd Deposit: UPI ₹3,500 (index 1) - this was the user's reported error location!
    const res2 = await request(
      server,
      'POST',
      `/api/jobcards/${apiJobCard._id}/advance-payments`,
      { Authorization: `Bearer ${adminToken}` },
      {
        amount: 3500,
        type: 'UPI',
        paymentMode: 'UPI',
        transactionId: 'UPI1234567890',
        remarks: 'Google Pay advance payment'
      }
    );
    assert.strictEqual(res2.status, 200, `Expected 200, got: ${JSON.stringify(res2.data)}`);
    assert.strictEqual(res2.data.advancePayments.length, 2);

    const adv1 = res2.data.advancePayments[1];
    assert.strictEqual(adv1.type, 'UPI');
    assert.strictEqual(adv1.paymentMode, 'UPI');
    assert.strictEqual(adv1.amount, 3500);
    assert.strictEqual(adv1.transactionId, 'UPI1234567890');
    console.log('  [PASS] Advance payment 1 (UPI ₹3,500) successfully recorded without enum validation error.');

    // Check financial calculations
    assert.strictEqual(res2.data.financialSummary.totalAdvance, 5500); // 2000 + 3500
    assert.strictEqual(res2.data.financialSummary.estimatedBalanceDue, 4500); // 10000 - 5500
    assert.strictEqual(res2.data.financialSummary.outstandingBalance, 4500);
    console.log('  [PASS] Financial calculations verified: Total Advance = ₹5,500, Estimated Balance Due = ₹4,500.');

    // -------------------------------------------------------------
    // TEST 3: Accounts Executive Role Access
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Accounts Executive Role Permission ---');
    const acctExecUser = await User.findOne({ role: 'Accounts Executive', active: true }) || await User.create({
      name: 'Test Accounts Executive',
      email: 'acct.exec.test@example.com',
      password: 'Password123!',
      role: 'Accounts Executive',
      active: true
    });

    const acctExecToken = jwt.sign(
      { _id: acctExecUser._id, role: acctExecUser.role, name: acctExecUser.name },
      JWT_SECRET
    );

    const res3 = await request(
      server,
      'POST',
      `/api/jobcards/${apiJobCard._id}/advance-payments`,
      { Authorization: `Bearer ${acctExecToken}` },
      {
        amount: 1000,
        type: 'UPI',
        paymentMode: 'UPI',
        transactionId: 'UPI-ACCT-EXEC-1',
        remarks: 'Advance entered by Accounts Executive'
      }
    );
    assert.strictEqual(res3.status, 200, `Accounts Executive should be permitted to record advance payments`);
    assert.strictEqual(res3.data.advancePayments.length, 3);
    console.log('  [PASS] Accounts Executive successfully recorded UPI advance payment.');

    // -------------------------------------------------------------
    // TEST 4: Frontend UI Verification - Dynamic QR Panel Removed
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Frontend Verification - Dynamic UPI QR Panel Removal ---');
    const frontendFile = path.join(__dirname, '../../frontend/src/pages/JobCardDetails.jsx');
    const frontendContent = fs.readFileSync(frontendFile, 'utf8');

    // Ensure Dynamic UPI QR Code is NOT inside the Record New Deposit form
    const recordNewDepositIndex = frontendContent.indexOf('Record New Deposit');
    assert(recordNewDepositIndex !== -1, 'Record New Deposit section must exist');

    // Extract the Record New Deposit form content
    const formEnd = frontendContent.indexOf('</form>', recordNewDepositIndex);
    const formSection = frontendContent.substring(recordNewDepositIndex, formEnd);

    // Checks that the QR panel elements are completely absent from Record New Deposit:
    assert(!formSection.includes('Dynamic UPI QR Code'), 'Dynamic UPI QR Code heading must be removed from Record New Deposit');
    assert(!formSection.includes('api.qrserver.com'), 'QR code image must be removed from Record New Deposit');
    assert(!formSection.includes('upiConfig.businessVpa'), 'VPA copy section must be removed from Record New Deposit');
    assert(!formSection.includes('Scan with GPay'), 'Scan payment instructions must be removed from Record New Deposit');
    assert(formSection.includes('Confirm Payment Received'), 'Confirm Payment Received button must be present');
    assert(formSection.includes('<option value="UPI">UPI</option>'), 'UPI must remain available in Payment Mode dropdown');
    console.log('  [PASS] Verified frontend: Dynamic UPI QR code panel is completely removed from Record New Deposit while keeping all required fields.');

    console.log('\n========================================================================');
    console.log('  ALL TESTS PASSED SUCCESSFULLY! (100% PASS RATE)');
    console.log('========================================================================');
  } finally {
    // Cleanup
    await JobCard.deleteMany({ jobCardNo: { $regex: 'TEST/UPI' } });
    await Customer.deleteOne({ _id: testCustomer._id });
    await Vehicle.deleteOne({ _id: testVehicle._id });
    server.close();
    await mongoose.disconnect();
  }
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
