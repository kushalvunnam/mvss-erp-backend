const assert = require('assert');
const {
    syncMetaTemplates,
    TEMPLATE_CONFIG,
    dynamicTemplateMap
} = require('../services/whatsappService');

console.log('--- Starting Meta Audit Focused Tests ---');

process.env.META_WA_ACCESS_TOKEN = 'mock_token_for_tests';
process.env.META_WA_PHONE_NUMBER_ID = '1391083524077434';
process.env.META_WA_BUSINESS_ACCOUNT_ID = '10705793426461923';

// Scenario 1: Valid WABA Response
async function testValidWaba() {
    console.log('\nTesting Scenario 1: Valid WABA Response');
    dynamicTemplateMap.clear();

    const mockAxios = {
        get: async (url) => {
            if (url.includes('/me/permissions')) {
                return {
                    data: {
                        data: [
                            { permission: 'whatsapp_business_messaging', status: 'granted' },
                            { permission: 'whatsapp_business_management', status: 'granted' }
                        ]
                    }
                };
            }
            if (url.includes('/1391083524077434')) {
                return {
                    data: {
                        id: '1391083524077434',
                        display_phone_number: '+91 76748 19765',
                        verified_name: 'MVSS Automobiles',
                        code_verification_status: 'VERIFIED',
                        quality_rating: 'GREEN',
                        whatsapp_business_account: { id: '10705793426461923' }
                    }
                };
            }
            if (url.includes('/10705793426461923/message_templates')) {
                return {
                    data: {
                        data: [
                            {
                                name: 'mvss_job_card_created',
                                language: 'en',
                                status: 'APPROVED',
                                components: [{ type: 'BODY', text: 'Hello {{1}}, JC {{2}}, Vehicle {{3}}, Service {{4}}' }]
                            }
                        ]
                    }
                };
            }
            if (url.includes('/10705793426461923')) {
                return { data: { id: '10705793426461923', name: 'MVSS Automobiles WABA' } };
            }
            throw new Error(`Unexpected URL: ${url}`);
        }
    };

    const report = await syncMetaTemplates(mockAxios);
    assert.strictEqual(report.tokenPermissions['whatsapp_business_messaging'], 'granted');
    assert.strictEqual(report.tokenPermissions['whatsapp_business_management'], 'granted');
    assert.strictEqual(report.phoneVerification.verified, true);
    assert.strictEqual(report.wabaVerification.verified, true);
    assert.strictEqual(report.wabaVerification.isWaba, true);
    assert.strictEqual(report.templatesAudit.success, true);
    assert.strictEqual(report.templatesAudit.count, 1);
    assert.strictEqual(report.fallbackConfigActive, false);
    assert.strictEqual(dynamicTemplateMap.get('mvss_job_card_created')?.language, 'en');
    console.log('✔ Scenario 1 Passed: Valid WABA successfully audits permissions, phone, and templates.');
}

// Scenario 2: Invalid WABA ID (Unsupported get request) & No Phone WABA
async function testInvalidWabaId() {
    console.log('\nTesting Scenario 2: Invalid WABA ID (Object does not exist)');
    dynamicTemplateMap.clear();

    const mockAxios = {
        get: async (url) => {
            if (url.includes('/me/permissions')) {
                return {
                    data: {
                        data: [
                            { permission: 'whatsapp_business_messaging', status: 'granted' },
                            { permission: 'whatsapp_business_management', status: 'granted' }
                        ]
                    }
                };
            }
            if (url.includes('/1391083524077434')) {
                return { data: { id: '1391083524077434', verified_name: 'MVSS Automobiles' } };
            }
            if (url.includes('/10705793426461923')) {
                const err = new Error('Unsupported get request. Object with ID 10705793426461923 does not exist');
                err.response = { status: 400, data: { error: { message: err.message, code: 100 } } };
                throw err;
            }
            throw new Error(`Unexpected URL: ${url}`);
        }
    };

    const report = await syncMetaTemplates(mockAxios);
    assert.strictEqual(report.wabaVerification.verified, false);
    assert.strictEqual(report.templatesAudit.success, false);
    assert.strictEqual(report.fallbackConfigActive, true);
    assert.strictEqual(dynamicTemplateMap.size, 0);
    assert.strictEqual(TEMPLATE_CONFIG['mvss_job_card_created'].lang, 'en');
    console.log('✔ Scenario 2 Passed: Invalid WABA ID is handled safely without crashing; baseline configuration preserved.');
}

// Scenario 3: Missing Token Permission (whatsapp_business_management missing)
async function testMissingPermission() {
    console.log('\nTesting Scenario 3: Missing Permission');
    dynamicTemplateMap.clear();

    const mockAxios = {
        get: async (url) => {
            if (url.includes('/me/permissions')) {
                return {
                    data: {
                        data: [
                            { permission: 'whatsapp_business_messaging', status: 'granted' }
                        ]
                    }
                };
            }
            if (url.includes('/1391083524077434')) {
                return { data: { id: '1391083524077434', verified_name: 'MVSS Automobiles' } };
            }
            if (url.includes('/10705793426461923')) {
                const err = new Error('Permission denied');
                err.response = { status: 403, data: { error: { message: 'Requires whatsapp_business_management permission', code: 200 } } };
                throw err;
            }
            throw new Error(`Unexpected URL: ${url}`);
        }
    };

    const report = await syncMetaTemplates(mockAxios);
    assert.strictEqual(report.tokenPermissions['whatsapp_business_management'], undefined);
    assert.strictEqual(report.fallbackConfigActive, true);
    console.log('✔ Scenario 3 Passed: Missing permission is detected and logged clearly.');
}

// Scenario 4: API Network Failure
async function testNetworkFailure() {
    console.log('\nTesting Scenario 4: API Network Failure (Timeout / Connection error)');
    dynamicTemplateMap.clear();

    const mockAxios = {
        get: async () => {
            const err = new Error('ETIMEDOUT: Connection to graph.facebook.com timed out');
            err.code = 'ETIMEDOUT';
            throw err;
        }
    };

    const report = await syncMetaTemplates(mockAxios);
    assert.strictEqual(report.phoneVerification.verified, false);
    assert.strictEqual(report.wabaVerification.verified, false);
    assert.strictEqual(report.fallbackConfigActive, true);
    console.log('✔ Scenario 4 Passed: Network timeout handled safely; baseline config remains active.');
}

// Scenario 5: Phone Number ID automatically discovers true WABA ID when configured ID is a portfolio ID
async function testPhoneDiscoveredWaba() {
    console.log('\nTesting Scenario 5: Phone Number ID discovers WABA ID directly');
    dynamicTemplateMap.clear();

    const mockAxios = {
        get: async (url) => {
            if (url.includes('/me/permissions')) {
                return {
                    data: {
                        data: [
                            { permission: 'whatsapp_business_messaging', status: 'granted' },
                            { permission: 'whatsapp_business_management', status: 'granted' }
                        ]
                    }
                };
            }
            if (url.includes('/1391083524077434')) {
                return {
                    data: {
                        id: '1391083524077434',
                        display_phone_number: '+91 76748 19765',
                        verified_name: 'MVSS Automobiles',
                        whatsapp_business_account: { id: '9988776655443322' }
                    }
                };
            }
            if (url.includes('/9988776655443322/message_templates')) {
                return {
                    data: {
                        data: [
                            {
                                name: 'mvss_job_card_created',
                                language: 'en_US',
                                status: 'APPROVED',
                                components: [{ type: 'BODY', text: 'Hello {{1}}, JC {{2}}, Vehicle {{3}}, Service {{4}}' }]
                            }
                        ]
                    }
                };
            }
            if (url.includes('/9988776655443322')) {
                return { data: { id: '9988776655443322', name: 'Discovered MVSS WABA' } };
            }
            throw new Error(`Unexpected URL: ${url}`);
        }
    };

    const report = await syncMetaTemplates(mockAxios);
    assert.strictEqual(report.wabaVerification.verified, true);
    assert.strictEqual(report.wabaVerification.resolvedWabaId, '9988776655443322');
    assert.strictEqual(report.templatesAudit.success, true);
    assert.strictEqual(dynamicTemplateMap.get('mvss_job_card_created')?.language, 'en_US');
    console.log('✔ Scenario 5 Passed: Discovered WABA ID from phone number node directly resolved templates.');
}

async function runAll() {
    await testValidWaba();
    await testInvalidWabaId();
    await testMissingPermission();
    await testNetworkFailure();
    await testPhoneDiscoveredWaba();
    console.log('\n=== All 5 Meta Audit Tests Passed Successfully ===');
}

runAll().catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
