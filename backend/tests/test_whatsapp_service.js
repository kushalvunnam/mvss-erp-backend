const assert = require('assert');
const {
    normalizePhoneNumber,
    TEMPLATE_CONFIG,
    dynamicTemplateMap,
    resolveTemplateSpec
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
assert.strictEqual(TEMPLATE_CONFIG['mvss_work_started'].paramCount, 3, 'Work started requires 3 parameters');
assert.strictEqual(TEMPLATE_CONFIG['mvss_vehicle_ready'].paramCount, 3, 'Vehicle ready requires 3 parameters');
assert.strictEqual(TEMPLATE_CONFIG['mvss_vehicle_delivered'].paramCount, 4, 'Vehicle delivered requires 4 parameters');
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

// Test 5: Intelligent Template Alias Resolver
// 5a. Match with mvss_ prefix when Meta template has no prefix
dynamicTemplateMap.set('job_card_created', {
    name: 'job_card_created',
    language: 'en_US',
    status: 'APPROVED',
    paramCount: 4
});
const resolvedSpec = resolveTemplateSpec('mvss_job_card_created');
assert.strictEqual(resolvedSpec.name, 'mvss_job_card_created', 'Exact match takes precedence');

// 5b. When exact is not in dynamic, resolves prefix-less alias
dynamicTemplateMap.delete('mvss_job_card_created');
const resolvedAlias = resolveTemplateSpec('mvss_job_card_created');
assert.strictEqual(resolvedAlias.name, 'job_card_created', 'Resolves alias without mvss_ prefix');
assert.strictEqual(resolvedAlias.language, 'en_US');

// 5c. Resolves static fallback when not in dynamic map
const fallbackSpec = resolveTemplateSpec('mvss_invoice_generated');
assert.strictEqual(fallbackSpec.name, 'mvss_invoice_generated');
assert.strictEqual(fallbackSpec.language, 'en');
assert.strictEqual(fallbackSpec.status, 'CONFIG_FALLBACK');

console.log('✔ Test 3, 4 & 5 Passed: Dynamic Meta template resolution & alias matching passed.');
console.log('--- All WhatsApp Service Unit Tests Passed Successfully ---');
