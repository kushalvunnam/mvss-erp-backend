const assert = require('assert');
const mongoose = require('mongoose');
const WhatsAppLog = require('../models/WhatsAppLog');
const { sendTemplateMessage } = require('../services/whatsappService');

console.log('--- Starting Estimate WhatsAppLog & Error Isolation Focused Tests ---');

// Setup environment for testing
process.env.META_WA_ACCESS_TOKEN = 'mock_valid_token_abc';
process.env.META_WA_PHONE_NUMBER_ID = '1391083524077434';
process.env.META_WA_BUSINESS_ACCOUNT_ID = '1070579342641923';

async function runTests() {
  // =========================================================================
  // Test 1: Real Mongoose Schema Validation for Estimate in WhatsAppLog
  // =========================================================================
  const estimateLog = new WhatsAppLog({
    recipientName: 'Kushal Vunnam',
    recipientPhone: '918008092742',
    templateName: 'mvss_estimate_created',
    messageType: 'template',
    status: 'pending',
    direction: 'outbound',
    relatedEntity: new mongoose.Types.ObjectId(),
    onModel: 'Estimate',
    idempotencyKey: 'test_est_val_001'
  });

  const estValError = estimateLog.validateSync();
  assert.strictEqual(estValError, undefined, `WhatsAppLog validation for 'Estimate' must succeed: ${estValError}`);
  console.log('✔ Test 1 Passed: WhatsAppLog schema validation accepts onModel="Estimate" successfully.');

  // =========================================================================
  // Test 2: Real Mongoose Schema Validation for All Supported Models
  // =========================================================================
  const supportedModels = [
    'Customer',
    'JobCard',
    'Estimate',
    'Invoice',
    'GatePass',
    'InsuranceClaim',
    'Booking',
    'Purchase',
    'FeedbackReminder'
  ];

  for (const modelName of supportedModels) {
    const log = new WhatsAppLog({
      recipientName: 'Test Recipient',
      recipientPhone: '918008092742',
      templateName: 'test_tpl',
      onModel: modelName,
      relatedEntity: new mongoose.Types.ObjectId()
    });
    const valErr = log.validateSync();
    assert.strictEqual(valErr, undefined, `WhatsAppLog validation for '${modelName}' must pass`);
  }
  console.log('✔ Test 2 Passed: WhatsAppLog schema validation accepts all 9 supported ERP models.');

  // =========================================================================
  // Test 3: Strict Validation Check - Invalid enum values must still be rejected
  // =========================================================================
  const invalidLog = new WhatsAppLog({
    recipientName: 'Test Recipient',
    recipientPhone: '918008092742',
    templateName: 'test_tpl',
    onModel: 'InvalidNonExistentModel',
    relatedEntity: new mongoose.Types.ObjectId()
  });
  const invalidValErr = invalidLog.validateSync();
  assert(invalidValErr, 'WhatsAppLog validation must reject unknown model names');
  assert(invalidValErr.errors['onModel'], 'Error must be on onModel path');
  console.log('✔ Test 3 Passed: Schema validation remains strict and rejects invalid onModel enum values.');

  // =========================================================================
  // Test 4: Estimate WhatsApp Send Execution & Log Update
  // =========================================================================
  let capturedRequest = null;
  const mockAxios = {
    post: async (url, payload) => {
      capturedRequest = { url, payload };
      return {
        status: 200,
        data: {
          messages: [{ id: 'wamid.EST_SUCCESS_001' }]
        }
      };
    }
  };

  // Mock DB storage for WhatsAppLog in this test
  const testDb = new Map();
  const origFindOne = WhatsAppLog.findOne;
  const origSave = WhatsAppLog.prototype.save;
  const origCreate = WhatsAppLog.create;

  WhatsAppLog.findOne = async function(query) {
    if (query.idempotencyKey) {
      return testDb.get(query.idempotencyKey) || null;
    }
    return null;
  };

  WhatsAppLog.prototype.save = async function() {
    if (this.idempotencyKey) {
      testDb.set(this.idempotencyKey, this);
    }
    return this;
  };

  WhatsAppLog.create = async function(doc) {
    if (doc.idempotencyKey) {
      testDb.set(doc.idempotencyKey, doc);
    }
    return doc;
  };

  const estRes = await sendTemplateMessage({
    to: '918008092742',
    templateName: 'mvss_estimate_created',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Kushal Vunnam' },
          { type: 'text', text: 'TS09AB1234' },
          { type: 'text', text: 'MVSS/EST/26-27/001' },
          { type: 'text', text: 'MVSS/JC/26-27/053' },
          { type: 'text', text: '14500' }
        ]
      }
    ],
    recipientName: 'Kushal Vunnam',
    relatedEntity: new mongoose.Types.ObjectId(),
    onModel: 'Estimate',
    idempotencyKey: 'test_est_dispatch_001'
  }, mockAxios);

  assert.strictEqual(estRes.success, true);
  assert.strictEqual(estRes.messageId, 'wamid.EST_SUCCESS_001');
  assert(capturedRequest, 'Meta POST request must be made');
  assert.strictEqual(capturedRequest.payload.template.name, 'mvss_estimate_created');
  
  const savedLog = testDb.get('test_est_dispatch_001');
  assert(savedLog, 'Log must be stored in database');
  assert.strictEqual(savedLog.onModel, 'Estimate');
  assert.strictEqual(savedLog.status, 'sent');
  assert.strictEqual(savedLog.messageId, 'wamid.EST_SUCCESS_001');
  console.log('✔ Test 4 Passed: Estimate send triggers Meta Cloud API request and saves log with onModel="Estimate".');

  // =========================================================================
  // Test 5: Logging failure does NOT prevent legitimate WhatsApp send
  // =========================================================================
  let sendAttemptedDespiteLogFailure = false;
  const mockAxiosLoggingFailure = {
    post: async (url, payload) => {
      sendAttemptedDespiteLogFailure = true;
      return {
        status: 200,
        data: {
          messages: [{ id: 'wamid.SEND_DESPITE_LOG_FAIL' }]
        }
      };
    }
  };

  // Temporarily force WhatsAppLog.prototype.save to throw
  WhatsAppLog.prototype.save = async function() {
    throw new Error('Simulated transient MongoDB connection error on save()');
  };

  const resDespiteLogFailure = await sendTemplateMessage({
    to: '918008092742',
    templateName: 'mvss_estimate_created',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Kushal Vunnam' },
          { type: 'text', text: 'TS09AB1234' },
          { type: 'text', text: 'MVSS/EST/26-27/001' },
          { type: 'text', text: 'MVSS/JC/26-27/053' },
          { type: 'text', text: '14500' }
        ]
      }
    ],
    recipientName: 'Kushal Vunnam',
    relatedEntity: new mongoose.Types.ObjectId(),
    onModel: 'Estimate',
    idempotencyKey: 'test_est_log_fail_001'
  }, mockAxiosLoggingFailure);

  assert.strictEqual(sendAttemptedDespiteLogFailure, true, 'WhatsApp send to Meta MUST be attempted even if initial log save throws');
  assert.strictEqual(resDespiteLogFailure.success, true);
  assert.strictEqual(resDespiteLogFailure.messageId, 'wamid.SEND_DESPITE_LOG_FAIL');
  console.log('✔ Test 5 Passed: Initial log save failure is safely handled and does not prevent legitimate Meta dispatch.');

  // Restore mocks
  WhatsAppLog.findOne = origFindOne;
  WhatsAppLog.prototype.save = origSave;
  WhatsAppLog.create = origCreate;

  console.log('\n=== ALL ESTIMATE WHATSAPP LOGGING & ISOLATION TESTS PASSED ===');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
