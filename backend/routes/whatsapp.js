const express = require('express');
const router = express.Router();
const WhatsAppLog = require('../models/WhatsAppLog');
const Customer = require('../models/Customer');
const { auth, restrictTo } = require('../middleware/auth');
const { sendTemplateMessage, syncMetaTemplates, maskPhoneNumber, createDocumentTemplate } = require('../services/whatsappService');
const { handleInboundFeedbackReply } = require('../services/feedbackReminderService');
const { handleInboundEstimateReply } = require('../services/estimateApprovalService');

// Automatically run startup Meta audit & template synchronization
if (process.env.META_WA_ACCESS_TOKEN && (process.env.META_WA_PHONE_NUMBER_ID || process.env.META_WA_BUSINESS_ACCOUNT_ID)) {
    setTimeout(() => {
        syncMetaTemplates().catch(err => {
            console.warn('[WhatsApp] Startup Meta sync warning:', err.message);
        });
    }, 2000);
}

// =========================================================================
// PHASE 10: WEBHOOK VERIFICATION (GET)
// =========================================================================
router.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.META_WA_VERIFY_TOKEN;

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('[WhatsApp] Webhook verified successfully.');
            return res.status(200).send(challenge);
        } else {
            console.error('[WhatsApp] Webhook verification failed! Token mismatch.');
            return res.sendStatus(403);
        }
    }
    return res.status(400).send('Bad Request');
});

// =========================================================================
// PHASE 10 & 11: INCOMING WEBHOOK EVENTS (POST)
// =========================================================================
router.post('/webhook', async (req, res) => {
    try {
        const body = req.body;

        if (body.object === 'whatsapp_business_account') {
            for (const entry of body.entry || []) {
                for (const change of entry.changes || []) {
                    const value = change.value;

                    // 1. Handle Delivery Status Updates (sent, delivered, read, failed)
                    if (value.statuses && value.statuses.length > 0) {
                        for (const status of value.statuses) {
                            const messageId = status.id;
                            const statusString = status.status; // 'sent', 'delivered', 'read', 'failed'
                            
                            let updatePayload = { status: statusString };
                            if (statusString === 'failed' && status.errors) {
                                updatePayload.errorMessage = status.errors[0]?.message || 'Unknown Meta Error';
                            }

                            // Update our log asynchronously
                            await WhatsAppLog.findOneAndUpdate({ messageId }, updatePayload);
                            console.log(`[WhatsApp Webhook] [Stage 7] Webhook delivery status received: MessageId=${messageId}, Status=${statusString}${statusString === 'failed' ? `, Error=${updatePayload.errorMessage}` : ''}`);
                        }
                    }

                    // 2. Handle Incoming Messages (Customer replying to WABA)
                    if (value.messages && value.messages.length > 0) {
                        for (const message of value.messages) {
                            const fromPhone = message.from; // Customer's phone number
                            const messageId = message.id;
                            const messageType = message.type;
                            
                            // Check for duplicates
                            const existingInbound = await WhatsAppLog.findOne({ messageId });
                            if (existingInbound) continue;
                            
                            const maskedFrom = fromPhone ? fromPhone.substring(0, 3) + '****' + fromPhone.slice(-3) : 'unknown';
                            console.log(`[WhatsApp Webhook] Inbound message received from ${maskedFrom}`);

                            let recipientName = 'Inbound Customer';
                            let relatedEntity = null;
                            let onModel = undefined;

                            // 1. Process customer estimate approval / rejection reply
                            try {
                                const estReplyResult = await handleInboundEstimateReply({
                                    fromPhone,
                                    messageType,
                                    messageText: message.text?.body,
                                    interactiveData: message.interactive,
                                    buttonData: message.button,
                                    messageId
                                });

                                if (estReplyResult && estReplyResult.processed && estReplyResult.estimate) {
                                    relatedEntity = estReplyResult.estimate._id;
                                    onModel = 'Estimate';
                                    recipientName = estReplyResult.customerName || recipientName;
                                    console.log(`[WhatsApp Webhook] Successfully processed estimate ${estReplyResult.action} reply for Estimate ${estReplyResult.estimateNo}`);
                                }
                            } catch (estReplyErr) {
                                console.warn('[WhatsApp Webhook] Inbound estimate reply error:', estReplyErr.message || estReplyErr);
                            }

                            // 2. Process customer feedback reply if message is text and not already handled
                            if (!relatedEntity && messageType === 'text' && message.text?.body) {
                                try {
                                    const feedbackResult = await handleInboundFeedbackReply({
                                        fromPhone,
                                        messageText: message.text.body,
                                        messageId
                                    });

                                    if (feedbackResult && feedbackResult.processed && feedbackResult.reminder) {
                                        relatedEntity = feedbackResult.reminder._id;
                                        onModel = 'FeedbackReminder';
                                        recipientName = feedbackResult.reminder.customerName || recipientName;
                                    }
                                } catch (replyErr) {
                                    console.warn('[WhatsApp Webhook] Inbound feedback reply processing error:', replyErr.message || replyErr);
                                }
                            }

                            // If recipientName is still generic, attempt to resolve via Customer model
                            if (recipientName === 'Inbound Customer' && fromPhone) {
                                try {
                                    const digits = String(fromPhone).replace(/\D/g, '');
                                    const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
                                    const cust = await Customer.findOne({
                                        $or: [
                                            { mobile: fromPhone },
                                            { mobile: `+${fromPhone}` },
                                            { mobile: last10 },
                                            { mobile: `+91${last10}` },
                                            { mobile: new RegExp(last10 + '$') }
                                        ]
                                    });
                                    if (cust?.name) {
                                        recipientName = cust.name;
                                        if (!relatedEntity) {
                                            relatedEntity = cust._id;
                                            onModel = 'Customer';
                                        }
                                    }
                                } catch (custErr) {
                                    // Ignore customer lookup errors
                                }
                            }

                            // Store inbound message in WhatsAppLog using atomic upsert (prevents E11000 duplicate key error)
                            await WhatsAppLog.findOneAndUpdate(
                                { messageId },
                                {
                                    $setOnInsert: {
                                        recipientName,
                                        recipientPhone: fromPhone,
                                        messageType: 'text',
                                        direction: 'inbound',
                                        status: 'delivered',
                                        messageId: messageId,
                                        errorMessage: messageType === 'text' ? message.text.body : `Received non-text message: ${messageType}`,
                                        idempotencyKey: `inbound_${messageId}`,
                                        ...(relatedEntity && onModel ? { relatedEntity, onModel } : {}),
                                        createdAt: new Date()
                                    }
                                },
                                { upsert: true, new: true }
                            );

                            // 3. Auto-deliver queued Customer Estimate PDF now that customer has engaged (24h window open)
                            try {
                                const Estimate = require('../models/Estimate');
                                const { sendDocumentMessage } = require('../services/whatsappService');
                                const digits = String(fromPhone).replace(/\D/g, '');
                                const last10 = digits.length >= 10 ? digits.slice(-10) : digits;

                                const pendingEstimates = await Estimate.find({
                                    'whatsappHistory': {
                                        $elemMatch: {
                                            stage: 'DOCUMENT_ESTIMATE_PDF',
                                            status: 'pending_session'
                                        }
                                    }
                                }).sort({ updatedAt: -1 });

                                for (const est of pendingEstimates) {
                                    const matchingHist = est.whatsappHistory.find(h =>
                                        h.stage === 'DOCUMENT_ESTIMATE_PDF' &&
                                        h.status === 'pending_session' &&
                                        h.recipientPhone &&
                                        String(h.recipientPhone).replace(/\D/g, '').endsWith(last10)
                                    );

                                    if (matchingHist) {
                                        console.log(`[WhatsApp Webhook] Auto-delivering queued PDF for Estimate ${est.estimateNo} to ${fromPhone} (24h window active)`);
                                        const serverBase = process.env.PUBLIC_API_URL || process.env.API_BASE_URL || 'https://mvss-erp-backend.onrender.com';
                                        const pdfUrl = est.pdfUrl || `${serverBase}/api/estimates/public/customer-pdf/${est._id}.pdf`;
                                        const cleanEstNo = String(est.estimateNo || 'EST').replace(/[^a-zA-Z0-9_-]/g, '_');
                                        const docFilename = `Customer_Estimate_${cleanEstNo}.pdf`;

                                        try {
                                            const docRes = await sendDocumentMessage({
                                                to: fromPhone,
                                                documentUrl: pdfUrl,
                                                filename: docFilename,
                                                caption: `Customer Estimate - ${est.estimateNo}`,
                                                recipientName: recipientName || 'Valued Customer',
                                                relatedEntity: est._id,
                                                onModel: 'Estimate',
                                                idempotencyKey: `auto_doc_${est._id}_${Date.now()}`
                                            });

                                            if (docRes?.messageId) {
                                                matchingHist.status = 'sent';
                                                matchingHist.messageId = docRes.messageId;
                                                matchingHist.sentAt = new Date();
                                                await est.save();
                                                console.log(`[WhatsApp Webhook] Queued Customer Estimate PDF delivered successfully: wamid=${docRes.messageId}`);
                                            }
                                        } catch (pdfSendErr) {
                                            console.warn(`[WhatsApp Webhook] Failed to deliver queued PDF for Estimate ${est.estimateNo}:`, pdfSendErr.message || pdfSendErr);
                                        }
                                    }
                                }
                            } catch (queuedDocErr) {
                                console.warn('[WhatsApp Webhook] Error checking queued estimate documents:', queuedDocErr.message || queuedDocErr);
                            }
                        }
                    }
                }
            }
            return res.status(200).send('EVENT_RECEIVED');
        } else {
            return res.sendStatus(404);
        }
    } catch (error) {
        console.error('[WhatsApp Webhook] Processing error:', error);
        // Do not break the webhook acknowledgment
        return res.status(500).send('ERROR');
    }
});

// =========================================================================
// PHASE 12: META STATUS AUDIT ENDPOINTS
// =========================================================================
router.get('/audit-status', async (req, res) => {
    try {
        const result = await syncMetaTemplates();
        return res.json(result);
    } catch (error) {
        console.error('[WhatsApp] audit-status error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

router.get('/meta-status', auth, restrictTo('Admin', 'Super Admin'), async (req, res) => {
    try {
        const result = await syncMetaTemplates();
        return res.json(result);
    } catch (error) {
        console.error('[WhatsApp] meta-status error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

// =========================================================================
// PHASE 13: AUTHENTICATED ADMIN PRODUCTION TEST ENDPOINT
// =========================================================================
router.post('/test', auth, restrictTo('Admin', 'Super Admin'), async (req, res) => {
    try {
        const { phone, templateName, parameters } = req.body;
        
        if (!phone || !templateName) {
            return res.status(400).json({ error: 'phone and templateName are required.' });
        }

        // Convert simple string array to Meta components structure
        const components = parameters ? [
            {
                type: 'body',
                parameters: parameters.map(p => ({ type: 'text', text: String(p) }))
            }
        ] : [];

        const result = await sendTemplateMessage({
            to: phone,
            templateName,
            components,
            recipientName: req.user.name || 'Test Admin',
            idempotencyKey: `test_message_${Date.now()}`
        });

        return res.json({
            success: true,
            messageId: result.messageId,
            language: result.language,
            details: result.data
        });

    } catch (error) {
        const maskedRecipient = req.body?.phone ? req.body.phone.substring(0, 3) + '****' + req.body.phone.slice(-3) : 'unknown';
        console.error(`[WhatsApp] Test endpoint error for ${maskedRecipient}:`, error.message);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal Server Error'
        });
    }
});

// =========================================================================
// PHASE 14: FEEDBACK REMINDERS MANAGEMENT
// =========================================================================
router.post('/process-reminders', async (req, res) => {
    try {
        const { processPendingFeedbackReminders } = require('../services/feedbackReminderService');
        const stats = await processPendingFeedbackReminders();
        return res.json({ success: true, stats });
    } catch (error) {
        console.error('[WhatsApp] process-reminders error:', error);
        return res.status(500).json({ error: error.message || 'Failed to process feedback reminders' });
    }
});

router.get('/feedback-reminders', auth, restrictTo('Admin', 'Super Admin'), async (req, res) => {
    try {
        const FeedbackReminder = require('../models/FeedbackReminder');
        const reminders = await FeedbackReminder.find()
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        return res.json({ success: true, count: reminders.length, reminders });
    } catch (error) {
        console.error('[WhatsApp] feedback-reminders error:', error);
        return res.status(500).json({ error: error.message || 'Failed to fetch reminders' });
    }
});

// =========================================================================
// PHASE 15: WHATSAPP MONITORING & LOGS AUDIT
// =========================================================================
router.get('/logs', auth, restrictTo('Admin', 'Super Admin', 'Service', 'Accounts'), async (req, res) => {
    try {
        const { status, templateName, search, page = 1, limit = 50 } = req.query;
        const query = {};

        if (status) {
            query.status = status;
        }

        if (templateName) {
            query.templateName = templateName;
        }

        if (search) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { recipientName: regex },
                { recipientPhone: regex },
                { messageId: regex },
                { templateName: regex },
                { errorMessage: regex }
            ];
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
        const skip = (pageNum - 1) * limitNum;

        const [total, rawLogs] = await Promise.all([
            WhatsAppLog.countDocuments(query),
            WhatsAppLog.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean()
        ]);

        const logs = rawLogs.map(log => ({
            _id: log._id,
            recipientName: log.recipientName,
            recipientPhone: maskPhoneNumber(log.recipientPhone),
            templateName: log.templateName,
            messageType: log.messageType,
            direction: log.direction,
            status: log.status,
            messageId: log.messageId,
            relatedEntity: log.relatedEntity,
            onModel: log.onModel,
            errorMessage: log.errorMessage,
            metaErrorCode: log.metaErrorCode,
            attempts: log.attempts || 1,
            lastAttemptAt: log.lastAttemptAt || log.createdAt,
            language: log.language || 'en',
            idempotencyKey: log.idempotencyKey,
            createdAt: log.createdAt,
            updatedAt: log.updatedAt,
            eligibleRetry: log.status === 'failed' && (log.attempts || 1) < 3
        }));

        return res.json({
            success: true,
            count: logs.length,
            total,
            page: pageNum,
            pages: Math.ceil(total / limitNum) || 1,
            logs
        });
    } catch (error) {
        console.error('[WhatsApp] logs retrieval error:', error);
        return res.status(500).json({ error: error.message || 'Failed to retrieve WhatsApp logs' });
    }
});

// =========================================================================
// PHASE 16: AUTHORIZED WHATSAPP RETRY ENDPOINT
// =========================================================================
router.post('/logs/:id/retry', auth, restrictTo('Admin', 'Super Admin'), async (req, res) => {
    try {
        const log = await WhatsAppLog.findById(req.params.id);
        if (!log) {
            return res.status(404).json({ error: 'WhatsApp log not found' });
        }

        if (log.status !== 'failed') {
            return res.status(400).json({ error: `Only failed messages can be retried. Current status: ${log.status}` });
        }

        if ((log.attempts || 1) >= 3) {
            return res.status(400).json({ error: `Maximum retry attempts reached (${log.attempts || 1}/3)` });
        }

        log.attempts = (log.attempts || 1) + 1;
        log.lastAttemptAt = new Date();

        try {
            const retryKey = `retry_${log._id}_${Date.now()}`;
            const result = await sendTemplateMessage({
                to: log.recipientPhone,
                templateName: log.templateName,
                languageCode: log.language || 'en',
                components: log.components || [],
                recipientName: log.recipientName,
                relatedEntity: log.relatedEntity,
                onModel: log.onModel,
                idempotencyKey: retryKey
            });

            log.status = 'sent';
            log.messageId = result.messageId;
            log.errorMessage = undefined;
            log.metaErrorCode = undefined;
            await log.save();

            return res.json({
                success: true,
                message: 'WhatsApp message retried successfully',
                messageId: result.messageId,
                log: {
                    _id: log._id,
                    recipientName: log.recipientName,
                    recipientPhone: maskPhoneNumber(log.recipientPhone),
                    status: log.status,
                    attempts: log.attempts,
                    messageId: log.messageId,
                    lastAttemptAt: log.lastAttemptAt
                }
            });
        } catch (sendErr) {
            log.status = 'failed';
            log.errorMessage = sendErr.message || String(sendErr);
            log.metaErrorCode = String(sendErr.metaError?.code || '');
            await log.save();

            return res.status(502).json({
                success: false,
                error: 'Retry failed: ' + log.errorMessage,
                metaErrorCode: log.metaErrorCode,
                attempts: log.attempts
            });
        }
    } catch (error) {
        console.error('[WhatsApp] retry error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error while retrying' });
    }
});

// Register / Setup Customer Estimate Document Template with Meta Graph API
router.post('/setup-document-template', auth, restrictTo('Admin', 'Super Admin'), async (req, res) => {
    try {
        const result = await createDocumentTemplate();
        // Refresh Meta templates cache
        await syncMetaTemplates();
        if (result.success) {
            return res.json({ success: true, message: 'Document template submitted to Meta for approval.', result: result.data });
        } else {
            return res.status(400).json({ success: false, error: result.error, details: result.details });
        }
    } catch (err) {
        console.error('[WhatsApp] setup-document-template error:', err);
        return res.status(500).json({ error: err.message || 'Failed to setup document template' });
    }
});

module.exports = router;
