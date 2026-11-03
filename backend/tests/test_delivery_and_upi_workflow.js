/**
 * Automated Verification Suite: Delivery with Payment Pending, Invoice Workflow & UPI Payments
 * MVSS Automobiles ERP
 *
 * Verifies Test Cases A through K:
 * Test A: Delivery to 'Delivered – Payment Pending' without an invoice (PDI passed, Estimate approved)
 * Test B: Delivery rejected when PDI is NOT passed
 * Test C: Delivery rejected when customer estimate exists but is NOT approved
 * Test D: Delivery to 'Delivered – Payment Pending' when invoice exists with pending balance
 * Test E: Generate invoice for a Job Card already in 'Delivered – Payment Pending' (status & delivery details preserved)
 * Test F: Duplicate invoice generation prevention
 * Test G: Add advance payment with modes UPI, QR / Scanner Payment, Bank Transfer, Card, Cheque, Other, and case variations
 * Test H: UPI Configuration endpoint GET /api/jobcards/upi-config
 * Test I: Financial calculation without invoice: Outstanding Balance = Estimated - Advance - Waiver
 * Test J: Financial calculation with invoice: Outstanding Balance = Final Invoice - Advance - Waiver - Final Payments
 * Test K: Pending Payments report includes Delivered – Invoice Pending and invoiced records + Excel/PDF export
 */

const assert = require('assert');
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const JobCard = require('../models/JobCard');
const Estimate = require('../models/Estimate');
const Invoice = require('../models/Invoice');
const User = require('../models/User');

const jobcardsRouter = require('../routes/jobcards');
const invoicesRouter = require('../routes/invoices');
const reportsRouter = require('../routes/reports');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/jobcards', jobcardsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/reports', reportsRouter);

async function runTestSuite() {
  console.log('========================================================================');
  console.log('  TEST SUITE: DELIVERY WITH PAYMENT PENDING, INVOICE & UPI QR WORKFLOW ');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB Atlas.\n');

  let adminUser = await User.findOne({ role: 'Super Admin', active: true }) || await User.findOne({ role: 'Admin', active: true });
  assert(adminUser, 'Admin or Super Admin user must exist');

  const adminToken = jwt.sign(
    { _id: adminUser._id, role: adminUser.role, name: adminUser.name },
    JWT_SECRET
  );

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const axios = require('axios');

  const headers = {
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  };

  const cleanup = {
    customers: [],
    vehicles: [],
    jobcards: [],
    estimates: [],
    invoices: []
  };

  let passed = 0;
  let total = 0;

  function pass(testName) {
    total++;
    passed++;
    console.log(`  [PASS] ${testName}`);
  }

  function fail(testName, err) {
    total++;
    console.error(`  [FAIL] ${testName}: ${err.message}`);
    throw err;
  }

  try {
    // Setup test customer and vehicle
    const customer = await Customer.create({
      name: 'Test Customer Delivery Flow',
      mobile: '9876543299',
      type: 'Individual'
    });
    cleanup.customers.push(customer._id);

    const vehicle = await Vehicle.create({
      vehicleNumber: `TS09TEST${Math.floor(1000 + Math.random() * 9000)}`,
      customerId: customer._id,
      make: 'Hyundai',
      model: 'Creta',
      fuelType: 'Petrol',
      odometerReading: 25000
    });
    cleanup.vehicles.push(vehicle._id);

    const createTestJobCard = async (overrides = {}) => {
      const jc = await JobCard.create({
        jobCardNo: `JC-TEST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        time: '10:00 AM',
        customerId: customer._id,
        vehicleId: vehicle._id,
        serviceAdvisorId: adminUser._id,
        serviceAdvisorName: adminUser.name || 'Admin Advisor',
        odometerReading: 25000,
        status: 'Work in Progress',
        serviceType: 'General Servicing',
        ...overrides
      });
      cleanup.jobcards.push(jc._id);
      return jc;
    };

    console.log('--- TEST A: Delivery to Delivered – Payment Pending without invoice ---');
    // Create Job Card
    const jcA = await createTestJobCard({
      jobCardNo: `JC-TEST-A-${Date.now()}`,
      status: 'Pre-Delivery Inspection',
      qcStatus: 'Pass',
      estAmt: 4500,
      advancePayments: [{ amount: 1500, paymentMode: 'Cash', type: 'Cash' }]
    });

    // Create an Approved estimate
    const estA = await Estimate.create({
      estimateNo: `EST-TEST-A-${Date.now()}`,
      jobCardId: jcA._id,
      customerId: customer._id,
      vehicleId: vehicle._id,
      status: 'Approved',
      totals: { grandTotal: 4500, roundedGrandTotal: 4500 }
    });
    cleanup.estimates.push(estA._id);

    // Move to Delivered – Payment Pending without creating an invoice
    const resA = await axios.put(`${baseUrl}/jobcards/${jcA._id}`, {
      status: 'Delivered – Payment Pending',
      deliveredBy: {
        name: 'Staff Rahul',
        date: new Date(),
        time: '03:30 PM'
      },
      creditDueDate: new Date(Date.now() + 15 * 86400000),
      statusRemarks: 'Delivered without invoice under approval'
    }, { headers });

    assert.strictEqual(resA.status, 200);
    assert.strictEqual(resA.data.status, 'Delivered – Payment Pending');
    assert.strictEqual(resA.data.deliveredBy.name, 'Staff Rahul');
    const invCheckA = await Invoice.findOne({ jobCardId: jcA._id, status: { $ne: 'Cancelled' } });
    assert.strictEqual(invCheckA, null, 'Invoice must not be generated automatically');
    pass('Test A: Move to Delivered – Payment Pending without invoice succeeds with delivery details');

    console.log('\n--- TEST B: Delivery rejected when PDI is NOT passed ---');
    const jcB = await createTestJobCard({
      jobCardNo: `JC-TEST-B-${Date.now()}`,
      status: 'Pre-Delivery Inspection',
      qcStatus: 'Fail',
      estAmt: 3000
    });

    try {
      await axios.put(`${baseUrl}/jobcards/${jcB._id}`, {
        status: 'Delivered – Payment Pending',
        deliveredBy: { name: 'Staff Rahul' }
      }, { headers });
      assert.fail('Should have failed because PDI is not Pass');
    } catch (err) {
      assert.strictEqual(err.response.status, 400);
      assert(err.response.data.error.includes('Pre-Delivery Inspection (PDI) must be completed'));
      pass('Test B: Delivery rejected with 400 when PDI status is not Pass');
    }

    console.log('\n--- TEST C: Delivery rejected when estimate exists but is NOT approved ---');
    const jcC = await createTestJobCard({
      jobCardNo: `JC-TEST-C-${Date.now()}`,
      status: 'Pre-Delivery Inspection',
      qcStatus: 'Pass',
      estAmt: 5000
    });

    const estC = await Estimate.create({
      estimateNo: `EST-TEST-C-${Date.now()}`,
      jobCardId: jcC._id,
      customerId: customer._id,
      vehicleId: vehicle._id,
      status: 'Waiting for Approval', // NOT Approved
      totals: { grandTotal: 5000, roundedGrandTotal: 5000 }
    });
    cleanup.estimates.push(estC._id);

    try {
      await axios.put(`${baseUrl}/jobcards/${jcC._id}`, {
        status: 'Delivered – Payment Pending',
        deliveredBy: { name: 'Staff Rahul' }
      }, { headers });
      assert.fail('Should have failed because Estimate is not Approved');
    } catch (err) {
      assert.strictEqual(err.response.status, 400);
      assert(err.response.data.error.includes('Customer Estimate must be approved before vehicle delivery'));
      pass('Test C: Delivery rejected with 400 when Estimate is not Approved');
    }

    console.log('\n--- TEST D: Delivery to Delivered – Payment Pending when invoice exists ---');
    const jcD = await createTestJobCard({
      jobCardNo: `JC-TEST-D-${Date.now()}`,
      status: 'Pre-Delivery Inspection',
      qcStatus: 'Pass',
      estAmt: 6000
    });

    const estD = await Estimate.create({
      estimateNo: `EST-TEST-D-${Date.now()}`,
      jobCardId: jcD._id,
      customerId: customer._id,
      vehicleId: vehicle._id,
      status: 'Approved',
      totals: { grandTotal: 6000, roundedGrandTotal: 6000 }
    });
    cleanup.estimates.push(estD._id);

    // Create an invoice with pending balance
    const invD = await Invoice.create({
      invoiceNo: `INV-TEST-D-${Date.now()}`,
      jobCardId: jcD._id,
      customerId: customer._id,
      vehicleId: vehicle._id,
      grandTotalWords: 'Six Thousand Only',
      totals: { grandTotal: 6000, roundedGrandTotal: 6000 },
      balanceDue: 6000,
      paymentStatus: 'Unpaid',
      status: 'Finalized'
    });
    cleanup.invoices.push(invD._id);

    const resD = await axios.put(`${baseUrl}/jobcards/${jcD._id}`, {
      status: 'Delivered – Payment Pending',
      deliveredBy: {
        name: 'Staff Ramesh',
        date: new Date(),
        time: '05:00 PM'
      },
      creditDueDate: new Date(Date.now() + 30 * 86400000)
    }, { headers });

    assert.strictEqual(resD.status, 200);
    assert.strictEqual(resD.data.status, 'Delivered – Payment Pending');
    assert.strictEqual(resD.data.deliveredBy.name, 'Staff Ramesh');
    pass('Test D: Move to Delivered – Payment Pending with existing invoice succeeds');

    console.log('\n--- TEST E: Generate invoice for Job Card already in Delivered – Payment Pending ---');
    // Using jcA which was delivered without invoice in Test A
    const resE = await axios.post(`${baseUrl}/invoices`, {
      jobCardId: jcA._id,
      estimateId: estA._id,
      parts: [
        { name: 'Engine Oil Filter', qty: 1, rate: 500, discountPercent: 0, discountAmount: 0, gstPercent: 18, amount: 500, gstAmount: 90, total: 590 }
      ],
      labour: [
        { description: 'General Service Labour', qty: 1, rate: 3313.56, discountPercent: 0, discountAmount: 0, gstPercent: 18, amount: 3313.56, gstAmount: 596.44, total: 3910 }
      ]
    }, { headers });

    assert([200, 201].includes(resE.status));
    cleanup.invoices.push(resE.data._id);
    const updatedJcA = await JobCard.findById(jcA._id);
    assert.strictEqual(updatedJcA.status, 'Delivered – Payment Pending', 'Must preserve Delivered – Payment Pending status');
    assert.strictEqual(updatedJcA.deliveredBy.name, 'Staff Rahul', 'Must preserve delivery staff');
    assert(updatedJcA.financialSummary.outstandingBalance > 0, 'Must have outstanding balance');
    pass('Test E: Invoice generation preserves Delivered – Payment Pending status and delivery details');

    console.log('\n--- TEST F: Duplicate invoice generation prevention ---');
    try {
      await axios.post(`${baseUrl}/invoices`, {
        jobCardId: jcA._id,
        parts: [{ name: 'Duplicate Part', qty: 1, rate: 100, gstPercent: 18, amount: 100, gstAmount: 18, total: 118 }]
      }, { headers });
      assert.fail('Should have failed because active invoice already exists');
    } catch (err) {
      assert.strictEqual(err.response.status, 400);
      assert(err.response.data.error.includes('already exists for this Job Card'));
      pass('Test F: Duplicate invoice generation rejected with 400 error');
    }

    console.log('\n--- TEST G: Payment modes normalization (UPI, QR, Card, Bank Transfer, Cheque, Other) ---');
    const jcG = await createTestJobCard({
      jobCardNo: `JC-TEST-G-${Date.now()}`,
      estAmt: 10000
    });

    const modesToTest = [
      { mode: 'UPI', expected: 'UPI' },
      { mode: 'upi', expected: 'UPI' },
      { mode: 'QR / Scanner Payment', expected: 'QR / Scanner Payment' },
      { mode: 'Bank Transfer', expected: 'Bank Transfer' },
      { mode: 'Card', expected: 'Card' },
      { mode: 'Cheque', expected: 'Cheque' },
      { mode: 'Other', expected: 'Other' },
      { mode: 'cash', expected: 'Cash' }
    ];

    for (let i = 0; i < modesToTest.length; i++) {
      const { mode, expected } = modesToTest[i];
      const resAdv = await axios.post(`${baseUrl}/jobcards/${jcG._id}/advance-payments`, {
        amount: 500,
        paymentMode: mode,
        transactionId: `TXN-${i}-${Date.now()}`,
        remarks: `Test payment ${mode}`
      }, { headers });

      assert.strictEqual(resAdv.status, 200);
      const added = resAdv.data.advancePayments[resAdv.data.advancePayments.length - 1];
      assert.strictEqual(added.paymentMode, expected, `Expected mode ${expected} for input ${mode}`);
    }
    pass('Test G: All payment modes (UPI, QR, Card, Bank Transfer, Cheque, Other) saved and normalized cleanly');

    console.log('\n--- TEST H: UPI Configuration endpoint GET /api/jobcards/upi-config ---');
    const resH = await axios.get(`${baseUrl}/jobcards/upi-config`, { headers });
    assert.strictEqual(resH.status, 200);
    assert(resH.data.businessVpa, 'Must return businessVpa');
    assert.strictEqual(resH.data.isConfigured, true, 'isConfigured must be true');
    pass(`Test H: UPI configuration endpoint returns VPA: ${resH.data.businessVpa} (Payee: ${resH.data.businessName})`);

    console.log('\n--- TEST I: Financial calculation without invoice ---');
    const jcI = await createTestJobCard({
      jobCardNo: `JC-TEST-I-${Date.now()}`,
      estAmt: 5000,
      advancePayments: [{ amount: 2000, paymentMode: 'UPI' }],
      waivers: [{ amount: 500, reason: 'Special Discount', category: 'Customer Negotiation', approvedBy: 'Admin' }]
    });

    const { recalculateJobCardFinancials } = require('../services/financialCalculationService');
    await recalculateJobCardFinancials(jcI);
    assert.strictEqual(jcI.financialSummary.estimatedRepairAmount, 5000);
    assert.strictEqual(jcI.financialSummary.totalAdvance, 2000);
    assert.strictEqual(jcI.financialSummary.totalWaived, 500);
    assert.strictEqual(jcI.financialSummary.netAmountPayable, 4500);
    assert.strictEqual(jcI.financialSummary.outstandingBalance, 2500);
    assert.strictEqual(jcI.financialSummary.estimatedBalanceDue, 2500);
    pass('Test I: Financial calculation without invoice: 5000 - 500 waiver - 2000 advance = 2500 outstanding');

    console.log('\n--- TEST J: Financial calculation with invoice ---');
    const invJ = await Invoice.create({
      invoiceNo: `INV-TEST-J-${Date.now()}`,
      jobCardId: jcI._id,
      customerId: customer._id,
      vehicleId: vehicle._id,
      grandTotalWords: 'Six Thousand Only',
      totals: { grandTotal: 6000, roundedGrandTotal: 6000 },
      balanceDue: 3500,
      paymentStatus: 'Partially Paid',
      status: 'Finalized'
    });
    cleanup.invoices.push(invJ._id);

    // Record a final payment of 1000
    jcI.finalPayments = [{ amount: 1000, paymentType: 'UPI', transactionId: 'TXN-FIN-1' }];
    await recalculateJobCardFinancials(jcI, { invoice: invJ });
    assert.strictEqual(jcI.financialSummary.finalBillAmount, 6000);
    assert.strictEqual(jcI.financialSummary.totalWaived, 500);
    assert.strictEqual(jcI.financialSummary.netAmountPayable, 5500);
    assert.strictEqual(jcI.financialSummary.totalReceived, 3000); // 2000 adv + 1000 fin
    assert.strictEqual(jcI.financialSummary.outstandingBalance, 2500); // 5500 net - 3000 rec = 2500
    pass('Test J: Financial calculation with invoice: 6000 - 500 waiver - 3000 total received = 2500 outstanding');

    console.log('\n--- TEST K: Pending Payments report includes Delivered – Invoice Pending and exports ---');
    const resK = await axios.get(`${baseUrl}/reports/pending-payments`, { headers });
    assert.strictEqual(resK.status, 200);
    assert(Array.isArray(resK.data.items), 'items must be an array');
    
    // Check if jcA (delivered without invoice initially) or jcD is included
    const deliveredPendingRecord = resK.data.items.find(i => ['Delivered – Payment Pending', 'Delivered - Payment Pending'].includes(i.jobCardStatus));
    assert(deliveredPendingRecord, 'Report must include Delivered – Payment Pending records');

    // Excel CSV export
    const resCsv = await axios.get(`${baseUrl}/reports/pending-payments/export/excel`, { headers });
    assert.strictEqual(resCsv.status, 200);
    assert(resCsv.headers['content-type'].includes('text/csv'), 'Excel export must be CSV');
    assert(resCsv.data.includes('Job Card No'), 'CSV must contain headers');

    // PDF export
    const resPdf = await axios.get(`${baseUrl}/reports/pending-payments/export/pdf`, {
      headers,
      responseType: 'arraybuffer'
    });
    assert.strictEqual(resPdf.status, 200);
    assert.strictEqual(resPdf.headers['content-type'], 'application/pdf');
    assert(resPdf.data.length > 500, 'PDF content must be non-empty');
    pass('Test K: Pending Payments report includes Delivered – Payment Pending, and CSV/PDF exports succeed');

    console.log('\n========================================================================');
    console.log(`  ALL ${passed}/${total} TEST CASES PASSED SUCCESSFULLY! (100% PASS RATE)`);
    console.log('========================================================================\n');

  } catch (err) {
    fail('Test execution error', err);
  } finally {
    console.log('Cleaning up test data...');
    if (cleanup.invoices.length > 0) await Invoice.deleteMany({ _id: { $in: cleanup.invoices } });
    if (cleanup.estimates.length > 0) await Estimate.deleteMany({ _id: { $in: cleanup.estimates } });
    if (cleanup.jobcards.length > 0) await JobCard.deleteMany({ _id: { $in: cleanup.jobcards } });
    if (cleanup.vehicles.length > 0) await Vehicle.deleteMany({ _id: { $in: cleanup.vehicles } });
    if (cleanup.customers.length > 0) await Customer.deleteMany({ _id: { $in: cleanup.customers } });
    console.log('✓ Cleanup complete.');
    await mongoose.disconnect();
    server.close();
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
