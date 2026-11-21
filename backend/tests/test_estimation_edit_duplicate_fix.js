const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const assert = require('assert');
const Estimate = require('../models/Estimate');
const JobCard = require('../models/JobCard');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const axios = require('axios');

async function runTestSuite() {
  console.log('================================================================');
  console.log('ESTIMATION EDIT IN-PLACE UPDATE & DUPLICATE PREVENTION TEST SUITE');
  console.log('================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB Atlas');

  // Find a test user or admin
  let user = await User.findOne({ role: 'Admin' });
  if (!user) {
    user = await User.findOne();
  }
  assert(user, 'User required for testing');

  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ _id: user._id.toString(), role: user.role }, process.env.JWT_SECRET || 'secret');
  const authHeaders = { Authorization: `Bearer ${token}` };

  // Create temporary test customer and vehicle
  const testCustomerA = await Customer.create({
    name: 'Test Customer A (Edit Suite)',
    mobile: '9876543210',
    email: 'test_a@example.com'
  });

  const testCustomerB = await Customer.create({
    name: 'Test Customer B (Edit Suite)',
    mobile: '9876543211',
    email: 'test_b@example.com'
  });

  const testVehicleA = await Vehicle.create({
    vehicleNumber: `TS09T${Date.now().toString().slice(-6)}1`,
    make: 'Hyundai',
    model: 'i20',
    fuelType: 'Petrol',
    odometerReading: 25000,
    customerId: testCustomerA._id
  });

  const testVehicleB = await Vehicle.create({
    vehicleNumber: `TS09T${Date.now().toString().slice(-6)}2`,
    make: 'Maruti',
    model: 'Swift',
    fuelType: 'Diesel',
    odometerReading: 40000,
    customerId: testCustomerB._id
  });

  const testJcA = await JobCard.create({
    jobCardNo: `JC-TEST-${Date.now().toString().slice(-5)}-A`,
    customerId: testCustomerA._id,
    vehicleId: testVehicleA._id,
    serviceAdvisorId: user._id,
    odometerReading: 25000,
    time: '10:00 AM',
    status: 'Inspect Stage'
  });

  const testJcB = await JobCard.create({
    jobCardNo: `JC-TEST-${Date.now().toString().slice(-5)}-B`,
    customerId: testCustomerB._id,
    vehicleId: testVehicleB._id,
    serviceAdvisorId: user._id,
    odometerReading: 40000,
    time: '11:00 AM',
    status: 'Inspect Stage'
  });

  console.log(`✓ Created test Job Cards: ${testJcA.jobCardNo} and ${testJcB.jobCardNo}`);

  // Start Express server locally or mock route calls
  const express = require('express');
  const app = express();
  app.use(express.json());

  // Mock auth middleware for internal integration test
  app.use((req, res, next) => {
    req.user = user;
    next();
  });

  const estimatesRouter = require('../routes/estimates');
  app.use('/api/estimates', estimatesRouter);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/estimates`;
  console.log(`✓ Test Express server listening on port ${port}\n`);

  try {
    // -------------------------------------------------------------
    // Scenario 1: Create a brand-new estimate and verify sequential numbering
    // -------------------------------------------------------------
    console.log('--- SCENARIO 1: Brand-New Estimate Creation ---');
    const initialEstimateCount = await Estimate.countDocuments();
    const createRes = await axios.post(`${baseUrl}`, {
      jobCardId: testJcA._id,
      parts: [],
      labour: [
        { description: 'Initial Service Labour', rate: 1000, discount: 0, total: 1180, gstPercent: 18 }
      ]
    }, { headers: authHeaders });

    assert.strictEqual(createRes.status, 201, 'Expected 201 Created');
    const createdEst = createRes.data;
    assert(createdEst._id, 'Created estimate must have an _id');
    assert(createdEst.estimateNo, 'Created estimate must have an estimateNo');
    const est1Id = createdEst._id;
    const est1No = createdEst.estimateNo;
    console.log(`✓ Scenario 1 PASS: Created estimate ID=${est1Id}, EstimateNo=${est1No}`);

    // Verify in DB
    const dbEstAfterCreate = await Estimate.findById(est1Id);
    assert.strictEqual(dbEstAfterCreate.totals.grandTotal, 1180);
    assert.strictEqual(await Estimate.countDocuments(), initialEstimateCount + 1);

    // -------------------------------------------------------------
    // Scenario 2: Edit existing estimate in-place
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 2: In-Place Edit of Existing Estimate ---');
    await new Promise(r => setTimeout(r, 100)); // Ensure distinct timestamp
    const updateRes = await axios.put(`${baseUrl}/${est1Id}`, {
      parts: [],
      labour: [
        { description: 'Initial Service Labour Updated', rate: 1500, discount: 0, total: 1770, gstPercent: 18 }
      ]
    }, { headers: authHeaders });

    assert.strictEqual(updateRes.status, 200, 'Expected 200 OK');
    const updatedEst = updateRes.data;
    assert.strictEqual(updatedEst._id.toString(), est1Id.toString(), 'MongoDB _id must be strictly preserved');
    assert.strictEqual(updatedEst.estimateNo, est1No, 'Estimate number must remain identical');

    const dbEstAfterUpdate = await Estimate.findById(est1Id);
    assert.strictEqual(dbEstAfterUpdate._id.toString(), est1Id.toString());
    assert.strictEqual(dbEstAfterUpdate.estimateNo, est1No);
    assert.strictEqual(dbEstAfterUpdate.labour[0].description, 'Initial Service Labour Updated');
    assert.strictEqual(dbEstAfterUpdate.totals.grandTotal, 1770);
    assert(dbEstAfterUpdate.updatedAt >= dbEstAfterCreate.updatedAt, 'updatedAt must be updated');
    assert(dbEstAfterUpdate.modifiedAt, 'modifiedAt must be set');
    assert.strictEqual(dbEstAfterUpdate.modifiedBy.toString(), user._id.toString());
    console.log(`✓ Scenario 2 PASS: Successfully updated estimate ${est1No} in place without altering ID or number.`);

    // -------------------------------------------------------------
    // Scenario 3: Confirm NO new estimate number is generated during edit
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 3: Confirm No New Estimate Number Generated ---');
    const totalCountAfterEdit = await Estimate.countDocuments();
    assert.strictEqual(totalCountAfterEdit, initialEstimateCount + 1, 'Total estimate count must NOT increase during edit');
    console.log(`✓ Scenario 3 PASS: Total estimate count is unchanged (${totalCountAfterEdit}). No duplicate number generated.`);

    // -------------------------------------------------------------
    // Scenario 4: Idempotent Multi-Edit
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 4: Multi-Edit Idempotency Verification ---');
    for (let i = 1; i <= 3; i++) {
      const multiRes = await axios.put(`${baseUrl}/${est1Id}`, {
        parts: [],
        labour: [
          { description: `Iterative Labour Edit #${i}`, rate: 1000 + i * 200, discount: 0, total: (1000 + i * 200) * 1.18, gstPercent: 18 }
        ]
      }, { headers: authHeaders });
      assert.strictEqual(multiRes.status, 200);
      assert.strictEqual(multiRes.data._id.toString(), est1Id.toString());
      assert.strictEqual(multiRes.data.estimateNo, est1No);
    }
    const finalCountAfterMulti = await Estimate.countDocuments();
    assert.strictEqual(finalCountAfterMulti, initialEstimateCount + 1, 'Count remains strictly constant after 3 consecutive edits');
    console.log(`✓ Scenario 4 PASS: 3 consecutive edits were 100% idempotent. Same record updated every time.`);

    // -------------------------------------------------------------
    // Scenario 5: Prevent Duplicate Creation if POST is called with existing ID
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 5: Guard against POST / with Existing ID ---');
    try {
      await axios.post(`${baseUrl}`, {
        _id: est1Id,
        jobCardId: testJcA._id,
        labour: [{ description: 'Accidental duplicate attempt', rate: 500, total: 590, gstPercent: 18 }]
      }, { headers: authHeaders });
      assert.fail('Expected POST with existing _id to be rejected with 400 Bad Request');
    } catch (err) {
      assert.strictEqual(err.response.status, 400, 'Must return 400 Bad Request');
      assert(err.response.data.error.includes('existing estimate ID'), 'Error must explain that existing ID cannot use POST');
      console.log(`✓ Scenario 5 PASS: Backend rejected POST with existing ID with 400: "${err.response.data.error}"`);
    }

    // -------------------------------------------------------------
    // Scenario 6: Draft Editing
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 6: Draft Estimate Editing ---');
    const draftCreateRes = await axios.post(`${baseUrl}`, {
      jobCardId: testJcB._id,
      isDraft: true,
      parts: [],
      labour: [{ description: 'Preliminary Draft Check', rate: 800, discount: 0, total: 944, gstPercent: 18 }]
    }, { headers: authHeaders });
    assert.strictEqual(draftCreateRes.status, 201);
    const draftEst = draftCreateRes.data.estimate || draftCreateRes.data;
    const draftId = draftEst._id;
    const draftNo = draftEst.estimateNo;
    assert.strictEqual(draftEst.status, 'Draft');
    assert.strictEqual(draftEst.isDraft, true);

    // Now edit this draft
    const draftEditRes = await axios.put(`${baseUrl}/${draftId}`, {
      isDraft: true,
      parts: [],
      labour: [
        { description: 'Preliminary Draft Check Updated', rate: 1200, discount: 0, total: 1416, gstPercent: 18 }
      ]
    }, { headers: authHeaders });
    assert.strictEqual(draftEditRes.status, 200);
    const updatedDraft = draftEditRes.data.estimate || draftEditRes.data;
    assert.strictEqual(updatedDraft._id.toString(), draftId.toString());
    assert.strictEqual(updatedDraft.estimateNo, draftNo);
    assert.strictEqual(updatedDraft.status, 'Draft');
    assert.strictEqual(updatedDraft.isDraft, true);

    const dbDraft = await Estimate.findById(draftId);
    assert.strictEqual(dbDraft.status, 'Draft');
    assert.strictEqual(dbDraft.labour[0].description, 'Preliminary Draft Check Updated');
    assert.strictEqual(dbDraft.totals.grandTotal, 1416);
    assert.strictEqual(dbDraft.whatsappHistory.length, 0, 'No WhatsApp message should be triggered on draft edit');
    console.log(`✓ Scenario 6 PASS: Draft estimate ID=${draftId} edited in place, status remained Draft, no WhatsApp dispatched.`);

    // -------------------------------------------------------------
    // Scenario 7: Multi-JobCard Isolation (No Cross-Record Contamination)
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 7: Multi-JobCard Isolation ---');
    // Verify Estimate 1 belongs strictly to JC A and Draft belongs to JC B
    const verifyEst1 = await Estimate.findById(est1Id);
    const verifyDraft = await Estimate.findById(draftId);

    assert.strictEqual(verifyEst1.jobCardId.toString(), testJcA._id.toString());
    assert.strictEqual(verifyDraft.jobCardId.toString(), testJcB._id.toString());

    // Update Estimate 1 again and ensure Draft on JC B is completely untouched
    await axios.put(`${baseUrl}/${est1Id}`, {
      parts: [],
      labour: [{ description: 'Isolated Update', rate: 2000, total: 2360, gstPercent: 18 }]
    }, { headers: authHeaders });

    const checkDraftAgain = await Estimate.findById(draftId);
    assert.strictEqual(checkDraftAgain.totals.grandTotal, 1416, 'Draft on JobCard B must not be affected by edits to JobCard A');
    console.log(`✓ Scenario 7 PASS: Multiple Job Cards remain completely isolated with zero cross-record contamination.`);

    // -------------------------------------------------------------
    // Scenario 8: Rapid Double-Click Deduplication Mutex Check
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 8: Rapid Double-Click Deduplication Protection ---');
    const rapidJc = await JobCard.create({
      jobCardNo: `JC-RAPID-${Date.now().toString().slice(-5)}`,
      customerId: testCustomerA._id,
      vehicleId: testVehicleA._id,
      serviceAdvisorId: user._id,
      odometerReading: 25000,
      time: '12:00 PM',
      status: 'Inspect Stage'
    });

    const countBeforeRapid = await Estimate.countDocuments();
    // Fire two identical POST calls concurrently within 10ms
    const [p1, p2] = await Promise.all([
      axios.post(`${baseUrl}`, {
        jobCardId: rapidJc._id,
        labour: [{ description: 'Rapid Double Click Test', rate: 500, total: 590, gstPercent: 18 }]
      }, { headers: authHeaders }),
      axios.post(`${baseUrl}`, {
        jobCardId: rapidJc._id,
        labour: [{ description: 'Rapid Double Click Test', rate: 500, total: 590, gstPercent: 18 }]
      }, { headers: authHeaders })
    ]);

    const countAfterRapid = await Estimate.countDocuments();
    assert.strictEqual(countAfterRapid, countBeforeRapid + 1, 'Only ONE estimate document must be created despite simultaneous requests');
    assert.strictEqual(p1.data._id.toString(), p2.data._id.toString(), 'Second request must return the same created estimate');
    console.log(`✓ Scenario 8 PASS: Simultaneous requests deduplicated successfully. Exactly 1 estimate was created: ${p1.data.estimateNo}.`);

    // Clean up temporary rapid JC and estimate
    await Estimate.deleteOne({ _id: p1.data._id });
    await JobCard.deleteOne({ _id: rapidJc._id });

    // Clean up test documents created in this test run
    await Estimate.deleteMany({ _id: { $in: [est1Id, draftId] } });
    await JobCard.deleteMany({ _id: { $in: [testJcA._id, testJcB._id] } });
    await Vehicle.deleteMany({ _id: { $in: [testVehicleA._id, testVehicleB._id] } });
    await Customer.deleteMany({ _id: { $in: [testCustomerA._id, testCustomerB._id] } });
    console.log('✓ Cleaned up all temporary test records.');

    console.log('\n================================================================');
    console.log('ALL 8 TEST SCENARIOS PASSED WITH 100% SUCCESS!');
    console.log('================================================================\n');

  } finally {
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
