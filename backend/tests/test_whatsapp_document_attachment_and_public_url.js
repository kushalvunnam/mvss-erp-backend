const assert = require('assert');
const axios = require('axios');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: '.env' });

process.env.META_WA_ACCESS_TOKEN = process.env.META_WA_ACCESS_TOKEN || 'mock_valid_token_test';
process.env.META_WA_PHONE_NUMBER_ID = process.env.META_WA_PHONE_NUMBER_ID || '1391083524077434';
process.env.META_WA_BUSINESS_ACCOUNT_ID = process.env.META_WA_BUSINESS_ACCOUNT_ID || '1070579342641923';

const express = require('express');
const path = require('path');
const fs = require('fs');

const Estimate = require('../models/Estimate');
const JobCard = require('../models/JobCard');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const WhatsAppLog = require('../models/WhatsAppLog');

const JWT_SECRET = process.env.JWT_SECRET || 'mvss-automobile-erp-secret-key-production';

const app = express();
app.use(express.json());
app.use('/api/estimates', require('../routes/estimates'));
app.use('/api/whatsapp', require('../routes/whatsapp'));

// Mount dynamic PDF route from server.js
app.get(['/uploads/estimates/:filename', '/api/uploads/estimates/:filename'], async (req, res, next) => {
  const filename = req.params.filename;
  try {
    const { generateCustomerEstimatePDF } = require('../utils/pdfGenerator');
    let estimate = null;
    const matchId = filename.match(/customer_estimate_([a-f0-9]{24})\.pdf$/i);

    if (matchId) {
      estimate = await Estimate.findById(matchId[1]);
    } else {
      const rawNumber = filename.replace(/^customer_estimate_/i, '').replace(/\.pdf$/i, '');
      const estNoVariations = [
        rawNumber,
        rawNumber.replace(/_/g, '/'),
        rawNumber.replace(/_/g, '-'),
        rawNumber.replace(/-/g, '/')
      ];
      estimate = await Estimate.findOne({
        $or: estNoVariations.map(no => ({ estimateNo: new RegExp(`^${no.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }))
      });
    }

    if (!estimate) return next();

    const jobCard = (estimate.jobCardId ? await JobCard.findById(estimate.jobCardId) : null) || {};
    let customer = null;
    if (jobCard.customerId) {
      customer = typeof jobCard.customerId === 'object' && jobCard.customerId.name
        ? jobCard.customerId
        : await Customer.findById(jobCard.customerId).lean();
    }
    if (!customer) customer = { name: 'Valued Customer', mobile: 'N/A' };

    let vehicle = null;
    if (jobCard.vehicleId) {
      vehicle = typeof jobCard.vehicleId === 'object' && (jobCard.vehicleId.vehicleNumber || jobCard.vehicleId.regNo)
        ? jobCard.vehicleId
        : await Vehicle.findById(jobCard.vehicleId).lean();
    }
    if (!vehicle) vehicle = { vehicleNumber: 'your vehicle', make: '', model: '' };

    const cleanEstNo = String(estimate.estimateNo || 'EST').replace(/[^a-zA-Z0-9_-]/g, '_');
    const displayFilename = `Customer_Estimate_${cleanEstNo}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${displayFilename}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    generateCustomerEstimatePDF(estimate, customer, vehicle, res);
  } catch (err) {
    console.error('[Dynamic Estimate PDF] Error regenerating PDF on the fly:', err);
    next();
  }
});

async function runTests() {
  console.log('========================================================================');
  console.log('TEST SUITE: Customer Estimate PDF Attachment & Public URL Verification');
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
    estimates: [],
    logs: [],
    users: []
  };

  const originalAxiosPost = axios.post;
  const dispatchedCalls = [];

  let testCustomer = null;

  try {
    // Mock Meta Graph API dispatch
    axios.post = async function (url, data, config) {
      if (typeof url === 'string' && url.includes('graph.facebook.com')) {
        const isDocument = data?.type === 'document';
        const templateName = data?.template?.name;
        const wamid = `wamid.TEST_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        dispatchedCalls.push({
          url,
          data,
          isDocument,
          templateName,
          wamid
        });

        return {
          status: 200,
          data: {
            messages: [{ id: wamid }]
          }
        };
      }
      return originalAxiosPost.apply(this, arguments);
    };

    // 1. Setup Test Admin User
    let adminUser = await User.findOne({ role: 'Admin', active: true });
    if (!adminUser) {
      adminUser = await User.findOne({ active: true });
    }
    if (!adminUser) {
      adminUser = new User({
        name: 'Admin Test PDF',
        email: `admin_test_pdf_${Date.now()}@mvss.com`,
        role: 'Admin',
        password: 'password123',
        department: 'Service',
        active: true
      });
      await adminUser.save();
      cleanup.users.push(adminUser._id);
    }
    const token = jwt.sign({ _id: adminUser._id, role: adminUser.role }, JWT_SECRET, { expiresIn: '1h' });
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 2. Setup Test Customer & Vehicle
    const uniqueSuffix = Date.now().toString().slice(-4);
    testCustomer = new Customer({
      name: 'Praveen Kumar',
      mobile: `9180080${uniqueSuffix}`,
      email: `praveen_${uniqueSuffix}@example.com`
    });
    await testCustomer.save();
    cleanup.customers.push(testCustomer._id);

    const testVehicle = new Vehicle({
      vehicleNumber: `TS09FK${uniqueSuffix}`,
      make: 'Hyundai',
      model: 'Creta',
      fuelType: 'Petrol',
      odometerReading: 12000,
      customerId: testCustomer._id
    });
    await testVehicle.save();
    cleanup.vehicles.push(testVehicle._id);

    const testJc = new JobCard({
      jobCardNo: `JC-PDF-${uniqueSuffix}`,
      customerId: testCustomer._id,
      vehicleId: testVehicle._id,
      serviceAdvisorId: adminUser._id,
      time: '09:30 AM',
      odometerReading: 12000,
      status: 'Estimation'
    });
    await testJc.save();
    cleanup.jobcards.push(testJc._id);

    // 3. Create Test Estimate
    const estRes = await axios.post(`${baseUrl}/api/estimates`, {
      jobCardId: testJc._id,
      parts: [
        { name: 'Engine Oil Synthetic', qty: 1, rate: 3200, gstPercent: 18 },
        { name: 'Oil Filter', qty: 1, rate: 450, gstPercent: 18 }
      ],
      labour: [
        { description: 'General Periodic Service', qty: 1, rate: 1500, gstPercent: 18 }
      ]
    }, { headers: authHeaders });

    const estimate = estRes.data;
    cleanup.estimates.push(estimate._id);
    console.log(`✔ Test Estimate created: ${estimate.estimateNo} (ID: ${estimate._id})`);

    // -------------------------------------------------------------------------
    // TEST 1: Public PDF Stream Endpoint (/api/estimates/public/customer-pdf/:id)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Verify Public PDF Stream URL (/api/estimates/public/customer-pdf/:id) ---');
    const publicPdfRes = await axios.get(`${baseUrl}/api/estimates/public/customer-pdf/${estimate._id}.pdf`, {
      responseType: 'arraybuffer'
    });

    assert.strictEqual(publicPdfRes.status, 200, 'Public PDF endpoint must return HTTP 200');
    assert.strictEqual(publicPdfRes.headers['content-type'], 'application/pdf', 'Content-Type must be application/pdf');
    assert.strictEqual(publicPdfRes.headers['accept-ranges'], 'bytes', 'Accept-Ranges must be bytes');
    assert(publicPdfRes.headers['content-disposition'].includes('Customer_Estimate_'), 'Content-Disposition must include Customer_Estimate_ filename');
    
    // Validate PDF magic bytes: %PDF
    const pdfMagic = Buffer.from(publicPdfRes.data).subarray(0, 4).toString('utf8');
    assert.strictEqual(pdfMagic, '%PDF', 'Returned bytes must start with %PDF magic header');
    assert(publicPdfRes.data.length > 500, 'PDF buffer must contain substantial content');
    console.log(`✔ Test 1 Passed: Public stream endpoint returned ${publicPdfRes.data.length} bytes of valid application/pdf.`);

    // -------------------------------------------------------------------------
    // TEST 2: Dynamic Uploads Fallback (/uploads/estimates/:filename)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Verify Dynamic Fallback PDF Endpoint (/uploads/estimates/:filename) ---');
    const dynamicUploadRes = await axios.get(`${baseUrl}/uploads/estimates/customer_estimate_${estimate._id}.pdf`, {
      responseType: 'arraybuffer'
    });

    assert.strictEqual(dynamicUploadRes.status, 200, 'Uploads endpoint must return HTTP 200');
    assert.strictEqual(dynamicUploadRes.headers['content-type'], 'application/pdf', 'Content-Type must be application/pdf');
    const dynamicMagic = Buffer.from(dynamicUploadRes.data).subarray(0, 4).toString('utf8');
    assert.strictEqual(dynamicMagic, '%PDF', 'Must return valid PDF bytes even if file was deleted from disk');
    console.log(`✔ Test 2 Passed: Dynamic regeneration route served valid PDF (${dynamicUploadRes.data.length} bytes).`);

    // -------------------------------------------------------------------------
    // TEST 3: Inactive 24h Window -> Document Queued as pending_session
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Inactive 24h Window Queuing (Prevents Meta 131047 Error) ---');
    dispatchedCalls.length = 0;

    const sendResInactive = await axios.post(`${baseUrl}/api/estimates/${estimate._id}/send`, {}, { headers: authHeaders });
    assert.strictEqual(sendResInactive.status, 200);

    // Verify that NO standalone document message was dispatched to Meta (since 24h window is closed)
    const rawDocDispatched = dispatchedCalls.find(d => d.isDocument);
    assert(!rawDocDispatched, 'Raw document message must NOT be dispatched outside 24h window to avoid Meta 131047 Re-engagement error');

    // Verify templates WERE sent
    const stage1Dispatched = dispatchedCalls.find(d => d.templateName === 'mvss_estimate_created');
    assert(stage1Dispatched, 'Stage 1 template must be dispatched');

    // Verify audit log shows DOCUMENT_ESTIMATE_PDF with status 'pending_session'
    const estAfterSend = await Estimate.findById(estimate._id);
    const docPendingEntry = estAfterSend.whatsappHistory.find(h => h.stage === 'DOCUMENT_ESTIMATE_PDF');
    assert(docPendingEntry, 'whatsappHistory must record DOCUMENT_ESTIMATE_PDF entry');
    assert.strictEqual(docPendingEntry.status, 'pending_session', 'Document status must be pending_session');
    console.log('✔ Test 3 Passed: Document attachment queued as pending_session without triggering Meta 131047 error.');

    // -------------------------------------------------------------------------
    // TEST 4: Customer Inbound Reply Webhook -> Auto-delivers Queued PDF Document
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Inbound Webhook Event Auto-Delivers Queued PDF Attachment ---');
    dispatchedCalls.length = 0;

    // Simulate customer replying via WhatsApp webhook
    const inboundPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '1070579342641923',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '7674819765', phone_number_id: '1391083524077434' },
                messages: [
                  {
                    from: testCustomer.mobile,
                    id: `wamid.INBOUND_${Date.now()}`,
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    text: { body: 'Yes, please share the estimate' },
                    type: 'text'
                  }
                ]
              },
              field: 'messages'
            }
          ]
        }
      ]
    };

    const webhookRes = await axios.post(`${baseUrl}/api/whatsapp/webhook`, inboundPayload);
    assert.strictEqual(webhookRes.status, 200, 'Webhook must return 200');

    // Verify document was automatically dispatched now that 24h window is open
    const autoDocDispatch = dispatchedCalls.find(d => d.isDocument);
    assert(autoDocDispatch, 'Queued PDF document must be dispatched automatically when customer replies');
    assert.strictEqual(String(autoDocDispatch.data.to).replace(/\D/g, ''), String(testCustomer.mobile).replace(/\D/g, ''));
    assert(autoDocDispatch.data.document.link.includes(`/api/estimates/public/customer-pdf/${estimate._id}.pdf`));
    assert(autoDocDispatch.data.document.filename.includes('Customer_Estimate_'));

    // Verify status updated to 'sent' in database
    const estAfterWebhook = await Estimate.findById(estimate._id);
    const docSentEntry = estAfterWebhook.whatsappHistory.find(h => h.stage === 'DOCUMENT_ESTIMATE_PDF');
    assert.strictEqual(docSentEntry.status, 'sent', 'Document status must transition to "sent"');
    assert(docSentEntry.messageId, 'Document entry must have wamid');
    console.log(`✔ Test 4 Passed: Webhook successfully auto-delivered Customer Estimate PDF (wamid: ${docSentEntry.messageId}).`);

    // -------------------------------------------------------------------------
    // TEST 5: Active 24h Window -> Immediate Document Delivery
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Active 24h Window Delivers Document Attachment Immediately ---');
    dispatchedCalls.length = 0;

    // Create a new estimate for the same engaged customer
    const estRes2 = await axios.post(`${baseUrl}/api/estimates`, {
      jobCardId: testJc._id,
      parts: [{ name: 'Brake Fluid DOT 4', qty: 1, rate: 600, gstPercent: 18 }],
      labour: [{ description: 'Brake Bleeding', qty: 1, rate: 400, gstPercent: 18 }]
    }, { headers: authHeaders });

    const estimate2 = estRes2.data;
    cleanup.estimates.push(estimate2._id);

    const sendResActive = await axios.post(`${baseUrl}/api/estimates/${estimate2._id}/send`, {}, { headers: authHeaders });
    assert.strictEqual(sendResActive.status, 200);

    const immediateDocDispatch = dispatchedCalls.find(d => d.isDocument);
    assert(immediateDocDispatch, 'Document must be dispatched immediately when session is active');
    console.log('✔ Test 5 Passed: Customer Estimate PDF delivered immediately in active 24h window.');

    // -------------------------------------------------------------------------
    // TEST 6: Atomic Upsert Never Causes Duplicate Key Error (E11000)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Atomic Upsert Idempotency Verification ---');
    const { sendTemplateMessage } = require('../services/whatsappService');
    const duplicateKey = `test_atomic_key_${Date.now()}`;

    const valid5Params = [
      { type: 'text', text: 'Praveen' },
      { type: 'text', text: 'TS09EA1234' },
      { type: 'text', text: 'EST-101' },
      { type: 'text', text: 'JC-101' },
      { type: 'text', text: '5,000' }
    ];

    // Run parallel calls with the exact same idempotencyKey
    const [resA, resB] = await Promise.allSettled([
      sendTemplateMessage({
        to: testCustomer.mobile,
        templateName: 'mvss_estimate_created',
        components: [{ type: 'body', parameters: valid5Params }],
        idempotencyKey: duplicateKey
      }),
      sendTemplateMessage({
        to: testCustomer.mobile,
        templateName: 'mvss_estimate_created',
        components: [{ type: 'body', parameters: valid5Params }],
        idempotencyKey: duplicateKey
      })
    ]);

    assert(resA.status === 'fulfilled' || resB.status === 'fulfilled', 'At least one call must succeed');
    // Ensure no unhandled E11000 crashed the process
    const logsFound = await WhatsAppLog.find({ idempotencyKey: duplicateKey });
    assert.strictEqual(logsFound.length, 1, 'Only one log record must exist for the idempotency key');
    console.log('✔ Test 6 Passed: Atomic upsert successfully avoided E11000 duplicate key errors.');

    console.log('\n========================================================================');
    console.log('ALL 6 TESTS IN CUSTOMER ESTIMATE PDF SUITE PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');

  } catch (err) {
    console.error('\n❌ Test Suite encountered an error:', err);
    throw err;
  } finally {
    axios.post = originalAxiosPost;
    server.close();

    console.log('Cleaning up test records from database...');
    if (cleanup.estimates.length) await Estimate.deleteMany({ _id: { $in: cleanup.estimates } });
    if (cleanup.jobcards.length) await JobCard.deleteMany({ _id: { $in: cleanup.jobcards } });
    if (cleanup.vehicles.length) await Vehicle.deleteMany({ _id: { $in: cleanup.vehicles } });
    if (cleanup.customers.length) await Customer.deleteMany({ _id: { $in: cleanup.customers } });
    if (cleanup.users.length) await User.deleteMany({ _id: { $in: cleanup.users } });
    await WhatsAppLog.deleteMany({
      $or: [
        { recipientPhone: testCustomer?.mobile },
        { relatedEntity: { $in: cleanup.estimates } }
      ]
    });
    await mongoose.disconnect();
    console.log('Cleanup complete.');
  }
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
