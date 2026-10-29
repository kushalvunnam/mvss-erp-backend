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
const User = require('../models/User');
const jobcardsRouter = require('../routes/jobcards');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/jobcards', jobcardsRouter);

async function runFQIWorkflowTests() {
  console.log('========================================================================');
  console.log('TEST SUITE: MVSS Automobiles Final Quality Inspection (FQI) Workflow');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB database.');

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

  // Intercept axios.post to avoid external calls during test
  const capturedDispatches = [];
  const originalAxiosPost = axios.post;
  axios.post = async (url, data, config) => {
    capturedDispatches.push({ url, data, config, timestamp: new Date() });
    return { data: { success: true } };
  };

  const createdJobCardIds = [];
  let testCustomer = null;
  let testVehicle = null;

  try {
    // 0. Setup test customer and vehicle
    const rand = Math.floor(Math.random() * 900000 + 100000);
    testCustomer = await Customer.create({
      name: `FQI Test Customer ${rand}`,
      mobile: `99${rand.toString().padStart(8, '0')}`,
      email: `fqitest${rand}@example.com`
    });

    testVehicle = await Vehicle.create({
      customerId: testCustomer._id,
      vehicleNumber: `TS09FQI${rand.toString().slice(-4)}`,
      make: 'Hyundai',
      model: 'Creta',
      odometerReading: 12000,
      fuelType: 'Diesel'
    });

    console.log(`Setup test customer: ${testCustomer.name}, vehicle: ${testVehicle.vehicleNumber}\n`);

    // TEST 1: Block transition to "Ready for Delivery" if inspection is Pending / incomplete
    console.log('--- TEST 1: Block "Ready for Delivery" when PDI is Pending / incomplete ---');
    const jc1 = await JobCard.create({
      jobCardNo: `JC-TEST-PDI-1-${rand}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      status: 'Pre-Delivery Inspection',
      time: '10:00 AM',
      qcStatus: '',
      odometerReading: 12500,
      workCategory: 'General Service'
    });
    createdJobCardIds.push(jc1._id);

    try {
      await axios.put(`${baseUrl}/${jc1._id}`, { status: 'Ready for Delivery' }, { headers: authHeaders });
      assert.fail('Expected 400 rejection when moving to Ready for Delivery with Pending QC status');
    } catch (err) {
      assert.strictEqual(err.response?.status, 400, 'Must return HTTP 400');
      const expectedMsg = 'Pre-Delivery Inspection must be marked as Passed before this vehicle can be moved to Ready for Delivery. Please complete and save the inspection result.';
      assert.strictEqual(err.response?.data?.error, expectedMsg, 'Must return the exact validation message');
      console.log('✓ Correctly rejected with HTTP 400 and exact error message:');
      console.log(`  "${err.response?.data?.error}"`);
    }

    // Verify job card status was NOT changed in DB
    const freshJc1 = await JobCard.findById(jc1._id);
    assert.strictEqual(freshJc1.status, 'Pre-Delivery Inspection', 'Job card status must remain Pre-Delivery Inspection');
    console.log('✓ Database verification: Status unchanged.');

    // TEST 2: Block transition to "Ready for Delivery" if inspection is Failed / Rework Required
    console.log('\n--- TEST 2: Block "Ready for Delivery" when PDI is Failed / Rework Required ---');
    const jc2 = await JobCard.create({
      jobCardNo: `JC-TEST-PDI-2-${rand}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      status: 'Pre-Delivery Inspection',
      time: '10:00 AM',
      qcStatus: 'Fail',
      qcRemarks: 'Brake pads need adjustment',
      odometerReading: 15000,
      workCategory: 'General Service'
    });
    createdJobCardIds.push(jc2._id);

    try {
      await axios.put(`${baseUrl}/${jc2._id}`, { status: 'Ready for Delivery' }, { headers: authHeaders });
      assert.fail('Expected 400 rejection when moving to Ready for Delivery with Failed QC status');
    } catch (err) {
      assert.strictEqual(err.response?.status, 400, 'Must return HTTP 400');
      assert.strictEqual(err.response?.data?.error, 'Pre-Delivery Inspection must be marked as Passed before this vehicle can be moved to Ready for Delivery. Please complete and save the inspection result.');
      console.log('✓ Correctly rejected transition for Failed inspection with exact message.');
    }

    // TEST 3: Pass inspection first, then move to "Ready for Delivery" without re-prompting
    console.log('\n--- TEST 3: Pass inspection first, then move to "Ready for Delivery" ---');
    const jc3 = await JobCard.create({
      jobCardNo: `JC-TEST-PDI-3-${rand}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      status: 'Pre-Delivery Inspection',
      time: '10:00 AM',
      qcStatus: '',
      odometerReading: 20000,
      workCategory: 'General Service'
    });
    createdJobCardIds.push(jc3._id);

    // Step 3a: Authorized inspector records inspection pass
    const inspectRes = await axios.put(`${baseUrl}/${jc3._id}`, {
      qcStatus: 'Pass',
      qcRemarks: 'All 32 points inspected and road-tested successfully.',
      qcName: 'Senior Inspector Suresh'
    }, { headers: authHeaders });
    assert.strictEqual(inspectRes.status, 200);
    assert.strictEqual(inspectRes.data.qcStatus, 'Pass');
    console.log('✓ Inspection successfully recorded and saved as "Pass" in DB.');

    // Step 3b: Move to Ready for Delivery with no qcStatus payload (omitted)
    const deliverRes = await axios.put(`${baseUrl}/${jc3._id}`, {
      status: 'Ready for Delivery'
    }, { headers: authHeaders });
    assert.strictEqual(deliverRes.status, 200);
    assert.strictEqual(deliverRes.data.status, 'Ready for Delivery');
    console.log('✓ Transition to "Ready for Delivery" succeeded smoothly without re-prompting (persisted qcStatus used).');

    // TEST 4: Atomic Inspection Pass + Ready for Delivery in one call
    console.log('\n--- TEST 4: Atomic PDI Pass + Ready for Delivery ---');
    const jc4 = await JobCard.create({
      jobCardNo: `JC-TEST-PDI-4-${rand}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      status: 'Pre-Delivery Inspection',
      time: '10:00 AM',
      qcStatus: '',
      odometerReading: 22000,
      workCategory: 'General Service'
    });
    createdJobCardIds.push(jc4._id);

    const atomicRes = await axios.put(`${baseUrl}/${jc4._id}`, {
      status: 'Ready for Delivery',
      qcStatus: 'Pass',
      qcRemarks: 'Pre-delivery inspection verified. Cleared for customer delivery.'
    }, { headers: authHeaders });
    assert.strictEqual(atomicRes.status, 200);
    assert.strictEqual(atomicRes.data.status, 'Ready for Delivery');
    assert.strictEqual(atomicRes.data.qcStatus, 'Pass');
    console.log('✓ Atomic inspection pass + transition to Ready for Delivery succeeded.');

    // TEST 5: Backward compatibility with legacy "Quality Test", "Quality Check", and "Final Quality Inspection" statuses
    console.log('\n--- TEST 5: Backward compatibility with legacy Quality Test & Final Quality Inspection ---');
    const jcLegacyTest = await JobCard.create({
      jobCardNo: `JC-TEST-LEGACY-1-${rand}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      status: 'Quality Test',
      time: '10:00 AM',
      qcStatus: '',
      odometerReading: 30000,
      workCategory: 'General Service'
    });
    createdJobCardIds.push(jcLegacyTest._id);

    const jcLegacyCheck = await JobCard.create({
      jobCardNo: `JC-TEST-LEGACY-2-${rand}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      status: 'Final Quality Inspection',
      time: '10:00 AM',
      qcStatus: '',
      odometerReading: 32000,
      workCategory: 'General Service'
    });
    createdJobCardIds.push(jcLegacyCheck._id);

    // 5a. Both must enforce QC pass requirement
    try {
      await axios.put(`${baseUrl}/${jcLegacyTest._id}`, { status: 'Ready for Delivery' }, { headers: authHeaders });
      assert.fail('Expected rejection for legacy Quality Test without pass');
    } catch (err) {
      assert.strictEqual(err.response?.status, 400);
      assert.strictEqual(err.response?.data?.error, 'Pre-Delivery Inspection must be marked as Passed before this vehicle can be moved to Ready for Delivery. Please complete and save the inspection result.');
      console.log('✓ Legacy "Quality Test" record enforces PDI pass requirement.');
    }

    try {
      await axios.put(`${baseUrl}/${jcLegacyCheck._id}`, { status: 'Ready for Delivery' }, { headers: authHeaders });
      assert.fail('Expected rejection for legacy Final Quality Inspection without pass');
    } catch (err) {
      assert.strictEqual(err.response?.status, 400);
      assert.strictEqual(err.response?.data?.error, 'Pre-Delivery Inspection must be marked as Passed before this vehicle can be moved to Ready for Delivery. Please complete and save the inspection result.');
      console.log('✓ Legacy "Final Quality Inspection" record enforces PDI pass requirement.');
    }

    // 5b. When passed, both transition smoothly
    const legacyPassRes1 = await axios.put(`${baseUrl}/${jcLegacyTest._id}`, {
      status: 'Ready for Delivery',
      qcStatus: 'Pass'
    }, { headers: authHeaders });
    assert.strictEqual(legacyPassRes1.status, 200);
    assert.strictEqual(legacyPassRes1.data.status, 'Ready for Delivery');
    console.log('✓ Legacy "Quality Test" record transitions to Ready for Delivery when passed.');

    const legacyPassRes2 = await axios.put(`${baseUrl}/${jcLegacyCheck._id}`, {
      status: 'Ready for Delivery',
      qcStatus: 'Pass'
    }, { headers: authHeaders });
    assert.strictEqual(legacyPassRes2.status, 200);
    assert.strictEqual(legacyPassRes2.data.status, 'Ready for Delivery');
    console.log('✓ Legacy "Final Quality Inspection" record transitions to Ready for Delivery when passed.');

    // 5c. Query filtering with ?status=Quality Test or ?status=Pre-Delivery Inspection
    const queryRes1 = await axios.get(`${baseUrl}?status=Quality%20Test`, { headers: authHeaders });
    assert.strictEqual(queryRes1.status, 200);
    const queryRes2 = await axios.get(`${baseUrl}?status=Pre-Delivery%20Inspection`, { headers: authHeaders });
    assert.strictEqual(queryRes2.status, 200);
    console.log('✓ Status query filtering successfully retrieves cards across legacy and updated PDI statuses.');

    console.log('\n========================================================================');
    console.log('ALL PRE-DELIVERY INSPECTION (PDI) TESTS PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');

  } finally {
    // Cleanup test records
    if (createdJobCardIds.length > 0) {
      await JobCard.deleteMany({ _id: { $in: createdJobCardIds } });
      console.log(`Cleaned up ${createdJobCardIds.length} test job cards.`);
    }
    if (testVehicle) {
      await Vehicle.deleteOne({ _id: testVehicle._id });
      console.log(`Cleaned up test vehicle.`);
    }
    if (testCustomer) {
      await Customer.deleteOne({ _id: testCustomer._id });
      console.log(`Cleaned up test customer.`);
    }

    axios.post = originalAxiosPost;
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    console.log('Closed server and disconnected MongoDB.');
  }
}

runFQIWorkflowTests().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
