const assert = require('assert');
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

process.env.META_WA_ACCESS_TOKEN = process.env.META_WA_ACCESS_TOKEN || 'mock_valid_token_abc';
process.env.META_WA_PHONE_NUMBER_ID = process.env.META_WA_PHONE_NUMBER_ID || '1391083524077434';
process.env.META_WA_BUSINESS_ACCOUNT_ID = process.env.META_WA_BUSINESS_ACCOUNT_ID || '1070579342641923';

const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const WhatsAppLog = require('../models/WhatsAppLog');

const customersRouter = require('../routes/customers');
const vehiclesRouter = require('../routes/vehicles');
const { sendVehicleWelcomeNotification } = vehiclesRouter;

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/customers', customersRouter);
app.use('/api/vehicles', vehiclesRouter);

async function runVehicleWelcomeTests() {
  console.log('========================================================================');
  console.log('TEST SUITE: Auto4m ERP WhatsApp Welcome Automation Trigger');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✔ Connected to MongoDB database.');

  // Find or use admin user for testing
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
  const baseUrl = `http://127.0.0.1:${port}/api`;

  // Intercept axios.post to inspect dispatched WhatsApp payloads
  const capturedDispatches = [];
  const originalAxiosPost = axios.post;
  axios.post = async (url, data, config) => {
    if (typeof url === 'string' && (url.includes('graph.facebook.com') || url.includes('/messages'))) {
      capturedDispatches.push({ url, data, config, timestamp: new Date() });
      return {
        status: 200,
        data: {
          messaging_product: 'whatsapp',
          contacts: [{ input: data?.to || '918008092742', wa_id: data?.to || '918008092742' }],
          messages: [{ id: `wamid.TEST_VEH_WELCOME_${Date.now()}` }]
        }
      };
    }
    return originalAxiosPost(url, data, config);
  };

  const cleanupIds = {
    customers: [],
    vehicles: [],
    logs: []
  };

  try {
    const timestamp = Date.now();
    const testPhone = '+918008092742';

    // ========================================================================
    // Scenario 1: Customer Creation without Vehicle -> MUST NOT trigger WhatsApp
    // ========================================================================
    console.log('--- Scenario 1: Customer creation without a vehicle ---');
    const customerPayload = {
      name: `Kushal Customer ${timestamp}`,
      mobile: testPhone,
      email: `kushal_${timestamp}@test.com`,
      type: 'Individual'
    };

    const initialDispatchCount = capturedDispatches.length;
    const custCreateRes = await axios.post(`${baseUrl}/customers`, customerPayload, { headers: authHeaders });
    assert.strictEqual(custCreateRes.status, 201, 'Customer creation should succeed with 201');
    const createdCustomer = custCreateRes.data;
    cleanupIds.customers.push(createdCustomer._id);

    // CRITICAL REQUIREMENT: Do not send the vehicle-service welcome WhatsApp message at customer creation stage
    assert.strictEqual(
      capturedDispatches.length,
      initialDispatchCount,
      'No WhatsApp message should be dispatched when customer is created without a vehicle'
    );
    console.log(`✔ Scenario 1 Passed: Customer created (ID=${createdCustomer._id}). Zero WhatsApp welcome messages dispatched.`);

    // ========================================================================
    // Scenario 2: Vehicle Creation with Linked Customer -> MUST trigger Welcome
    // ========================================================================
    console.log('\n--- Scenario 2: Vehicle creation with linked customer ---');
    const regNumber1 = `TS09WEL${String(timestamp).slice(-5)}`;
    const vehiclePayload1 = {
      vehicleNumber: regNumber1,
      make: 'Hyundai',
      model: 'Creta',
      fuelType: 'Diesel',
      transmission: 'Manual',
      odometerReading: 12500,
      customerId: createdCustomer._id
    };

    const vehCreateRes1 = await axios.post(`${baseUrl}/vehicles`, vehiclePayload1, { headers: authHeaders });
    assert.strictEqual(vehCreateRes1.status, 201, 'Vehicle creation should succeed with 201');
    const createdVehicle1 = vehCreateRes1.data;
    cleanupIds.vehicles.push(createdVehicle1._id);

    // Verify WhatsApp welcome message was dispatched
    assert.strictEqual(
      capturedDispatches.length,
      initialDispatchCount + 1,
      'Exactly 1 WhatsApp welcome message should be dispatched upon vehicle creation'
    );

    const dispatch1 = capturedDispatches[capturedDispatches.length - 1];
    const template1 = dispatch1.data.template;
    assert.strictEqual(template1.name, 'mvss_welcome_customer', 'Template name must be mvss_welcome_customer');
    assert.strictEqual(dispatch1.data.to, '918008092742', 'Recipient must be customer normalized phone');

    const params1 = template1.components[0].parameters;
    assert.strictEqual(params1.length, 2, 'Template components must contain 2 parameters');
    assert.strictEqual(params1[0].text, createdCustomer.name, 'Parameter 1 must be the customer name');
    assert.strictEqual(params1[1].text, regNumber1, 'Parameter 2 must be the vehicle registration number');
    assert.notStrictEqual(params1[1].text, 'MVSS Automobiles', 'Parameter 2 must NOT be company name');
    assert.notStrictEqual(params1[1].text, 'Not provided', 'Parameter 2 must NOT be fallback');

    console.log(`✔ Scenario 2 Passed: Vehicle created (${regNumber1}). Dispatched mvss_welcome_customer:`);
    console.log(`   Customer Name (Param 1): "${params1[0].text}"`);
    console.log(`   Vehicle Number (Param 2): "${params1[1].text}" (Verified actual registration number)`);

    // ========================================================================
    // Scenario 3: Missing Registration Number or Missing Customer
    // ========================================================================
    console.log('\n--- Scenario 3: Missing registration number or missing customer ---');
    const preCountScenario3 = capturedDispatches.length;

    // 3a. Vehicle creation attempt with empty registration number -> must reject HTTP 400
    try {
      await axios.post(`${baseUrl}/vehicles`, {
        vehicleNumber: '',
        make: 'Tata',
        model: 'Nexon',
        fuelType: 'Petrol',
        odometerReading: 5000,
        customerId: createdCustomer._id
      }, { headers: authHeaders });
      assert.fail('Should have thrown 400 for empty vehicle registration number');
    } catch (err) {
      assert.strictEqual(err.response?.status, 400, 'Must return 400 for missing vehicle number');
    }

    // 3b. Direct invocation with missing registration number -> must skip dispatch
    const dummyVehNoReg = { _id: new mongoose.Types.ObjectId(), vehicleNumber: '', customerId: createdCustomer._id };
    const missingRegResult = await sendVehicleWelcomeNotification(dummyVehNoReg);
    assert.strictEqual(missingRegResult.success, false, 'Must fail when vehicle registration number is missing');
    assert.strictEqual(missingRegResult.reason, 'Vehicle registration number is missing.');

    // 3c. Direct invocation with non-existent customer ID -> must skip dispatch
    const fakeCustId = new mongoose.Types.ObjectId();
    const dummyVehFakeCust = { _id: new mongoose.Types.ObjectId(), vehicleNumber: 'TS09FAKE1234', customerId: fakeCustId };
    const missingCustResult = await sendVehicleWelcomeNotification(dummyVehFakeCust);
    assert.strictEqual(missingCustResult.success, false, 'Must fail when linked customer is not found');
    assert.strictEqual(missingCustResult.reason, 'Linked customer not found in database.');

    assert.strictEqual(capturedDispatches.length, preCountScenario3, 'No WhatsApp message dispatched for missing data');
    console.log('✔ Scenario 3 Passed: Validation correctly blocked WhatsApp dispatch when vehicleNumber or customer was missing.');

    // ========================================================================
    // Scenario 4: Duplicate Trigger Scenarios (Idempotency)
    // ========================================================================
    console.log('\n--- Scenario 4: Duplicate trigger scenarios (Idempotency) ---');
    const preCountScenario4 = capturedDispatches.length;

    // Triggering welcome notification again for the existing vehicle
    const duplicateRes = await sendVehicleWelcomeNotification(createdVehicle1);
    assert.strictEqual(duplicateRes.success, true, 'Handler returns success with duplicate_skipped');
    assert.strictEqual(duplicateRes.waResult.status, 'duplicate_skipped', 'Status must indicate duplicate_skipped');

    // Confirm that Meta API was NOT called a second time
    assert.strictEqual(
      capturedDispatches.length,
      preCountScenario4,
      'Meta Graph API must NOT be called on duplicate vehicle welcome trigger'
    );
    console.log('✔ Scenario 4 Passed: Duplicate trigger skipped cleanly. No duplicate WhatsApp message sent.');

    // ========================================================================
    // Scenario 5: Existing Customer Adds a New Vehicle
    // ========================================================================
    console.log('\n--- Scenario 5: Existing customer adding a second vehicle ---');
    const regNumber2 = `TS09SEC${String(timestamp).slice(-5)}`;
    const vehiclePayload2 = {
      vehicleNumber: regNumber2,
      make: 'Mahindra',
      model: 'XUV700',
      fuelType: 'Diesel',
      transmission: 'Automatic',
      odometerReading: 8000,
      customerId: createdCustomer._id // Same existing customer!
    };

    const vehCreateRes2 = await axios.post(`${baseUrl}/vehicles`, vehiclePayload2, { headers: authHeaders });
    assert.strictEqual(vehCreateRes2.status, 201, 'Second vehicle creation should succeed with 201');
    const createdVehicle2 = vehCreateRes2.data;
    cleanupIds.vehicles.push(createdVehicle2._id);

    // Verify WhatsApp welcome message WAS dispatched for the new vehicle
    const dispatch2 = capturedDispatches[capturedDispatches.length - 1];
    const template2 = dispatch2.data.template;
    assert.strictEqual(template2.name, 'mvss_welcome_customer');
    assert.strictEqual(template2.components[0].parameters[0].text, createdCustomer.name);
    assert.strictEqual(template2.components[0].parameters[1].text, regNumber2, 'Parameter 2 must be the second vehicle registration number');
    console.log(`✔ Scenario 5 Passed: Existing customer received welcome message for second vehicle (${regNumber2}).`);

    // ========================================================================
    // Scenario 6: Manual Trigger Endpoints
    // ========================================================================
    console.log('\n--- Scenario 6: Manual trigger endpoints ---');
    // 6a. POST /api/vehicles/:id/welcome
    const vehWelcomeRes = await axios.post(`${baseUrl}/vehicles/${createdVehicle1._id}/welcome`, { forceResend: true }, { headers: authHeaders });
    assert.strictEqual(vehWelcomeRes.status, 200);
    assert.strictEqual(vehWelcomeRes.data.success, true);
    assert.strictEqual(vehWelcomeRes.data.vehicleNumber, regNumber1);

    // 6b. POST /api/customers/:id/welcome for customer with vehicle
    const custWelcomeRes = await axios.post(`${baseUrl}/customers/${createdCustomer._id}/welcome`, { forceResend: true }, { headers: authHeaders });
    assert.strictEqual(custWelcomeRes.status, 200);
    assert.strictEqual(custWelcomeRes.data.success, true);

    // 6c. POST /api/customers/:id/welcome for customer without vehicle -> must reject HTTP 400
    const noVehCust = new Customer({
      name: `Standalone Customer ${timestamp}`,
      mobile: '+919876543299',
      type: 'Individual'
    });
    await noVehCust.save();
    cleanupIds.customers.push(noVehCust._id);

    try {
      await axios.post(`${baseUrl}/customers/${noVehCust._id}/welcome`, {}, { headers: authHeaders });
      assert.fail('Should have returned 400 when attempting to send welcome message to customer without vehicle');
    } catch (custNoVehErr) {
      assert.strictEqual(custNoVehErr.response?.status, 400, 'Must return 400 for customer without vehicle');
      console.log(`✔ Scenario 6 Passed: Standalone customer without vehicle rejected with: "${custNoVehErr.response?.data?.error}"`);
    }

    console.log('\n========================================================================');
    console.log('ALL SCENARIOS PASSED: WhatsApp Welcome Automation successfully moved to Vehicle Creation');
    console.log('========================================================================\n');

  } finally {
    // Teardown and cleanup test records
    console.log('Cleaning up test records from database...');
    axios.post = originalAxiosPost;

    if (cleanupIds.vehicles.length > 0) {
      await Vehicle.deleteMany({ _id: { $in: cleanupIds.vehicles } });
    }
    if (cleanupIds.customers.length > 0) {
      await Customer.deleteMany({ _id: { $in: cleanupIds.customers } });
    }
    await WhatsAppLog.deleteMany({
      $or: [
        { relatedEntity: { $in: cleanupIds.customers } },
        { idempotencyKey: { $regex: 'vehicle_welcome_' } }
      ]
    });

    server.close();
    console.log('✔ Test cleanup complete.');
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

runVehicleWelcomeTests().catch(err => {
  console.error('\n❌ Test execution failed with error:', err);
  process.exit(1);
});
