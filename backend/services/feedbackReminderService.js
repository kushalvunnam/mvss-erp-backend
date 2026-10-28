const FeedbackReminder = require('../models/FeedbackReminder');
const GatePass = require('../models/GatePass');
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
              { type: 'text', text: reminder.vehicleNumber }
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

module.exports = {
  scheduleFeedbackReminder,
  cancelFeedbackReminder,
  processPendingFeedbackReminders
};
