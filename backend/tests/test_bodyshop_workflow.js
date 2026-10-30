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

const BODY_SHOP_STAGES = [
  'Vehicle Reported',
  'Customer Not Responding',
  'Survey Pending',
  'Awaiting for Documents',
  'Awaiting for Work Approval',
  'Work in Progress',
  'Part not Available',
  'Awaiting for Reinspection',
  'Awaiting for Delivery Order',
  'Ready for Delivery',
  'Delivered',
  'Closed',
  'Estimation Pending'
];

async function runBodyShopWorkflowTests() {
  console.log('========================================================================');
  console.log('TEST SUITE: Dedicated Body Shop Status Workflow (13 Stages)');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB Atlas.');

  const adminUser = await User.findOne({ role: 'Admin', active: true });
  assert(adminUser, 'Admin user must exist in database');
  const adminToken = jwt.sign({ _id: adminUser._id, role: adminUser.role, name: adminUser.name }, JWT_SECRET);
  const adminHeaders = {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  };

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/jobcards`;

  const createdJobCardIds = [];
  let testCustomer = null;
  let testVehicle = null;
  let rand = Math.floor(Math.random() * 900000 + 100000);

  try {
    testCustomer = await Customer.create({
      name: `Body Shop Test Customer ${rand}`,
      mobile: `98${rand.toString().padStart(8, '0')}`,
      address: 'Test Address Kompally'
    });

    testVehicle = await Vehicle.create({
      customerId: testCustomer._id,
      vehicleNumber: `TS09BS${rand.toString().slice(-4)}`,
      make: 'Hyundai',
      model: 'Creta',
      fuelType: 'Petrol',
      odometerReading: 25000
    });

    // 1. Create a Job Card with workCategory 'B/P'
    console.log('\n--- Step 1: Create Test Job Card with Body & Paint (B/P) Category ---');
    const createRes = await axios.post(baseUrl, {
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      odometerReading: 25000,
      fuelLevel: '50%',
      serviceAdvisorId: adminUser._id,
      status: 'Created',
      workCategory: 'B/P',
      customerComplaints: [{ complaint: 'Rear bumper dent repair and painting' }]
    }, { headers: adminHeaders });

    assert.strictEqual(createRes.status, 201, 'Job card creation must return 201');
    const testJcId = createRes.data._id;
    createdJobCardIds.push(testJcId);
    console.log(`✓ Test Job Card created: JC #${createRes.data.jobCardNo} (ID: ${testJcId})`);

    // 2. Transition to 'Body Shop' status (defaults to Vehicle Reported)
    console.log('\n--- Step 2: Transition to Body Shop Status ---');
    const toBsRes = await axios.put(`${baseUrl}/${testJcId}`, {
      status: 'Body Shop',
      statusRemarks: 'Vehicle checked in for body shop repair'
    }, { headers: adminHeaders });

    assert.strictEqual(toBsRes.status, 200);
    assert.strictEqual(toBsRes.data.status, 'Body Shop');
    assert.strictEqual(toBsRes.data.bodyShopStatus, 'Vehicle Reported');
    assert.strictEqual(toBsRes.data.bodyShopStage, 'Vehicle Reported');
    console.log('✓ Successfully moved to Body Shop status. Default stage is "Vehicle Reported".');

    // 3. Cycle through all 13 Body Shop stages
    console.log('\n--- Step 3: Verify all 13 Dedicated Body Shop Stages ---');
    // Start from index 1 through 12, then finish with index 0 (Vehicle Reported) to test all 13 distinct transitions
    const stagesToTest = [...BODY_SHOP_STAGES.slice(1), BODY_SHOP_STAGES[0]];
    for (let i = 0; i < stagesToTest.length; i++) {
      const stage = stagesToTest[i];
      const stageRes = await axios.put(`${baseUrl}/${testJcId}`, {
        status: 'Body Shop',
        bodyShopStatus: stage,
        statusRemarks: `Testing transition to stage: ${stage}`
      }, { headers: adminHeaders });

      assert.strictEqual(stageRes.status, 200, `Failed updating to stage: ${stage}`);
      assert.strictEqual(stageRes.data.status, 'Body Shop');
      assert.strictEqual(stageRes.data.bodyShopStatus, stage);
      assert.strictEqual(stageRes.data.bodyShopStage, stage);

      // Verify in MongoDB directly
      const dbJc = await JobCard.findById(testJcId);
      assert.strictEqual(dbJc.status, 'Body Shop');
      assert.strictEqual(dbJc.bodyShopStatus, stage);
      assert.strictEqual(dbJc.bodyShopStage, stage);

      // Verify statusHistory
      const latestHistory = dbJc.statusHistory[dbJc.statusHistory.length - 1];
      assert(latestHistory, 'statusHistory entry must exist');
      assert.strictEqual(latestHistory.status, `Body Shop (${stage})`);
      assert(latestHistory.remarks.includes(stage));
      assert.strictEqual(latestHistory.changedBy, adminUser.name);

      console.log(`  ✓ Stage ${i + 1}/13: "${stage}" saved in DB & statusHistory recorded.`);
    }

    // 4. Verify distinct status: Delivered and Closed remain distinct
    console.log('\n--- Step 4: Verify "Delivered" and "Closed" Distinct Status Rule ---');
    // Set to Delivered
    const deliveredRes = await axios.put(`${baseUrl}/${testJcId}`, {
      status: 'Body Shop',
      bodyShopStatus: 'Delivered',
      statusRemarks: 'Customer received vehicle'
    }, { headers: adminHeaders });

    const deliveredDbJc = await JobCard.findById(testJcId);
    assert.strictEqual(deliveredDbJc.status, 'Body Shop');
    assert.strictEqual(deliveredDbJc.bodyShopStatus, 'Delivered');
    assert.notStrictEqual(deliveredDbJc.bodyShopStatus, 'Closed', 'Delivered must NOT automatically close the card');
    console.log('✓ Stage "Delivered" remains distinct and does NOT automatically mark as "Closed".');

    // Set to Closed
    const closedRes = await axios.put(`${baseUrl}/${testJcId}`, {
      status: 'Body Shop',
      bodyShopStatus: 'Closed',
      statusRemarks: 'Insurance payment settled and claim closed'
    }, { headers: adminHeaders });

    const closedDbJc = await JobCard.findById(testJcId);
    assert.strictEqual(closedDbJc.status, 'Body Shop');
    assert.strictEqual(closedDbJc.bodyShopStatus, 'Closed');
    console.log('✓ Stage "Closed" is verified and distinct.');

    // 5. Verify Filter and Search endpoints
    console.log('\n--- Step 5: Verify Filtering and Search Endpoints ---');
    // Filter by status=Body Shop
    const bsFilterRes = await axios.get(`${baseUrl}?status=Body Shop`, { headers: adminHeaders });
    assert.strictEqual(bsFilterRes.status, 200);
    const foundInBs = bsFilterRes.data.some(j => j._id === testJcId);
    assert(foundInBs, 'Job card must be returned in status=Body Shop filter');
    console.log('✓ GET /jobcards?status=Body Shop returns the card.');

    // Filter by specific stage: status=Closed
    const stageFilterRes = await axios.get(`${baseUrl}?status=Closed`, { headers: adminHeaders });
    assert.strictEqual(stageFilterRes.status, 200);
    const foundInStage = stageFilterRes.data.some(j => j._id === testJcId);
    assert(foundInStage, 'Job card must be returned in status=Closed filter');
    console.log('✓ GET /jobcards?status=Closed returns the card.');

    // Search by JobCardNo
    const searchRes = await axios.get(`${baseUrl}?search=${createRes.data.jobCardNo}`, { headers: adminHeaders });
    assert.strictEqual(searchRes.status, 200);
    const foundInSearch = searchRes.data.find(j => j._id === testJcId);
    assert(foundInSearch, 'Card found in search');
    assert.strictEqual(foundInSearch.bodyShopStatus, 'Closed');
    assert.strictEqual(foundInSearch.bodyShopStage, 'Closed');
    console.log('✓ GET /jobcards?search=... returns bodyShopStatus and bodyShopStage.');

    // 6. Role Permissions verification
    console.log('\n--- Step 6: Verify Role Permissions for Body Shop Updates ---');
    // Body Shop role user
    const testBsUser = await User.create({
      name: 'Body Shop Tech Test',
      username: `bstech_${rand}`,
      email: `bstech_${rand}@test.com`,
      password: 'password123',
      role: 'Body Shop',
      active: true
    });
    const bsUserToken = jwt.sign({ _id: testBsUser._id, role: testBsUser.role, name: testBsUser.name }, JWT_SECRET);
    const bsHeaders = { 'Authorization': `Bearer ${bsUserToken}`, 'Content-Type': 'application/json' };
    const bsPermRes = await axios.put(`${baseUrl}/${testJcId}`, {
      status: 'Body Shop',
      bodyShopStatus: 'Work in Progress',
      statusRemarks: 'Denting work started by body shop tech'
    }, { headers: bsHeaders });
    assert.strictEqual(bsPermRes.status, 200);
    console.log('✓ Role "Body Shop" successfully authorized to update stage.');

    // Unauthorized role (e.g. Accounts)
    const testAccountsUser = await User.create({
      name: 'Accounts Test User',
      username: `accounts_${rand}`,
      email: `accounts_${rand}@test.com`,
      password: 'password123',
      role: 'Accounts',
      active: true
    });
    const unauthorizedToken = jwt.sign({ _id: testAccountsUser._id, role: testAccountsUser.role, name: testAccountsUser.name }, JWT_SECRET);
    const unauthHeaders = { 'Authorization': `Bearer ${unauthorizedToken}`, 'Content-Type': 'application/json' };
    try {
      await axios.put(`${baseUrl}/${testJcId}`, {
        status: 'Body Shop',
        bodyShopStatus: 'Vehicle Reported'
      }, { headers: unauthHeaders });
      assert.fail('Unauthorized role should return 403');
    } catch (err) {
      assert.strictEqual(err.response?.status, 403, 'Unauthorized role must be rejected with 403');
      console.log('✓ Unauthorized role (Accounts) correctly rejected with 403 Forbidden.');
    }

    // 7. Verify General Service Cards unaffected
    console.log('\n--- Step 7: Verify General Service Workflow Unaffected ---');
    const gsRes = await axios.post(baseUrl, {
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      odometerReading: 12000,
      fuelLevel: '75%',
      serviceAdvisorId: adminUser._id,
      status: 'Created',
      workCategory: 'General Service',
      customerComplaints: [{ complaint: 'Engine oil and filter change' }]
    }, { headers: adminHeaders });
    createdJobCardIds.push(gsRes.data._id);
    assert.strictEqual(gsRes.data.status, 'Created');
    assert(!gsRes.data.bodyShopStatus, 'General service card should not have active bodyShopStatus');
    console.log('✓ General Service cards continue to function normally without Body Shop stages.');

    console.log('\n========================================================================');
    console.log('ALL 7 TEST SUITES PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');

  } finally {
    // Cleanup
    console.log('Cleaning up test data...');
    for (const jcId of createdJobCardIds) {
      await JobCard.findByIdAndDelete(jcId);
    }
    if (testVehicle) await Vehicle.findByIdAndDelete(testVehicle._id);
    if (testCustomer) await Customer.findByIdAndDelete(testCustomer._id);
    await User.deleteMany({ username: new RegExp(`_${rand}$`) });
    console.log('✓ Test data cleaned up.');

    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
}

runBodyShopWorkflowTests()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
