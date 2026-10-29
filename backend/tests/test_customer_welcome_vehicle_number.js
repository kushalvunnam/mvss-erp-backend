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
const JobCard = require('../models/JobCard');
const Booking = require('../models/Booking');
const User = require('../models/User');
const customersRouter = require('../routes/customers');
const { resolveCustomerVehicleNumber, sendCustomerWelcomeNotification } = customersRouter;

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/customers', customersRouter);

async function runWelcomeVehicleTests() {
  console.log('========================================================================');
  console.log('TEST SUITE: Customer Welcome Message Vehicle Number Resolution');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✔ Connected to MongoDB database.');

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
  const baseUrl = `http://127.0.0.1:${port}/api/customers`;

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
          messages: [{ id: `wamid.TEST_WELCOME_${Date.now()}` }]
        }
      };
    }
    return originalAxiosPost(url, data, config);
  };

  const cleanupIds = {
    customers: [],
    vehicles: [],
    jobcards: [],
    bookings: []
  };

  try {
    const timestamp = Date.now();
    const testMobile = '919876543210';

    // ------------------------------------------------------------------------
    // Scenario 1: Customer with NO vehicle anywhere -> Must return 'Not provided'
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 1: Customer without any vehicle ---');
    const cust1 = new Customer({
      name: `Test Welcome NoVeh ${timestamp}`,
      mobile: '+919876543211',
      type: 'Individual'
    });
    await cust1.save();
    cleanupIds.customers.push(cust1._id);

    const veh1 = await resolveCustomerVehicleNumber(cust1);
    assert.strictEqual(veh1, 'Not provided', 'Must return "Not provided" when no vehicle is linked');
    assert.notStrictEqual(veh1, 'MVSS Automobiles', 'Must NEVER return company name "MVSS Automobiles"');
    console.log(`✔ Scenario 1 Passed: Vehicle Number resolved to: "${veh1}"`);

    // ------------------------------------------------------------------------
    // Scenario 2: Customer with direct Vehicle record
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 2: Customer with direct vehicle record ---');
    const cust2 = new Customer({
      name: `Test Welcome DirectVeh ${timestamp}`,
      mobile: '+919876543212',
      type: 'Individual'
    });
    await cust2.save();
    cleanupIds.customers.push(cust2._id);

    const vehicle2 = new Vehicle({
      vehicleNumber: `TS09TEST${timestamp.toString().slice(-4)}`,
      make: 'Hyundai',
      model: 'i20',
      fuelType: 'Petrol',
      odometerReading: 12500,
      customerId: cust2._id
    });
    await vehicle2.save();
    cleanupIds.vehicles.push(vehicle2._id);

    const veh2 = await resolveCustomerVehicleNumber(cust2);
    assert.strictEqual(veh2, vehicle2.vehicleNumber, `Must return customer's vehicle: ${vehicle2.vehicleNumber}`);
    assert.notStrictEqual(veh2, 'MVSS Automobiles', 'Must NEVER return company name "MVSS Automobiles"');
    console.log(`✔ Scenario 2 Passed: Vehicle Number resolved to: "${veh2}"`);

    // ------------------------------------------------------------------------
    // Scenario 3: Customer with multiple vehicles + relevant JobCard
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 3: Customer with multiple vehicles and relevant JobCard ---');
    const cust3 = new Customer({
      name: `Test Welcome MultiVeh ${timestamp}`,
      mobile: '+919876543213',
      type: 'Individual'
    });
    await cust3.save();
    cleanupIds.customers.push(cust3._id);

    // Vehicle A (Older vehicle)
    const vehicle3A = new Vehicle({
      vehicleNumber: `TS09OLD${timestamp.toString().slice(-4)}`,
      make: 'Maruti',
      model: 'Swift',
      fuelType: 'Diesel',
      odometerReading: 45000,
      customerId: cust3._id,
      updatedAt: new Date(Date.now() - 100000)
    });
    await vehicle3A.save();
    cleanupIds.vehicles.push(vehicle3A._id);

    // Vehicle B (JobCard vehicle)
    const vehicle3B = new Vehicle({
      vehicleNumber: `TS09JC${timestamp.toString().slice(-4)}`,
      make: 'Honda',
      model: 'City',
      fuelType: 'Petrol',
      odometerReading: 22000,
      customerId: cust3._id,
      updatedAt: new Date(Date.now() - 50000)
    });
    await vehicle3B.save();
    cleanupIds.vehicles.push(vehicle3B._id);

    // Create JobCard linked to Vehicle B
    const jobCard3 = new JobCard({
      jobCardNo: `JC-TEST-${timestamp.toString().slice(-6)}`,
      date: new Date(),
      time: '10:30 AM',
      customerId: cust3._id,
      vehicleId: vehicle3B._id,
      odometerReading: 22000,
      fuelLevel: 'Half',
      serviceAdvisorId: adminUser._id
    });
    await jobCard3.save();
    cleanupIds.jobcards.push(jobCard3._id);

    const veh3 = await resolveCustomerVehicleNumber(cust3);
    assert.strictEqual(veh3, vehicle3B.vehicleNumber, `Must pick the vehicle associated with the JobCard (${vehicle3B.vehicleNumber}) over other vehicles`);
    assert.notStrictEqual(veh3, 'MVSS Automobiles', 'Must NEVER return company name');
    console.log(`✔ Scenario 3 Passed: Multiple vehicles disambiguated by JobCard. Resolved to: "${veh3}"`);

    // ------------------------------------------------------------------------
    // Scenario 4: Customer with Booking/Service Appointment
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 4: Customer with Booking appointment vehicle ---');
    const cust4 = new Customer({
      name: `Test Welcome Booking ${timestamp}`,
      mobile: '+919876543214',
      type: 'Individual'
    });
    await cust4.save();
    cleanupIds.customers.push(cust4._id);

    const booking4 = new Booking({
      customerName: cust4.name,
      mobile: cust4.mobile,
      vehicleNumber: `TS09BOOK${timestamp.toString().slice(-4)}`,
      vehicleModel: 'Kia Seltos',
      serviceType: 'General Service',
      bookingDate: '29/10/2026',
      bookingTime: '11:00 AM',
      preferredDate: '30/10/2026'
    });
    await booking4.save();
    cleanupIds.bookings.push(booking4._id);

    const veh4 = await resolveCustomerVehicleNumber(cust4);
    assert.strictEqual(veh4, booking4.vehicleNumber, `Must pick vehicle from booking (${booking4.vehicleNumber})`);
    console.log(`✔ Scenario 4 Passed: Vehicle resolved from service appointment: "${veh4}"`);

    // ------------------------------------------------------------------------
    // Scenario 5: End-to-End POST /api/customers HTTP registration
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 5: End-to-End Customer Registration HTTP API ---');
    capturedDispatches.length = 0; // Clear captured dispatches

    const regPayload = {
      name: `Kushal Welcome Test ${timestamp}`,
      mobile: '+918008092742',
      type: 'Individual',
      vehicleNumber: `TS09REG${timestamp.toString().slice(-4)}`
    };

    const res = await axios.post(baseUrl, regPayload, { headers: authHeaders });
    assert.strictEqual(res.status, 201);
    assert(res.data._id, 'Customer must be created with _id');
    cleanupIds.customers.push(res.data._id);

    // Verify dispatched WhatsApp message
    assert.strictEqual(capturedDispatches.length, 1, 'Exactly 1 WhatsApp message must be dispatched');
    const dispatch = capturedDispatches[0];
    const templateData = dispatch.data.template;
    assert.strictEqual(templateData.name, 'mvss_welcome_customer', 'Template name must be mvss_welcome_customer');
    assert.strictEqual(templateData.components.length, 1);
    const params = templateData.components[0].parameters;
    assert.strictEqual(params.length, 2, 'Template must contain exactly 2 parameters');
    
    // Parameter 1: Customer Name
    assert.strictEqual(params[0].text, regPayload.name, 'Parameter 1 must be the customer name');
    // Parameter 2: Vehicle Number
    assert.strictEqual(params[1].text, regPayload.vehicleNumber.toUpperCase(), 'Parameter 2 must be the vehicle number');
    assert.notStrictEqual(params[1].text, 'MVSS Automobiles', 'Parameter 2 must NOT be "MVSS Automobiles"');

    console.log(`✔ Scenario 5 Passed: HTTP registration dispatched template "${templateData.name}"`);
    console.log(`   Param 1 (Customer Name): "${params[0].text}"`);
    console.log(`   Param 2 (Vehicle Number): "${params[1].text}" (Verified NOT "MVSS Automobiles")`);

    // ------------------------------------------------------------------------
    // Scenario 6: Registration without vehicle defaults to 'Not provided'
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 6: HTTP Registration without vehicle ---');
    capturedDispatches.length = 0;

    const noVehPayload = {
      name: `Ramesh NoVeh Test ${timestamp}`,
      mobile: '+919876543219',
      type: 'Individual'
    };

    const resNoVeh = await axios.post(baseUrl, noVehPayload, { headers: authHeaders });
    assert.strictEqual(resNoVeh.status, 201);
    cleanupIds.customers.push(resNoVeh.data._id);

    assert.strictEqual(capturedDispatches.length, 1);
    const noVehParams = capturedDispatches[0].data.template.components[0].parameters;
    assert.strictEqual(noVehParams[0].text, noVehPayload.name);
    assert.strictEqual(noVehParams[1].text, 'Not provided', 'Parameter 2 must be "Not provided" when vehicle is omitted');
    assert.notStrictEqual(noVehParams[1].text, 'MVSS Automobiles', 'Parameter 2 must NOT be "MVSS Automobiles"');

    console.log(`✔ Scenario 6 Passed: Default fallback correctly displays "${noVehParams[1].text}"`);

    console.log('\n========================================================================');
    console.log('ALL SCENARIOS PASSED: Vehicle Number correctly replaces "MVSS Automobiles"');
    console.log('========================================================================\n');

  } finally {
    // Restore axios
    axios.post = originalAxiosPost;

    // Clean up created test records
    console.log('Cleaning up test records from database...');
    if (cleanupIds.customers.length > 0) {
      await Customer.deleteMany({ _id: { $in: cleanupIds.customers } });
    }
    if (cleanupIds.vehicles.length > 0) {
      await Vehicle.deleteMany({ _id: { $in: cleanupIds.vehicles } });
    }
    if (cleanupIds.jobcards.length > 0) {
      await JobCard.deleteMany({ _id: { $in: cleanupIds.jobcards } });
    }
    if (cleanupIds.bookings.length > 0) {
      await Booking.deleteMany({ _id: { $in: cleanupIds.bookings } });
    }
    console.log('✔ Test cleanup complete.');

    server.close();
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

runWelcomeVehicleTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
