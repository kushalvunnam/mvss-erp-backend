const assert = require('assert');
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

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
const whatsappRouter = require('../routes/whatsapp');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/estimates', estimatesRouter);
app.use('/api/whatsapp', whatsappRouter);

async function runTestSuite() {
  console.log('========================================================================');
  console.log('TEST SUITE: Full WhatsApp Customer Estimate & Approval Automation');
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

  const capturedDispatches = [];
  let shouldSimulateMetaFailure = false;
  let simulatedFailureMessage = 'Meta Graph API Rate Limit / Network Error';
  const originalAxiosPost = axios.post;

  axios.post = async (url, data, config) => {
    if (typeof url === 'string' && (url.includes('graph.facebook.com') || url.includes('/messages') || url.includes('/media'))) {
      capturedDispatches.push({ url, data, config, timestamp: new Date() });
      if (shouldSimulateMetaFailure) {
        const error = new Error(simulatedFailureMessage);
        error.response = { status: 500, data: { error: { message: simulatedFailureMessage, code: 131000 } } };
        throw error;
      }
      return {
        status: 200,
        data: {
          messaging_product: 'whatsapp',
          contacts: [{ input: data?.to || '919876543210', wa_id: data?.to || '919876543210' }],
          messages: [{ id: `wamid.TEST_APPROVAL_${Date.now()}_${Math.random()}` }]
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
    whatsappLogs: [],
    files: []
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Creation of Estimate DOES NOT prematurely trigger approval WhatsApp
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Estimate Creation Keeps Draft and Does NOT Prematurely Dispatch ---');
    const cust1 = await Customer.create({
      name: 'Pawan Kalyan',
      mobile: '9848012345',
      address: 'Jubilee Hills, Hyderabad, Telangana'
    });
    cleanupIds.customers.push(cust1._id);

    const veh1 = await Vehicle.create({
      customerId: cust1._id,
      vehicleNumber: 'TS07PA0001',
      make: 'Toyota',
      model: 'Fortuner',
      odometerReading: 28000,
      fuelType: 'Diesel'
    });
    cleanupIds.vehicles.push(veh1._id);

    const jc1 = await JobCard.create({
      jobCardNo: `JC-TEST-APP-${Date.now()}`,
      customerId: cust1._id,
      vehicleId: veh1._id,
      serviceAdvisorId: adminUser._id,
      time: '11:00 AM',
      odometerReading: 28000,
      status: 'Estimation'
    });
    cleanupIds.jobcards.push(jc1._id);

    capturedDispatches.length = 0;

    const createEstPayload = {
      jobCardId: jc1._id,
      parts: [
        { name: 'Brake Pads Front', qty: 1, rate: 3200, gstPercent: 18, taxableValue: 3200, amount: 3200, gstAmount: 576, total: 3776 }
      ],
      labour: [
        { description: 'Brake Overhaul Service', rate: 1200, gstPercent: 18, taxableValue: 1200, amount: 1200, gstAmount: 216, total: 1416 }
      ],
      totals: {
        partsTotal: 3200,
        labourTotal: 1200,
        gstTotal: 792,
        grandTotal: 5192
      },
      amountInWords: 'Rupees Five Thousand One Hundred Ninety Two Only'
    };

    const createRes = await axios.post(`${baseUrl}/api/estimates`, createEstPayload, { headers: authHeaders });
    assert.strictEqual(createRes.status, 201, 'Estimate creation must return 201');
    const createdEst = createRes.data;
    cleanupIds.estimates.push(createdEst._id);

    assert.strictEqual(createdEst.status, 'Draft', 'Estimate must initially be in Draft status');
    assert.strictEqual(capturedDispatches.length, 0, 'No WhatsApp message should be triggered on Draft creation');

    const checkJc1 = await JobCard.findById(jc1._id);
    assert.strictEqual(checkJc1.status, 'Estimation', 'JobCard must stay in Estimation status');
    console.log('✔ TEST 1 PASSED: Estimate remains in Draft without premature WhatsApp trigger.');

    // -------------------------------------------------------------------------
    // TEST 2: Admin Clicks "Send" -> Dispatches PDF (Auto 1) and Approval Request (Auto 2)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Send Action Dispatches Both Document & Approval Template ---');
    capturedDispatches.length = 0;
    shouldSimulateMetaFailure = false;

    const sendRes = await axios.post(`${baseUrl}/api/estimates/${createdEst._id}/send`, {}, { headers: authHeaders });
    assert.strictEqual(sendRes.status, 200);
    assert.strictEqual(sendRes.data.success, true);
    assert.strictEqual(sendRes.data.estimate.status, 'Waiting for Approval', 'Estimate status must update to Waiting for Approval');

    // We expect 2 WhatsApp messages dispatched:
    // 1. Document (Customer Estimate PDF)
    // 2. Template (estimate_awaiting_customer_approval)
    assert.strictEqual(capturedDispatches.length, 2, 'Must dispatch exactly 2 messages: Document attachment and Approval template');

    // Verify Automation 1: Document attachment
    const docDispatch = capturedDispatches.find(d => d.data.type === 'document');
    assert(docDispatch, 'Document dispatch must exist');
    assert.strictEqual(docDispatch.data.to, '919848012345');
    assert(docDispatch.data.document.link);
    const cleanEstNo = String(createdEst.estimateNo).replace(/[^a-zA-Z0-9_-]/g, '_');
    assert.strictEqual(docDispatch.data.document.filename, `Customer_Estimate_${cleanEstNo}.pdf`);
    assert(docDispatch.data.document.caption.includes('Pawan Kalyan'));
    assert(docDispatch.data.document.caption.includes('TS07PA0001'));
    assert(docDispatch.data.document.caption.includes('5,192'));

    // Verify Automation 2: Approval template
    const tplDispatch = capturedDispatches.find(d => d.data.type === 'template');
    assert(tplDispatch, 'Approval template dispatch must exist');
    assert.strictEqual(tplDispatch.data.to, '919848012345');
    assert.strictEqual(tplDispatch.data.template.name, 'estimate_awaiting_customer_approval');

    const bodyParams = tplDispatch.data.template.components.find(c => c.type === 'body')?.parameters || [];
    assert.strictEqual(bodyParams.length, 4, 'Template must provide 4 parameters: customerName, vehicleNo, estimateNo, grandTotal');
    assert.strictEqual(bodyParams[0].text, 'Pawan Kalyan');
    assert.strictEqual(bodyParams[1].text, 'TS07PA0001', 'Vehicle number must be TS07PA0001, never workshop name');
    assert.strictEqual(bodyParams[2].text, createdEst.estimateNo);
    assert.strictEqual(bodyParams[3].text, '5,192', 'Grand total must be formatted INR without symbol');

    // Verify Job Card transition
    const postSendJc = await JobCard.findById(jc1._id);
    assert.strictEqual(postSendJc.status, 'Waiting for Customer Approval', 'JobCard must update to Waiting for Customer Approval');

    // Verify Estimate state
    const postSendEst = await Estimate.findById(createdEst._id);
    assert.strictEqual(postSendEst.status, 'Waiting for Approval');
    assert.strictEqual(postSendEst.whatsappHistory.length, 2, 'Estimate must record both document and approval template in history');

    console.log('✔ TEST 2 PASSED: Both Automations 1 & 2 dispatched successfully. Estimate is Waiting for Approval, Job Card is Waiting for Customer Approval.');

    // -------------------------------------------------------------------------
    // TEST 3: Inbound Customer WhatsApp Reply: Customer Approves
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Customer Replies "APPROVE" via WhatsApp Webhook ---');
    capturedDispatches.length = 0;

    // Simulate customer sending "APPROVE" from 9848012345
    const webhookApprovalPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '1070579342641923',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '1391083524077434',
                  phone_number_id: '1391083524077434'
                },
                contacts: [
                  {
                    profile: { name: 'Pawan Kalyan' },
                    wa_id: '919848012345'
                  }
                ],
                messages: [
                  {
                    from: '919848012345',
                    id: `wamid.INBOUND_APPROVE_${Date.now()}`,
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'text',
                    text: {
                      body: 'Yes, I APPROVE the estimate. Please proceed.'
                    }
                  }
                ]
              },
              field: 'messages'
            }
          ]
        }
      ]
    };

    const webhookRes = await axios.post(`${baseUrl}/api/whatsapp/webhook`, webhookApprovalPayload);
    assert.strictEqual(webhookRes.status, 200, 'Webhook must return 200');

    // Verify Estimate updated to Approved
    const approvedEst = await Estimate.findById(createdEst._id);
    assert.strictEqual(approvedEst.status, 'Approved', 'Estimate status must transition to Approved');
    assert(approvedEst.approvalMetadata, 'Approval metadata must be populated');
    assert(approvedEst.approvalMetadata.approvedByName.includes('via WhatsApp'), 'Must indicate customer approval via WhatsApp');
    assert(approvedEst.approvalMetadata.approvedByName.includes('Pawan Kalyan'), 'Must include customer name');
    assert.strictEqual(approvedEst.approvalMetadata.finalAmount, 5192);

    // Verify JobCard updated to Work in Progress
    const approvedJc = await JobCard.findById(jc1._id);
    assert.strictEqual(approvedJc.status, 'Work In Progress', 'JobCard must transition to Work In Progress on customer approval');

    // Verify mvss_estimate_approved notification was sent back to customer
    const confirmDispatch = capturedDispatches.find(d => d.data.type === 'template' && d.data.template.name === 'mvss_estimate_approved');
    assert(confirmDispatch, 'Should notify customer with mvss_estimate_approved confirmation template');

    console.log('✔ TEST 3 PASSED: Inbound customer APPROVAL processed. Estimate is Approved, Job Card is Work in Progress.');

    // -------------------------------------------------------------------------
    // TEST 4: Inbound Customer WhatsApp Reply: Customer Rejects
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Customer Replies "REJECT" via WhatsApp Webhook ---');
    const cust2 = await Customer.create({
      name: 'Mahesh Babu',
      mobile: '9848099999',
      address: 'Banjara Hills, Hyderabad, Telangana'
    });
    cleanupIds.customers.push(cust2._id);

    const veh2 = await Vehicle.create({
      customerId: cust2._id,
      vehicleNumber: 'TS09MB0007',
      make: 'Audi',
      model: 'A6',
      odometerReading: 40000,
      fuelType: 'Petrol'
    });
    cleanupIds.vehicles.push(veh2._id);

    const jc2 = await JobCard.create({
      jobCardNo: `JC-TEST-REJ-${Date.now()}`,
      customerId: cust2._id,
      vehicleId: veh2._id,
      serviceAdvisorId: adminUser._id,
      time: '12:00 PM',
      odometerReading: 40000,
      status: 'Estimation'
    });
    cleanupIds.jobcards.push(jc2._id);

    const est2 = await Estimate.create({
      estimateNo: `EST-TEST-REJ-${Date.now()}`,
      jobCardId: jc2._id,
      status: 'Draft',
      parts: [
        { name: 'Headlight Assembly', qty: 1, rate: 45000, gstPercent: 18, taxableValue: 45000, amount: 45000, gstAmount: 8100, total: 53100 }
      ],
      labour: [],
      totals: {
        partsTotal: 45000,
        labourTotal: 0,
        gstTotal: 8100,
        grandTotal: 53100
      },
      amountInWords: 'Rupees Fifty Three Thousand One Hundred Only'
    });
    cleanupIds.estimates.push(est2._id);

    // Send estimate to customer
    await axios.post(`${baseUrl}/api/estimates/${est2._id}/send`, {}, { headers: authHeaders });
    const est2Sent = await Estimate.findById(est2._id);
    assert.strictEqual(est2Sent.status, 'Waiting for Approval');

    // Simulate customer rejecting via WhatsApp text
    const webhookRejectionPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '1070579342641923',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '1391083524077434',
                  phone_number_id: '1391083524077434'
                },
                contacts: [
                  {
                    profile: { name: 'Mahesh Babu' },
                    wa_id: '919848099999'
                  }
                ],
                messages: [
                  {
                    from: '919848099999',
                    id: `wamid.INBOUND_REJECT_${Date.now()}`,
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'text',
                    text: {
                      body: 'Reject. It is too expensive, I decline this estimate.'
                    }
                  }
                ]
              },
              field: 'messages'
            }
          ]
        }
      ]
    };

    const webhookRejRes = await axios.post(`${baseUrl}/api/whatsapp/webhook`, webhookRejectionPayload);
    assert.strictEqual(webhookRejRes.status, 200);

    const rejectedEst = await Estimate.findById(est2._id);
    assert.strictEqual(rejectedEst.status, 'Rejected', 'Estimate status must transition to Rejected');
    assert(rejectedEst.rejectionReason.includes('decline') || rejectedEst.rejectionReason.includes('expensive'), 'Rejection reason must be captured');

    const rejectedJc = await JobCard.findById(jc2._id);
    assert.strictEqual(rejectedJc.status, 'Estimation', 'JobCard must revert to Estimation on rejection');

    console.log('✔ TEST 4 PASSED: Inbound customer REJECTION processed. Estimate is Rejected, Job Card reverted to Estimation.');

    // -------------------------------------------------------------------------
    // TEST 5: Failure Handling - Retains Draft Status on Error
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Error Handling: Missing Phone & Meta Failure Retains Draft Status ---');
    const cust3 = await Customer.create({
      name: 'No Phone Customer',
      mobile: '9999900000',
      address: 'Hyderabad'
    });
    // Set invalid short phone directly bypassing model validation
    await Customer.updateOne({ _id: cust3._id }, { $set: { mobile: '123' } });
    cleanupIds.customers.push(cust3._id);

    const veh3 = await Vehicle.create({
      customerId: cust3._id,
      vehicleNumber: 'TS09FAIL01',
      make: 'Honda',
      model: 'City',
      odometerReading: 10000,
      fuelType: 'Petrol'
    });
    cleanupIds.vehicles.push(veh3._id);

    const jc3 = await JobCard.create({
      jobCardNo: `JC-TEST-FAIL-${Date.now()}`,
      customerId: cust3._id,
      vehicleId: veh3._id,
      serviceAdvisorId: adminUser._id,
      time: '01:00 PM',
      odometerReading: 10000,
      status: 'Estimation'
    });
    cleanupIds.jobcards.push(jc3._id);

    const est3 = await Estimate.create({
      estimateNo: `EST-TEST-FAIL-${Date.now()}`,
      jobCardId: jc3._id,
      status: 'Draft',
      parts: [],
      labour: [{ description: 'General Checkup', rate: 1000, taxableValue: 1000, amount: 1000, gstPercent: 18, gstAmount: 180, total: 1180 }],
      totals: { partsTotal: 0, labourTotal: 1000, gstTotal: 180, grandTotal: 1180 }
    });
    cleanupIds.estimates.push(est3._id);

    // Call Send with invalid phone
    try {
      await axios.post(`${baseUrl}/api/estimates/${est3._id}/send`, {}, { headers: authHeaders });
      assert.fail('Should fail when customer has no valid phone');
    } catch (err) {
      assert.strictEqual(err.response?.status, 400);
      assert(err.response?.data?.error?.includes('valid WhatsApp number') || err.response?.data?.error?.includes('invalid'));
    }
    const checkEst3 = await Estimate.findById(est3._id);
    assert.strictEqual(checkEst3.status, 'Draft', 'Estimate status must remain Draft when phone is missing');

    // Simulate Meta API 500 error on a new valid draft estimate
    const cust4 = await Customer.create({
      name: 'Valid Customer Meta Fail',
      mobile: '9876543210',
      address: 'Hyderabad'
    });
    cleanupIds.customers.push(cust4._id);

    const veh4 = await Vehicle.create({
      customerId: cust4._id,
      vehicleNumber: 'TS09MFAIL2',
      make: 'Honda',
      model: 'Amaze',
      odometerReading: 12000,
      fuelType: 'Petrol'
    });
    cleanupIds.vehicles.push(veh4._id);

    const jc4 = await JobCard.create({
      jobCardNo: `JC-TEST-MFAIL-${Date.now()}`,
      customerId: cust4._id,
      vehicleId: veh4._id,
      serviceAdvisorId: adminUser._id,
      time: '02:00 PM',
      odometerReading: 12000,
      status: 'Estimation'
    });
    cleanupIds.jobcards.push(jc4._id);

    const est4 = await Estimate.create({
      estimateNo: `EST-TEST-MFAIL-${Date.now()}`,
      jobCardId: jc4._id,
      status: 'Draft',
      totals: { grandTotal: 2500 }
    });
    cleanupIds.estimates.push(est4._id);

    shouldSimulateMetaFailure = true;
    try {
      await axios.post(`${baseUrl}/api/estimates/${est4._id}/send`, {}, { headers: authHeaders });
      assert.fail('Should fail when Meta API fails');
    } catch (err) {
      assert.strictEqual(err.response?.status, 500);
    }
    shouldSimulateMetaFailure = false;

    const checkEst4 = await Estimate.findById(est4._id);
    assert.strictEqual(checkEst4.status, 'Draft', 'Estimate status must remain Draft when Meta API dispatch fails');
    console.log('✔ TEST 5 PASSED: Validation errors & Meta dispatches retain Draft status.');

    console.log('\n========================================================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY! 100% VERIFIED!');
    console.log('========================================================================\n');
  } finally {
    axios.post = originalAxiosPost;
    server.close();

    // Clean up test records
    await Customer.deleteMany({ _id: { $in: cleanupIds.customers } });
    await Vehicle.deleteMany({ _id: { $in: cleanupIds.vehicles } });
    await JobCard.deleteMany({ _id: { $in: cleanupIds.jobcards } });
    await Estimate.deleteMany({ _id: { $in: cleanupIds.estimates } });
    await WhatsAppLog.deleteMany({ _id: { $in: cleanupIds.whatsappLogs } });
    for (const f of cleanupIds.files) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch (e) {}
    }
    await mongoose.disconnect();
  }
}

runTestSuite().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
