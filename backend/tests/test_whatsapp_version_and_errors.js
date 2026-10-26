const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
const assert = require('assert');
const mongoose = require('mongoose');
const WhatsAppLog = require('../models/WhatsAppLog');
const {
    sendTemplateMessage,
    getMetaErrorDetails,
    GRAPH_API_VERSION,
    GRAPH_API_BASE_URL
} = require('../services/whatsappService');

console.log('--- Starting WhatsApp Version & Error Handling Tests ---');

// Test 1: URL / Version construction
assert.strictEqual(GRAPH_API_VERSION, 'v25.0', 'Default Graph API version should be v25.0');
assert.strictEqual(GRAPH_API_BASE_URL, 'https://graph.facebook.com/v25.0', 'Base URL must include v25.0');
console.log('✔ Test 1 Passed: Centralized Graph API version is v25.0 and base URL is constructed properly.');

// Test 2: Safe Meta error detail extraction (prevents [Object] logging and hides secrets)
const mockMeta404Error = {
    message: 'Request failed with status code 404',
    response: {
        status: 404,
        data: {
            error: {
                message: 'Unknown path components: /1391083524077434/messages',
                type: 'OAuthException',
                code: 2500,
                error_subcode: 33,
                fbtrace_id: 'A7x9B2kLmNp'
            }
        }
    }
};

const errDetails = getMetaErrorDetails(mockMeta404Error);
assert.strictEqual(errDetails.status, 404);
assert.strictEqual(errDetails.code, 2500);
assert.strictEqual(errDetails.subcode, 33);
assert.strictEqual(errDetails.fbtrace_id, 'A7x9B2kLmNp');
assert.strictEqual(errDetails.message, 'Unknown path components: /1391083524077434/messages');
assert(errDetails.formatted.includes('HTTP 404'));
assert(errDetails.formatted.includes('fbtrace_id: A7x9B2kLmNp'));
console.log('✔ Test 2 Passed: Meta 404 error details and fbtrace_id correctly extracted without [Object] masking.');

// Test 3: Permission error extraction
const mockPermissionError = {
    message: 'Request failed with status code 403',
    response: {
        status: 403,
        data: {
            error: {
                message: 'Requires whatsapp_business_messaging permission',
                type: 'OAuthException',
                code: 200,
                fbtrace_id: 'PermTrace123'
            }
        }
    }
};

const permDetails = getMetaErrorDetails(mockPermissionError);
assert.strictEqual(permDetails.status, 403);
assert.strictEqual(permDetails.code, 200);
assert(permDetails.formatted.includes('Code 200'));
console.log('✔ Test 3 Passed: Permission error extracted cleanly.');

// Test 4: Successful message sending with mock Axios
async function testSuccessfulSend() {
    process.env.META_WA_ACCESS_TOKEN = 'test_token';
    process.env.META_WA_PHONE_NUMBER_ID = '1391083524077434';

    let requestedUrl = null;
    let requestedPayload = null;
    let authHeader = null;

    const mockAxios = {
        post: async (url, payload, config) => {
            requestedUrl = url;
            requestedPayload = payload;
            authHeader = config.headers['Authorization'];
            return {
                status: 200,
                data: {
                    messaging_product: 'whatsapp',
                    contacts: [{ input: '918008092742', wa_id: '918008092742' }],
                    messages: [{ id: 'wamid.TEST_WAMID_12345' }]
                }
            };
        }
    };

    const idempotencyKey = `test_v25_${Date.now()}`;
    const res = await sendTemplateMessage({
        to: '8008092742',
        templateName: 'mvss_job_card_created',
        components: [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: 'Kushal' },
                    { type: 'text', text: 'JC-1001' },
                    { type: 'text', text: 'AP01AB1234' },
                    { type: 'text', text: 'General Service' }
                ]
            }
        ],
        recipientName: 'Kushal',
        idempotencyKey
    }, mockAxios);

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.messageId, 'wamid.TEST_WAMID_12345');
    assert.strictEqual(res.language, 'en');
    assert.strictEqual(requestedUrl, 'https://graph.facebook.com/v25.0/1391083524077434/messages', 'Must use v25.0 endpoint URL');
    assert.strictEqual(requestedPayload.template.name, 'mvss_job_card_created');
    assert.strictEqual(requestedPayload.template.language.code, 'en');
    assert.strictEqual(requestedPayload.to, '918008092742');
    assert.strictEqual(authHeader, 'Bearer test_token');

    // Clean up test log
    await WhatsAppLog.deleteMany({ idempotencyKey });
    console.log('✔ Test 4 Passed: Successful message dispatch verifies v25.0 URL, parameters, and wamid response.');
}

// Test 5: Outbound 404 error throwing and handling
async function testOutbound404Handling() {
    process.env.META_WA_ACCESS_TOKEN = 'test_token';
    process.env.META_WA_PHONE_NUMBER_ID = '1391083524077434';

    const mockAxios = {
        post: async () => {
            const err = new Error('Request failed with status code 404');
            err.response = {
                status: 404,
                data: {
                    error: {
                        message: '(#100) The target URL does not exist on this version',
                        code: 100,
                        fbtrace_id: 'Trace404'
                    }
                }
            };
            throw err;
        }
    };

    const idempotencyKey = `test_404_${Date.now()}`;
    try {
        await sendTemplateMessage({
            to: '8008092742',
            templateName: 'mvss_job_card_created',
            components: [
                {
                    type: 'body',
                    parameters: [
                        { type: 'text', text: 'A' },
                        { type: 'text', text: 'B' },
                        { type: 'text', text: 'C' },
                        { type: 'text', text: 'D' }
                    ]
                }
            ],
            idempotencyKey
        }, mockAxios);
        assert.fail('Should have thrown on 404 response');
    } catch (e) {
        assert(e.response.status === 404);
        assert(e.response.data.error.message.includes('The target URL does not exist'));
        console.log('✔ Test 5 Passed: Outbound 404 error is properly trapped and reported.');
    } finally {
        // Clean up test log
        await WhatsAppLog.deleteMany({ idempotencyKey });
    }
}

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    await testSuccessfulSend();
    await testOutbound404Handling();
    await mongoose.disconnect();
    console.log('--- All WhatsApp Version & Error Handling Tests Passed Successfully ---');
}

run().catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
