const assert = require('assert');
const path = require('path');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

process.env.META_WA_ACCESS_TOKEN = process.env.META_WA_ACCESS_TOKEN || 'mock_token_for_disabled_test';
process.env.META_WA_PHONE_NUMBER_ID = process.env.META_WA_PHONE_NUMBER_ID || '1446113211917959';

const {
  isAutomationEnabled,
  setAutomationEnabled,
  getAutomationStatus,
  sendTemplateMessage
} = require('../services/whatsappService');

const User = require('../models/User');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const JobCard = require('../models/JobCard');
const Invoice = require('../models/Invoice');
const WhatsAppLog = require('../models/WhatsAppLog');

const jobcardsRouter = require('../routes/jobcards');
const invoicesRouter = require('../routes/invoices');
const whatsappRouter = require('../routes/whatsapp');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/jobcards', jobcardsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/whatsapp', whatsappRouter);

async function runDisabledAutomationsSuite() {
  console.log('========================================================================');
  console.log('  TEST SUITE: DISABLED WHATSAPP AUTOMATION VERIFICATION');
  console.log('  Testing Disabled: Inspection Completed, Invoice Generated, Work Started');
  console.log('  Testing Preserved: Welcome, Vehicle Ready, Delivered, Feedback');
  console.log('========================================================================\n');

  if (!process.env.MONGODB_URI) {
    console.error('Error: MONGODB_URI not configured in .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✔ Connected to MongoDB Atlas.');

  // Find an admin user for auth headers
  const adminUser = await User.findOne({ role: 'Admin' }) || await User.findOne() || {
    _id: new mongoose.Types.ObjectId(),
    name: 'Test Admin',
    role: 'Admin'
  };

  const token = jwt.sign(
    { _id: adminUser._id, role: adminUser.role || 'Admin', name: adminUser.name || 'Test Admin' },
    JWT_SECRET
  );
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✔ In-memory test server listening on port ${port}.\n`);

  // Intercept all outgoing axios post requests
  const capturedDispatches = [];
  const originalAxiosPost = axios.post;
  axios.post = async (url, data, config) => {
    capturedDispatches.push({ url, data, config, timestamp: new Date() });
    return {
      status: 200,
      data: {
        messaging_product: 'whatsapp',
        contacts: [{ input: data?.to, wa_id: data?.to }],
        messages: [{ id: `wamid.MOCK_${Date.now()}` }]
      }
    };
  };

  const cleanupIds = {
    jobCards: [],
    invoices: [],
    customers: [],
    vehicles: []
  };

  try {
    // -----------------------------------------------------------------
    // TEST 1: Verify Initial Feature Flag Configurations
    // -----------------------------------------------------------------
    console.log('--- Test 1: Verify Feature Flags Default States ---');
    const status = getAutomationStatus();
    console.log('Current Automation Status Flags:', JSON.stringify(status, null, 2));

    assert.strictEqual(status.inspection_completed, false, 'inspection_completed must default to false');
    assert.strictEqual(status.invoice_generated, false, 'invoice_generated must default to false');
    assert.strictEqual(status.work_started, false, 'work_started must default to false');

    assert.strictEqual(status.welcome, true, 'welcome must remain true');
    assert.strictEqual(status.vehicle_ready, true, 'vehicle_ready must remain true');
    assert.strictEqual(status.vehicle_delivered, true, 'vehicle_delivered must remain true');
    assert.strictEqual(status.feedback_request, true, 'feedback_request must remain true');
    assert.strictEqual(status.payment_received, true, 'payment_received must remain true');

    assert.strictEqual(isAutomationEnabled('mvss_inspection_completed'), false);
    assert.strictEqual(isAutomationEnabled('mvss_invoice_generated'), false);
    assert.strictEqual(isAutomationEnabled('mvss_work_started'), false);
    assert.strictEqual(isAutomationEnabled('mvss_welcome_customer'), true);
    assert.strictEqual(isAutomationEnabled('mvss_vehicle_ready'), true);
    console.log('✔ Test 1 Passed: The 3 requested automations are confirmed DISABLED, approved automations are confirmed ENABLED.\n');

    // -----------------------------------------------------------------
    // TEST 2: Central Kill-Switch in sendTemplateMessage
    // -----------------------------------------------------------------
    console.log('--- Test 2: Central Kill-Switch in sendTemplateMessage ---');
    capturedDispatches.length = 0;

    const resWorkStarted = await sendTemplateMessage({
      to: '919876543210',
      templateName: 'mvss_work_started',
      components: []
    });
    assert.strictEqual(resWorkStarted.skipped, true);
    assert.strictEqual(resWorkStarted.disabled, true);
    assert.strictEqual(capturedDispatches.length, 0, 'No HTTP request to Meta Graph API should be made');

    const resInvoiceGen = await sendTemplateMessage({
      to: '919876543210',
      templateName: 'mvss_invoice_generated',
      components: []
    });
    assert.strictEqual(resInvoiceGen.skipped, true);
    assert.strictEqual(resInvoiceGen.disabled, true);
    assert.strictEqual(capturedDispatches.length, 0);

    const resInspectComp = await sendTemplateMessage({
      to: '919876543210',
      templateName: 'mvss_inspection_completed',
      components: []
    });
    assert.strictEqual(resInspectComp.skipped, true);
    assert.strictEqual(resInspectComp.disabled, true);
    assert.strictEqual(capturedDispatches.length, 0);

    console.log('✔ Test 2 Passed: Central sendTemplateMessage blocks all 3 disabled templates with zero Meta API requests.\n');

    // -----------------------------------------------------------------
    // Setup Test Customer and Vehicle for Route Tests
    // -----------------------------------------------------------------
    const ts = Date.now().toString().slice(-5);
    const testCust = new Customer({
      name: `Auto Test Customer ${ts}`,
      mobile: `98765${ts}`,
      type: 'Individual',
      whatsappOptIn: true
    });
    await testCust.save();
    cleanupIds.customers.push(testCust._id);

    const testVeh = new Vehicle({
      vehicleNumber: `TS09WA${ts}`,
      customerId: testCust._id,
      make: 'Maruti Suzuki',
      model: 'Swift',
      fuelType: 'Petrol',
      odometerReading: 22000
    });
    await testVeh.save();
    cleanupIds.vehicles.push(testVeh._id);

    // -----------------------------------------------------------------
    // TEST 3: Job Card Transition to Work in Progress (NO WhatsApp Sent)
    // -----------------------------------------------------------------
    console.log('--- Test 3: Job Card -> Work in Progress ---');
    const jc1 = new JobCard({
      jobCardNo: `MVSS/JC-TEST/WIP-${ts}`,
      time: '11:00 AM',
      serviceAdvisorId: adminUser._id,
      customerId: testCust._id,
      vehicleId: testVeh._id,
      odometerReading: 22000,
      serviceType: 'General Servicing',
      status: 'Created'
    });
    await jc1.save();
    cleanupIds.jobCards.push(jc1._id);

    capturedDispatches.length = 0;
    const patchWip = await fetch(`${baseUrl}/api/jobcards/${jc1._id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ status: 'Work in Progress' })
    });
    assert.strictEqual(patchWip.status, 200);

    const updatedJc1 = await JobCard.findById(jc1._id);
    assert.strictEqual(updatedJc1.status, 'Work in Progress', 'DB status must update to Work in Progress');
    assert.strictEqual(capturedDispatches.length, 0, 'ZERO WhatsApp messages should be dispatched for Work in Progress');
    console.log('✔ Test 3 Passed: Job Card successfully moved to Work in Progress in DB, ZERO WhatsApp messages sent.\n');

    // -----------------------------------------------------------------
    // TEST 4: Job Card Transition to Pre-Delivery Inspection / Inspection Completed (NO WhatsApp Sent)
    // -----------------------------------------------------------------
    console.log('--- Test 4: Job Card -> Pre-Delivery Inspection / Inspection Completed ---');
    capturedDispatches.length = 0;
    const patchQc = await fetch(`${baseUrl}/api/jobcards/${jc1._id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'Pre-Delivery Inspection',
        qcStatus: 'Pass'
      })
    });
    assert.strictEqual(patchQc.status, 200);

    const updatedJc2 = await JobCard.findById(jc1._id);
    assert.strictEqual(updatedJc2.status, 'Pre-Delivery Inspection', 'DB status must update to Pre-Delivery Inspection');
    assert.strictEqual(capturedDispatches.length, 0, 'ZERO WhatsApp messages should be dispatched for Inspection Completed');
    console.log('✔ Test 4 Passed: Job Card successfully moved to Pre-Delivery Inspection in DB, ZERO WhatsApp messages sent.\n');

    // -----------------------------------------------------------------
    // TEST 5: Invoice Finalization (NO WhatsApp Sent)
    // -----------------------------------------------------------------
    console.log('--- Test 5: Invoice Finalization ---');
    const testInv = new Invoice({
      invoiceNo: `MVSS/INV-TEST/${ts}`,
      customerId: testCust._id,
      vehicleId: testVeh._id,
      jobCardId: jc1._id,
      status: 'Draft',
      totals: {
        partsTotal: 1500,
        labourTotal: 500,
        cgstTotal: 0,
        sgstTotal: 0,
        igstTotal: 0,
        gstTotal: 0,
        discountTotal: 0,
        grandTotal: 2000,
        roundedGrandTotal: 2000
      },
      grandTotalWords: 'Two Thousand Rupees Only'
    });
    await testInv.save();
    cleanupIds.invoices.push(testInv._id);

    capturedDispatches.length = 0;
    const finalizeRes = await fetch(`${baseUrl}/api/invoices/${testInv._id}/finalize`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ paymentMethod: 'Cash' })
    });
    assert.strictEqual(finalizeRes.status, 200);

    const updatedInv = await Invoice.findById(testInv._id);
    assert.strictEqual(updatedInv.status, 'Finalized', 'Invoice must be Finalized in DB');
    assert.strictEqual(capturedDispatches.length, 0, 'ZERO WhatsApp messages should be dispatched for Invoice Finalization');
    console.log('✔ Test 5 Passed: Invoice finalized successfully in DB, ZERO WhatsApp messages sent.\n');

    // -----------------------------------------------------------------
    // TEST 6: Preserved Active Automations (Vehicle Ready & Delivered)
    // -----------------------------------------------------------------
    console.log('--- Test 6: Preserved Active Automations ---');
    capturedDispatches.length = 0;

    // Transition to Ready for Delivery (qcStatus: 'Pass' satisfies PDI rule)
    const patchReady = await fetch(`${baseUrl}/api/jobcards/${jc1._id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ status: 'Ready for Delivery', qcStatus: 'Pass' })
    });
    assert.strictEqual(patchReady.status, 200);

    assert.strictEqual(capturedDispatches.length, 1, 'Exactly 1 message should be dispatched for Vehicle Ready');
    assert.strictEqual(capturedDispatches[0].data.template.name, 'mvss_vehicle_ready');
    console.log('✔ Vehicle Ready notification dispatched successfully as expected (Preserved).');

    // Transition to Delivered (Mark invoice and jobCard as Paid with full amount so Rule 1A passes)
    testInv.paymentStatus = 'Paid';
    testInv.amountPaid = 2000;
    await testInv.save();

    await JobCard.findByIdAndUpdate(jc1._id, {
      paymentStatus: 'Fully Paid',
      finalPayments: [{
        amount: 2000,
        paymentMode: 'Cash',
        date: new Date()
      }],
      'financialSummary.outstandingBalance': 0,
      'financialSummary.pendingAmount': 0
    });

    capturedDispatches.length = 0;
    const patchDelivered = await fetch(`${baseUrl}/api/jobcards/${jc1._id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ status: 'Delivered', qcStatus: 'Pass' })
    });
    if (patchDelivered.status !== 200) {
      console.error('patchDelivered returned error:', await patchDelivered.text());
    }
    assert.strictEqual(patchDelivered.status, 200);

    assert.strictEqual(capturedDispatches.length, 1, 'Exactly 1 message should be dispatched for Vehicle Delivered');
    assert.strictEqual(capturedDispatches[0].data.template.name, 'mvss_vehicle_delivered');
    console.log('✔ Vehicle Delivered notification dispatched successfully as expected (Preserved).');
    console.log('✔ Test 6 Passed: Preserved automations function without interruption.\n');

    // -----------------------------------------------------------------
    // TEST 7: Automation Status API Endpoints (GET & PATCH /api/whatsapp/automations)
    // -----------------------------------------------------------------
    console.log('--- Test 7: Automation Status API Endpoints ---');
    const getAutoRes = await fetch(`${baseUrl}/api/whatsapp/automations`, {
      headers: authHeaders
    });
    assert.strictEqual(getAutoRes.status, 200);
    const getAutoData = await getAutoRes.json();
    assert.strictEqual(getAutoData.success, true);
    assert.strictEqual(getAutoData.automations.inspection_completed, false);
    assert.strictEqual(getAutoData.automations.invoice_generated, false);
    assert.strictEqual(getAutoData.automations.work_started, false);
    console.log('✔ GET /api/whatsapp/automations returned current disabled flags correctly.');

    // Test dynamic toggle via PATCH
    const patchAutoRes = await fetch(`${baseUrl}/api/whatsapp/automations`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        updates: { work_started: true }
      })
    });
    assert.strictEqual(patchAutoRes.status, 200);
    assert.strictEqual(isAutomationEnabled('work_started'), true);
    console.log('✔ PATCH /api/whatsapp/automations dynamically enabled work_started.');

    // Reset back to false
    setAutomationEnabled('work_started', false);
    assert.strictEqual(isAutomationEnabled('work_started'), false);
    console.log('✔ Reset work_started back to disabled state.');
    console.log('✔ Test 7 Passed: Automation management endpoints verified.\n');

    console.log('========================================================================');
    console.log('  ALL 7 TESTS PASSED WITH 100% SUCCESS RATE!                           ');
    console.log('========================================================================\n');

  } finally {
    axios.post = originalAxiosPost;
    server.close();

    // Clean up created test documents
    for (const id of cleanupIds.jobCards) {
      await JobCard.findByIdAndDelete(id);
    }
    for (const id of cleanupIds.invoices) {
      await Invoice.findByIdAndDelete(id);
    }
    for (const id of cleanupIds.vehicles) {
      await Vehicle.findByIdAndDelete(id);
    }
    for (const id of cleanupIds.customers) {
      await Customer.findByIdAndDelete(id);
    }
    console.log('Cleaned up test documents from database.');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB Atlas.');
  }
}

runDisabledAutomationsSuite().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
