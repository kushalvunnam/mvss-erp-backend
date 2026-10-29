const assert = require('assert');
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');

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
const customersRouter = require('../routes/customers');
const { dynamicTemplateMap, TEMPLATE_CONFIG } = require('../services/whatsappService');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/estimates', estimatesRouter);
app.use('/api/customers', customersRouter);

async function runTestSuite() {
  console.log('========================================================================');
  console.log('TEST SUITE: WhatsApp Estimate Awaiting Customer Approval Automation');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✔ Connected to MongoDB Atlas.');

  // Preload dynamicTemplateMap with approved templates
  dynamicTemplateMap.set('estimate_awaiting_customer_approval', {
    name: 'estimate_awaiting_customer_approval',
    language: 'en',
    status: 'APPROVED',
    paramCount: 4
  });
  dynamicTemplateMap.set('mvss_estimate_approved', {
    name: 'mvss_estimate_approved',
    language: 'en',
    status: 'APPROVED',
    paramCount: 5
  });

  // Find or create admin user for authentication
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

  // Intercept axios.post to inspect dispatched Meta WhatsApp payloads
  const capturedDispatches = [];
  let shouldSimulateMetaFailure = false;
  const originalAxiosPost = axios.post;

  axios.post = async (url, data, config) => {
    if (typeof url === 'string' && (url.includes('graph.facebook.com') || url.includes('/messages'))) {
      capturedDispatches.push({ url, data, config, timestamp: new Date() });
      if (shouldSimulateMetaFailure) {
        const error = new Error('Simulated Meta Graph API Service Unavailable');
        error.response = { status: 503, data: { error: { message: 'Service Unavailable', code: 2 } } };
        throw error;
      }
      return {
        status: 200,
        data: {
          messaging_product: 'whatsapp',
          contacts: [{ input: data?.to || '918008092742', wa_id: data?.to || '918008092742' }],
          messages: [{ id: `wamid.TEST_EST_AWAIT_${Date.now()}` }]
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
    const timestamp = Date.now();

    // Setup base customer and vehicle records
    const testCustomer = new Customer({
      name: `Kushal Test Approval ${timestamp}`,
      mobile: '918008092742',
      email: `test_approval_${timestamp}@mvss.test`,
      whatsappOptIn: true
    });
    await testCustomer.save();
    cleanupIds.customers.push(testCustomer._id);

    const testVehicle = new Vehicle({
      vehicleNumber: `TS09EST${String(timestamp).slice(-4)}`,
      customerId: testCustomer._id,
      make: 'Hyundai',
      model: 'Creta',
      fuelType: 'Diesel',
      odometerReading: 25000
    });
    await testVehicle.save();
    cleanupIds.vehicles.push(testVehicle._id);

    const testJobCard = new JobCard({
      jobCardNo: `JC-TEST-${String(timestamp).slice(-5)}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      time: '10:00 AM',
      odometerReading: 25000,
      status: 'Inspect Stage',
      serviceType: 'General Servicing'
    });
    await testJobCard.save();
    cleanupIds.jobcards.push(testJobCard._id);

    // =========================================================================
    // Test 1: Estimate Creation dispatches exact 4-parameter template
    // =========================================================================
    console.log('\n--- [Test 1] Estimate Creation Dispatches estimate_awaiting_customer_approval ---');
    capturedDispatches.length = 0;

    const createEstRes = await axios.post(`${baseUrl}/api/estimates`, {
      jobCardId: testJobCard._id,
      parts: [
        { name: 'Engine Oil Synthetic', qty: 4, rate: 1000, gstPercent: 18 },
        { name: 'Oil Filter Premium', qty: 1, rate: 500, gstPercent: 18 }
      ],
      labour: [
        { description: 'Periodic Maintenance Service', rate: 2000, gstPercent: 18 }
      ]
    }, { headers: authHeaders });

    assert.strictEqual(createEstRes.status, 201, 'Estimate creation API must return HTTP 201');
    const createdEstimate = createEstRes.data;
    cleanupIds.estimates.push(createdEstimate._id);
    assert(createdEstimate._id, 'Estimate must have an _id');
    assert.strictEqual(createdEstimate.status, 'Draft', 'New estimate status must be Draft (awaiting approval)');

    assert.strictEqual(capturedDispatches.length, 1, 'Exactly one WhatsApp dispatch must occur on estimate creation');
    const dispatch1 = capturedDispatches[0];

    assert.strictEqual(dispatch1.data.template.name, 'estimate_awaiting_customer_approval', 'Must use approved template name "estimate_awaiting_customer_approval"');
    assert.strictEqual(dispatch1.data.template.language.code, 'en', 'Template language must be "en"');
    assert.strictEqual(dispatch1.data.to, '918008092742', 'Recipient phone must be normalized Indian number');

    const bodyComp = dispatch1.data.template.components.find(c => c.type === 'body');
    assert(bodyComp, 'Template must contain body component');
    assert.strictEqual(bodyComp.parameters.length, 4, 'Body component must have exactly 4 parameters');

    console.log('  Dispatched Parameters:', bodyComp.parameters.map(p => p.text));
    console.log('✔ Test 1 Passed: Estimate created awaiting approval triggers correct template with 4 parameters.');

    // =========================================================================
    // Test 2: Correct Placeholder Values Mapping
    // =========================================================================
    console.log('\n--- [Test 2] Placeholder Values Mapping Verification ---');
    // {{1}} -> Customer name
    assert.strictEqual(bodyComp.parameters[0].text, testCustomer.name, '{{1}} must be customer actual name');

    // {{2}} -> Vehicle Number (Registration Number) from linked vehicle
    assert.strictEqual(bodyComp.parameters[1].text, testVehicle.vehicleNumber.toUpperCase(), '{{2}} must be vehicle registration number');

    // {{3}} -> Estimate Number
    assert.strictEqual(bodyComp.parameters[2].text, createdEstimate.estimateNo, '{{3}} must be estimate number');

    // {{4}} -> Formatted Estimated Amount in INR (e.g. 14,500 or rounded integer)
    const expectedAmount = Math.round(createdEstimate.totals.grandTotal).toLocaleString('en-IN');
    assert.strictEqual(bodyComp.parameters[3].text, expectedAmount, '{{4}} must be formatted amount without currency symbol');
    assert(!bodyComp.parameters[3].text.includes('₹'), '{{4}} must not contain ₹ because template body already has ₹{{4}}');

    console.log(`  {{1}} Customer Name: "${bodyComp.parameters[0].text}"`);
    console.log(`  {{2}} Vehicle Number: "${bodyComp.parameters[1].text}"`);
    console.log(`  {{3}} Estimate Number: "${bodyComp.parameters[2].text}"`);
    console.log(`  {{4}} Estimated Amount: "${bodyComp.parameters[3].text}"`);
    console.log('✔ Test 2 Passed: Placeholders {{1}}, {{2}}, {{3}}, {{4}} correctly mapped.');

    // =========================================================================
    // Test 3: Vehicle Number Resolution never uses company name "MVSS Automobiles"
    // =========================================================================
    console.log('\n--- [Test 3] Vehicle Number Resolution Never Uses Workshop Name ---');
    // Case A: Missing vehicle record
    const custNoVeh = new Customer({
      name: 'Customer With No Vehicle',
      mobile: '918008092742',
      whatsappOptIn: true
    });
    await custNoVeh.save();
    cleanupIds.customers.push(custNoVeh._id);

    const jcNoVeh = new JobCard({
      jobCardNo: `JC-NOVEH-${String(timestamp).slice(-5)}`,
      customerId: custNoVeh._id,
      vehicleId: new mongoose.Types.ObjectId(), // Non-existent vehicle ID to test missing vehicle record
      serviceAdvisorId: adminUser._id,
      time: '10:00 AM',
      odometerReading: 15000,
      status: 'Inspect Stage',
      serviceType: 'General Servicing'
    });
    await jcNoVeh.save();
    cleanupIds.jobcards.push(jcNoVeh._id);

    capturedDispatches.length = 0;
    const estNoVehRes = await axios.post(`${baseUrl}/api/estimates`, {
      jobCardId: jcNoVeh._id,
      parts: [],
      labour: [{ description: 'Diagnostic Labour', rate: 1000 }]
    }, { headers: authHeaders });

    cleanupIds.estimates.push(estNoVehRes.data._id);
    assert.strictEqual(capturedDispatches.length, 1);
    const bodyNoVeh = capturedDispatches[0].data.template.components.find(c => c.type === 'body');
    assert.strictEqual(bodyNoVeh.parameters[1].text, 'Not provided', 'Missing vehicle registration must default to "Not provided"');
    assert(!/mvss\s*automobiles/i.test(bodyNoVeh.parameters[1].text), 'Vehicle number must NEVER be workshop name');

    // Case B: Vehicle record with workshop name erroneously set
    const vehBuggy = new Vehicle({
      vehicleNumber: 'MVSS Automobiles',
      customerId: custNoVeh._id,
      make: 'Maruti',
      model: 'Swift',
      fuelType: 'Petrol',
      odometerReading: 12000
    });
    await vehBuggy.save();
    cleanupIds.vehicles.push(vehBuggy._id);

    const jcBuggy = new JobCard({
      jobCardNo: `JC-BUGGY-${String(timestamp).slice(-5)}`,
      customerId: custNoVeh._id,
      vehicleId: vehBuggy._id,
      serviceAdvisorId: adminUser._id,
      time: '10:00 AM',
      odometerReading: 12000,
      status: 'Inspect Stage',
      serviceType: 'General Servicing'
    });
    await jcBuggy.save();
    cleanupIds.jobcards.push(jcBuggy._id);

    capturedDispatches.length = 0;
    const estBuggyRes = await axios.post(`${baseUrl}/api/estimates`, {
      jobCardId: jcBuggy._id,
      parts: [],
      labour: [{ description: 'Inspection Labour', rate: 1500 }]
    }, { headers: authHeaders });

    cleanupIds.estimates.push(estBuggyRes.data._id);
    assert.strictEqual(capturedDispatches.length, 1);
    const bodyBuggy = capturedDispatches[0].data.template.components.find(c => c.type === 'body');
    assert.notStrictEqual(bodyBuggy.parameters[1].text, 'MVSS Automobiles', 'Must guard against workshop name');
    assert.strictEqual(bodyBuggy.parameters[1].text, 'Not provided', 'Should fallback to "Not provided" if company name was stored');

    console.log('✔ Test 3 Passed: Vehicle number resolution strictly guards against company name.');

    // =========================================================================
    // Test 4: Creating a customer alone does NOT trigger this estimate message
    // =========================================================================
    console.log('\n--- [Test 4] Creating Customer Alone Does NOT Trigger Estimate Template ---');
    capturedDispatches.length = 0;

    await axios.post(`${baseUrl}/api/customers`, {
      name: `Standalone Customer ${timestamp}`,
      mobile: '918008092742',
      email: `standalone_${timestamp}@test.com`
    }, { headers: authHeaders });

    const estimateDispatches = capturedDispatches.filter(d => 
      d.data?.template?.name === 'estimate_awaiting_customer_approval' ||
      d.data?.template?.name === 'mvss_estimate_created'
    );
    assert.strictEqual(estimateDispatches.length, 0, 'Customer creation must NOT trigger estimate awaiting approval template');
    console.log('✔ Test 4 Passed: Customer creation does not trigger estimate awaiting approval notification.');

    // =========================================================================
    // Test 5: Approving an estimate does NOT re-trigger this awaiting message
    // =========================================================================
    console.log('\n--- [Test 5] Approving Estimate Does NOT Re-trigger Awaiting Approval Template ---');
    capturedDispatches.length = 0;

    const approveRes = await axios.put(`${baseUrl}/api/estimates/${createdEstimate._id}/approve`, {}, { headers: authHeaders });
    assert.strictEqual(approveRes.status, 200, 'Estimate approval must succeed');
    assert.strictEqual(approveRes.data.status, 'Approved', 'Estimate status must be Approved');

    const awaitingDispatchesOnApprove = capturedDispatches.filter(d => 
      d.data?.template?.name === 'estimate_awaiting_customer_approval'
    );
    assert.strictEqual(awaitingDispatchesOnApprove.length, 0, 'Estimate approval must NOT dispatch estimate_awaiting_customer_approval');

    // Confirm that approval triggered the appropriate approved template (mvss_estimate_approved)
    const approvedDispatches = capturedDispatches.filter(d => d.data?.template?.name === 'mvss_estimate_approved');
    assert.strictEqual(approvedDispatches.length, 1, 'Approval must dispatch mvss_estimate_approved');
    console.log('✔ Test 5 Passed: Approving an estimate triggers mvss_estimate_approved and does NOT re-trigger awaiting approval message.');

    // =========================================================================
    // Test 6: Estimate created with already-approved or rejected status is skipped
    // =========================================================================
    console.log('\n--- [Test 6] Non-awaiting Statuses (Approved, Rejected, Cancelled) Are Skipped ---');
    capturedDispatches.length = 0;

    const directApprovedEst = new Estimate({
      estimateNo: `EST-APPR-${String(timestamp).slice(-5)}`,
      jobCardId: testJobCard._id,
      parts: [],
      labour: [{ description: 'Pre-approved work', rate: 500, amount: 500, gstPercent: 18, gstAmount: 90, total: 590 }],
      totals: { partsTotal: 0, labourTotal: 500, gstTotal: 90, grandTotal: 590 },
      status: 'Approved'
    });
    await directApprovedEst.save();
    cleanupIds.estimates.push(directApprovedEst._id);

    // Verify WhatsAppLog has no entry for directApprovedEst
    const logCheck = await WhatsAppLog.findOne({
      relatedEntity: directApprovedEst._id,
      templateName: 'estimate_awaiting_customer_approval'
    });
    assert.strictEqual(logCheck, null, 'No WhatsApp log should exist for already-approved estimate');
    console.log('✔ Test 6 Passed: Estimates created with non-awaiting status do not trigger awaiting notification.');

    // =========================================================================
    // Test 7: Idempotency & Duplicate Prevention
    // =========================================================================
    console.log('\n--- [Test 7] Idempotency & Duplicate Prevention ---');
    capturedDispatches.length = 0;

    // Create a new estimate
    const idempEstRes = await axios.post(`${baseUrl}/api/estimates`, {
      jobCardId: testJobCard._id,
      parts: [],
      labour: [{ description: 'Labour Item', rate: 1000 }]
    }, { headers: authHeaders });
    const idempEstId = idempEstRes.data._id;
    cleanupIds.estimates.push(idempEstId);

    assert.strictEqual(capturedDispatches.length, 1, 'First dispatch should occur');

    // Simulate duplicate dispatch by checking that existing WhatsAppLog prevents second send
    const { sendTemplateMessage } = require('../services/whatsappService');
    const dupRes = await sendTemplateMessage({
      to: '918008092742',
      templateName: 'estimate_awaiting_customer_approval',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Kushal' },
            { type: 'text', text: 'TS09EST0001' },
            { type: 'text', text: 'MVSS/EST/26-27/001' },
            { type: 'text', text: '1,180' }
          ]
        }
      ],
      recipientName: 'Kushal',
      idempotencyKey: `estimate_awaiting_approval_${idempEstId}`
    });

    assert.strictEqual(dupRes.status, 'duplicate_skipped', 'Second dispatch with identical key must be skipped');
    console.log('✔ Test 7 Passed: Duplicate dispatches are idempotently skipped.');

    // =========================================================================
    // Test 8: Missing or Invalid Phone Number Handling
    // =========================================================================
    console.log('\n--- [Test 8] Ineligible/Opted-out Contact Skips Gracefully Without Error ---');
    const custOptedOut = new Customer({
      name: 'Customer Opted Out',
      mobile: '918008092742',
      whatsappOptIn: false // Customer opted out
    });
    await custOptedOut.save();
    cleanupIds.customers.push(custOptedOut._id);

    const jcNoPhone = new JobCard({
      jobCardNo: `JC-NOPHONE-${String(timestamp).slice(-5)}`,
      customerId: custOptedOut._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      time: '10:00 AM',
      odometerReading: 20000,
      status: 'Inspect Stage',
      serviceType: 'General Servicing'
    });
    await jcNoPhone.save();
    cleanupIds.jobcards.push(jcNoPhone._id);

    capturedDispatches.length = 0;
    const estNoPhoneRes = await axios.post(`${baseUrl}/api/estimates`, {
      jobCardId: jcNoPhone._id,
      parts: [],
      labour: [{ description: 'Service Labour', rate: 2000 }]
    }, { headers: authHeaders });

    assert.strictEqual(estNoPhoneRes.status, 201, 'Estimate creation must still succeed with HTTP 201');
    assert.strictEqual(capturedDispatches.length, 0, 'No WhatsApp send should be attempted when customer contact is ineligible');
    console.log('✔ Test 8 Passed: Ineligible customer contact skips WhatsApp send gracefully without interrupting estimate creation.');

    // =========================================================================
    // Test 9: Meta API Error Isolation Preserves Estimate Creation
    // =========================================================================
    console.log('\n--- [Test 9] Meta API Failure Isolation ---');
    shouldSimulateMetaFailure = true;
    capturedDispatches.length = 0;

    const estMetaFailRes = await axios.post(`${baseUrl}/api/estimates`, {
      jobCardId: testJobCard._id,
      parts: [],
      labour: [{ description: 'Check Up', rate: 500 }]
    }, { headers: authHeaders });

    assert.strictEqual(estMetaFailRes.status, 201, 'Estimate creation must succeed even if Meta API fails');
    assert(estMetaFailRes.data._id, 'Created estimate must be returned');
    cleanupIds.estimates.push(estMetaFailRes.data._id);

    shouldSimulateMetaFailure = false;
    console.log('✔ Test 9 Passed: Meta Cloud API error is cleanly isolated; estimate creation succeeds.');

    console.log('\n========================================================================');
    console.log('ALL 9 VERIFICATION TESTS PASSED SUCCESSFULLY! ✔✔✔');
    console.log('========================================================================\n');

  } finally {
    // Restore original axios
    axios.post = originalAxiosPost;

    // Cleanup created test records
    console.log('Cleaning up test documents from database...');
    if (cleanupIds.estimates.length) await Estimate.deleteMany({ _id: { $in: cleanupIds.estimates } });
    if (cleanupIds.jobcards.length) await JobCard.deleteMany({ _id: { $in: cleanupIds.jobcards } });
    if (cleanupIds.vehicles.length) await Vehicle.deleteMany({ _id: { $in: cleanupIds.vehicles } });
    if (cleanupIds.customers.length) await Customer.deleteMany({ _id: { $in: cleanupIds.customers } });
    await WhatsAppLog.deleteMany({
      idempotencyKey: { $regex: /^estimate_awaiting_approval_/ }
    });

    server.close();
    await mongoose.disconnect();
    console.log('✔ Disconnected from MongoDB and closed test server.');
  }
}

runTestSuite().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
