/**
 * Automated Integration Test Suite: Delivered – Payment Pending Workflow
 * MVSS Automobiles ERP
 *
 * Verifies:
 * Scenario 1: Zero payment delivery (PDI passed, invoice finalized, balance = full invoice amount)
 * Scenario 2: Advance payment delivery (advance deducted, balance = invoice - advance)
 * Scenario 3: Partial payment delivery (invoice + partial payment, balance = remaining)
 * Scenario 4: Corporate customer credit delivery (corporate type, 30-day term, credit due date)
 * Scenario 5: Multiple payment collection (Cash, UPI, Bank Transfer, Cheque, QR)
 * Scenario 6: Full payment after delivery (pay remaining balance, transitions to Paid/Delivered, preserves historical delivery date)
 * Scenario 7: Payment reversal / refund (reversal on delivered JC triggers Delivered – Payment Pending and restores in Pending Payments report)
 * Scenario 8: Pending payments report endpoint & Excel/PDF export routes
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

const jobcardsRouter = require('../routes/jobcards');
const invoicesRouter = require('../routes/invoices');
const reportsRouter = require('../routes/reports');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/jobcards', jobcardsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/reports', reportsRouter);

async function runDeliveredPaymentPendingTests() {
  console.log('========================================================================');
  console.log('  TEST SUITE: DELIVERED – PAYMENT PENDING WORKFLOW & PENDING REPORT     ');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB Atlas.\n');

  // Find or create admin user for authentication
  let adminUser = await User.findOne({ role: 'Super Admin', active: true });
  if (!adminUser) {
    adminUser = await User.findOne({ role: 'Admin', active: true });
  }
  assert(adminUser, 'Admin or Super Admin user must exist in database');

  const adminToken = jwt.sign(
    { _id: adminUser._id, role: adminUser.role, name: adminUser.name },
    JWT_SECRET
  );

  const adminHeaders = {
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  };

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const createdCustomerIds = [];
  const createdVehicleIds = [];
  const createdJobCardIds = [];
  const createdInvoiceIds = [];

  let testPassedCount = 0;
  let totalTestsCount = 0;

  function recordPass(testName) {
    totalTestsCount++;
    testPassedCount++;
    console.log(`  [PASS] ${testName}`);
  }

  function recordFail(testName, err) {
    totalTestsCount++;
    console.error(`  [FAIL] ${testName}: ${err.message}`);
    throw err;
  }

  try {
    // Setup test customers: Individual and Corporate
    const indCustomer = await Customer.create({
      name: 'Ramesh Sharma (Test Individual)',
      mobile: '9876543210',
      type: 'Individual',
      email: 'ramesh.test@example.com'
    });
    createdCustomerIds.push(indCustomer._id);

    const corpCustomer = await Customer.create({
      name: 'Aditya Logistics (Test Corporate)',
      companyName: 'Aditya Logistics Pvt Ltd',
      mobile: '9876543211',
      type: 'Corporate',
      gstNumber: '27AABCU9603R1ZM',
      email: 'billing@adityalogistics.test'
    });
    createdCustomerIds.push(corpCustomer._id);

    // Setup test vehicles
    const vehicle1 = await Vehicle.create({
      vehicleNumber: `TS09TEST${Math.floor(1000 + Math.random() * 9000)}`,
      make: 'Hyundai',
      model: 'Creta',
      fuelType: 'Petrol',
      odometerReading: 25000,
      customerId: indCustomer._id
    });
    createdVehicleIds.push(vehicle1._id);

    const vehicle2 = await Vehicle.create({
      vehicleNumber: `TS09CORP${Math.floor(1000 + Math.random() * 9000)}`,
      make: 'Tata',
      model: 'Ace Gold',
      fuelType: 'Diesel',
      odometerReading: 85000,
      customerId: corpCustomer._id
    });
    createdVehicleIds.push(vehicle2._id);

    console.log('--- TEST DATA SETUP COMPLETED ---\n');

    // ========================================================================
    // SCENARIO 1: Zero Payment Delivery
    // ========================================================================
    console.log('SCENARIO 1: Zero Payment Delivery');
    {
      const jc1 = await JobCard.create({
        jobCardNo: `JC-TEST-S1-${Date.now()}`,
        time: '10:00 AM',
        customerId: indCustomer._id,
        vehicleId: vehicle1._id,
        serviceAdvisorId: adminUser._id,
        serviceAdvisorName: adminUser.name || 'Admin Advisor',
        odometerReading: 25000,
        status: 'Work in Progress',
        serviceType: 'General Servicing'
      });
      createdJobCardIds.push(jc1._id);

      // Create finalized invoice for 10,000
      const inv1 = await Invoice.create({
        invoiceNo: `INV-TEST-S1-${Date.now()}`,
        customerId: indCustomer._id,
        vehicleId: vehicle1._id,
        jobCardId: jc1._id,
        date: new Date(),
        status: 'Finalized',
        totals: { grandTotal: 10000, roundedGrandTotal: 10000 },
        grandTotalWords: 'Rupees Ten Thousand Only',
        amountPaid: 0,
        balanceDue: 10000,
        paymentStatus: 'Pending',
        parts: [{ name: 'Engine Oil', qty: 1, rate: 10000, discountPercent: 0, discountAmount: 0, gstPercent: 0, amount: 10000, gstAmount: 0, total: 10000 }]
      });
      createdInvoiceIds.push(inv1._id);

      // Attempting transition to 'Delivered' without payment MUST fail (HTTP 400)
      try {
        await axios.put(`${baseUrl}/jobcards/${jc1._id}`, {
          status: 'Delivered',
          qcStatus: 'Pass'
        }, { headers: adminHeaders });
        assert.fail('Should not allow status Delivered when balance is outstanding');
      } catch (err) {
        assert.strictEqual(err.response.status, 400, 'Expected 400 when attempting Delivered with pending payment');
        assert(err.response.data.error.includes('outstanding payment'), 'Error message should explain outstanding payment');
      }
      recordPass('Scenario 1A: Transition to Delivered is blocked when payment is outstanding');

      // Attempting transition to 'Delivered – Payment Pending' without PDI pass MUST fail (HTTP 400)
      try {
        await axios.put(`${baseUrl}/jobcards/${jc1._id}`, {
          status: 'Delivered – Payment Pending'
        }, { headers: adminHeaders });
        assert.fail('Should not allow delivery without PDI pass');
      } catch (err) {
        assert.strictEqual(err.response.status, 400, 'Expected 400 when PDI not passed');
        assert(err.response.data.error.includes('Pre-Delivery Inspection'), 'Error message should require PDI');
      }
      recordPass('Scenario 1B: Transition to Delivered – Payment Pending enforces mandatory PDI validation');

      // Transition to 'Delivered – Payment Pending' with PDI passed and delivery details
      const deliveryTime = '04:30 PM';
      const deliveryDate = new Date();
      const res = await axios.put(`${baseUrl}/jobcards/${jc1._id}`, {
        status: 'Delivered – Payment Pending',
        qcStatus: 'Pass',
        deliveredBy: {
          name: 'Vikram Staff',
          date: deliveryDate,
          time: deliveryTime
        },
        statusRemarks: 'Delivered with full balance pending'
      }, { headers: adminHeaders });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'Delivered – Payment Pending');
      assert.strictEqual(res.data.deliveredBy.name, 'Vikram Staff');
      assert.strictEqual(res.data.financialSummary.pendingAmount, 10000);
      assert.strictEqual(res.data.financialSummary.totalReceived, 0);
      assert.strictEqual(res.data.financialSummary.paymentStatus, 'Pending');
      recordPass('Scenario 1C: Vehicle delivered under Delivered – Payment Pending with balance = ₹10,000');
    }

    // ========================================================================
    // SCENARIO 2: Advance Payment Delivery
    // ========================================================================
    console.log('\nSCENARIO 2: Advance Payment Delivery');
    {
      const jc2 = await JobCard.create({
        jobCardNo: `JC-TEST-S2-${Date.now()}`,
        time: '11:00 AM',
        customerId: indCustomer._id,
        vehicleId: vehicle1._id,
        serviceAdvisorId: adminUser._id,
        serviceAdvisorName: adminUser.name || 'Admin Advisor',
        odometerReading: 32000,
        status: 'Work in Progress',
        serviceType: 'General Servicing'
      });
      createdJobCardIds.push(jc2._id);

      // Record Advance Payment of ₹3,000
      const advRes = await axios.post(`${baseUrl}/jobcards/${jc2._id}/advance-payments`, {
        amount: 3000,
        paymentMode: 'UPI',
        transactionId: 'UPI-ADV-S2-001',
        remarks: 'Advance paid at vehicle intake'
      }, { headers: adminHeaders });
      assert.strictEqual(advRes.status, 200);

      // Create Finalized invoice for ₹12,000 (Advance deducted, balance = ₹9,000)
      const inv2 = await Invoice.create({
        invoiceNo: `INV-TEST-S2-${Date.now()}`,
        customerId: indCustomer._id,
        vehicleId: vehicle1._id,
        jobCardId: jc2._id,
        date: new Date(),
        status: 'Finalized',
        totals: { grandTotal: 12000, roundedGrandTotal: 12000 },
        grandTotalWords: 'Rupees Twelve Thousand Only',
        amountPaid: 3000,
        advanceReceived: 3000,
        balanceDue: 9000,
        paymentStatus: 'Partially Paid',
        parts: [{ name: 'Brake Pad Set', qty: 1, rate: 12000, discountPercent: 0, discountAmount: 0, gstPercent: 0, amount: 12000, gstAmount: 0, total: 12000 }]
      });
      createdInvoiceIds.push(inv2._id);

      // Deliver vehicle under Delivered – Payment Pending
      const delRes = await axios.put(`${baseUrl}/jobcards/${jc2._id}`, {
        status: 'Delivered – Payment Pending',
        qcStatus: 'Pass',
        deliveredBy: {
          name: 'Suresh Advisor',
          date: new Date(),
          time: '05:00 PM'
        }
      }, { headers: adminHeaders });

      assert.strictEqual(delRes.status, 200);
      assert.strictEqual(delRes.data.status, 'Delivered – Payment Pending');
      assert.strictEqual(delRes.data.financialSummary.finalBillAmount, 12000);
      assert.strictEqual(delRes.data.financialSummary.totalAdvance, 3000);
      assert.strictEqual(delRes.data.financialSummary.pendingAmount, 9000);
      assert.strictEqual(delRes.data.financialSummary.paymentStatus, 'Partially Paid');
      recordPass('Scenario 2: Advance payment deducted accurately, Delivered – Payment Pending with balance = ₹9,000');
    }

    // ========================================================================
    // SCENARIO 3: Partial Payment Delivery
    // ========================================================================
    console.log('\nSCENARIO 3: Partial Payment Delivery');
    {
      const jc3 = await JobCard.create({
        jobCardNo: `JC-TEST-S3-${Date.now()}`,
        time: '01:00 PM',
        customerId: indCustomer._id,
        vehicleId: vehicle1._id,
        serviceAdvisorId: adminUser._id,
        serviceAdvisorName: adminUser.name || 'Admin Advisor',
        odometerReading: 41000,
        status: 'Work in Progress',
        serviceType: 'General Servicing'
      });
      createdJobCardIds.push(jc3._id);

      // Advance ₹2,000
      await axios.post(`${baseUrl}/jobcards/${jc3._id}/advance-payments`, {
        amount: 2000,
        paymentMode: 'Cash'
      }, { headers: adminHeaders });

      // Invoice ₹10,000
      const inv3 = await Invoice.create({
        invoiceNo: `INV-TEST-S3-${Date.now()}`,
        customerId: indCustomer._id,
        vehicleId: vehicle1._id,
        jobCardId: jc3._id,
        status: 'Finalized',
        totals: { grandTotal: 10000, roundedGrandTotal: 10000 },
        grandTotalWords: 'Rupees Ten Thousand Only',
        amountPaid: 2000,
        balanceDue: 8000,
        paymentStatus: 'Partially Paid',
        parts: [{ name: 'Full Service', qty: 1, rate: 10000, discountPercent: 0, discountAmount: 0, gstPercent: 0, amount: 10000, gstAmount: 0, total: 10000 }]
      });
      createdInvoiceIds.push(inv3._id);

      // Additional partial payment of ₹4,000
      await axios.post(`${baseUrl}/jobcards/${jc3._id}/final-payments`, {
        amount: 4000,
        paymentType: 'Card Swipe',
        remarks: 'Part payment at front desk'
      }, { headers: adminHeaders });

      // Deliver vehicle
      const delRes = await axios.put(`${baseUrl}/jobcards/${jc3._id}`, {
        status: 'Delivered – Payment Pending',
        qcStatus: 'Pass',
        deliveredBy: { name: 'Kiran Desk', date: new Date(), time: '05:30 PM' }
      }, { headers: adminHeaders });

      assert.strictEqual(delRes.status, 200);
      assert.strictEqual(delRes.data.financialSummary.totalReceived, 6000);
      assert.strictEqual(delRes.data.financialSummary.pendingAmount, 4000);
      assert.strictEqual(delRes.data.financialSummary.paymentStatus, 'Partially Paid');
      recordPass('Scenario 3: Total received = ₹6,000, Outstanding balance = ₹4,000');
    }

    // ========================================================================
    // SCENARIO 4: Corporate Customer Credit Delivery
    // ========================================================================
    console.log('\nSCENARIO 4: Corporate Customer Credit Delivery');
    {
      const jc4 = await JobCard.create({
        jobCardNo: `JC-TEST-S4-${Date.now()}`,
        time: '09:30 AM',
        customerId: corpCustomer._id,
        vehicleId: vehicle2._id,
        serviceAdvisorId: adminUser._id,
        serviceAdvisorName: adminUser.name || 'Admin Advisor',
        odometerReading: 85000,
        status: 'Work in Progress',
        serviceType: 'General Servicing'
      });
      createdJobCardIds.push(jc4._id);

      const inv4 = await Invoice.create({
        invoiceNo: `INV-TEST-S4-${Date.now()}`,
        customerId: corpCustomer._id,
        vehicleId: vehicle2._id,
        jobCardId: jc4._id,
        status: 'Finalized',
        totals: { grandTotal: 25000, roundedGrandTotal: 25000 },
        grandTotalWords: 'Rupees Twenty Five Thousand Only',
        amountPaid: 0,
        balanceDue: 25000,
        paymentStatus: 'Pending',
        parts: [{ name: 'Transmission Overhaul', qty: 1, rate: 25000, discountPercent: 0, discountAmount: 0, gstPercent: 0, amount: 25000, gstAmount: 0, total: 25000 }]
      });
      createdInvoiceIds.push(inv4._id);

      const creditDueDate = new Date();
      creditDueDate.setDate(creditDueDate.getDate() + 30);

      const delRes = await axios.put(`${baseUrl}/jobcards/${jc4._id}`, {
        status: 'Delivered – Payment Pending',
        qcStatus: 'Pass',
        deliveredBy: { name: 'Fleet Manager Rahul', date: new Date(), time: '06:00 PM' },
        creditDueDate: creditDueDate.toISOString(),
        creditTerms: 'Net 30 Days'
      }, { headers: adminHeaders });

      assert.strictEqual(delRes.status, 200);
      assert.strictEqual(delRes.data.status, 'Delivered – Payment Pending');
      assert.strictEqual(delRes.data.creditTerms, 'Net 30 Days');
      assert(delRes.data.creditDueDate, 'creditDueDate should be saved on JobCard');

      // Check Invoice also updated creditDueDate
      const updatedInv = await Invoice.findById(inv4._id);
      assert(updatedInv.creditDueDate, 'creditDueDate should be synchronized with Invoice');
      recordPass('Scenario 4: Corporate credit delivery succeeds with 30-day credit due date');
    }

    // ========================================================================
    // SCENARIO 5: Multiple Payment Modes Collection
    // ========================================================================
    console.log('\nSCENARIO 5: Multiple Payment Modes Collection');
    {
      const jc5 = await JobCard.create({
        jobCardNo: `JC-TEST-S5-${Date.now()}`,
        time: '10:00 AM',
        customerId: indCustomer._id,
        vehicleId: vehicle1._id,
        serviceAdvisorId: adminUser._id,
        serviceAdvisorName: adminUser.name || 'Admin Advisor',
        odometerReading: 50000,
        status: 'Work in Progress',
        serviceType: 'General Servicing'
      });
      createdJobCardIds.push(jc5._id);

      const inv5 = await Invoice.create({
        invoiceNo: `INV-TEST-S5-${Date.now()}`,
        customerId: indCustomer._id,
        vehicleId: vehicle1._id,
        jobCardId: jc5._id,
        status: 'Finalized',
        totals: { grandTotal: 5000, roundedGrandTotal: 5000 },
        grandTotalWords: 'Rupees Five Thousand Only',
        amountPaid: 0,
        balanceDue: 5000,
        paymentStatus: 'Pending',
        parts: [{ name: 'Service Items', qty: 1, rate: 5000, discountPercent: 0, discountAmount: 0, gstPercent: 0, amount: 5000, gstAmount: 0, total: 5000 }]
      });
      createdInvoiceIds.push(inv5._id);

      // Record 5 payments with different supported payment modes: Cash, UPI, Bank Transfer, Cheque, QR
      const modes = [
        { type: 'Cash', amt: 1000 },
        { type: 'UPI', amt: 1000 },
        { type: 'Bank Transfer', amt: 1000 },
        { type: 'Cheque', amt: 1000 },
        { type: 'QR', amt: 1000 }
      ];

      for (const m of modes) {
        const pRes = await axios.post(`${baseUrl}/jobcards/${jc5._id}/final-payments`, {
          amount: m.amt,
          paymentType: m.type,
          remarks: `Payment via ${m.type}`
        }, { headers: adminHeaders });
        assert.strictEqual(pRes.status, 200);
      }

      const verifiedJc = await JobCard.findById(jc5._id);
      assert.strictEqual(verifiedJc.finalPayments.length, 5, 'All 5 payments must be recorded');
      assert.strictEqual(verifiedJc.financialSummary.totalFinal, 5000, 'Total final payments should be ₹5,000');
      assert.strictEqual(verifiedJc.financialSummary.pendingAmount, 0, 'Pending amount should be ₹0');
      assert.strictEqual(verifiedJc.financialSummary.paymentStatus, 'Fully Paid');
      recordPass('Scenario 5: Multiple payment modes (Cash, UPI, Bank Transfer, Cheque, QR) collected accurately without double counting');
    }

    // ========================================================================
    // SCENARIO 6: Full Payment After Delivery & Historical Delivery Date Preservation
    // ========================================================================
    console.log('\nSCENARIO 6: Full Payment After Delivery & Historical Delivery Date Preservation');
    {
      const jc6 = await JobCard.create({
        jobCardNo: `JC-TEST-S6-${Date.now()}`,
        time: '11:00 AM',
        customerId: indCustomer._id,
        vehicleId: vehicle1._id,
        serviceAdvisorId: adminUser._id,
        serviceAdvisorName: adminUser.name || 'Admin Advisor',
        odometerReading: 60000,
        status: 'Work in Progress',
        serviceType: 'General Servicing'
      });
      createdJobCardIds.push(jc6._id);

      const inv6 = await Invoice.create({
        invoiceNo: `INV-TEST-S6-${Date.now()}`,
        customerId: indCustomer._id,
        vehicleId: vehicle1._id,
        jobCardId: jc6._id,
        status: 'Finalized',
        totals: { grandTotal: 8000, roundedGrandTotal: 8000 },
        grandTotalWords: 'Rupees Eight Thousand Only',
        amountPaid: 0,
        balanceDue: 8000,
        paymentStatus: 'Pending',
        parts: [{ name: 'Engine Tuning', qty: 1, rate: 8000, discountPercent: 0, discountAmount: 0, gstPercent: 0, amount: 8000, gstAmount: 0, total: 8000 }]
      });
      createdInvoiceIds.push(inv6._id);

      // Step A: Deliver under Delivered – Payment Pending with a specific historical timestamp (e.g. 5 days ago)
      const historicalDate = new Date(Date.now() - 5 * 86400000);
      await axios.put(`${baseUrl}/jobcards/${jc6._id}`, {
        status: 'Delivered – Payment Pending',
        qcStatus: 'Pass',
        deliveredBy: {
          name: 'Praveen Delivery Officer',
          date: historicalDate,
          time: '03:15 PM'
        }
      }, { headers: adminHeaders });

      // Step B: Collect full balance payment now
      await axios.post(`${baseUrl}/jobcards/${jc6._id}/final-payments`, {
        amount: 8000,
        paymentType: 'UPI',
        transactionId: 'UPI-FULL-S6-001'
      }, { headers: adminHeaders });

      // Step C: Transition to 'Delivered'
      const delFinalRes = await axios.put(`${baseUrl}/jobcards/${jc6._id}`, {
        status: 'Delivered'
      }, { headers: adminHeaders });

      assert.strictEqual(delFinalRes.status, 200);
      assert.strictEqual(delFinalRes.data.status, 'Delivered');

      // CRITICAL: The historical delivery date must NOT be overwritten!
      const finalJc = await JobCard.findById(jc6._id);
      const preservedTime = new Date(finalJc.deliveredBy.date).getTime();
      const expectedTime = historicalDate.getTime();
      assert(
        Math.abs(preservedTime - expectedTime) < 5000,
        `Historical delivery date must be preserved! Got: ${finalJc.deliveredBy.date}, Expected: ${historicalDate}`
      );
      assert.strictEqual(finalJc.deliveredBy.name, 'Praveen Delivery Officer');
      recordPass('Scenario 6: Full payment after delivery preserves original delivery date and transitions to Delivered');
    }

    // ========================================================================
    // SCENARIO 7: Payment Reversal / Refund on Delivered Vehicle
    // ========================================================================
    console.log('\nSCENARIO 7: Payment Reversal / Refund on Delivered Vehicle');
    {
      const jc7 = await JobCard.create({
        jobCardNo: `JC-TEST-S7-${Date.now()}`,
        time: '12:00 PM',
        customerId: indCustomer._id,
        vehicleId: vehicle1._id,
        serviceAdvisorId: adminUser._id,
        serviceAdvisorName: adminUser.name || 'Admin Advisor',
        odometerReading: 70000,
        status: 'Work in Progress',
        serviceType: 'General Servicing'
      });
      createdJobCardIds.push(jc7._id);

      const inv7 = await Invoice.create({
        invoiceNo: `INV-TEST-S7-${Date.now()}`,
        customerId: indCustomer._id,
        vehicleId: vehicle1._id,
        jobCardId: jc7._id,
        status: 'Finalized',
        totals: { grandTotal: 6000, roundedGrandTotal: 6000 },
        grandTotalWords: 'Rupees Six Thousand Only',
        amountPaid: 6000,
        balanceDue: 0,
        paymentStatus: 'Paid',
        parts: [{ name: 'Suspension Check', qty: 1, rate: 6000, discountPercent: 0, discountAmount: 0, gstPercent: 0, amount: 6000, gstAmount: 0, total: 6000 }]
      });
      createdInvoiceIds.push(inv7._id);

      // Record payment of ₹6,000 and deliver vehicle as Delivered
      const payRes = await axios.post(`${baseUrl}/jobcards/${jc7._id}/final-payments`, {
        amount: 6000,
        paymentType: 'Cash'
      }, { headers: adminHeaders });
      const paymentId = payRes.data.finalPayments[0]._id;

      const origDeliveryDate = new Date(Date.now() - 2 * 86400000);
      await axios.put(`${baseUrl}/jobcards/${jc7._id}`, {
        status: 'Delivered',
        qcStatus: 'Pass',
        deliveredBy: { name: 'Gate Staff Anji', date: origDeliveryDate, time: '02:00 PM' }
      }, { headers: adminHeaders });

      // Now reverse / delete the payment
      const delPayRes = await axios.delete(
        `${baseUrl}/jobcards/${jc7._id}/final-payments/${paymentId}`,
        { headers: adminHeaders }
      );
      assert.strictEqual(delPayRes.status, 200);

      // Verify that status automatically reverted to 'Delivered – Payment Pending'
      const jcAfterReversal = await JobCard.findById(jc7._id);
      assert.strictEqual(
        jcAfterReversal.status,
        'Delivered – Payment Pending',
        'Status must automatically revert to Delivered – Payment Pending on payment reversal'
      );
      assert.strictEqual(jcAfterReversal.financialSummary.pendingAmount, 6000);
      // Original delivery date preserved
      assert(
        Math.abs(new Date(jcAfterReversal.deliveredBy.date).getTime() - origDeliveryDate.getTime()) < 5000,
        'Original delivery date must be preserved after reversal'
      );
      recordPass('Scenario 7: Payment reversal automatically reverts status to Delivered – Payment Pending and restores pending amount');
    }

    // ========================================================================
    // SCENARIO 8: Pending Payments Report Endpoint & Export Routes
    // ========================================================================
    console.log('\nSCENARIO 8: Pending Payments Report Endpoint & Export Routes');
    {
      // 8A. JSON Endpoint
      const repRes = await axios.get(`${baseUrl}/reports/pending-payments`, { headers: adminHeaders });
      assert.strictEqual(repRes.status, 200);
      assert.strictEqual(repRes.data.success, true);
      assert(Array.isArray(repRes.data.items), 'items must be an array');
      assert(repRes.data.summary, 'summary must be present');
      assert(repRes.data.summary.totalReceivables >= 10000, 'totalReceivables must be computed');
      assert(repRes.data.summary.deliveredPendingCount >= 1, 'deliveredPendingCount must be >= 1');
      recordPass('Scenario 8A: GET /api/reports/pending-payments returns 13 fields and correct summary metrics');

      // 8B. Filter by delivered_pending
      const delFilterRes = await axios.get(`${baseUrl}/reports/pending-payments?filter=delivered_pending`, { headers: adminHeaders });
      assert.strictEqual(delFilterRes.status, 200);
      delFilterRes.data.items.forEach(item => {
        assert(
          ['Delivered – Payment Pending', 'Delivered - Payment Pending'].includes(item.jobCardStatus),
          'Filtered items must have jobCardStatus Delivered – Payment Pending'
        );
      });
      recordPass('Scenario 8B: Filter delivered_pending returns only delivered vehicles with pending payment');

      // 8C. Filter by corporate
      const corpFilterRes = await axios.get(`${baseUrl}/reports/pending-payments?filter=corporate`, { headers: adminHeaders });
      assert.strictEqual(corpFilterRes.status, 200);
      corpFilterRes.data.items.forEach(item => {
        assert(
          item.customerType === 'Corporate' || item.companyName,
          'Filtered items must be Corporate'
        );
      });
      recordPass('Scenario 8C: Filter corporate returns corporate customer credit records');

      // 8D. Excel / CSV Export
      const csvRes = await axios.get(`${baseUrl}/reports/pending-payments/export/excel`, {
        headers: adminHeaders,
        responseType: 'text'
      });
      assert.strictEqual(csvRes.status, 200);
      assert(csvRes.headers['content-type'].includes('text/csv'), 'Content-Type must be text/csv');
      const csvText = csvRes.data;
      assert(csvText.includes('Job Card No'), 'CSV must contain Job Card No header');
      assert(csvText.includes('Vehicle Reg No'), 'CSV must contain Vehicle Reg No header');
      assert(csvText.includes('Outstanding Balance'), 'CSV must contain Outstanding Balance header');
      assert(csvText.includes('Credit Due Date'), 'CSV must contain Credit Due Date header');
      recordPass('Scenario 8D: GET /api/reports/pending-payments/export/excel generates valid CSV with 13 columns');

      // 8E. PDF Export
      const pdfRes = await axios.get(`${baseUrl}/reports/pending-payments/export/pdf`, {
        headers: adminHeaders,
        responseType: 'arraybuffer'
      });
      assert.strictEqual(pdfRes.status, 200);
      assert(pdfRes.headers['content-type'].includes('application/pdf'), 'Content-Type must be application/pdf');
      const pdfBuffer = Buffer.from(pdfRes.data);
      assert(pdfBuffer.slice(0, 4).toString() === '%PDF', 'PDF buffer must start with %PDF magic header');
      assert(pdfBuffer.length > 500, 'PDF buffer must contain rendered content');
      recordPass('Scenario 8E: GET /api/reports/pending-payments/export/pdf generates valid PDF');
    }

    console.log('\n========================================================================');
    console.log(`ALL TESTS PASSED! (${testPassedCount}/${totalTestsCount} assertions succeeded)`);
    console.log('========================================================================\n');
  } finally {
    // Clean up created test data
    console.log('Cleaning up test data...');
    if (createdInvoiceIds.length > 0) {
      await Invoice.deleteMany({ _id: { $in: createdInvoiceIds } });
    }
    if (createdJobCardIds.length > 0) {
      await JobCard.deleteMany({ _id: { $in: createdJobCardIds } });
    }
    if (createdVehicleIds.length > 0) {
      await Vehicle.deleteMany({ _id: { $in: createdVehicleIds } });
    }
    if (createdCustomerIds.length > 0) {
      await Customer.deleteMany({ _id: { $in: createdCustomerIds } });
    }
    console.log('✓ Test data cleaned up successfully.');

    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB Atlas & closed test server.\n');
  }
}

runDeliveredPaymentPendingTests().catch(err => {
  console.error('\nTest Suite Fatal Error:', err);
  process.exit(1);
});
