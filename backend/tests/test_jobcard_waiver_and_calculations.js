/**
 * Complete Financial Calculation & Waive-Off Feature Test Suite
 * MVSS Automobiles ERP
 *
 * Verifies all 10 Scenarios:
 * 1. Estimate ₹3,681.60, advance ₹2,000 -> estimated balance ₹1,681.60.
 * 2. Estimate ₹5,000, no advance -> estimated balance ₹5,000.
 * 3. Invoice ₹10,000, advance ₹2,000, additional payment ₹3,000 -> outstanding ₹5,000.
 * 4. Invoice ₹10,000, advance ₹2,000, waiver ₹1,000 -> net payable ₹9,000, outstanding ₹7,000.
 * 5. Invoice ₹10,000, advance ₹2,000, payment ₹3,000, waiver ₹1,000 -> net payable ₹9,000, outstanding ₹4,000.
 * 6. Full payment -> outstanding ₹0 and status Fully Paid.
 * 7. Full approved waiver -> outstanding ₹0 and status Waived / Fully Settled.
 * 8. Unauthorized user attempts waiver -> rejected with 403 Forbidden.
 * 9. Waiver reversal -> restores balance, marks waiver Reversed, preserves audit trail.
 * 10. Multiple advances and multiple payments -> accurate calculation without duplicate counting.
 */

const assert = require('assert');
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const JobCard = require('../models/JobCard');
const Invoice = require('../models/Invoice');
const User = require('../models/User');
const { computeFinancials, roundToTwo, recalculateJobCardFinancials } = require('../services/financialCalculationService');

const jobcardsRouter = require('../routes/jobcards');
const invoicesRouter = require('../routes/invoices');
const reportsRouter = require('../routes/reports');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/jobcards', jobcardsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/reports', reportsRouter);

async function runAllTests() {
  console.log('========================================================================');
  console.log('  TEST SUITE: JOBCARD FINANCIAL CALCULATIONS & WAIVE-OFF FEATURE        ');
  console.log('========================================================================\n');

  // ==========================================
  // SECTION 1: Pure Calculation Unit Tests
  // ==========================================
  console.log('--- SECTION 1: Pure Calculation Unit Tests ---');

  // Scenario 1
  {
    const res = computeFinancials({
      estimatedRepairAmount: 3681.60,
      finalBillAmount: 0,
      advancePayments: [{ amount: 2000, paymentMode: 'UPI' }],
      finalPayments: [],
      waivers: []
    });
    assert.strictEqual(res.estimatedRepairAmount, 3681.60, 'S1: Estimated Repair Amount should be 3681.60');
    assert.strictEqual(res.totalAdvance, 2000, 'S1: Total Advance should be 2000');
    assert.strictEqual(res.estimatedBalanceDue, 1681.60, 'S1: Estimated Balance Due should be 1681.60');
    assert.strictEqual(res.excessAdvanceCredit, 0, 'S1: Excess Advance Credit should be 0');
    console.log('✓ Scenario 1 (Unit): Estimate ₹3,681.60 - Advance ₹2,000 = Estimated Balance Due ₹1,681.60');
  }

  // Scenario 2
  {
    const res = computeFinancials({
      estimatedRepairAmount: 5000,
      finalBillAmount: 0,
      advancePayments: [],
      finalPayments: [],
      waivers: []
    });
    assert.strictEqual(res.estimatedRepairAmount, 5000, 'S2: Estimated Repair Amount should be 5000');
    assert.strictEqual(res.totalAdvance, 0, 'S2: Total Advance should be 0');
    assert.strictEqual(res.estimatedBalanceDue, 5000, 'S2: Estimated Balance Due should be 5000');
    assert.strictEqual(res.excessAdvanceCredit, 0, 'S2: Excess Advance Credit should be 0');
    console.log('✓ Scenario 2 (Unit): Estimate ₹5,000, no advance = Entire ₹5,000 remains due');
  }

  // Scenario 3
  {
    const res = computeFinancials({
      finalBillAmount: 10000,
      advancePayments: [{ amount: 2000, paymentMode: 'Cash' }],
      finalPayments: [{ amount: 3000, paymentType: 'UPI' }],
      waivers: []
    });
    assert.strictEqual(res.finalBillAmount, 10000, 'S3: Final Bill should be 10000');
    assert.strictEqual(res.totalAdvance, 2000, 'S3: Total Advance should be 2000');
    assert.strictEqual(res.totalFinal, 3000, 'S3: Total Final should be 3000');
    assert.strictEqual(res.totalReceived, 5000, 'S3: Total Received should be 5000');
    assert.strictEqual(res.netAmountPayable, 10000, 'S3: Net Amount Payable should be 10000');
    assert.strictEqual(res.outstandingBalance, 5000, 'S3: Outstanding Balance should be 5000');
    assert.strictEqual(res.paymentStatus, 'Partially Paid', 'S3: Payment Status should be Partially Paid');
    console.log('✓ Scenario 3 (Unit): Invoice ₹10,000 - Advance ₹2,000 - Additional ₹3,000 = Outstanding ₹5,000');
  }

  // Scenario 4
  {
    const res = computeFinancials({
      finalBillAmount: 10000,
      advancePayments: [{ amount: 2000, paymentMode: 'Bank Transfer' }],
      finalPayments: [],
      waivers: [{ amount: 1000, status: 'Active' }]
    });
    assert.strictEqual(res.totalWaived, 1000, 'S4: Total Waived should be 1000');
    assert.strictEqual(res.netAmountPayable, 9000, 'S4: Net Payable should be 9000 (10000 - 1000)');
    assert.strictEqual(res.totalAdvance, 2000, 'S4: Advance should be 2000');
    assert.strictEqual(res.outstandingBalance, 7000, 'S4: Outstanding should be 7000 (9000 - 2000)');
    console.log('✓ Scenario 4 (Unit): Invoice ₹10,000 - Waiver ₹1,000 = Net ₹9,000; - Advance ₹2,000 = Outstanding ₹7,000');
  }

  // Scenario 5
  {
    const res = computeFinancials({
      finalBillAmount: 10000,
      advancePayments: [{ amount: 2000, paymentMode: 'Cash' }],
      finalPayments: [{ amount: 3000, paymentType: 'UPI' }],
      waivers: [{ amount: 1000, status: 'Active' }]
    });
    assert.strictEqual(res.netAmountPayable, 9000, 'S5: Net Payable should be 9000');
    assert.strictEqual(res.totalReceived, 5000, 'S5: Total Received should be 5000');
    assert.strictEqual(res.outstandingBalance, 4000, 'S5: Outstanding should be 4000 (9000 - 5000)');
    console.log('✓ Scenario 5 (Unit): Invoice ₹10,000 - Waiver ₹1,000 - Advance ₹2,000 - Payment ₹3,000 = Outstanding ₹4,000');
  }

  // Scenario 6
  {
    const res = computeFinancials({
      finalBillAmount: 10000,
      advancePayments: [{ amount: 4000, paymentMode: 'Cash' }],
      finalPayments: [{ amount: 6000, paymentType: 'Bank Transfer' }],
      waivers: []
    });
    assert.strictEqual(res.totalReceived, 10000, 'S6: Total Received should be 10000');
    assert.strictEqual(res.outstandingBalance, 0, 'S6: Outstanding should be 0');
    assert.strictEqual(res.paymentStatus, 'Fully Paid', 'S6: Payment Status should be Fully Paid');
    assert.strictEqual(res.invoicePaymentStatus, 'Paid', 'S6: Invoice Payment Status should be Paid');
    console.log('✓ Scenario 6 (Unit): Full Payment -> Outstanding ₹0, Payment Status Fully Paid');
  }

  // Scenario 7
  {
    const res = computeFinancials({
      finalBillAmount: 10000,
      advancePayments: [{ amount: 3000, paymentMode: 'Cash' }],
      finalPayments: [{ amount: 2000, paymentType: 'UPI' }],
      waivers: [{ amount: 5000, status: 'Active' }]
    });
    assert.strictEqual(res.totalWaived, 5000, 'S7: Total Waived should be 5000');
    assert.strictEqual(res.netAmountPayable, 5000, 'S7: Net Payable should be 5000');
    assert.strictEqual(res.totalReceived, 5000, 'S7: Total Received should be 5000');
    assert.strictEqual(res.outstandingBalance, 0, 'S7: Outstanding should be 0');
    assert.strictEqual(res.paymentStatus, 'Waived / Fully Settled', 'S7: Status should be Waived / Fully Settled');
    console.log('✓ Scenario 7 (Unit): Full Approved Waiver of remaining balance -> Outstanding ₹0, Status Waived / Fully Settled');
  }

  // Scenario 10
  {
    const res = computeFinancials({
      finalBillAmount: 15000,
      advancePayments: [
        { amount: 1500, paymentMode: 'Cash' },
        { amount: 2500, paymentMode: 'UPI' }
      ],
      finalPayments: [
        { amount: 3000, paymentType: 'Bank Transfer' },
        { amount: 2000, paymentType: 'QR / Scanner Payment' }
      ],
      waivers: [
        { amount: 1000, status: 'Active' }
      ]
    });
    assert.strictEqual(res.totalAdvance, 4000, 'S10: Total Advance should be 4000 (1500 + 2500)');
    assert.strictEqual(res.totalFinal, 5000, 'S10: Total Final should be 5000 (3000 + 2000)');
    assert.strictEqual(res.totalReceived, 9000, 'S10: Total Received should be 9000 (4000 + 5000)');
    assert.strictEqual(res.totalWaived, 1000, 'S10: Total Waived should be 1000');
    assert.strictEqual(res.netAmountPayable, 14000, 'S10: Net Payable should be 14000');
    assert.strictEqual(res.outstandingBalance, 5000, 'S10: Outstanding should be 5000 (14000 - 9000)');
    assert.strictEqual(res.paymentStatus, 'Partially Paid', 'S10: Status should be Partially Paid');
    console.log('✓ Scenario 10 (Unit): Multiple advances & payments correctly aggregated without double-counting\n');
  }

  // ==========================================
  // SECTION 2: End-to-End Database & API Tests
  // ==========================================
  console.log('--- SECTION 2: End-to-End Database & API Integration Tests ---');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB Atlas.');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  let adminUser = await User.findOne({ role: 'Super Admin', active: true }) || await User.findOne({ role: 'Admin', active: true });
  assert(adminUser, 'Admin user must exist');
  const adminToken = jwt.sign({ _id: adminUser._id, role: adminUser.role, name: adminUser.name }, JWT_SECRET);

  let nonAuthUser = await User.findOne({ role: 'Reception' }) || await User.findOne({ role: 'Service' });
  if (!nonAuthUser) {
    nonAuthUser = await User.create({
      name: 'Test Reception Staff',
      email: `test_reception_${Date.now()}@mvss.com`,
      role: 'Reception',
      password: 'hashed_password_123',
      active: true
    });
  }
  const nonAuthToken = jwt.sign({ _id: nonAuthUser._id, role: nonAuthUser.role, name: nonAuthUser.name }, JWT_SECRET);

  const cleanupIds = { customers: [], vehicles: [], jobcards: [], invoices: [] };

  try {
    // Create base Customer & Vehicle
    const testCust = await Customer.create({
      name: 'Waiver Audit Customer',
      mobile: '9876543210',
      type: 'Individual'
    });
    cleanupIds.customers.push(testCust._id);

    const testVeh = await Vehicle.create({
      vehicleNumber: `TS09WA${Math.floor(1000 + Math.random() * 9000)}`,
      customerId: testCust._id,
      make: 'Hyundai',
      model: 'Creta',
      fuelType: 'Petrol',
      odometerReading: 22000
    });
    cleanupIds.vehicles.push(testVeh._id);

    // TEST E2E SCENARIO 1 & 2: Advance Payments & Estimated Balance Due
    const jc1 = await JobCard.create({
      jobCardNo: `JC-TEST-CALC-${Date.now()}`,
      time: '10:00 AM',
      customerId: testCust._id,
      vehicleId: testVeh._id,
      serviceAdvisorId: adminUser._id,
      serviceAdvisorName: adminUser.name || 'Admin Advisor',
      odometerReading: 25000,
      estAmt: 3681.60,
      status: 'Work in Progress'
    });
    cleanupIds.jobcards.push(jc1._id);

    // Initial check (no advance yet -> Scenario 2 check)
    await recalculateJobCardFinancials(jc1);
    await jc1.save();
    assert.strictEqual(jc1.financialSummary.estimatedRepairAmount, 3681.60);
    assert.strictEqual(jc1.financialSummary.estimatedBalanceDue, 3681.60);
    console.log('✓ E2E Scenario 2: JC without advance has estimatedBalanceDue = ₹3,681.60');

    // Add Advance Payment of ₹2,000 via API
    const addAdvRes = await axios.post(
      `${baseUrl}/jobcards/${jc1._id}/advance-payments`,
      { amount: 2000, type: 'UPI', paymentMode: 'UPI', remarks: 'Part Advance' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(addAdvRes.status, 200);
    const updatedJc1 = await JobCard.findById(jc1._id);
    assert.strictEqual(updatedJc1.financialSummary.totalAdvance, 2000);
    assert.strictEqual(updatedJc1.financialSummary.estimatedBalanceDue, 1681.60);
    console.log('✓ E2E Scenario 1: Advance ₹2,000 recorded via API -> Estimated Balance Due = ₹1,681.60');

    // TEST E2E SCENARIO 3, 4, 5, 8, 9: Invoice + Waiver + Reversal
    const jc2 = await JobCard.create({
      jobCardNo: `JC-TEST-WAIV-${Date.now()}`,
      time: '11:00 AM',
      customerId: testCust._id,
      vehicleId: testVeh._id,
      serviceAdvisorId: adminUser._id,
      serviceAdvisorName: adminUser.name || 'Admin Advisor',
      odometerReading: 26000,
      estAmt: 10000,
      status: 'Work in Progress',
      advancePayments: [{ amount: 2000, type: 'Cash', paymentMode: 'Cash' }]
    });
    cleanupIds.jobcards.push(jc2._id);

    const inv2 = await Invoice.create({
      invoiceNo: `INV-TEST-WAIV-${Date.now()}`,
      jobCardId: jc2._id,
      customerId: testCust._id,
      vehicleId: testVeh._id,
      grandTotalWords: 'Rupees Ten Thousand Only',
      totals: { grandTotal: 10000, roundedGrandTotal: 10000 },
      status: 'Finalized'
    });
    cleanupIds.invoices.push(inv2._id);

    await recalculateJobCardFinancials(jc2, { invoice: inv2 });
    await jc2.save();

    // Check with Invoice & Advance only
    assert.strictEqual(jc2.financialSummary.finalBillAmount, 10000);
    assert.strictEqual(jc2.financialSummary.totalAdvance, 2000);
    assert.strictEqual(jc2.financialSummary.outstandingBalance, 8000);

    // Record Final Payment ₹3,000 via API (Scenario 3 check)
    await axios.post(
      `${baseUrl}/jobcards/${jc2._id}/final-payments`,
      { amount: 3000, paymentType: 'Bank Transfer', remarks: 'Partial final' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const jc2AfterPayment = await JobCard.findById(jc2._id);
    assert.strictEqual(jc2AfterPayment.financialSummary.totalReceived, 5000);
    assert.strictEqual(jc2AfterPayment.financialSummary.outstandingBalance, 5000);
    console.log('✓ E2E Scenario 3: Invoice ₹10,000 - Advance ₹2,000 - Payment ₹3,000 = Outstanding ₹5,000');

    // SCENARIO 8: Unauthorized user attempts waiver -> 403 Forbidden
    try {
      await axios.post(
        `${baseUrl}/jobcards/${jc2._id}/waive-off`,
        { amount: 1000, reason: 'Unauthorized discount attempt' },
        { headers: { Authorization: `Bearer ${nonAuthToken}` } }
      );
      assert.fail('Reception staff should not be allowed to record a waiver');
    } catch (err) {
      assert.strictEqual(err.response.status, 403, 'Should return 403 Forbidden for unauthorized staff');
      console.log('✓ E2E Scenario 8: Unauthorized user (Reception) rejected with 403 Forbidden');
    }

    // SCENARIO 4 & 5: Record Authorized Waiver of ₹1,000
    const waiverRes = await axios.post(
      `${baseUrl}/jobcards/${jc2._id}/waive-off`,
      {
        amount: 1000,
        reason: 'Customer Negotiation on labour charges',
        category: 'Customer Negotiation',
        approvedBy: adminUser.name,
        remarks: 'Approved by management'
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(waiverRes.status, 200);

    const jc2AfterWaiver = await JobCard.findById(jc2._id);
    assert.strictEqual(jc2AfterWaiver.financialSummary.totalWaived, 1000);
    assert.strictEqual(jc2AfterWaiver.financialSummary.netAmountPayable, 9000);
    assert.strictEqual(jc2AfterWaiver.financialSummary.outstandingBalance, 4000);
    assert.strictEqual(jc2AfterWaiver.waivers.length, 1);
    assert.strictEqual(jc2AfterWaiver.waivers[0].status, 'Active');
    assert.strictEqual(jc2AfterWaiver.waivers[0].category, 'Customer Negotiation');
    console.log('✓ E2E Scenario 5: Authorized Waiver ₹1,000 recorded -> Net Payable ₹9,000, Outstanding Balance ₹4,000');

    // SCENARIO 9: Waiver Reversal
    const waiverId = jc2AfterWaiver.waivers[0]._id;
    const reverseRes = await axios.post(
      `${baseUrl}/jobcards/${jc2._id}/waivers/${waiverId}/reverse`,
      { reversalReason: 'Negotiation cancelled as warranty claim approved instead' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(reverseRes.status, 200);

    const jc2AfterReversal = await JobCard.findById(jc2._id);
    assert.strictEqual(jc2AfterReversal.financialSummary.totalWaived, 0);
    assert.strictEqual(jc2AfterReversal.financialSummary.netAmountPayable, 10000);
    assert.strictEqual(jc2AfterReversal.financialSummary.outstandingBalance, 5000);
    assert.strictEqual(jc2AfterReversal.waivers[0].status, 'Reversed');
    assert.strictEqual(jc2AfterReversal.waivers[0].reversalReason, 'Negotiation cancelled as warranty claim approved instead');
    console.log('✓ E2E Scenario 9: Waiver Reversal restores balance to ₹5,000 & marks waiver Reversed with full audit trail');

    // SCENARIO 7: Full Approved Waiver of remaining eligible balance
    const fullWaiverRes = await axios.post(
      `${baseUrl}/jobcards/${jc2._id}/waive-off`,
      {
        amount: 5000,
        reason: 'Service recovery approved by management',
        category: 'Service Recovery',
        approvedBy: adminUser.name
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(fullWaiverRes.status, 200);
    const jc2FullyWaived = await JobCard.findById(jc2._id);
    assert.strictEqual(jc2FullyWaived.financialSummary.totalWaived, 5000);
    assert.strictEqual(jc2FullyWaived.financialSummary.netAmountPayable, 5000);
    assert.strictEqual(jc2FullyWaived.financialSummary.outstandingBalance, 0);
    assert.strictEqual(jc2FullyWaived.paymentStatus, 'Waived / Fully Settled');
    console.log('✓ E2E Scenario 7: Full remaining balance waived -> Outstanding ₹0, Payment Status "Waived / Fully Settled"');

    // SCENARIO 6: Full Payment on a Job Card
    const jc3 = await JobCard.create({
      jobCardNo: `JC-TEST-FULL-${Date.now()}`,
      time: '12:00 PM',
      customerId: testCust._id,
      vehicleId: testVeh._id,
      serviceAdvisorId: adminUser._id,
      serviceAdvisorName: adminUser.name || 'Admin Advisor',
      odometerReading: 27000,
      status: 'Work in Progress'
    });
    cleanupIds.jobcards.push(jc3._id);

    const inv3 = await Invoice.create({
      invoiceNo: `INV-TEST-FULL-${Date.now()}`,
      jobCardId: jc3._id,
      customerId: testCust._id,
      vehicleId: testVeh._id,
      grandTotalWords: 'Rupees Eight Thousand Only',
      totals: { grandTotal: 8000, roundedGrandTotal: 8000 },
      status: 'Finalized'
    });
    cleanupIds.invoices.push(inv3._id);

    await axios.post(
      `${baseUrl}/jobcards/${jc3._id}/final-payments`,
      { amount: 8000, paymentType: 'Cash', remarks: 'Paid in full' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const jc3Paid = await JobCard.findById(jc3._id);
    assert.strictEqual(jc3Paid.financialSummary.outstandingBalance, 0);
    assert.strictEqual(jc3Paid.paymentStatus, 'Fully Paid');
    console.log('✓ E2E Scenario 6: Full Payment recorded -> Outstanding ₹0, Payment Status Fully Paid');

    // PENDING PAYMENTS REPORT & EXPORTS
    const reportRes = await axios.get(
      `${baseUrl}/reports/pending-payments?jobCardNumber=${jc2.jobCardNo}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(reportRes.status, 200);
    assert(reportRes.data.summary.totalRecords !== undefined);

    const excelRes = await axios.get(
      `${baseUrl}/reports/pending-payments/export/excel?jobCardNumber=${jc2.jobCardNo}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(excelRes.status, 200);
    assert(excelRes.data.includes('Approved Waiver / Discount'));
    assert(excelRes.data.includes('Net Amount Payable'));
    console.log('✓ Reports: Pending Payments Excel export includes Approved Waiver & Net Payable columns');

    const pdfRes = await axios.get(
      `${baseUrl}/reports/pending-payments/export/pdf?jobCardNumber=${jc2.jobCardNo}`,
      { headers: { Authorization: `Bearer ${adminToken}` }, responseType: 'arraybuffer' }
    );
    assert.strictEqual(pdfRes.status, 200);
    assert(pdfRes.data.length > 500);
    console.log('✓ Reports: Pending Payments PDF export generated successfully');

  } finally {
    // Cleanup test documents
    await JobCard.deleteMany({ _id: { $in: cleanupIds.jobcards } });
    await Invoice.deleteMany({ _id: { $in: cleanupIds.invoices } });
    await Vehicle.deleteMany({ _id: { $in: cleanupIds.vehicles } });
    await Customer.deleteMany({ _id: { $in: cleanupIds.customers } });
    if (nonAuthUser && nonAuthUser.email.startsWith('test_reception_')) {
      await User.deleteOne({ _id: nonAuthUser._id });
    }
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    console.log('\n✓ Cleaned up test documents and disconnected from MongoDB.');
  }

  console.log('\n========================================================================');
  console.log('  ALL 10 SCENARIOS PASSED WITH 100% SUCCESS!                             ');
  console.log('========================================================================\n');
}

runAllTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
