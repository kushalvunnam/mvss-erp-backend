const assert = require('assert');
process.env.META_WA_ACCESS_TOKEN = 'mock_valid_token_xyz';
process.env.META_WA_PHONE_NUMBER_ID = '1435390016330145';
process.env.META_WA_BUSINESS_ACCOUNT_ID = '4778078332414981';
process.env.WHATSAPP_BUSINESS_PHONE = '919177177509';

const {
    dynamicTemplateMap,
    pendingTemplateMap,
    rejectedTemplateMap,
    resolveTemplateSpec,
    syncMetaTemplates,
    registerMissingTemplates,
    sendTemplateMessage,
    CANONICAL_TEMPLATES,
    TEMPLATE_CONFIG
} = require('../services/whatsappService');

console.log('--- Starting Template Approval & Synchronization Unit Test Suite ---');

async function runTests() {
    // -------------------------------------------------------------
    // Test 1: Verify CANONICAL_TEMPLATES coverage
    // -------------------------------------------------------------
    console.log('\nTest 1: Verify CANONICAL_TEMPLATES coverage and structure');
    const requiredTemplates = [
        'mvss_welcome_customer',
        'mvss_job_card_created',
        'mvss_vehicle_received',
        'estimate_awaiting_customer_approval',
        'mvss_customer_estimate_doc',
        'mvss_estimate_created',
        'mvss_estimate_approved',
        'mvss_additional_work',
        'mvss_service_delay',
        'mvss_vehicle_ready',
        'mvss_job_completed',
        'mvss_vehicle_delivered',
        'mvss_gate_pass_generated',
        'mvss_payment_received',
        'mvss_payment_due',
        'mvss_feedback_request',
        'mvss_insurance_claim_update',
        'mvss_booking_confirmation',
        'service_booking_confirmation',
        'mvss_vehicle_photos_available',
        'mvss_service_remainder',
        'mvss_customer_followup',
        'mvss_service_support',
        'mvss_inspection_completed',
        'mvss_invoice_generated',
        'mvss_work_started'
    ];

    for (const name of requiredTemplates) {
        assert(CANONICAL_TEMPLATES[name], `Template ${name} must be defined in CANONICAL_TEMPLATES`);
        assert.strictEqual(CANONICAL_TEMPLATES[name].language, 'en', `${name} must have language 'en'`);
        assert.strictEqual(CANONICAL_TEMPLATES[name].category, 'UTILITY', `${name} must have category 'UTILITY'`);
        assert(CANONICAL_TEMPLATES[name].paramCount > 0, `${name} must have positive paramCount`);
        assert(Array.isArray(CANONICAL_TEMPLATES[name].variableMapping), `${name} must define variableMapping array`);
        assert.strictEqual(CANONICAL_TEMPLATES[name].variableMapping.length, CANONICAL_TEMPLATES[name].paramCount, `${name} variableMapping length must match paramCount`);
    }
    console.log('✔ Test 1 Passed: All 26 canonical templates have valid UTILITY specs and exact variable mappings.');

    // -------------------------------------------------------------
    // Test 2: syncMetaTemplates segregates APPROVED, PENDING, REJECTED
    // -------------------------------------------------------------
    console.log('\nTest 2: syncMetaTemplates segregates APPROVED, PENDING, and REJECTED templates');
    const mockMetaResponse = [
        {
            name: 'mvss_customer_estimate_doc',
            status: 'APPROVED',
            category: 'UTILITY',
            language: 'en',
            components: [
                { type: 'HEADER', format: 'DOCUMENT' },
                { type: 'BODY', text: 'Dear {{1}}, estimate {{2}} for {{3}}' }
            ]
        },
        {
            name: 'mvss_welcome_customer',
            status: 'PENDING',
            category: 'UTILITY',
            language: 'en',
            components: [
                { type: 'BODY', text: 'Dear {{1}}, welcome vehicle {{2}}' }
            ]
        },
        {
            name: 'mvss_test_rejected',
            status: 'REJECTED',
            category: 'UTILITY',
            language: 'en',
            rejected_reason: 'VARIABLE_PARAM_INCORRECT',
            components: [
                { type: 'BODY', text: 'Dear {{1}}' }
            ]
        }
    ];

    const mockAxiosSync = {
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
            if (url.includes('/1435390016330145') && !url.includes('/phone_numbers')) {
                return {
                    data: {
                        id: '1435390016330145',
                        display_phone_number: '+91 91771 77509',
                        verified_name: 'MVSS Automobiles',
                        code_verification_status: 'VERIFIED',
                        quality_rating: 'GREEN'
                    }
                };
            }
            if (url.includes('/4778078332414981/phone_numbers')) {
                return {
                    data: {
                        data: [
                            { id: '1435390016330145', display_phone_number: '+91 91771 77509', verified_name: 'MVSS Automobiles' }
                        ]
                    }
                };
            }
            if (url.includes('/message_templates')) {
                return {
                    data: {
                        data: mockMetaResponse
                    }
                };
            }
            return { data: { data: [] } };
        }
    };

    const auditReport = await syncMetaTemplates(mockAxiosSync);
    assert.strictEqual(auditReport.templatesAudit.approvedCount, 1);
    assert.strictEqual(auditReport.templatesAudit.pendingCount, 1);
    assert.strictEqual(auditReport.templatesAudit.rejectedCount, 1);

    assert(dynamicTemplateMap.has('mvss_customer_estimate_doc'), 'APPROVED template must be in dynamicTemplateMap');
    assert(pendingTemplateMap.has('mvss_welcome_customer'), 'PENDING template must be in pendingTemplateMap');
    assert(rejectedTemplateMap.has('mvss_test_rejected'), 'REJECTED template must be in rejectedTemplateMap');
    assert.strictEqual(rejectedTemplateMap.get('mvss_test_rejected').rejectedReason, 'VARIABLE_PARAM_INCORRECT');
    console.log('✔ Test 2 Passed: Dynamic synchronization strictly isolates APPROVED, PENDING, and REJECTED templates.');

    // -------------------------------------------------------------
    // Test 3: resolveTemplateSpec returns granular status
    // -------------------------------------------------------------
    console.log('\nTest 3: resolveTemplateSpec returns granular status');
    const specApproved = resolveTemplateSpec('mvss_customer_estimate_doc');
    assert.strictEqual(specApproved.status, 'APPROVED');

    const specPending = resolveTemplateSpec('mvss_welcome_customer');
    assert.strictEqual(specPending.status, 'PENDING');

    const specRejected = resolveTemplateSpec('mvss_test_rejected');
    assert.strictEqual(specRejected.status, 'REJECTED');
    assert.strictEqual(specRejected.rejectedReason, 'VARIABLE_PARAM_INCORRECT');

    const specMissing = resolveTemplateSpec('mvss_vehicle_ready');
    assert.strictEqual(specMissing.status, 'NOT_REGISTERED');
    console.log('✔ Test 3 Passed: resolveTemplateSpec returns APPROVED, PENDING, REJECTED, and NOT_REGISTERED accurately.');

    // -------------------------------------------------------------
    // Test 4: sendTemplateMessage blocks PENDING, REJECTED, and NOT_REGISTERED
    // -------------------------------------------------------------
    console.log('\nTest 4: sendTemplateMessage blocks PENDING, REJECTED, and NOT_REGISTERED templates before Meta call');
    
    // Attempt sending PENDING template
    let pendingBlocked = false;
    try {
        await sendTemplateMessage({
            to: '918008092742',
            templateName: 'mvss_welcome_customer',
            components: [{ type: 'body', parameters: [{ type: 'text', text: 'Kushal' }, { type: 'text', text: 'TS09EA1234' }] }]
        }, {
            get: mockAxiosSync.get,
            post: async () => { throw new Error('Meta API should NEVER be called for PENDING template'); }
        });
    } catch (err) {
        pendingBlocked = true;
        assert(err.message.includes('Pending Approval') || err.message.includes('PENDING'), 'Error message must clearly mention Pending Approval');
    }
    assert(pendingBlocked, 'Must block sending for PENDING template');

    // Attempt sending REJECTED template
    let rejectedBlocked = false;
    try {
        await sendTemplateMessage({
            to: '918008092742',
            templateName: 'mvss_test_rejected',
            components: [{ type: 'body', parameters: [{ type: 'text', text: 'Kushal' }] }]
        }, {
            get: mockAxiosSync.get,
            post: async () => { throw new Error('Meta API should NEVER be called for REJECTED template'); }
        });
    } catch (err) {
        rejectedBlocked = true;
        assert(err.message.includes('REJECTED') || err.message.includes('Rejected'), 'Error message must clearly mention REJECTED status');
    }
    assert(rejectedBlocked, 'Must block sending for REJECTED template');

    // Attempt sending NOT_REGISTERED template
    let notRegBlocked = false;
    try {
        await sendTemplateMessage({
            to: '918008092742',
            templateName: 'mvss_vehicle_ready',
            components: [{ type: 'body', parameters: [{ type: 'text', text: 'Kushal' }, { type: 'text', text: 'TS09' }, { type: 'text', text: 'JC1' }] }]
        }, {
            get: mockAxiosSync.get,
            post: async () => { throw new Error('Meta API should NEVER be called for NOT_REGISTERED template'); }
        });
    } catch (err) {
        notRegBlocked = true;
        assert(err.message.includes('Not Registered') || err.message.includes('NOT_REGISTERED'), 'Error message must clearly mention Not Registered status');
    }
    assert(notRegBlocked, 'Must block sending for NOT_REGISTERED template');

    console.log('✔ Test 4 Passed: Unapproved templates (Pending, Rejected, Not Registered) are blocked before calling Meta API.');

    // -------------------------------------------------------------
    // Test 5: registerMissingTemplates skips existing and submits missing
    // -------------------------------------------------------------
    console.log('\nTest 5: registerMissingTemplates skips existing and submits missing templates');
    const submittedTemplates = [];
    const mockAxiosRegister = {
        get: mockAxiosSync.get,
        post: async (url, payload) => {
            if (url.includes('/message_templates')) {
                submittedTemplates.push(payload);
                return {
                    status: 200,
                    data: {
                        id: `mock_meta_id_${payload.name}`,
                        status: 'PENDING',
                        category: payload.category
                    }
                };
            }
            return { status: 200, data: {} };
        }
    };

    const regResult = await registerMissingTemplates(mockAxiosRegister);
    assert.strictEqual(regResult.success, true);
    assert(regResult.summary.alreadyExisting.includes('mvss_customer_estimate_doc'), 'Existing mvss_customer_estimate_doc must be skipped');
    assert(submittedTemplates.length > 0, 'Missing templates must be submitted');
    
    // Check first submitted template
    const welcomeSub = submittedTemplates.find(t => t.name === 'mvss_job_card_created');
    assert(welcomeSub, 'mvss_job_card_created must have been submitted');
    assert.strictEqual(welcomeSub.category, 'UTILITY');
    assert.strictEqual(welcomeSub.language, 'en');
    assert(welcomeSub.components[0].example?.body_text?.[0]?.length === 4, 'Must include 4 example body parameters');

    console.log(`✔ Test 5 Passed: registerMissingTemplates submitted ${submittedTemplates.length} missing templates and safely skipped ${regResult.summary.alreadyExisting.length} existing ones.`);

    console.log('\n=== ALL TEMPLATE APPROVAL & SYNC TESTS PASSED SUCCESSFULLY ===');
}

runTests().catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
