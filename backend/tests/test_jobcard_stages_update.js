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
const dashboardRouter = require('../routes/dashboard');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/jobcards', jobcardsRouter);
app.use('/api/dashboard', dashboardRouter);

async function runStageUpdateTests() {
  console.log('========================================================================');
  console.log('TEST SUITE: Job Card Stages Update (Waiting for Allotment & Allotted)');
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
  const dashboardUrl = `http://127.0.0.1:${port}/api/dashboard`;

  const createdJobCardIds = [];
  let testCustomer = null;
  let testVehicle = null;

  try {
    const rand = Math.floor(Math.random() * 900000 + 100000);
    testCustomer = await Customer.create({
      name: `Stage Test Customer ${rand}`,
      mobile: `98${rand.toString().padStart(8, '0')}`,
      address: 'Test Address Hyderabad'
    });

    testVehicle = await Vehicle.create({
      customerId: testCustomer._id,
      vehicleNumber: `TS09ST${rand.toString().slice(-4)}`,
      make: 'Hyundai',
      model: 'Verna',
      fuelType: 'Petrol',
      odometerReading: 45000
    });
    console.log(`Setup test customer: ${testCustomer.name}, vehicle: ${testVehicle.vehicleNumber}\n`);

    // TEST 1: Creation with new stages "Waiting for Allotment"
    console.log('--- TEST 1: Job Card creation with "Waiting for Allotment" ---');
    const resCreate1 = await axios.post(baseUrl, {
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceType: 'General Servicing',
      odometerReading: 45000,
      status: 'Waiting for Allotment'
    }, { headers: authHeaders });

    assert([200, 201].includes(resCreate1.status));
    assert.strictEqual(resCreate1.data.status, 'Waiting for Allotment');
    createdJobCardIds.push(resCreate1.data._id);
    console.log('✓ Job Card created successfully with status "Waiting for Allotment".');

    // TEST 2: Transition from "Waiting for Allotment" to "Allotted"
    console.log('\n--- TEST 2: Transition "Waiting for Allotment" -> "Allotted" ---');
    const resUpdateAllotted = await axios.put(`${baseUrl}/${resCreate1.data._id}`, {
      status: 'Allotted',
      technicianName: 'Suresh Kumar',
      statusRemarks: 'Allotted to technician Suresh Kumar'
    }, { headers: authHeaders });

    assert.strictEqual(resUpdateAllotted.status, 200);
    assert.strictEqual(resUpdateAllotted.data.status, 'Allotted');
    assert.strictEqual(resUpdateAllotted.data.technicianName, 'Suresh Kumar');
    console.log('✓ Job Card status updated to "Allotted" with technician assignment.');

    // TEST 3: Transition from "Allotted" -> "Parts Procuring" -> "Work in Progress"
    console.log('\n--- TEST 3: Workflow transitions "Allotted" -> "Parts Procuring" -> "Work in Progress" ---');
    const resProcuring = await axios.put(`${baseUrl}/${resCreate1.data._id}`, {
      status: 'Parts Procuring',
      statusRemarks: 'Procuring brake pads and air filters'
    }, { headers: authHeaders });
    assert.strictEqual(resProcuring.status, 200);
    assert.strictEqual(resProcuring.data.status, 'Parts Procuring');
    console.log('✓ Transitioned from "Allotted" to "Parts Procuring".');

    const resWip = await axios.put(`${baseUrl}/${resCreate1.data._id}`, {
      status: 'Work in Progress',
      statusRemarks: 'Parts received, starting work'
    }, { headers: authHeaders });
    assert.strictEqual(resWip.status, 200);
    assert.strictEqual(resWip.data.status, 'Work in Progress');
    console.log('✓ Transitioned from "Parts Procuring" to "Work in Progress".');

    // TEST 4: Block updates to retired stages ("Quality Check", "Body Shop", "Bodyshop", "Repair")
    console.log('\n--- TEST 4: Block updating to retired stages ---');
    const retiredStages = ['Quality Check', 'Body Shop', 'Bodyshop', 'Repair'];
    for (const retired of retiredStages) {
      try {
        await axios.put(`${baseUrl}/${resCreate1.data._id}`, {
          status: retired
        }, { headers: authHeaders });
        assert.fail(`Should have blocked updating to retired stage "${retired}"`);
      } catch (err) {
        assert.strictEqual(err.response.status, 400);
        assert(err.response.data.error.includes('removed from the active workflow'), `Unexpected error message: ${err.response.data.error}`);
        console.log(`✓ Updating to "${retired}" correctly blocked with HTTP 400.`);
      }
    }

    // TEST 5: Block creation with retired stages
    console.log('\n--- TEST 5: Block creating with retired stages ---');
    for (const retired of retiredStages) {
      try {
        await axios.post(baseUrl, {
          customerId: testCustomer._id,
          vehicleId: testVehicle._id,
          serviceType: 'General Servicing',
          odometerReading: 45000,
          status: retired
        }, { headers: authHeaders });
        assert.fail(`Should have blocked creation with retired stage "${retired}"`);
      } catch (err) {
        assert.strictEqual(err.response.status, 400);
        assert(err.response.data.error.includes('removed from the active workflow'), `Unexpected error message: ${err.response.data.error}`);
        console.log(`✓ Creating with "${retired}" correctly blocked with HTTP 400.`);
      }
    }

    // TEST 6: Backward compatibility for existing historical records
    console.log('\n--- TEST 6: Backward compatibility for existing historical records ---');
    // Direct DB insert simulating existing records created before the update
    const legacyCard1 = await JobCard.create({
      jobCardNo: `MVSS/JC/LEGACY/BS/${rand}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      serviceType: 'Accident Repair',
      odometerReading: 45000,
      time: '10:30',
      status: 'Body Shop',
      workCategory: 'B/P'
    });
    createdJobCardIds.push(legacyCard1._id);

    const legacyCard2 = await JobCard.create({
      jobCardNo: `MVSS/JC/LEGACY/REP/${rand}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      serviceType: 'General Servicing',
      odometerReading: 45000,
      time: '10:30',
      status: 'Repair'
    });
    createdJobCardIds.push(legacyCard2._id);

    const legacyCard3 = await JobCard.create({
      jobCardNo: `MVSS/JC/LEGACY/QC/${rand}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      serviceType: 'General Servicing',
      odometerReading: 45000,
      time: '10:30',
      status: 'Quality Check'
    });
    createdJobCardIds.push(legacyCard3._id);

    // Verify reading legacy records works
    const resGetLegacy1 = await axios.get(`${baseUrl}?search=${legacyCard1.jobCardNo}`, { headers: authHeaders });
    assert.strictEqual(resGetLegacy1.status, 200);
    assert.strictEqual(resGetLegacy1.data[0].status, 'Body Shop');
    console.log('✓ Historical record with status "Body Shop" retrieved intact.');

    // Verify updating non-status fields on legacy cards does not fail
    const resUpdateNotes = await axios.put(`${baseUrl}/${legacyCard1._id}`, {
      advisorNotes: 'Updated notes on historical card'
    }, { headers: authHeaders });
    assert.strictEqual(resUpdateNotes.status, 200);
    assert.strictEqual(resUpdateNotes.data.advisorNotes, 'Updated notes on historical card');
    console.log('✓ Historical record can be updated without breaking schema or status.');

    // Verify historical card can advance forward to an active workflow stage
    const resAdvanceLegacy = await axios.put(`${baseUrl}/${legacyCard1._id}`, {
      status: 'Quality Test',
      statusRemarks: 'Moving legacy card forward to Pre-Delivery Inspection'
    }, { headers: authHeaders });
    assert.strictEqual(resAdvanceLegacy.status, 200);
    assert.strictEqual(resAdvanceLegacy.data.status, 'Quality Test');
    console.log('✓ Historical record successfully advanced forward to active workflow stage.');

    // TEST 7: Query filtering by new stages
    console.log('\n--- TEST 7: Query filtering for new stages ---');
    const allottedCard = await JobCard.create({
      jobCardNo: `MVSS/JC/ALLOT/${rand}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      serviceType: 'General Servicing',
      odometerReading: 45000,
      time: '11:00',
      status: 'Allotted',
      technicianName: 'Suresh Kumar'
    });
    createdJobCardIds.push(allottedCard._id);

    const waitingCard = await JobCard.create({
      jobCardNo: `MVSS/JC/WAIT/${rand}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      serviceType: 'General Servicing',
      odometerReading: 45000,
      time: '11:15',
      status: 'Waiting for Allotment'
    });
    createdJobCardIds.push(waitingCard._id);

    const resFilterAllotted = await axios.get(`${baseUrl}?status=Allotted`, { headers: authHeaders });
    assert.strictEqual(resFilterAllotted.status, 200);
    const hasAllotted = resFilterAllotted.data.some(j => j.status === 'Allotted');
    assert(hasAllotted, 'Filtered job cards should contain Allotted cards');
    console.log('✓ Filtering by status="Allotted" succeeded.');

    const resFilterWaiting = await axios.get(`${baseUrl}?status=Waiting for Allotment`, { headers: authHeaders });
    assert.strictEqual(resFilterWaiting.status, 200);
    const hasWaiting = resFilterWaiting.data.some(j => j.status === 'Waiting for Allotment');
    assert(hasWaiting, 'Filtered job cards should contain Waiting for Allotment cards');
    console.log('✓ Filtering by status="Waiting for Allotment" succeeded.');

    // TEST 8: Dashboard active counts include "Waiting for Allotment" and "Allotted"
    console.log('\n--- TEST 8: Dashboard stats include new stages ---');
    const resStats = await axios.get(`${dashboardUrl}/stats`, { headers: authHeaders });
    assert.strictEqual(resStats.status, 200);
    assert(typeof resStats.data.activeJobCards === 'number');
    console.log(`✓ Dashboard activeJobCards count is: ${resStats.data.activeJobCards}`);

    console.log('\n========================================================================');
    console.log('ALL JOB CARD STAGE TESTS PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');
  } finally {
    // Cleanup
    for (const id of createdJobCardIds) {
      await JobCard.findByIdAndDelete(id);
    }
    console.log(`Cleaned up ${createdJobCardIds.length} test job cards.`);
    if (testVehicle) await Vehicle.findByIdAndDelete(testVehicle._id);
    if (testCustomer) await Customer.findByIdAndDelete(testCustomer._id);
    console.log('Cleaned up test vehicle and customer.');

    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    console.log('Closed server and disconnected MongoDB.');
  }
}

runStageUpdateTests().catch(err => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
