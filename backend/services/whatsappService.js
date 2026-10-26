const axios = require('axios');
const WhatsAppLog = require('../models/WhatsAppLog');

// Centralized Graph API version configuration (default: v25.0)
const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v25.0';
const GRAPH_API_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

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
 * Safely extracts error details from a Meta Graph API or network error without leaking secrets or tokens.
 */
const getMetaErrorDetails = (err) => {
    const metaError = err.response?.data?.error;
    let message = metaError?.message;

    if (!message) {
        if (typeof err.response?.data === 'string') {
            message = err.response.data.substring(0, 300);
        } else if (err.response?.data) {
            try {
                message = JSON.stringify(err.response.data);
            } catch {
                message = err.message;
            }
        } else {
            message = err.message || 'Unknown Network Error';
        }
    }

    const type = metaError?.type ?? null;
    const code = metaError?.code ?? null;
    const subcode = metaError?.error_subcode ?? null;
    const errorData = metaError?.error_data ? (typeof metaError.error_data === 'object' ? JSON.stringify(metaError.error_data) : String(metaError.error_data)) : null;
    const fbtraceId = metaError?.fbtrace_id ?? null;
    const status = err.response?.status ?? null;

    const formatted = `${status ? `HTTP ${status} ` : ''}${code ? `Code ${code}${subcode ? `:${subcode}` : ''} ` : ''}${type ? `[${type}] ` : ''}- ${message}${errorData ? ` (details: ${errorData})` : ''}${fbtraceId ? ` (fbtrace_id: ${fbtraceId})` : ''}`;

    return {
        message,
        type,
        code,
        subcode,
        errorData,
        error_data: errorData,
        fbtraceId,
        fbtrace_id: fbtraceId,
        status,
        formatted
    };
};

/**
 * Fetch and verify production configuration and approved templates directly from Meta Graph API.
 * Uses centralized GRAPH_API_BASE_URL.
 * Distinguishes permission failures from invalid IDs, tests for Business Portfolio vs WABA IDs,
 * and preserves the static TEMPLATE_CONFIG baseline if dynamic audit cannot complete.
 */
const syncMetaTemplates = async (customAxios = axios) => {
    const token = process.env.META_WA_ACCESS_TOKEN;
    const configuredWabaId = process.env.META_WA_BUSINESS_ACCOUNT_ID;
    const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;

    if (!token) {
        console.warn('[WhatsApp Meta Audit] META_WA_ACCESS_TOKEN is missing in environment.');
        return { success: false, reason: 'MISSING_TOKEN', error: 'Missing META_WA_ACCESS_TOKEN' };
    }

    const auditReport = {
        timestamp: new Date().toISOString(),
        graphApiVersion: GRAPH_API_VERSION,
        tokenPermissions: {},
        phoneVerification: { configuredId: phoneNumberId, verified: false, details: null, error: null },
        wabaVerification: { configuredId: configuredWabaId, verified: false, isWaba: false, isBusinessPortfolio: false, resolvedWabaId: null, error: null },
        templatesAudit: { success: false, count: 0, templates: [], error: null },
        fallbackConfigActive: true
    };

    console.log(`[WhatsApp Meta Audit] === Starting Meta Production Audit (${GRAPH_API_VERSION}) ===`);

    // 1. Inspect Token Scopes via /me/permissions
    try {
        const permRes = await customAxios.get(`${GRAPH_API_BASE_URL}/me/permissions`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const permissions = permRes.data?.data || [];
        const permsMap = {};
        permissions.forEach(p => {
            permsMap[p.permission] = p.status;
        });
        auditReport.tokenPermissions = permsMap;

        const hasMessaging = permsMap['whatsapp_business_messaging'] === 'granted';
        const hasManagement = permsMap['whatsapp_business_management'] === 'granted';
        console.log(`[WhatsApp Meta Audit] Token Scopes -> whatsapp_business_messaging: ${hasMessaging ? 'GRANTED' : 'MISSING'}, whatsapp_business_management: ${hasManagement ? 'GRANTED' : 'MISSING'}`);
        
        if (!hasManagement) {
            console.warn('[WhatsApp Meta Audit] PERMISSION NOTICE: Access token lacks "whatsapp_business_management" scope. Dynamic template listing and WABA metadata inspection may be restricted by Meta.');
        }
    } catch (permErr) {
        const errDetails = getMetaErrorDetails(permErr);
        console.warn('[WhatsApp Meta Audit] Could not inspect token permissions via /me/permissions:', errDetails.formatted);
        auditReport.tokenPermissions = { error: errDetails.message };
    }

    // 2. Inspect Phone Number ID via /${phoneNumberId}
    if (phoneNumberId) {
        try {
            const phoneRes = await customAxios.get(`${GRAPH_API_BASE_URL}/${phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            auditReport.phoneVerification.verified = true;
            auditReport.phoneVerification.details = phoneRes.data;
            console.log(`[WhatsApp Meta Audit] Phone Number ID ${phoneNumberId} verified on Meta: Display=${phoneRes.data.display_phone_number || 'N/A'} | Verified Name=${phoneRes.data.verified_name || 'N/A'} | Status=${phoneRes.data.code_verification_status || 'VERIFIED'} | Quality=${phoneRes.data.quality_rating || 'N/A'}`);
        } catch (phoneErr) {
            const errDetails = getMetaErrorDetails(phoneErr);
            auditReport.phoneVerification.error = errDetails.formatted;
            console.warn(`[WhatsApp Meta Audit] Phone Number ID ${phoneNumberId} check failed:`, errDetails.formatted);
        }
    } else {
        auditReport.phoneVerification.error = 'META_WA_PHONE_NUMBER_ID is not configured in environment';
        console.warn('[WhatsApp Meta Audit] META_WA_PHONE_NUMBER_ID is not configured.');
    }

    // 3. Inspect WABA ID vs Business Portfolio ID
    let effectiveWabaId = configuredWabaId;
    if (configuredWabaId) {
        // First, test whether configuredWabaId is directly a WhatsApp Business Account
        try {
            const wabaDirectRes = await customAxios.get(`${GRAPH_API_BASE_URL}/${configuredWabaId}?fields=id,name,currency,timezone_id`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            auditReport.wabaVerification.verified = true;
            auditReport.wabaVerification.isWaba = true;
            auditReport.wabaVerification.resolvedWabaId = configuredWabaId;
            effectiveWabaId = configuredWabaId;
            console.log(`[WhatsApp Meta Audit] ID ${configuredWabaId} confirmed as valid WhatsApp Business Account: Name=${wabaDirectRes.data?.name || 'N/A'}`);
        } catch (wabaErr) {
            const wabaErrDetails = getMetaErrorDetails(wabaErr);
            console.warn(`[WhatsApp Meta Audit] Direct WABA check on ${configuredWabaId} returned:`, wabaErrDetails.formatted);

            // If direct WABA check fails, check if configuredWabaId is a Meta Business Portfolio ID
            try {
                console.log(`[WhatsApp Meta Audit] Testing if ${configuredWabaId} is a Business Portfolio ID via /owned_whatsapp_business_accounts...`);
                const portfolioRes = await customAxios.get(`${GRAPH_API_BASE_URL}/${configuredWabaId}/owned_whatsapp_business_accounts`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const ownedWabas = portfolioRes.data?.data || [];
                if (ownedWabas.length > 0) {
                    auditReport.wabaVerification.verified = true;
                    auditReport.wabaVerification.isBusinessPortfolio = true;
                    auditReport.wabaVerification.resolvedWabaId = ownedWabas[0].id;
                    effectiveWabaId = ownedWabas[0].id;
                    console.log(`[WhatsApp Meta Audit] Confirmed: ${configuredWabaId} is a Business Portfolio ID! Owned WABA ID resolved: ${effectiveWabaId} (${ownedWabas[0].name || 'N/A'})`);
                } else {
                    auditReport.wabaVerification.error = `Business Portfolio ${configuredWabaId} returned 0 owned WABAs`;
                    console.warn(`[WhatsApp Meta Audit] Business Portfolio ${configuredWabaId} returned 0 owned WhatsApp Business Accounts.`);
                }
            } catch (portfolioErr) {
                const portErrDetails = getMetaErrorDetails(portfolioErr);
                auditReport.wabaVerification.error = `Direct: "${wabaErrDetails.formatted}", Portfolio: "${portErrDetails.formatted}"`;
                console.warn(`[WhatsApp Meta Audit] Portfolio check on ${configuredWabaId} also failed:`, portErrDetails.formatted);
            }
        }
    } else {
        auditReport.wabaVerification.error = 'META_WA_BUSINESS_ACCOUNT_ID is not configured in environment';
        console.warn('[WhatsApp Meta Audit] META_WA_BUSINESS_ACCOUNT_ID is not configured.');
    }

    // 4. Fetch Message Templates using effectiveWabaId (if verified)
    if (effectiveWabaId && auditReport.wabaVerification.verified) {
        try {
            const templatesRes = await customAxios.get(`${GRAPH_API_BASE_URL}/${effectiveWabaId}/message_templates?limit=100`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const metaTemplates = templatesRes.data?.data || [];
            console.log(`[WhatsApp Meta Audit] Successfully retrieved ${metaTemplates.length} template(s) from Meta WABA (${effectiveWabaId}).`);

            metaTemplates.forEach(t => {
                const bodyComponent = t.components?.find(c => c.type === 'BODY');
                let paramCount = 0;
                if (bodyComponent && bodyComponent.text) {
                    const matches = bodyComponent.text.match(/\{\{\d+\}\}/g);
                    if (matches) paramCount = new Set(matches).size;
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

            auditReport.templatesAudit.success = true;
            auditReport.templatesAudit.count = metaTemplates.length;
            auditReport.templatesAudit.templates = metaTemplates.map(t => ({
                name: t.name,
                language: t.language,
                status: t.status,
                paramCount: dynamicTemplateMap.get(t.name)?.paramCount || 0
            }));
            auditReport.fallbackConfigActive = false;

            // Verify specifically the ERP templates against Meta's returned templates
            console.log('[WhatsApp Meta Audit] Verifying ERP Template mappings against Meta:');
            for (const [name, config] of Object.entries(TEMPLATE_CONFIG)) {
                const metaT = dynamicTemplateMap.get(name);
                if (metaT) {
                    console.log(`  [MATCH] ${name} -> Meta Lang: ${metaT.language} (Fallback: ${config.lang}) | Status: ${metaT.status} | Params: ${metaT.paramCount}`);
                } else {
                    console.warn(`  [MISSING IN META] ${name} -> NOT found in Meta WABA templates!`);
                }
            }
        } catch (tplErr) {
            const tplErrDetails = getMetaErrorDetails(tplErr);
            auditReport.templatesAudit.error = tplErrDetails.formatted;
            console.warn(`[WhatsApp Meta Audit] Failed to retrieve message templates from WABA ${effectiveWabaId}:`, tplErrDetails.formatted);
            console.warn('[WhatsApp Meta Audit] Preserving static TEMPLATE_CONFIG baseline (en).');
        }
    } else {
        auditReport.templatesAudit.error = 'WABA ID could not be verified; dynamic template sync skipped';
        console.warn('[WhatsApp Meta Audit] Skipping dynamic template sync: WABA ID could not be verified. Preserving static TEMPLATE_CONFIG baseline (en).');
    }

    console.log(`[WhatsApp Meta Audit] === Audit Complete. Baseline fallback active: ${auditReport.fallbackConfigActive ? 'YES (using verified TEMPLATE_CONFIG)' : 'NO (using live Meta sync)'} ===`);
    return auditReport;
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
}, customAxios = axios) => {
    // Masked recipient for privacy-safe diagnostic logging
    const maskedTo = to ? to.substring(0, 3) + '****' + to.slice(-3) : 'unknown';
    console.log(`[WhatsApp] Attempting send -> Event: ${onModel || 'Manual'}, Template: ${templateName}, To: ${maskedTo}, Version: ${GRAPH_API_VERSION}`);

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

        const url = `${GRAPH_API_BASE_URL}/${phoneNumberId}/messages`;

        console.log(`[WhatsApp] Sending request to Meta Graph API (${GRAPH_API_VERSION}) for template '${templateName}' [lang: ${finalLanguageCode}]`);
        const response = await customAxios.post(url, payload, {
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

        console.log(`[WhatsApp] Successfully sent template '${templateName}' to ${maskedTo} | Version: ${GRAPH_API_VERSION} | HTTP: ${httpStatus} | wamid: ${messageId}`);
        return { success: true, messageId, data: response.data, language: finalLanguageCode };

    } catch (error) {
        const errDetails = getMetaErrorDetails(error);

        if (errDetails.status) {
            console.error(`[WhatsApp] Meta API Error -> To: ${maskedTo} | Version: ${GRAPH_API_VERSION} | ${errDetails.formatted}`);
        } else {
            console.error(`[WhatsApp] Internal/Network Error -> To: ${maskedTo} | Msg: ${errDetails.message}`);
        }
        
        // Mark log as failed
        if (idempotencyKey) {
            try {
                const existing = await WhatsAppLog.findOne({ idempotencyKey });
                if (existing) {
                    existing.status = 'failed';
                    existing.errorMessage = errDetails.formatted;
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
                        errorMessage: errDetails.formatted
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
    getMetaErrorDetails,
    TEMPLATE_CONFIG,
    dynamicTemplateMap,
    GRAPH_API_VERSION,
    GRAPH_API_BASE_URL
};
