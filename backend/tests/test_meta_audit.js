const assert = require('assert');
const {
    syncMetaTemplates,
    discoverAccessibleWabas,
    TEMPLATE_CONFIG,
    dynamicTemplateMap
} = require('../services/whatsappService');

console.log('--- Starting Meta Account Lookup & Audit Focused Tests ---');

process.env.META_WA_ACCESS_TOKEN = 'mock_token_for_tests';
process.env.META_WA_PHONE_NUMBER_ID = '1391083524077434';
process.env.META_WA_BUSINESS_ACCOUNT_ID = '10705793426461923'; // Portfolio ID

// Scenario 1: Account discovery via /me/businesses -> /{business_id}/owned_whatsapp_business_accounts
// Verifies that ONLY valid fields are requested on Phone Number node, true WABA ID is discovered,
// and templates are loaded from the verified WABA.
async function testBusinessFlowDiscovery() {
    console.log('\nTesting Scenario 1: Account Discovery via /me/businesses Flow');
    dynamicTemplateMap.clear();

    const requestedPhoneUrls = [];
    const mockAxios = {
        get: async (url) => {
            // Check Token Permissions
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
            // Check Phone Number node: Must NOT contain 'whatsapp_business_account'
            if (url.includes('/1391083524077434') && !url.includes('/phone_numbers')) {
                requestedPhoneUrls.push(url);
                assert(!url.includes('whatsapp_business_account'), 'Must NOT request invalid whatsapp_business_account field');
                return {
                    data: {
                        id: '1391083524077434',
                        display_phone_number: '+91 76748 19765',
                        verified_name: 'MVSS Automobiles',
                        code_verification_status: 'VERIFIED',
                        quality_rating: 'GREEN'
                    }
                };
            }
            // /me/businesses returns the Business Portfolio ID
            if (url.includes('/me/businesses')) {
                return {
                    data: {
                        data: [
                            { id: '10705793426461923', name: 'MVSS Automobiles Portfolio' }
                        ]
                    }
                };
            }
            // Business Portfolio owned WABAs returns the actual WABA ID
            if (url.includes('/10705793426461923/owned_whatsapp_business_accounts')) {
                return {
                    data: {
                        data: [
                            { id: '2847592019485721', name: 'MVSS Automobiles Official WABA' }
                        ]
                    }
                };
            }
            // WABA phone_numbers returns the phone number ID
            if (url.includes('/2847592019485721/phone_numbers')) {
                return {
                    data: {
                        data: [
                            {
                                id: '1391083524077434',
                                display_phone_number: '+91 76748 19765',
                                verified_name: 'MVSS Automobiles',
                                quality_rating: 'GREEN'
                            }
                        ]
                    }
                };
            }
            // WABA message_templates returns templates
            if (url.includes('/2847592019485721/message_templates')) {
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
            // Default 404 for empty endpoints like /me/owned_whatsapp_business_accounts
            return { data: { data: [] } };
        }
    };

    const report = await syncMetaTemplates(mockAxios);
    assert.strictEqual(report.phoneVerification.verified, true);
    assert.strictEqual(report.wabaVerification.verified, true);
    assert.strictEqual(report.wabaVerification.resolvedWabaId, '2847592019485721', 'Must resolve true WABA ID');
    assert.strictEqual(report.templatesAudit.success, true);
    assert.strictEqual(report.fallbackConfigActive, false);
    assert.strictEqual(dynamicTemplateMap.get('mvss_job_card_created')?.language, 'en');
    assert(requestedPhoneUrls.length > 0);
    console.log('✔ Scenario 1 Passed: Discovered true WABA ID 2847592019485721 via Business Portfolio and loaded templates.');
}

// Scenario 2: Verification Failure when WABA does not own the phone number ID
// Verifies that unverified IDs are stopped and NOT accepted, fallback remains active
async function testVerificationFailureMismatch() {
    console.log('\nTesting Scenario 2: Verification Failure on Phone Number Mismatch');
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
            if (url.includes('/1391083524077434') && !url.includes('/phone_numbers')) {
                return {
                    data: {
                        id: '1391083524077434',
                        display_phone_number: '+91 76748 19765',
                        verified_name: 'MVSS Automobiles'
                    }
                };
            }
            if (url.includes('/me/businesses')) {
                return { data: { data: [{ id: '10705793426461923', name: 'Other Portfolio' }] } };
            }
            if (url.includes('/10705793426461923/owned_whatsapp_business_accounts')) {
                return { data: { data: [{ id: '9999999999999999', name: 'Unrelated WABA' }] } };
            }
            // Unrelated WABA has a DIFFERENT phone number
            if (url.includes('/9999999999999999/phone_numbers')) {
                return { data: { data: [{ id: '8888888888888888', display_phone_number: '+91 99999 99999' }] } };
            }
            return { data: { data: [] } };
        }
    };

    const report = await syncMetaTemplates(mockAxios);
    assert.strictEqual(report.wabaVerification.verified, false, 'Must NOT verify mismatched WABA');
    assert.strictEqual(report.templatesAudit.success, false);
    assert.strictEqual(report.fallbackConfigActive, true, 'Static fallback must remain active');
    assert.strictEqual(dynamicTemplateMap.size, 0);
    console.log('✔ Scenario 2 Passed: Mismatched WABA was rejected; static baseline preserved.');
}

// Scenario 3: Missing Permission (stops safely without crashing)
async function testMissingPermission() {
    console.log('\nTesting Scenario 3: Missing Token Permission');
    dynamicTemplateMap.clear();

    const mockAxios = {
        get: async (url) => {
            if (url.includes('/me/permissions')) {
                return {
                    data: {
                        data: [{ permission: 'whatsapp_business_messaging', status: 'granted' }]
                    }
                };
            }
            if (url.includes('/1391083524077434')) {
                return { data: { id: '1391083524077434', display_phone_number: '+91 76748 19765' } };
            }
            // Graph API returns 403 on business endpoints without whatsapp_business_management
            const err = new Error('Requires whatsapp_business_management permission');
            err.response = { status: 403, data: { error: { message: err.message, code: 200 } } };
            throw err;
        }
    };

    const report = await syncMetaTemplates(mockAxios);
    assert.strictEqual(report.tokenPermissions['whatsapp_business_management'], undefined);
    assert.strictEqual(report.fallbackConfigActive, true);
    console.log('✔ Scenario 3 Passed: Missing permission detected and handled safely.');
}

async function runAll() {
    await testBusinessFlowDiscovery();
    await testVerificationFailureMismatch();
    await testMissingPermission();
    console.log('\n=== All Meta Account Lookup & Audit Tests Passed Successfully ===');
}

runAll().catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
