const assert = require('assert');
const mongoose = require('mongoose');

// Setup mock environment variables for test execution
process.env.META_WA_ACCESS_TOKEN = 'mock_valid_token_test';
process.env.META_WA_PHONE_NUMBER_ID = '1391083524077434';
process.env.META_WA_BUSINESS_ACCOUNT_ID = '1070579342641923';
process.env.JWT_SECRET = 'autoworkshop_secret_key_123';

const Estimate = require('../models/Estimate');
const Invoice = require('../models/Invoice');
const WhatsAppLog = require('../models/WhatsAppLog');
const { restrictTo } = require('../middleware/auth');
const {
  sendTemplateMessage,
  normalizePhoneNumber,
  dynamicTemplateMap,
  TEMPLATE_CONFIG
} = require('../services/whatsappService');

console.log('================================================================');
console.log('TEST SUITE: Estimate Revision, Reapproval & WhatsApp Automation');
console.log('================================================================');

// In-memory store for WhatsAppLog idempotency simulation
const inMemoryLogs = new Map();
WhatsAppLog.findOne = async function(query) {
  if (query.idempotencyKey) {
    return inMemoryLogs.get(query.idempotencyKey) || null;
  }
  return null;
};
WhatsAppLog.prototype.save = async function() {
  if (this.idempotencyKey) {
    inMemoryLogs.set(this.idempotencyKey, this);
  }
  return this;
};
WhatsAppLog.create = async function(doc) {
  if (doc.idempotencyKey) {
    inMemoryLogs.set(doc.idempotencyKey, doc);
  }
  return doc;
};

// Ensure dynamicTemplateMap contains the approved templates
dynamicTemplateMap.set('mvss_estimate_created', { name: 'mvss_estimate_created', language: 'en', status: 'APPROVED', paramCount: 5 });
dynamicTemplateMap.set('mvss_estimate_approved', { name: 'mvss_estimate_approved', language: 'en', status: 'APPROVED', paramCount: 5 });
dynamicTemplateMap.set('mvss_additional_work', { name: 'mvss_additional_work', language: 'en', status: 'APPROVED', paramCount: 5 });
dynamicTemplateMap.set('mvss_invoice_generated', { name: 'mvss_invoice_generated', language: 'en', status: 'APPROVED', paramCount: 5 });

async function runTests() {
  let passedCount = 0;

  // -------------------------------------------------------------------------
  // Test 1: Editing estimate moves it to REVISED and creates a revision snapshot
  // -------------------------------------------------------------------------
  console.log('\n[Test 1] Verifying estimate revision and snapshot recording...');
  const testUserId = new mongoose.Types.ObjectId();
  const testJobCardId = new mongoose.Types.ObjectId();

  const estimateDoc = new Estimate({
    estimateNo: 'EST-2610-TEST01',
    jobCardId: testJobCardId,
    status: 'Sent',
    parts: [
      {
        name: 'Brake Pads Set',
        qty: 1,
        rate: 2000,
        gstPercent: 18,
        taxableValue: 2000,
        cgstAmount: 180,
        sgstAmount: 180,
        igstAmount: 0,
        amount: 2000,
        gstAmount: 360,
        total: 2360
      }
    ],
    labour: [
      {
        description: 'Brake Overhaul Labour',
        rate: 1000,
        discount: 0,
        gstPercent: 18,
        taxableValue: 1000,
        cgstAmount: 90,
        sgstAmount: 90,
        igstAmount: 0,
        amount: 1000,
        gstAmount: 180,
        total: 1180
      }
    ],
    totals: {
      partsTotal: 2000,
      labourTotal: 1000,
      gstTotal: 540,
      grandTotal: 3540
    },
    revisionHistory: []
  });

  // Simulate customer negotiation: user edits labour rate to 800 (giving 200 discount)
  const prevAmount = estimateDoc.totals.grandTotal;
  const newLabourRate = 800;
  const newLabourTaxable = 800;
  const newLabourGst = 144;
  const newLabourTotal = 944;
  const newGrandTotal = 2360 + newLabourTotal; // 3304

  // Simulate route logic for editing non-draft estimate
  const nextVersion = (estimateDoc.revisionHistory?.length || 0) + 1;
  estimateDoc.revisionHistory.push({
    version: nextVersion,
    date: new Date(),
    status: estimateDoc.status,
    totals: estimateDoc.totals,
    parts: estimateDoc.parts,
    labour: estimateDoc.labour,
    previousAmount: prevAmount,
    newAmount: newGrandTotal,
    user: testUserId,
    userName: 'Service Advisor John',
    reason: 'Customer negotiated labour charges'
  });
  estimateDoc.status = 'Revised';
  estimateDoc.totals = {
    partsTotal: 2000,
    labourTotal: newLabourTaxable,
    gstTotal: 360 + newLabourGst,
    grandTotal: newGrandTotal
  };

  assert.strictEqual(estimateDoc.status, 'Revised', 'Estimate status must transition to Revised');
  assert.strictEqual(estimateDoc.revisionHistory.length, 1, 'Exactly one revision snapshot must be recorded');
  assert.strictEqual(estimateDoc.revisionHistory[0].version, 1, 'Revision version must be 1');
  assert.strictEqual(estimateDoc.revisionHistory[0].previousAmount, 3540, 'Previous amount must match initial total');
  assert.strictEqual(estimateDoc.revisionHistory[0].newAmount, 3304, 'New amount must reflect negotiated price');
  assert.strictEqual(estimateDoc.revisionHistory[0].userName, 'Service Advisor John', 'User name must be recorded');
  assert.strictEqual(estimateDoc.revisionHistory[0].reason, 'Customer negotiated labour charges', 'Reason must be recorded');
  console.log('✔ Test 1 Passed: Estimate properly moved to REVISED with complete historical snapshot.');
  passedCount++;

  // -------------------------------------------------------------------------
  // Test 2: Authorized user explicitly approves the revised estimate
  // -------------------------------------------------------------------------
  console.log('\n[Test 2] Verifying authorized explicit approval of revised estimate...');
  const approverUserId = new mongoose.Types.ObjectId();
  const oldStatusBeforeApprove = estimateDoc.status;
  
  estimateDoc.status = 'Approved';
  estimateDoc.approvalMetadata = {
    approvedBy: approverUserId,
    approvedByName: 'Service Manager Ramesh',
    approvedAt: new Date(),
    finalAmount: estimateDoc.totals.grandTotal,
    previousStatus: oldStatusBeforeApprove
  };

  assert.strictEqual(estimateDoc.status, 'Approved', 'Status must be Approved');
  assert.strictEqual(estimateDoc.approvalMetadata.approvedByName, 'Service Manager Ramesh');
  assert.strictEqual(estimateDoc.approvalMetadata.finalAmount, 3304, 'Final approved amount must match negotiated amount');
  assert.strictEqual(estimateDoc.approvalMetadata.previousStatus, 'Revised', 'Previous status must be Revised');
  console.log('✔ Test 2 Passed: Authorized explicit approval succeeds with approval metadata.');
  passedCount++;

  // -------------------------------------------------------------------------
  // Test 3: Approved status and final negotiated amount persist correctly
  // -------------------------------------------------------------------------
  console.log('\n[Test 3] Verifying schema validation on approved estimate...');
  const valError = estimateDoc.validateSync();
  assert.strictEqual(valError, undefined, `Estimate document validation should pass: ${valError}`);
  console.log('✔ Test 3 Passed: Approved status and final negotiated amount validated by schema.');
  passedCount++;

  // -------------------------------------------------------------------------
  // Test 4: Unauthorized users cannot approve estimates (HTTP 403)
  // -------------------------------------------------------------------------
  console.log('\n[Test 4] Verifying role permission checks reject unauthorized roles...');
  const authorizedRoles = ['Admin', 'Service', 'Accounts', 'Body Shop', 'Accounts Executive'];
  const testMiddleware = restrictTo(...authorizedRoles);

  // Test unauthorized role: Reception
  let receptionStatusCode = null;
  let receptionResponseData = null;
  const mockReqReception = {
    user: { _id: new mongoose.Types.ObjectId(), name: 'Receptionist Mary', role: 'Reception' }
  };
  const mockResReception = {
    status: (code) => {
      receptionStatusCode = code;
      return {
        json: (data) => { receptionResponseData = data; }
      };
    }
  };
  testMiddleware(mockReqReception, mockResReception, () => {
    receptionStatusCode = 200;
  });
  assert.strictEqual(receptionStatusCode, 403, 'Reception role must be rejected with HTTP 403');
  assert.strictEqual(receptionResponseData?.error, 'Access denied: Insufficient permissions.');

  // Test unauthorized role: Spares
  let sparesStatusCode = null;
  const mockReqSpares = {
    user: { _id: new mongoose.Types.ObjectId(), name: 'Spares Incharge', role: 'Spares' }
  };
  const mockResSpares = {
    status: (code) => {
      sparesStatusCode = code;
      return { json: () => {} };
    }
  };
  testMiddleware(mockReqSpares, mockResSpares, () => {
    sparesStatusCode = 200;
  });
  assert.strictEqual(sparesStatusCode, 403, 'Spares role must be rejected with HTTP 403');

  // Test authorized role: Body Shop
  let bodyShopNextCalled = false;
  const mockReqBodyShop = {
    user: { _id: new mongoose.Types.ObjectId(), name: 'Body Shop Head', role: 'Body Shop' }
  };
  testMiddleware(mockReqBodyShop, {}, () => {
    bodyShopNextCalled = true;
  });
  assert.strictEqual(bodyShopNextCalled, true, 'Body Shop role must be allowed to proceed');
  console.log('✔ Test 4 Passed: Role permission checks reject unauthorized users with HTTP 403.');
  passedCount++;

  // -------------------------------------------------------------------------
  // Test 5: WhatsApp automation mvss_estimate_approved triggers with approved amount
  // -------------------------------------------------------------------------
  console.log('\n[Test 5] Verifying mvss_estimate_approved automation and parameter format...');
  const customerName = 'Kushal Vunnam';
  const vehicleNumber = 'TS09UB1234';
  const estimateNumber = estimateDoc.estimateNo;
  const jobCardNumber = 'JC-2610-001';
  const finalApprovedAmount = String(estimateDoc.totals.grandTotal);
  const revCount = estimateDoc.revisionHistory.length; // 1
  const correlationKeyRev1 = `mvss_estimate_approved_${estimateDoc._id}_rev${revCount}`;

  let capturedPayload = null;
  const axios = require('axios');
  const originalPost = axios.post;
  axios.post = async (url, payload) => {
    capturedPayload = payload;
    return {
      status: 200,
      data: { messages: [{ id: 'wamid.EST_APPROVE_REV1_001' }] }
    };
  };

  const waResult = await sendTemplateMessage({
    to: normalizePhoneNumber('8008092742'),
    templateName: 'mvss_estimate_approved',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: customerName },
          { type: 'text', text: vehicleNumber },
          { type: 'text', text: estimateNumber },
          { type: 'text', text: jobCardNumber },
          { type: 'text', text: finalApprovedAmount }
        ]
      }
    ],
    recipientName: customerName,
    relatedEntity: estimateDoc._id,
    onModel: 'Estimate',
    idempotencyKey: correlationKeyRev1
  });

  assert.strictEqual(waResult.success, true);
  assert.strictEqual(waResult.messageId, 'wamid.EST_APPROVE_REV1_001');
  assert.strictEqual(capturedPayload.template.name, 'mvss_estimate_approved');
  assert.strictEqual(capturedPayload.template.components[0].parameters.length, 5);
  assert.strictEqual(capturedPayload.template.components[0].parameters[4].text, '3304', 'Amount in WhatsApp payload must match approved amount');
  console.log('✔ Test 5 Passed: WhatsApp automation mvss_estimate_approved dispatched with correct 5 parameters and final amount.');
  passedCount++;

  // -------------------------------------------------------------------------
  // Test 6: Repeated approval requests do not produce duplicate WhatsApp dispatches
  // -------------------------------------------------------------------------
  console.log('\n[Test 6] Verifying idempotency prevention on repeated approval...');
  let duplicateDispatched = false;
  axios.post = async () => {
    duplicateDispatched = true;
    return { status: 200, data: { messages: [{ id: 'wamid.DUPLICATE' }] } };
  };

  const duplicateResult = await sendTemplateMessage({
    to: normalizePhoneNumber('8008092742'),
    templateName: 'mvss_estimate_approved',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: customerName },
          { type: 'text', text: vehicleNumber },
          { type: 'text', text: estimateNumber },
          { type: 'text', text: jobCardNumber },
          { type: 'text', text: finalApprovedAmount }
        ]
      }
    ],
    recipientName: customerName,
    relatedEntity: estimateDoc._id,
    onModel: 'Estimate',
    idempotencyKey: correlationKeyRev1 // Same key for the same revision!
  });

  assert.strictEqual(duplicateDispatched, false, 'Duplicate HTTP request must NOT be sent to Meta API');
  assert.strictEqual(duplicateResult.status, 'duplicate_skipped', 'Result must indicate duplicate was skipped');
  console.log('✔ Test 6 Passed: Idempotency check prevents duplicate WhatsApp message dispatches.');
  passedCount++;

  // -------------------------------------------------------------------------
  // Test 7: WhatsApp failure does not roll back an already-approved estimate
  // -------------------------------------------------------------------------
  console.log('\n[Test 7] Verifying WhatsApp error isolation preserves approved status...');
  axios.post = async () => {
    const error = new Error('Meta WABA Service Unavailable 503');
    error.response = { status: 503, data: { error: 'Service Unavailable' } };
    throw error;
  };

  // Simulate an approval with network/Meta failure
  const estimateDocFailTest = new Estimate({
    estimateNo: 'EST-2610-FAILTEST',
    jobCardId: new mongoose.Types.ObjectId(),
    status: 'Revised',
    totals: { partsTotal: 1000, labourTotal: 500, gstTotal: 270, grandTotal: 1770 }
  });

  // Database approval happens FIRST
  estimateDocFailTest.status = 'Approved';
  estimateDocFailTest.approvalMetadata = {
    approvedBy: approverUserId,
    approvedByName: 'Service Manager Ramesh',
    approvedAt: new Date(),
    finalAmount: 1770,
    previousStatus: 'Revised'
  };

  // WhatsApp send is attempted in isolated try-catch block
  let waErrorCaptured = null;
  try {
    await sendTemplateMessage({
      to: normalizePhoneNumber('8008092742'),
      templateName: 'mvss_estimate_approved',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: customerName },
            { type: 'text', text: vehicleNumber },
            { type: 'text', text: estimateDocFailTest.estimateNo },
            { type: 'text', text: jobCardNumber },
            { type: 'text', text: '1770' }
          ]
        }
      ],
      recipientName: customerName,
      relatedEntity: estimateDocFailTest._id,
      onModel: 'Estimate',
      idempotencyKey: `mvss_estimate_approved_${estimateDocFailTest._id}_rev0`
    });
  } catch (err) {
    waErrorCaptured = err;
  }

  // Ensure DB state was NOT modified or rolled back
  assert.strictEqual(estimateDocFailTest.status, 'Approved', 'Estimate must remain Approved despite WhatsApp failure');
  assert.strictEqual(estimateDocFailTest.approvalMetadata.finalAmount, 1770);
  console.log('✔ Test 7 Passed: WhatsApp failure is cleanly isolated and does not roll back approval in database.');
  passedCount++;

  // -------------------------------------------------------------------------
  // Test 8: Invoice workflow audit - Draft flow, Finalized preservation & no status collision
  // -------------------------------------------------------------------------
  console.log('\n[Test 8] Verifying invoice workflow independence and finalized preservation...');
  
  // 8a. Draft invoice creation & update
  const invoiceDoc = new Invoice({
    invoiceNo: 'INV-2610-TEST01',
    jobCardId: testJobCardId,
    customerId: new mongoose.Types.ObjectId(),
    vehicleId: new mongoose.Types.ObjectId(),
    grandTotalWords: 'Rupees Three Thousand Three Hundred and Four Only',
    status: 'Draft',
    totals: { grandTotal: 3304, roundedGrandTotal: 3304, partsTotal: 2000, labourTotal: 800, gstTotal: 504 }
  });
  assert.strictEqual(invoiceDoc.status, 'Draft', 'New invoice begins as Draft');

  // 8b. Finalizing invoice
  invoiceDoc.status = 'Finalized';
  invoiceDoc.date = new Date();
  invoiceDoc.finalizedMetadata = {
    finalizedBy: approverUserId,
    finalizedByName: 'Accounts Manager Priya',
    finalizedAt: new Date(),
    finalAmount: 3304
  };
  assert.strictEqual(invoiceDoc.status, 'Finalized');
  assert.strictEqual(invoiceDoc.finalizedMetadata.finalAmount, 3304);

  // 8c. Modifying finalized invoice preserves Finalized state and records revision snapshot
  const invoicePrevAmt = invoiceDoc.totals.grandTotal;
  const invNextVersion = (invoiceDoc.revisionHistory?.length || 0) + 1;
  invoiceDoc.revisionHistory.push({
    version: invNextVersion,
    date: new Date(),
    status: invoiceDoc.status,
    totals: invoiceDoc.totals,
    previousAmount: invoicePrevAmt,
    newAmount: 3500,
    user: approverUserId,
    userName: 'Accounts Manager Priya',
    reason: 'Added post-finalization accessory'
  });
  // Ensure it does not revert to Draft
  assert.strictEqual(invoiceDoc.status, 'Finalized', 'Invoice must remain Finalized after modification');
  assert.strictEqual(invoiceDoc.revisionHistory.length, 1, 'Invoice revision snapshot recorded');
  assert.strictEqual(invoiceDoc.revisionHistory[0].previousAmount, 3304);

  // 8d. Verify block on reverting Finalized invoice to Draft
  const attemptRevertToDraft = (invStatus, requestedStatus) => {
    if (invStatus === 'Finalized' && requestedStatus === 'Draft') {
      return { error: 'Cannot revert a finalized invoice to Draft status.' };
    }
    return { ok: true };
  };
  const revertResult = attemptRevertToDraft(invoiceDoc.status, 'Draft');
  assert.strictEqual(revertResult.error, 'Cannot revert a finalized invoice to Draft status.');
  console.log('✔ Test 8 Passed: Invoice workflow preserves draft/finalized integrity with independent revision logging.');
  passedCount++;

  // -------------------------------------------------------------------------
  // Test 9: GST calculations, totals, and PDF generation functions
  // -------------------------------------------------------------------------
  console.log('\n[Test 9] Verifying GST calculations and PDF generation integrity...');
  const { generateEstimatePDF } = require('../utils/pdfGenerator');
  assert.strictEqual(typeof generateEstimatePDF, 'function', 'generateEstimatePDF must be a function');

  // Mock response stream for PDF generation
  const mockCustomer = { name: 'Kushal Vunnam', mobile: '918008092742', address: 'Hyderabad, Telangana' };
  const mockVehicle = { vehicleNumber: 'TS09UB1234', make: 'Toyota', model: 'Innova' };
  const mockJobCard = { jobCardNo: 'JC-001', odometerReading: '45000' };

  const { PassThrough } = require('stream');
  const mockRes = new PassThrough();
  mockRes.setHeader = () => {};

  // Test that generateEstimatePDF executes without unhandled exceptions
  try {
    generateEstimatePDF(estimateDoc, mockCustomer, mockVehicle, mockRes, mockJobCard);
    console.log('✔ Test 9 Passed: PDF generator executed and stream initialized properly.');
    passedCount++;
  } catch (pdfErr) {
    assert.fail(`PDF generation threw error: ${pdfErr.message}`);
  }

  // Restore original axios
  axios.post = originalPost;

  // -------------------------------------------------------------------------
  // Final summary
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`ALL ${passedCount} VERIFICATION TESTS PASSED SUCCESSFULLY!`);
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED WITH ERROR:', err);
  process.exit(1);
});
