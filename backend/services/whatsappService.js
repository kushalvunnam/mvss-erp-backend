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
    'mvss_work_started': { lang: 'en', paramCount: 3 },
    'mvss_vehicle_ready': { lang: 'en', paramCount: 3 },
    'mvss_vehicle_delivered': { lang: 'en', paramCount: 4 },
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
 * Resolves a template specification from dynamicTemplateMap (or fallback TEMPLATE_CONFIG),
 * supporting exact names, alias variations (with/without mvss_ prefix, underscores/hyphens).
 */
const resolveTemplateSpec = (requestedName) => {
    if (!requestedName) return null;

    // 1. Exact match in dynamicTemplateMap
    if (dynamicTemplateMap.has(requestedName)) {
        return dynamicTemplateMap.get(requestedName);
    }

    // 2. Exact match with/without 'mvss_' prefix
    const withoutPrefix = requestedName.replace(/^mvss_/, '');
    const withPrefix = requestedName.startsWith('mvss_') ? requestedName : `mvss_${requestedName}`;

    if (dynamicTemplateMap.has(withoutPrefix)) {
        return dynamicTemplateMap.get(withoutPrefix);
    }
    if (dynamicTemplateMap.has(withPrefix)) {
        return dynamicTemplateMap.get(withPrefix);
    }

    // 3. Normalized alphanumeric search in dynamicTemplateMap
    const cleanRequested = requestedName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanWithout = withoutPrefix.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [name, spec] of dynamicTemplateMap.entries()) {
        const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanName === cleanRequested || cleanName === cleanWithout) {
            return spec;
        }
    }

    // 4. Fallback to static TEMPLATE_CONFIG
    const staticSpec = TEMPLATE_CONFIG[requestedName] || TEMPLATE_CONFIG[withPrefix] || TEMPLATE_CONFIG[withoutPrefix];
    if (staticSpec) {
        return {
            name: requestedName,
            language: staticSpec.lang || 'en',
            status: 'CONFIG_FALLBACK',
            paramCount: staticSpec.paramCount
        };
    }

    return null;
};

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
 * Discover all candidate WABAs accessible to the access token through supported Graph API flows.
 * Distinguishes Meta Business Portfolio IDs from WABA IDs.
 */
const discoverAccessibleWabas = async (customAxios, token, configuredBusinessOrWabaId) => {
    const candidates = new Map(); // id -> { id, name, source }

    // Helper to safely fetch and add WABAs from an endpoint
    const tryFetchWabas = async (url, sourceName) => {
        try {
            const res = await customAxios.get(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const list = res.data?.data || (res.data?.id ? [res.data] : []);
            list.forEach(waba => {
                if (waba && waba.id) {
                    candidates.set(waba.id, {
                        id: waba.id,
                        name: waba.name || 'Unnamed WABA',
                        source: sourceName
                    });
                }
            });
            if (list.length > 0) {
                console.log(`[WhatsApp Meta Audit] Discovered ${list.length} WABA(s) via ${sourceName}`);
            }
        } catch (err) {
            const errDetails = getMetaErrorDetails(err);
            console.log(`[WhatsApp Meta Audit] Endpoint ${sourceName} check note: ${errDetails.formatted}`);
        }
    };

    // 1. Direct /me/owned_whatsapp_business_accounts
    await tryFetchWabas(`${GRAPH_API_BASE_URL}/me/owned_whatsapp_business_accounts?fields=id,name`, '/me/owned_whatsapp_business_accounts');

    // 2. Direct /me/assigned_whatsapp_business_accounts
    await tryFetchWabas(`${GRAPH_API_BASE_URL}/me/assigned_whatsapp_business_accounts?fields=id,name`, '/me/assigned_whatsapp_business_accounts');

    // 3. Direct /me/whatsapp_business_accounts
    await tryFetchWabas(`${GRAPH_API_BASE_URL}/me/whatsapp_business_accounts?fields=id,name`, '/me/whatsapp_business_accounts');

    // 4. Direct /me/businesses (Meta Business Portfolios), then /{business_id}/owned_whatsapp_business_accounts
    try {
        const bizRes = await customAxios.get(`${GRAPH_API_BASE_URL}/me/businesses?fields=id,name`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const businesses = bizRes.data?.data || [];
        console.log(`[WhatsApp Meta Audit] Discovered ${businesses.length} Meta Business Portfolio(s) via /me/businesses`);
        for (const biz of businesses) {
            await tryFetchWabas(`${GRAPH_API_BASE_URL}/${biz.id}/owned_whatsapp_business_accounts?fields=id,name`, `Business Portfolio ${biz.id} (${biz.name}) owned_wabas`);
            await tryFetchWabas(`${GRAPH_API_BASE_URL}/${biz.id}/client_whatsapp_business_accounts?fields=id,name`, `Business Portfolio ${biz.id} (${biz.name}) client_wabas`);
        }
    } catch (bizErr) {
        const errDetails = getMetaErrorDetails(bizErr);
        console.log(`[WhatsApp Meta Audit] /me/businesses check note: ${errDetails.formatted}`);
    }

    // 5. Configured ID (e.g., 10705793426461923): Check as Business Portfolio ID, then direct WABA
    if (configuredBusinessOrWabaId) {
        await tryFetchWabas(`${GRAPH_API_BASE_URL}/${configuredBusinessOrWabaId}/owned_whatsapp_business_accounts?fields=id,name`, `Configured ID ${configuredBusinessOrWabaId} owned_wabas`);
        await tryFetchWabas(`${GRAPH_API_BASE_URL}/${configuredBusinessOrWabaId}/client_whatsapp_business_accounts?fields=id,name`, `Configured ID ${configuredBusinessOrWabaId} client_wabas`);

        // Check if configured ID is directly a WABA
        try {
            const directRes = await customAxios.get(`${GRAPH_API_BASE_URL}/${configuredBusinessOrWabaId}?fields=id,name,timezone_id`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (directRes.data?.id) {
                candidates.set(directRes.data.id, {
                    id: directRes.data.id,
                    name: directRes.data.name || 'Direct Configured WABA',
                    source: 'configured_direct'
                });
            }
        } catch (directErr) {
            const errDetails = getMetaErrorDetails(directErr);
            console.log(`[WhatsApp Meta Audit] Configured ID ${configuredBusinessOrWabaId} direct WABA check note: ${errDetails.formatted}`);
        }
    }

    return Array.from(candidates.values());
};

/**
 * Fetch and verify production configuration and approved templates directly from Meta Graph API.
 * Uses centralized GRAPH_API_BASE_URL.
 * Verifies production phone-number ID using supported fields (no invalid fields).
 * Discovers the actual WABA ID through supported /me/owned_whatsapp_business_accounts and /me/businesses flows,
 * confirms which WABA owns the production phone-number ID,
 * retrieves all templates from Meta using the verified WABA ID,
 * and gracefully falls back to static baseline if discovery cannot complete.
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

    // 2. Inspect and verify production Phone Number ID using supported fields ONLY (no invalid fields)
    let verifiedPhoneData = null;
    if (phoneNumberId) {
        try {
            const phoneRes = await customAxios.get(`${GRAPH_API_BASE_URL}/${phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            auditReport.phoneVerification.verified = true;
            auditReport.phoneVerification.details = phoneRes.data;
            verifiedPhoneData = phoneRes.data;
            console.log(`[WhatsApp Meta Audit] Phone Number ID ${phoneNumberId} verified on Meta: Display=${phoneRes.data.display_phone_number || 'N/A'} | Verified Name=${phoneRes.data.verified_name || 'N/A'} | Status=${phoneRes.data.code_verification_status || 'VERIFIED'} | Quality=${phoneRes.data.quality_rating || 'N/A'}`);
            
            const expectedPhone = process.env.WHATSAPP_BUSINESS_PHONE;
            if (expectedPhone && phoneRes.data.display_phone_number) {
                const cleanDisplay = phoneRes.data.display_phone_number.replace(/\D/g, '');
                const cleanExpected = expectedPhone.replace(/\D/g, '');
                if (cleanDisplay.includes(cleanExpected) || cleanExpected.includes(cleanDisplay)) {
                    console.log(`[WhatsApp Meta Audit] Confirmed: Display phone number matches intended production phone (${expectedPhone}).`);
                }
            }
        } catch (phoneErr) {
            const errDetails = getMetaErrorDetails(phoneErr);
            auditReport.phoneVerification.error = errDetails.formatted;
            console.warn(`[WhatsApp Meta Audit] Phone Number ID ${phoneNumberId} check failed:`, errDetails.formatted);
        }
    } else {
        auditReport.phoneVerification.error = 'META_WA_PHONE_NUMBER_ID is not configured in environment';
        console.warn('[WhatsApp Meta Audit] META_WA_PHONE_NUMBER_ID is not configured.');
    }

    // 3. Discover Candidate WABAs via supported Meta Graph API flows and verify which one owns phoneNumberId
    const candidateWabas = await discoverAccessibleWabas(customAxios, token, configuredWabaId);
    let verifiedWaba = null;

    if (candidateWabas.length > 0 && phoneNumberId) {
        console.log(`[WhatsApp Meta Audit] Verifying ${candidateWabas.length} candidate WABA(s) against Phone Number ID ${phoneNumberId}...`);
        for (const cand of candidateWabas) {
            try {
                const phonesRes = await customAxios.get(`${GRAPH_API_BASE_URL}/${cand.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const phoneList = phonesRes.data?.data || [];
                console.log(`[WhatsApp Meta Audit] Candidate WABA ${cand.id} (${cand.name}) owns ${phoneList.length} phone number(s): ${phoneList.map(p => `${p.id} (${p.display_phone_number})`).join(', ') || 'none'}`);

                const matchedPhone = phoneList.find(p => p.id === phoneNumberId);
                if (matchedPhone) {
                    verifiedWaba = {
                        id: cand.id,
                        name: cand.name,
                        source: cand.source,
                        matchedPhone
                    };
                    console.log(`[WhatsApp Meta Audit] MATCH CONFIRMED: WABA ID ${cand.id} (${cand.name}) owns Phone Number ID ${phoneNumberId} (${matchedPhone.display_phone_number || 'N/A'})`);
                    break;
                }
            } catch (candErr) {
                const errDetails = getMetaErrorDetails(candErr);
                console.log(`[WhatsApp Meta Audit] Candidate WABA ${cand.id} /phone_numbers check note: ${errDetails.formatted}`);
            }
        }
    }

    // 4. Handle WABA Verification Outcome
    if (verifiedWaba) {
        auditReport.wabaVerification.verified = true;
        auditReport.wabaVerification.isWaba = true;
        auditReport.wabaVerification.resolvedWabaId = verifiedWaba.id;
        auditReport.wabaVerification.wabaName = verifiedWaba.name;

        // Fetch Message Templates using the verified WABA ID
        try {
            const templatesRes = await customAxios.get(`${GRAPH_API_BASE_URL}/${verifiedWaba.id}/message_templates?limit=100`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const metaTemplates = templatesRes.data?.data || [];
            console.log(`[WhatsApp Meta Audit] Successfully retrieved ${metaTemplates.length} template(s) from verified WABA (${verifiedWaba.id}).`);

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

            // Verify ERP template mappings against Meta
            console.log('[WhatsApp Meta Audit] Verifying ERP Template mappings against Meta:');
            for (const [name, config] of Object.entries(TEMPLATE_CONFIG)) {
                const resolved = resolveTemplateSpec(name);
                if (resolved && resolved.status !== 'CONFIG_FALLBACK') {
                    console.log(`  [MATCH] ${name} -> Meta Name: ${resolved.name} | Lang: ${resolved.language} | Status: ${resolved.status} | Params: ${resolved.paramCount}`);
                } else {
                    console.warn(`  [MISSING IN META] ${name} -> NOT found in Meta WABA templates!`);
                }
            }
        } catch (tplErr) {
            const tplErrDetails = getMetaErrorDetails(tplErr);
            auditReport.templatesAudit.error = tplErrDetails.formatted;
            console.warn(`[WhatsApp Meta Audit] Failed to retrieve message templates from verified WABA ${verifiedWaba.id}:`, tplErrDetails.formatted);
            console.warn('[WhatsApp Meta Audit] Preserving static TEMPLATE_CONFIG baseline (en).');
        }
    } else {
        const errorMsg = candidateWabas.length > 0 
            ? `WABA verification failed: None of the ${candidateWabas.length} candidate WABA accounts own Phone Number ID ${phoneNumberId}`
            : `WABA verification failed: No candidate WABAs could be discovered from token or configured ID ${configuredWabaId}`;
        
        auditReport.wabaVerification.verified = false;
        auditReport.wabaVerification.error = errorMsg;
        auditReport.templatesAudit.error = errorMsg;
        console.warn(`[WhatsApp Meta Audit] ${errorMsg}`);
        console.warn('[WhatsApp Meta Audit] Dynamic template sync skipped because WABA ID verification failed. Preserving static TEMPLATE_CONFIG baseline (en).');
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

        // Determine template specification via intelligent resolver
        const templateSpec = resolveTemplateSpec(templateName);
        const finalTemplateName = templateSpec?.name || templateName;
        const staticSpec = TEMPLATE_CONFIG[templateName];

        if (!templateSpec && !staticSpec) {
            console.warn(`[WhatsApp] Template '${templateName}' is not defined in internal mapping or Meta WABA.`);
        }

        // Final primary language: explicit override > templateSpec language > staticSpec lang > 'en'
        const initialLanguage = languageCode || templateSpec?.language || staticSpec?.lang || 'en';

        // Check template status on Meta if verified
        if (templateSpec && templateSpec.status && !['APPROVED', 'CONFIG_FALLBACK'].includes(templateSpec.status)) {
            const err = `Template '${finalTemplateName}' is in status '${templateSpec.status}' on Meta, not APPROVED.`;
            console.error(`[WhatsApp] ${err}`);
            throw new Error(err);
        }

        // Validate parameter count
        const expectedParamCount = templateSpec?.paramCount ?? staticSpec?.paramCount;

        // Validate Components
        if (components && components.length > 0) {
            for (let c of components) {
                if (c.type === 'body' && c.parameters) {
                    if (expectedParamCount !== undefined && c.parameters.length !== expectedParamCount) {
                        const err = `Invalid parameter count for ${finalTemplateName}. Expected ${expectedParamCount}, got ${c.parameters.length}.`;
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
            templateName: finalTemplateName,
            messageType: 'template',
            status: 'pending',
            direction: 'outbound',
            relatedEntity,
            onModel,
            idempotencyKey
        });
        await logEntry.save();

        // Build candidate languages for automatic fallback on Code 132001
        const candidateLanguages = [initialLanguage];
        const englishVariants = ['en', 'en_US', 'en_GB'];
        if (englishVariants.includes(initialLanguage)) {
            for (const variant of englishVariants) {
                if (!candidateLanguages.includes(variant)) {
                    candidateLanguages.push(variant);
                }
            }
        }

        let response = null;
        let lastError = null;
        let successfulLanguage = initialLanguage;
        const url = `${GRAPH_API_BASE_URL}/${phoneNumberId}/messages`;

        for (let langIdx = 0; langIdx < candidateLanguages.length; langIdx++) {
            const currentLang = candidateLanguages[langIdx];
            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: normalizedPhone,
                type: 'template',
                template: {
                    name: finalTemplateName,
                    language: {
                        code: currentLang
                    },
                    components: components
                }
            };

            console.log(`[WhatsApp] Sending request to Meta Graph API (${GRAPH_API_VERSION}) for template '${finalTemplateName}' [lang: ${currentLang}] (attempt ${langIdx + 1}/${candidateLanguages.length})`);

            try {
                response = await customAxios.post(url, payload, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                successfulLanguage = currentLang;
                lastError = null;
                // Cache the verified winning language into dynamicTemplateMap
                dynamicTemplateMap.set(finalTemplateName, {
                    name: finalTemplateName,
                    language: successfulLanguage,
                    status: 'APPROVED',
                    paramCount: expectedParamCount
                });
                break; // Message accepted by Meta!
            } catch (postErr) {
                lastError = postErr;
                const errDetails = getMetaErrorDetails(postErr);
                const isTranslationError = errDetails.code === 132001 || (errDetails.message && errDetails.message.includes('132001'));
                if (isTranslationError && langIdx < candidateLanguages.length - 1) {
                    console.warn(`[WhatsApp] Meta rejected template '${finalTemplateName}' for language '${currentLang}' with Code 132001. Retrying with next candidate '${candidateLanguages[langIdx + 1]}'`);
                    continue;
                }
                break;
            }
        }

        if (lastError || !response) {
            throw lastError;
        }

        const messageId = response.data.messages?.[0]?.id;
        const httpStatus = response.status;
        
        // Update Log entry with sent status and message ID
        logEntry.messageId = messageId;
        logEntry.status = 'sent';
        await logEntry.save();

        console.log(`[WhatsApp] Successfully sent template '${finalTemplateName}' to ${maskedTo} [lang: ${successfulLanguage}] | Version: ${GRAPH_API_VERSION} | HTTP: ${httpStatus} | wamid: ${messageId}`);
        return { success: true, messageId, data: response.data, language: successfulLanguage };

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
        
        // Construct and throw a clean Error instance without dumping Axios internals, config, or tokens
        const cleanError = new Error(errDetails.formatted);
        cleanError.metaError = errDetails;
        throw cleanError;
    }
};

module.exports = {
    sendTemplateMessage,
    normalizePhoneNumber,
    syncMetaTemplates,
    getMetaErrorDetails,
    resolveTemplateSpec,
    discoverAccessibleWabas,
    TEMPLATE_CONFIG,
    dynamicTemplateMap,
    GRAPH_API_VERSION,
    GRAPH_API_BASE_URL
};
