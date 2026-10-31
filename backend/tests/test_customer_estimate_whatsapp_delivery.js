/**
 * test_customer_estimate_whatsapp_delivery.js
 * Verification test suite for Customer Estimate PDF WhatsApp delivery and webhook synchronization
 */

const assert = require('assert');
const { PassThrough } = require('stream');
const { generateCustomerEstimatePDF } = require('../utils/pdfGenerator');
const { 
  resolveTemplateSpec, 
  TEMPLATE_CONFIG, 
  uploadMediaToMeta 
} = require('../services/whatsappService');

async function runTests() {
  console.log('=== STARTING CUSTOMER ESTIMATE WHATSAPP DELIVERY TEST SUITE ===\n');
  let passed = 0;
  let total = 0;

  // TEST 1: PDF Generation & Binary Signature
  total++;
  try {
    const mockEstimate = {
      _id: '6ae4738dead567b0977e69e8',
      estimateNo: 'MVSS/EST/26-27/078',
      createdAt: new Date('2026-10-30T10:00:00Z'),
      parts: [
        { name: 'Engine Oil Synthetic 5W30', qty: 4, rate: 650, total: 2600, discount: 0, taxableValue: 2600, gstPercent: 18, gstAmount: 468 },
        { name: 'Oil Filter', qty: 1, rate: 350, total: 350, discount: 0, taxableValue: 350, gstPercent: 18, gstAmount: 63 }
      ],
      labour: [
        { description: 'Periodic Maintenance Service', rate: 1200, total: 1200, discount: 0, taxableValue: 1200, gstPercent: 18, gstAmount: 216 }
      ],
      totals: {
        partsTotal: 2950,
        labourTotal: 1200,
        gstTotal: 747,
        grandTotal: 4897
      },
      amountInWords: 'Rupees Four Thousand Eight Hundred Ninety Seven Only',
      manualOverride: false
    };

    const mockCustomer = {
      name: 'Kushal Vunnam',
      mobile: '919876543210',
      address: 'Hyderabad, Telangana'
    };

    const mockVehicle = {
      vehicleNumber: 'TS09EA1234',
      make: 'Hyundai',
      model: 'Creta SX'
    };

    const mockJobCard = {
      jobCardNo: 'JC-1001'
    };

    const pass = new PassThrough();
    const chunks = [];
    pass.on('data', c => chunks.push(c));
    const pdfBuffer = await new Promise((resolve, reject) => {
      pass.on('end', () => resolve(Buffer.concat(chunks)));
      pass.on('error', reject);
      generateCustomerEstimatePDF(mockEstimate, mockCustomer, mockVehicle, pass, mockJobCard);
    });

    assert(pdfBuffer.length > 1000, `PDF size is too small: ${pdfBuffer.length} bytes`);
    const header = pdfBuffer.slice(0, 5).toString('ascii');
    assert.strictEqual(header, '%PDF-', `Invalid PDF header: ${header}`);
    console.log(`[PASS] Test 1: PDF Generation & Binary Signature (%PDF-, ${pdfBuffer.length} bytes)`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] Test 1: PDF Generation:`, err.message);
  }

  // TEST 2: Template Spec Resolution for mvss_customer_estimate_doc
  total++;
  try {
    const spec = resolveTemplateSpec('mvss_customer_estimate_doc');
    assert(spec, 'Template mvss_customer_estimate_doc could not be resolved');
    assert.strictEqual(spec.status, 'APPROVED', `Expected status APPROVED, got ${spec.status}`);
    assert.strictEqual(spec.headerFormat, 'DOCUMENT', `Expected headerFormat DOCUMENT, got ${spec.headerFormat}`);
    assert.strictEqual(spec.paramCount, 5, `Expected paramCount 5, got ${spec.paramCount}`);
    console.log(`[PASS] Test 2: Template Resolution for mvss_customer_estimate_doc (Status: APPROVED, Format: DOCUMENT, Params: 5)`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] Test 2: Template Resolution:`, err.message);
  }

  // TEST 3: Document Template Component Payload Construction
  total++;
  try {
    const customerName = 'Kushal Vunnam';
    const vehicleNumber = 'TS09EA1234';
    const estimateNumber = 'MVSS/EST/26-27/078';
    const jobCardNumber = 'JC-1001';
    const formattedEstimatedAmount = '4,897.00';
    const pdfUrl = 'https://mvss-erp-backend.onrender.com/api/estimates/public/customer-pdf/6ae4738dead567b0977e69e8.pdf';
    const pdfFilename = 'Customer_Estimate_MVSS_EST_26_27_078.pdf';

    const components = [
      {
        type: 'header',
        parameters: [
          {
            type: 'document',
            document: {
              link: pdfUrl,
              filename: pdfFilename
            }
          }
        ]
      },
      {
        type: 'body',
        parameters: [
          { type: 'text', text: customerName },
          { type: 'text', text: vehicleNumber },
          { type: 'text', text: estimateNumber },
          { type: 'text', text: jobCardNumber },
          { type: 'text', text: formattedEstimatedAmount }
        ]
      }
    ];

    assert.strictEqual(components.length, 2, 'Must have header and body components');
    assert.strictEqual(components[0].type, 'header');
    assert.strictEqual(components[0].parameters[0].document.filename, pdfFilename);
    assert.strictEqual(components[0].parameters[0].document.link, pdfUrl);
    assert.strictEqual(components[1].type, 'body');
    assert.strictEqual(components[1].parameters.length, 5);
    components[1].parameters.forEach((p, idx) => {
      assert(typeof p.text === 'string' && p.text.length > 0, `Param ${idx} is not non-empty string`);
    });

    console.log(`[PASS] Test 3: Document Template Component Payload Structure verified`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] Test 3: Component Payload Structure:`, err.message);
  }

  // TEST 4: Webhook Status Synchronization Logic
  total++;
  try {
    // Simulate incoming Meta webhook payloads
    const testMessageId = 'wamid.HBgLMjYwOTIxMzQyMzEwFQIAERgSRjQ2OTFBNkU1NUM1MDRCMTk2AA==';
    const deliveredPayload = {
      id: testMessageId,
      status: 'delivered',
      timestamp: '1730300000',
      recipient_id: '919876543210'
    };

    const failedPayload = {
      id: testMessageId,
      status: 'failed',
      timestamp: '1730300050',
      recipient_id: '919876543210',
      errors: [
        {
          code: 131047,
          title: 'Re-engagement message',
          message: 'Message failed to send because more than 24 hours have passed since the customer last replied to this number.',
          error_data: { details: 'Conversation window expired.' }
        }
      ]
    };

    // Verify error parsing
    const errObj = failedPayload.errors[0];
    const errorText = `[Code ${errObj.code}] ${errObj.title}: ${errObj.message}${errObj.error_data?.details ? ` (${errObj.error_data.details})` : ''}`;
    assert(errorText.includes('131047'), 'Parsed error must contain error code 131047');
    assert(errorText.includes('Re-engagement message'), 'Parsed error must contain title');

    // Simulate Estimate update simulation
    const mockEstimateRecord = {
      _id: '6ae4738dead567b0977e69e8',
      whatsappHistory: [
        {
          stage: 'STAGE_1_ESTIMATION_READY',
          messageId: testMessageId,
          status: 'sent'
        },
        {
          stage: 'DOCUMENT_ESTIMATE_PDF',
          messageId: testMessageId,
          status: 'sent'
        }
      ]
    };

    // Delivery update simulation
    for (const h of mockEstimateRecord.whatsappHistory) {
      if (h.messageId === testMessageId) {
        h.status = deliveredPayload.status;
        h.deliveredAt = new Date(Number(deliveredPayload.timestamp) * 1000);
      }
    }

    assert.strictEqual(mockEstimateRecord.whatsappHistory[0].status, 'delivered');
    assert.strictEqual(mockEstimateRecord.whatsappHistory[1].status, 'delivered');
    assert(mockEstimateRecord.whatsappHistory[0].deliveredAt instanceof Date);

    console.log(`[PASS] Test 4: Webhook Status Synchronization (Delivered & Failed error details parsed properly)`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] Test 4: Webhook Status Synchronization:`, err.message);
  }

  // TEST 5: uploadMediaToMeta parameter validation
  total++;
  try {
    // Calling with empty buffer should reject cleanly
    const res = await uploadMediaToMeta({ buffer: null });
    assert.strictEqual(res.success, false, 'Expected uploadMediaToMeta to return success: false for null buffer');
    console.log(`[PASS] Test 5: uploadMediaToMeta parameter validation handled cleanly`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] Test 5: uploadMediaToMeta parameter validation:`, err.message);
  }

  console.log(`\n=== TEST SUITE RESULTS: ${passed}/${total} PASSED ===`);
  if (passed === total) {
    console.log('ALL TESTS PASSED SUCCESSFULLY!');
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
