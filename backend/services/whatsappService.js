const axios = require('axios');
const WhatsAppLog = require('../models/WhatsAppLog');

// Centralized Graph API version configuration (default: v25.0)
const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v25.0';
const GRAPH_API_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Safely masks a phone number for logging (e.g. 9180****2742 or 800****742)
 */
const maskPhoneNumber = (phone) => {
    if (!phone) return 'missing';
    const clean = String(phone).replace(/\D/g, '');
    if (clean.length <= 4) return '****';
    return clean.substring(0, 3) + '****' + clean.slice(-3);
};

/**
 * Utility to normalize phone numbers safely into international E.164 format (digits only without + for Meta Graph API).
 * Handles Indian numbers (10 digits starting with 6-9, 11 digits starting with 0, 12 digits starting with 91)
 * as well as other international country codes (US/Canada +1, UK +44, UAE +971, Australia +61, Singapore +65, etc.)
 * without blindly prepending 91 to every number.
 */
const normalizePhoneNumber = (phone) => {
    if (!phone) return null;
    const str = String(phone).trim();
    if (!str) return null;

    const hasPlusPrefix = str.startsWith('+');
    const hasDoubleZeroPrefix = str.startsWith('00');
    let cleaned = str.replace(/\D/g, '');

    // Strip leading '00' international prefix if present
    if (hasDoubleZeroPrefix && cleaned.length > 10) {
        cleaned = cleaned.substring(2);
    }

    // Reject obvious garbage (repeating identical digits or fewer than 7 digits)
    if (cleaned.length < 7 || cleaned.length > 15 || /^(\d)\1+$/.test(cleaned)) {
        return null;
    }

    // If explicitly prefixed with + or 00:
    if (hasPlusPrefix || hasDoubleZeroPrefix) {
        // Handle case where a 10-digit Indian mobile had '+' prepended without 91.
        // Indian 10-digit mobiles start with 6-9, but +65 is Singapore.
        if (cleaned.length === 10 && (/^[7-9]/.test(cleaned) || (cleaned.startsWith('6') && !cleaned.startsWith('65')))) {
            return `91${cleaned}`;
        }
        // Valid international format with country code preserved
        return cleaned;
    }

    // Unprefixed numbers:
    // 1. Standard 10-digit Indian mobile number (starts with 6, 7, 8, 9)
    if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
        return `91${cleaned}`;
    }

    // 2. 11-digit Indian number with trunk 0 (e.g., 08008092742)
    if (cleaned.length === 11 && cleaned.startsWith('0') && /^[6-9]/.test(cleaned.substring(1))) {
        return `91${cleaned.substring(1)}`;
    }

    // 3. 12-digit Indian number with 91 prefix (e.g., 918008092742)
    if (cleaned.length === 12 && cleaned.startsWith('91') && /^[6-9]/.test(cleaned.substring(2))) {
        return cleaned;
    }

    // 4. North American (NANP, e.g. US/Canada: 1 + 10 digits)
    if (cleaned.length === 11 && cleaned.startsWith('1') && /^[2-9]/.test(cleaned.substring(1))) {
        return cleaned;
    }

    // 5. UK (+44 + 10 digits)
    if (cleaned.length === 12 && cleaned.startsWith('44')) {
        return cleaned;
    }

    // 6. UAE (+971 + 9 digits)
    if (cleaned.length === 12 && cleaned.startsWith('971')) {
        return cleaned;
    }

    // 7. General fallback: if 10-15 digits, return as-is
    if (cleaned.length >= 10 && cleaned.length <= 15) {
        return cleaned;
    }

    return null;
};

/**
 * Validates a customer's contact eligibility for WhatsApp messaging.
 * Checks opt-in/consent, presence of phone number, and international formatting.
 */
const validateCustomerContact = (customer, rawPhoneInput = null) => {
    const rawPhone = rawPhoneInput || (customer ? (customer.mobile || customer.phone || customer.contactNumber) : null);
    const masked = maskPhoneNumber(rawPhone);

    // 1. Check opt-in / consent
    if (customer && (customer.whatsappOptIn === false || customer.optOut === true || customer.optedOut === true || customer.consent === false)) {
        return {
            valid: false,
            phone: null,
            masked,
            reason: 'Customer has opted out of WhatsApp notifications.'
        };
    }

    // 2. Check if phone is provided
    if (!rawPhone || String(rawPhone).trim() === '') {
        return {
            valid: false,
            phone: null,
            masked: 'missing',
            reason: 'Customer phone number is missing.'
        };
    }

    // 3. Normalize and validate E.164 format
    const normalized = normalizePhoneNumber(rawPhone);
    if (!normalized || normalized.length < 10 || normalized.length > 15) {
        return {
            valid: false,
            phone: null,
            masked,
            reason: `Phone number '${masked}' is malformed or in an unsupported format.`
        };
    }

    return {
        valid: true,
        phone: normalized,
        masked: maskPhoneNumber(normalized),
        reason: null
    };
};

/**
 * Checks whether the 24-hour customer service window is active for a recipient.
 * An active session exists if an inbound message from this customer was received in the last 24 hours.
 */
const isCustomerSessionActive = async (phone) => {
    if (!phone) return false;
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return false;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last10 = normalized.slice(-10);
    try {
        const lastInbound = await WhatsAppLog.findOne({
            recipientPhone: { $in: [normalized, `+${normalized}`, last10, `+91${last10}`, `91${last10}`] },
            direction: 'inbound',
            createdAt: { $gte: cutoff }
        }).lean();
        return Boolean(lastInbound);
    } catch (err) {
        console.warn('[WhatsApp] Could not verify customer session active status:', err.message);
        return false;
    }
};

// Static fallback baseline configuration matching Meta WABA 1070579342641923
const TEMPLATE_CONFIG = {
    'mvss_welcome_customer': { lang: 'en', paramCount: 2 },
    'mvss_job_card_created': { lang: 'en', paramCount: 4 },
    'mvss_vehicle_received': { lang: 'en', paramCount: 3 },
    'mvss_inspection_completed': { lang: 'en', paramCount: 3 },
    'estimate_awaiting_customer_approval': { lang: 'en', paramCount: 4 },
    'mvss_estimate_awaiting_customer_approval': { lang: 'en', paramCount: 4 },
    'mvss_estimate_created': { lang: 'en', paramCount: 5 },
    'mvss_estimate_approved': { lang: 'en', paramCount: 5 },
    'mvss_work_started': { lang: 'en', paramCount: 3 },
    'mvss_additional_work': { lang: 'en', paramCount: 5 },
    'mvss_service_delay': { lang: 'en', paramCount: 4 },
    'mvss_vehicle_ready': { lang: 'en', paramCount: 3 },
    'mvss_job_completed': { lang: 'en', paramCount: 3 },
    'mvss_vehicle_delivered': { lang: 'en', paramCount: 4 },
    'mvss_gate_pass_generated': { lang: 'en', paramCount: 4 },
    'mvss_invoice_generated': { lang: 'en', paramCount: 5 },
    'mvss_payment_received': { lang: 'en', paramCount: 5 },
    'mvss_payment_due': { lang: 'en', paramCount: 4 },
    'mvss_insurance_claim_update': { lang: 'en', paramCount: 4 },
    'mvss_booking_confirmation': { lang: 'en', paramCount: 5 },
    'service_booking_confirmation': { lang: 'en', paramCount: 2 },
    'mvss_service_remainder': { lang: 'en', paramCount: 4 },
    'mvss_feedback_request': { lang: 'en', paramCount: 2 },
    'mvss_customer_followup': { lang: 'en', paramCount: 1 },
    'mvss_service_support': { lang: 'en', paramCount: 3 }
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

    // 5. Candidate Business Portfolio / WABA IDs: configured ID, verified Business ID 1983617422302091, and WABA asset_id 3953189031490997
    const candidateBizIds = new Set();
    if (configuredBusinessOrWabaId) candidateBizIds.add(String(configuredBusinessOrWabaId).trim());
    candidateBizIds.add('1983617422302091'); // MVSS Automobiles Meta Business Portfolio ID from WhatsApp Manager
    candidateBizIds.add('3953189031490997'); // Exact WABA asset_id from WhatsApp Manager URL

    for (const bizId of candidateBizIds) {
        await tryFetchWabas(`${GRAPH_API_BASE_URL}/${bizId}/owned_whatsapp_business_accounts?fields=id,name`, `Business ID ${bizId} owned_wabas`);
        await tryFetchWabas(`${GRAPH_API_BASE_URL}/${bizId}/client_whatsapp_business_accounts?fields=id,name`, `Business ID ${bizId} client_wabas`);

        // Check if ID is directly a WABA
        try {
            const directRes = await customAxios.get(`${GRAPH_API_BASE_URL}/${bizId}?fields=id,name,timezone_id`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (directRes.data?.id) {
                candidates.set(directRes.data.id, {
                    id: directRes.data.id,
                    name: directRes.data.name || `Direct WABA (${bizId})`,
                    source: `direct_lookup_${bizId}`
                });
            }
        } catch (directErr) {
            const errDetails = getMetaErrorDetails(directErr);
            console.log(`[WhatsApp Meta Audit] Direct ID ${bizId} check note: ${errDetails.formatted}`);
        }
    }

    // 6. Inspect /debug_token for granular_scopes (which explicitly list WABA target_ids)
    try {
        const appSecret = process.env.META_WA_APP_SECRET;
        const appId = process.env.META_WA_APP_ID || configuredBusinessOrWabaId;
        const debugAuthToken = (appId && appSecret) ? `${appId}|${appSecret}` : token;
        const debugRes = await customAxios.get(`${GRAPH_API_BASE_URL}/debug_token?input_token=${token}&access_token=${debugAuthToken}`);
        const granularScopes = debugRes.data?.data?.granular_scopes || [];
        for (const scopeObj of granularScopes) {
            if (scopeObj.target_ids && Array.isArray(scopeObj.target_ids)) {
                for (const targetId of scopeObj.target_ids) {
                    candidates.set(targetId, {
                        id: targetId,
                        name: `WABA via granular scope (${scopeObj.scope})`,
                        source: 'debug_token_granular_scopes'
                    });
                    console.log(`[WhatsApp Meta Audit] Discovered WABA ID ${targetId} from token granular scope: ${scopeObj.scope}`);
                }
            }
        }
    } catch (debugErr) {
        const errDetails = getMetaErrorDetails(debugErr);
        console.log(`[WhatsApp Meta Audit] /debug_token check note: ${errDetails.formatted}`);
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
            const templatesRes = await customAxios.get(`${GRAPH_API_BASE_URL}/${verifiedWaba.id}/message_templates?fields=name,status,category,language,components&limit=100`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const metaTemplates = templatesRes.data?.data || [];
            console.log(`[WhatsApp Meta Audit] Successfully retrieved ${metaTemplates.length} template(s) from verified WABA (${verifiedWaba.id}).`);

            metaTemplates.forEach(t => {
                const bodyComponent = t.components?.find(c => c.type && c.type.toUpperCase() === 'BODY');
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
                    paramCount,
                    bodyText: bodyComponent?.text || null,
                    example: bodyComponent?.example?.body_text?.[0] || null
                });
                console.log(`  - Meta Template -> Name: ${t.name} | Lang: ${t.language} | Status: ${t.status} | Body Params: ${paramCount}`);
            });

            auditReport.templatesAudit.success = true;
            auditReport.templatesAudit.count = metaTemplates.length;
            auditReport.templatesAudit.templates = metaTemplates.map(t => {
                const bodyComp = t.components?.find(c => c.type && c.type.toUpperCase() === 'BODY');
                return {
                    name: t.name,
                    language: t.language,
                    status: t.status,
                    paramCount: dynamicTemplateMap.get(t.name)?.paramCount || 0,
                    bodyText: bodyComp?.text || null,
                    example: bodyComp?.example?.body_text?.[0] || null,
                    components: t.components
                };
            });
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

    // 5. Direct verification for known Meta Template ID 1651560919739085 (mvss_job_card_created)
    try {
        const tplDirectRes = await customAxios.get(`${GRAPH_API_BASE_URL}/1651560919739085?fields=id,name,status,language,category,components`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (tplDirectRes.data?.id) {
            const t = tplDirectRes.data;
            const bodyComponent = t.components?.find(c => c.type === 'BODY');
            let paramCount = 4;
            if (bodyComponent && bodyComponent.text) {
                const matches = bodyComponent.text.match(/\{\{\d+\}\}/g);
                if (matches) paramCount = new Set(matches).size;
            }
            dynamicTemplateMap.set(t.name, {
                name: t.name,
                language: t.language,
                status: t.status,
                category: t.category,
                id: t.id,
                paramCount
            });
            console.log(`[WhatsApp Meta Audit] Confirmed Template ID ${t.id} directly on Meta: Name=${t.name} | Lang=${t.language} | Status=${t.status} | Params=${paramCount}`);
        }
    } catch (tplDirectErr) {
        const errDetails = getMetaErrorDetails(tplDirectErr);
        console.log(`[WhatsApp Meta Audit] Direct Template ID 1651560919739085 lookup note: ${errDetails.formatted}`);
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
    let finalTemplateName = templateName;
    let initialLanguage = languageCode || 'en';

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
        let templateSpec = resolveTemplateSpec(templateName);
        finalTemplateName = templateSpec?.name || templateName;
        const staticSpec = TEMPLATE_CONFIG[templateName];

        if (!templateSpec && !staticSpec) {
            console.warn(`[WhatsApp] Template '${templateName}' is not defined in internal mapping or Meta WABA.`);
        }

        // Final primary language: explicit override > templateSpec language > staticSpec lang > 'en'
        initialLanguage = languageCode || templateSpec?.language || staticSpec?.lang || 'en';

        // Check template status on Meta if verified
        if (templateSpec && templateSpec.status && !['APPROVED', 'CONFIG_FALLBACK'].includes(templateSpec.status)) {
            // If cached as PENDING, attempt an on-demand re-sync from Meta to check if it transitioned to APPROVED
            if (templateSpec.status === 'PENDING') {
                try {
                    await syncMetaTemplates(customAxios);
                    const refreshed = resolveTemplateSpec(templateName);
                    if (refreshed) {
                        templateSpec = refreshed;
                    }
                } catch (syncErr) {
                    // Continue with status check
                }
            }

            if (!['APPROVED', 'CONFIG_FALLBACK'].includes(templateSpec.status)) {
                const err = `Template '${finalTemplateName}' is in status '${templateSpec.status}' on Meta, not APPROVED.`;
                console.error(`[WhatsApp] ${err}`);
                throw new Error(err);
            }
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
            try {
                const existingLog = await WhatsAppLog.findOne({ idempotencyKey });
                if (existingLog) {
                    console.log(`[WhatsApp] Duplicate skipped for key: ${idempotencyKey}`);
                    return { success: true, messageId: existingLog.messageId, status: 'duplicate_skipped' };
                }
            } catch (dbReadErr) {
                console.warn(`[WhatsApp] Warning: Failed to query existing WhatsAppLog for idempotencyKey '${idempotencyKey}':`, dbReadErr.message || dbReadErr);
            }
        }

        // Create or update pending log entry using atomic upsert (prevents E11000 duplicate key error)
        let logEntry = null;
        if (idempotencyKey) {
            try {
                logEntry = await WhatsAppLog.findOneAndUpdate(
                    { idempotencyKey },
                    {
                        $setOnInsert: {
                            recipientName,
                            recipientPhone: normalizedPhone,
                            templateName: finalTemplateName,
                            messageType: 'template',
                            direction: 'outbound',
                            language: initialLanguage,
                            components: components || [],
                            relatedEntity,
                            onModel,
                            idempotencyKey,
                            createdAt: new Date()
                        },
                        $set: {
                            lastAttemptAt: new Date(),
                            status: 'pending'
                        }
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            } catch (logSaveErr) {
                console.error(`[WhatsApp] Warning: Failed to upsert initial pending WhatsAppLog:`, logSaveErr.message || logSaveErr);
                logEntry = null;
            }
        }

        // Construct Meta API Payload with configured template and language
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: normalizedPhone,
            type: 'template',
            template: {
                name: finalTemplateName,
                language: {
                    code: initialLanguage
                },
                components: components
            }
        };

        const url = `${GRAPH_API_BASE_URL}/${phoneNumberId}/messages`;
        console.log(`[WhatsApp] Sending request to Meta Graph API (${GRAPH_API_VERSION}) for template '${finalTemplateName}' [lang: ${initialLanguage}]`);

        const response = await customAxios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const messageId = response.data.messages?.[0]?.id;
        const httpStatus = response.status;
        
        // Update Log entry with sent status and message ID atomically
        if (idempotencyKey) {
            try {
                await WhatsAppLog.findOneAndUpdate(
                    { idempotencyKey },
                    {
                        $set: {
                            status: 'sent',
                            messageId,
                            lastAttemptAt: new Date()
                        }
                    },
                    { new: true }
                );
            } catch (updateLogErr) {
                console.error(`[WhatsApp] Warning: Failed to persist sent status in WhatsAppLog:`, updateLogErr.message || updateLogErr);
            }
        }

        console.log(`[WhatsApp] Successfully sent template '${finalTemplateName}' to ${maskedTo} [lang: ${initialLanguage}] | Version: ${GRAPH_API_VERSION} | HTTP: ${httpStatus} | wamid: ${messageId}`);
        return { success: true, messageId, data: response.data, language: initialLanguage };

    } catch (error) {
        const errDetails = getMetaErrorDetails(error);

        if (errDetails.status) {
            console.error(`[WhatsApp] Meta API Error -> To: ${maskedTo} | Version: ${GRAPH_API_VERSION} | ${errDetails.formatted}`);
        } else {
            console.error(`[WhatsApp] Internal/Network Error -> To: ${maskedTo} | Msg: ${errDetails.message}`);
        }
        
        // Mark log as failed atomically
        if (idempotencyKey) {
            try {
                await WhatsAppLog.findOneAndUpdate(
                    { idempotencyKey },
                    {
                        $set: {
                            status: 'failed',
                            errorMessage: errDetails.formatted,
                            metaErrorCode: String(errDetails.code || ''),
                            lastAttemptAt: new Date()
                        },
                        $setOnInsert: {
                            recipientName,
                            recipientPhone: to ? normalizePhoneNumber(to) || to : 'Unknown',
                            templateName: finalTemplateName,
                            messageType: 'template',
                            direction: 'outbound',
                            language: initialLanguage,
                            components: components || [],
                            relatedEntity,
                            onModel,
                            idempotencyKey,
                            createdAt: new Date()
                        }
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            } catch (logErr) {
                console.error('[WhatsApp] Failed to save error log via atomic upsert:', logErr.message);
            }
        }
        
        // Construct and throw a clean Error instance without dumping Axios internals, config, or tokens
        const cleanError = new Error(errDetails.formatted);
        cleanError.metaError = errDetails;
        throw cleanError;
    }
};

/**
 * Send a document/PDF attachment message via Meta WhatsApp Cloud API
 */
const sendDocumentMessage = async ({
    to,
    documentUrl,
    pdfBuffer,
    filename = 'Customer_Estimate.pdf',
    caption = '',
    recipientName = 'Unknown',
    relatedEntity,
    onModel = 'Estimate',
    idempotencyKey
}, customAxios = axios) => {
    const maskedTo = to ? to.substring(0, 3) + '****' + to.slice(-3) : 'unknown';

    try {
        const token = process.env.META_WA_ACCESS_TOKEN;
        const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;

        if (!token || !phoneNumberId) {
            const err = 'API credentials missing (META_WA_ACCESS_TOKEN or META_WA_PHONE_NUMBER_ID). Skipping document message.';
            console.warn(`[WhatsApp] ${err}`);
            throw new Error(err);
        }

        const normalizedPhone = normalizePhoneNumber(to);
        if (!normalizedPhone || normalizedPhone.length < 10) {
            const err = `Invalid phone number: ${to}`;
            console.warn(`[WhatsApp] ${err}`);
            throw new Error(err);
        }

        if (!documentUrl && !pdfBuffer) {
            const err = 'Either documentUrl or pdfBuffer must be provided to send a WhatsApp document message.';
            console.error(`[WhatsApp] ${err}`);
            throw new Error(err);
        }

        // Idempotency Check: Prevent duplicate messages for the same event
        if (idempotencyKey) {
            try {
                const existingLog = await WhatsAppLog.findOne({ idempotencyKey });
                if (existingLog && ['sent', 'delivered', 'read'].includes(existingLog.status)) {
                    console.log(`[WhatsApp] Duplicate document skipped for key: ${idempotencyKey}`);
                    return { success: true, messageId: existingLog.messageId, status: 'duplicate_skipped', alreadySent: true };
                }
            } catch (dbReadErr) {
                console.warn(`[WhatsApp] Warning: Failed to query existing WhatsAppLog for idempotencyKey '${idempotencyKey}':`, dbReadErr.message || dbReadErr);
            }
        }

        // Create or update pending log entry using atomic upsert (prevents E11000 duplicate key error)
        let logEntry = null;
        if (idempotencyKey) {
            try {
                logEntry = await WhatsAppLog.findOneAndUpdate(
                    { idempotencyKey },
                    {
                        $setOnInsert: {
                            recipientName,
                            recipientPhone: normalizedPhone,
                            templateName: 'document_attachment',
                            messageType: 'document',
                            direction: 'outbound',
                            pdfUrl: documentUrl || '',
                            caption: caption || '',
                            relatedEntity,
                            onModel,
                            idempotencyKey,
                            createdAt: new Date()
                        },
                        $set: {
                            lastAttemptAt: new Date(),
                            status: 'pending'
                        }
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            } catch (logSaveErr) {
                console.error(`[WhatsApp] Warning: Failed to upsert initial pending WhatsAppLog:`, logSaveErr.message || logSaveErr);
                logEntry = null;
            }
        }

        // Construct Meta Document Message Payload
        const documentPayload = {
            filename: filename || 'Customer_Estimate.pdf'
        };

        if (caption) {
            documentPayload.caption = String(caption);
        }

        // Try direct Meta media upload if buffer is available
        if (pdfBuffer && typeof FormData !== 'undefined' && typeof Blob !== 'undefined') {
            try {
                const formData = new FormData();
                const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
                formData.append('file', blob, filename || 'Customer_Estimate.pdf');
                formData.append('type', 'application/pdf');
                formData.append('messaging_product', 'whatsapp');

                const mediaRes = await customAxios.post(
                    `${GRAPH_API_BASE_URL}/${phoneNumberId}/media`,
                    formData,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    }
                );
                if (mediaRes.data?.id) {
                    documentPayload.id = mediaRes.data.id;
                    console.log(`[WhatsApp] Uploaded PDF media directly to Meta: mediaId=${documentPayload.id}`);
                }
            } catch (mediaErr) {
                console.warn(`[WhatsApp] Meta Media direct upload note: ${mediaErr.message || mediaErr}.`);
            }
        }

        // If media ID wasn't set, use publicly accessible link
        if (!documentPayload.id && documentUrl) {
            documentPayload.link = documentUrl;
        }

        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: normalizedPhone,
            type: 'document',
            document: documentPayload
        };

        const url = `${GRAPH_API_BASE_URL}/${phoneNumberId}/messages`;
        console.log(`[WhatsApp] Sending document message to Meta Graph API (${GRAPH_API_VERSION}) to ${maskedTo} [Filename: ${filename}]`);

        const response = await customAxios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const messageId = response.data.messages?.[0]?.id;
        const httpStatus = response.status;

        // Update Log entry with sent status and message ID atomically
        if (idempotencyKey) {
            try {
                await WhatsAppLog.findOneAndUpdate(
                    { idempotencyKey },
                    {
                        $set: {
                            status: 'sent',
                            messageId,
                            pdfUrl: documentUrl || '',
                            caption: caption || '',
                            lastAttemptAt: new Date()
                        }
                    },
                    { new: true }
                );
            } catch (updateLogErr) {
                console.error(`[WhatsApp] Warning: Failed to persist sent status in WhatsAppLog:`, updateLogErr.message || updateLogErr);
            }
        }

        console.log(`[WhatsApp] Successfully sent document to ${maskedTo} | Version: ${GRAPH_API_VERSION} | HTTP: ${httpStatus} | wamid: ${messageId}`);
        return { success: true, messageId, data: response.data, pdfUrl: documentUrl };

    } catch (error) {
        const errDetails = getMetaErrorDetails(error);

        if (errDetails.status) {
            console.error(`[WhatsApp] Meta API Document Error -> To: ${maskedTo} | Version: ${GRAPH_API_VERSION} | ${errDetails.formatted}`);
        } else {
            console.error(`[WhatsApp] Internal/Network Document Error -> To: ${maskedTo} | Msg: ${errDetails.message}`);
        }

        // Mark log as failed atomically
        if (idempotencyKey) {
            try {
                await WhatsAppLog.findOneAndUpdate(
                    { idempotencyKey },
                    {
                        $set: {
                            status: 'failed',
                            errorMessage: errDetails.formatted,
                            metaErrorCode: String(errDetails.code || ''),
                            lastAttemptAt: new Date()
                        },
                        $setOnInsert: {
                            recipientName,
                            recipientPhone: to ? normalizePhoneNumber(to) || to : 'Unknown',
                            templateName: 'document_attachment',
                            messageType: 'document',
                            direction: 'outbound',
                            pdfUrl: documentUrl || '',
                            caption: caption || '',
                            relatedEntity,
                            onModel,
                            idempotencyKey,
                            createdAt: new Date()
                        }
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            } catch (logErr) {
                console.error('[WhatsApp] Failed to save document error log via atomic upsert:', logErr.message);
            }
        }

        const cleanError = new Error(errDetails.formatted);
        cleanError.metaError = errDetails;
        throw cleanError;
    }
};

/**
 * Create/register the Customer Estimate Document Template with Meta Graph API
 */
const createDocumentTemplate = async (customAxios = axios) => {
    const token = process.env.META_WA_ACCESS_TOKEN;
    const wabaId = process.env.META_WA_BUSINESS_ACCOUNT_ID;
    if (!token || !wabaId) {
        return { success: false, error: 'Meta credentials missing (META_WA_ACCESS_TOKEN or META_WA_BUSINESS_ACCOUNT_ID)' };
    }

    const payload = {
        name: 'mvss_customer_estimate_doc',
        category: 'UTILITY',
        language: 'en',
        components: [
            {
                type: 'HEADER',
                format: 'DOCUMENT',
                example: {
                    header_handle: [
                        'https://mvss-erp-backend.onrender.com/uploads/estimates/sample_estimate.pdf'
                    ]
                }
            },
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nThe service estimate for your vehicle {{2}} has been prepared by MVSS Automobiles.\n\nEstimate No: {{3}}\nJob Card No: {{4}}\nEstimated Amount: ₹{{5}}\n\nPlease review the attached estimate PDF.\n\nThank you,\nMVSS Automobiles',
                example: {
                    body_text: [
                        ['Valued Customer', 'TS09EA1234', 'MVSS/EST/26-27/078', 'JC-1001', '3,681.60']
                    ]
                }
            }
        ]
    };

    try {
        const response = await customAxios.post(
            `${GRAPH_API_BASE_URL}/${wabaId}/message_templates`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('[WhatsApp] Document template submission response:', response.data);
        return { success: true, data: response.data };
    } catch (err) {
        const details = getMetaErrorDetails(err);
        console.warn('[WhatsApp] Document template registration note:', details.formatted);
        return { success: false, error: details.formatted, details };
    }
};

module.exports = {
    sendTemplateMessage,
    sendDocumentMessage,
    normalizePhoneNumber,
    maskPhoneNumber,
    validateCustomerContact,
    syncMetaTemplates,
    createDocumentTemplate,
    getMetaErrorDetails,
    resolveTemplateSpec,
    discoverAccessibleWabas,
    TEMPLATE_CONFIG,
    dynamicTemplateMap,
    isCustomerSessionActive,
    GRAPH_API_VERSION,
    GRAPH_API_BASE_URL
};
