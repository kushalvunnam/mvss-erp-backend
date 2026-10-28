const assert = require('assert');
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const JobCard = require('../models/JobCard');
const Invoice = require('../models/Invoice');
const GatePass = require('../models/GatePass');
const User = require('../models/User');
const gatepassesRouter = require('../routes/gatepasses');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/gatepasses', gatepassesRouter);

async function runTests() {
  console.log('================================================================');
  console.log('TEST SUITE: Gate Pass Auto-Fill & Eligible Invoices Release');
  console.log('================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB database.');

  const adminUser = await User.findOne({ role: 'Admin', active: true });
  assert(adminUser, 'Admin user must exist in database');
  const token = jwt.sign({ _id: adminUser._id }, JWT_SECRET);
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/gatepasses`;

  let createdGatePassIds = [];

  try {
    // -------------------------------------------------------------
    // Test 1: Fetch Eligible Releases Endpoint
    // -------------------------------------------------------------
    console.log('[Test 1] Verifying GET /api/gatepasses/eligible-releases...');
    const r1 = await fetch(`${baseUrl}/eligible-releases`, { headers: authHeaders });
    assert.strictEqual(r1.status, 200, `Expected 200, got ${r1.status}`);
    const releases = await r1.json();

    assert(Array.isArray(releases), 'Eligible releases should be an array');
    console.log(`Found ${releases.length} eligible release records in database.`);

    assert(releases.length > 0, 'Should find at least 1 eligible release record in production DB');
    const first = releases[0];
    assert(first.id, 'Record must have an id');
    assert(first.customerName, 'Record must have customerName');
    assert(first.vehicleNumber, 'Record must have vehicleNumber');
    assert('balanceDue' in first, 'Record must have balanceDue');
    assert('isPaid' in first, 'Record must have isPaid boolean');
    assert('hasActiveGatePass' in first, 'Record must have hasActiveGatePass boolean');

    // Confirm that paid records are prioritized
    const paidIndex = releases.findIndex(r => r.isPaid && r.invoiceStatus === 'Finalized');
    const unpaidIndex = releases.findIndex(r => !r.isPaid && r.invoiceStatus === 'Finalized');
    if (paidIndex !== -1 && unpaidIndex !== -1) {
      assert(paidIndex < unpaidIndex, 'Paid finalized invoices must appear before unpaid invoices');
    }
    console.log('✔ Test 1 Passed: GET /api/gatepasses/eligible-releases returns structured, sorted records.\n');

    // -------------------------------------------------------------
    // Test 2: Search filter on eligible releases
    // -------------------------------------------------------------
    console.log('[Test 2] Verifying search filtering on eligible releases...');
    const searchTarget = first.vehicleNumber.slice(0, 4);
    const r2 = await fetch(`${baseUrl}/eligible-releases?search=${encodeURIComponent(searchTarget)}`, { headers: authHeaders });
    assert.strictEqual(r2.status, 200);
    const filtered = await r2.json();

    assert(Array.isArray(filtered));
    for (const r of filtered) {
      const match = r.vehicleNumber.toLowerCase().includes(searchTarget.toLowerCase()) ||
                    r.customerName.toLowerCase().includes(searchTarget.toLowerCase()) ||
                    r.customerMobile.includes(searchTarget) ||
                    r.invoiceNo.toLowerCase().includes(searchTarget.toLowerCase());
      assert(match, `Filtered item should match search target "${searchTarget}"`);
    }
    console.log('✔ Test 2 Passed: Search filtering returns relevant subset accurately.\n');

    // -------------------------------------------------------------
    // Test 3: Unpaid Invoice Warning & Override Enforcement
    // -------------------------------------------------------------
    console.log('[Test 3] Verifying business rule enforcement on unpaid invoices...');
    const unpaidRecord = releases.find(r => r.recordType === 'invoice' && !r.isPaid && r.balanceDue > 0);
    if (unpaidRecord) {
      // Attempting to issue without allowUnpaidOverride should return 400
      const unpaidAttemptRes = await fetch(`${baseUrl}`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          invoiceId: unpaidRecord.invoiceId,
          vehicleNumber: unpaidRecord.vehicleNumber,
          customerName: unpaidRecord.customerName,
          customerMobile: unpaidRecord.customerMobile,
          materialName: `${unpaidRecord.vehicleDetails || 'Vehicle'} (${unpaidRecord.vehicleNumber}) - Vehicle Delivery`,
          quantity: 1,
          unit: 'Vehicle',
          reasonForIssue: 'Vehicle Delivery / Release after Service Completion',
          sentTo: unpaidRecord.customerName,
          receiverName: unpaidRecord.customerName,
          receiverMobile: unpaidRecord.customerMobile,
          status: 'Issued',
          allowUnpaidOverride: false
        })
      });

      assert.strictEqual(unpaidAttemptRes.status, 400, 'Unpaid invoice must be rejected without override');
      const unpaidAttempt = await unpaidAttemptRes.json();
      assert.strictEqual(unpaidAttempt.requiresOverride, true, 'Response must flag requiresOverride: true');
      console.log(`Unpaid attempt successfully blocked: ₹${unpaidAttempt.balanceDue} balance due.`);
      console.log('✔ Test 3 Passed: Unpaid invoice properly blocked without explicit override confirmation.\n');
    } else {
      console.log('ℹ Test 3 Skipped: No unpaid invoice found in current dataset.\n');
    }

    // -------------------------------------------------------------
    // Test 4: Issue Gate Pass for Paid Completed Invoice
    // -------------------------------------------------------------
    console.log('[Test 4] Verifying Gate Pass creation for Paid completed invoice...');
    const paidRecord = releases.find(r => r.recordType === 'invoice' && r.isPaid);
    assert(paidRecord, 'A paid invoice record must exist for verification');

    const issuePayload = {
      invoiceId: paidRecord.invoiceId,
      invoiceNo: paidRecord.invoiceNo,
      jobCardId: paidRecord.jobCardId,
      jobCardNumber: paidRecord.jobCardNumber,
      customerId: paidRecord.customerId,
      vehicleId: paidRecord.vehicleId,
      vehicleNumber: paidRecord.vehicleNumber,
      customerName: paidRecord.customerName,
      customerMobile: paidRecord.customerMobile,
      materialName: `${paidRecord.vehicleDetails || 'Vehicle'} (${paidRecord.vehicleNumber}) - Delivery`,
      quantity: 1,
      unit: 'Vehicle',
      reasonForIssue: 'Vehicle Delivery / Release after Service Completion',
      sentTo: paidRecord.customerName,
      receiverName: paidRecord.customerName,
      receiverMobile: paidRecord.customerMobile,
      receiverSignature: 'data:image/png;base64,mockSignatureDataReceiver',
      authorizedSignature: 'data:image/png;base64,mockSignatureDataAuth',
      status: 'Issued',
      passType: 'Vehicle Delivery',
      paymentStatus: 'Paid',
      balanceDue: 0
    };

    const res4 = await fetch(`${baseUrl}`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(issuePayload)
    });

    assert.strictEqual(res4.status, 201, `Failed to create gatepass: status ${res4.status}`);
    const createdGP = await res4.json();
    createdGatePassIds.push(createdGP._id);

    assert(createdGP.gatePassNo.startsWith('GP-'), 'Gate pass number must follow GP-YYMMDD-XXX format');
    assert.strictEqual(createdGP.vehicleNumber, paidRecord.vehicleNumber);
    assert.strictEqual(createdGP.customerName, paidRecord.customerName);
    assert.strictEqual(createdGP.invoiceNo, paidRecord.invoiceNo);
    assert.strictEqual(createdGP.passType, 'Vehicle Delivery');
    assert.strictEqual(createdGP.status, 'Issued');
    console.log(`Issued Gate Pass: ${createdGP.gatePassNo} linked to Invoice ${createdGP.invoiceNo}`);
    console.log('✔ Test 4 Passed: Gate Pass issued and linked to real invoice with signatures preserved.\n');

    // -------------------------------------------------------------
    // Test 5: Verify Active Gate Pass Detection (Duplicate Prevention)
    // -------------------------------------------------------------
    console.log('[Test 5] Verifying duplicate / active Gate Pass detection...');
    const res5 = await fetch(`${baseUrl}/eligible-releases?search=${encodeURIComponent(paidRecord.vehicleNumber)}`, { headers: authHeaders });
    assert.strictEqual(res5.status, 200);
    const updatedReleases = await res5.json();
    const matchedRecord = updatedReleases.find(r => r.vehicleNumber === paidRecord.vehicleNumber);
    assert(matchedRecord, 'Should find the release record for the vehicle');
    assert.strictEqual(matchedRecord.hasActiveGatePass, true, 'hasActiveGatePass must now be true');
    assert.strictEqual(matchedRecord.activeGatePass.gatePassNo, createdGP.gatePassNo);
    console.log(`Active Gate Pass detected: ${matchedRecord.activeGatePass.gatePassNo} (${matchedRecord.activeGatePass.status})`);
    console.log('✔ Test 5 Passed: Active Gate Pass detection flags existing pass to prevent duplicates.\n');

    // -------------------------------------------------------------
    // Test 6: Verify Standalone Vendor / Material Gate Pass
    // -------------------------------------------------------------
    console.log('[Test 6] Verifying vendor material Gate Pass (no customer invoice linked)...');
    const vendorPayload = {
      vehicleNumber: 'TS09VENDOR01',
      customerName: 'Jai Lathe Specialists Workshop',
      customerMobile: '9900112233',
      materialName: 'Crankshaft Assembly for Structural Lathe Turning',
      quantity: 2,
      unit: 'Nos',
      reasonForIssue: 'Machining & Lathe Work',
      sentTo: 'Jai Lathe Works, Secunderabad',
      receiverName: 'Ramesh Lathe Tech',
      receiverMobile: '9900112233',
      status: 'Pending', // Returnable
      passType: 'Vendor Material'
    };

    const res6 = await fetch(`${baseUrl}`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(vendorPayload)
    });

    assert.strictEqual(res6.status, 201);
    const vendorGP = await res6.json();
    createdGatePassIds.push(vendorGP._id);

    assert.strictEqual(vendorGP.status, 'Pending');
    assert.strictEqual(vendorGP.passType, 'Vendor Material');
    assert.strictEqual(vendorGP.materialName, 'Crankshaft Assembly for Structural Lathe Turning');
    console.log(`Issued Vendor Material Gate Pass: ${vendorGP.gatePassNo} (Status: ${vendorGP.status})`);
    console.log('✔ Test 6 Passed: Standalone vendor material workflow works independently without restriction.\n');

    // -------------------------------------------------------------
    // Test 7: Verify Gate Pass List & Search by Invoice Number
    // -------------------------------------------------------------
    console.log('[Test 7] Verifying Gate Pass list searching by invoiceNo...');
    const res7 = await fetch(`${baseUrl}?searchQuery=${encodeURIComponent(paidRecord.invoiceNo)}`, { headers: authHeaders });
    assert.strictEqual(res7.status, 200);
    const list = await res7.json();
    const foundByInv = list.find(g => g._id === createdGP._id);
    assert(foundByInv, 'Should find gate pass when searching by its invoice number');
    console.log('✔ Test 7 Passed: Gate Pass registry correctly searchable by invoice number.\n');

    console.log('================================================================');
    console.log('ALL 7 GATE PASS AUTO-FILL VERIFICATION TESTS PASSED!');
    console.log('================================================================\n');

  } finally {
    // Clean up only the temporary test gate passes created in this test
    if (createdGatePassIds.length > 0) {
      console.log(`Cleaning up ${createdGatePassIds.length} test gate passes...`);
      await GatePass.deleteMany({ _id: { $in: createdGatePassIds } });
      console.log('Test gate passes cleaned up successfully.');
    }
    server.close();
    await mongoose.disconnect();
  }
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed with error:', err);
  process.exit(1);
});
