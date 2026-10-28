const FeedbackReminder = require('../models/FeedbackReminder');
const GatePass = require('../models/GatePass');
const JobCard = require('../models/JobCard');
const Notification = require('../models/Notification');
const { sendTemplateMessage, validateCustomerContact } = require('./whatsappService');

/**
 * Schedule a feedback reminder after a Gate Pass is issued.
 * Default delay is 2 hours (can be customized for immediate test verification).
 */
const scheduleFeedbackReminder = async ({ gatePass, delayMs = 2 * 60 * 60 * 1000 }) => {
  if (!gatePass || !gatePass._id) {
    throw new Error('Gate pass record is required to schedule feedback reminder.');
  }

  const rawPhone = gatePass.customerMobile;
  const customerName = String(gatePass.customerName || 'Valued Customer').trim();
  const vehicleNumber = String(gatePass.vehicleNumber || 'your vehicle').trim();
  const gatePassNo = String(gatePass.gatePassNo || 'N/A').trim();
  const jobCardNumber = String(gatePass.jobCardNumber || '').trim();

  const idempotencyKey = `feedback_request_${gatePass._id}`;
  const maskedPhone = rawPhone ? (rawPhone.substring(0, 3) + '****' + rawPhone.slice(-3)) : 'missing';

  // Check if a reminder already exists for this gate pass
  const existing = await FeedbackReminder.findOne({
    $or: [
      { gatePassId: gatePass._id },
      { idempotencyKey }
    ]
  });

  if (existing) {
    console.log(`[Feedback Automation] Reminder already scheduled for GatePass ${gatePassNo} (status: ${existing.status}). Skipping duplicate scheduling.`);
    return existing;
  }

  const scheduledAt = new Date(Date.now() + delayMs);
  const reminder = new FeedbackReminder({
    gatePassId: gatePass._id,
    gatePassNo,
    jobCardNumber,
    customerName,
    customerMobile: rawPhone,
    vehicleNumber,
    scheduledAt,
    status: 'pending',
    idempotencyKey
  });

  await reminder.save();
  console.log(`[Feedback Automation] [Stage 3] Scheduled feedback reminder for GatePass ${gatePassNo}: Customer="${customerName}", Phone="${maskedPhone}", ScheduledAt=${scheduledAt.toISOString()}`);
  return reminder;
};

/**
 * Cancel a pending feedback reminder (e.g. if gate pass is returned, cancelled, or deleted).
 */
const cancelFeedbackReminder = async (gatePassId, reason = 'Gate pass status changed/cancelled') => {
  if (!gatePassId) return null;

  const result = await FeedbackReminder.updateMany(
    { gatePassId, status: 'pending' },
    { 
      $set: { 
        status: 'cancelled', 
        cancellationReason: reason 
      } 
    }
  );

  if (result.modifiedCount > 0) {
    console.log(`[Feedback Automation] Cancelled ${result.modifiedCount} pending feedback reminder(s) for GatePass ID ${gatePassId}. Reason: ${reason}`);
  }
  return result;
};

/**
 * Process all pending feedback reminders that have reached their scheduled time.
 * Excludes cancelled or completed records and prevents duplicate dispatches.
 */
const processPendingFeedbackReminders = async (customAxios = null) => {
  const now = new Date();
  const pendingReminders = await FeedbackReminder.find({
    status: 'pending',
    scheduledAt: { $lte: now }
  }).sort({ scheduledAt: 1 }).limit(50);

  const stats = {
    found: pendingReminders.length,
    sent: 0,
    cancelled: 0,
    failed: 0,
    skipped: 0
  };

  if (pendingReminders.length === 0) {
    return stats;
  }

  console.log(`[Feedback Automation] Processing ${pendingReminders.length} pending feedback reminder(s) at ${now.toISOString()}...`);

  for (const reminder of pendingReminders) {
    const maskedPhone = reminder.customerMobile 
      ? (reminder.customerMobile.substring(0, 3) + '****' + reminder.customerMobile.slice(-3)) 
      : 'missing';

    try {
      // 1. Verify related GatePass is still active (exclude returned or cancelled records)
      const gatePass = await GatePass.findById(reminder.gatePassId);
      if (!gatePass || gatePass.status === 'Returned' || gatePass.status === 'Cancelled') {
        const cancelReason = !gatePass 
          ? 'Related GatePass record no longer exists' 
          : `GatePass status is '${gatePass.status}'`;
        
        reminder.status = 'cancelled';
        reminder.cancellationReason = cancelReason;
        await reminder.save();
        console.log(`[Feedback Automation] Cancelled reminder for GatePass ${reminder.gatePassNo}: ${cancelReason}`);
        stats.cancelled++;
        continue;
      }

      // 2. Validate customer contact and normalize phone
      const contactCheck = validateCustomerContact(null, reminder.customerMobile);
      if (!contactCheck.valid) {
        reminder.status = 'failed';
        reminder.error = contactCheck.reason;
        await reminder.save();
        console.warn(`[Feedback Automation] [Stage 4] Skipping reminder for GatePass ${reminder.gatePassNo}: ${contactCheck.reason}`);
        stats.skipped++;
        continue;
      }

      // 3. Dispatch template message via Meta WhatsApp Cloud API
      const templateName = 'mvss_feedback_request';
      console.log(`[Feedback Automation] [Stage 5] WhatsApp send attempted: To=${contactCheck.masked}, Template=${templateName}, CorrelationKey=${reminder.idempotencyKey}`);

      const waResult = await sendTemplateMessage({
        to: contactCheck.phone,
        templateName,
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: reminder.customerName },
              { type: 'text', text: getFeedbackPrompt(reminder.vehicleNumber) }
            ]
          }
        ],
        recipientName: reminder.customerName,
        relatedEntity: reminder.gatePassId,
        onModel: 'GatePass',
        idempotencyKey: reminder.idempotencyKey
      }, customAxios);

      // 4. Mark reminder as sent
      reminder.status = 'sent';
      reminder.sentAt = new Date();
      reminder.messageId = waResult.messageId || 'duplicate_skipped';
      await reminder.save();

      console.log(`[Feedback Automation] [Stage 6] Meta response accepted: GatePass=${reminder.gatePassNo}, wamid=${reminder.messageId}, Status=${waResult.status || 'sent'}`);
      stats.sent++;

    } catch (err) {
      console.error(`[Feedback Automation] [Stage 6] Meta response failed for GatePass ${reminder.gatePassNo}:`, err.message || err);
      reminder.status = 'failed';
      reminder.error = err.message || String(err);
      await reminder.save();
      stats.failed++;
    }
  }

  console.log(`[Feedback Automation] Processing complete: Found=${stats.found}, Sent=${stats.sent}, Cancelled=${stats.cancelled}, Failed=${stats.failed}, Skipped=${stats.skipped}`);
  return stats;
};

/**
 * Builds the feedback prompt replacing URL links with a direct 1-5 star rating & experience description request.
 */
const getFeedbackPrompt = (vehicleNumber) => {
  const vehPrefix = vehicleNumber && vehicleNumber !== 'your vehicle' ? `For vehicle ${vehicleNumber}: ` : '';
  return `${vehPrefix}Reply directly with a rating from 1 to 5 stars (1=Poor, 5=Excellent) and a short description of your experience.`;
};

/**
 * Parses a customer's WhatsApp reply to extract rating (1-5) and feedback description.
 * Supports:
 * - Star emojis (1-5: ⭐, 🌟, ★)
 * - Leading numbers ('5', '5/5', '5 out of 5', '5 stars')
 * - Numbers with text ('5 - Excellent work', '4: Good job', '5\nVery fast')
 * - Rating prefix ('Rating: 5 Good service', 'Rating 4')
 * - 'X stars' within message
 * - Rejects invalid ratings (< 1, > 5)
 */
const parseCustomerFeedback = (rawText) => {
  if (!rawText || typeof rawText !== 'string') {
    return { valid: false, rating: null, feedbackText: '', rawResponse: '' };
  }
  const text = rawText.trim();

  // 1. Star emojis (⭐, 🌟, ★)
  const starMatches = text.match(/[⭐🌟★]/g);
  if (starMatches && starMatches.length >= 1 && starMatches.length <= 5) {
    const rating = starMatches.length;
    const cleanText = text.replace(/[⭐🌟★]/g, '').replace(/^[\s\:\-\.\,]+/, '').trim();
    return { valid: true, rating, feedbackText: cleanText, rawResponse: text };
  }

  // 2. 'Rating: 5' or 'Rating 5' pattern
  const ratingPrefixMatch = text.match(/^(?:rating|rate)\s*[:=\-]?\s*([1-5])(?:\s*(?:\/|\bout of\b)\s*5)?(?:\s*stars?)?\s*[\:\-\.\,\n]?\s*(.*)$/i);
  if (ratingPrefixMatch) {
    const rating = parseInt(ratingPrefixMatch[1], 10);
    const cleanText = (ratingPrefixMatch[2] || '').replace(/^[\s\:\-\.\,]+/, '').trim();
    return { valid: true, rating, feedbackText: cleanText, rawResponse: text };
  }

  // 3. Exact single digit 1-5 or single digit with /5 or out of 5 (e.g. '5', '5/5', '5 / 5', '5 out of 5', '5 stars')
  const exactDigitMatch = text.match(/^([1-5])(?:\s*(?:\/|\bout of\b)\s*5)?(?:\s*stars?)?$/i);
  if (exactDigitMatch) {
    const rating = parseInt(exactDigitMatch[1], 10);
    return { valid: true, rating, feedbackText: '', rawResponse: text };
  }

  // 4. Leading number 1-5 followed by description (e.g. '5 - Great job', '4 / 5 Good service', '5\nAwesome')
  const leadingRatingMatch = text.match(/^([1-5])(?:\s*(?:\/|\bout of\b)\s*5)?(?:\s*stars?)?\s*(?:[\:\-\.\,\n]|\s)\s*(.*)$/i);
  if (leadingRatingMatch) {
    const rating = parseInt(leadingRatingMatch[1], 10);
    const cleanText = (leadingRatingMatch[2] || '').replace(/^[\s\:\-\.\,]+/, '').trim();
    return { valid: true, rating, feedbackText: cleanText, rawResponse: text };
  }

  // 5. 'X stars' anywhere in message (e.g. 'giving 5 stars, good service')
  const starWordMatch = text.match(/\b([1-5])\s*stars?\b/i);
  if (starWordMatch) {
    const rating = parseInt(starWordMatch[1], 10);
    return { valid: true, rating, feedbackText: text, rawResponse: text };
  }

  // Fallback: no valid 1-5 rating detected
  return { valid: false, rating: null, feedbackText: text, rawResponse: text };
};

/**
 * Correlates an incoming WhatsApp reply to the customer's FeedbackReminder,
 * updates FeedbackReminder, updates the corresponding JobCard, and notifies staff.
 */
const handleInboundFeedbackReply = async ({ fromPhone, messageText, messageId = null }) => {
  if (!fromPhone || !messageText) {
    return { processed: false, reason: 'Missing fromPhone or messageText' };
  }

  const digits = String(fromPhone).replace(/\D/g, '');
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;

  const phoneVariants = [
    fromPhone,
    digits,
    last10,
    `91${last10}`,
    `+91${last10}`,
    `0${last10}`
  ];

  // Find the most recent sent feedback reminder for this customer
  let reminder = await FeedbackReminder.findOne({
    customerMobile: { $in: phoneVariants },
    status: 'sent'
  }).sort({ sentAt: -1, createdAt: -1 });

  if (!reminder && last10.length === 10) {
    reminder = await FeedbackReminder.findOne({
      customerMobile: { $regex: new RegExp(last10 + '$') },
      status: 'sent'
    }).sort({ sentAt: -1, createdAt: -1 });
  }

  if (!reminder) {
    console.log(`[Feedback Automation] Inbound message from ${fromPhone} did not match an active sent FeedbackReminder.`);
    return { processed: false, reason: 'No matching FeedbackReminder found' };
  }

  // Parse rating and feedback text
  const parsed = parseCustomerFeedback(messageText);

  // Update FeedbackReminder
  reminder.responseReceived = true;
  if (parsed.valid && parsed.rating) {
    reminder.rating = parsed.rating;
  }
  reminder.feedbackText = parsed.feedbackText || messageText;
  reminder.rawResponse = messageText;
  reminder.respondedAt = new Date();
  await reminder.save();

  console.log(`[Feedback Automation] Recorded customer feedback for GatePass ${reminder.gatePassNo} (JobCard: ${reminder.jobCardNumber || 'N/A'}): Rating=${reminder.rating || 'N/A'}, Text="${reminder.feedbackText}"`);

  // Update JobCard if linked
  let jobCardUpdated = false;
  if (reminder.jobCardNumber) {
    try {
      const jobCard = await JobCard.findOne({ jobCardNumber: reminder.jobCardNumber });
      if (jobCard) {
        if (!jobCard.customerSatisfaction) {
          jobCard.customerSatisfaction = {};
        }
        jobCard.customerSatisfaction.date = new Date();
        if (parsed.valid && parsed.rating) {
          jobCard.customerSatisfaction.rating = parsed.rating;
        }
        jobCard.customerSatisfaction.feedback = parsed.feedbackText || messageText;
        jobCard.customerSatisfaction.source = 'WhatsApp';
        await jobCard.save();
        jobCardUpdated = true;
        console.log(`[Feedback Automation] Updated JobCard ${reminder.jobCardNumber} customerSatisfaction: Rating=${jobCard.customerSatisfaction.rating || 'N/A'}`);
      }
    } catch (jcErr) {
      console.warn(`[Feedback Automation] Failed to update JobCard ${reminder.jobCardNumber}:`, jcErr.message);
    }
  }

  // Create staff notification
  try {
    await Notification.create({
      type: 'feedback',
      title: `Feedback Received: ${parsed.valid ? `${parsed.rating}★` : 'Customer Reply'}`,
      message: `Customer ${reminder.customerName} (${reminder.vehicleNumber}) replied: "${messageText}"`,
      customerName: reminder.customerName,
      mobile: reminder.customerMobile,
      vehicleNumber: reminder.vehicleNumber,
      status: 'unread'
    });
  } catch (notifErr) {
    console.warn('[Feedback Automation] Staff notification creation skipped:', notifErr.message);
  }

  return {
    processed: true,
    reminder,
    jobCardUpdated,
    parsed
  };
};

module.exports = {
  getFeedbackPrompt,
  parseCustomerFeedback,
  handleInboundFeedbackReply,
  scheduleFeedbackReminder,
  cancelFeedbackReminder,
  processPendingFeedbackReminders
};
