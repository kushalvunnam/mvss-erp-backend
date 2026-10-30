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
const purchasesRouter = require('../routes/purchases');
const { fileExists, downloadFileStream } = require('../utils/gridfs');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/purchases', purchasesRouter);
  return http.createServer(app);
}

async function runTest() {
  console.log('========================================================================');
  console.log('TEST SUITE: Purchase Invoice Upload Fix for MVSS/PUR/26-27/080');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✔ Connected to MongoDB Atlas.');

  let adminUser = await User.findOne({ role: { $in: ['Admin', 'Super Admin', 'Store', 'Store User'] }, active: true });
  if (!adminUser) adminUser = await User.findOne({ active: true });
  assert(adminUser, 'Active user required for auth');

  const token = jwt.sign({ _id: adminUser._id, role: adminUser.role, name: adminUser.name }, JWT_SECRET);
  const authHeaders = {
    'Authorization': `Bearer ${token}`
  };

  const server = createServer();
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Inspect Purchase Record MVSS/PUR/26-27/080
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Inspect Purchase Record MVSS/PUR/26-27/080 ---');
    const p80 = await Purchase.findOne({ purchaseNo: 'MVSS/PUR/26-27/080' });
    assert(p80, 'Purchase MVSS/PUR/26-27/080 must exist');
    console.log(`Found Purchase: ${p80.purchaseNo}, Vendor: ${p80.vendorName}, Invoice: ${p80.invoiceNo}`);
    console.log(`Items count: ${p80.items?.length}, Grand Total: ₹${p80.grandTotal}`);
    const initialPurchaseCount = await Purchase.countDocuments();
    console.log(`Total purchase records in database: ${initialPurchaseCount}`);

    // Backup current attachment info
    const originalAttachments = p80.attachments ? [...p80.attachments] : [];
    const originalAttachmentUrl = p80.attachmentUrl;
    const originalAttachmentName = p80.attachmentName;
    const originalAttachmentType = p80.attachmentType;

    // -------------------------------------------------------------------------
    // TEST 2: Upload PDF Invoice to MVSS/PUR/26-27/080
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Upload PDF Invoice to MVSS/PUR/26-27/080 ---');
    const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF', 'utf-8');

    const pdfForm = new FormData();
    pdfForm.append('attachment', pdfBuffer, {
      filename: 'JB_Auto_Parts_Invoice_6976.pdf',
      contentType: 'application/pdf'
    });

    const pdfUploadRes = await axios.post(
      `${baseUrl}/api/purchases/${p80._id}/reupload-attachment`,
      pdfForm,
      {
        headers: {
          ...authHeaders,
          ...pdfForm.getHeaders()
        }
      }
    );

    assert.strictEqual(pdfUploadRes.status, 200, 'Upload must return HTTP 200');
    assert.strictEqual(pdfUploadRes.data.success, true, 'Response must have success: true');
    assert.strictEqual(pdfUploadRes.data.message, 'Invoice uploaded successfully', 'Response message must match');
    assert(pdfUploadRes.data.attachment, 'Response must have attachment object');
    assert(pdfUploadRes.data.attachment.url, 'Attachment must have url');
    assert.strictEqual(pdfUploadRes.data.attachment.filename, 'JB_Auto_Parts_Invoice_6976.pdf');
    assert.strictEqual(pdfUploadRes.data.attachment.mimeType, 'application/pdf');
    assert(pdfUploadRes.data.purchase, 'Response must return updated purchase');

    const pdfFileKey = pdfUploadRes.data.attachment.key;
    console.log(`✔ PDF Upload succeeded. GridFS File Key: ${pdfFileKey}`);
    console.log(`✔ Response:`, JSON.stringify(pdfUploadRes.data.attachment, null, 2));

    // Verify file exists in GridFS
    const gridFilePdf = await fileExists(pdfFileKey);
    assert(gridFilePdf, 'File must exist in GridFS persistent bucket');
    assert.strictEqual(gridFilePdf.contentType, 'application/pdf');
    console.log(`✔ GridFS verification: File found, size: ${gridFilePdf.length} bytes, contentType: ${gridFilePdf.contentType}`);

    // Verify stream download
    const pdfDownloadRes = await axios.get(`${baseUrl}/api/purchases/${p80._id}/attachment`, {
      headers: authHeaders,
      responseType: 'arraybuffer'
    });
    assert.strictEqual(pdfDownloadRes.status, 200);
    assert.strictEqual(pdfDownloadRes.headers['content-type'], 'application/pdf');
    assert.strictEqual(pdfDownloadRes.data.length, pdfBuffer.length);
    console.log(`✔ Stream download verified: ${pdfDownloadRes.data.length} bytes received with Content-Type application/pdf`);

    // -------------------------------------------------------------------------
    // TEST 3: Replace with PNG Invoice to Test Replacement & Non-Duplication
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Replace with PNG Invoice (Verify Non-Duplication) ---');
    // 1x1 transparent PNG buffer
    const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

    const pngForm = new FormData();
    pngForm.append('attachment', pngBuffer, {
      filename: 'JB_Auto_Parts_Invoice_6976.png',
      contentType: 'image/png'
    });

    const pngUploadRes = await axios.post(
      `${baseUrl}/api/purchases/${p80._id}/reupload-attachment`,
      pngForm,
      {
        headers: {
          ...authHeaders,
          ...pngForm.getHeaders()
        }
      }
    );

    assert.strictEqual(pngUploadRes.status, 200);
    assert.strictEqual(pngUploadRes.data.success, true);
    assert.strictEqual(pngUploadRes.data.attachment.filename, 'JB_Auto_Parts_Invoice_6976.png');
    assert.strictEqual(pngUploadRes.data.attachment.mimeType, 'image/png');

    const pngFileKey = pngUploadRes.data.attachment.key;
    console.log(`✔ PNG Replace succeeded. New GridFS Key: ${pngFileKey}`);

    // Verify DB purchase record has exactly 1 attachment (no duplicates!)
    const updatedP80 = await Purchase.findById(p80._id);
    assert.strictEqual(updatedP80.attachments.length, 1, 'Attachments array must contain exactly 1 attachment');
    assert.strictEqual(updatedP80.attachments[0].key, pngFileKey);
    assert.strictEqual(updatedP80.attachmentUrl, `/api/purchases/attachment/${pngFileKey}`);
    assert.strictEqual(updatedP80.items.length, 9, 'Items count must remain 9');

    // Verify total purchase count in database did not change (no duplicate purchase entries!)
    const currentPurchaseCount = await Purchase.countDocuments();
    assert.strictEqual(currentPurchaseCount, initialPurchaseCount, 'No duplicate purchase documents should be created');
    console.log(`✔ Verified: Attachments array length is 1, total purchase count unchanged (${currentPurchaseCount})`);

    // -------------------------------------------------------------------------
    // TEST 4: Replace with JPG Invoice
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Replace with JPG Invoice ---');
    const jpgBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9]);
    const jpgForm = new FormData();
    jpgForm.append('attachment', jpgBuffer, {
      filename: 'JB_Auto_Parts_Invoice_6976.jpg',
      contentType: 'image/jpeg'
    });

    const jpgUploadRes = await axios.post(
      `${baseUrl}/api/purchases/${p80._id}/reupload-attachment`,
      jpgForm,
      {
        headers: {
          ...authHeaders,
          ...jpgForm.getHeaders()
        }
      }
    );

    assert.strictEqual(jpgUploadRes.status, 200);
    assert.strictEqual(jpgUploadRes.data.success, true);
    assert.strictEqual(jpgUploadRes.data.attachment.filename, 'JB_Auto_Parts_Invoice_6976.jpg');
    assert.strictEqual(jpgUploadRes.data.attachment.mimeType, 'image/jpeg');
    console.log(`✔ JPG Upload succeeded: Key ${jpgUploadRes.data.attachment.key}`);

    // -------------------------------------------------------------------------
    // TEST 5: Error Handling for Unsupported File Types (.txt)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Error Handling for Unsupported File Type ---');
    const textBuffer = Buffer.from('This is a text file, not an invoice', 'utf-8');
    const textForm = new FormData();
    textForm.append('attachment', textBuffer, {
      filename: 'invoice.txt',
      contentType: 'text/plain'
    });

    try {
      await axios.post(
        `${baseUrl}/api/purchases/${p80._id}/reupload-attachment`,
        textForm,
        {
          headers: {
            ...authHeaders,
            ...textForm.getHeaders()
          }
        }
      );
      assert.fail('Should have failed with 400 for text/plain');
    } catch (err) {
      assert.strictEqual(err.response.status, 400);
      assert.strictEqual(err.response.data.success, false);
      assert(err.response.data.error.includes('Only JPG, JPEG, PNG, WEBP, and PDF files are allowed'));
      console.log(`✔ Unsupported file format rejected properly with HTTP 400: "${err.response.data.error}"`);
    }

    // -------------------------------------------------------------------------
    // TEST 6: Error Handling for No File
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Error Handling for No File ---');
    const noFileForm = new FormData();
    noFileForm.append('notes', 'no file here');
    try {
      await axios.post(
        `${baseUrl}/api/purchases/${p80._id}/reupload-attachment`,
        noFileForm,
        {
          headers: {
            ...authHeaders,
            ...noFileForm.getHeaders()
          }
        }
      );
      assert.fail('Should have failed with 400 for form with no file');
    } catch (err) {
      assert.strictEqual(err.response.status, 400);
      assert.strictEqual(err.response.data.success, false);
      assert(err.response.data.error.includes('No file uploaded'));
      console.log(`✔ Missing file rejected properly with HTTP 400: "${err.response.data.error}"`);
    }

    // -------------------------------------------------------------------------
    // TEST 7: Query Token Authentication Verification (Browser View Mode)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Query Token Authentication Verification ---');
    const queryTokenRes = await axios.get(`${baseUrl}/api/purchases/${p80._id}/attachment?token=${token}`, {
      responseType: 'arraybuffer'
    });
    assert.strictEqual(queryTokenRes.status, 200);
    assert.strictEqual(queryTokenRes.headers['content-type'], 'image/jpeg');
    console.log('✔ Query token authentication for new browser tab access verified: 200 OK');

    console.log('\n========================================================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY (7/7)!');
    console.log('========================================================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runTest().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
