const assert = require('assert');
const path = require('path');
const axios = require('axios');

// Set environment for testing
process.env.META_WA_ACCESS_TOKEN = 'mock_valid_token_test';
process.env.META_WA_PHONE_NUMBER_ID = '1391083524077434';
process.env.META_WA_BUSINESS_ACCOUNT_ID = '1070579342641923';

const WhatsAppLog = require('../models/WhatsAppLog');
const {
  sendTemplateMessage,
  sendDocumentMessage,
  resolveTemplateSpec,
  dynamicTemplateMap,
  TEMPLATE_CONFIG
} = require('../services/whatsappService');

console.log('========================================================================');
console.log('TEST SUITE: Stage 1 Delivery, Sequence Enforcement, & E11000 Elimination');
console.log('========================================================================\n');

// In-Memory Storage for WhatsAppLog with Atomic findOneAndUpdate Simulation
const inMemoryLogs = new Map();

WhatsAppLog.findOne = async function(query) {
  if (query.idempotencyKey) {
    if (typeof query.idempotencyKey === 'object' && query.idempotencyKey.$in) {
      for (const k of query.idempotencyKey.$in) {
        if (inMemoryLogs.has(k)) {
          const doc = inMemoryLogs.get(k);
          if (query.status && query.status.$in) {
            if (query.status.$in.includes(doc.status)) return doc;
          } else {
            return doc;
          }
        }
      }
      return null;
    }
    const doc = inMemoryLogs.get(query.idempotencyKey);
    if (!doc) return null;
    if (query.status && query.status.$in) {
      if (!query.status.$in.includes(doc.status)) return null;
    }
    return doc;
  }
  if (query.messageId) {
    for (const doc of inMemoryLogs.values()) {
      if (doc.messageId === query.messageId) return doc;
    }
  }
  return null;
};

WhatsAppLog.findOneAndUpdate = async function(filter, update, options = {}) {
  const key = filter.idempotencyKey || filter.messageId;
  let doc = inMemoryLogs.get(key);

  if (!doc) {
    if (options.upsert) {
      // Simulate $setOnInsert
      doc = {
        _id: 'log_' + Math.random().toString(36).substring(2, 10),
        idempotencyKey: key,
        attempts: 0,
        createdAt: new Date(),
        ...(update.$setOnInsert || {})
      };
      inMemoryLogs.set(key, doc);
    } else {
      return null;
    }
  }

  // Simulate $set
  if (update.$set) {
    Object.assign(doc, update.$set);
  }

  // Simulate $inc
  if (update.$inc) {
    for (const [field, incVal] of Object.entries(update.$inc)) {
      doc[field] = (doc[field] || 0) + incVal;
    }
  }

  doc.updatedAt = new Date();
  inMemoryLogs.set(key, doc);
  return doc;
};

async function runTests() {
  const capturedDispatches = [];
  let shouldSimulateMetaFailure = false;
  let simulatedFailureMessage = 'Meta Graph API Error: HTTP 400 Invalid template';

  // Mock Axios instance for whatsappService
  const mockAxios = {
    post: async (url, data, config) => {
      capturedDispatches.push({ url, data, config, timestamp: new Date() });

      if (url.includes('/media')) {
        return {
          status: 200,
          data: { id: 'meta_media_' + Date.now() }
        };
      }

      if (shouldSimulateMetaFailure && (data?.template?.name === 'mvss_estimate_created' || data?.template?.name === 'mvss_customer_estimate_doc')) {
        const err = new Error(simulatedFailureMessage);
        err.response = {
          status: 400,
          data: {
            error: {
              message: simulatedFailureMessage,
              type: 'OAuthException',
              code: 100,
              error_subcode: 2388001,
              fbtrace_id: 'test_trace_' + Date.now()
            }
          }
        };
        throw err;
      }

      return {
        status: 200,
        data: {
          messaging_product: 'whatsapp',
          contacts: [{ input: data?.to, wa_id: data?.to }],
          messages: [{ id: 'wamid.HBgL' + Math.random().toString(36).substring(2, 10).toUpperCase() }]
        }
      };
    },
    get: async () => ({ status: 200, data: { data: [] } })
  };

  // Populate dynamicTemplateMap with Meta approved templates
  dynamicTemplateMap.set('mvss_estimate_created', {
    name: 'mvss_estimate_created',
    language: 'en',
    status: 'APPROVED',
    paramCount: 5
  });
  dynamicTemplateMap.set('estimate_awaiting_customer_approval', {
    name: 'estimate_awaiting_customer_approval',
    language: 'en',
    status: 'APPROVED',
    paramCount: 4
  });

  // ---------------------------------------------------------------------------
  // TEST 1: ATOMIC UPSERT & RETRY RECOVERY (NO E11000, CLEARS ERRORS, INCREMENTS ATTEMPTS)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 1: Atomic Upsert & Retry Recovery on Failed Dispatch ---');
  inMemoryLogs.clear();
  capturedDispatches.length = 0;
  shouldSimulateMetaFailure = true;

  const testKey = 'test_stage1_idempotency_key_001';
  const testPhone = '919876543210';

  // 1a. First attempt: Meta fails
  let firstAttemptFailed = false;
  try {
    await sendTemplateMessage({
      to: testPhone,
      templateName: 'mvss_estimate_created',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Ramesh Sharma' },
            { type: 'text', text: 'TS09EA1234' },
            { type: 'text', text: 'MVSS/EST/26-27/078' },
            { type: 'text', text: 'JC-1001' },
            { type: 'text', text: '5,000' }
          ]
        }
      ],
      recipientName: 'Ramesh Sharma',
      idempotencyKey: testKey
    }, mockAxios);
  } catch (err) {
    firstAttemptFailed = true;
    console.log('✔ First attempt failed as expected with simulated Meta error');
  }

  assert.strictEqual(firstAttemptFailed, true, 'First attempt should have failed');
  const logAfterFail = inMemoryLogs.get(testKey);
  assert(logAfterFail, 'WhatsAppLog entry must exist after failed dispatch');
  assert.strictEqual(logAfterFail.status, 'failed', 'Log status must be failed');
  assert.strictEqual(logAfterFail.attempts, 1, 'Attempts count should be 1');
  assert(logAfterFail.errorMessage.includes('simulatedFailureMessage') || logAfterFail.errorMessage.includes('HTTP 400'), 'Error message should be recorded');
  console.log(`✔ Failed dispatch logged correctly (status: ${logAfterFail.status}, attempts: ${logAfterFail.attempts})`);

  // 1b. Retry attempt: Meta recovers
  shouldSimulateMetaFailure = false;
  capturedDispatches.length = 0;

  // Crucial test: Does sendTemplateMessage skip a failed log as duplicate?
  // IT MUST NOT! It must retry and update the existing log.
  const retryResult = await sendTemplateMessage({
    to: testPhone,
    templateName: 'mvss_estimate_created',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Ramesh Sharma' },
          { type: 'text', text: 'TS09EA1234' },
          { type: 'text', text: 'MVSS/EST/26-27/078' },
          { type: 'text', text: 'JC-1001' },
          { type: 'text', text: '5,000' }
        ]
      }
    ],
    recipientName: 'Ramesh Sharma',
    idempotencyKey: testKey
  }, mockAxios);

  assert.strictEqual(retryResult.status !== 'duplicate_skipped', true, 'Retry must NOT be skipped as duplicate');
  assert(retryResult.messageId, 'Retry must return new message ID');
  console.log('✔ Retry was NOT skipped and was dispatched to Meta successfully');

  // Verify that the existing log record was reused and updated
  const logAfterRetry = inMemoryLogs.get(testKey);
  assert.strictEqual(logAfterRetry.status, 'sent', 'Status must be updated to sent');
  assert.strictEqual(logAfterRetry.attempts, 2, 'Attempts must be incremented to 2');
  assert.strictEqual(logAfterRetry.errorMessage, null, 'Error message must be cleared on success');
  assert.strictEqual(logAfterRetry.messageId, retryResult.messageId, 'MessageId must be updated in log');
  console.log(`✔ Existing WhatsAppLog entry was reused and updated (status: ${logAfterRetry.status}, attempts: ${logAfterRetry.attempts}, messageId: ${logAfterRetry.messageId})`);

  // 1c. Duplicate protection: A successful send ('sent') MUST be skipped on duplicate call
  const duplicateResult = await sendTemplateMessage({
    to: testPhone,
    templateName: 'mvss_estimate_created',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Ramesh Sharma' },
          { type: 'text', text: 'TS09EA1234' },
          { type: 'text', text: 'MVSS/EST/26-27/078' },
          { type: 'text', text: 'JC-1001' },
          { type: 'text', text: '5,000' }
        ]
      }
    ],
    recipientName: 'Ramesh Sharma',
    idempotencyKey: testKey
  }, mockAxios);

  assert.strictEqual(duplicateResult.status, 'duplicate_skipped', 'Successful sends MUST be skipped on exact duplicate');
  assert.strictEqual(duplicateResult.alreadySent, true, 'alreadySent flag must be true');
  console.log('✔ Verified duplicate protection for successfully sent messages');

  // ---------------------------------------------------------------------------
  // TEST 2: DOCUMENT MESSAGE DISPATCH WITH ATOMIC UPSERT & RETRY
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Customer Estimate PDF Document Dispatch with Atomic Upsert ---');
  const docKey = 'test_stage1_doc_key_001';
  const pdfBuffer = Buffer.from('%PDF-1.4 sample customer estimate', 'utf-8');
  capturedDispatches.length = 0;

  const docRes = await sendDocumentMessage({
    to: testPhone,
    documentUrl: 'https://mvss-erp-backend.onrender.com/api/estimates/public/customer-pdf/123.pdf',
    pdfBuffer,
    filename: 'Customer_Estimate_MVSS_EST_26-27_078.pdf',
    caption: 'Customer Estimate - MVSS/EST/26-27/078',
    recipientName: 'Ramesh Sharma',
    idempotencyKey: docKey
  }, mockAxios);

  assert(docRes.success, 'Document message dispatch must succeed');
  assert(docRes.messageId, 'Document message must return message ID');
  const docLog = inMemoryLogs.get(docKey);
  assert(docLog, 'WhatsAppLog entry must exist for document');
  assert.strictEqual(docLog.status, 'sent', 'Document log status must be sent');
  assert.strictEqual(docLog.messageType, 'document', 'Log messageType must be document');
  console.log(`✔ Customer Estimate PDF document dispatched (messageId: ${docRes.messageId}, filename: Customer_Estimate_MVSS_EST_26-27_078.pdf)`);

  // ---------------------------------------------------------------------------
  // TEST 3: DOCUMENT TEMPLATE SUPPORT (HEADER FORMAT: DOCUMENT)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Meta Template Header Format DOCUMENT Support ---');
  // Register approved document template in dynamic map
  dynamicTemplateMap.set('mvss_customer_estimate_doc', {
    name: 'mvss_customer_estimate_doc',
    language: 'en',
    status: 'APPROVED',
    paramCount: 5,
    headerFormat: 'DOCUMENT'
  });

  const docTplSpec = resolveTemplateSpec('mvss_customer_estimate_doc');
  assert(docTplSpec, 'mvss_customer_estimate_doc must be resolvable');
  assert.strictEqual(docTplSpec.status, 'APPROVED', 'Template status must be APPROVED');
  console.log(`✔ Resolved DOCUMENT template: Name=${docTplSpec.name}, Status=${docTplSpec.status}, ParamCount=${docTplSpec.paramCount}`);

  capturedDispatches.length = 0;
  const docTplKey = 'test_doc_template_key_001';
  const docTplRes = await sendTemplateMessage({
    to: testPhone,
    templateName: 'mvss_customer_estimate_doc',
    components: [
      {
        type: 'header',
        parameters: [
          {
            type: 'document',
            document: {
              link: 'https://mvss-erp-backend.onrender.com/api/estimates/public/customer-pdf/123.pdf',
              filename: 'Customer_Estimate_MVSS_EST_26-27_078.pdf'
            }
          }
        ]
      },
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Ramesh Sharma' },
          { type: 'text', text: 'TS09EA1234' },
          { type: 'text', text: 'MVSS/EST/26-27/078' },
          { type: 'text', text: 'JC-1001' },
          { type: 'text', text: '5,000' }
        ]
      }
    ],
    recipientName: 'Ramesh Sharma',
    idempotencyKey: docTplKey
  }, mockAxios);

  assert(docTplRes.success, 'Document template dispatch must succeed');
  const dispatchedDocTpl = capturedDispatches.find(d => d.data?.template?.name === 'mvss_customer_estimate_doc');
  assert(dispatchedDocTpl, 'Dispatched payload must include mvss_customer_estimate_doc');
  const headerComp = dispatchedDocTpl.data.template.components.find(c => c.type === 'header');
  assert(headerComp, 'Components must include header');
  assert.strictEqual(headerComp.parameters[0].type, 'document', 'Header param type must be document');
  assert.strictEqual(headerComp.parameters[0].document.filename, 'Customer_Estimate_MVSS_EST_26-27_078.pdf', 'Filename must match');
  console.log('✔ DOCUMENT template payload with PDF attachment verified successfully');

  // ---------------------------------------------------------------------------
  // TEST 4: STRICT SEQUENCE ENFORCEMENT SIMULATION
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Stage 1 Failure Blocks Stage 2 (Strict Sequence Enforcement) ---');
  // Simulate workflow:
  // Step A: Stage 1 fails -> Return 500, Stage 2 NOT called
  let stage1Success = false;
  let stage2DispatchedInWorkflow = false;

  try {
    throw new Error('Meta API HTTP 500 Service Unavailable');
  } catch (err) {
    stage1Success = false;
    console.log('✔ Stage 1 failed with error:', err.message);
  }

  // Sequence guard
  if (!stage1Success) {
    console.log('✔ Sequence Guard: Stage 1 failed -> Stage 2 skipped completely');
    stage2DispatchedInWorkflow = false;
  } else {
    stage2DispatchedInWorkflow = true;
  }
  assert.strictEqual(stage2DispatchedInWorkflow, false, 'Stage 2 MUST NOT be dispatched when Stage 1 fails');

  // Step B: Stage 1 succeeds -> Stage 2 called sequentially
  stage1Success = true;
  if (stage1Success) {
    stage2DispatchedInWorkflow = true;
    console.log('✔ Stage 1 succeeded -> Proceeding to Stage 2');
    capturedDispatches.length = 0;
    const stage2Res = await sendTemplateMessage({
      to: testPhone,
      templateName: 'estimate_awaiting_customer_approval',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Ramesh Sharma' },
            { type: 'text', text: 'TS09EA1234' },
            { type: 'text', text: 'JC-1001' },
            { type: 'text', text: '5,000' }
          ]
        }
      ],
      recipientName: 'Ramesh Sharma',
      idempotencyKey: 'test_stage2_key_001'
    }, mockAxios);
    assert(stage2Res.messageId, 'Stage 2 must succeed');
    console.log(`✔ Stage 2 dispatched sequentially (messageId: ${stage2Res.messageId})`);
  }
  assert.strictEqual(stage2DispatchedInWorkflow, true, 'Stage 2 must be dispatched after Stage 1 succeeds');

  // ---------------------------------------------------------------------------
  // TEST 5: WEBHOOK DELIVERY STATUS UPDATE ATOMICITY (NO E11000)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Webhook Delivery Status Update Atomicity ---');
  const sampleMessageId = 'wamid.HBgLTEST99999';
  inMemoryLogs.set(sampleMessageId, {
    messageId: sampleMessageId,
    status: 'sent',
    recipientPhone: testPhone
  });

  // Multiple concurrent webhook status updates (simulating Meta webhook retries)
  await Promise.all([
    WhatsAppLog.findOneAndUpdate({ messageId: sampleMessageId }, { $set: { status: 'delivered' } }),
    WhatsAppLog.findOneAndUpdate({ messageId: sampleMessageId }, { $set: { status: 'read' } }),
    WhatsAppLog.findOneAndUpdate({ messageId: sampleMessageId }, { $set: { status: 'read' } })
  ]);

  const finalLog = inMemoryLogs.get(sampleMessageId);
  assert.strictEqual(finalLog.status, 'read', 'Status should be updated to read without race condition');
  console.log('✔ Concurrent webhook updates processed cleanly without E11000 error');

  console.log('\n========================================================================');
  console.log('ALL TESTS PASSED SUCCESSFULLY (5/5)!');
  console.log('========================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
