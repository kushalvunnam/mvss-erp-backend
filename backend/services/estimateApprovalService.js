const Estimate = require('../models/Estimate');
const JobCard = require('../models/JobCard');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const { logAction } = require('../utils/logger');
const {
  sendTemplateMessage,
  normalizePhoneNumber,
  maskPhoneNumber,
  validateCustomerContact
} = require('./whatsappService');

/**
 * Normalizes customer phone numbers to search for matching customer / estimate records.
 */
const extractSearchableDigits = (rawPhone) => {
  if (!rawPhone) return '';
  const digits = String(rawPhone).replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

/**
 * Analyzes incoming message text or button payload to detect customer approval or rejection.
 */
const detectCustomerApprovalIntent = (rawText, payloadId) => {
  const text = String(rawText || '').trim().toLowerCase();
  const id = String(payloadId || '').trim().toLowerCase();

  // 1. Approval detection
  const approvalKeywords = [
    'approve', 'approved', 'yes', 'proceed', 'accept', 'accepted',
    'ok', 'okay', 'confirm', 'confirmed', 'agree', 'agreed', 'start work'
  ];
  const isApprovalWord = approvalKeywords.some(kw => {
    const regex = new RegExp(`(^|\\b)${kw}(\\b|$)`, 'i');
    return regex.test(text);
  });
  const isApprovalId = id.includes('approve') || id.includes('accept');

  if (isApprovalWord || isApprovalId) {
    return 'APPROVE';
  }

  // 2. Rejection detection
  const rejectionKeywords = [
    'reject', 'rejected', 'no', 'decline', 'declined', 'cancel',
    'cancelled', 'stop', 'dont proceed', "don't proceed", 'hold',
    'not ok', 'not okay', 'expensive', 'too costly', 'reestimate'
  ];
  const isRejectionWord = rejectionKeywords.some(kw => {
    const regex = new RegExp(`(^|\\b)${kw}(\\b|$)`, 'i');
    return regex.test(text);
  });
  const isRejectionId = id.includes('reject') || id.includes('decline');

  if (isRejectionWord || isRejectionId) {
    return 'REJECT';
  }

  return null;
};

/**
 * Processes an inbound WhatsApp message from a customer.
 * If the customer is responding to an estimate awaiting approval, updates the estimate status.
 */
const handleInboundEstimateReply = async ({
  fromPhone,
  messageType,
  messageText,
  interactiveData,
  buttonData,
  messageId
}) => {
  if (!fromPhone) return { processed: false, reason: 'Missing sender phone' };

  // 1. Extract text or button identifier
  let rawText = '';
  let payloadId = '';

  if (messageType === 'text') {
    rawText = messageText || '';
  } else if (messageType === 'interactive' && interactiveData) {
    if (interactiveData.type === 'button_reply') {
      rawText = interactiveData.button_reply?.title || '';
      payloadId = interactiveData.button_reply?.id || '';
    } else if (interactiveData.type === 'list_reply') {
      rawText = interactiveData.list_reply?.title || '';
      payloadId = interactiveData.list_reply?.id || '';
    }
  } else if (messageType === 'button' && buttonData) {
    rawText = buttonData.text || '';
    payloadId = buttonData.payload || '';
  }

  const intent = detectCustomerApprovalIntent(rawText, payloadId);
  if (!intent) {
    return { processed: false, reason: 'No approval or rejection keyword detected in message' };
  }

  const last10 = extractSearchableDigits(fromPhone);
  if (!last10) {
    return { processed: false, reason: 'Invalid sender phone format' };
  }

  // 2. Find customer by phone number
  const customer = await Customer.findOne({
    $or: [
      { mobile: fromPhone },
      { mobile: `+${fromPhone}` },
      { mobile: last10 },
      { mobile: `+91${last10}` },
      { mobile: new RegExp(last10 + '$') },
      { phone: last10 },
      { contactNumber: last10 }
    ]
  }).lean();

  // 3. Find the pending estimate awaiting approval
  const awaitingStatuses = ['Waiting for Approval', 'Sent'];
  let candidateEstimates = [];

  if (customer) {
    const jobCards = await JobCard.find({ customerId: customer._id }).select('_id').lean();
    const jcIds = jobCards.map(jc => jc._id);
    candidateEstimates = await Estimate.find({
      jobCardId: { $in: jcIds },
      status: { $in: awaitingStatuses }
    }).sort({ updatedAt: -1, createdAt: -1 });
  }

  if (candidateEstimates.length === 0) {
    // Fallback: search by recipient phone recorded in whatsappHistory
    candidateEstimates = await Estimate.find({
      'whatsappHistory.recipientPhone': new RegExp(last10 + '$'),
      status: { $in: awaitingStatuses }
    }).sort({ updatedAt: -1, createdAt: -1 });
  }

  if (candidateEstimates.length === 0) {
    console.log(`[Estimate Inbound Reply] No pending estimate awaiting approval found for phone ${fromPhone} (last10: ${last10}).`);
    return { processed: false, reason: 'No estimate awaiting approval found for this customer' };
  }

  const estimate = candidateEstimates[0];
  const customerName = customer?.name || 'Customer';

  console.log(`[Estimate Inbound Reply] Detected ${intent} from ${maskPhoneNumber(fromPhone)} for Estimate ${estimate.estimateNo} (ID: ${estimate._id})`);

  // 4. Handle Customer Approval
  if (intent === 'APPROVE') {
    const oldStatus = estimate.status;
    estimate.status = 'Approved';
    estimate.approvalMetadata = {
      approvedByName: `${customerName} (via WhatsApp)`,
      approvedAt: new Date(),
      finalAmount: estimate.totals?.grandTotal || 0,
      previousStatus: oldStatus
    };
    await estimate.save();

    // Sync linked Job Card to 'Work In Progress'
    if (estimate.jobCardId) {
      await JobCard.findByIdAndUpdate(estimate.jobCardId, {
        status: 'Work In Progress',
        estAmt: estimate.totals?.grandTotal || 0
      });
    }

    await logAction(null, 'ESTIMATE_APPROVE', `Customer ${customerName} (${maskPhoneNumber(fromPhone)}) approved Estimate ${estimate.estimateNo} via WhatsApp reply. Status updated to Approved.`, null);
    console.log(`[Estimate Inbound Reply] Estimate ${estimate.estimateNo} updated to Approved.`);

    // Trigger WhatsApp estimate approved notification (mvss_estimate_approved)
    try {
      const jc = estimate.jobCardId ? await JobCard.findById(estimate.jobCardId).lean() : null;
      let vehicle = null;
      if (jc?.vehicleId) {
        vehicle = await Vehicle.findById(jc.vehicleId).lean();
      }
      const vehicleNumber = String(vehicle?.vehicleNumber || vehicle?.regNo || 'your vehicle').trim();
      const estimateNumber = String(estimate.estimateNo || 'N/A').trim();
      const jobCardNumber = String(jc?.jobCardNo || 'N/A').trim();
      const totalAmount = String(estimate.totals?.roundedGrandTotal || estimate.totals?.grandTotal || '0').trim();

      const contactCheck = validateCustomerContact(customer, fromPhone);
      if (contactCheck.valid) {
        await sendTemplateMessage({
          to: contactCheck.phone,
          templateName: 'mvss_estimate_approved',
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: customerName },
                { type: 'text', text: vehicleNumber },
                { type: 'text', text: estimateNumber },
                { type: 'text', text: jobCardNumber },
                { type: 'text', text: totalAmount }
              ]
            }
          ],
          recipientName: customerName,
          relatedEntity: estimate._id,
          onModel: 'Estimate',
          idempotencyKey: `mvss_estimate_approved_inbound_${estimate._id}`
        });
      }
    } catch (waErr) {
      console.warn('[Estimate Inbound Reply] Note: Post-approval WhatsApp dispatch error:', waErr.message || waErr);
    }

    return {
      processed: true,
      action: 'approved',
      estimate,
      customerName,
      estimateNo: estimate.estimateNo
    };
  }

  // 5. Handle Customer Rejection
  if (intent === 'REJECT') {
    const oldStatus = estimate.status;
    estimate.status = 'Rejected';
    estimate.rejectionReason = rawText || 'Customer rejected estimate via WhatsApp';
    await estimate.save();

    // Revert Job Card to Estimation for revision
    if (estimate.jobCardId) {
      await JobCard.findByIdAndUpdate(estimate.jobCardId, {
        status: 'Estimation'
      });
    }

    await logAction(null, 'ESTIMATE_REJECT', `Customer ${customerName} (${maskPhoneNumber(fromPhone)}) rejected Estimate ${estimate.estimateNo} via WhatsApp reply. Note: "${rawText}"`, null);
    console.log(`[Estimate Inbound Reply] Estimate ${estimate.estimateNo} updated to Rejected.`);

    return {
      processed: true,
      action: 'rejected',
      estimate,
      customerName,
      estimateNo: estimate.estimateNo,
      reason: rawText
    };
  }

  return { processed: false };
};

module.exports = {
  handleInboundEstimateReply,
  detectCustomerApprovalIntent
};
