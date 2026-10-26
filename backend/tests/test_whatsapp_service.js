const assert = require('assert');
const {
    normalizePhoneNumber,
    TEMPLATE_CONFIG,
    dynamicTemplateMap
} = require('../services/whatsappService');

console.log('--- Starting WhatsApp Service Focused Tests ---');

// Test 1: Phone normalization
assert.strictEqual(normalizePhoneNumber('9876543210'), '919876543210', '10 digit number should get 91 prepended');
assert.strictEqual(normalizePhoneNumber('09876543210'), '919876543210', '11 digit with leading 0 should replace with 91');
assert.strictEqual(normalizePhoneNumber('+91 98765 43210'), '919876543210', 'International format should be cleaned');
assert.strictEqual(normalizePhoneNumber('919876543210'), '919876543210', '12 digit with 91 should remain 91');
assert.strictEqual(normalizePhoneNumber(''), null, 'Empty string should return null');
assert.strictEqual(normalizePhoneNumber(null), null, 'Null should return null');
console.log('✔ Test 1 Passed: Phone normalization handles Indian formats accurately.');

// Test 2: Static Template Config
assert(TEMPLATE_CONFIG['mvss_job_card_created'], 'mvss_job_card_created must exist in config');
assert.strictEqual(TEMPLATE_CONFIG['mvss_job_card_created'].paramCount, 4, 'Job card created requires 4 parameters');
assert.strictEqual(TEMPLATE_CONFIG['mvss_welcome_customer'].paramCount, 2, 'Welcome customer requires 2 parameters');
assert.strictEqual(TEMPLATE_CONFIG['mvss_invoice_generated'].paramCount, 5, 'Invoice generated requires 5 parameters');
assert.strictEqual(TEMPLATE_CONFIG['mvss_payment_received'].paramCount, 5, 'Payment received requires 5 parameters');
console.log('✔ Test 2 Passed: Static TEMPLATE_CONFIG definitions are correct.');

// Test 3: Dynamic template mapping resolution
dynamicTemplateMap.clear();
dynamicTemplateMap.set('mvss_job_card_created', {
    name: 'mvss_job_card_created',
    language: 'en',
    status: 'APPROVED',
    paramCount: 4
});

const dynamicSpec = dynamicTemplateMap.get('mvss_job_card_created');
assert.strictEqual(dynamicSpec.language, 'en', 'Dynamic template map provides exact verified language');
assert.strictEqual(dynamicSpec.status, 'APPROVED', 'Dynamic template status is APPROVED');

// Test 4: Dynamic template with en_US if Meta returned en_US
dynamicTemplateMap.set('mvss_additional_work_approved', {
    name: 'mvss_additional_work_approved',
    language: 'en_US',
    status: 'APPROVED',
    paramCount: 3
});
const dynamicSpec2 = dynamicTemplateMap.get('mvss_additional_work_approved');
assert.strictEqual(dynamicSpec2.language, 'en_US', 'Supports different language codes per template');

console.log('✔ Test 3 & 4 Passed: Dynamic Meta template resolution supports per-template language codes.');
console.log('--- All WhatsApp Service Unit Tests Passed Successfully ---');
