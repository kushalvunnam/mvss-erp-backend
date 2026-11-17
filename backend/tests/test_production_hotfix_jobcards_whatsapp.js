const assert = require('assert');
const axios = require('axios');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const JobCard = require('../models/JobCard');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const WhatsAppLog = require('../models/WhatsAppLog');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/jobcards', require('../routes/jobcards'));
app.use('/api/whatsapp', require('../routes/whatsapp'));

async function runHotfixTests() {
  console.log('========================================================================');
  console.log('REGRESSION TEST SUITE: JobCard Details, Responsive Layout & WhatsApp Hotfix');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✔ Connected to MongoDB.');

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`✔ Test server started on port ${port}.`);

  const cleanup = {
    users: [],
    customers: [],
    vehicles: [],
    jobcards: [],
    logs: []
  };

  try {
    // 1. Setup Admin user and auth token
    const testAdmin = await User.create({
      name: 'Hotfix Test Admin',
      email: `admin_hotfix_${Date.now()}@mvsstest.com`,
      password: 'password123',
      role: 'Admin',
      active: true
    });
    cleanup.users.push(testAdmin._id);
    const authToken = jwt.sign({ _id: testAdmin._id, role: testAdmin.role }, JWT_SECRET, { expiresIn: '1h' });
    const authHeaders = { Authorization: `Bearer ${authToken}` };

    // 2. Setup Customer & Vehicle
    const phone = '919876543210';
    const customer = await Customer.create({
      name: 'Hotfix Test Customer',
      mobile: phone,
      email: `customer_hotfix_${Date.now()}@mvsstest.com`
    });
    cleanup.customers.push(customer._id);

    const vehicle = await Vehicle.create({
      vehicleNumber: `TS09HF${Date.now().toString().slice(-4)}`,
      customerId: customer._id,
      make: 'Hyundai',
      model: 'Verna',
      fuelType: 'Petrol',
      odometerReading: 18000
    });
    cleanup.vehicles.push(vehicle._id);

    // 3. Setup Job Card with photos
    const jcNo = `MVSS/JC/26-27/HF${Date.now().toString().slice(-3)}`;
    const jobCard = await JobCard.create({
      jobCardNo: jcNo,
      customerId: customer._id,
      vehicleId: vehicle._id,
      serviceAdvisorId: testAdmin._id,
      odometerReading: 18000,
      time: '12:00 PM',
      status: 'Work in Progress',
      customerDetails: {
        name: customer.name,
        mobile: customer.mobile
      },
      vehicleDetails: {
        vehicleNumber: vehicle.vehicleNumber,
        model: vehicle.model
      },
      photos: [
        {
          url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341',
          caption: 'Front damage inspection',
          category: 'jobcard',
          uploadedAt: new Date()
        }
      ],
      whatsappHistory: []
    });
    cleanup.jobcards.push(jobCard._id);

    // =========================================================================
    // TEST 1: ISSUE 1 — Icon and Variable Auditing for JobCardDetails
    // =========================================================================
    console.log('\n--- TEST 1: JobCardDetails Component Icon & Reference Verification ---');
    const jcdContent = require('fs').readFileSync(path.join(__dirname, '../../frontend/src/pages/JobCardDetails.jsx'), 'utf8');
    assert(jcdContent.includes('AlertCircle'), 'JobCardDetails must import AlertCircle from lucide-react');
    assert(/import\s*\{[\s\S]*?AlertCircle[\s\S]*?\}\s*from\s*['"]lucide-react['"]/.test(jcdContent),
      'AlertCircle must be directly imported in lucide-react import statement');
    assert(jcdContent.includes('ImageIcon'), 'ImageIcon must be imported');
    console.log('✔ AlertCircle and ImageIcon imports verified in JobCardDetails.jsx.');

    // Also verify JobCardForm.jsx
    const jcfContent = require('fs').readFileSync(path.join(__dirname, '../../frontend/src/pages/JobCardForm.jsx'), 'utf8');
    assert(/import\s*\{[\s\S]*?FileText[\s\S]*?\}\s*from\s*['"]lucide-react['"]/.test(jcfContent),
      'FileText must be directly imported in JobCardForm.jsx');
    console.log('✔ FileText import verified in JobCardForm.jsx.');

    // =========================================================================
    // TEST 2: ISSUE 2 — Responsiveness & High-Zoom Constraint Audit in JobCards
    // =========================================================================
    console.log('\n--- TEST 2: JobCard Status Badges & Card High-Zoom Overflow Prevention ---');
    const jcContent = require('fs').readFileSync(path.join(__dirname, '../../frontend/src/pages/JobCards.jsx'), 'utf8');
    assert(jcContent.includes('min-w-0 w-full overflow-hidden'), 'Card container must enforce min-w-0 w-full overflow-hidden');
    assert(jcContent.includes('flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 mb-3 min-w-0'),
      'Card header must allow flex-wrap on high zoom');
    assert(jcContent.includes('truncate block'), 'Select inputs must truncate and not overflow adjacent columns');
    assert(jcContent.includes('max-w-full inline-block truncate'), 'Read-only badges must truncate and break safely');
    assert(jcContent.includes('flex flex-wrap justify-between items-center gap-2 min-w-0'),
      'Card footer must wrap cleanly with min-w-0 at 150-200% zoom');
    console.log('✔ JobCard grid card widths, flex-wrap, truncate, and min-w-0 constraints verified.');

    // =========================================================================
    // TEST 3: ISSUE 3A — WhatsApp Session Check Endpoint: by ObjectId
    // =========================================================================
    console.log('\n--- TEST 3: WhatsApp Session Check Endpoint (by Mongo _id) ---');
    const sessionResById = await axios.get(`${baseUrl}/api/jobcards/${jobCard._id}/whatsapp-session?phone=${phone}`, {
      headers: authHeaders
    });
    assert.strictEqual(sessionResById.status, 200);
    assert.strictEqual(typeof sessionResById.data.active, 'boolean');
    console.log(`✔ GET /api/jobcards/:id/whatsapp-session returned 200 (active: ${sessionResById.data.active}).`);

    // =========================================================================
    // TEST 4: ISSUE 3A — WhatsApp Session Check Endpoint: by jobCardNo
    // =========================================================================
    console.log('\n--- TEST 4: WhatsApp Session Check Endpoint (by jobCardNo format) ---');
    const sessionResByNo = await axios.get(`${baseUrl}/api/jobcards/${encodeURIComponent(jcNo)}/whatsapp-session?phone=${phone}`, {
      headers: authHeaders
    });
    assert.strictEqual(sessionResByNo.status, 200);
    assert.strictEqual(typeof sessionResByNo.data.active, 'boolean');
    console.log(`✔ GET /api/jobcards/:jobCardNo/whatsapp-session returned 200 (no 404 or CastError).`);

    // =========================================================================
    // TEST 5: ISSUE 3A — Standalone WhatsApp Session Route /api/whatsapp/session-status
    // =========================================================================
    console.log('\n--- TEST 5: Standalone WhatsApp Session Route /api/whatsapp/session-status ---');
    const standaloneRes = await axios.get(`${baseUrl}/api/whatsapp/session-status?phone=${phone}`, {
      headers: authHeaders
    });
    assert.strictEqual(standaloneRes.status, 200);
    assert.strictEqual(typeof standaloneRes.data.active, 'boolean');
    assert.strictEqual(standaloneRes.data.valid, true);
    console.log(`✔ GET /api/whatsapp/session-status returned 200 (valid phone, active: ${standaloneRes.data.active}).`);

    // =========================================================================
    // TEST 6: ISSUE 3B — Handle 24-Hour WhatsApp Policy & Photo Queueing
    // =========================================================================
    console.log('\n--- TEST 6: WhatsApp 24-Hour Rule Policy Enforcement ---');
    // Attempting direct photo send when session is expired (active: false)
    let sendBlocked = false;
    try {
      await axios.post(`${baseUrl}/api/jobcards/${jobCard._id}/send-whatsapp-photos`, {
        photoIds: [jobCard.photos[0]._id.toString()],
        phone: customer.mobile
      }, { headers: authHeaders });
    } catch (err) {
      if (err.response && err.response.status === 409) {
        sendBlocked = true;
        const errText = err.response.data.error || err.response.data.message || '';
        assert(errText.includes('Customer WhatsApp session has expired'), 'Must return actionable explanation');
      } else {
        throw err;
      }
    }
    assert(sendBlocked, 'Direct photo send must be rejected with HTTP 409 when session window is closed');
    console.log('✔ 24-hour window enforced: free-form media send blocked with HTTP 409 and actionable explanation.');

    // Send template and queue photos
    const queueRes = await axios.post(`${baseUrl}/api/jobcards/${jobCard._id}/send-whatsapp-photos`, {
      photoIds: [jobCard.photos[0]._id.toString()],
      phone: customer.mobile,
      action: 'send_template_and_queue'
    }, { headers: authHeaders });

    assert.strictEqual(queueRes.status, 200);
    assert.strictEqual(queueRes.data.status, 'pending_session');
    console.log('✔ Approved template action queues photos under pending_session successfully.');

    // Poll endpoint verification
    const pollRes = await axios.get(`${baseUrl}/api/jobcards/${jobCard._id}/whatsapp-photos-status`, {
      headers: authHeaders
    });
    assert.strictEqual(pollRes.status, 200);
    assert.strictEqual(pollRes.data.latest.status, 'pending_session');
    console.log('✔ Real-time polling endpoint confirms queued photo status (pending_session).');

    console.log('\n========================================================================');
    console.log('ALL 6 REGRESSION TESTS IN HOTFIX SUITE PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');

  } catch (err) {
    console.error('\n❌ Hotfix Test Suite encountered an error:', err);
    throw err;
  } finally {
    server.close();
    console.log('Cleaning up hotfix test records from database...');
    if (cleanup.jobcards.length) await JobCard.deleteMany({ _id: { $in: cleanup.jobcards } });
    if (cleanup.vehicles.length) await Vehicle.deleteMany({ _id: { $in: cleanup.vehicles } });
    if (cleanup.customers.length) await Customer.deleteMany({ _id: { $in: cleanup.customers } });
    if (cleanup.users.length) await User.deleteMany({ _id: { $in: cleanup.users } });
    await WhatsAppLog.deleteMany({ recipientPhone: '919876543210' });
    await mongoose.disconnect();
    console.log('Cleanup complete.');
  }
}

runHotfixTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
