const axios = require('axios');
const WhatsAppLog = require('../models/WhatsAppLog');

/**
 * Utility to normalize Indian phone numbers to E.164 format (without the +) -> 91XXXXXXXXXX
 */
const normalizePhoneNumber = (phone) => {
    if (!phone) return null;
    let cleaned = phone.replace(/\D/g, '');
    
    // If it's a 10-digit number, prepend 91 (India)
    if (cleaned.length === 10) {
        return `91${cleaned}`;
    }
    // If it starts with 0 and is 11 digits
    if (cleaned.length === 11 && cleaned.startsWith('0')) {
        return `91${cleaned.substring(1)}`;
    }
    // If it already starts with 91 and is 12 digits
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
        return cleaned;
    }
    return cleaned; // Fallback
};

// Static fallback baseline configuration
const TEMPLATE_CONFIG = {
    'mvss_welcome_customer': { lang: 'en', paramCount: 2 },
    'mvss_job_card_created': { lang: 'en', paramCount: 4 },
    'mvss_estimate_created': { lang: 'en', paramCount: 5 },
    'mvss_estimate_approved': { lang: 'en', paramCount: 5 },
    'mvss_invoice_generated': { lang: 'en', paramCount: 5 },
    'mvss_payment_received': { lang: 'en', paramCount: 5 },
    'mvss_gate_pass_generated': { lang: 'en', paramCount: 4 },
    'mvss_insurance_claim_update': { lang: 'en', paramCount: 4 }
};

// Dynamic cache of templates verified directly from Meta Graph API
const dynamicTemplateMap = new Map();

/**
 * Fetch and verify production configuration and approved templates directly from Meta Graph API
 */
const syncMetaTemplates = async () => {
    const token = process.env.META_WA_ACCESS_TOKEN;
    const wabaId = process.env.META_WA_BUSINESS_ACCOUNT_ID;
    const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;

    if (!token || !wabaId) {
        console.warn('[WhatsApp Meta Audit] Missing META_WA_ACCESS_TOKEN or META_WA_BUSINESS_ACCOUNT_ID in environment.');
        return { success: false, error: 'Missing environment credentials' };
    }

    try {
        console.log(`[WhatsApp Meta Audit] Starting verification for WABA ID: ${wabaId}, Phone ID: ${phoneNumberId || 'N/A'}`);

        // 1. Verify Phone Number ID details if provided
        let phoneDetails = null;
        let phoneBelongsToWaba = false;
        if (phoneNumberId) {
            try {
                const phoneRes = await axios.get(`https://graph.facebook.com/v17.0/${phoneNumberId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                phoneDetails = phoneRes.data;
                console.log(`[WhatsApp Meta Audit] Configured Phone ID: ${phoneNumberId} | Display: ${phoneDetails.display_phone_number || 'N/A'} | Verified Name: ${phoneDetails.verified_name || 'N/A'} | Status: ${phoneDetails.code_verification_status || 'VERIFIED'}`);
            } catch (pErr) {
                console.warn(`[WhatsApp Meta Audit] Warning fetching Phone ID ${phoneNumberId}:`, pErr.response?.data?.error?.message || pErr.message);
            }
        }

        // 2. Fetch WABA Registered Phone Numbers
        let registeredNumbers = [];
        try {
            const wabaPhonesRes = await axios.get(`https://graph.facebook.com/v17.0/${wabaId}/phone_numbers`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            registeredNumbers = wabaPhonesRes.data?.data || [];
            phoneBelongsToWaba = registeredNumbers.some(p => p.id === phoneNumberId);
            console.log(`[WhatsApp Meta Audit] WABA has ${registeredNumbers.length} registered phone number(s). Configured Phone ID belongs to WABA: ${phoneBelongsToWaba ? 'YES' : 'NO'}`);
            registeredNumbers.forEach(p => {
                console.log(`  - Registered Number -> ID: ${p.id} | Display: ${p.display_phone_number} | Verified Name: ${p.verified_name} | Quality: ${p.quality_rating}`);
            });
        } catch (wErr) {
            console.warn(`[WhatsApp Meta Audit] Warning fetching WABA phone numbers:`, wErr.response?.data?.error?.message || wErr.message);
        }

        // 3. Fetch WABA Message Templates
        const templatesRes = await axios.get(`https://graph.facebook.com/v17.0/${wabaId}/message_templates?limit=100`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const metaTemplates = templatesRes.data?.data || [];
        console.log(`[WhatsApp Meta Audit] Retrieved ${metaTemplates.length} template(s) from Meta WABA.`);

        metaTemplates.forEach(t => {
            const bodyComponent = t.components?.find(c => c.type === 'BODY');
            let paramCount = 0;
            if (bodyComponent && bodyComponent.text) {
                const matches = bodyComponent.text.match(/\{\{\d+\}\}/g);
                if (matches) {
                    paramCount = new Set(matches).size;
                }
            } else if (bodyComponent?.example?.body_text?.[0]) {
                paramCount = bodyComponent.example.body_text[0].length;
            }

            dynamicTemplateMap.set(t.name, {
                name: t.name,
                language: t.language,
                status: t.status,
                category: t.category,
                id: t.id,
                paramCount
            });

            console.log(`  - Meta Template -> Name: ${t.name} | Lang: ${t.language} | Status: ${t.status} | Body Params: ${paramCount}`);
        });

        // 4. Verify specifically the ERP templates
        console.log('[WhatsApp Meta Audit] Verifying ERP Template mappings against Meta:');
        for (const [name, config] of Object.entries(TEMPLATE_CONFIG)) {
            const metaT = dynamicTemplateMap.get(name);
            if (metaT) {
                console.log(`  [MATCH] ${name} -> Meta Lang: ${metaT.language} (Fallback: ${config.lang}) | Status: ${metaT.status} | Meta Params: ${metaT.paramCount} (Expected: ${config.paramCount})`);
            } else {
                console.warn(`  [MISSING IN META] ${name} -> NOT found in Meta WABA templates!`);
            }
        }

        return {
            success: true,
            phoneDetails,
            phoneBelongsToWaba,
            registeredNumbers: registeredNumbers.map(p => ({
                id: p.id,
                display_phone_number: p.display_phone_number,
                verified_name: p.verified_name,
                quality_rating: p.quality_rating
            })),
            templates: metaTemplates.map(t => ({
                name: t.name,
                language: t.language,
                status: t.status,
                paramCount: dynamicTemplateMap.get(t.name)?.paramCount || 0
            }))
        };
    } catch (err) {
        const errorMsg = err.response?.data?.error?.message || err.message;
        console.error('[WhatsApp Meta Audit] Meta API Error during template sync:', errorMsg);
        return { success: false, error: errorMsg };
    }
};

/**
 * Send a template message via Meta WhatsApp Cloud API
 */
const sendTemplateMessage = async ({
    to,
    templateName,
    languageCode,
    components = [],
    recipientName = 'Unknown',
    relatedEntity,
    onModel,
    idempotencyKey
}) => {
    // Masked recipient for privacy-safe diagnostic logging
    const maskedTo = to ? to.substring(0, 3) + '****' + to.slice(-3) : 'unknown';
    console.log(`[WhatsApp] Attempting send -> Event: ${onModel || 'Manual'}, Template: ${templateName}, To: ${maskedTo}`);

    try {
        const token = process.env.META_WA_ACCESS_TOKEN;
        const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;

        if (!token || !phoneNumberId) {
            const err = 'API credentials missing (META_WA_ACCESS_TOKEN or META_WA_PHONE_NUMBER_ID). Skipping message.';
            console.warn(`[WhatsApp] ${err}`);
            throw new Error(err);
        }

        const normalizedPhone = normalizePhoneNumber(to);
        if (!normalizedPhone || normalizedPhone.length < 10) {
            const err = `Invalid phone number: ${to}`;
            console.warn(`[WhatsApp] ${err}`);
            throw new Error(err);
        }

        // Determine template specification (Meta verified takes precedence over static fallback)
        const dynamicSpec = dynamicTemplateMap.get(templateName);
        const staticSpec = TEMPLATE_CONFIG[templateName];

        if (!dynamicSpec && !staticSpec) {
            console.warn(`[WhatsApp] Template '${templateName}' is not defined in internal mapping or Meta WABA.`);
        }

        // Determine final language code:
        // 1. Caller explicit languageCode (if provided)
        // 2. Meta-verified language for this template
        // 3. Static template config language
        // 4. Default 'en'
        const finalLanguageCode = languageCode || dynamicSpec?.language || staticSpec?.lang || 'en';

        // Check template status on Meta if verified
        if (dynamicSpec && dynamicSpec.status !== 'APPROVED') {
            const err = `Template '${templateName}' is in status '${dynamicSpec.status}' on Meta, not APPROVED.`;
            console.error(`[WhatsApp] ${err}`);
            throw new Error(err);
        }

        // Validate parameter count
        const expectedParamCount = dynamicSpec?.paramCount ?? staticSpec?.paramCount;

        // Validate Components
        if (components && components.length > 0) {
            for (let c of components) {
                if (c.type === 'body' && c.parameters) {
                    if (expectedParamCount !== undefined && c.parameters.length !== expectedParamCount) {
                        const err = `Invalid parameter count for ${templateName}. Expected ${expectedParamCount}, got ${c.parameters.length}.`;
                        console.error(`[WhatsApp] ${err}`);
                        throw new Error(err);
                    }
                    for (let i = 0; i < c.parameters.length; i++) {
                        let param = c.parameters[i];
                        if (param.text === null || param.text === undefined) {
                            const err = `Parameter at index ${i} is null/undefined.`;
                            console.error(`[WhatsApp] ${err}`);
                            throw new Error(err);
                        }
                        // Strictly coerce all parameters to String
                        c.parameters[i].text = String(param.text);
                    }
                }
            }
        }

        // Idempotency Check: Prevent duplicate messages for the same event
        if (idempotencyKey) {
            const existingLog = await WhatsAppLog.findOne({ idempotencyKey });
            if (existingLog) {
                console.log(`[WhatsApp] Duplicate skipped for key: ${idempotencyKey}`);
                return { success: true, messageId: existingLog.messageId, status: 'duplicate_skipped' };
            }
        }

        // Create pending log entry
        const logEntry = new WhatsAppLog({
            recipientName,
            recipientPhone: normalizedPhone,
            templateName,
            messageType: 'template',
            status: 'pending',
            direction: 'outbound',
            relatedEntity,
            onModel,
            idempotencyKey
        });
        await logEntry.save();

        // Construct Meta API Payload
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: normalizedPhone,
            type: 'template',
            template: {
                name: templateName,
                language: {
                    code: finalLanguageCode
                },
                components: components
            }
        };

        const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

        console.log(`[WhatsApp] Sending request to Meta Graph API for template '${templateName}' [lang: ${finalLanguageCode}]`);
        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const messageId = response.data.messages?.[0]?.id;
        const httpStatus = response.status;
        
        // Update Log entry with sent status and message ID
        logEntry.messageId = messageId;
        logEntry.status = 'sent';
        await logEntry.save();

        console.log(`[WhatsApp] Successfully sent template '${templateName}' to ${maskedTo} | HTTP: ${httpStatus} | wamid: ${messageId}`);
        return { success: true, messageId, data: response.data, language: finalLanguageCode };

    } catch (error) {
        let errorMsg = error.message;
        let metaErrorCode = null;

        if (error.response?.data) {
            errorMsg = error.response.data?.error?.message || JSON.stringify(error.response.data);
            metaErrorCode = error.response.data?.error?.code;
            console.error(`[WhatsApp] Meta API Error: HTTP ${error.response.status} | Code: ${metaErrorCode} | Msg: ${errorMsg}`);
        } else {
            console.error(`[WhatsApp] Internal/Network Error: ${errorMsg}`);
        }
        
        // Mark log as failed
        if (idempotencyKey) {
            try {
                const existing = await WhatsAppLog.findOne({ idempotencyKey });
                if (existing) {
                    existing.status = 'failed';
                    existing.errorMessage = errorMsg;
                    await existing.save();
                } else {
                    await WhatsAppLog.create({
                        recipientName,
                        recipientPhone: to ? normalizePhoneNumber(to) || to : 'Unknown',
                        templateName,
                        messageType: 'template',
                        status: 'failed',
                        direction: 'outbound',
                        relatedEntity,
                        onModel,
                        idempotencyKey,
                        errorMessage: errorMsg
                    });
                }
            } catch (logErr) {
                console.error('[WhatsApp] Failed to save error log:', logErr.message);
            }
        }
        
        throw error;
    }
};

module.exports = {
    sendTemplateMessage,
    normalizePhoneNumber,
    syncMetaTemplates,
    TEMPLATE_CONFIG,
    dynamicTemplateMap
};
