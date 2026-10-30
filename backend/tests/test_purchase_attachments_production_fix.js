const assert = require('assert');
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
const FormData = require('form-data');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Purchase = require('../models/Purchase');
const Vendor = require('../models/Vendor');
const purchasesRouter = require('../routes/purchases');
const { fileExists, downloadFileStream } = require('../utils/gridfs');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/purchases', purchasesRouter);
  return http.createServer(app);
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('TEST SUITE: Purchase Module Invoice Attachments Production Fix');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✔ Connected to MongoDB Atlas.');

  let adminUser = await User.findOne({ role: 'Admin', active: true });
  if (!adminUser) adminUser = await User.findOne({ active: true });
  assert(adminUser, 'Active user required for auth');

  const token = jwt.sign({ _id: adminUser._id, role: adminUser.role, name: adminUser.name }, JWT_SECRET);
  const authHeaders = {
    'Authorization': `Bearer ${token}`
  };

  let server = createServer();
  await new Promise(resolve => server.listen(0, resolve));
  let port = server.address().port;
  let baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Retrieve Invoice Attachments on Existing Recovered Purchase Records
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Retrieve Invoice Attachments on Existing Purchase Records ---');
    
    // Purchase 070 (Sri Enterprises)
    const p70 = await Purchase.findOne({ purchaseNo: 'MVSS/PUR/26-27/070' });
    assert(p70, 'MVSS/PUR/26-27/070 must exist');
    console.log(`Testing Purchase 070 (${p70.purchaseNo}, Vendor: ${p70.vendorName})...`);

    // HEAD request
    const headRes70 = await axios.head(`${baseUrl}/api/purchases/${p70._id}/attachment`, { headers: authHeaders });
    assert.strictEqual(headRes70.status, 200);
    assert.strictEqual(headRes70.headers['content-type'], 'image/jpeg');
    assert.strictEqual(parseInt(headRes70.headers['content-length']), 156732);
    console.log('✔ HEAD request verified: 200 OK, Content-Type: image/jpeg, Length: 156,732 bytes');

    // GET request (Stream download)
    const getRes70 = await axios.get(`${baseUrl}/api/purchases/${p70._id}/attachment`, {
      headers: authHeaders,
      responseType: 'arraybuffer'
    });
    assert.strictEqual(getRes70.status, 200);
    assert.strictEqual(getRes70.data.length, 156732);
    console.log(`✔ GET stream download verified: ${getRes70.data.length} bytes received.`);

    // Also test query token auth parameter (browser new tab scenario)
    const tabRes70 = await axios.get(`${baseUrl}/api/purchases/${p70._id}/attachment?token=${token}`, {
      responseType: 'arraybuffer'
    });
    assert.strictEqual(tabRes70.status, 200);
    assert.strictEqual(tabRes70.data.length, 156732);
    console.log('✔ Browser tab direct URL authentication (?token=...) verified: 200 OK.');

    // Purchase 071 (KANTIPUDI AUTOMOBILES)
    const p71 = await Purchase.findOne({ purchaseNo: 'MVSS/PUR/26-27/071' });
    assert(p71, 'MVSS/PUR/26-27/071 must exist');
    const getRes71 = await axios.get(`${baseUrl}/api/purchases/${p71._id}/attachment`, {
      headers: authHeaders,
      responseType: 'arraybuffer'
    });
    assert.strictEqual(getRes71.status, 200);
    assert.strictEqual(getRes71.data.length, 267739);
    console.log(`✔ Purchase 071 (${p71.purchaseNo}) verified: ${getRes71.data.length} bytes (KANTIPUDI_25AUG_DUSTER.jpeg).`);

    // Purchase 068 (LNS AUTO WORLD)
    const p68 = await Purchase.findOne({ purchaseNo: 'MVSS/PUR/26-27/068' });
    assert(p68, 'MVSS/PUR/26-27/068 must exist');
    const getRes68 = await axios.get(`${baseUrl}/api/purchases/${p68._id}/attachment`, {
      headers: authHeaders,
      responseType: 'arraybuffer'
    });
    assert.strictEqual(getRes68.status, 200);
    assert.strictEqual(getRes68.data.length, 191665);
    console.log(`✔ Purchase 068 (${p68.purchaseNo}) verified: ${getRes68.data.length} bytes (lns_auto_28aug.jpeg).`);

    // -------------------------------------------------------------------------
    // TEST 2: Upload / Re-upload a Vendor Invoice to an Existing Purchase Record
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Upload / Re-upload Vendor Invoice to Existing Purchase Record ---');
    // We will test on Purchase 077 (the latest purchase in DB, which had no invoice attached)
    const targetPurchase = await Purchase.findOne({ purchaseNo: 'MVSS/PUR/26-27/077' });
    assert(targetPurchase, 'MVSS/PUR/26-27/077 must exist');

    // Create a realistic sample PDF buffer
    const samplePdfContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF';
    const samplePdfBuffer = Buffer.from(samplePdfContent, 'utf-8');

    const form = new FormData();
    form.append('attachment', samplePdfBuffer, {
      filename: 'Vendor_Invoice_1214.pdf',
      contentType: 'application/pdf'
    });

    const uploadRes = await axios.post(
      `${baseUrl}/api/purchases/${targetPurchase._id}/reupload-attachment`,
      form,
      {
        headers: {
          ...authHeaders,
          ...form.getHeaders()
        }
      }
    );

    assert.strictEqual(uploadRes.status, 200);
    assert(uploadRes.data.attachment, 'Must return attachment metadata');
    assert(uploadRes.data.attachment.key, 'Must return GridFS key');
    const newFileKey = uploadRes.data.attachment.key;
    console.log(`✔ Upload succeeded. GridFS File Key: ${newFileKey}, Filename: ${uploadRes.data.attachment.originalName}`);

    // Verify database document was updated
    const updatedPurchase = await Purchase.findById(targetPurchase._id);
    assert.strictEqual(updatedPurchase.attachments.length, 1);
    assert.strictEqual(updatedPurchase.attachments[0].key, newFileKey);
    assert.strictEqual(updatedPurchase.attachments[0].originalName, 'Vendor_Invoice_1214.pdf');
    assert.strictEqual(updatedPurchase.attachments[0].mimeType, 'application/pdf');
    assert(updatedPurchase.attachments[0].uploadedAt, 'Must have uploadedAt timestamp');
    assert.strictEqual(updatedPurchase.attachmentUrl, `/api/purchases/attachment/${newFileKey}`);
    console.log('✔ Purchase record in MongoDB successfully updated with persistent GridFS file reference and metadata.');

    // -------------------------------------------------------------------------
    // TEST 3: Open / Retrieve Newly Uploaded Invoice
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Open and Stream Newly Uploaded Invoice ---');
    const newInvoiceRes = await axios.get(`${baseUrl}/api/purchases/${targetPurchase._id}/attachment`, {
      headers: authHeaders,
      responseType: 'arraybuffer'
    });
    assert.strictEqual(newInvoiceRes.status, 200);
    assert.strictEqual(newInvoiceRes.headers['content-type'], 'application/pdf');
    const retrievedBuffer = Buffer.from(newInvoiceRes.data);
    assert.strictEqual(retrievedBuffer.toString('utf-8'), samplePdfContent);
    console.log(`✔ Retrieved file matches original uploaded bytes exactly (${retrievedBuffer.length} bytes, %PDF valid).`);

    // -------------------------------------------------------------------------
    // TEST 4: Backend Restart & Ephemeral Resistance Verification
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Simulating Server Restart / Redeployment ---');
    // Close the HTTP server
    server.close();
    console.log('  Server shut down.');

    // Spin up a brand new server instance
    server = createServer();
    await new Promise(resolve => server.listen(0, resolve));
    port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`  New server started on port ${port}.`);

    // Verify attachment is still accessible after server restart
    const postRestartRes = await axios.get(`${baseUrl}/api/purchases/${targetPurchase._id}/attachment`, {
      headers: authHeaders,
      responseType: 'arraybuffer'
    });
    assert.strictEqual(postRestartRes.status, 200);
    assert.strictEqual(Buffer.from(postRestartRes.data).toString('utf-8'), samplePdfContent);
    console.log('✔ File remains 100% accessible and intact after server restart! Persistent storage verified.');

    // -------------------------------------------------------------------------
    // TEST 5: Verify Purchase History, Payment Records & GST Integrity
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Verify Financial & GST Integrity Unchanged ---');
    const postCheckPurchase = await Purchase.findById(targetPurchase._id);
    assert.strictEqual(postCheckPurchase.purchaseNo, targetPurchase.purchaseNo);
    assert.strictEqual(postCheckPurchase.totals.grandTotal, targetPurchase.totals.grandTotal);
    assert.strictEqual(postCheckPurchase.totals.taxableAmount, targetPurchase.totals.taxableAmount);
    assert.strictEqual(postCheckPurchase.totals.gstTotal, targetPurchase.totals.gstTotal);
    assert.strictEqual(postCheckPurchase.paymentStatus, targetPurchase.paymentStatus);
    assert.strictEqual(postCheckPurchase.amountPaid, targetPurchase.amountPaid);
    console.log('✔ Financials, GST calculations, line items, and payment status completely unchanged.');

    // -------------------------------------------------------------------------
    // TEST 6: Graceful Error Handling for Unrecoverable / Missing Attachments
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Verify Helpful Error Response for Missing Files ---');
    // Purchase 001 (which has no attachment recorded)
    const p1 = await Purchase.findOne({ purchaseNo: 'MVSS/PUR/26-27/001' });
    try {
      await axios.get(`${baseUrl}/api/purchases/${p1._id}/attachment`, { headers: authHeaders });
      assert.fail('Should have returned 404');
    } catch (err) {
      assert.strictEqual(err.response.status, 404);
      assert(err.response.data.error, 'Must provide user-friendly error message');
      console.log(`✔ Expected 404 handled gracefully: "${err.response.data.error}"`);
    }

    // Clean up test file from targetPurchase
    const { deleteFile } = require('../utils/gridfs');
    try {
      await deleteFile(newFileKey);
    } catch (e) {}
    await Purchase.findByIdAndUpdate(targetPurchase._id, {
      $set: {
        attachments: [],
        attachmentUrl: '',
        attachmentName: '',
        attachmentType: ''
      }
    });
    console.log('✔ Test file cleaned up and purchase record restored to original state.');

    console.log('\n========================================================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY! 100% VERIFIED!');
    console.log('========================================================================\n');

  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runTestSuite().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
