const assert = require('assert');
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

process.env.META_WA_ACCESS_TOKEN = process.env.META_WA_ACCESS_TOKEN || 'mock_valid_token_abc';
process.env.META_WA_PHONE_NUMBER_ID = process.env.META_WA_PHONE_NUMBER_ID || '1391083524077434';
process.env.META_WA_BUSINESS_ACCOUNT_ID = process.env.META_WA_BUSINESS_ACCOUNT_ID || '1070579342641923';

const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const JobCard = require('../models/JobCard');
const WhatsAppLog = require('../models/WhatsAppLog');
const User = require('../models/User');
const jobcardsRouter = require('../routes/jobcards');
const { TEMPLATE_CONFIG } = require('../services/whatsappService');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/jobcards', jobcardsRouter);

async function runVehicleReadyTests() {
  console.log('================================================================');
  console.log('TEST SUITE: MVSS Automobiles Vehicle Ready WhatsApp Automation');
  console.log('================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB database.');

  // Find or use admin user for auth
  const adminUser = await User.findOne({ role: 'Admin', active: true });
  assert(adminUser, 'Admin user must exist in database');
  const token = jwt.sign({ _id: adminUser._id, role: adminUser.role, name: adminUser.name }, JWT_SECRET);
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/jobcards`;

  // Intercept all axios.post calls to prevent actual SMS/WhatsApp dispatch to real customers
  const capturedDispatches = [];
  let simulateMetaFailure = false;

  const originalAxiosPost = axios.post;
  axios.post = async (url, data, config) => {
    capturedDispatches.push({ url, data, config, timestamp: new Date() });

    if (simulateMetaFailure) {
      const err = new Error('Request failed with status code 500');
      err.response = {
        status: 500,
        data: {
          error: {
            message: 'Temporary Meta Cloud API error',
            type: 'OAuthException',
            code: 2
          }
        }
      };
      throw err;
    }

    return {
      status: 200,
      data: {
        messaging_product: 'whatsapp',
        contacts: [{ input: data?.to, wa_id: data?.to }],
        messages: [{ id: `wamid.TEST_${Date.now()}_${Math.random().toString(36).substring(7)}` }]
      }
    };
  };

  // Tracking test entities for cleanup
  let testCustomerId = null;
  let testVehicleId = null;
  let testJobCardIds = [];

  try {
    // -------------------------------------------------------------
    // Setup Test Data
    // -------------------------------------------------------------
    console.log('[Setup] Creating isolated test Customer, Vehicle, and JobCards...');
    const testCustomer = new Customer({
      name: 'Ramesh Sharma Test',
      mobile: '9876543210',
      email: 'ramesh.test@example.com',
      address: 'Hyderabad'
    });
    await testCustomer.save();
    testCustomerId = testCustomer._id;

    const testVehicle = new Vehicle({
      customerId: testCustomerId,
      vehicleNumber: 'TS09VR9999',
      make: 'Hyundai',
      model: 'Creta',
      year: 2023,
      fuelType: 'Petrol',
      odometerReading: 25000
    });
    await testVehicle.save();
    testVehicleId = testVehicle._id;

    // Helper to create valid JobCard documents with all required fields
    const makeJobCard = (overrides = {}) => new JobCard({
      jobCardNo: `JC-TEST-VR-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`,
      customerId: testCustomerId,
      vehicleId: testVehicleId,
      time: '10:00 AM',
      odometerReading: 25000,
      serviceAdvisorId: adminUser._id,
      serviceAdvisorName: adminUser.name || 'Admin',
      serviceType: 'General Servicing',
      workCategory: 'General Service',
      status: 'Quality Check',
      qcStatus: 'Pass',
      ...overrides
    });

    // Verify Template Specification
    console.log('[Setup] Verifying mvss_vehicle_ready template specification...');
    assert(TEMPLATE_CONFIG['mvss_vehicle_ready'], 'mvss_vehicle_ready must be configured in TEMPLATE_CONFIG');
    assert.strictEqual(TEMPLATE_CONFIG['mvss_vehicle_ready'].paramCount, 3, 'mvss_vehicle_ready must have exactly 3 parameters');
    assert.strictEqual(TEMPLATE_CONFIG['mvss_vehicle_ready'].lang, 'en', 'mvss_vehicle_ready language must be en');

    // -------------------------------------------------------------
    // Test 1: Transition Job Card to 'Ready for Delivery' with QC 'Pass'
    // -------------------------------------------------------------
    console.log('\n[Test 1] Transitioning Job Card to "Ready for Delivery" with QC Pass...');
    const jc1 = makeJobCard({
      status: 'Quality Check',
      qcStatus: 'Pass'
    });
    await jc1.save();
    testJobCardIds.push(jc1._id);

    capturedDispatches.length = 0; // reset
    const res1 = await fetch(`${baseUrl}/${jc1._id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ status: 'Ready for Delivery' })
    });

    assert.strictEqual(res1.status, 200, `Expected 200, got ${res1.status}`);
    const updatedJc1 = await res1.json();
    assert.strictEqual(updatedJc1.status, 'Ready for Delivery');

    // Verify WhatsApp dispatch
    assert.strictEqual(capturedDispatches.length, 1, 'WhatsApp message should be dispatched exactly once');
    const dispatch1 = capturedDispatches[0].data;
    assert.strictEqual(dispatch1.template.name, 'mvss_vehicle_ready');
    assert.strictEqual(dispatch1.template.language.code, 'en');

    const params1 = dispatch1.template.components[0].parameters;
    assert.strictEqual(params1.length, 3, 'Must contain exactly 3 parameters');
    assert.strictEqual(params1[0].text, 'Ramesh Sharma Test', 'Param 1 must be customer name');
    assert.strictEqual(params1[1].text, 'TS09VR9999', 'Param 2 must be vehicle number');
    assert.strictEqual(params1[2].text, jc1.jobCardNo, 'Param 3 must be job card number');

    // Verify WhatsAppLog creation
    const log1 = await WhatsAppLog.findOne({ idempotencyKey: `mvss_vehicle_ready_${jc1._id}` });
    assert(log1, 'WhatsAppLog entry must be saved with correlation key');
    assert.strictEqual(log1.status, 'sent');
    assert.strictEqual(log1.templateName, 'mvss_vehicle_ready');
    assert.strictEqual(log1.recipientPhone, '919876543210');
    console.log('✔ Test 1 Passed: Ready for Delivery triggered mvss_vehicle_ready with 3 exact parameters and logged.');

    // -------------------------------------------------------------
    // Test 2: Idempotency Protection (Repeated Saves Do NOT Re-trigger)
    // -------------------------------------------------------------
    console.log('\n[Test 2] Verifying idempotency: repeated saves do not re-send...');
    const dispatchesBefore2 = capturedDispatches.length;

    // Repeated call with same status and remarks
    const res2 = await fetch(`${baseUrl}/${jc1._id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ status: 'Ready for Delivery', statusRemarks: 'Customer called to notify' })
    });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(capturedDispatches.length, dispatchesBefore2, 'Repeated PUT with same status must NOT dispatch duplicate WhatsApp');

    // Unrelated update (odometer or remarks)
    const res2b = await fetch(`${baseUrl}/${jc1._id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ odometerReading: 45000 })
    });
    assert.strictEqual(res2b.status, 200);
    assert.strictEqual(capturedDispatches.length, dispatchesBefore2, 'Unrelated field update must NOT dispatch WhatsApp');
    console.log('✔ Test 2 Passed: Repeated saves and unrelated updates correctly skip duplicate WhatsApp dispatches.');

    // -------------------------------------------------------------
    // Test 3: Transition to 'Vehicle Ready' (Alias) with simultaneous qcStatus 'Pass'
    // -------------------------------------------------------------
    console.log('\n[Test 3] Transitioning Job Card to "Vehicle Ready" with simultaneous qcStatus Pass...');
    const jc3 = makeJobCard({
      status: 'Quality Check',
      qcStatus: ''
    });
    await jc3.save();
    testJobCardIds.push(jc3._id);

    capturedDispatches.length = 0;
    const res3 = await fetch(`${baseUrl}/${jc3._id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ status: 'Vehicle Ready', qcStatus: 'Pass' })
    });

    assert.strictEqual(res3.status, 200, `Expected 200, got ${res3.status}`);
    const updatedJc3 = await res3.json();
    assert.strictEqual(updatedJc3.status, 'Vehicle Ready');
    assert.strictEqual(updatedJc3.qcStatus, 'Pass');

    // Verify WhatsApp dispatch
    assert.strictEqual(capturedDispatches.length, 1, 'WhatsApp message should be dispatched for Vehicle Ready');
    const dispatch3 = capturedDispatches[0].data;
    assert.strictEqual(dispatch3.template.name, 'mvss_vehicle_ready');
    assert.strictEqual(dispatch3.template.components[0].parameters.length, 3);
    assert.strictEqual(dispatch3.template.components[0].parameters[0].text, 'Ramesh Sharma Test');
    assert.strictEqual(dispatch3.template.components[0].parameters[1].text, 'TS09VR9999');
    assert.strictEqual(dispatch3.template.components[0].parameters[2].text, jc3.jobCardNo);
    console.log('✔ Test 3 Passed: "Vehicle Ready" alias successfully saved, passed QC, and dispatched mvss_vehicle_ready.');

    // -------------------------------------------------------------
    // Test 4: Rejection without QC Pass
    // -------------------------------------------------------------
    console.log('\n[Test 4] Verifying rejection of Ready for Delivery when QC is not Pass...');
    const jc4 = makeJobCard({
      status: 'Quality Check',
      qcStatus: ''
    });
    await jc4.save();
    testJobCardIds.push(jc4._id);

    capturedDispatches.length = 0;
    const res4 = await fetch(`${baseUrl}/${jc4._id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ status: 'Ready for Delivery' })
    });

    assert.strictEqual(res4.status, 400, 'Must return 400 when QC is not Pass');
    const errBody4 = await res4.json();
    assert(errBody4.error.includes('Pre-Delivery Inspection must be marked as Passed'), 'Error message must specify inspection requirement');
    assert.strictEqual(capturedDispatches.length, 0, 'No WhatsApp message must be sent on validation rejection');

    // Verify DB was NOT updated
    const freshJc4 = await JobCard.findById(jc4._id);
    assert.strictEqual(freshJc4.status, 'Quality Check');
    console.log('✔ Test 4 Passed: Status update rejected without QC Pass, zero WhatsApp dispatches.');

    // -------------------------------------------------------------
    // Test 5: Isolation from other status transitions
    // -------------------------------------------------------------
    console.log('\n[Test 5] Verifying isolation: other status transitions do not trigger mvss_vehicle_ready...');
    const jc5 = makeJobCard({
      status: 'Created'
    });
    await jc5.save();
    testJobCardIds.push(jc5._id);

    capturedDispatches.length = 0;
    const res5 = await fetch(`${baseUrl}/${jc5._id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ status: 'Work in Progress' })
    });

    assert.strictEqual(res5.status, 200);
    assert.strictEqual(capturedDispatches.length, 1);
    assert.strictEqual(capturedDispatches[0].data.template.name, 'mvss_work_started');
    assert.notStrictEqual(capturedDispatches[0].data.template.name, 'mvss_vehicle_ready');
    console.log('✔ Test 5 Passed: Other status transitions cleanly isolated, mvss_vehicle_ready not triggered.');

    // -------------------------------------------------------------
    // Test 6: Safe Delivery & Error Isolation (Meta API failure does not break DB update)
    // -------------------------------------------------------------
    console.log('\n[Test 6] Verifying safe error isolation when Meta API fails...');
    const jc6 = makeJobCard({
      status: 'Quality Check',
      qcStatus: 'Pass'
    });
    await jc6.save();
    testJobCardIds.push(jc6._id);

    simulateMetaFailure = true;
    capturedDispatches.length = 0;

    const res6 = await fetch(`${baseUrl}/${jc6._id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ status: 'Ready for Delivery' })
    });

    // DB update must STILL succeed
    assert.strictEqual(res6.status, 200, 'Job Card update must succeed even if WhatsApp delivery encounters an error');
    const updatedJc6 = await res6.json();
    assert.strictEqual(updatedJc6.status, 'Ready for Delivery');

    const freshJc6 = await JobCard.findById(jc6._id);
    assert.strictEqual(freshJc6.status, 'Ready for Delivery', 'JobCard status must be committed in database');

    // Verify WhatsAppLog recorded the failure cleanly
    const log6 = await WhatsAppLog.findOne({ idempotencyKey: `mvss_vehicle_ready_${jc6._id}` });
    assert(log6, 'WhatsAppLog entry must exist for failed dispatch');
    assert.strictEqual(log6.status, 'failed');
    assert(log6.errorMessage.includes('Temporary Meta Cloud API error') || log6.errorMessage.includes('500'));
    console.log('✔ Test 6 Passed: Meta API error safely isolated; Job Card status saved to DB and failure recorded in WhatsAppLog.');

    console.log('\n================================================================');
    console.log('ALL 6 VEHICLE READY AUTOMATION TESTS PASSED SUCCESSFULLY');
    console.log('================================================================');
  } finally {
    // Restore axios.post
    axios.post = originalAxiosPost;

    // Cleanup test records
    console.log('\n[Cleanup] Cleaning up test data...');
    if (testCustomerId) await Customer.findByIdAndDelete(testCustomerId);
    if (testVehicleId) await Vehicle.findByIdAndDelete(testVehicleId);
    if (testJobCardIds.length > 0) {
      await JobCard.deleteMany({ _id: { $in: testJobCardIds } });
      await WhatsAppLog.deleteMany({ relatedEntity: { $in: testJobCardIds } });
    }
    server.close();
    await mongoose.disconnect();
    console.log('Cleanup completed and database disconnected.');
  }
}

runVehicleReadyTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
