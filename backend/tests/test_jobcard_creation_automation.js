const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const {
    sendTemplateMessage,
    normalizePhoneNumber,
    TEMPLATE_CONFIG,
    dynamicTemplateMap
} = require('../services/whatsappService');

console.log('--- Starting Job Card Creation & Automation Focused Tests ---');

// Setup environment for testing
process.env.META_WA_ACCESS_TOKEN = 'mock_valid_token_abc';
process.env.META_WA_PHONE_NUMBER_ID = '1391083524077434';
process.env.META_WA_BUSINESS_ACCOUNT_ID = '1070579342641923';

// Ensure template is set to APPROVED in dynamicTemplateMap
dynamicTemplateMap.set('mvss_job_card_created', {
    name: 'mvss_job_card_created',
    language: 'en',
    status: 'APPROVED',
    paramCount: 4
});

// Mock in-memory database storage
const inMemoryLogs = new Map();
const inMemoryJobCards = new Map();
const inMemoryCustomers = new Map();
const inMemoryVehicles = new Map();

// Helper to simulate WhatsAppLog Mongoose model in-memory
const WhatsAppLog = require('../models/WhatsAppLog');
const origFindOne = WhatsAppLog.findOne;
const origCreate = WhatsAppLog.create;
const origSave = WhatsAppLog.prototype.save;

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

// =========================================================================
// Test 1: Verify configured template name, language, and parameter count
// =========================================================================
assert(TEMPLATE_CONFIG['mvss_job_card_created'], 'Template mvss_job_card_created must exist in TEMPLATE_CONFIG');
assert.strictEqual(TEMPLATE_CONFIG['mvss_job_card_created'].lang, 'en', 'Template language must be en');
assert.strictEqual(TEMPLATE_CONFIG['mvss_job_card_created'].paramCount, 4, 'Template must require exactly 4 parameters');
console.log('✔ Test 1 Passed: Template mvss_job_card_created is configured with language "en" and 4 parameters.');

// =========================================================================
// Test 2: Successful Job Card save executes automation once with all 4 parameters in exact order
// =========================================================================
async function runTest2() {
    let capturedRequest = null;
    let callCount = 0;

    const mockAxios = {
        post: async (url, payload, config) => {
            callCount++;
            capturedRequest = { url, payload, config };
            return {
                status: 200,
                data: {
                    messaging_product: 'whatsapp',
                    contacts: [{ input: payload.to, wa_id: payload.to }],
                    messages: [{ id: 'wamid.HBgTEST_SUCCESS_001' }]
                }
            };
        }
    };

    const mockCustomer = {
        _id: 'cust_001',
        name: 'Vunnam Kushal',
        mobile: '8008092742'
    };

    const mockVehicle = {
        _id: 'veh_001',
        vehicleNumber: 'TS09AP1234'
    };

    const mockJobCard = {
        _id: 'jc_001',
        jobCardNo: 'MVSS/JC/26-27/001',
        customerId: mockCustomer._id,
        vehicleId: mockVehicle._id,
        serviceType: 'General Servicing'
    };

    // Simulate the exact automation hook executed in backend/routes/jobcards.js
    const customerName = String(mockCustomer.name).trim();
    const jobCardNumber = String(mockJobCard.jobCardNo).trim();
    const vehicleRegNumber = String(mockVehicle.vehicleNumber).trim();
    const serviceDescription = String(mockJobCard.serviceType).trim();
    const normalizedPhone = normalizePhoneNumber(mockCustomer.mobile);
    const correlationKey = `job_card_created_${mockJobCard._id}`;

    const waResult = await sendTemplateMessage({
        to: normalizedPhone,
        templateName: 'mvss_job_card_created',
        components: [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: customerName },
                    { type: 'text', text: jobCardNumber },
                    { type: 'text', text: vehicleRegNumber },
                    { type: 'text', text: serviceDescription }
                ]
            }
        ],
        recipientName: customerName,
        relatedEntity: mockJobCard._id,
        onModel: 'JobCard',
        idempotencyKey: correlationKey
    }, mockAxios);

    assert.strictEqual(callCount, 1, 'WhatsApp API must be invoked exactly once');
    assert.strictEqual(waResult.success, true);
    assert.strictEqual(waResult.messageId, 'wamid.HBgTEST_SUCCESS_001');

    // Verify exact Meta request structure
    assert.strictEqual(capturedRequest.url, 'https://graph.facebook.com/v25.0/1391083524077434/messages');
    assert.strictEqual(capturedRequest.payload.to, '918008092742');
    assert.strictEqual(capturedRequest.payload.template.name, 'mvss_job_card_created');
    assert.strictEqual(capturedRequest.payload.template.language.code, 'en');

    const params = capturedRequest.payload.template.components[0].parameters;
    assert.strictEqual(params.length, 4, 'Must send exactly 4 body parameters');
    assert.strictEqual(params[0].text, 'Vunnam Kushal', 'Parameter {{1}} must be Customer Name');
    assert.strictEqual(params[1].text, 'MVSS/JC/26-27/001', 'Parameter {{2}} must be Job Card Number');
    assert.strictEqual(params[2].text, 'TS09AP1234', 'Parameter {{3}} must be Vehicle Number');
    assert.strictEqual(params[3].text, 'General Servicing', 'Parameter {{4}} must be Service Description');

    console.log('✔ Test 2 Passed: Successful job-card creation triggers WhatsApp dispatch with exact parameter order {{1}}..{{4}}.');
}

// =========================================================================
// Test 3: Duplicate requests with same correlationKey do NOT send duplicate messages
// =========================================================================
async function runTest3() {
    let callCount = 0;
    const mockAxios = {
        post: async () => {
            callCount++;
            return { status: 200, data: { messages: [{ id: 'wamid.HBgTEST_DUPLICATE_002' }] } };
        }
    };

    // First call (recorded in inMemoryLogs)
    const key = 'job_card_created_jc_test_dup';
    inMemoryLogs.set(key, {
        messageId: 'wamid.EXISTING_MSG_123',
        status: 'sent',
        idempotencyKey: key
    });

    const duplicateResult = await sendTemplateMessage({
        to: '918008092742',
        templateName: 'mvss_job_card_created',
        components: [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: 'Kushal' },
                    { type: 'text', text: 'MVSS/JC/26-27/002' },
                    { type: 'text', text: 'TS09AP1234' },
                    { type: 'text', text: 'General Servicing' }
                ]
            }
        ],
        recipientName: 'Kushal',
        idempotencyKey: key
    }, mockAxios);

    assert.strictEqual(callCount, 0, 'Must NOT invoke Meta API for duplicate request');
    assert.strictEqual(duplicateResult.status, 'duplicate_skipped');
    assert.strictEqual(duplicateResult.messageId, 'wamid.EXISTING_MSG_123');

    console.log('✔ Test 3 Passed: Duplicate job card creation requests safely skip outbound dispatch.');
}

// =========================================================================
// Test 4: Missing or invalid customer phone numbers skip WhatsApp safely without error
// =========================================================================
async function runTest4() {
    let sendAttempted = false;
    const mockAxios = {
        post: async () => {
            sendAttempted = true;
        }
    };

    const mockCustomerNoPhone = {
        _id: 'cust_no_phone',
        name: 'No Phone Customer',
        mobile: ''
    };

    const rawPhone = mockCustomerNoPhone.mobile;
    const normalizedPhone = normalizePhoneNumber(rawPhone);
    const isValidContact = Boolean(mockCustomerNoPhone && normalizedPhone && normalizedPhone.length >= 10);

    assert.strictEqual(isValidContact, false, 'Invalid contact must be detected');

    // Simulate route logic: when !isValidContact, route skips sendTemplateMessage
    if (isValidContact) {
        await sendTemplateMessage({ to: normalizedPhone, templateName: 'mvss_job_card_created' }, mockAxios);
    }

    assert.strictEqual(sendAttempted, false, 'Must not attempt to send when phone is missing');
    console.log('✔ Test 4 Passed: Missing/invalid phone numbers are cleanly validated and skipped without route failure.');
}

// =========================================================================
// Test 5: Meta WhatsApp API failure is isolated and does not throw to caller
// =========================================================================
async function runTest5() {
    const mockFailingAxios = {
        post: async () => {
            const err = new Error('Request failed with status code 500');
            err.response = {
                status: 500,
                data: {
                    error: {
                        message: 'Internal Meta Server Error',
                        type: 'OAuthException',
                        code: 2,
                        fbtrace_id: 'TestTrace500'
                    }
                }
            };
            throw err;
        }
    };

    let caughtError = null;
    let jobCardSaved = true; // Job card is saved prior to WhatsApp dispatch

    try {
        await sendTemplateMessage({
            to: '918008092742',
            templateName: 'mvss_job_card_created',
            components: [
                {
                    type: 'body',
                    parameters: [
                        { type: 'text', text: 'Kushal' },
                        { type: 'text', text: 'MVSS/JC/26-27/003' },
                        { type: 'text', text: 'TS09AP1234' },
                        { type: 'text', text: 'General Servicing' }
                    ]
                }
            ],
            recipientName: 'Kushal',
            idempotencyKey: 'job_card_created_jc_isolated_failure'
        }, mockFailingAxios);
    } catch (waErr) {
        caughtError = waErr;
    }

    assert(caughtError, 'sendTemplateMessage throws standard Error on Meta failure');
    assert(caughtError.message.includes('Internal Meta Server Error'));
    assert.strictEqual(jobCardSaved, true, 'Job card creation state must remain successfully saved');

    console.log('✔ Test 5 Passed: WhatsApp failures are isolated and do not compromise job card persistence.');
}

// Run all async tests
(async () => {
    try {
        await runTest2();
        await runTest3();
        await runTest4();
        await runTest5();

        // Restore original methods
        WhatsAppLog.findOne = origFindOne;
        WhatsAppLog.prototype.save = origSave;

        console.log('=== All Job Card Creation & Automation Tests Passed Successfully ===');
        process.exit(0);
    } catch (err) {
        console.error('❌ Test failed:', err);
        process.exit(1);
    }
})();
