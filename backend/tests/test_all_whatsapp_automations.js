const assert = require('assert');
const path = require('path');

// Setup environment for testing
process.env.META_WA_ACCESS_TOKEN = 'mock_valid_token_abc';
process.env.META_WA_PHONE_NUMBER_ID = '1391083524077434';
process.env.META_WA_BUSINESS_ACCOUNT_ID = '1070579342641923';

const {
  sendTemplateMessage,
  normalizePhoneNumber,
  maskPhoneNumber,
  validateCustomerContact,
  TEMPLATE_CONFIG,
  dynamicTemplateMap
} = require('../services/whatsappService');

console.log('--- Starting All WhatsApp Automations Comprehensive Test Suite ---');

// Mock in-memory database storage for WhatsAppLog
const inMemoryLogs = new Map();
const WhatsAppLog = require('../models/WhatsAppLog');
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

// Populate mock dynamicTemplateMap matching production Meta WABA 1070579342641923
dynamicTemplateMap.set('mvss_job_card_created', { name: 'mvss_job_card_created', language: 'en', status: 'APPROVED', paramCount: 4 });
dynamicTemplateMap.set('mvss_estimate_created', { name: 'mvss_estimate_created', language: 'en', status: 'APPROVED', paramCount: 5 });
dynamicTemplateMap.set('mvss_estimate_approved', { name: 'mvss_estimate_approved', language: 'en', status: 'APPROVED', paramCount: 5 });
dynamicTemplateMap.set('mvss_work_started', { name: 'mvss_work_started', language: 'en', status: 'APPROVED', paramCount: 3 });
dynamicTemplateMap.set('mvss_vehicle_ready', { name: 'mvss_vehicle_ready', language: 'en', status: 'APPROVED', paramCount: 3 });
dynamicTemplateMap.set('mvss_vehicle_delivered', { name: 'mvss_vehicle_delivered', language: 'en', status: 'APPROVED', paramCount: 4 });
dynamicTemplateMap.set('mvss_invoice_generated', { name: 'mvss_invoice_generated', language: 'en', status: 'APPROVED', paramCount: 5 });
dynamicTemplateMap.set('mvss_payment_received', { name: 'mvss_payment_received', language: 'en', status: 'APPROVED', paramCount: 5 });
dynamicTemplateMap.set('mvss_gate_pass_generated', { name: 'mvss_gate_pass_generated', language: 'en', status: 'APPROVED', paramCount: 4 });
dynamicTemplateMap.set('mvss_feedback_request', { name: 'mvss_feedback_request', language: 'en', status: 'APPROVED', paramCount: 2 });
dynamicTemplateMap.set('mvss_welcome_customer', { name: 'mvss_welcome_customer', language: 'en', status: 'APPROVED', paramCount: 2 });

const testPhone = '8008092742';
const normalizedTestPhone = normalizePhoneNumber(testPhone);

async function runTests() {
  // =========================================================================
  // Test 1: Verify Template Config & Approved Parameter Counts
  // =========================================================================
  const expectedSpecs = {
    'mvss_job_card_created': { lang: 'en', params: 4 },
    'mvss_estimate_created': { lang: 'en', params: 5 },
    'mvss_estimate_approved': { lang: 'en', params: 5 },
    'mvss_work_started': { lang: 'en', params: 3 },
    'mvss_vehicle_ready': { lang: 'en', params: 3 },
    'mvss_vehicle_delivered': { lang: 'en', params: 4 },
    'mvss_invoice_generated': { lang: 'en', params: 5 },
    'mvss_payment_received': { lang: 'en', params: 5 },
    'mvss_gate_pass_generated': { lang: 'en', params: 4 },
    'mvss_feedback_request': { lang: 'en', params: 2 },
    'mvss_welcome_customer': { lang: 'en', params: 2 }
  };

  for (const [tpl, spec] of Object.entries(expectedSpecs)) {
    assert(TEMPLATE_CONFIG[tpl], `Template ${tpl} must exist in TEMPLATE_CONFIG`);
    assert.strictEqual(TEMPLATE_CONFIG[tpl].lang, spec.lang, `Language for ${tpl} must be ${spec.lang}`);
    assert.strictEqual(TEMPLATE_CONFIG[tpl].paramCount, spec.params, `Param count for ${tpl} must be ${spec.params}`);
  }
  console.log('✔ Test 1 Passed: All 11 ERP template configs and parameter expectations verified.');

  // =========================================================================
  // Test 2: Estimate Created Automation (mvss_estimate_created - 5 params)
  // =========================================================================
  let capturedEstCreated = null;
  const mockAxiosEstCreated = {
    post: async (url, payload) => {
      capturedEstCreated = { url, payload };
      return { status: 200, data: { messages: [{ id: 'wamid.EST_CREATE_001' }] } };
    }
  };

  const estCreatedRes = await sendTemplateMessage({
    to: normalizedTestPhone,
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
    idempotencyKey: 'test_est_created_001'
  }, mockAxiosEstCreated);

  assert.strictEqual(estCreatedRes.success, true);
  assert.strictEqual(estCreatedRes.messageId, 'wamid.EST_CREATE_001');
  assert.strictEqual(capturedEstCreated.payload.template.name, 'mvss_estimate_created');
  assert.strictEqual(capturedEstCreated.payload.template.language.code, 'en');
  assert.strictEqual(capturedEstCreated.payload.template.components[0].parameters.length, 5);
  assert.strictEqual(capturedEstCreated.payload.template.components[0].parameters[0].text, 'Kushal Vunnam');
  assert.strictEqual(capturedEstCreated.payload.template.components[0].parameters[2].text, 'MVSS/EST/26-27/001');
  assert.strictEqual(capturedEstCreated.payload.template.components[0].parameters[4].text, '14500');
  console.log('✔ Test 2 Passed: Estimate Created triggers dispatch with 5 exact parameters.');

  // =========================================================================
  // Test 3: Estimate Approved Automation (mvss_estimate_approved - 5 params)
  // =========================================================================
  let capturedEstApproved = null;
  const mockAxiosEstApproved = {
    post: async (url, payload) => {
      capturedEstApproved = { url, payload };
      return { status: 200, data: { messages: [{ id: 'wamid.EST_APP_001' }] } };
    }
  };

  const estApprovedRes = await sendTemplateMessage({
    to: normalizedTestPhone,
    templateName: 'mvss_estimate_approved',
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
    idempotencyKey: 'test_est_approved_001'
  }, mockAxiosEstApproved);

  assert.strictEqual(estApprovedRes.success, true);
  assert.strictEqual(capturedEstApproved.payload.template.name, 'mvss_estimate_approved');
  assert.strictEqual(capturedEstApproved.payload.template.components[0].parameters.length, 5);
  console.log('✔ Test 3 Passed: Estimate Approved triggers dispatch with 5 exact parameters.');

  // =========================================================================
  // Test 4: Work Started Automation (mvss_work_started - 3 params)
  // =========================================================================
  let capturedWorkStarted = null;
  const mockAxiosWorkStarted = {
    post: async (url, payload) => {
      capturedWorkStarted = { url, payload };
      return { status: 200, data: { messages: [{ id: 'wamid.WORK_START_001' }] } };
    }
  };

  const workStartedRes = await sendTemplateMessage({
    to: normalizedTestPhone,
    templateName: 'mvss_work_started',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Kushal Vunnam' },
          { type: 'text', text: 'TS09AB1234' },
          { type: 'text', text: 'MVSS/JC/26-27/053' }
        ]
      }
    ],
    recipientName: 'Kushal Vunnam',
    idempotencyKey: 'test_work_started_001'
  }, mockAxiosWorkStarted);

  assert.strictEqual(workStartedRes.success, true);
  assert.strictEqual(capturedWorkStarted.payload.template.name, 'mvss_work_started');
  assert.strictEqual(capturedWorkStarted.payload.template.components[0].parameters.length, 3);
  assert.strictEqual(capturedWorkStarted.payload.template.components[0].parameters[2].text, 'MVSS/JC/26-27/053');
  console.log('✔ Test 4 Passed: Work Started triggers dispatch with 3 exact parameters.');

  // =========================================================================
  // Test 5: Vehicle Ready Automation (mvss_vehicle_ready - 3 params)
  // =========================================================================
  let capturedVehReady = null;
  const mockAxiosVehReady = {
    post: async (url, payload) => {
      capturedVehReady = { url, payload };
      return { status: 200, data: { messages: [{ id: 'wamid.VEH_READY_001' }] } };
    }
  };

  const vehReadyRes = await sendTemplateMessage({
    to: normalizedTestPhone,
    templateName: 'mvss_vehicle_ready',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Kushal Vunnam' },
          { type: 'text', text: 'TS09AB1234' },
          { type: 'text', text: 'MVSS/JC/26-27/053' }
        ]
      }
    ],
    recipientName: 'Kushal Vunnam',
    idempotencyKey: 'test_veh_ready_001'
  }, mockAxiosVehReady);

  assert.strictEqual(vehReadyRes.success, true);
  assert.strictEqual(capturedVehReady.payload.template.name, 'mvss_vehicle_ready');
  assert.strictEqual(capturedVehReady.payload.template.components[0].parameters.length, 3);
  console.log('✔ Test 5 Passed: Vehicle Ready triggers dispatch with 3 exact parameters.');

  // =========================================================================
  // Test 6: Invoice Finalized Automation (mvss_invoice_generated - 5 params)
  // =========================================================================
  let capturedInvoiceGen = null;
  const mockAxiosInvoiceGen = {
    post: async (url, payload) => {
      capturedInvoiceGen = { url, payload };
      return { status: 200, data: { messages: [{ id: 'wamid.INV_GEN_001' }] } };
    }
  };

  const invGenRes = await sendTemplateMessage({
    to: normalizedTestPhone,
    templateName: 'mvss_invoice_generated',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Kushal Vunnam' },
          { type: 'text', text: 'TS09AB1234' },
          { type: 'text', text: 'MVSS/INV/26-27/005' },
          { type: 'text', text: 'MVSS/JC/26-27/053' },
          { type: 'text', text: '16800' }
        ]
      }
    ],
    recipientName: 'Kushal Vunnam',
    idempotencyKey: 'test_inv_gen_001'
  }, mockAxiosInvoiceGen);

  assert.strictEqual(invGenRes.success, true);
  assert.strictEqual(capturedInvoiceGen.payload.template.name, 'mvss_invoice_generated');
  assert.strictEqual(capturedInvoiceGen.payload.template.components[0].parameters.length, 5);
  assert.strictEqual(capturedInvoiceGen.payload.template.components[0].parameters[2].text, 'MVSS/INV/26-27/005');
  console.log('✔ Test 6 Passed: Invoice Finalized triggers dispatch with 5 exact parameters.');

  // =========================================================================
  // Test 7: Gate Pass Generated Automation (mvss_gate_pass_generated - 4 params)
  // =========================================================================
  let capturedGatePass = null;
  const mockAxiosGatePass = {
    post: async (url, payload) => {
      capturedGatePass = { url, payload };
      return { status: 200, data: { messages: [{ id: 'wamid.GP_GEN_001' }] } };
    }
  };

  const gpRes = await sendTemplateMessage({
    to: normalizedTestPhone,
    templateName: 'mvss_gate_pass_generated',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Kushal Vunnam' },
          { type: 'text', text: 'TS09AB1234' },
          { type: 'text', text: 'MVSS/JC/26-27/053' },
          { type: 'text', text: 'MVSS/GP/26-27/012' }
        ]
      }
    ],
    recipientName: 'Kushal Vunnam',
    idempotencyKey: 'test_gp_gen_001'
  }, mockAxiosGatePass);

  assert.strictEqual(gpRes.success, true);
  assert.strictEqual(capturedGatePass.payload.template.name, 'mvss_gate_pass_generated');
  assert.strictEqual(capturedGatePass.payload.template.components[0].parameters.length, 4);
  assert.strictEqual(capturedGatePass.payload.template.components[0].parameters[3].text, 'MVSS/GP/26-27/012');
  console.log('✔ Test 7 Passed: Gate Pass Generated triggers dispatch with 4 exact parameters.');

  // =========================================================================
  // Test 8: Feedback Reminder Automation (mvss_feedback_request - 2 params)
  // =========================================================================
  let capturedFeedback = null;
  const mockAxiosFeedback = {
    post: async (url, payload) => {
      capturedFeedback = { url, payload };
      return { status: 200, data: { messages: [{ id: 'wamid.FEEDBACK_001' }] } };
    }
  };

  const feedbackRes = await sendTemplateMessage({
    to: normalizedTestPhone,
    templateName: 'mvss_feedback_request',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Kushal Vunnam' },
          { type: 'text', text: 'TS09AB1234' }
        ]
      }
    ],
    recipientName: 'Kushal Vunnam',
    idempotencyKey: 'test_feedback_001'
  }, mockAxiosFeedback);

  assert.strictEqual(feedbackRes.success, true);
  assert.strictEqual(capturedFeedback.payload.template.name, 'mvss_feedback_request');
  assert.strictEqual(capturedFeedback.payload.template.components[0].parameters.length, 2);
  console.log('✔ Test 8 Passed: Customer Feedback Request triggers dispatch with 2 exact parameters.');

  // =========================================================================
  // Test 9: Insurance Claim Template Unapproved Safety Check
  // =========================================================================
  let claimSendCaught = null;
  try {
    await sendTemplateMessage({
      to: normalizedTestPhone,
      templateName: 'mvss_unapproved_template_test',
      components: [
        { type: 'body', parameters: [{ type: 'text', text: 'Test' }] }
      ],
      recipientName: 'Kushal Vunnam',
      idempotencyKey: 'test_unapproved_tpl_001'
    }, {
      post: async () => { throw new Error('Template not found in translation'); }
    });
  } catch (err) {
    claimSendCaught = err;
  }
  assert(claimSendCaught, 'Unapproved template send throws cleanly so isolated catch blocks handle it safely');
  console.log('✔ Test 9 Passed: Unapproved template absence is trapped cleanly without database interruption.');

  // =========================================================================
  // Test 10: Strict Idempotency Skip Across Workflows
  // =========================================================================
  const dupKey = 'test_idempotent_event_key';
  const mockDuplicate = await sendTemplateMessage({
    to: normalizedTestPhone,
    templateName: 'mvss_vehicle_ready',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Kushal Vunnam' },
          { type: 'text', text: 'TS09AB1234' },
          { type: 'text', text: 'MVSS/JC/26-27/053' }
        ]
      }
    ],
    recipientName: 'Kushal Vunnam',
    idempotencyKey: dupKey
  }, {
    post: async () => ({ status: 200, data: { messages: [{ id: 'wamid.FIRST_SEND' }] } })
  });
  assert.strictEqual(mockDuplicate.success, true);

  const duplicateAttempt = await sendTemplateMessage({
    to: normalizedTestPhone,
    templateName: 'mvss_vehicle_ready',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Kushal Vunnam' },
          { type: 'text', text: 'TS09AB1234' },
          { type: 'text', text: 'MVSS/JC/26-27/053' }
        ]
      }
    ],
    recipientName: 'Kushal Vunnam',
    idempotencyKey: dupKey
  }, {
    post: async () => { throw new Error('Should not reach Meta for duplicate key'); }
  });
  assert.strictEqual(duplicateAttempt.status, 'duplicate_skipped');
  console.log('✔ Test 10 Passed: Idempotency check prevents duplicate outbound messages across all workflows.');

  // =========================================================================
  // Test 11: Customer Welcome Message Automation (mvss_welcome_customer - 2 params)
  // =========================================================================
  let capturedWelcome = null;
  const mockAxiosWelcome = {
    post: async (url, payload) => {
      capturedWelcome = { url, payload };
      return { status: 200, data: { messages: [{ id: 'wamid.WELCOME_001' }] } };
    }
  };

  const welcomeRes = await sendTemplateMessage({
    to: normalizedTestPhone,
    templateName: 'mvss_welcome_customer',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Kushal Vunnam' },
          { type: 'text', text: 'MVSS Automobiles' }
        ]
      }
    ],
    recipientName: 'Kushal Vunnam',
    idempotencyKey: 'test_welcome_msg_001'
  }, mockAxiosWelcome);

  assert.strictEqual(welcomeRes.success, true);
  assert.strictEqual(capturedWelcome.payload.template.name, 'mvss_welcome_customer');
  assert.strictEqual(capturedWelcome.payload.template.components[0].parameters.length, 2);
  assert.strictEqual(capturedWelcome.payload.template.components[0].parameters[0].text, 'Kushal Vunnam');
  assert.strictEqual(capturedWelcome.payload.template.components[0].parameters[1].text, 'MVSS Automobiles');
  console.log('✔ Test 11 Passed: Welcome message triggers dispatch with 2 exact parameters (customer name, workshop name).');

  // =========================================================================
  // Test 12: Safe Phone Normalization (Indian & International formats)
  // =========================================================================
  // 1. Standard Indian 10 digits
  assert.strictEqual(normalizePhoneNumber('8008092742'), '918008092742');
  assert.strictEqual(normalizePhoneNumber('9876543210'), '919876543210');
  // 2. Indian with leading 0
  assert.strictEqual(normalizePhoneNumber('08008092742'), '918008092742');
  // 3. Indian with 91 prefix
  assert.strictEqual(normalizePhoneNumber('918008092742'), '918008092742');
  // 4. Indian with +91
  assert.strictEqual(normalizePhoneNumber('+918008092742'), '918008092742');
  // 5. US/Canada (+1) -> Must NOT prepend 91
  assert.strictEqual(normalizePhoneNumber('+1 (415) 555-2671'), '14155552671');
  assert.strictEqual(normalizePhoneNumber('14155552671'), '14155552671');
  // 6. UK (+44) -> Must NOT prepend 91
  assert.strictEqual(normalizePhoneNumber('+44 7911 123456'), '447911123456');
  // 7. UAE (+971) -> Must NOT prepend 91
  assert.strictEqual(normalizePhoneNumber('+971 50 123 4567'), '971501234567');
  // 8. Australia (+61) -> Must NOT prepend 91
  assert.strictEqual(normalizePhoneNumber('+61 412 345 678'), '61412345678');
  // 9. Singapore (+65) -> Must NOT prepend 91
  assert.strictEqual(normalizePhoneNumber('+65 9123 4567'), '6591234567');
  // 10. Invalid numbers return null
  assert.strictEqual(normalizePhoneNumber('12345'), null);
  assert.strictEqual(normalizePhoneNumber('0000000000'), null);
  assert.strictEqual(normalizePhoneNumber(''), null);
  assert.strictEqual(normalizePhoneNumber(null), null);
  console.log('✔ Test 12 Passed: Safe phone normalization standardizes Indian numbers and preserves international country codes without blindly prepending 91.');

  // =========================================================================
  // Test 13: Customer Contact Validation & Opt-Out Enforcement
  // =========================================================================
  // 1. Opt-out via whatsappOptIn: false
  const optedOutCust1 = { name: 'Opted Out User', mobile: '8008092742', whatsappOptIn: false };
  const check1 = validateCustomerContact(optedOutCust1);
  assert.strictEqual(check1.valid, false);
  assert(check1.reason.includes('opted out'));

  // 2. Opt-out via optOut: true
  const optedOutCust2 = { name: 'Opted Out User 2', mobile: '8008092742', optOut: true };
  const check2 = validateCustomerContact(optedOutCust2);
  assert.strictEqual(check2.valid, false);

  // 3. Missing phone number
  const noPhoneCust = { name: 'No Phone User', mobile: '' };
  const check3 = validateCustomerContact(noPhoneCust);
  assert.strictEqual(check3.valid, false);
  assert(check3.reason.includes('missing'));

  // 4. Malformed phone number
  const malformedCust = { name: 'Bad Phone User', mobile: '123' };
  const check4 = validateCustomerContact(malformedCust);
  assert.strictEqual(check4.valid, false);
  assert(check4.reason.includes('malformed') || check4.reason.includes('unsupported'));

  // 5. Valid customer
  const validCust = { name: 'Valid User', mobile: '8008092742', whatsappOptIn: true };
  const check5 = validateCustomerContact(validCust);
  assert.strictEqual(check5.valid, true);
  assert.strictEqual(check5.phone, '918008092742');
  assert.strictEqual(check5.masked, '918****742');
  console.log('✔ Test 13 Passed: Customer contact validation correctly enforces opt-in, detects missing/malformed numbers, and formats valid contacts.');

  // =========================================================================
  // Test 14: Phone Masking Utility
  // =========================================================================
  assert.strictEqual(maskPhoneNumber('8008092742'), '800****742');
  assert.strictEqual(maskPhoneNumber('918008092742'), '918****742');
  assert.strictEqual(maskPhoneNumber('7674819765'), '767****765');
  assert.strictEqual(maskPhoneNumber(''), 'missing');
  assert.strictEqual(maskPhoneNumber(null), 'missing');
  console.log('✔ Test 14 Passed: Phone masking utility masks middle digits cleanly for safe logging.');

  // =========================================================================
  // Test 15: Multi-Recipient Verification from Dynamic Customer Records
  // =========================================================================
  // Verify that two distinct customer records dispatch to their respective dynamic numbers
  const recipient1 = {
    _id: 'cust_001_id',
    name: 'Customer One',
    mobile: '8008092742',
    whatsappOptIn: true
  };
  const recipient2 = {
    _id: 'cust_002_id',
    name: 'Customer Two',
    mobile: '7674819765',
    whatsappOptIn: true
  };

  const dispatchedRecipients = [];
  const mockAxiosMulti = {
    post: async (url, payload) => {
      dispatchedRecipients.push(payload.to);
      return { status: 200, data: { messages: [{ id: `wamid.MULTI_${payload.to}` }] } };
    }
  };

  // Dispatch for Customer 1
  const checkRecip1 = validateCustomerContact(recipient1);
  assert.strictEqual(checkRecip1.valid, true);
  const sendRes1 = await sendTemplateMessage({
    to: checkRecip1.phone,
    templateName: 'mvss_welcome_customer',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: recipient1.name },
          { type: 'text', text: 'MVSS Automobiles' }
        ]
      }
    ],
    recipientName: recipient1.name,
    idempotencyKey: `welcome_${recipient1._id}`
  }, mockAxiosMulti);
  assert.strictEqual(sendRes1.success, true);

  // Dispatch for Customer 2
  const checkRecip2 = validateCustomerContact(recipient2);
  assert.strictEqual(checkRecip2.valid, true);
  const sendRes2 = await sendTemplateMessage({
    to: checkRecip2.phone,
    templateName: 'mvss_welcome_customer',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: recipient2.name },
          { type: 'text', text: 'MVSS Automobiles' }
        ]
      }
    ],
    recipientName: recipient2.name,
    idempotencyKey: `welcome_${recipient2._id}`
  }, mockAxiosMulti);
  assert.strictEqual(sendRes2.success, true);

  assert.strictEqual(dispatchedRecipients.length, 2);
  assert.strictEqual(dispatchedRecipients[0], '918008092742');
  assert.strictEqual(dispatchedRecipients[1], '917674819765');
  console.log('✔ Test 15 Passed: Multi-recipient dispatch verified for 2 distinct customer records dynamically extracted.');

  console.log('\n=== ALL 15 WHATSAPP AUTOMATION TESTS PASSED SUCCESSFULLY ===');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
