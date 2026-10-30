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

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/estimates', estimatesRouter);

async function runTestSuite() {
  console.log('========================================================================');
  console.log('TEST SUITE: WhatsApp Customer Estimate PDF Automation');
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
          messages: [{ id: `wamid.TEST_EST_DOC_${Date.now()}` }]
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
    // TEST 1: Send Customer Estimate PDF on Draft Estimate (Success Path)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Dispatch Customer Estimate PDF on Draft Estimate ---');
    const cust1 = await Customer.create({
      name: 'Ravi Teja Test',
      mobile: '9876543210',
      address: 'Madhapur, Hyderabad, Telangana'
    });
    cleanupIds.customers.push(cust1._id);

    const veh1 = await Vehicle.create({
      customerId: cust1._id,
      vehicleNumber: 'TS09EZ1234',
      make: 'Hyundai',
      model: 'Creta',
      odometerReading: 15000,
      fuelType: 'Petrol'
    });
    cleanupIds.vehicles.push(veh1._id);

    const jc1 = await JobCard.create({
      jobCardNo: `JC-TEST-${Date.now()}`,
      customerId: cust1._id,
      vehicleId: veh1._id,
      serviceAdvisorId: adminUser._id,
      time: '10:00 AM',
      odometerReading: 25000,
      status: 'Estimation'
    });
    cleanupIds.jobcards.push(jc1._id);

    const est1 = await Estimate.create({
      estimateNo: `EST-TEST-${Date.now()}`,
      jobCardId: jc1._id,
      status: 'Draft',
      parts: [
        { name: 'Engine Oil Filter', qty: 1, rate: 450, taxableValue: 450, amount: 450, gstPercent: 18, gstAmount: 81, total: 531 }
      ],
      labour: [
        { description: 'Oil Changing Service', rate: 500, taxableValue: 500, amount: 500, gstPercent: 18, gstAmount: 90, total: 590 }
      ],
      totals: {
        partsTotal: 450,
        labourTotal: 500,
        gstTotal: 171,
        grandTotal: 1121
      },
      amountInWords: 'Rupees One Thousand One Hundred Twenty One Only'
    });
    cleanupIds.estimates.push(est1._id);

    capturedDispatches.length = 0;
    shouldSimulateMetaFailure = false;

    // Trigger Send action via POST /api/estimates/:id/send
    const sendRes1 = await axios.post(`${baseUrl}/api/estimates/${est1._id}/send`, {}, { headers: authHeaders });
    assert.strictEqual(sendRes1.status, 200, 'POST /send must return HTTP 200 on success');
    assert.strictEqual(sendRes1.data.success, true);
    assert.strictEqual(sendRes1.data.estimate.status, 'Sent', 'Estimate status must update to Sent');

    // Verify WhatsApp dispatch payload
    assert.strictEqual(capturedDispatches.length, 1, 'Exactly one WhatsApp document dispatch should occur');
    const dispatch1 = capturedDispatches[0];
    assert.strictEqual(dispatch1.data.type, 'document', 'Message type must be document');
    assert.strictEqual(dispatch1.data.to, '919876543210', 'Must send to customer E.164 phone');
    assert(dispatch1.data.document, 'Must include document object');
    assert(dispatch1.data.document.link, 'Must contain public PDF link');
    const cleanEstNo = String(est1.estimateNo || 'EST').replace(/[^a-zA-Z0-9_-]/g, '_');
    assert.strictEqual(dispatch1.data.document.filename, `Customer_Estimate_${cleanEstNo}.pdf`, 'Must name Customer Estimate PDF correctly');

    // Verify message caption contains required details
    const caption1 = dispatch1.data.document.caption;
    console.log('Dispatched WhatsApp Caption:\n' + caption1);
    assert(caption1.includes('Ravi Teja Test'), 'Caption must contain customer name');
    assert(caption1.includes(est1.estimateNo), 'Caption must contain estimate number');
    assert(caption1.includes('TS09EZ1234'), 'Caption must contain vehicle number TS09EZ1234');
    assert(!/Vehicle:\s*MVSS\s*Automobiles/i.test(caption1), 'Vehicle must NEVER be MVSS Automobiles');
    assert(caption1.includes('1,121'), 'Caption must contain formatted grand total 1,121');
    assert(caption1.includes('Please find your detailed estimate attached.'), 'Caption must contain estimate attachment text');

    // Verify Customer Estimate PDF file exists on disk
    const diskPdfPath = path.join(__dirname, `../uploads/estimates/customer_estimate_${est1._id}.pdf`);
    assert(fs.existsSync(diskPdfPath), 'Generated Customer Estimate PDF must exist in backend/uploads/estimates/');
    cleanupIds.files.push(diskPdfPath);

    // Verify Database state
    const updatedEst1 = await Estimate.findById(est1._id);
    assert.strictEqual(updatedEst1.status, 'Sent', 'DB estimate status must be Sent');
    assert(updatedEst1.pdfUrl, 'DB estimate must have pdfUrl saved');
    assert.strictEqual(updatedEst1.whatsappHistory?.length, 1, 'DB estimate must have 1 entry in whatsappHistory');
    assert.strictEqual(updatedEst1.whatsappHistory[0].status, 'sent');
    assert.strictEqual(updatedEst1.whatsappHistory[0].recipientPhone, '919876543210');

    // Verify WhatsAppLog
    const waLog1 = await WhatsAppLog.findOne({ relatedEntity: est1._id });
    assert(waLog1, 'WhatsAppLog record must exist for this estimate dispatch');
    assert.strictEqual(waLog1.messageType, 'document');
    assert.strictEqual(waLog1.status, 'sent');
    cleanupIds.whatsappLogs.push(waLog1._id);
    console.log('✔ TEST 1 PASSED: Customer Estimate PDF generated and sent via WhatsApp successfully.');

    // -------------------------------------------------------------------------
    // TEST 2: Idempotency & Duplicate Click Prevention
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Idempotency & Multiple Click Prevention ---');
    capturedDispatches.length = 0;

    const sendRes2 = await axios.post(`${baseUrl}/api/estimates/${est1._id}/send`, {}, { headers: authHeaders });
    assert.strictEqual(sendRes2.status, 200, 'Duplicate send call should succeed idempotently');
    assert.strictEqual(sendRes2.data.alreadySent, true, 'Response must identify that PDF was already sent');
    assert.strictEqual(capturedDispatches.length, 0, 'No additional Meta WhatsApp API call should be dispatched');

    const estAfterDup = await Estimate.findById(est1._id);
    assert.strictEqual(estAfterDup.status, 'Sent', 'Status must remain Sent');
    assert.strictEqual(estAfterDup.whatsappHistory.length, 1, 'whatsappHistory should not have duplicate entries for same version');
    console.log('✔ TEST 2 PASSED: Duplicate send clicks safely intercepted without duplicate Meta calls.');

    // -------------------------------------------------------------------------
    // TEST 3: Validation Error: Missing / Invalid / Opted-out WhatsApp Contact
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Validation Error on Invalid/Opted-out WhatsApp Number ---');
    const cust3 = await Customer.create({
      name: 'No Phone Customer',
      mobile: '9876543211',
      address: 'Hyderabad',
      whatsappOptIn: false
    });
    cleanupIds.customers.push(cust3._id);

    const veh3 = await Vehicle.create({
      customerId: cust3._id,
      vehicleNumber: 'TS07AB9999',
      make: 'Hyundai',
      model: 'i20',
      odometerReading: 15000,
      fuelType: 'Petrol'
    });
    cleanupIds.vehicles.push(veh3._id);

    const jc3 = await JobCard.create({
      jobCardNo: `JC-TEST-NOPHN-${Date.now()}`,
      customerId: cust3._id,
      vehicleId: veh3._id,
      serviceAdvisorId: adminUser._id,
      time: '10:00 AM',
      odometerReading: 25000,
      status: 'Estimation'
    });
    cleanupIds.jobcards.push(jc3._id);

    const est3 = await Estimate.create({
      estimateNo: `EST-TEST-NOPHN-${Date.now()}`,
      jobCardId: jc3._id,
      status: 'Draft',
      totals: { grandTotal: 5000 }
    });
    cleanupIds.estimates.push(est3._id);

    capturedDispatches.length = 0;
    let errorCaught3 = false;
    try {
      await axios.post(`${baseUrl}/api/estimates/${est3._id}/send`, {}, { headers: authHeaders });
    } catch (err) {
      errorCaught3 = true;
      assert.strictEqual(err.response?.status, 400, 'Should return HTTP 400 for invalid phone');
      assert(err.response?.data?.error?.includes('Customer has no valid WhatsApp number'), 'Should specify missing/invalid number');
    }
    assert(errorCaught3, 'API must reject estimate send when customer has invalid WhatsApp phone');
    assert.strictEqual(capturedDispatches.length, 0, 'No WhatsApp API call should be attempted');

    const estAfterNoPhone = await Estimate.findById(est3._id);
    assert.strictEqual(estAfterNoPhone.status, 'Draft', 'Estimate status must remain Draft upon validation failure');
    console.log('✔ TEST 3 PASSED: Validation correctly stopped sending and kept Draft status.');

    // -------------------------------------------------------------------------
    // TEST 4: Meta WhatsApp API Failure Handling
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Failure Handling When Meta API Rejects / Fails ---');
    const cust4 = await Customer.create({
      name: 'Priya Sharma',
      mobile: '9848012345',
      address: 'Banjara Hills, Hyderabad'
    });
    cleanupIds.customers.push(cust4._id);

    const veh4 = await Vehicle.create({
      customerId: cust4._id,
      vehicleNumber: 'AP09CD5555',
      make: 'Hyundai',
      model: 'Verna',
      odometerReading: 15000,
      fuelType: 'Petrol'
    });
    cleanupIds.vehicles.push(veh4._id);

    const jc4 = await JobCard.create({
      jobCardNo: `JC-TEST-FAIL-${Date.now()}`,
      customerId: cust4._id,
      vehicleId: veh4._id,
      serviceAdvisorId: adminUser._id,
      time: '10:00 AM',
      odometerReading: 25000,
      status: 'Estimation'
    });
    cleanupIds.jobcards.push(jc4._id);

    const est4 = await Estimate.create({
      estimateNo: `EST-TEST-FAIL-${Date.now()}`,
      jobCardId: jc4._id,
      status: 'Draft',
      totals: { grandTotal: 3500 }
    });
    cleanupIds.estimates.push(est4._id);

    capturedDispatches.length = 0;
    shouldSimulateMetaFailure = true;
    simulatedFailureMessage = 'Meta Graph API 500 Internal Error: Document rendering failed';

    let errorCaught4 = false;
    try {
      await axios.post(`${baseUrl}/api/estimates/${est4._id}/send`, {}, { headers: authHeaders });
    } catch (err) {
      errorCaught4 = true;
      assert.strictEqual(err.response?.status, 500, 'Should return HTTP 500 on Meta API failure');
      assert(err.response?.data?.error?.includes('WhatsApp sending failed'), 'Should convey WhatsApp failure');
    }
    assert(errorCaught4, 'API must return error response when Meta WhatsApp send fails');

    const estAfterFailure = await Estimate.findById(est4._id);
    assert.strictEqual(estAfterFailure.status, 'Draft', 'CRITICAL REQUIREMENT: Estimate status must RETAIN Draft status on failure');
    assert.strictEqual(estAfterFailure.whatsappHistory?.length, 1, 'whatsappHistory must record the failure');
    assert.strictEqual(estAfterFailure.whatsappHistory[0].status, 'failed');
    assert(estAfterFailure.whatsappHistory[0].error.includes('Meta Graph API 500'), 'Failure reason must be recorded in audit');

    const failedWaLog = await WhatsAppLog.findOne({ relatedEntity: est4._id });
    assert(failedWaLog, 'WhatsAppLog must persist the failed attempt for audit');
    assert.strictEqual(failedWaLog.status, 'failed');
    cleanupIds.whatsappLogs.push(failedWaLog._id);
    console.log('✔ TEST 4 PASSED: Estimate strictly retained Draft status and logged failure in audit.');

    // -------------------------------------------------------------------------
    // TEST 5: PUT /api/estimates/:id with status: 'Sent' also triggers automation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: PUT /api/estimates/:id with status: "Sent" triggers automation ---');
    const cust5 = await Customer.create({
      name: 'Sunil Kumar',
      mobile: '9123456789',
      address: 'Secunderabad'
    });
    cleanupIds.customers.push(cust5._id);

    const veh5 = await Vehicle.create({
      customerId: cust5._id,
      vehicleNumber: 'TS10GH4321',
      make: 'Hyundai',
      model: 'Tucson',
      odometerReading: 15000,
      fuelType: 'Petrol'
    });
    cleanupIds.vehicles.push(veh5._id);

    const jc5 = await JobCard.create({
      jobCardNo: `JC-TEST-PUT-${Date.now()}`,
      customerId: cust5._id,
      vehicleId: veh5._id,
      serviceAdvisorId: adminUser._id,
      time: '10:00 AM',
      odometerReading: 25000,
      status: 'Estimation'
    });
    cleanupIds.jobcards.push(jc5._id);

    const est5 = await Estimate.create({
      estimateNo: `EST-TEST-PUT-${Date.now()}`,
      jobCardId: jc5._id,
      status: 'Draft',
      totals: { grandTotal: 2800 }
    });
    cleanupIds.estimates.push(est5._id);

    capturedDispatches.length = 0;
    shouldSimulateMetaFailure = false;

    const putRes5 = await axios.put(`${baseUrl}/api/estimates/${est5._id}`, { status: 'Sent' }, { headers: authHeaders });
    assert.strictEqual(putRes5.status, 200);

    const estAfterPut = await Estimate.findById(est5._id);
    assert.strictEqual(estAfterPut.status, 'Sent', 'Estimate status must update to Sent via PUT');
    assert.strictEqual(estAfterPut.whatsappHistory?.length, 1);
    assert.strictEqual(capturedDispatches.length, 1, 'WhatsApp document must be sent when updating status to Sent via PUT');

    const diskPdfPath5 = path.join(__dirname, `../uploads/estimates/customer_estimate_${est5._id}.pdf`);
    if (fs.existsSync(diskPdfPath5)) cleanupIds.files.push(diskPdfPath5);

    const waLog5 = await WhatsAppLog.findOne({ relatedEntity: est5._id });
    if (waLog5) cleanupIds.whatsappLogs.push(waLog5._id);
    console.log('✔ TEST 5 PASSED: PUT /api/estimates/:id seamlessly executes customer estimate PDF WhatsApp automation.');

    console.log('\n========================================================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY! (5/5)');
    console.log('========================================================================\n');

  } finally {
    // Restore axios
    axios.post = originalAxiosPost;

    // Cleanup DB records
    console.log('Cleaning up test data...');
    if (cleanupIds.estimates.length) await Estimate.deleteMany({ _id: { $in: cleanupIds.estimates } });
    if (cleanupIds.jobcards.length) await JobCard.deleteMany({ _id: { $in: cleanupIds.jobcards } });
    if (cleanupIds.vehicles.length) await Vehicle.deleteMany({ _id: { $in: cleanupIds.vehicles } });
    if (cleanupIds.customers.length) await Customer.deleteMany({ _id: { $in: cleanupIds.customers } });
    if (cleanupIds.whatsappLogs.length) await WhatsAppLog.deleteMany({ _id: { $in: cleanupIds.whatsappLogs } });

    // Cleanup files
    for (const file of cleanupIds.files) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch (e) {}
    }

    server.close();
    await mongoose.disconnect();
    console.log('✔ Test server closed and database disconnected.');
  }
}

runTestSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
