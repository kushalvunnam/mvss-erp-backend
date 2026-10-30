const assert = require('assert');
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const dns = require('dns');

// Configure DNS to 8.8.8.8 to ensure SRV resolution works reliably on Windows
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  // Ignore if not allowed
}

require('dotenv').config({ path: path.join(__dirname, '../.env') });

process.env.META_WA_ACCESS_TOKEN = process.env.META_WA_ACCESS_TOKEN || 'mock_valid_token_test';
process.env.META_WA_PHONE_NUMBER_ID = process.env.META_WA_PHONE_NUMBER_ID || '1391083524077434';
process.env.META_WA_BUSINESS_ACCOUNT_ID = process.env.META_WA_BUSINESS_ACCOUNT_ID || '1070579342641923';

const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const JobCard = require('../models/JobCard');
const Estimate = require('../models/Estimate');
const WhatsAppLog = require('../models/WhatsAppLog');
const User = require('../models/User');
const estimatesRouter = require('../routes/estimates');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/estimates', estimatesRouter);

async function runTestSuite() {
  console.log('========================================================================');
  console.log('TEST SUITE: MVSS WhatsApp Estimate Automation Sequence & Override Fixes');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✔ Connected to MongoDB Atlas.');

  let adminUser = await User.findOne({ role: 'Admin', active: true });
  if (!adminUser) {
    adminUser = await User.findOne({ active: true });
  }
  assert(adminUser, 'An active user must exist in database for testing');
  const token = jwt.sign({ _id: adminUser._id, role: adminUser.role, name: adminUser.name }, JWT_SECRET);
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let capturedDispatches = [];
  let shouldFailStage1 = false;
  let shouldFailStage2 = false;
  let shouldFailStage3 = false;
  const originalAxiosPost = axios.post;

  axios.post = async (url, data, config) => {
    if (typeof url === 'string' && (url.includes('graph.facebook.com') || url.includes('/messages') || url.includes('/media'))) {
      const templateName = data?.template?.name || null;
      const isDocument = data?.type === 'document';
      
      const record = {
        url,
        data,
        templateName,
        isDocument,
        to: data?.to,
        timestamp: new Date()
      };
      capturedDispatches.push(record);

      if (templateName === 'mvss_estimate_created' && shouldFailStage1) {
        const error = new Error('Meta Graph API: Stage 1 dispatch failure simulation');
        error.response = { status: 500, data: { error: { message: 'Stage 1 Meta failure', code: 131001 } } };
        throw error;
      }

      if ((templateName === 'estimate_awaiting_customer_approval' || templateName === 'mvss_estimate_awaiting_customer_approval') && shouldFailStage2) {
        const error = new Error('Meta Graph API: Stage 2 dispatch failure simulation');
        error.response = { status: 500, data: { error: { message: 'Stage 2 Meta failure', code: 131002 } } };
        throw error;
      }

      if (templateName === 'mvss_estimate_approved' && shouldFailStage3) {
        const error = new Error('Meta Graph API: Stage 3 dispatch failure simulation');
        error.response = { status: 500, data: { error: { message: 'Stage 3 Meta failure', code: 131003 } } };
        throw error;
      }

      const generatedId = `wamid.TEST_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      return {
        status: 200,
        data: {
          messaging_product: 'whatsapp',
          contacts: [{ input: data?.to || '919876543210', wa_id: data?.to || '919876543210' }],
          messages: [{ id: generatedId }]
        }
      };
    }
    return originalAxiosPost(url, data, config);
  };

  const cleanupIds = {
    customers: [],
    vehicles: [],
    jobcards: [],
    estimates: [],
    whatsappLogs: []
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Manual Override Creation & Persistence
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Manual Override Creation & Persistence ---');
    const testCustomer = new Customer({
      name: 'Ramesh Sharma',
      mobile: '9876543210',
      whatsappOptIn: true
    });
    await testCustomer.save();
    cleanupIds.customers.push(testCustomer._id);

    const testVehicle = new Vehicle({
      customerId: testCustomer._id,
      vehicleNumber: 'TS09EA1234',
      make: 'Hyundai',
      model: 'Creta',
      fuelType: 'Diesel',
      odometerReading: 45000
    });
    await testVehicle.save();
    cleanupIds.vehicles.push(testVehicle._id);

    const testJobCard = new JobCard({
      jobCardNo: `JC-TEST-${Date.now().toString().slice(-4)}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      time: '10:00 AM',
      odometerReading: 25000,
      status: 'Estimation'
    });
    await testJobCard.save();
    cleanupIds.jobcards.push(testJobCard._id);

    // Create estimate with manual override: 3681.60
    const overrideAmount = 3681.60;
    const createRes = await axios.post(`${baseUrl}/api/estimates`, {
      jobCardId: testJobCard._id,
      parts: [
        { name: 'Engine Oil Filter', qty: 1, rate: 500, gstPercent: 18 }
      ],
      labour: [
        { description: 'General Service', qty: 1, rate: 2000, gstPercent: 18 }
      ],
      manualOverride: true,
      manualGrandTotal: overrideAmount
    }, { headers: authHeaders });

    assert.strictEqual(createRes.status, 201, 'Estimate creation must succeed');
    const createdEstimate = createRes.data;
    cleanupIds.estimates.push(createdEstimate._id);

    assert.strictEqual(createdEstimate.manualOverride, true, 'manualOverride flag must be true');
    assert.strictEqual(Number(createdEstimate.manualGrandTotal), overrideAmount, 'manualGrandTotal must match override amount');
    assert.strictEqual(Number(createdEstimate.totals.grandTotal), overrideAmount, 'totals.grandTotal must match override amount');
    console.log(`✔ Test 1 Passed: Manual override saved correctly (Amount: ₹${overrideAmount}).`);

    // -------------------------------------------------------------------------
    // TEST 2 & 3: Sequential Stage 1 and Stage 2 Execution & Amount Formatting
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2 & 3: Sequential Dispatch of Stage 1 & Stage 2 with Indian Currency Formatting ---');
    capturedDispatches = [];

    const sendRes = await axios.post(`${baseUrl}/api/estimates/${createdEstimate._id}/send`, {}, { headers: authHeaders });
    assert.strictEqual(sendRes.status, 200, 'Send estimate must return 200');

    // Verify exactly 3 messages dispatched:
    // 1. Customer Estimate PDF document attachment
    // 2. Stage 1 Template: mvss_estimate_created (5 params)
    // 3. Stage 2 Template: estimate_awaiting_customer_approval (4 params)
    const docDispatch = capturedDispatches.find(d => d.isDocument);
    const stage1Dispatch = capturedDispatches.find(d => d.templateName === 'mvss_estimate_created');
    const stage2Dispatch = capturedDispatches.find(d => d.templateName === 'estimate_awaiting_customer_approval' || d.templateName === 'mvss_estimate_awaiting_customer_approval');

    assert(docDispatch, 'Customer Estimate PDF attachment must be dispatched');
    assert(stage1Dispatch, 'Stage 1 (mvss_estimate_created) must be dispatched');
    assert(stage2Dispatch, 'Stage 2 (estimate_awaiting_customer_approval) must be dispatched');

    // Verify Sequencing: Stage 1 must be dispatched BEFORE Stage 2
    const stage1Index = capturedDispatches.indexOf(stage1Dispatch);
    const stage2Index = capturedDispatches.indexOf(stage2Dispatch);
    assert(stage1Index < stage2Index, 'Stage 1 must be dispatched BEFORE Stage 2');
    console.log('✔ Sequencing verified: Stage 1 occurred before Stage 2.');

    // Verify Parameters for Stage 1 (mvss_estimate_created):
    // 1: customer_name, 2: vehicle_number, 3: estimate_number, 4: job_card_number, 5: final_estimated_amount
    const stage1Params = stage1Dispatch.data.template.components[0].parameters.map(p => p.text);
    assert.strictEqual(stage1Params.length, 5, 'Stage 1 must have exactly 5 parameters');
    assert.strictEqual(stage1Params[0], 'Ramesh Sharma', 'Param 1 must be customer name');
    assert.strictEqual(stage1Params[1], 'TS09EA1234', 'Param 2 must be vehicle number');
    const savedJc = await JobCard.findById(testJobCard._id);
    assert.strictEqual(stage1Params[3], savedJc.jobCardNo, 'Param 4 must be job card number');
    assert.strictEqual(stage1Params[4], '3,681.60', 'Param 5 must be Indian currency formatted canonical amount');

    // Verify Parameters for Stage 2 (estimate_awaiting_customer_approval):
    // 1: customer_name, 2: vehicle_number, 3: estimate_number, 4: final_estimated_amount
    const stage2Params = stage2Dispatch.data.template.components[0].parameters.map(p => p.text);
    assert.strictEqual(stage2Params.length, 4, 'Stage 2 must have exactly 4 parameters');
    assert.strictEqual(stage2Params[0], 'Ramesh Sharma', 'Param 1 must be customer name');
    assert.strictEqual(stage2Params[1], 'TS09EA1234', 'Param 2 must be vehicle number');
    assert.strictEqual(stage2Params[2], createdEstimate.estimateNo, 'Param 3 must be estimate number');
    assert.strictEqual(stage2Params[3], '3,681.60', 'Param 4 must be Indian currency formatted canonical amount');

    // Verify Estimate & Job Card Status Updates
    const updatedEst1 = await Estimate.findById(createdEstimate._id);
    const updatedJc1 = await JobCard.findById(testJobCard._id);
    assert.strictEqual(updatedEst1.status, 'Waiting for Approval', 'Estimate status must be "Waiting for Approval"');
    assert.strictEqual(updatedJc1.status, 'Waiting for Customer Approval', 'Job Card status must be "Waiting for Customer Approval"');
    assert.strictEqual(Number(updatedJc1.estAmt), overrideAmount, 'Job Card estAmt must reflect override amount');
    console.log('✔ Test 2 & 3 Passed: Sequential dispatch, status transitions, and currency formatting (₹3,681.60) verified.');

    // -------------------------------------------------------------------------
    // TEST 4: Idempotency Prevents Duplicates on Repeated Clicks
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Duplicate Protection & Idempotency ---');
    const initialDispatchCount = capturedDispatches.length;

    const repeatSendRes = await axios.post(`${baseUrl}/api/estimates/${createdEstimate._id}/send`, {}, { headers: authHeaders });
    assert.strictEqual(repeatSendRes.status, 200);
    assert.strictEqual(repeatSendRes.data.alreadySent, true, 'Repeated click must return alreadySent: true');
    assert.strictEqual(capturedDispatches.length, initialDispatchCount, 'No new WhatsApp messages should be sent on repeated click');
    console.log('✔ Test 4 Passed: Repeated click was blocked by idempotency without duplicate dispatches.');

    // -------------------------------------------------------------------------
    // TEST 5: Verify Stage 3 is NOT Sent During Creation or Initial Send
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Stage 3 Guard (Never sent prematurely) ---');
    const stage3Premature = capturedDispatches.find(d => d.templateName === 'mvss_estimate_approved');
    assert(!stage3Premature, 'Stage 3 (mvss_estimate_approved) must NOT be dispatched during creation or initial send');
    console.log('✔ Test 5 Passed: Stage 3 was not sent prematurely.');

    // -------------------------------------------------------------------------
    // TEST 6: Approve Estimate -> Stage 3 Sent with Exact Canonical Amount
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Stage 3 Trigger on Approval with Canonical Amount ---');
    const approveRes = await axios.put(`${baseUrl}/api/estimates/${createdEstimate._id}/approve`, {
      finalAmount: overrideAmount
    }, { headers: authHeaders });
    assert.strictEqual(approveRes.status, 200, 'Approve estimate must succeed');

    const stage3Dispatch = capturedDispatches.find(d => d.templateName === 'mvss_estimate_approved');
    assert(stage3Dispatch, 'Stage 3 (mvss_estimate_approved) must be dispatched upon approval');

    // Verify Parameters for Stage 3 (mvss_estimate_approved):
    // 1: customer_name, 2: vehicle_number, 3: estimate_number, 4: job_card_number, 5: final_approved_amount
    const stage3Params = stage3Dispatch.data.template.components[0].parameters.map(p => p.text);
    assert.strictEqual(stage3Params.length, 5, 'Stage 3 must have exactly 5 parameters');
    assert.strictEqual(stage3Params[0], 'Ramesh Sharma', 'Param 1 must be customer name');
    assert.strictEqual(stage3Params[1], 'TS09EA1234', 'Param 2 must be vehicle number');
    assert.strictEqual(stage3Params[2], createdEstimate.estimateNo, 'Param 3 must be estimate number');
    assert.strictEqual(stage3Params[3], (await JobCard.findById(testJobCard._id)).jobCardNo, 'Param 4 must be job card number');
    assert.strictEqual(stage3Params[4], '3,681.60', 'Param 5 must be Indian currency formatted approved amount');

    const approvedEst = await Estimate.findById(createdEstimate._id);
    const approvedJc = await JobCard.findById(testJobCard._id);
    assert.strictEqual(approvedEst.status, 'Approved');
    assert.strictEqual(approvedJc.status, 'Work In Progress');
    console.log('✔ Test 6 Passed: Stage 3 dispatched upon approval with exact canonical amount.');

    // -------------------------------------------------------------------------
    // TEST 7: Simulate Stage 1 Failure -> Stage 2 is NOT Sent
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Stage 1 Failure Sequence Control ---');
    const testJc2 = new JobCard({
      jobCardNo: `JC-TEST2-${Date.now().toString().slice(-4)}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      time: '10:00 AM',
      odometerReading: 25000,
      status: 'Estimation'
    });
    await testJc2.save();
    cleanupIds.jobcards.push(testJc2._id);

    const est2Res = await axios.post(`${baseUrl}/api/estimates`, {
      jobCardId: testJc2._id,
      parts: [{ name: 'Brake Pad', qty: 1, rate: 1200, gstPercent: 18 }],
      labour: [{ description: 'Brake Overhaul', qty: 1, rate: 800, gstPercent: 18 }]
    }, { headers: authHeaders });
    const est2 = est2Res.data;
    cleanupIds.estimates.push(est2._id);

    capturedDispatches = [];
    shouldFailStage1 = true;

    try {
      await axios.post(`${baseUrl}/api/estimates/${est2._id}/send`, {}, { headers: authHeaders });
      assert.fail('Send should fail when Stage 1 fails');
    } catch (sendErr) {
      assert(sendErr.response && sendErr.response.status === 500, 'Should return status 500');
    } finally {
      shouldFailStage1 = false;
    }

    // Verify Stage 2 was NEVER dispatched because Stage 1 failed
    const stage2AfterFailure = capturedDispatches.find(d => d.templateName === 'estimate_awaiting_customer_approval' || d.templateName === 'mvss_estimate_awaiting_customer_approval');
    assert(!stage2AfterFailure, 'Stage 2 must NEVER be dispatched if Stage 1 failed');

    const est2DB = await Estimate.findById(est2._id);
    assert.strictEqual(est2DB.status, 'Draft', 'Estimate status must remain Draft when Stage 1 fails');
    console.log('✔ Test 7 Passed: Stage 1 failure prevented Stage 2 dispatch and preserved Draft status.');

    // -------------------------------------------------------------------------
    // TEST 8: Simulate Stage 2 Failure -> Retry Endpoint Dispatches ONLY Stage 2
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Stage 2 Failure & Independent Retry ---');
    const testJc3 = new JobCard({
      jobCardNo: `JC-TEST3-${Date.now().toString().slice(-4)}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      time: '10:00 AM',
      odometerReading: 25000,
      status: 'Estimation'
    });
    await testJc3.save();
    cleanupIds.jobcards.push(testJc3._id);

    const est3Res = await axios.post(`${baseUrl}/api/estimates`, {
      jobCardId: testJc3._id,
      parts: [{ name: 'Spark Plug', qty: 4, rate: 250, gstPercent: 18 }],
      labour: [{ description: 'Tune-up', qty: 1, rate: 1500, gstPercent: 18 }]
    }, { headers: authHeaders });
    const est3 = est3Res.data;
    cleanupIds.estimates.push(est3._id);

    capturedDispatches = [];
    shouldFailStage2 = true;

    const partialRes = await axios.post(`${baseUrl}/api/estimates/${est3._id}/send`, {}, { headers: authHeaders });
    assert.strictEqual(partialRes.status, 207, 'Should return 207 Multi-Status / partial delivery');
    shouldFailStage2 = false;

    // Stage 1 succeeded
    const stage1SentEst3 = capturedDispatches.find(d => d.templateName === 'mvss_estimate_created');
    assert(stage1SentEst3, 'Stage 1 should have succeeded in test 8');

    // Now call retry endpoint: POST /api/estimates/:id/retry-approval-notification
    capturedDispatches = [];
    const retryRes = await axios.post(`${baseUrl}/api/estimates/${est3._id}/retry-approval-notification`, {}, { headers: authHeaders });
    assert.strictEqual(retryRes.status, 200, 'Retry Stage 2 must return 200');

    // Verify Stage 1 was NOT resent on retry, and ONLY Stage 2 was dispatched
    const stage1OnRetry = capturedDispatches.find(d => d.templateName === 'mvss_estimate_created');
    const stage2OnRetry = capturedDispatches.find(d => d.templateName === 'estimate_awaiting_customer_approval' || d.templateName === 'mvss_estimate_awaiting_customer_approval');

    assert(!stage1OnRetry, 'Stage 1 must NOT be re-sent when retrying Stage 2');
    assert(stage2OnRetry, 'Stage 2 must be dispatched upon retry');

    const est3DB = await Estimate.findById(est3._id);
    assert.strictEqual(est3DB.status, 'Waiting for Approval', 'Estimate status must update to Waiting for Approval after Stage 2 succeeds');
    console.log('✔ Test 8 Passed: Stage 2 failed and was independently retried without resending Stage 1.');

    // -------------------------------------------------------------------------
    // TEST 9: Verify Detailed Audit History in estimate.whatsappHistory
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Verify Detailed WhatsApp Audit History ---');
    const finalEst = await Estimate.findById(createdEstimate._id);
    assert(finalEst.whatsappHistory && finalEst.whatsappHistory.length >= 3, 'whatsappHistory must have at least 3 entries');

    const stage1Entry = finalEst.whatsappHistory.find(h => h.stage === 'STAGE_1_ESTIMATION_READY');
    const stage2Entry = finalEst.whatsappHistory.find(h => h.stage === 'STAGE_2_ESTIMATION_AWAITING_APPROVAL');
    const stage3Entry = finalEst.whatsappHistory.find(h => h.stage === 'STAGE_3_ESTIMATION_APPROVED');

    assert(stage1Entry, 'Audit log must contain STAGE_1_ESTIMATION_READY');
    assert.strictEqual(stage1Entry.status, 'sent');
    assert.strictEqual(stage1Entry.templateName, 'mvss_estimate_created');
    assert.strictEqual(stage1Entry.finalAmount, overrideAmount);

    assert(stage2Entry, 'Audit log must contain STAGE_2_ESTIMATION_AWAITING_APPROVAL');
    assert.strictEqual(stage2Entry.status, 'sent');
    assert.strictEqual(stage2Entry.finalAmount, overrideAmount);

    assert(stage3Entry, 'Audit log must contain STAGE_3_ESTIMATION_APPROVED');
    assert.strictEqual(stage3Entry.status, 'sent');
    assert.strictEqual(stage3Entry.templateName, 'mvss_estimate_approved');
    assert.strictEqual(stage3Entry.finalAmount, overrideAmount);

    console.log('✔ Test 9 Passed: whatsappHistory accurately logs stages, templates, statuses, and canonical amounts.');

    console.log('\n========================================================================');
    console.log('ALL 9 TESTS PASSED SUCCESSFULLY! 100% VERIFIED.');
    console.log('========================================================================\n');

  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    throw err;
  } finally {
    axios.post = originalAxiosPost;
    server.close();

    // Cleanup test documents
    console.log('Cleaning up test records from database...');
    if (cleanupIds.estimates.length) await Estimate.deleteMany({ _id: { $in: cleanupIds.estimates } });
    if (cleanupIds.jobcards.length) await JobCard.deleteMany({ _id: { $in: cleanupIds.jobcards } });
    if (cleanupIds.vehicles.length) await Vehicle.deleteMany({ _id: { $in: cleanupIds.vehicles } });
    if (cleanupIds.customers.length) await Customer.deleteMany({ _id: { $in: cleanupIds.customers } });
    await WhatsAppLog.deleteMany({ relatedEntity: { $in: cleanupIds.estimates } });
    await mongoose.disconnect();
    console.log('Cleanup complete.');
  }
}

runTestSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
