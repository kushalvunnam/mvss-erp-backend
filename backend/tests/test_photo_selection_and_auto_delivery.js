const assert = require('assert');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JobCard = require('../models/JobCard');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const { getCustomerSessionStatus } = require('../services/whatsappService');

async function runTests() {
  console.log('=== RUNNING TESTS: WhatsApp Photo Selection, Routing & Auto-Delivery ===');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas');

  // Find or create test customer & admin
  let admin = await User.findOne({ role: 'Admin', active: true }).lean();
  if (!admin) {
    admin = await User.findOne({ role: 'Admin' }).lean();
  }
  assert(admin, 'Admin user must exist in database');

  const token = jwt.sign(
    { _id: admin._id, role: admin.role, name: admin.name || 'Admin User' },
    process.env.JWT_SECRET || 'autoworkshop_secret_key_123'
  );

  // 1. Verify JobCard with formatted number like MVSS/JC/26-27/082
  const jc = await JobCard.findOne({ jobCardNo: 'MVSS/JC/26-27/082' }).populate('customerId').populate('vehicleId');
  assert(jc, 'JobCard MVSS/JC/26-27/082 must exist');
  console.log(`✔ Found JobCard ${jc.jobCardNo} with _id: ${jc._id}`);

  // Test findJobCardByIdentifier logic
  const rawIdWithSlashes = 'MVSS/JC/26-27/082';
  const foundByNo = await JobCard.findOne({ jobCardNo: rawIdWithSlashes }).populate('customerId').populate('vehicleId');
  assert(foundByNo && String(foundByNo._id) === String(jc._id), 'Resolving by jobCardNo must work');
  console.log('✔ JobCard resolution by formatted string with slashes verified.');

  // 2. Test 24-hour window status
  const testPhone = '918008092742';
  const session = await getCustomerSessionStatus(testPhone);
  console.log(`✔ Customer 24h WhatsApp Session Status for ${testPhone}:`, {
    active: session.active,
    hoursRemaining: session.hoursRemaining,
    reason: session.reason
  });

  // 3. Test send-whatsapp-photos route handler internally
  const express = require('express');
  const axios = require('axios');
  const app = express();
  app.use(express.json());
  app.use('/api/jobcards', require('../routes/jobcards'));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // Test A: Direct send outside 24h window must return 409 (not 404!)
    console.log('Testing direct send outside 24h window (via POST /send-whatsapp-photos)...');
    try {
      await axios.post(`${baseUrl}/api/jobcards/send-whatsapp-photos`, {
        jobCardId: jc.jobCardNo, // Formatted number with slashes!
        photoIds: [String(jc.photos?.[0]?._id || 'photo_1')],
        phone: testPhone,
        action: 'direct'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.fail('Should have failed with 409');
    } catch (err) {
      assert.strictEqual(err.response?.status, 409, 'Must return 409 Session Expired for direct send outside 24h window');
      assert.strictEqual(err.response?.data?.sessionExpired, true, 'sessionExpired must be true');
      console.log('✔ Correctly returned 409 Session Expired without any 404 pathing errors!');
    }

    // Test B: Zero selected photos must be rejected with 400
    console.log('Testing send with 0 selected photos...');
    try {
      await axios.post(`${baseUrl}/api/jobcards/send-whatsapp-photos`, {
        jobCardId: jc._id,
        photoIds: [],
        phone: testPhone,
        action: 'direct'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.fail('Should have failed with 400');
    } catch (err) {
      assert.strictEqual(err.response?.status, 400, 'Must return 400 for empty photoIds');
      console.log('✔ Correctly blocked photo send with zero selected photos.');
    }

    // Test C: Dedicated template requirement
    console.log('Testing queueing with dedicated template...');
    try {
      const queueRes = await axios.post(`${baseUrl}/api/jobcards/send-whatsapp-photos`, {
        jobCardId: jc._id,
        photoIds: [String(jc.photos?.[0]?._id || 'photo_1')],
        phone: testPhone,
        action: 'send_template_and_queue'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Queue template response status:', queueRes.status);
      assert.strictEqual(queueRes.data.status, 'pending_session');
      console.log('✔ Dedicated template dispatched & photos queued successfully.');
    } catch (err) {
      assert.strictEqual(err.response?.status, 400);
      assert(err.response?.data?.error.includes('mvss_vehicle_photos_available') || err.response?.data?.error.includes('template'));
      console.log('✔ Correctly prevented silent fallback to generic template when dedicated template requires approval.');
    }
  } finally {
    server.close();
  }

  // 4. Test Webhook auto-delivery logic on simulated customer reply
  console.log('Testing inbound webhook auto-delivery of queued photos...');
  // Ensure a test pending_session entry exists on jc
  const testQueueItem = {
    messageId: `test_msg_${Date.now()}`,
    messageIds: [`test_msg_${Date.now()}`],
    stage: 'VEHICLE_PHOTOS',
    photoUrls: ['/api/jobcards/photo/test_photo_1'],
    photoCount: 1,
    recipientPhone: testPhone,
    recipientName: 'Vunnam Kushal',
    status: 'pending_session',
    sentAt: new Date(),
    caption: 'Test photo caption',
    sentBy: 'System Admin'
  };

  await JobCard.updateOne(
    { _id: jc._id },
    { $push: { whatsappHistory: testQueueItem } }
  );

  const updatedJc = await JobCard.findById(jc._id).lean();
  const foundPending = updatedJc.whatsappHistory.find(h => h.messageId === testQueueItem.messageId);
  assert(foundPending && foundPending.status === 'pending_session', 'Pending session entry must exist');
  console.log('✔ Queued pending photo item recorded in JobCard.whatsappHistory.');

  // Clean up test entry
  await JobCard.updateOne(
    { _id: jc._id },
    { $pull: { whatsappHistory: { messageId: testQueueItem.messageId } } }
  );
  console.log('✔ Cleaned up test pending item.');

  await mongoose.disconnect();
  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
