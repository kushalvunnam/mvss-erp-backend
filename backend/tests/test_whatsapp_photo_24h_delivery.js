const assert = require('assert');
const axios = require('axios');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

process.env.META_WA_ACCESS_TOKEN = process.env.META_WA_ACCESS_TOKEN || 'mock_valid_token_test';
process.env.META_WA_PHONE_NUMBER_ID = process.env.META_WA_PHONE_NUMBER_ID || '1446113211917959';
process.env.META_WA_BUSINESS_ACCOUNT_ID = process.env.META_WA_BUSINESS_ACCOUNT_ID || '2021254895254703';

const express = require('express');
const JobCard = require('../models/JobCard');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const WhatsAppLog = require('../models/WhatsAppLog');

const JWT_SECRET = process.env.JWT_SECRET || 'mvss-automobile-erp-secret-key-production';

const app = express();
app.use(express.json());
app.use('/api/jobcards', require('../routes/jobcards'));
app.use('/api/whatsapp', require('../routes/whatsapp'));

async function runTests() {
  console.log('========================================================================');
  console.log('TEST SUITE: WhatsApp Photo Delivery 24-Hour Window & Webhook Tracking');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✔ Connected to MongoDB.');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`✔ Test server started on port ${port}.`);

  const cleanup = {
    customers: [],
    vehicles: [],
    jobcards: [],
    logs: [],
    users: []
  };

  const originalAxiosPost = axios.post;
  const dispatchedCalls = [];

  try {
    // Intercept Meta Graph API calls
    axios.post = async function (url, data, config) {
      if (typeof url === 'string' && url.includes('graph.facebook.com')) {
        const isImage = data?.type === 'image';
        const isTemplate = data?.type === 'template';
        const templateName = data?.template?.name;
        const wamid = `wamid.TEST_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

        dispatchedCalls.push({
          url,
          data,
          isImage,
          isTemplate,
          templateName,
          wamid
        });

        return {
          status: 200,
          data: {
            messaging_product: 'whatsapp',
            contacts: [{ input: data.to, wa_id: data.to }],
            messages: [{ id: wamid }]
          }
        };
      }
      return originalAxiosPost.apply(this, arguments);
    };

    // Setup Test User & Auth Token
    const testUser = await User.create({
      name: 'Test Admin',
      email: `admin_${Date.now()}@mvsstest.com`,
      password: 'password123',
      role: 'Admin'
    });
    cleanup.users.push(testUser._id);
    const authToken = jwt.sign({ _id: testUser._id, role: testUser.role }, JWT_SECRET, { expiresIn: '1h' });
    const authHeaders = { Authorization: `Bearer ${authToken}` };

    // Setup Test Customer & Vehicle
    const phoneNum = '919876543210';
    const testCustomer = await Customer.create({
      name: 'Vunnam Kushal Test',
      mobile: phoneNum,
      phone: phoneNum,
      email: `kushal_${Date.now()}@mvsstest.com`
    });
    cleanup.customers.push(testCustomer._id);

    const testVehicle = await Vehicle.create({
      vehicleNumber: 'TS09EA9999',
      customerId: testCustomer._id,
      make: 'Hyundai',
      model: 'Creta',
      fuelType: 'Petrol',
      odometerReading: 12000
    });
    cleanup.vehicles.push(testVehicle._id);

    // Setup Test Job Card with uploaded photos
    const testJobCard = await JobCard.create({
      jobCardNo: `JC-TEST-${Date.now().toString().slice(-4)}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: testUser._id,
      odometerReading: 12000,
      time: '10:00 AM',
      customerDetails: {
        name: testCustomer.name,
        mobile: testCustomer.mobile
      },
      vehicleDetails: {
        vehicleNumber: testVehicle.vehicleNumber,
        model: testVehicle.model
      },
      photos: [
        {
          url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341',
          caption: 'Front Bumper Damage',
          category: 'jobcard',
          uploadedAt: new Date()
        },
        {
          url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70',
          caption: 'Rear Panel Inspection',
          category: 'jobcard',
          uploadedAt: new Date()
        }
      ],
      whatsappHistory: []
    });
    cleanup.jobcards.push(testJobCard._id);
    const photoId1 = testJobCard.photos[0]._id.toString();
    const photoId2 = testJobCard.photos[1]._id.toString();

    // =========================================================================
    // TEST 1: Session is EXPIRED (>24h or no previous inbound message)
    // =========================================================================
    console.log('\n--- TEST 1: Customer Session Expired (>24h) ---');
    const sessionRes1 = await axios.get(`${baseUrl}/api/jobcards/${testJobCard._id}/whatsapp-session`, {
      headers: authHeaders
    });
    assert.strictEqual(sessionRes1.status, 200);
    assert.strictEqual(sessionRes1.data.active, false, 'Session must be reported as inactive');
    assert(sessionRes1.data.reason.includes('expired') || sessionRes1.data.reason.includes('closed'),
      'Must explain session is closed/expired');
    console.log('✔ Session status check correctly returned inactive (active: false).');

    // Attempting direct photo send without approved template must return 409 Conflict
    let sendBlocked = false;
    try {
      await axios.post(`${baseUrl}/api/jobcards/${testJobCard._id}/send-whatsapp-photos`, {
        photoIds: [photoId1],
        phone: testCustomer.mobile
      }, { headers: authHeaders });
    } catch (err) {
      if (err.response && err.response.status === 409) {
        sendBlocked = true;
        const errText = err.response.data.error || err.response.data.message || '';
        assert(errText.includes('Customer WhatsApp session has expired'),
          'Error message must state: Customer WhatsApp session has expired. Please use an approved WhatsApp template to contact the customer.');
      } else {
        throw err;
      }
    }
    assert(sendBlocked, 'Direct photo send must be rejected with HTTP 409 when session is closed');
    console.log('✔ Direct photo dispatch safely rejected with HTTP 409 when 24h window is closed.');

    // =========================================================================
    // TEST 2: Template Dispatch & Photo Queuing ('pending_session')
    // =========================================================================
    console.log('\n--- TEST 2: Send Approved Template & Queue Photos ---');
    dispatchedCalls.length = 0; // reset calls

    const queueRes = await axios.post(`${baseUrl}/api/jobcards/${testJobCard._id}/send-whatsapp-photos`, {
      photoIds: [photoId1, photoId2],
      phone: testCustomer.mobile,
      action: 'send_template_and_queue'
    }, { headers: authHeaders });

    assert.strictEqual(queueRes.status, 200);
    assert.strictEqual(queueRes.data.status, 'pending_session');
    assert(queueRes.data.message.includes('automatically delivered once customer replies'), 'Must confirm photos are queued');

    // Verify approved template was dispatched to Meta
    assert.strictEqual(dispatchedCalls.length, 1, 'Meta template must be called');
    assert.strictEqual(dispatchedCalls[0].isTemplate, true, 'Dispatched call must be template');
    assert.strictEqual(dispatchedCalls[0].templateName, 'mvss_service_support', 'Must dispatch mvss_service_support');

    // Verify JobCard.whatsappHistory records 'pending_session'
    const jcQueued = await JobCard.findById(testJobCard._id);
    const queuedHistory = jcQueued.whatsappHistory.find(h => h.status === 'pending_session');
    assert(queuedHistory, 'Job Card must have a pending_session entry');
    assert.strictEqual(queuedHistory.photoCount, 2);
    console.log('✔ Approved template dispatched and 2 photos queued with status pending_session.');

    // =========================================================================
    // TEST 3: Inbound Customer Reply Reopens Window & Auto-Delivers Queued Photos
    // =========================================================================
    console.log('\n--- TEST 3: Inbound Customer Reply Auto-Dispatches Queued Photos ---');
    dispatchedCalls.length = 0;

    // Simulate customer replying "Hi, please send photos"
    const inboundPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: process.env.META_WA_BUSINESS_ACCOUNT_ID,
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '1234567890', phone_number_id: process.env.META_WA_PHONE_NUMBER_ID },
            contacts: [{ profile: { name: testCustomer.name }, wa_id: testCustomer.mobile }],
            messages: [{
              from: testCustomer.mobile,
              id: `wamid.INBOUND_${Date.now()}`,
              timestamp: `${Math.floor(Date.now() / 1000)}`,
              text: { body: 'Hi, please send photos' },
              type: 'text'
            }]
          },
          field: 'messages'
        }]
      }]
    };

    const inboundWebhookRes = await axios.post(`${baseUrl}/api/whatsapp/webhook`, inboundPayload);
    assert.strictEqual(inboundWebhookRes.status, 200);

    // Give asynchronous auto-dispatch a moment to execute
    await new Promise(r => setTimeout(r, 600));

    // Verify that the queued photos were auto-delivered as image messages
    assert.strictEqual(dispatchedCalls.length, 2, 'Both queued photos must be dispatched as images');
    assert(dispatchedCalls.every(c => c.isImage === true), 'Dispatched items must be images');

    // Check updated Job Card history
    const jcAfterReply = await JobCard.findById(testJobCard._id);
    const autoDispatched = jcAfterReply.whatsappHistory.find(h => h.status === 'accepted' || h.status === 'sent');
    assert(autoDispatched, 'Queued photos status must update to accepted');
    assert(autoDispatched.messageIds && autoDispatched.messageIds.length === 2, 'Must record Meta wamids');
    const autoWamids = autoDispatched.messageIds;
    console.log('✔ Inbound customer reply automatically released and dispatched 2 queued photos.');

    // =========================================================================
    // TEST 4: Session is now ACTIVE (<24h) and Direct Photo Dispatch
    // =========================================================================
    console.log('\n--- TEST 4: Active Session (<24h) Direct Dispatch & Acceptance ---');
    dispatchedCalls.length = 0;

    const sessionResActive = await axios.get(`${baseUrl}/api/jobcards/${testJobCard._id}/whatsapp-session`, {
      headers: authHeaders
    });
    assert.strictEqual(sessionResActive.status, 200);
    assert.strictEqual(sessionResActive.data.active, true, 'Session must now be active');
    console.log(`✔ Active session confirmed with ${sessionResActive.data.hoursRemaining} hours remaining.`);

    // Dispatch a new photo directly
    const directSendRes = await axios.post(`${baseUrl}/api/jobcards/${testJobCard._id}/send-whatsapp-photos`, {
      photoIds: [photoId1],
      phone: testCustomer.mobile
    }, { headers: authHeaders });

    assert.strictEqual(directSendRes.status, 200);
    assert.strictEqual(directSendRes.data.status, 'accepted');
    assert.strictEqual(directSendRes.data.message, 'Message accepted by WhatsApp. Waiting for delivery confirmation.');
    assert.strictEqual(dispatchedCalls.length, 1);
    const newWamid = dispatchedCalls[0].wamid;
    console.log(`✔ Photo dispatched and marked accepted with wamid: ${newWamid}`);

    // =========================================================================
    // TEST 5: Webhook Delivery & Read Receipts Synchronize to JobCard
    // =========================================================================
    console.log('\n--- TEST 5: Webhook Delivery & Read Status Synchronization ---');

    // 5A. Webhook: 'delivered'
    const deliveredPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: process.env.META_WA_BUSINESS_ACCOUNT_ID,
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '1234567890', phone_number_id: process.env.META_WA_PHONE_NUMBER_ID },
            statuses: [{
              id: newWamid,
              status: 'delivered',
              timestamp: `${Math.floor(Date.now() / 1000)}`,
              recipient_id: testCustomer.mobile
            }]
          },
          field: 'messages'
        }]
      }]
    };

    const webhookDeliveredRes = await axios.post(`${baseUrl}/api/whatsapp/webhook`, deliveredPayload);
    assert.strictEqual(webhookDeliveredRes.status, 200);

    const jcDelivered = await JobCard.findById(testJobCard._id);
    const deliveredItem = jcDelivered.whatsappHistory.find(h => (h.messageIds || []).includes(newWamid));
    assert(deliveredItem, 'Delivered record must exist in whatsappHistory');
    assert.strictEqual(deliveredItem.status, 'delivered', 'Status must be updated to delivered');
    assert(deliveredItem.deliveredAt, 'deliveredAt timestamp must be set');
    console.log('✔ Webhook delivered status synced to JobCard.whatsappHistory.');

    // 5B. Webhook: 'read'
    const readPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: process.env.META_WA_BUSINESS_ACCOUNT_ID,
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '1234567890', phone_number_id: process.env.META_WA_PHONE_NUMBER_ID },
            statuses: [{
              id: newWamid,
              status: 'read',
              timestamp: `${Math.floor(Date.now() / 1000)}`,
              recipient_id: testCustomer.mobile
            }]
          },
          field: 'messages'
        }]
      }]
    };

    const webhookReadRes = await axios.post(`${baseUrl}/api/whatsapp/webhook`, readPayload);
    assert.strictEqual(webhookReadRes.status, 200);

    const jcRead = await JobCard.findById(testJobCard._id);
    const readItem = jcRead.whatsappHistory.find(h => (h.messageIds || []).includes(newWamid));
    assert.strictEqual(readItem.status, 'read', 'Status must be updated to read');
    assert(readItem.readAt, 'readAt timestamp must be set');
    console.log('✔ Webhook read status synced to JobCard.whatsappHistory.');

    // =========================================================================
    // TEST 6: Webhook Delivery Failure & Meta Error Code Tracking
    // =========================================================================
    console.log('\n--- TEST 6: Webhook Failure & Meta Error Code Tracking ---');

    // Create a mock wamid representing a failed attempt
    const failedWamid = `wamid.FAIL_${Date.now()}`;
    await JobCard.updateOne(
      { _id: testJobCard._id },
      {
        $push: {
          whatsappHistory: {
            messageId: failedWamid,
            messageIds: [failedWamid],
            stage: 'VEHICLE_PHOTOS',
            photoCount: 1,
            recipientPhone: testCustomer.mobile,
            recipientName: testCustomer.name,
            status: 'accepted',
            sentAt: new Date()
          }
        }
      }
    );

    const failedPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: process.env.META_WA_BUSINESS_ACCOUNT_ID,
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '1234567890', phone_number_id: process.env.META_WA_PHONE_NUMBER_ID },
            statuses: [{
              id: failedWamid,
              status: 'failed',
              timestamp: `${Math.floor(Date.now() / 1000)}`,
              recipient_id: testCustomer.mobile,
              errors: [{
                code: 131047,
                title: 'Re-engagement message failed',
                message: 'More than 24 hours have passed since the customer last replied to this number.'
              }]
            }]
          },
          field: 'messages'
        }]
      }]
    };

    const webhookFailedRes = await axios.post(`${baseUrl}/api/whatsapp/webhook`, failedPayload);
    assert.strictEqual(webhookFailedRes.status, 200);

    const jcFailed = await JobCard.findById(testJobCard._id);
    const failedItem = jcFailed.whatsappHistory.find(h => (h.messageIds || []).includes(failedWamid));
    assert(failedItem, 'Failed record must exist in whatsappHistory');
    assert.strictEqual(failedItem.status, 'failed', 'Status must be updated to failed');
    assert.strictEqual(failedItem.metaErrorCode, '131047', 'Must record Meta error code 131047');
    assert(failedItem.errorMessage.includes('24 hours'), 'Must record Meta error description');
    assert(failedItem.failedAt, 'failedAt timestamp must be set');
    console.log('✔ Webhook failed receipt synced with error code 131047 and descriptive message.');

    // Poll endpoint verification
    const pollRes = await axios.get(`${baseUrl}/api/jobcards/${testJobCard._id}/whatsapp-photos-status`, {
      headers: authHeaders
    });
    assert.strictEqual(pollRes.status, 200);
    assert.strictEqual(pollRes.data.latest.status, 'failed');
    assert.strictEqual(pollRes.data.latest.metaErrorCode, '131047');
    console.log('✔ Live photo delivery poll endpoint accurately reports latest failure state.');

    console.log('\n========================================================================');
    console.log('ALL 6 TESTS IN WHATSAPP PHOTO 24H DELIVERY SUITE PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');

  } catch (err) {
    console.error('\n❌ Test Suite encountered an error:', err);
    throw err;
  } finally {
    axios.post = originalAxiosPost;
    server.close();

    console.log('Cleaning up test records from database...');
    if (cleanup.jobcards.length) await JobCard.deleteMany({ _id: { $in: cleanup.jobcards } });
    if (cleanup.vehicles.length) await Vehicle.deleteMany({ _id: { $in: cleanup.vehicles } });
    if (cleanup.customers.length) await Customer.deleteMany({ _id: { $in: cleanup.customers } });
    if (cleanup.users.length) await User.deleteMany({ _id: { $in: cleanup.users } });
    await WhatsAppLog.deleteMany({
      recipientPhone: { $in: ['919876543210', '+919876543210'] }
    });
    await mongoose.disconnect();
    console.log('Cleanup complete.');
  }
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
