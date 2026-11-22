const axios = require('axios');
const WhatsAppLog = require('../models/WhatsAppLog');

// Official Meta WhatsApp Business Account & Sender configuration
// Sender: +91 91771 77509 | Phone Number ID: 1435390016330145 | WABA ID: 4778078332414981
const OFFICIAL_PHONE_NUMBER_ID = '1435390016330145';
const OFFICIAL_WABA_ID = '4778078332414981';
const OFFICIAL_SENDER_PHONE = '919177177509';

let resolvedVerifiedWabaId = null;

const getEffectivePhoneNumberId = () => {
    const envId = process.env.META_WA_PHONE_NUMBER_ID;
    if (!envId || envId === '1391083524077434' || envId === '1446113211917959') {
        return OFFICIAL_PHONE_NUMBER_ID;
    }
    return envId;
};

const getEffectiveWabaId = () => {
    if (resolvedVerifiedWabaId) return resolvedVerifiedWabaId;
    const envWaba = process.env.META_WA_BUSINESS_ACCOUNT_ID;
    if (!envWaba || envWaba === '10705793426461923' || envWaba === '1070579342641923' || envWaba === '1718873676471685' || envWaba === '2021254895254703') {
        return OFFICIAL_WABA_ID;
    }
    return envWaba;
};

const getEffectiveSenderPhone = () => {
    const envPhone = process.env.WHATSAPP_BUSINESS_PHONE;
    if (!envPhone || envPhone.includes('7674819765')) {
        return OFFICIAL_SENDER_PHONE;
    }
    return envPhone;
};

// Centralized Graph API version configuration (default: v22.0)
const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v22.0';
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

/**
 * Checks detailed 24-hour customer service window status for a recipient phone.
 */
const getCustomerSessionStatus = async (phone) => {
    if (!phone) return { active: false, reason: 'Phone number missing' };
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return { active: false, reason: 'Invalid phone number' };
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last10 = normalized.slice(-10);
    try {
        const lastInbound = await WhatsAppLog.findOne({
            recipientPhone: { $in: [normalized, `+${normalized}`, last10, `+91${last10}`, `91${last10}`] },
            direction: 'inbound'
        }).sort({ createdAt: -1 }).lean();

        if (!lastInbound) {
            return {
                active: false,
                reason: 'No previous customer message received. 24-hour window is closed.',
                lastInboundAt: null,
                hoursRemaining: 0
            };
        }

        const isWithin24Hours = new Date(lastInbound.createdAt) >= cutoff;
        const expiresAt = new Date(new Date(lastInbound.createdAt).getTime() + 24 * 60 * 60 * 1000);
        const msRemaining = Math.max(0, expiresAt.getTime() - Date.now());
        const hoursRemaining = Number((msRemaining / (1000 * 60 * 60)).toFixed(1));

        return {
            active: isWithin24Hours,
            lastInboundAt: lastInbound.createdAt,
            expiresAt: isWithin24Hours ? expiresAt : null,
            hoursRemaining: isWithin24Hours ? hoursRemaining : 0,
            reason: isWithin24Hours ? null : 'Customer WhatsApp session has expired. Please use an approved WhatsApp template to contact the customer.'
        };
    } catch (err) {
        console.warn('[WhatsApp] Could not verify customer session status:', err.message);
        return { active: false, reason: err.message };
    }
};

// Static fallback baseline configuration matching Meta WABA 2021254895254703
const TEMPLATE_CONFIG = {
    'mvss_welcome_customer': { lang: 'en', paramCount: 2 },
    'mvss_job_card_created': { lang: 'en', paramCount: 4 },
    'mvss_vehicle_received': { lang: 'en', paramCount: 3 },
    'mvss_inspection_completed': { lang: 'en', paramCount: 3 },
    'estimate_awaiting_customer_approval': { lang: 'en', paramCount: 4 },
    'mvss_estimate_awaiting_customer_approval': { lang: 'en', paramCount: 4 },
    'mvss_estimate_created': { lang: 'en', paramCount: 5 },
    'mvss_customer_estimate_doc': { lang: 'en', paramCount: 5, headerFormat: 'DOCUMENT', status: 'APPROVED' },
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
    'mvss_service_support': { lang: 'en', paramCount: 3 },
    'mvss_vehicle_photos_available': { lang: 'en', paramCount: 3, category: 'UTILITY' },
    'mvss_vehicle_photos': { lang: 'en', paramCount: 3, category: 'UTILITY' }
};

// Dynamic cache of templates verified directly from Meta Graph API
const dynamicTemplateMap = new Map(); // APPROVED templates
const pendingTemplateMap = new Map(); // PENDING approval templates
const rejectedTemplateMap = new Map(); // REJECTED templates (with rejectedReason)

/**
 * Human-readable mapping of template names to user-friendly automation names
 */
const getHumanAutomationName = (name) => {
    const map = {
        'mvss_welcome_customer': 'Customer Welcome',
        'mvss_job_card_created': 'Job Card Created',
        'mvss_vehicle_received': 'Vehicle Received',
        'estimate_awaiting_customer_approval': 'Estimate Awaiting Customer Approval',
        'mvss_estimate_awaiting_customer_approval': 'Estimate Awaiting Approval (Alias)',
        'mvss_customer_estimate_doc': 'Customer Estimate PDF Document',
        'mvss_estimate_created': 'Estimate Created Notification',
        'mvss_estimate_approved': 'Estimate Approved Confirmation',
        'mvss_additional_work': 'Additional Work Authorization',
        'mvss_service_delay': 'Service Delay Notification',
        'mvss_vehicle_ready': 'Vehicle Ready for Delivery',
        'mvss_job_completed': 'Job Completed / Quality Inspection',
        'mvss_vehicle_delivered': 'Vehicle Delivered Confirmation',
        'mvss_gate_pass_generated': 'Gate Pass Issued',
        'mvss_payment_received': 'Payment Received Receipt',
        'mvss_payment_due': 'Payment Due Reminder',
        'mvss_feedback_request': 'Customer Feedback Request',
        'mvss_insurance_claim_update': 'Insurance Claim Status Update',
        'mvss_booking_confirmation': 'Service Booking Confirmation',
        'service_booking_confirmation': 'Booking Confirmation (Short)',
        'mvss_vehicle_photos_available': 'Vehicle Photos Available',
        'mvss_vehicle_photos': 'Vehicle Photos Attachment',
        'mvss_service_remainder': 'Service Due Reminder',
        'mvss_customer_followup': 'Customer Follow-up Check',
        'mvss_service_support': 'Customer Service Support',
        'mvss_inspection_completed': 'Inspection Completed (Disabled)',
        'mvss_invoice_generated': 'Invoice Generated (Disabled)',
        'mvss_work_started': 'Work Started (Disabled)'
    };
    return map[name] || name;
};

/**
 * Canonical specifications for all MVSS Automobiles ERP templates.
 * Used for automated registration in Meta WABA and strict parameter auditing.
 */
const CANONICAL_TEMPLATES = {
    'mvss_welcome_customer': {
        name: 'mvss_welcome_customer',
        category: 'UTILITY',
        language: 'en',
        paramCount: 2,
        variableMapping: ['Customer Name', 'Vehicle Number'],
        automationKey: 'welcome',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nWelcome to MVSS Automobiles! Your vehicle {{2}} has been registered with us for service and care.\n\nThank you for choosing MVSS Automobiles.',
                example: { body_text: [['Valued Customer', 'TS09EA1234']] }
            }
        ]
    },
    'mvss_job_card_created': {
        name: 'mvss_job_card_created',
        category: 'UTILITY',
        language: 'en',
        paramCount: 4,
        variableMapping: ['Customer Name', 'Job Card Number', 'Vehicle Number', 'Service Details'],
        automationKey: 'job_card_created',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nJob Card {{2}} has been created for your vehicle {{3}} at MVSS Automobiles.\n\nService Details: {{4}}\n\nWe will keep you updated on the progress.\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'MVSS/JC/26-27/053', 'TS09EA1234', 'General Service']] }
            }
        ]
    },
    'mvss_vehicle_received': {
        name: 'mvss_vehicle_received',
        category: 'UTILITY',
        language: 'en',
        paramCount: 3,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Job Card Number'],
        automationKey: 'vehicle_received',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nYour vehicle {{2}} has been received at MVSS Automobiles workshop for Job Card {{3}}.\n\nOur service team will begin inspection shortly.\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/JC/26-27/053']] }
            }
        ]
    },
    'estimate_awaiting_customer_approval': {
        name: 'estimate_awaiting_customer_approval',
        category: 'UTILITY',
        language: 'en',
        paramCount: 4,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Estimate Number', 'Estimated Amount'],
        automationKey: 'estimate_created',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nThe service estimate for your vehicle {{2}} is ready for your review.\n\nEstimate No: {{3}}\nEstimated Total: ₹{{4}}\n\nPlease reply with "APPROVED" to authorize the work or contact us for any clarification.\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/EST/26-27/001', '14,500.00']] }
            }
        ]
    },
    'mvss_estimate_awaiting_customer_approval': {
        name: 'mvss_estimate_awaiting_customer_approval',
        category: 'UTILITY',
        language: 'en',
        paramCount: 4,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Estimate Number', 'Estimated Amount'],
        automationKey: 'estimate_created',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nThe service estimate for your vehicle {{2}} is ready for your review.\n\nEstimate No: {{3}}\nEstimated Total: ₹{{4}}\n\nPlease reply with "APPROVED" to authorize the work or contact us for any clarification.\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/EST/26-27/001', '14,500.00']] }
            }
        ]
    },
    'mvss_customer_estimate_doc': {
        name: 'mvss_customer_estimate_doc',
        category: 'UTILITY',
        language: 'en',
        paramCount: 5,
        headerFormat: 'DOCUMENT',
        variableMapping: ['Customer Name', 'Vehicle Number', 'Estimate Number', 'Job Card Number', 'Estimated Amount'],
        automationKey: 'estimate_created',
        components: [
            {
                type: 'HEADER',
                format: 'DOCUMENT'
            },
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nThe service estimate for your vehicle {{2}} has been prepared by MVSS Automobiles.\n\nEstimate No: {{3}}\nJob Card No: {{4}}\nEstimated Amount: ₹{{5}}\n\nPlease review the attached estimate PDF.\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/EST/26-27/001', 'MVSS/JC/26-27/053', '14,500.00']] }
            }
        ]
    },
    'mvss_estimate_created': {
        name: 'mvss_estimate_created',
        category: 'UTILITY',
        language: 'en',
        paramCount: 5,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Estimate Number', 'Job Card Number', 'Estimated Amount'],
        automationKey: 'estimate_created',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nA service estimate has been generated for your vehicle {{2}} at MVSS Automobiles.\n\nEstimate No: {{3}}\nJob Card No: {{4}}\nTotal Estimate: ₹{{5}}\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/EST/26-27/001', 'MVSS/JC/26-27/053', '14,500.00']] }
            }
        ]
    },
    'mvss_estimate_approved': {
        name: 'mvss_estimate_approved',
        category: 'UTILITY',
        language: 'en',
        paramCount: 5,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Estimate Number', 'Job Card Number', 'Approved Amount'],
        automationKey: 'estimate_approved',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nThank you for approving the service estimate for your vehicle {{2}}.\n\nEstimate No: {{3}}\nJob Card No: {{4}}\nApproved Total: ₹{{5}}\n\nOur technicians will proceed with the service work.\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/EST/26-27/001', 'MVSS/JC/26-27/053', '14,500.00']] }
            }
        ]
    },
    'mvss_additional_work': {
        name: 'mvss_additional_work',
        category: 'UTILITY',
        language: 'en',
        paramCount: 5,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Job Card Number', 'Additional Work Description', 'Amount'],
        automationKey: 'estimate_approved',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nAdditional work has been identified for your vehicle {{2}} under Job Card {{3}}.\n\nWork Details: {{4}}\nAmount: ₹{{5}}\n\nPlease contact your service advisor or reply to authorize this additional work.\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/JC/26-27/053', 'Brake pad replacement', '4,200.00']] }
            }
        ]
    },
    'mvss_service_delay': {
        name: 'mvss_service_delay',
        category: 'UTILITY',
        language: 'en',
        paramCount: 4,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Job Card Number', 'Delay Reason / Status'],
        automationKey: 'service_delay',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nWe wanted to inform you of an update regarding your vehicle {{2}} for Job Card {{3}}.\n\nStatus: {{4}}\n\nWe are working to complete the service as quickly as possible. Thank you for your patience.\n\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/JC/26-27/053', 'Waiting for spare parts arrival']] }
            }
        ]
    },
    'mvss_vehicle_ready': {
        name: 'mvss_vehicle_ready',
        category: 'UTILITY',
        language: 'en',
        paramCount: 3,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Job Card Number'],
        automationKey: 'vehicle_ready',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nGreat news! Your vehicle {{2}} is ready for delivery at MVSS Automobiles.\n\nJob Card No: {{3}}\n\nPlease visit our service center to collect your vehicle.\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/JC/26-27/053']] }
            }
        ]
    },
    'mvss_job_completed': {
        name: 'mvss_job_completed',
        category: 'UTILITY',
        language: 'en',
        paramCount: 3,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Job Card Number'],
        automationKey: 'job_completed',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nAll service and repair work has been completed for your vehicle {{2}} under Job Card {{3}}.\n\nOur team is conducting the final quality inspection.\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/JC/26-27/053']] }
            }
        ]
    },
    'mvss_vehicle_delivered': {
        name: 'mvss_vehicle_delivered',
        category: 'UTILITY',
        language: 'en',
        paramCount: 4,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Job Card Number', 'Invoice Number'],
        automationKey: 'vehicle_delivered',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nYour vehicle {{2}} has been successfully delivered under Job Card {{3}} with Invoice No: {{4}}.\n\nThank you for choosing MVSS Automobiles! We wish you a safe drive.\n\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/JC/26-27/053', 'MVSS/INV/26-27/005']] }
            }
        ]
    },
    'mvss_gate_pass_generated': {
        name: 'mvss_gate_pass_generated',
        category: 'UTILITY',
        language: 'en',
        paramCount: 4,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Job Card Number', 'Gate Pass Number'],
        automationKey: 'gate_pass',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nA Gate Pass has been issued for your vehicle {{2}}.\n\nGate Pass No: {{4}}\nJob Card No: {{3}}\n\nPlease present this Gate Pass at security for vehicle exit.\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/JC/26-27/053', 'MVSS/GP/26-27/012']] }
            }
        ]
    },
    'mvss_payment_received': {
        name: 'mvss_payment_received',
        category: 'UTILITY',
        language: 'en',
        paramCount: 5,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Invoice Number', 'Amount Paid', 'Payment Status'],
        automationKey: 'payment_received',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nWe have received payment of ₹{{4}} for your vehicle {{2}} towards Invoice No: {{3}}.\n\nStatus: {{5}}\n\nThank you for your business!\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/INV/26-27/001', '16,800.00', 'Paid']] }
            }
        ]
    },
    'mvss_payment_due': {
        name: 'mvss_payment_due',
        category: 'UTILITY',
        language: 'en',
        paramCount: 4,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Invoice Number', 'Balance Due Amount'],
        automationKey: 'payment_due',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nThis is a gentle payment reminder for your vehicle {{2}}.\n\nInvoice No: {{3}}\nOutstanding Balance: ₹{{4}}\n\nPlease arrange for payment at your earliest convenience.\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/INV/26-27/001', '3,500.00']] }
            }
        ]
    },
    'mvss_feedback_request': {
        name: 'mvss_feedback_request',
        category: 'UTILITY',
        language: 'en',
        paramCount: 2,
        variableMapping: ['Customer Name', 'Feedback Rating Prompt'],
        automationKey: 'feedback_request',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nThank you for visiting MVSS Automobiles!\n\n{{2}}\n\nYour feedback helps us continuously improve our service.\n\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'For vehicle TS09EA1234: Reply directly with a rating from 1 to 5 stars (1=Poor, 5=Excellent) and a short description of your experience.']] }
            }
        ]
    },
    'mvss_insurance_claim_update': {
        name: 'mvss_insurance_claim_update',
        category: 'UTILITY',
        language: 'en',
        paramCount: 4,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Claim Number', 'Claim Status'],
        automationKey: 'insurance_claim',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nInsurance claim update for your vehicle {{2}}:\n\nClaim No: {{3}}\nCurrent Status: {{4}}\n\nWe will notify you of further developments.\n\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'CLM-2026-008', 'Approved']] }
            }
        ]
    },
    'mvss_booking_confirmation': {
        name: 'mvss_booking_confirmation',
        category: 'UTILITY',
        language: 'en',
        paramCount: 5,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Service Type', 'Preferred Date', 'Workshop Name'],
        automationKey: 'booking_confirmation',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nYour service booking at {{5}} is confirmed for vehicle {{2}}.\n\nService: {{3}}\nPreferred Date: {{4}}\n\nWe look forward to serving you!\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'Periodic Maintenance', '2026-11-25', 'MVSS Automobiles']] }
            }
        ]
    },
    'service_booking_confirmation': {
        name: 'service_booking_confirmation',
        category: 'UTILITY',
        language: 'en',
        paramCount: 2,
        variableMapping: ['Customer Name', 'Booking Details'],
        automationKey: 'booking_confirmation',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nYour service appointment at MVSS Automobiles is confirmed.\n\nDetails: {{2}}\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'Service booked for vehicle TS09EA1234 on 2026-11-25']] }
            }
        ]
    },
    'mvss_vehicle_photos_available': {
        name: 'mvss_vehicle_photos_available',
        category: 'UTILITY',
        language: 'en',
        paramCount: 3,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Job Card Number'],
        automationKey: 'vehicle_photos',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nMVSS Automobiles has vehicle inspection/service photos available for your vehicle {{2}}.\n\nJob Card No: {{3}}.\n\nPlease reply to this message to receive your vehicle photos.\n\nThank you,\nMVSS Automobiles.',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/JC/26-27/053']] }
            }
        ]
    },
    'mvss_vehicle_photos': {
        name: 'mvss_vehicle_photos',
        category: 'UTILITY',
        language: 'en',
        paramCount: 3,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Job Card Number'],
        automationKey: 'vehicle_photos',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nService photos for your vehicle {{2}} (Job Card {{3}}) are available from MVSS Automobiles.\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/JC/26-27/053']] }
            }
        ]
    },
    'mvss_service_remainder': {
        name: 'mvss_service_remainder',
        category: 'UTILITY',
        language: 'en',
        paramCount: 4,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Due Date', 'Recommended Service'],
        automationKey: 'service_remainder',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nThis is a friendly service reminder from MVSS Automobiles for your vehicle {{2}}.\n\nDue Date: {{3}}\nRecommended Service: {{4}}\n\nPlease contact us to schedule your appointment.',
                example: { body_text: [['Valued Customer', 'TS09EA1234', '2026-12-01', 'Periodic Maintenance']] }
            }
        ]
    },
    'mvss_customer_followup': {
        name: 'mvss_customer_followup',
        category: 'UTILITY',
        language: 'en',
        paramCount: 1,
        variableMapping: ['Customer Name'],
        automationKey: 'customer_followup',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nGreetings from MVSS Automobiles! We hope your vehicle is performing well after its recent service. If you need any assistance, please feel free to reach out to us.',
                example: { body_text: [['Valued Customer']] }
            }
        ]
    },
    'mvss_service_support': {
        name: 'mvss_service_support',
        category: 'UTILITY',
        language: 'en',
        paramCount: 3,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Job Card Number'],
        automationKey: 'service_support',
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nRegarding your inquiry for vehicle {{2}} under Job Card {{3}}: our customer support team is available to assist you. Please reply to this message or call our helpline.',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/JC/26-27/053']] }
            }
        ]
    },
    // The 3 explicitly disabled automations per client directive
    'mvss_inspection_completed': {
        name: 'mvss_inspection_completed',
        category: 'UTILITY',
        language: 'en',
        paramCount: 3,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Job Card Number'],
        automationKey: 'inspection_completed',
        disabled: true,
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nQuality inspection has been completed for your vehicle {{2}} under Job Card {{3}} at MVSS Automobiles.\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/JC/26-27/053']] }
            }
        ]
    },
    'mvss_invoice_generated': {
        name: 'mvss_invoice_generated',
        category: 'UTILITY',
        language: 'en',
        paramCount: 5,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Invoice Number', 'Job Card Number', 'Grand Total'],
        automationKey: 'invoice_generated',
        disabled: true,
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nAn invoice has been generated for your vehicle {{2}} at MVSS Automobiles.\n\nInvoice No: {{3}}\nJob Card No: {{4}}\nTotal Amount: ₹{{5}}\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/INV/26-27/005', 'MVSS/JC/26-27/053', '16,800.00']] }
            }
        ]
    },
    'mvss_work_started': {
        name: 'mvss_work_started',
        category: 'UTILITY',
        language: 'en',
        paramCount: 3,
        variableMapping: ['Customer Name', 'Vehicle Number', 'Job Card Number'],
        automationKey: 'work_started',
        disabled: true,
        components: [
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nService work has commenced on your vehicle {{2}} for Job Card {{3}} at MVSS Automobiles.\n\nWe will keep you updated on progress.\n\nThank you,\nMVSS Automobiles',
                example: { body_text: [['Valued Customer', 'TS09EA1234', 'MVSS/JC/26-27/053']] }
            }
        ]
    }
};

/**
 * Central Automation Kill-Switches & Feature Flags
 * Per client requirements, the following 3 automations are explicitly DISABLED by default:
 * 1. Inspection Completed (mvss_inspection_completed)
 * 2. Invoice Generated (mvss_invoice_generated)
 * 3. Work Started (mvss_work_started)
 * 
 * All other approved automations (Welcome, Delivery, Feedback, Estimates, Payments, etc.) remain ENABLED.
 * Flags can be toggled via environment variables or runtime configuration methods.
 */
const AUTOMATION_FLAGS = {
    // Disabled per client directive (can be re-enabled by setting env to 'true')
    inspection_completed: process.env.WA_ENABLE_INSPECTION_COMPLETED === 'true',
    invoice_generated: process.env.WA_ENABLE_INVOICE_GENERATED === 'true',
    work_started: process.env.WA_ENABLE_WORK_STARTED === 'true',

    // Preserved active automations (default true unless explicitly set to 'false')
    welcome: process.env.WA_ENABLE_WELCOME !== 'false',
    estimate_created: process.env.WA_ENABLE_ESTIMATE_CREATED !== 'false',
    estimate_approved: process.env.WA_ENABLE_ESTIMATE_APPROVED !== 'false',
    vehicle_ready: process.env.WA_ENABLE_VEHICLE_READY !== 'false',
    vehicle_delivered: process.env.WA_ENABLE_VEHICLE_DELIVERED !== 'false',
    vehicle_received: process.env.WA_ENABLE_VEHICLE_RECEIVED !== 'false',
    job_completed: process.env.WA_ENABLE_JOB_COMPLETED !== 'false',
    gate_pass: process.env.WA_ENABLE_GATE_PASS !== 'false',
    payment_received: process.env.WA_ENABLE_PAYMENT_RECEIVED !== 'false',
    payment_due: process.env.WA_ENABLE_PAYMENT_DUE !== 'false',
    feedback_request: process.env.WA_ENABLE_FEEDBACK_REQUEST !== 'false',
    service_delay: process.env.WA_ENABLE_SERVICE_DELAY !== 'false',
    insurance_claim: process.env.WA_ENABLE_INSURANCE_CLAIM !== 'false',
    booking_confirmation: process.env.WA_ENABLE_BOOKING_CONFIRMATION !== 'false'
};

/**
 * Resolves an automation feature flag key from a template name or alias.
 */
const getAutomationKey = (name) => {
    if (!name) return null;
    const clean = String(name).toLowerCase().replace(/^mvss_/, '').trim();
    if (clean === 'inspection_completed') return 'inspection_completed';
    if (clean === 'invoice_generated') return 'invoice_generated';
    if (clean === 'work_started') return 'work_started';
    if (clean === 'welcome_customer' || clean === 'welcome') return 'welcome';
    if (clean === 'vehicle_ready') return 'vehicle_ready';
    if (clean === 'vehicle_delivered') return 'vehicle_delivered';
    if (clean === 'vehicle_received') return 'vehicle_received';
    if (clean === 'job_completed') return 'job_completed';
    if (clean === 'gate_pass_generated' || clean === 'gate_pass') return 'gate_pass';
    if (clean === 'payment_received') return 'payment_received';
    if (clean === 'payment_due') return 'payment_due';
    if (clean === 'feedback_request') return 'feedback_request';
    if (clean === 'service_delay') return 'service_delay';
    if (clean === 'insurance_claim_update' || clean === 'insurance_claim') return 'insurance_claim';
    if (clean === 'booking_confirmation' || clean === 'service_booking_confirmation') return 'booking_confirmation';
    if (clean.includes('estimate')) return clean.includes('approved') ? 'estimate_approved' : 'estimate_created';
    return clean;
};

/**
 * Checks whether a specific WhatsApp automation is currently enabled.
 * @param {string} name - Template name or automation key
 * @returns {boolean}
 */
const isAutomationEnabled = (name) => {
    const key = getAutomationKey(name);
    if (!key) return true;
    if (Object.prototype.hasOwnProperty.call(AUTOMATION_FLAGS, key)) {
        return Boolean(AUTOMATION_FLAGS[key]);
    }
    return true; // Any unlisted automation remains enabled by default
};

/**
 * Toggles an automation flag at runtime.
 * @param {string} name - Template name or automation key
 * @param {boolean} enabled - True to enable, false to disable
 * @returns {boolean} Whether the key was recognized and updated
 */
const setAutomationEnabled = (name, enabled) => {
    const key = getAutomationKey(name);
    if (key && Object.prototype.hasOwnProperty.call(AUTOMATION_FLAGS, key)) {
        AUTOMATION_FLAGS[key] = Boolean(enabled);
        console.log('[WhatsApp Automation Config] ' + key + ' status set to: ' + (AUTOMATION_FLAGS[key] ? 'ENABLED' : 'DISABLED'));
        return true;
    }
    return false;
};

/**
 * Returns a clone of the current automation flags for auditing and monitoring.
 */
const getAutomationStatus = () => {
    return { ...AUTOMATION_FLAGS };
};

/**
 * Resolves a template specification across dynamicTemplateMap (APPROVED), pendingTemplateMap (PENDING),
 * and rejectedTemplateMap (REJECTED), supporting exact names and alias variations.
 */
const resolveTemplateSpec = (requestedName) => {
    if (!requestedName) return null;

    const findInMap = (map) => {
        if (!map || map.size === 0) return null;
        if (map.has(requestedName)) return map.get(requestedName);
        const withoutPrefix = requestedName.replace(/^mvss_/, '');
        const withPrefix = requestedName.startsWith('mvss_') ? requestedName : `mvss_${requestedName}`;

        if (map.has(withoutPrefix)) return map.get(withoutPrefix);
        if (map.has(withPrefix)) return map.get(withPrefix);

        const cleanRequested = requestedName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanWithout = withoutPrefix.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const [name, spec] of map.entries()) {
            const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanName === cleanRequested || cleanName === cleanWithout) {
                return spec;
            }
        }
        return null;
    };

    // 1. Check APPROVED dynamic cache
    const approved = findInMap(dynamicTemplateMap);
    if (approved) {
        return { ...approved, status: 'APPROVED' };
    }

    // 2. Check PENDING approval cache
    const pending = findInMap(pendingTemplateMap);
    if (pending) {
        return { ...pending, status: 'PENDING' };
    }

    // 3. Check REJECTED cache
    const rejected = findInMap(rejectedTemplateMap);
    if (rejected) {
        return { ...rejected, status: 'REJECTED' };
    }

    // 4. Fallback to canonical or static configuration
    const canonical = CANONICAL_TEMPLATES[requestedName] ||
                      CANONICAL_TEMPLATES[requestedName.replace(/^mvss_/, '')] ||
                      CANONICAL_TEMPLATES[`mvss_${requestedName}`];
    const staticSpec = TEMPLATE_CONFIG[requestedName] ||
                       TEMPLATE_CONFIG[requestedName.replace(/^mvss_/, '')] ||
                       TEMPLATE_CONFIG[`mvss_${requestedName}`];

    if (canonical || staticSpec) {
        // If dynamic sync has run at least once (dynamicTemplateMap or pendingTemplateMap has entries),
        // any template not found in Meta is NOT_REGISTERED
        const hasLiveSyncRun = (dynamicTemplateMap.size > 0 || pendingTemplateMap.size > 0 || rejectedTemplateMap.size > 0);
        return {
            name: canonical?.name || requestedName,
            language: canonical?.language || staticSpec?.lang || 'en',
            status: hasLiveSyncRun ? 'NOT_REGISTERED' : (staticSpec?.status || 'APPROVED'),
            paramCount: canonical?.paramCount ?? staticSpec?.paramCount ?? 0,
            headerFormat: canonical?.headerFormat || staticSpec?.headerFormat || null,
            variableMapping: canonical?.variableMapping || []
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

    // 1. Direct /me/assigned_whatsapp_business_accounts (supported for System Users)
    await tryFetchWabas(`${GRAPH_API_BASE_URL}/me/assigned_whatsapp_business_accounts?fields=id,name`, '/me/assigned_whatsapp_business_accounts');

    // 2. Direct /me/owned_whatsapp_business_accounts
    await tryFetchWabas(`${GRAPH_API_BASE_URL}/me/owned_whatsapp_business_accounts?fields=id,name`, '/me/owned_whatsapp_business_accounts');

    // 3. Direct /me/businesses (Meta Business Portfolios), then /{business_id}/owned_whatsapp_business_accounts
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

    // 4. Candidate IDs to investigate: distinguish Business Portfolios from WABAs
    const candidateBizIds = new Set();
    if (configuredBusinessOrWabaId) candidateBizIds.add(String(configuredBusinessOrWabaId).trim());
    if (process.env.META_WA_BUSINESS_ACCOUNT_ID) candidateBizIds.add(String(process.env.META_WA_BUSINESS_ACCOUNT_ID).trim());
    candidateBizIds.add('4778078332414981'); // Verified WABA / Messaging Account ID
    candidateBizIds.add('1718873676471685'); // Candidate WABA ID from Meta Business Settings URL
    candidateBizIds.add('2412447699508324'); // Candidate account from WhatsApp Manager dropdown
    candidateBizIds.add('1125158346955074'); // Candidate account from WhatsApp Manager dropdown
    candidateBizIds.add('1847113829838550'); // Candidate account from WhatsApp Manager dropdown
    candidateBizIds.add('1070579342641923'); // Old WABA account (owning +91 76748 19765)
    candidateBizIds.add('1983617422302091'); // MVSS Automobiles Meta Business Portfolio ID from WhatsApp Manager
    candidateBizIds.add('3953189031490997'); // Exact WABA asset_id from WhatsApp Manager URL

    for (const bizId of candidateBizIds) {
        let nodeType = null;
        let nodeData = null;
        try {
            const metaRes = await customAxios.get(`${GRAPH_API_BASE_URL}/${bizId}?metadata=1&fields=id,name,timezone_id,message_template_namespace`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            nodeData = metaRes.data;
            nodeType = metaRes.data?.metadata?.type;
            console.log(`[WhatsApp Meta Audit] Node ${bizId} resolved type: ${nodeType || 'N/A'} (Name: ${nodeData?.name || 'N/A'})`);
        } catch (metaErr) {
            const errDetails = getMetaErrorDetails(metaErr);
            console.log(`[WhatsApp Meta Audit] Node ${bizId} introspection note: ${errDetails.formatted}`);
        }

        if (nodeType === 'business') {
            // Business Portfolio: fetch owned and client WABAs ONLY. Never call /phone_numbers on Business.
            await tryFetchWabas(`${GRAPH_API_BASE_URL}/${bizId}/owned_whatsapp_business_accounts?fields=id,name`, `Business Portfolio ${bizId} owned_wabas`);
            await tryFetchWabas(`${GRAPH_API_BASE_URL}/${bizId}/client_whatsapp_business_accounts?fields=id,name`, `Business Portfolio ${bizId} client_wabas`);
        } else if (nodeType === 'whatsapp_business_account' || nodeData?.message_template_namespace) {
            // Confirmed WABA node
            candidates.set(bizId, {
                id: bizId,
                name: nodeData?.name || `WABA (${bizId})`,
                source: `direct_waba_lookup_${bizId}`
            });
        } else {
            // Other or unverified node: check if directly acts as WABA or business portfolio
            if (nodeData?.id) {
                candidates.set(bizId, {
                    id: bizId,
                    name: nodeData?.name || `Candidate Account (${bizId})`,
                    source: `candidate_lookup_${bizId}`
                });
            }
            await tryFetchWabas(`${GRAPH_API_BASE_URL}/${bizId}/owned_whatsapp_business_accounts?fields=id,name`, `Node ${bizId} owned_wabas`);
            await tryFetchWabas(`${GRAPH_API_BASE_URL}/${bizId}/client_whatsapp_business_accounts?fields=id,name`, `Node ${bizId} client_wabas`);
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
    const configuredWabaId = getEffectiveWabaId();
    const phoneNumberId = getEffectivePhoneNumberId();

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
            
            const expectedPhone = getEffectiveSenderPhone();
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

    // 2b. Direct Endpoint Diagnostics for Target Identifiers
    auditReport.directDiagnostics = {};
    const testEndpoints = [
        { key: 'waba_4778078332414981_raw', url: `${GRAPH_API_BASE_URL}/4778078332414981` },
        { key: 'waba_4778078332414981_metadata', url: `${GRAPH_API_BASE_URL}/4778078332414981?metadata=1` },
        { key: 'waba_4778078332414981_fields', url: `${GRAPH_API_BASE_URL}/4778078332414981?fields=id,name,currency,timezone_id,message_template_namespace` },
        { key: 'waba_4778078332414981_phone_numbers', url: `${GRAPH_API_BASE_URL}/4778078332414981/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating` },
        { key: 'waba_4778078332414981_templates', url: `${GRAPH_API_BASE_URL}/4778078332414981/message_templates?fields=id,name,status,language&limit=50` },
        { key: 'targetPhone_1435390016330145_raw', url: `${GRAPH_API_BASE_URL}/1435390016330145` },
        { key: 'targetPhone_1435390016330145_metadata', url: `${GRAPH_API_BASE_URL}/1435390016330145?metadata=1` },
        { key: 'targetPhone_1435390016330145_fields', url: `${GRAPH_API_BASE_URL}/1435390016330145?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,status,account_mode` },
        { key: 'candidate_2412447699508324_basic', url: `${GRAPH_API_BASE_URL}/2412447699508324?fields=id,name,timezone_id,message_template_namespace` },
        { key: 'candidate_2412447699508324_phone_numbers', url: `${GRAPH_API_BASE_URL}/2412447699508324/phone_numbers?fields=id,display_phone_number,verified_name` },
        { key: 'candidate_1125158346955074_basic', url: `${GRAPH_API_BASE_URL}/1125158346955074?fields=id,name,timezone_id,message_template_namespace` },
        { key: 'candidate_1125158346955074_phone_numbers', url: `${GRAPH_API_BASE_URL}/1125158346955074/phone_numbers?fields=id,display_phone_number,verified_name` },
        { key: 'candidate_1847113829838550_basic', url: `${GRAPH_API_BASE_URL}/1847113829838550?fields=id,name,timezone_id,message_template_namespace` },
        { key: 'candidate_1847113829838550_phone_numbers', url: `${GRAPH_API_BASE_URL}/1847113829838550/phone_numbers?fields=id,display_phone_number,verified_name` },
        { key: 'oldWaba_1070579342641923_templates', url: `${GRAPH_API_BASE_URL}/1070579342641923/message_templates?fields=id,name,status,language&limit=50` },
        { key: 'targetWaba_1718873676471685_raw', url: `${GRAPH_API_BASE_URL}/1718873676471685` },
        { key: 'me_assigned_wabas', url: `${GRAPH_API_BASE_URL}/me/assigned_whatsapp_business_accounts?fields=id,name,currency,timezone_id,message_template_namespace` },
        { key: 'me_owned_wabas', url: `${GRAPH_API_BASE_URL}/me/owned_whatsapp_business_accounts?fields=id,name` },
        { key: 'me_businesses', url: `${GRAPH_API_BASE_URL}/me/businesses?fields=id,name` },
        { key: 'business_1983617422302091_owned_wabas', url: `${GRAPH_API_BASE_URL}/1983617422302091/owned_whatsapp_business_accounts?fields=id,name,message_template_namespace` },
        { key: 'business_1983617422302091_client_wabas', url: `${GRAPH_API_BASE_URL}/1983617422302091/client_whatsapp_business_accounts?fields=id,name,message_template_namespace` }
    ];

    for (const ep of testEndpoints) {
        try {
            const resp = await customAxios.get(ep.url, {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 8000
            });
            auditReport.directDiagnostics[ep.key] = { success: true, status: resp.status, data: resp.data };
        } catch (err) {
            const errObj = err.response?.data?.error || {};
            auditReport.directDiagnostics[ep.key] = {
                success: false,
                status: err.response?.status || 0,
                code: errObj.code || err.code,
                subcode: errObj.error_subcode,
                type: errObj.type,
                message: errObj.message || err.message,
                fbtrace_id: errObj.fbtrace_id
            };
        }
    }

    let verifiedWaba = null;

    // Check if target WABA 4778078332414981 directly returned phone numbers that include phoneNumberId
    const waba4778DirectPhones = auditReport.directDiagnostics['waba_4778078332414981_phone_numbers']?.data?.data;
    if (Array.isArray(waba4778DirectPhones)) {
        console.log(`[WhatsApp Meta Audit] Direct target WABA 4778078332414981 phone list: ${waba4778DirectPhones.map(p => `${p.id} (${p.display_phone_number})`).join(', ') || 'none'}`);
        const matched = waba4778DirectPhones.find(p => p.id === phoneNumberId);
        if (matched) {
            verifiedWaba = {
                id: '4778078332414981',
                name: 'MVSS Automobiles',
                source: 'direct_waba_4778078332414981',
                matchedPhone: matched
            };
            resolvedVerifiedWabaId = '4778078332414981';
            console.log(`[WhatsApp Meta Audit] MATCH CONFIRMED via direct WABA check: WABA ID 4778078332414981 owns Phone Number ID ${phoneNumberId} (${matched.display_phone_number || 'N/A'})`);
        }
    }

    // Check if secondary candidate WABA 1718873676471685 directly returned phone numbers that include phoneNumberId
    if (!verifiedWaba) {
        const waba1718DirectPhones = auditReport.directDiagnostics['targetWaba_1718873676471685_phone_numbers']?.data?.data;
        if (Array.isArray(waba1718DirectPhones)) {
            const matched = waba1718DirectPhones.find(p => p.id === phoneNumberId);
            if (matched) {
                verifiedWaba = {
                    id: '1718873676471685',
                    name: 'MVSS Automobiles (WABA 1718873676471685)',
                    source: 'direct_waba_1718873676471685',
                    matchedPhone: matched
                };
                resolvedVerifiedWabaId = '1718873676471685';
                console.log(`[WhatsApp Meta Audit] MATCH CONFIRMED via direct WABA check: WABA ID 1718873676471685 owns Phone Number ID ${phoneNumberId} (${matched.display_phone_number || 'N/A'})`);
            }
        }
    }

    // 3. Discover Candidate WABAs via supported Meta Graph API flows and verify which one owns phoneNumberId
    const candidateWabas = await discoverAccessibleWabas(customAxios, token, configuredWabaId);
    const candidatesChecked = [];

    if (!verifiedWaba && candidateWabas.length > 0 && phoneNumberId) {
        console.log(`[WhatsApp Meta Audit] Verifying ${candidateWabas.length} candidate WABA(s) against Phone Number ID ${phoneNumberId}...`);
        for (const cand of candidateWabas) {
            const candSummary = {
                id: cand.id,
                name: cand.name,
                source: cand.source,
                phoneCount: 0,
                phones: [],
                error: null,
                matched: false
            };
            try {
                const phonesRes = await customAxios.get(`${GRAPH_API_BASE_URL}/${cand.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const phoneList = phonesRes.data?.data || [];
                candSummary.phoneCount = phoneList.length;
                candSummary.phones = phoneList.map(p => ({
                    id: p.id,
                    display_phone_number: p.display_phone_number,
                    verified_name: p.verified_name,
                    quality_rating: p.quality_rating
                }));
                console.log(`[WhatsApp Meta Audit] Candidate WABA ${cand.id} (${cand.name}) owns ${phoneList.length} phone number(s): ${phoneList.map(p => `${p.id} (${p.display_phone_number})`).join(', ') || 'none'}`);

                const matchedPhone = phoneList.find(p => p.id === phoneNumberId);
                if (matchedPhone) {
                    candSummary.matched = true;
                    verifiedWaba = {
                        id: cand.id,
                        name: cand.name,
                        source: cand.source,
                        matchedPhone
                    };
                    resolvedVerifiedWabaId = cand.id;
                    console.log(`[WhatsApp Meta Audit] MATCH CONFIRMED: WABA ID ${cand.id} (${cand.name}) owns Phone Number ID ${phoneNumberId} (${matchedPhone.display_phone_number || 'N/A'})`);
                    candidatesChecked.push(candSummary);
                    break;
                }
            } catch (candErr) {
                const errDetails = getMetaErrorDetails(candErr);
                candSummary.error = errDetails.formatted;
                console.log(`[WhatsApp Meta Audit] Candidate WABA ${cand.id} /phone_numbers check note: ${errDetails.formatted}`);
            }
            candidatesChecked.push(candSummary);
        }
    }
    auditReport.wabaVerification.candidatesChecked = candidatesChecked;

    // 4. Handle WABA Verification Outcome
    if (verifiedWaba) {
        auditReport.wabaVerification.verified = true;
        auditReport.wabaVerification.isWaba = true;
        auditReport.wabaVerification.resolvedWabaId = verifiedWaba.id;
        auditReport.wabaVerification.wabaName = verifiedWaba.name;

        // Fetch Message Templates using the verified WABA ID
        try {
            const templatesRes = await customAxios.get(`${GRAPH_API_BASE_URL}/${verifiedWaba.id}/message_templates?fields=name,status,category,language,components,rejected_reason&limit=100`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const metaTemplates = templatesRes.data?.data || [];
            console.log(`[WhatsApp Meta Audit] Successfully retrieved ${metaTemplates.length} template(s) from verified WABA (${verifiedWaba.id}).`);

            dynamicTemplateMap.clear();
            pendingTemplateMap.clear();
            rejectedTemplateMap.clear();

            metaTemplates.forEach(t => {
                const bodyComponent = t.components?.find(c => c.type && c.type.toUpperCase() === 'BODY');
                const headerComponent = t.components?.find(c => c.type && c.type.toUpperCase() === 'HEADER');
                let paramCount = 0;
                if (bodyComponent && bodyComponent.text) {
                    const matches = bodyComponent.text.match(/\{\{\d+\}\}/g);
                    if (matches) paramCount = new Set(matches).size;
                } else if (bodyComponent?.example?.body_text?.[0]) {
                    paramCount = bodyComponent.example.body_text[0].length;
                }

                const spec = {
                    name: t.name,
                    language: t.language,
                    status: t.status,
                    category: t.category,
                    id: t.id,
                    paramCount,
                    headerFormat: headerComponent?.format || null,
                    components: t.components,
                    bodyText: bodyComponent?.text || null,
                    example: bodyComponent?.example?.body_text?.[0] || null,
                    rejectedReason: t.rejected_reason || null
                };

                if (t.status === 'APPROVED') {
                    dynamicTemplateMap.set(t.name, spec);
                } else if (t.status === 'PENDING') {
                    pendingTemplateMap.set(t.name, spec);
                } else if (t.status === 'REJECTED') {
                    rejectedTemplateMap.set(t.name, spec);
                } else {
                    dynamicTemplateMap.set(t.name, spec);
                }

                console.log(`  - Meta Template -> Name: ${t.name} | Lang: ${t.language} | Status: ${t.status} | Category: ${t.category} | Params: ${paramCount}${t.rejected_reason ? ` | Rejection: ${t.rejected_reason}` : ''}`);
            });

            auditReport.templatesAudit.success = true;
            auditReport.templatesAudit.totalCount = metaTemplates.length;
            auditReport.templatesAudit.approvedCount = dynamicTemplateMap.size;
            auditReport.templatesAudit.pendingCount = pendingTemplateMap.size;
            auditReport.templatesAudit.rejectedCount = rejectedTemplateMap.size;
            auditReport.templatesAudit.templates = metaTemplates.map(t => {
                const bodyComp = t.components?.find(c => c.type && c.type.toUpperCase() === 'BODY');
                return {
                    name: t.name,
                    language: t.language,
                    status: t.status,
                    category: t.category,
                    paramCount: (dynamicTemplateMap.get(t.name) || pendingTemplateMap.get(t.name) || rejectedTemplateMap.get(t.name))?.paramCount || 0,
                    bodyText: bodyComp?.text || null,
                    example: bodyComp?.example?.body_text?.[0] || null,
                    rejectedReason: t.rejected_reason || null,
                    components: t.components
                };
            });

            // Comprehensive per-automation audit linking canonical ERP workflows to Meta WABA approval status
            auditReport.templatesAudit.automationsAudit = Object.entries(CANONICAL_TEMPLATES).map(([name, spec]) => {
                const resolved = resolveTemplateSpec(name);
                const isApproved = resolved && resolved.status === 'APPROVED';
                const isPending = resolved && resolved.status === 'PENDING';
                const isRejected = resolved && resolved.status === 'REJECTED';
                const metaStatus = isApproved ? 'APPROVED' : (isPending ? 'Pending Approval' : (isRejected ? 'Rejected' : 'Not Registered in WABA'));
                const autoKey = spec.automationKey || getAutomationKey(name);
                const isEnabled = spec.disabled ? false : isAutomationEnabled(name);

                return {
                    automationName: getHumanAutomationName(name),
                    templateName: name,
                    templateAvailableInWaba: Boolean(resolved && resolved.status !== 'NOT_REGISTERED'),
                    metaApprovalStatus: metaStatus,
                    language: spec.language || 'en',
                    paramCount: spec.paramCount,
                    variableMapping: spec.variableMapping || [],
                    senderNumber: OFFICIAL_SENDER_PHONE,
                    senderDisplayPhone: '+91 91771 77509',
                    automationEnabled: isEnabled,
                    rejectedReason: resolved?.rejectedReason || null,
                    readyForCustomerDispatch: isEnabled && isApproved
                };
            });

            auditReport.fallbackConfigActive = (dynamicTemplateMap.size === 0);
            if (dynamicTemplateMap.size === 0) {
                auditReport.templatesAudit.note = `Live verified WABA ${verifiedWaba.id} currently has ${dynamicTemplateMap.size} APPROVED template(s) and ${pendingTemplateMap.size} PENDING template(s).`;
            }

            // Verify ERP template mappings against Meta
            console.log('[WhatsApp Meta Audit] Verifying ERP Template mappings against Meta:');
            for (const [name, config] of Object.entries(CANONICAL_TEMPLATES)) {
                const resolved = resolveTemplateSpec(name);
                if (resolved && resolved.status === 'APPROVED') {
                    console.log(`  [APPROVED] ${name} -> Lang: ${resolved.language} | Params: ${resolved.paramCount}`);
                } else if (resolved && resolved.status === 'PENDING') {
                    console.log(`  [PENDING APPROVAL] ${name} -> Awaiting Meta approval`);
                } else if (resolved && resolved.status === 'REJECTED') {
                    console.warn(`  [REJECTED] ${name} -> Meta rejection reason: ${resolved.rejectedReason || 'N/A'}`);
                } else {
                    console.warn(`  [NOT REGISTERED] ${name} -> Missing from WABA ${verifiedWaba.id}`);
                }
            }
        } catch (tplErr) {
            const tplErrDetails = getMetaErrorDetails(tplErr);
            auditReport.templatesAudit.error = tplErrDetails.formatted;
            console.warn(`[WhatsApp Meta Audit] Failed to retrieve message templates from verified WABA ${verifiedWaba.id}:`, tplErrDetails.formatted);
            console.warn('[WhatsApp Meta Audit] Preserving static TEMPLATE_CONFIG baseline (en).');
        }
    } else {
        let errorMsg = candidateWabas.length > 0 
            ? `WABA verification failed: None of the ${candidateWabas.length} candidate WABA accounts own Phone Number ID ${phoneNumberId}`
            : `WABA verification failed: No candidate WABAs could be discovered from token or configured ID ${configuredWabaId}`;
        
        const waba1718Diag = auditReport.directDiagnostics?.['targetWaba_1718873676471685_raw'];
        if (waba1718Diag?.subcode === 2388339 || waba1718Diag?.code === 100) {
            auditReport.wabaVerification.assetAssignmentMissing = true;
            auditReport.wabaVerification.targetWabaId = '1718873676471685';
            auditReport.wabaVerification.systemUserId = '122113813605505849';
            auditReport.wabaVerification.requiredAction = 'In Meta Business Settings -> Accounts -> WhatsApp Accounts -> select WABA 1718873676471685 -> click "Assign People / System Users" -> select System User "Employee" and grant "Full Control"';
            errorMsg = `WABA verification pending: Target WABA 1718873676471685 requires System User asset assignment in Meta Business Settings (Meta Code 100, Subcode 2388339). None of the other candidate WABA accounts own Phone Number ID ${phoneNumberId}.`;
        }
        
        auditReport.wabaVerification.verified = false;
        auditReport.wabaVerification.error = errorMsg;
        auditReport.templatesAudit.error = errorMsg;
        console.warn(`[WhatsApp Meta Audit] ${errorMsg}`);
        console.warn('[WhatsApp Meta Audit] Dynamic template sync skipped because WABA ID verification failed. Preserving static TEMPLATE_CONFIG baseline (en).');
    }

    console.log(`[WhatsApp Meta Audit] === Audit Complete. Approved Templates in cache: ${dynamicTemplateMap.size} | Pending: ${pendingTemplateMap.size} | Rejected: ${rejectedTemplateMap.size} ===`);
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

    // Central Automation Kill-Switch Check
    if (!isAutomationEnabled(templateName)) {
        const autoKey = getAutomationKey(templateName);
        console.log('[WhatsApp] Automation ' + templateName + ' (' + autoKey + ') is currently DISABLED by configuration. Skipping dispatch to ' + maskedTo + '.');
        return {
            success: false,
            skipped: true,
            disabled: true,
            status: 'disabled',
            reason: 'Automation ' + templateName + ' is disabled per client configuration.',
            templateName,
            recipient: maskedTo
        };
    }

    try {
        const token = process.env.META_WA_ACCESS_TOKEN;
        const phoneNumberId = getEffectivePhoneNumberId();

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
                if (existingLog && ['sent', 'delivered', 'read'].includes(existingLog.status)) {
                    console.log(`[WhatsApp] Duplicate skipped for key: ${idempotencyKey} (already ${existingLog.status})`);
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
                            senderPhone: getEffectiveSenderPhone(),
                            phoneNumberId: phoneNumberId,
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
                            status: 'pending',
                            errorMessage: null,
                            metaErrorCode: null
                        },
                        $inc: { attempts: 1 }
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            } catch (logSaveErr) {
                if (logSaveErr.code === 11000) {
                    console.warn(`[WhatsApp] Concurrency conflict (E11000) for idempotencyKey '${idempotencyKey}'. Another request is in-flight or already completed. Skipping duplicate dispatch.`);
                    try {
                        const existingLog = await WhatsAppLog.findOne({ idempotencyKey });
                        if (existingLog && ['sent', 'delivered', 'read'].includes(existingLog.status)) {
                            return { success: true, messageId: existingLog.messageId, status: 'duplicate_skipped', alreadySent: true };
                        }
                    } catch (readErr) {}
                    return { success: true, status: 'in_flight_skipped', alreadySent: false };
                }
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
 * Upload a media file (e.g. PDF) directly to Meta Graph API /media endpoint.
 * Returns { success: true, mediaId: string } or { success: false, error: string }.
 */
const uploadMediaToMeta = async ({
    buffer,
    filename = 'Customer_Estimate.pdf',
    mimeType = 'application/pdf'
}, customAxios = axios) => {
    try {
        const token = process.env.META_WA_ACCESS_TOKEN;
        const phoneNumberId = getEffectivePhoneNumberId();

        if (!token || !phoneNumberId) {
            return { success: false, error: 'API credentials missing (META_WA_ACCESS_TOKEN or META_WA_PHONE_NUMBER_ID)' };
        }
        if (!buffer || buffer.length === 0) {
            return { success: false, error: 'Buffer is empty or missing' };
        }

        const formData = new FormData();
        const blob = new Blob([buffer], { type: mimeType });
        formData.append('file', blob, filename);
        formData.append('type', mimeType);
        formData.append('messaging_product', 'whatsapp');

        let mediaId = null;
        if (typeof fetch === 'function') {
            const res = await fetch(`${GRAPH_API_BASE_URL}/${phoneNumberId}/media`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            const data = await res.json();
            if (res.ok && data?.id) {
                mediaId = data.id;
            } else {
                const errMsg = data?.error?.message || `HTTP ${res.status}`;
                console.warn(`[WhatsApp] Meta Media fetch upload note: ${errMsg}`);
                return { success: false, error: errMsg };
            }
        } else {
            const mediaRes = await customAxios.post(
                `${GRAPH_API_BASE_URL}/${phoneNumberId}/media`,
                formData,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            if (mediaRes.data?.id) {
                mediaId = mediaRes.data.id;
            }
        }

        if (mediaId) {
            console.log(`[WhatsApp] Successfully uploaded media to Meta: mediaId=${mediaId} [Filename: ${filename}]`);
            return { success: true, mediaId };
        }
        return { success: false, error: 'No media ID returned from Meta' };
    } catch (err) {
        const errDetails = getMetaErrorDetails(err);
        console.warn(`[WhatsApp] uploadMediaToMeta error: ${errDetails.formatted}`);
        return { success: false, error: errDetails.formatted };
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
        const phoneNumberId = getEffectivePhoneNumberId();

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
                            senderPhone: getEffectiveSenderPhone(),
                            phoneNumberId: phoneNumberId,
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
                            status: 'pending',
                            errorMessage: null,
                            metaErrorCode: null
                        },
                        $inc: { attempts: 1 }
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            } catch (logSaveErr) {
                if (logSaveErr.code === 11000) {
                    console.warn(`[WhatsApp] Concurrency conflict (E11000) on document idempotencyKey '${idempotencyKey}'. Skipping duplicate document dispatch.`);
                    try {
                        const existingLog = await WhatsAppLog.findOne({ idempotencyKey });
                        if (existingLog && ['sent', 'delivered', 'read'].includes(existingLog.status)) {
                            return { success: true, messageId: existingLog.messageId, status: 'duplicate_skipped', alreadySent: true };
                        }
                    } catch (readErr) {}
                    return { success: true, status: 'in_flight_skipped', alreadySent: false };
                }
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
        if (pdfBuffer) {
            const uploadRes = await uploadMediaToMeta({
                buffer: pdfBuffer,
                filename: filename || 'Customer_Estimate.pdf',
                mimeType: 'application/pdf'
            }, customAxios);
            if (uploadRes.success && uploadRes.mediaId) {
                documentPayload.id = uploadRes.mediaId;
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
 * Send an image attachment message via Meta WhatsApp Cloud API
 */
const sendImageMessage = async ({
    to,
    imageUrl,
    imageBuffer,
    filename = 'vehicle_photo.jpg',
    caption = '',
    recipientName = 'Unknown',
    relatedEntity,
    onModel = 'JobCard',
    idempotencyKey
}, customAxios = axios) => {
    const maskedTo = to ? to.substring(0, 3) + '****' + to.slice(-3) : 'unknown';

    try {
        const token = process.env.META_WA_ACCESS_TOKEN;
        const phoneNumberId = getEffectivePhoneNumberId();

        if (!token || !phoneNumberId) {
            const err = 'API credentials missing (META_WA_ACCESS_TOKEN or META_WA_PHONE_NUMBER_ID). Skipping image message.';
            console.warn(`[WhatsApp] ${err}`);
            throw new Error(err);
        }

        const normalizedPhone = normalizePhoneNumber(to);
        if (!normalizedPhone || normalizedPhone.length < 10) {
            const err = `Invalid phone number: ${to}`;
            console.warn(`[WhatsApp] ${err}`);
            throw new Error(err);
        }

        if (!imageUrl && !imageBuffer) {
            const err = 'Either imageUrl or imageBuffer must be provided to send a WhatsApp image message.';
            console.error(`[WhatsApp] ${err}`);
            throw new Error(err);
        }

        // Idempotency Check: Prevent duplicate messages for the same event
        if (idempotencyKey) {
            try {
                const existingLog = await WhatsAppLog.findOne({ idempotencyKey });
                if (existingLog && ['sent', 'delivered', 'read'].includes(existingLog.status)) {
                    console.log(`[WhatsApp] Duplicate image skipped for key: ${idempotencyKey}`);
                    return { success: true, messageId: existingLog.messageId, status: 'duplicate_skipped', alreadySent: true };
                }
            } catch (dbReadErr) {
                console.warn(`[WhatsApp] Warning: Failed to query existing WhatsAppLog for idempotencyKey '${idempotencyKey}':`, dbReadErr.message || dbReadErr);
            }
        }

        // Create or update pending log entry using atomic upsert (prevents E11000 duplicate key error)
        if (idempotencyKey) {
            try {
                await WhatsAppLog.findOneAndUpdate(
                    { idempotencyKey },
                    {
                        $setOnInsert: {
                            recipientName,
                            recipientPhone: normalizedPhone,
                            senderPhone: getEffectiveSenderPhone(),
                            phoneNumberId: phoneNumberId,
                            templateName: 'image_attachment',
                            messageType: 'image',
                            direction: 'outbound',
                            imageUrl: imageUrl || '',
                            caption: caption || '',
                            relatedEntity,
                            onModel,
                            idempotencyKey,
                            createdAt: new Date()
                        },
                        $set: {
                            lastAttemptAt: new Date(),
                            status: 'pending',
                            errorMessage: null,
                            metaErrorCode: null
                        },
                        $inc: { attempts: 1 }
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            } catch (logSaveErr) {
                if (logSaveErr.code === 11000) {
                    console.warn(`[WhatsApp] Concurrency conflict (E11000) on image idempotencyKey '${idempotencyKey}'. Skipping duplicate image dispatch.`);
                    try {
                        const existingLog = await WhatsAppLog.findOne({ idempotencyKey });
                        if (existingLog && ['sent', 'delivered', 'read'].includes(existingLog.status)) {
                            return { success: true, messageId: existingLog.messageId, status: 'duplicate_skipped', alreadySent: true };
                        }
                    } catch (readErr) {}
                    return { success: true, status: 'in_flight_skipped', alreadySent: false };
                }
                console.error(`[WhatsApp] Warning: Failed to upsert initial pending WhatsAppLog:`, logSaveErr.message || logSaveErr);
            }
        }

        // Construct Meta Image Message Payload
        const imagePayload = {};
        if (caption) {
            imagePayload.caption = String(caption);
        }

        // Try direct Meta media upload if buffer is available
        if (imageBuffer) {
            const uploadRes = await uploadMediaToMeta({
                buffer: imageBuffer,
                filename: filename || 'vehicle_photo.jpg',
                mimeType: 'image/jpeg'
            }, customAxios);
            if (uploadRes.success && uploadRes.mediaId) {
                imagePayload.id = uploadRes.mediaId;
            }
        }

        // If media ID wasn't set, use publicly accessible link
        if (!imagePayload.id && imageUrl) {
            imagePayload.link = imageUrl;
        }

        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: normalizedPhone,
            type: 'image',
            image: imagePayload
        };

        const url = `${GRAPH_API_BASE_URL}/${phoneNumberId}/messages`;
        console.log(`[WhatsApp] Sending image message to Meta Graph API (${GRAPH_API_VERSION}) to ${maskedTo} [Filename: ${filename}]`);

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
                            imageUrl: imageUrl || '',
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

        console.log(`[WhatsApp] Successfully sent image to ${maskedTo} | Version: ${GRAPH_API_VERSION} | HTTP: ${httpStatus} | wamid: ${messageId}`);
        return { success: true, messageId, data: response.data, imageUrl };

    } catch (error) {
        const errDetails = getMetaErrorDetails(error);

        if (errDetails.status) {
            console.error(`[WhatsApp] Meta API Image Error -> To: ${maskedTo} | Version: ${GRAPH_API_VERSION} | ${errDetails.formatted}`);
        } else {
            console.error(`[WhatsApp] Internal/Network Image Error -> To: ${maskedTo} | Msg: ${errDetails.message}`);
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
                            templateName: 'image_attachment',
                            messageType: 'image',
                            direction: 'outbound',
                            imageUrl: imageUrl || '',
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
                console.error('[WhatsApp] Failed to save image error log via atomic upsert:', logErr.message);
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
    const wabaId = getEffectiveWabaId();
    if (!token || !wabaId) {
        return { success: false, error: 'Meta credentials missing (META_WA_ACCESS_TOKEN or META_WA_BUSINESS_ACCOUNT_ID)' };
    }

    try {
        const samplePdfContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF';
        const samplePdf = Buffer.from(samplePdfContent, 'utf-8');

        // Determine Meta App ID
        let appId = process.env.META_WA_APP_ID;
        if (!appId) {
            try {
                const appRes = await customAxios.get(`${GRAPH_API_BASE_URL}/app`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                appId = appRes.data?.id;
                console.log(`[WhatsApp] Discovered Meta App ID via /app: ${appId}`);
            } catch (appErr) {
                console.warn('[WhatsApp] Could not determine appId from /app:', appErr.message);
            }
        }
        if (!appId) {
            try {
                const debugRes = await customAxios.get(`${GRAPH_API_BASE_URL}/debug_token?input_token=${token}&access_token=${token}`);
                appId = debugRes.data?.data?.app_id;
            } catch (debugErr) {
                console.warn('[WhatsApp] Could not determine appId from debug_token:', debugErr.message);
            }
        }

        let headerHandle = null;
        try {
            // Create upload session via Resumable Upload API
            console.log(`[WhatsApp] Creating Meta upload session for document header example (App: ${appId})...`);
            const sessionRes = await customAxios.post(
                `${GRAPH_API_BASE_URL}/${appId}/uploads?file_length=${samplePdf.length}&file_type=application/pdf&file_name=sample_estimate.pdf`,
                null,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const uploadSessionId = sessionRes.data?.id;

            // Upload binary data to upload session to obtain header_handle
            console.log(`[WhatsApp] Uploading sample PDF binary to session ${uploadSessionId}...`);
            const uploadBinaryRes = await customAxios.post(
                `${GRAPH_API_BASE_URL}/${uploadSessionId}`,
                samplePdf,
                {
                    headers: {
                        'Authorization': `OAuth ${token}`,
                        'file_offset': 0,
                        'Content-Type': 'application/octet-stream'
                    }
                }
            );
            headerHandle = uploadBinaryRes.data?.h;
            console.log(`[WhatsApp] Obtained Meta header_handle: ${headerHandle}`);
        } catch (handleErr) {
            console.warn('[WhatsApp] Resumable upload note:', handleErr.response?.data || handleErr.message);
        }

        const headerComponent = {
            type: 'HEADER',
            format: 'DOCUMENT'
        };
        if (headerHandle) {
            headerComponent.example = {
                header_handle: [headerHandle]
            };
        }

        const payload = {
            name: 'mvss_customer_estimate_doc',
            category: 'UTILITY',
            language: 'en',
            components: [
                headerComponent,
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

/**
 * Register all missing canonical ERP templates with Meta WhatsApp Business Account (WABA).
 * Uses category 'UTILITY' and language 'en'. Does NOT create duplicate templates.
 */
const registerMissingTemplates = async (customAxios = axios) => {
    const token = process.env.META_WA_ACCESS_TOKEN;
    const wabaId = getEffectiveWabaId();

    if (!token || !wabaId) {
        return { success: false, error: 'Meta credentials missing (META_WA_ACCESS_TOKEN or META_WA_BUSINESS_ACCOUNT_ID)' };
    }

    console.log(`[WhatsApp Template Registration] Starting missing template audit and registration for WABA ${wabaId}...`);

    // 1. Fetch all currently existing templates in this WABA from Meta Graph API
    let existingNames = new Set();
    try {
        const resp = await customAxios.get(`${GRAPH_API_BASE_URL}/${wabaId}/message_templates?fields=name,status,category,language&limit=100`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        (resp.data?.data || []).forEach(t => existingNames.add(t.name));
        console.log(`[WhatsApp Template Registration] WABA ${wabaId} currently has ${existingNames.size} registered template(s): ${Array.from(existingNames).join(', ')}`);
    } catch (fetchErr) {
        console.warn(`[WhatsApp Template Registration] Could not fetch existing templates from Meta:`, fetchErr.message);
    }

    const summary = {
        wabaId,
        totalCanonical: Object.keys(CANONICAL_TEMPLATES).length,
        alreadyExisting: [],
        newlySubmitted: [],
        failed: []
    };

    // 2. Iterate through canonical templates and submit those missing from WABA
    for (const [name, tmpl] of Object.entries(CANONICAL_TEMPLATES)) {
        if (existingNames.has(name)) {
            summary.alreadyExisting.push(name);
            continue;
        }

        try {
            console.log(`[WhatsApp Template Registration] Submitting missing template '${name}' (${tmpl.category}, lang=${tmpl.language})...`);
            
            // Build template payload
            let components = tmpl.components;
            // If it's a document template and header has no example, create via createDocumentTemplate
            if (tmpl.headerFormat === 'DOCUMENT' && name === 'mvss_customer_estimate_doc') {
                const docRes = await createDocumentTemplate(customAxios);
                if (docRes.success) {
                    summary.newlySubmitted.push({
                        name,
                        id: docRes.data?.id,
                        status: docRes.data?.status || 'PENDING',
                        category: docRes.data?.category || 'UTILITY'
                    });
                } else {
                    summary.failed.push({ name, error: docRes.error });
                }
                continue;
            }

            const payload = {
                name: tmpl.name,
                category: tmpl.category || 'UTILITY',
                language: tmpl.language || 'en',
                components
            };

            const submitRes = await customAxios.post(
                `${GRAPH_API_BASE_URL}/${wabaId}/message_templates`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log(`[WhatsApp Template Registration] Successfully submitted '${name}' -> Meta ID: ${submitRes.data?.id}, Status: ${submitRes.data?.status || 'PENDING'}`);
            summary.newlySubmitted.push({
                name,
                id: submitRes.data?.id,
                status: submitRes.data?.status || 'PENDING',
                category: submitRes.data?.category || 'UTILITY'
            });
        } catch (subErr) {
            const errObj = subErr.response?.data?.error || {};
            if (errObj.code === 100 && (errObj.error_subcode === 2388043 || errObj.message?.includes('already exists'))) {
                console.log(`[WhatsApp Template Registration] '${name}' already exists on Meta.`);
                summary.alreadyExisting.push(name);
            } else {
                const details = getMetaErrorDetails(subErr);
                console.error(`[WhatsApp Template Registration] Failed to submit '${name}':`, details.formatted);
                summary.failed.push({
                    name,
                    error: details.formatted,
                    code: details.code,
                    subcode: details.subcode
                });
            }
        }
    }

    // 3. Trigger immediate sync to update live dynamic and pending template caches
    try {
        await syncMetaTemplates(customAxios);
    } catch (syncErr) {
        console.warn('[WhatsApp Template Registration] Post-registration sync error:', syncErr.message);
    }

    return {
        success: true,
        summary
    };
};

module.exports = {
    sendTemplateMessage,
    sendDocumentMessage,
    sendImageMessage,
    uploadMediaToMeta,
    normalizePhoneNumber,
    maskPhoneNumber,
    validateCustomerContact,
    syncMetaTemplates,
    createDocumentTemplate,
    registerMissingTemplates,
    getMetaErrorDetails,
    resolveTemplateSpec,
    discoverAccessibleWabas,
    TEMPLATE_CONFIG,
    CANONICAL_TEMPLATES,
    getHumanAutomationName,
    dynamicTemplateMap,
    pendingTemplateMap,
    rejectedTemplateMap,
    isCustomerSessionActive,
    getCustomerSessionStatus,
    GRAPH_API_VERSION,
    GRAPH_API_BASE_URL,
    AUTOMATION_FLAGS,
    getAutomationKey,
    isAutomationEnabled,
    setAutomationEnabled,
    getAutomationStatus,
    getEffectivePhoneNumberId,
    getEffectiveWabaId,
    getEffectiveSenderPhone,
    OFFICIAL_PHONE_NUMBER_ID,
    OFFICIAL_WABA_ID,
    OFFICIAL_SENDER_PHONE
};
