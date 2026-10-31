const express = require('express');
const Estimate = require('../models/Estimate');
const JobCard = require('../models/JobCard');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const { auth, restrictTo } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const { generateEstimatePDF, generateCustomerEstimatePDF } = require('../utils/pdfGenerator');
const { getNextSequence } = require('../utils/documentNumbering');
const router = express.Router();

// Helper to auto-generate Estimate Number
const generateEstimateNo = async () => {
  return await getNextSequence('EST', 'Estimate');
};

const numberToWords = (num) => {
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convert = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'and ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + 'Crore ' + (n % 10000000 !== 0 ? convert(n % 10000000) : '');
  };

  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);

  let words = 'Rupees ' + convert(integerPart);
  if (decimalPart > 0) {
    words += 'and ' + convert(decimalPart) + 'Paise ';
  }
  return words + 'Only';
};

/**
 * Canonical Estimate Amount Resolver:
 * Identifies the canonical saved estimate amount without recalculating:
 * 1. Approved Final Amount (if estimate is Approved)
 * 2. Manual Grand Total (if manualOverride is active)
 * 3. Persisted Grand Total from totals
 */
const getCanonicalEstimateAmount = (estimate) => {
  if (!estimate) return 0;
  if (estimate.status === 'Approved' && estimate.approvalMetadata?.finalAmount !== undefined && estimate.approvalMetadata?.finalAmount !== null && Number(estimate.approvalMetadata.finalAmount) > 0) {
    return Number(estimate.approvalMetadata.finalAmount);
  }
  if (estimate.manualOverride && estimate.manualGrandTotal !== undefined && estimate.manualGrandTotal !== null && Number(estimate.manualGrandTotal) > 0) {
    return Number(estimate.manualGrandTotal);
  }
  return Number(estimate.totals?.grandTotal || estimate.totals?.roundedGrandTotal || 0);
};

/**
 * Format amounts according to Indian Numbering System (e.g. 3,681.60 or 5,000)
 */
const formatIndianCurrency = (amount) => {
  const num = Number(amount) || 0;
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  });
};

const checkIsInterstate = (customer) => {
  if (!customer) return false;
  if (customer.gstNumber && customer.gstNumber.trim() !== '') {
    return !customer.gstNumber.trim().startsWith('36');
  }
  if (customer.address && customer.address.trim() !== '') {
    const addr = customer.address.toLowerCase();
    if (addr.includes('telangana') || addr.includes('hyderabad') || addr.includes('secunderabad')) {
      return false;
    }
    const otherStates = [
      'andhra', 'karnataka', 'maharashtra', 'bangalore', 'mumbai', 'pune', 'delhi', 
      'tamil nadu', 'chennai', 'kerala', 'goa', 'gujarat', 'rajasthan', 'madhya pradesh',
      'ap', 'ka', 'mh', 'dl', 'tn'
    ];
    return otherStates.some(state => addr.includes(state));
  }
  return false;
};

// Recalculate parts/labour totals and GST
const recalculateEstimate = (parts = [], labour = [], isInterstate = false) => {
  let partsTotal = 0;
  let labourTotal = 0;
  let gstTotal = 0;

  const processedParts = parts.map(part => {
    const qty = Number(part.qty) || 1;
    const discount = Number(part.discount) || 0;
    const unit = part.unit || 'Pcs';
    const gstPercent = (part.gstPercent !== undefined && part.gstPercent !== null && part.gstPercent !== '') ? Number(part.gstPercent) : 18;
    
    let total, taxableValue, gstAmount, cgstAmount, sgstAmount, igstAmount, rate;
    
    if (part.total && Number(part.total) > 0) {
      total = Math.round(Number(part.total) * 100) / 100;
      taxableValue = Math.round((total / (1 + (gstPercent / 100))) * 100) / 100;
      gstAmount = Math.round((total - taxableValue) * 100) / 100;
      if (isInterstate) {
        igstAmount = gstAmount;
        cgstAmount = 0;
        sgstAmount = 0;
      } else {
        cgstAmount = Math.round((gstAmount / 2) * 100) / 100;
        sgstAmount = Math.round((gstAmount - cgstAmount) * 100) / 100;
        igstAmount = 0;
      }
      rate = Math.round(((taxableValue + discount) / qty) * 100) / 100;
    } else {
      rate = Number(part.rate) || 0;
      taxableValue = Math.round(((qty * rate) - discount) * 100) / 100;
      if (isInterstate) {
        igstAmount = Math.round((taxableValue * (gstPercent / 100)) * 100) / 100;
        cgstAmount = 0;
        sgstAmount = 0;
        gstAmount = igstAmount;
      } else {
        const cgstPercent = gstPercent / 2;
        const sgstPercent = gstPercent / 2;
        cgstAmount = Math.round((taxableValue * (cgstPercent / 100)) * 100) / 100;
        sgstAmount = Math.round((taxableValue * (sgstPercent / 100)) * 100) / 100;
        igstAmount = 0;
        gstAmount = cgstAmount + sgstAmount;
      }
      total = Math.round((taxableValue + gstAmount) * 100) / 100;
    }

    const amount = taxableValue;
    partsTotal += taxableValue;
    gstTotal += gstAmount;

    const partId = (part.partId && typeof part.partId === 'string' && part.partId.trim().length === 24) ? part.partId.trim() : undefined;

    return {
      partId,
      name: part.name,
      partNo: part.partNo,
      hsnCode: part.hsnCode,
      unit,
      qty,
      rate,
      discount,
      taxableValue,
      cgstAmount,
      sgstAmount,
      igstAmount,
      gstPercent,
      amount,
      gstAmount,
      total
    };
  });

  const processedLabour = labour.map(lab => {
    const discount = Number(lab.discount) || 0;
    const gstPercent = (lab.gstPercent !== undefined && lab.gstPercent !== null && lab.gstPercent !== '') ? Number(lab.gstPercent) : 18;
    
    let total, taxableValue, gstAmount, cgstAmount, sgstAmount, igstAmount, rate;
    
    if (lab.total && Number(lab.total) > 0) {
      total = Math.round(Number(lab.total) * 100) / 100;
      taxableValue = Math.round((total / (1 + (gstPercent / 100))) * 100) / 100;
      gstAmount = Math.round((total - taxableValue) * 100) / 100;
      if (isInterstate) {
        igstAmount = gstAmount;
        cgstAmount = 0;
        sgstAmount = 0;
      } else {
        cgstAmount = Math.round((gstAmount / 2) * 100) / 100;
        sgstAmount = Math.round((gstAmount - cgstAmount) * 100) / 100;
        igstAmount = 0;
      }
      rate = Math.round((taxableValue + discount) * 100) / 100;
    } else {
      rate = Number(lab.rate) || 0;
      taxableValue = Math.round((rate - discount) * 100) / 100;
      if (isInterstate) {
        igstAmount = Math.round((taxableValue * (gstPercent / 100)) * 100) / 100;
        cgstAmount = 0;
        sgstAmount = 0;
        gstAmount = igstAmount;
      } else {
        const cgstPercent = gstPercent / 2;
        const sgstPercent = gstPercent / 2;
        cgstAmount = Math.round((taxableValue * (cgstPercent / 100)) * 100) / 100;
        sgstAmount = Math.round((taxableValue * (sgstPercent / 100)) * 100) / 100;
        igstAmount = 0;
        gstAmount = cgstAmount + sgstAmount;
      }
      total = Math.round((taxableValue + gstAmount) * 100) / 100;
    }

    const amount = taxableValue;
    labourTotal += taxableValue;
    gstTotal += gstAmount;

    return {
      description: lab.description,
      rate,
      discount,
      taxableValue,
      cgstAmount,
      sgstAmount,
      igstAmount,
      gstPercent,
      amount,
      gstAmount,
      total
    };
  });

  const grandTotal = Math.round((partsTotal + labourTotal + gstTotal) * 100) / 100;
  const amountInWords = numberToWords(grandTotal);

  return {
    parts: processedParts,
    labour: processedLabour,
    amountInWords,
    totals: {
      partsTotal: Math.round(partsTotal * 100) / 100,
      labourTotal: Math.round(labourTotal * 100) / 100,
      gstTotal: Math.round(gstTotal * 100) / 100,
      grandTotal,
    }
  };
};

// List estimates with filters
router.get('/', auth, async (req, res) => {
  try {
    const { status, jobCardId, search } = req.query;
    let query = {};
    if (status) {
      if (status === 'Waiting for Approval' || status === 'Sent') {
        query.status = { $in: ['Waiting for Approval', 'Sent'] };
      } else {
        query.status = status;
      }
    }
    if (jobCardId) query.jobCardId = jobCardId;

    if (search && search.trim() !== '') {
      const term = search.trim();
      const Customer = require('../models/Customer');
      const Vehicle = require('../models/Vehicle');
      const JobCard = require('../models/JobCard');

      const [customers, vehicles] = await Promise.all([
        Customer.find({
          $or: [
            { name: { $regex: term, $options: 'i' } },
            { mobile: { $regex: term, $options: 'i' } }
          ]
        }).select('_id').lean(),
        Vehicle.find({
          $or: [
            { vehicleNumber: { $regex: term, $options: 'i' } },
            { chassisNumber: { $regex: term, $options: 'i' } }
          ]
        }).select('_id').lean()
      ]);

      const customerIds = customers.map(c => c._id);
      const vehicleIds = vehicles.map(v => v._id);

      const jobCards = await JobCard.find({
        $or: [
          { customerId: { $in: customerIds } },
          { vehicleId: { $in: vehicleIds } }
        ]
      }).select('_id').lean();

      const jobCardIds = jobCards.map(jc => jc._id);

      query.$or = [
        { estimateNo: { $regex: term, $options: 'i' } },
        { jobCardId: { $in: jobCardIds } }
      ];
    }

    const estimates = await Estimate.find(query)
      .populate({
        path: 'jobCardId',
        populate: [{ path: 'customerId' }, { path: 'vehicleId' }]
      })
      .sort({ createdAt: -1 })
      .lean();

    res.send(estimates);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch estimates.' });
  }
});

// Get single estimate details
router.get('/:id', auth, async (req, res) => {
  try {
    const estimate = await Estimate.findById(req.params.id)
      .populate({
        path: 'jobCardId',
        populate: [{ path: 'customerId' }, { path: 'vehicleId' }]
      });
    if (!estimate) return res.status(404).send({ error: 'Estimate not found.' });
    res.send(estimate);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch estimate.' });
  }
});

// Create estimate
router.post('/', auth, restrictTo('Admin', 'Service', 'Accounts', 'Body Shop', 'Accounts Executive'), async (req, res) => {
  try {
    const { jobCardId, parts, labour, manualOverride, manualGrandTotal, overriddenGrandTotal, grandTotal } = req.body;
    
    // Check if Job Card exists
    const jobCard = await JobCard.findById(jobCardId);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    // Resolve customer and check if interstate
    const customer = await Customer.findById(jobCard.customerId);
    const isInterstate = checkIsInterstate(customer);

    // Check stock availability automatically
    const Inventory = require('../models/Inventory');
    if (parts && parts.length > 0) {
      for (const part of parts) {
        if (part.partId) {
          const invItem = await Inventory.findById(part.partId);
          if (!invItem) return res.status(404).send({ error: `Inventory item not found for part: ${part.name}` });
          if (invItem.stockQuantity < Number(part.qty)) {
            return res.status(400).send({ error: `Insufficient stock for part: ${part.name} (${invItem.partNumber}). Available: ${invItem.stockQuantity}, Requested: ${part.qty}` });
          }
        }
      }
    }

    const estimateNo = await generateEstimateNo();
    const calculations = recalculateEstimate(parts, labour, isInterstate);

    const isManual = Boolean(manualOverride);
    const rawOverrideTotal = manualGrandTotal !== undefined ? manualGrandTotal : (overriddenGrandTotal !== undefined ? overriddenGrandTotal : grandTotal);
    const parsedOverride = (isManual && rawOverrideTotal !== undefined && rawOverrideTotal !== null && rawOverrideTotal !== '')
      ? Number(rawOverrideTotal)
      : null;

    if (parsedOverride !== null && !isNaN(parsedOverride) && parsedOverride >= 0) {
      calculations.totals.grandTotal = parsedOverride;
      calculations.amountInWords = numberToWords(parsedOverride);
    }

    const estimate = new Estimate({
      estimateNo,
      jobCardId,
      parts: calculations.parts,
      labour: calculations.labour,
      totals: calculations.totals,
      amountInWords: calculations.amountInWords,
      manualOverride: isManual && parsedOverride !== null,
      manualGrandTotal: parsedOverride,
      status: 'Draft',
    });

    await estimate.save();
    
    // Auto-update Job Card status to Inspection or ready to repair
    await JobCard.findByIdAndUpdate(jobCardId, { status: 'Estimation', estAmt: calculations.totals.grandTotal });

    await logAction(req.user, 'ESTIMATE_CREATE', `Created Estimate ${estimateNo} for Job Card ${jobCard.jobCardNo}`, req);

    // [Stage 2] Estimate saved
    console.log(`[Estimate] [Stage 2] Estimate saved successfully: ID=${estimate._id}, EstimateNo=${estimate.estimateNo}, JobCard=${jobCard.jobCardNo}`);

    // Note: Estimate is created in Draft mode. WhatsApp Customer Estimate PDF and Waiting for Approval notification
    // are dispatched when admin clicks Send on the Estimates page, preventing premature dispatches.
    res.status(201).send(estimate);
  } catch (error) {
    res.status(400).send({ error: 'Failed to create estimate: ' + error.message });
  }
});

// Helper function for estimate approval workflow
const executeEstimateApproval = async ({ estimate, user, req, isAdditionalWork, additionalRemarks, forceResend = false }) => {
  const oldStatus = estimate.status;

  // Canonical amount resolver
  const approvedFinalAmount = (req?.body?.finalAmount !== undefined && req?.body?.finalAmount !== null && Number(req.body.finalAmount) > 0)
    ? Number(req.body.finalAmount)
    : getCanonicalEstimateAmount(estimate);

  estimate.status = 'Approved';
  estimate.approvalMetadata = {
    approvedBy: user?._id,
    approvedByName: user?.name || user?.username || 'Authorized User',
    approvedAt: new Date(),
    finalAmount: approvedFinalAmount,
    previousStatus: oldStatus
  };

  // 1. Persist to MongoDB first
  await estimate.save();

  // 2. Sync to Job Card
  if (estimate.jobCardId) {
    await JobCard.findByIdAndUpdate(estimate.jobCardId, {
      status: 'Work In Progress',
      estAmt: approvedFinalAmount
    });
  }

  await logAction(user, 'ESTIMATE_APPROVE', `Approved Estimate ${estimate.estimateNo} for ₹${formatIndianCurrency(approvedFinalAmount)}. Previous status: ${oldStatus}`, req);
  console.log(`[Estimate] [Stage 3] Estimate approved successfully: ID=${estimate._id}, EstimateNo=${estimate.estimateNo}, FinalAmount=${approvedFinalAmount}`);

  // 3. Trigger WhatsApp STAGE 3: ESTIMATION APPROVED (Isolated)
  try {
    const Customer = require('../models/Customer');
    const VehicleModel = require('../models/Vehicle');
    const WhatsAppLog = require('../models/WhatsAppLog');
    const { sendTemplateMessage, validateCustomerContact } = require('../services/whatsappService');

    const jc = estimate.jobCardId ? await JobCard.findById(estimate.jobCardId) : null;
    const customerRecord = jc 
      ? (jc.customerId && jc.customerId.name ? jc.customerId : await Customer.findById(jc.customerId).lean())
      : null;
    const vehicle = jc 
      ? (jc.vehicleId && (jc.vehicleId.vehicleNumber || jc.vehicleId.regNo) ? jc.vehicleId : await VehicleModel.findById(jc.vehicleId).lean())
      : null;

    const rawPhone = customerRecord ? (customerRecord.mobile || customerRecord.phone || customerRecord.contactNumber) : null;
    const customerName = String(customerRecord?.name || 'Valued Customer').trim();
    let vehicleNumber = 'your vehicle';
    const rawVeh = vehicle?.vehicleNumber || vehicle?.regNo;
    if (rawVeh && typeof rawVeh === 'string' && !/mvss\s*automobiles/i.test(rawVeh)) {
      vehicleNumber = rawVeh.trim().toUpperCase();
    }
    const estimateNumber = String(estimate.estimateNo || 'N/A').trim();
    const jobCardNumber = String(jc?.jobCardNo || 'N/A').trim();
    const formattedAmount = formatIndianCurrency(approvedFinalAmount);

    const contactCheck = validateCustomerContact(customerRecord, rawPhone);

    const isAdditional = Boolean(
      isAdditionalWork ||
      estimate.isAdditionalWork ||
      estimate.estimateType === 'Additional'
    );

    let templateName = 'mvss_estimate_approved';
    let parameters = [];

    if (isAdditional) {
      templateName = 'mvss_additional_work';
      const additionalWorkDesc = String(additionalRemarks || estimate.remarks || 'Additional repairs and parts approved').trim();
      parameters = [
        { type: 'text', text: customerName },
        { type: 'text', text: vehicleNumber },
        { type: 'text', text: jobCardNumber },
        { type: 'text', text: additionalWorkDesc },
        { type: 'text', text: formattedAmount }
      ];
    } else {
      templateName = 'mvss_estimate_approved';
      parameters = [
        { type: 'text', text: customerName },
        { type: 'text', text: vehicleNumber },
        { type: 'text', text: estimateNumber },
        { type: 'text', text: jobCardNumber },
        { type: 'text', text: formattedAmount }
      ];
    }

    const revisionCount = estimate.revisionHistory?.length || 0;
    const correlationKey = forceResend
      ? `estimate_stage3_approved_${estimate._id}_rev${revisionCount}_${Date.now()}`
      : `estimate_stage3_approved_${estimate._id}_rev${revisionCount}`;

    console.log(`[Estimate Automation] [STAGE 3] Automation event triggered: Event="${templateName}", EstimateId=${estimate._id}, EstimateNo=${estimateNumber}, Rev=${revisionCount}`);

    if (contactCheck.valid) {
      // Check idempotency if not force resend
      if (!forceResend) {
        const alreadyApprovedLog = await WhatsAppLog.findOne({
          idempotencyKey: correlationKey,
          status: { $in: ['sent', 'delivered', 'read'] }
        }).lean();

        if (alreadyApprovedLog) {
          console.log(`[Estimate Automation] [STAGE 3] Already sent, skipping duplicate: key=${correlationKey}`);
          return estimate;
        }
      }

      console.log(`[Estimate Automation] [STAGE 3] WhatsApp send attempted: To=${contactCheck.masked}, Template=${templateName}, CorrelationKey=${correlationKey}`);

      try {
        const waResult = await sendTemplateMessage({
          to: contactCheck.phone,
          templateName,
          components: [
            {
              type: 'body',
              parameters
            }
          ],
          recipientName: customerName,
          relatedEntity: estimate._id,
          onModel: 'Estimate',
          idempotencyKey: correlationKey
        });

        console.log(`[Estimate Automation] [STAGE 3] Meta response accepted: Estimate=${estimateNumber}, wamid=${waResult.messageId || 'duplicate_skipped'}, Status=${waResult.status || 'accepted'}`);

        if (!estimate.whatsappHistory) estimate.whatsappHistory = [];
        estimate.whatsappHistory.push({
          stage: 'STAGE_3_ESTIMATION_APPROVED',
          estimateId: estimate._id,
          jobCardId: estimate.jobCardId,
          sentAt: new Date(),
          recipientPhone: contactCheck.phone,
          status: 'sent',
          messageId: waResult?.messageId || '',
          finalAmount: approvedFinalAmount,
          templateName,
          retryCount: 0,
          sentBy: user?._id,
          sentByName: user?.name || user?.username || 'Authorized User'
        });
        await estimate.save();
      } catch (waSendErr) {
        console.error(`[Estimate Automation] [STAGE 3] Meta response failed (isolated): Estimate=${estimateNumber}, Error=${waSendErr.message || waSendErr}`);

        if (!estimate.whatsappHistory) estimate.whatsappHistory = [];
        estimate.whatsappHistory.push({
          stage: 'STAGE_3_ESTIMATION_APPROVED',
          estimateId: estimate._id,
          jobCardId: estimate.jobCardId,
          sentAt: new Date(),
          recipientPhone: contactCheck.phone,
          status: 'failed',
          error: waSendErr.message || String(waSendErr),
          finalAmount: approvedFinalAmount,
          templateName,
          retryCount: 0,
          sentBy: user?._id,
          sentByName: user?.name || user?.username || 'Authorized User'
        });
        await estimate.save();
        // Preserves approval; does NOT revert
      }
    } else {
      console.warn(`[Estimate Automation] [STAGE 3] Skipping WhatsApp dispatch: ${contactCheck.reason}`);
    }
  } catch (waError) {
    console.error('[Estimate Automation] Unexpected error in WhatsApp estimate approved hook:', waError.message || waError);
  }

  return estimate;
};

// Update estimate
router.put('/:id', auth, restrictTo('Admin', 'Service', 'Accounts', 'Body Shop', 'Accounts Executive'), async (req, res) => {
  try {
    const { parts, labour, status, manualOverride, manualGrandTotal, overriddenGrandTotal, grandTotal } = req.body;
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).send({ error: 'Estimate not found.' });

    if (parts) {
      const Inventory = require('../models/Inventory');
      for (const part of parts) {
        if (part.partId) {
          const invItem = await Inventory.findById(part.partId);
          if (!invItem) return res.status(404).send({ error: `Inventory item not found for part: ${part.name}` });
          if (invItem.stockQuantity < Number(part.qty)) {
            return res.status(400).send({ error: `Insufficient stock for part: ${part.name} (${invItem.partNumber}). Available: ${invItem.stockQuantity}, Requested: ${part.qty}` });
          }
        }
      }
    }

    if (parts || labour || manualOverride !== undefined || manualGrandTotal !== undefined || overriddenGrandTotal !== undefined) {
      // Find Job Card and Customer to determine if interstate
      const jobCard = await JobCard.findById(estimate.jobCardId);
      let isInterstate = false;
      if (jobCard) {
        const customer = await Customer.findById(jobCard.customerId);
        isInterstate = checkIsInterstate(customer);
      }
      const calculations = recalculateEstimate(parts || estimate.parts, labour || estimate.labour, isInterstate);

      const isManual = manualOverride !== undefined ? Boolean(manualOverride) : estimate.manualOverride;
      const rawOverrideTotal = manualGrandTotal !== undefined ? manualGrandTotal : (overriddenGrandTotal !== undefined ? overriddenGrandTotal : grandTotal);
      const parsedOverride = (isManual && rawOverrideTotal !== undefined && rawOverrideTotal !== null && rawOverrideTotal !== '')
        ? Number(rawOverrideTotal)
        : (isManual && estimate.manualGrandTotal ? Number(estimate.manualGrandTotal) : null);

      if (parsedOverride !== null && !isNaN(parsedOverride) && parsedOverride >= 0) {
        calculations.totals.grandTotal = parsedOverride;
        calculations.amountInWords = numberToWords(parsedOverride);
        estimate.manualOverride = true;
        estimate.manualGrandTotal = parsedOverride;
      } else if (manualOverride === false) {
        estimate.manualOverride = false;
        estimate.manualGrandTotal = null;
      }

      const effectiveNewAmount = parsedOverride !== null ? parsedOverride : (calculations.totals?.grandTotal || 0);

      // Save a revision copy if modifying an estimate that left Draft stage (Sent, Approved, or Revised)
      if (estimate.status !== 'Draft') {
        const nextVersion = (estimate.revisionHistory?.length || 0) + 1;
        estimate.revisionHistory.push({
          version: nextVersion,
          date: new Date(),
          status: estimate.status,
          totals: estimate.totals,
          parts: estimate.parts,
          labour: estimate.labour,
          previousAmount: getCanonicalEstimateAmount(estimate),
          newAmount: effectiveNewAmount,
          user: req.user?._id,
          userName: req.user?.name || req.user?.username || 'Authorized User',
          reason: req.body.reason || req.body.revisionReason || 'Customer price revision / negotiation'
        });
        
        // Modifying amounts/items requires re-approval
        estimate.status = 'Revised';
      }

      estimate.parts = calculations.parts;
      estimate.labour = calculations.labour;
      estimate.totals = calculations.totals;
      estimate.amountInWords = calculations.amountInWords;

      // When modifying items on a Draft, status can change (e.g. to Sent if requested)
      if (status && estimate.status === 'Draft') {
        estimate.status = status;
      }

      await estimate.save();

      // Sync linked Job Card estAmt
      if (estimate.jobCardId) {
        await JobCard.findByIdAndUpdate(estimate.jobCardId, { estAmt: effectiveNewAmount });
      }

      await logAction(req.user, 'ESTIMATE_UPDATE', `Updated Estimate ${estimate.estimateNo}. Status: ${estimate.status}, Amount: ₹${effectiveNewAmount}`, req);
      console.log(`[Estimate] [Stage 2] Estimate updated successfully: ID=${estimate._id}, EstimateNo=${estimate.estimateNo}, Status=${estimate.status}, Amount=${effectiveNewAmount}`);

      return res.send(estimate);
    }

    // Status change without modifying parts/labour
    if (status === 'Approved') {
      if (estimate.status === 'Approved') {
        return res.send(estimate);
      }
      await executeEstimateApproval({
        estimate,
        user: req.user,
        req,
        isAdditionalWork: req.body.isAdditionalWork,
        additionalRemarks: req.body.additionalWorkRemarks || req.body.remarks
      });
      return res.send(estimate);
    }

    if ((status === 'Sent' || status === 'Waiting for Approval') && !['Sent', 'Waiting for Approval'].includes(estimate.status)) {
      const sendResult = await sendCustomerEstimateWhatsApp({
        estimateId: estimate._id,
        user: req.user,
        req
      });
      if (sendResult.error) {
        return res.status(sendResult.status || 400).send({ error: sendResult.error, estimate: sendResult.estimate || estimate });
      }
      return res.send(sendResult.data?.estimate || estimate);
    }

    if (status) {
      estimate.status = status;
      await estimate.save();
      await logAction(req.user, 'ESTIMATE_UPDATE', `Updated Estimate ${estimate.estimateNo} status to ${status}`, req);
      if (status === 'Rejected') {
        console.log(`[Estimate Automation] Estimate ${estimate.estimateNo} marked as Rejected. Rejection template is not registered in Meta WABA. Skipping outbound message cleanly.`);
      }
      return res.send(estimate);
    }

    await estimate.save();
    res.send(estimate);
  } catch (error) {
    res.status(400).send({ error: 'Failed to update estimate: ' + error.message });
  }
});

// Explicit Approve Revised / Sent Estimate Endpoint
router.put('/:id/approve', auth, restrictTo('Admin', 'Service', 'Accounts', 'Body Shop', 'Accounts Executive'), async (req, res) => {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).send({ error: 'Estimate not found.' });

    // Idempotent: If already approved and no pending revisions
    if (estimate.status === 'Approved') {
      return res.send(estimate);
    }

    await executeEstimateApproval({
      estimate,
      user: req.user,
      req,
      isAdditionalWork: req.body.isAdditionalWork,
      additionalRemarks: req.body.additionalWorkRemarks || req.body.remarks
    });

    res.send(estimate);
  } catch (error) {
    res.status(400).send({ error: 'Failed to approve estimate: ' + error.message });
  }
});

// Download Estimate PDF
router.get('/:id/pdf', auth, async (req, res) => {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).send({ error: 'Estimate not found.' });

    const jobCard = (estimate.jobCardId ? await JobCard.findById(estimate.jobCardId) : null) || {};
    const customer = (jobCard.customerId ? await Customer.findById(jobCard.customerId) : null) || { name: 'Walk-in Customer', mobile: 'N/A' };
    const vehicle = (jobCard.vehicleId ? await Vehicle.findById(jobCard.vehicleId) : null) || { vehicleNumber: 'N/A', make: 'N/A', model: 'N/A' };

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=estimate-${estimate.estimateNo}.pdf`);

    await logAction(req.user, 'REPORT_EXPORTED', `Exported PDF for Estimate ${estimate.estimateNo}`, req);

    generateEstimatePDF(estimate, customer, vehicle, res, jobCard);
  } catch (error) {
    res.status(500).send({ error: 'Failed to generate PDF: ' + error.message });
  }
});

// Download Customer Estimate PDF (No GST Details)
router.get('/:id/customer-pdf', auth, async (req, res) => {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).send({ error: 'Estimate not found.' });

    const jobCard = (estimate.jobCardId ? await JobCard.findById(estimate.jobCardId) : null) || {};
    const customer = (jobCard.customerId ? await Customer.findById(jobCard.customerId) : null) || { name: 'Walk-in Customer', mobile: 'N/A' };
    const vehicle = (jobCard.vehicleId ? await Vehicle.findById(jobCard.vehicleId) : null) || { vehicleNumber: 'N/A', make: 'N/A', model: 'N/A' };

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=customer-estimate-${estimate.estimateNo}.pdf`);

    await logAction(req.user, 'REPORT_EXPORTED', `Exported Customer PDF for Estimate ${estimate.estimateNo}`, req);

    generateCustomerEstimatePDF(estimate, customer, vehicle, res, jobCard);
  } catch (error) {
    res.status(500).send({ error: 'Failed to generate Customer PDF: ' + error.message });
  }
});

// Public Download / Stream Customer Estimate PDF (Unauthenticated for Meta Graph API & WhatsApp)
router.get('/public/customer-pdf/:id', async (req, res) => {
  try {
    const rawId = String(req.params.id || '').replace(/\.pdf$/i, '');
    let estimate = null;

    if (/^[a-f0-9]{24}$/i.test(rawId)) {
      estimate = await Estimate.findById(rawId);
    } else {
      const normalizedNo = rawId
        .replace(/^customer_estimate_/i, '')
        .replace(/^Customer_Estimate_/i, '');
      const estNoVariations = [
        rawId,
        normalizedNo,
        normalizedNo.replace(/_/g, '/'),
        normalizedNo.replace(/_/g, '-'),
        normalizedNo.replace(/-/g, '/')
      ];
      estimate = await Estimate.findOne({
        $or: estNoVariations.map(no => ({ estimateNo: new RegExp(`^${no.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }))
      });
    }

    if (!estimate) return res.status(404).send({ error: 'Estimate not found.' });

    const jobCard = (estimate.jobCardId ? await JobCard.findById(estimate.jobCardId) : null) || {};
    let customer = null;
    if (jobCard.customerId) {
      customer = typeof jobCard.customerId === 'object' && jobCard.customerId.name
        ? jobCard.customerId
        : await Customer.findById(jobCard.customerId).lean();
    }
    if (!customer) customer = { name: 'Valued Customer', mobile: 'N/A' };

    let vehicle = null;
    if (jobCard.vehicleId) {
      vehicle = typeof jobCard.vehicleId === 'object' && (jobCard.vehicleId.vehicleNumber || jobCard.vehicleId.regNo)
        ? jobCard.vehicleId
        : await Vehicle.findById(jobCard.vehicleId).lean();
    }
    if (!vehicle) vehicle = { vehicleNumber: 'your vehicle', make: '', model: '' };

    const cleanEstNo = String(estimate.estimateNo || 'EST').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Customer_Estimate_${cleanEstNo}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    generateCustomerEstimatePDF(estimate, customer, vehicle, res, jobCard);
  } catch (error) {
    console.error('[Public Customer PDF] Error streaming PDF:', error);
    res.status(500).send({ error: 'Failed to generate Customer PDF: ' + error.message });
  }
});

// Helper for sending Customer Estimate via WhatsApp (Stage 1 and Stage 2 sequential dispatch)
const sendCustomerEstimateWhatsApp = async ({ estimateId, user, req, skipStage1 = false, skipStage2 = false, forceResend = false }) => {
  const estimate = await Estimate.findById(estimateId);
  if (!estimate) {
    return { status: 404, error: 'Estimate not found.' };
  }

  const JobCardModel = require('../models/JobCard');
  const CustomerModel = require('../models/Customer');
  const VehicleModel = require('../models/Vehicle');
  const WhatsAppLog = require('../models/WhatsAppLog');
  const { validateCustomerContact, sendTemplateMessage, sendDocumentMessage, uploadMediaToMeta, isCustomerSessionActive, resolveTemplateSpec } = require('../services/whatsappService');
  const { generateCustomerEstimatePDF } = require('../utils/pdfGenerator');

  const jc = estimate.jobCardId ? await JobCardModel.findById(estimate.jobCardId) : null;
  if (!jc) {
    return { status: 400, error: 'Job Card linked to this estimate was not found.', estimate };
  }

  let customerRecord = null;
  if (jc.customerId) {
    if (typeof jc.customerId === 'object' && jc.customerId.name) {
      customerRecord = jc.customerId;
    } else {
      customerRecord = await CustomerModel.findById(jc.customerId).lean();
    }
  }
  if (!customerRecord) {
    return { status: 400, error: 'Customer record linked to this estimate was not found.', estimate };
  }

  let vehicleRecord = null;
  if (jc.vehicleId) {
    if (typeof jc.vehicleId === 'object' && (jc.vehicleId.vehicleNumber || jc.vehicleId.regNo)) {
      vehicleRecord = jc.vehicleId;
    } else {
      vehicleRecord = await VehicleModel.findById(jc.vehicleId).lean();
    }
  }
  if (!vehicleRecord) {
    vehicleRecord = await VehicleModel.findOne({ customerId: customerRecord._id }).sort({ updatedAt: -1 }).lean();
  }

  // 1. Retrieve & validate customer's registered WhatsApp number
  const rawPhone = customerRecord.mobile || customerRecord.phone || customerRecord.contactNumber;
  const contactCheck = validateCustomerContact(customerRecord, rawPhone);

  if (!contactCheck.valid) {
    return {
      status: 400,
      error: `Customer has no valid WhatsApp number: ${contactCheck.reason}`,
      estimate
    };
  }

  // 2. Canonical estimate amount resolution & formatting
  const finalEstimatedAmount = getCanonicalEstimateAmount(estimate);
  const formattedEstimatedAmount = formatIndianCurrency(finalEstimatedAmount);
  const revCount = estimate.revisionHistory?.length || 0;
  const isForceResend = Boolean(forceResend || req?.body?.force || req?.body?.resend);

  const stage1ReadyKey = isForceResend
    ? `estimate_stage1_ready_${estimate._id}_rev${revCount}_${Date.now()}`
    : `estimate_stage1_ready_${estimate._id}_rev${revCount}`;
  const stage1DocKey = isForceResend
    ? `estimate_stage1_doc_${estimate._id}_rev${revCount}_${Date.now()}`
    : `estimate_stage1_doc_${estimate._id}_rev${revCount}`;
  const stage2AwaitingKey = isForceResend
    ? `estimate_stage2_awaiting_${estimate._id}_rev${revCount}_${Date.now()}`
    : `estimate_stage2_awaiting_${estimate._id}_rev${revCount}`;

  // 3. In-flight concurrency lock (30s mutex)
  const inFlight = await WhatsAppLog.findOne({
    idempotencyKey: { $in: [stage1ReadyKey, stage1DocKey, stage2AwaitingKey] },
    status: 'pending',
    createdAt: { $gte: new Date(Date.now() - 30000) }
  }).lean();

  if (inFlight) {
    return {
      status: 409,
      error: 'A WhatsApp send request for this estimate is already in progress. Please wait a moment.',
      estimate
    };
  }

  // 4. Check if both Stage 1 and Stage 2 have ALREADY been sent successfully
  const stage1AlreadySent = await WhatsAppLog.findOne({
    idempotencyKey: stage1ReadyKey,
    status: { $in: ['sent', 'delivered', 'read'] }
  }).lean();

  const stage2AlreadySent = await WhatsAppLog.findOne({
    idempotencyKey: { $regex: `^estimate_stage2_awaiting_${estimate._id}_rev${revCount}` },
    status: { $in: ['sent', 'delivered', 'read'] }
  }).lean();

  if (!isForceResend && stage1AlreadySent && stage2AlreadySent) {
    if (['Draft', 'Sent'].includes(estimate.status)) {
      estimate.status = 'Waiting for Approval';
      await estimate.save();
    }
    if (estimate.jobCardId) {
      await JobCardModel.findByIdAndUpdate(estimate.jobCardId, {
        status: 'Waiting for Customer Approval',
        estAmt: finalEstimatedAmount
      });
    }
    return {
      status: 200,
      data: {
        success: true,
        alreadySent: true,
        message: 'Estimation Ready and Approval Request have already been sent to customer.',
        estimate,
        stage1MessageId: stage1AlreadySent.messageId,
        stage2MessageId: stage2AlreadySent.messageId
      }
    };
  }

  // 5. Generate Customer Estimate PDF buffer and persist to uploads/estimates/
  const fs = require('fs');
  const path = require('path');
  const { PassThrough } = require('stream');

  const pdfDir = path.join(__dirname, '../uploads/estimates');
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  const cleanEstNo = String(estimate.estimateNo || 'EST').replace(/[^a-zA-Z0-9_-]/g, '_');
  const pdfFilename = `Customer_Estimate_${cleanEstNo}.pdf`;
  const pdfDiskPath = path.join(pdfDir, `customer_estimate_${estimate._id}.pdf`);
  const namedPdfDiskPath = path.join(pdfDir, pdfFilename);

  let pdfBuffer;
  try {
    pdfBuffer = await new Promise((resolve, reject) => {
      const pass = new PassThrough();
      const chunks = [];
      pass.on('data', chunk => chunks.push(chunk));
      pass.on('end', () => resolve(Buffer.concat(chunks)));
      pass.on('error', err => reject(err));
      generateCustomerEstimatePDF(estimate, customerRecord, vehicleRecord || {}, pass, jc);
    });

    await fs.promises.writeFile(pdfDiskPath, pdfBuffer);
    await fs.promises.writeFile(namedPdfDiskPath, pdfBuffer);
  } catch (pdfErr) {
    console.error(`[WhatsApp Estimate PDF] Failed to generate Customer Estimate PDF:`, pdfErr);
    return {
      status: 500,
      error: 'Failed to generate Customer Estimate PDF: ' + pdfErr.message,
      estimate
    };
  }

  // Determine public PDF URL
  const host = typeof req?.get === 'function' ? req.get('host') : (req?.headers?.host || null);
  const forwardedProto = typeof req?.get === 'function' ? req.get('x-forwarded-proto') : req?.headers?.['x-forwarded-proto'];
  const protocol = req && (req.protocol === 'https' || forwardedProto === 'https') ? 'https' : 'http';
  const serverBase = process.env.PUBLIC_API_URL || process.env.API_BASE_URL || (host ? `${protocol}://${host}` : 'https://mvss-erp-backend.onrender.com');
  const pdfUrl = `${serverBase}/api/estimates/public/customer-pdf/${estimate._id}.pdf`;
  estimate.pdfUrl = pdfUrl;

  const customerName = String(customerRecord.name || 'Valued Customer').trim();
  let vehicleNumber = 'your vehicle';
  const rawVeh = vehicleRecord?.vehicleNumber || vehicleRecord?.regNo;
  if (rawVeh && typeof rawVeh === 'string' && !/mvss\s*automobiles/i.test(rawVeh)) {
    vehicleNumber = rawVeh.trim().toUpperCase();
  }
  const estimateNumber = String(estimate.estimateNo || 'N/A').trim();
  const jobCardNumber = String(jc?.jobCardNo || 'N/A').trim();

  if (!estimate.whatsappHistory) estimate.whatsappHistory = [];

  // ==========================================
  // STAGE 1: ESTIMATION READY
  // Triggered when admin clicks Send Estimate.
  // Template: mvss_estimate_created (5 params)
  // Attachment: Customer Estimate PDF (Never GST PDF)
  // ==========================================
  // Stage 1 success determination:
  // Only consider Stage 1 previously sent if WhatsAppLog confirms a successful delivery (sent, delivered, read) for this revision
  const stage1PriorSuccess = Boolean(stage1AlreadySent);

  let stage1Success = stage1PriorSuccess;
  let stage1Result = stage1AlreadySent ? { messageId: stage1AlreadySent.messageId } : null;
  let docResult = null;
  let stage1TemplateUsed = 'mvss_estimate_created';

  if (!skipStage1 && (isForceResend || !stage1PriorSuccess)) {
    console.log(`[Estimate Automation] [STAGE 1] Triggering Estimation Ready for Estimate ${estimateNumber}...`);

    // Check if mvss_customer_estimate_doc is approved in Meta
    const docTplSpec = resolveTemplateSpec('mvss_customer_estimate_doc');
    const isDocTemplateApproved = docTplSpec && (docTplSpec.status === 'APPROVED' || docTplSpec.status === 'CONFIG_FALLBACK');

    if (isDocTemplateApproved) {
      stage1TemplateUsed = 'mvss_customer_estimate_doc';
      console.log(`[Estimate Automation] [STAGE 1] Using approved DOCUMENT template '${stage1TemplateUsed}' with PDF header.`);

      // Pre-upload PDF media directly to Meta Graph API for maximum delivery reliability
      let metaDocPayload = {
        link: pdfUrl,
        filename: pdfFilename
      };

      try {
        const uploadRes = await uploadMediaToMeta({
          buffer: pdfBuffer,
          filename: pdfFilename,
          mimeType: 'application/pdf'
        });
        if (uploadRes?.success && uploadRes?.mediaId) {
          metaDocPayload = {
            id: uploadRes.mediaId,
            filename: pdfFilename
          };
          console.log(`[Estimate Automation] [STAGE 1] Using Meta pre-uploaded mediaId=${uploadRes.mediaId}`);
        }
      } catch (mediaUploadErr) {
        console.warn(`[Estimate Automation] [STAGE 1] Media pre-upload fallback to URL link:`, mediaUploadErr.message);
      }

      try {
        stage1Result = await sendTemplateMessage({
          to: contactCheck.phone,
          templateName: stage1TemplateUsed,
          components: [
            {
              type: 'header',
              parameters: [
                {
                  type: 'document',
                  document: metaDocPayload
                }
              ]
            },
            {
              type: 'body',
              parameters: [
                { type: 'text', text: customerName },
                { type: 'text', text: vehicleNumber },
                { type: 'text', text: estimateNumber },
                { type: 'text', text: jobCardNumber },
                { type: 'text', text: formattedEstimatedAmount }
              ]
            }
          ],
          recipientName: customerName,
          relatedEntity: estimate._id,
          onModel: 'Estimate',
          idempotencyKey: stage1ReadyKey
        });

        if (stage1Result?.success || stage1Result?.messageId) {
          stage1Success = true;
          console.log(`[Estimate Automation] [STAGE 1] ${stage1TemplateUsed} accepted with PDF attachment: wamid=${stage1Result.messageId}`);
        } else {
          throw new Error('Meta did not return a message ID for Stage 1');
        }
      } catch (docTplErr) {
        console.warn(`[Estimate Automation] [STAGE 1] DOCUMENT template dispatch failed:`, docTplErr.message || docTplErr);
        // Fall back to standard template
        stage1TemplateUsed = 'mvss_estimate_created';
      }
    }

    if (!stage1Success) {
      // Standard Stage 1 dispatch: mvss_estimate_created + document dispatch
      stage1TemplateUsed = 'mvss_estimate_created';
      console.log(`[Estimate Automation] [STAGE 1] Sending approved template '${stage1TemplateUsed}' (5 params)...`);

      // 1. Dispatch template message
      try {
        stage1Result = await sendTemplateMessage({
          to: contactCheck.phone,
          templateName: 'mvss_estimate_created',
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: customerName },
                { type: 'text', text: vehicleNumber },
                { type: 'text', text: estimateNumber },
                { type: 'text', text: jobCardNumber },
                { type: 'text', text: formattedEstimatedAmount }
              ]
            }
          ],
          recipientName: customerName,
          relatedEntity: estimate._id,
          onModel: 'Estimate',
          idempotencyKey: stage1ReadyKey
        });

        if (stage1Result?.success || stage1Result?.messageId) {
          stage1Success = true;
          console.log(`[Estimate Automation] [STAGE 1] mvss_estimate_created accepted: wamid=${stage1Result.messageId}`);
        } else {
          throw new Error('Meta did not return a message ID for Stage 1');
        }
      } catch (stage1Err) {
        stage1Success = false;
        const stage1ErrMsg = stage1Err.message || String(stage1Err);
        console.error(`[Estimate Automation] [STAGE 1] FAILED for Estimate ${estimateNumber}:`, stage1ErrMsg);

        estimate.whatsappHistory.push({
          stage: 'STAGE_1_ESTIMATION_READY',
          estimateId: estimate._id,
          jobCardId: estimate.jobCardId,
          sentAt: new Date(),
          recipientPhone: contactCheck.phone,
          pdfUrl,
          status: 'failed',
          error: stage1ErrMsg,
          finalAmount: finalEstimatedAmount,
          templateName: 'mvss_estimate_created',
          sentBy: user?._id,
          sentByName: user?.name || user?.username || 'Authorized User'
        });
        await estimate.save();

        // STRICT RULE: If Stage 1 fails, do NOT send Stage 2!
        return {
          status: 500,
          error: `Stage 1 (Estimation Ready) failed: ${stage1ErrMsg}. Stage 2 was not sent. Status remains ${estimate.status}.`,
          estimate
        };
      }

      // 2. Dispatch Customer Estimate PDF attachment (check session active status to prevent 131047 errors)
      const sessionActive = await isCustomerSessionActive(contactCheck.phone);
      if (sessionActive) {
        try {
          docResult = await sendDocumentMessage({
            to: contactCheck.phone,
            documentUrl: pdfUrl,
            pdfBuffer,
            filename: pdfFilename,
            caption: `Customer Estimate - ${estimateNumber}`,
            recipientName: customerName,
            relatedEntity: estimate._id,
            onModel: 'Estimate',
            idempotencyKey: stage1DocKey
          });
          console.log(`[Estimate Automation] [STAGE 1] Customer Estimate PDF attached: wamid=${docResult?.messageId}`);
        } catch (docErr) {
          console.warn(`[Estimate Automation] [STAGE 1] PDF document dispatch note:`, docErr.message || docErr);
        }
      } else {
        console.warn(`[Estimate Automation] [STAGE 1] Customer 24h conversation session is inactive. Deferring standalone document dispatch to prevent Meta 131047 error.`);
        estimate.whatsappHistory.push({
          stage: 'DOCUMENT_ESTIMATE_PDF',
          estimateId: estimate._id,
          jobCardId: estimate.jobCardId,
          sentAt: new Date(),
          recipientPhone: contactCheck.phone,
          pdfUrl,
          status: 'pending_session',
          templateName: 'document_attachment',
          error: 'Standalone document deferred. Waiting for customer response to open 24h conversation window.',
          sentBy: user?._id,
          sentByName: user?.name || user?.username || 'Authorized User'
        });
      }
    }

    // Save successful Stage 1 history
    if (stage1Success && stage1Result?.messageId) {
      estimate.whatsappHistory.push({
        stage: 'STAGE_1_ESTIMATION_READY',
        estimateId: estimate._id,
        jobCardId: estimate.jobCardId,
        sentAt: new Date(),
        recipientPhone: contactCheck.phone,
        pdfUrl,
        status: 'sent',
        messageId: stage1Result.messageId,
        finalAmount: finalEstimatedAmount,
        templateName: stage1TemplateUsed,
        sentBy: user?._id,
        sentByName: user?.name || user?.username || 'Authorized User'
      });

      if (stage1TemplateUsed === 'mvss_customer_estimate_doc') {
        estimate.whatsappHistory.push({
          stage: 'DOCUMENT_ESTIMATE_PDF',
          estimateId: estimate._id,
          jobCardId: estimate.jobCardId,
          sentAt: new Date(),
          recipientPhone: contactCheck.phone,
          pdfUrl,
          status: 'sent',
          messageId: stage1Result.messageId,
          templateName: 'mvss_customer_estimate_doc (Header Attachment)',
          sentBy: user?._id,
          sentByName: user?.name || user?.username || 'Authorized User'
        });
      } else if (docResult?.messageId) {
        estimate.whatsappHistory.push({
          stage: 'DOCUMENT_ESTIMATE_PDF',
          estimateId: estimate._id,
          jobCardId: estimate.jobCardId,
          sentAt: new Date(),
          recipientPhone: contactCheck.phone,
          pdfUrl,
          status: 'sent',
          messageId: docResult.messageId,
          templateName: 'document_attachment',
          sentBy: user?._id,
          sentByName: user?.name || user?.username || 'Authorized User'
        });
      }
      await estimate.save();
    }
  }

  // ==========================================
  // STAGE 2: ESTIMATION AWAITING APPROVAL
  // Triggered ONLY AFTER Stage 1 is successfully delivered/accepted
  // Template: estimate_awaiting_customer_approval OR mvss_estimate_awaiting_customer_approval (4 params)
  // ==========================================
  if (!stage1Success) {
    return {
      status: 500,
      error: 'Stage 1 has not been accepted by WhatsApp provider. Stage 2 cannot be triggered.',
      estimate
    };
  }

  let stage2Success = !isForceResend && Boolean(stage2AlreadySent);
  let stage2Result = stage2AlreadySent ? { messageId: stage2AlreadySent.messageId } : null;
  let stage2TemplateUsed = stage2AlreadySent?.templateName || null;
  let stage2Error = null;

  if (!skipStage2 && (isForceResend || !stage2AlreadySent)) {
    console.log(`[Estimate Automation] [STAGE 2] Triggering Estimation Awaiting Approval for Estimate ${estimateNumber}...`);

    const stage2Candidates = [
      {
        name: 'estimate_awaiting_customer_approval',
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: customerName },
              { type: 'text', text: vehicleNumber },
              { type: 'text', text: estimateNumber },
              { type: 'text', text: formattedEstimatedAmount }
            ]
          }
        ]
      },
      {
        name: 'mvss_estimate_awaiting_customer_approval',
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: customerName },
              { type: 'text', text: vehicleNumber },
              { type: 'text', text: estimateNumber },
              { type: 'text', text: formattedEstimatedAmount }
            ]
          }
        ]
      }
    ];

    for (const candidate of stage2Candidates) {
      try {
        const candidateKey = `${stage2AwaitingKey}_${candidate.name}`;
        stage2Result = await sendTemplateMessage({
          to: contactCheck.phone,
          templateName: candidate.name,
          components: candidate.components,
          recipientName: customerName,
          relatedEntity: estimate._id,
          onModel: 'Estimate',
          idempotencyKey: candidateKey
        });

        if (stage2Result?.success || stage2Result?.messageId) {
          stage2Success = true;
          stage2TemplateUsed = candidate.name;
          console.log(`[Estimate Automation] [STAGE 2] '${candidate.name}' accepted: wamid=${stage2Result.messageId}`);
          break;
        }
      } catch (candErr) {
        stage2Error = candErr;
        console.warn(`[Estimate Automation] [STAGE 2] Candidate '${candidate.name}' note:`, candErr.message || candErr);
      }
    }

    if (stage2Success) {
      estimate.status = 'Waiting for Approval';
      estimate.whatsappHistory.push({
        stage: 'STAGE_2_ESTIMATION_AWAITING_APPROVAL',
        estimateId: estimate._id,
        jobCardId: estimate.jobCardId,
        sentAt: new Date(),
        recipientPhone: contactCheck.phone,
        status: 'sent',
        messageId: stage2Result.messageId,
        finalAmount: finalEstimatedAmount,
        templateName: stage2TemplateUsed,
        sentBy: user?._id,
        sentByName: user?.name || user?.username || 'Authorized User'
      });
      await estimate.save();

      // Sync linked Job Card to 'Waiting for Customer Approval'
      if (estimate.jobCardId) {
        await JobCardModel.findByIdAndUpdate(estimate.jobCardId, {
          status: 'Waiting for Customer Approval',
          estAmt: finalEstimatedAmount
        });
      }

      await logAction(user, 'ESTIMATE_WHATSAPP_SENT', `Sent Customer Estimate (Stage 1 & 2) for ${estimate.estimateNo} to ${contactCheck.masked}. Status: Waiting for Approval`, req);

      return {
        status: 200,
        data: {
          success: true,
          message: `Customer Estimate ready notification and approval request sent via WhatsApp.`,
          estimate,
          stage1MessageId: stage1Result?.messageId,
          stage2MessageId: stage2Result?.messageId
        }
      };
    } else {
      // Stage 2 failed, but Stage 1 succeeded
      const stage2ErrMsg = stage2Error?.message || 'Meta template delivery failed for Stage 2';
      console.error(`[Estimate Automation] [STAGE 2] Failed for Estimate ${estimateNumber}:`, stage2ErrMsg);

      estimate.status = 'Sent'; // Stage 1 went through
      estimate.whatsappHistory.push({
        stage: 'STAGE_2_ESTIMATION_AWAITING_APPROVAL',
        estimateId: estimate._id,
        jobCardId: estimate.jobCardId,
        sentAt: new Date(),
        recipientPhone: contactCheck.phone,
        status: 'failed',
        error: stage2ErrMsg,
        finalAmount: finalEstimatedAmount,
        templateName: 'estimate_awaiting_customer_approval',
        sentBy: user?._id,
        sentByName: user?.name || user?.username || 'Authorized User'
      });
      await estimate.save();

      return {
        status: 207,
        warning: 'Stage 1 (Estimation Ready) was delivered, but Stage 2 (Awaiting Approval) failed. You can retry Stage 2 directly.',
        error: stage2ErrMsg,
        stage1Success: true,
        stage2Success: false,
        estimate
      };
    }
  }

  return {
    status: 200,
    data: {
      success: true,
      message: 'Estimate WhatsApp messages processed.',
      estimate
    }
  };
};

// Send Customer Estimate via WhatsApp (Triggers Stage 1 and Stage 2 sequentially)
router.post('/:id/send', auth, restrictTo('Admin', 'Service', 'Accounts', 'Body Shop', 'Accounts Executive', 'Spares'), async (req, res) => {
  try {
    const result = await sendCustomerEstimateWhatsApp({
      estimateId: req.params.id,
      user: req.user,
      req
    });
    if (result.error && result.status !== 207) {
      return res.status(result.status || 400).send({ error: result.error, estimate: result.estimate });
    }
    return res.status(result.status || 200).send(result.data || result);
  } catch (err) {
    return res.status(500).send({ error: 'Failed to send estimate via WhatsApp: ' + err.message });
  }
});

// Alias for explicit whatsapp send route
router.post('/:id/send-whatsapp', auth, restrictTo('Admin', 'Service', 'Accounts', 'Body Shop', 'Accounts Executive', 'Spares'), async (req, res) => {
  try {
    const result = await sendCustomerEstimateWhatsApp({
      estimateId: req.params.id,
      user: req.user,
      req
    });
    if (result.error && result.status !== 207) {
      return res.status(result.status || 400).send({ error: result.error, estimate: result.estimate });
    }
    return res.status(result.status || 200).send(result.data || result);
  } catch (err) {
    return res.status(500).send({ error: 'Failed to send estimate via WhatsApp: ' + err.message });
  }
});

// Retry Stage 2 (Awaiting Approval Request) without re-sending Stage 1
router.post('/:id/retry-approval-notification', auth, restrictTo('Admin', 'Service', 'Accounts', 'Body Shop', 'Accounts Executive', 'Spares'), async (req, res) => {
  try {
    const result = await sendCustomerEstimateWhatsApp({
      estimateId: req.params.id,
      user: req.user,
      req,
      skipStage1: true, // Only retry Stage 2
      forceResend: true
    });
    if (result.error && result.status !== 207) {
      return res.status(result.status || 400).send({ error: result.error, estimate: result.estimate });
    }
    return res.status(result.status || 200).send(result.data || result);
  } catch (err) {
    return res.status(500).send({ error: 'Failed to retry Stage 2 WhatsApp notification: ' + err.message });
  }
});

// Retry Stage 3 (Estimation Approved Notification) without altering approval state
router.post('/:id/retry-approved-notification', auth, restrictTo('Admin', 'Service', 'Accounts', 'Body Shop', 'Accounts Executive', 'Spares'), async (req, res) => {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).send({ error: 'Estimate not found.' });

    if (estimate.status !== 'Approved') {
      return res.status(400).send({ error: 'Estimate is not in Approved status. Stage 3 can only be sent for Approved estimates.' });
    }

    await executeEstimateApproval({
      estimate,
      user: req.user,
      req,
      isAdditionalWork: req.body?.isAdditionalWork,
      additionalRemarks: req.body?.additionalWorkRemarks || req.body?.remarks,
      forceResend: true
    });

    res.send({ success: true, message: 'Stage 3 Approved notification re-dispatched successfully.', estimate });
  } catch (err) {
    return res.status(500).send({ error: 'Failed to retry Stage 3 WhatsApp notification: ' + err.message });
  }
});

// Issue parts to Job Card (Reduce inventory quantity automatically)
router.post('/:id/parts/issue', auth, restrictTo('Admin', 'Spares', 'Service', 'Accounts', 'Body Shop', 'Accounts Executive'), async (req, res) => {
  try {
    const { partId, qtyToIssue } = req.body;
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).send({ error: 'Estimate not found.' });

    const partItem = estimate.parts.find(p => p.partId.toString() === partId);
    if (!partItem) return res.status(404).send({ error: 'Part not found in estimate.' });

    const qty = Number(qtyToIssue) || 0;
    if (qty <= 0) return res.status(400).send({ error: 'Quantity must be greater than zero.' });

    // Validate against parts required (cannot issue more than required quantity - already issued + returned)
    const netRequired = partItem.qty - (partItem.qtyIssued - partItem.qtyReturned);
    if (qty > netRequired) {
      return res.status(400).send({ error: `Cannot issue more than required quantity. Net required: ${netRequired}` });
    }

    const Inventory = require('../models/Inventory');
    const invItem = await Inventory.findById(partId);
    if (!invItem) return res.status(404).send({ error: 'Inventory item not found.' });

    if (invItem.stockQuantity < qty) {
      return res.status(400).send({ error: `Insufficient stock. Available: ${invItem.stockQuantity}, Requested: ${qty}` });
    }

    // Deduct stock
    invItem.stockQuantity -= qty;
    await invItem.save();

    // Increment issued count
    partItem.qtyIssued += qty;
    await estimate.save();

    await logAction(req.user, 'INVENTORY_REDUCE', `Auto-deducted ${qty} units of ${invItem.partName} (${invItem.partNumber}) issued to Estimate ${estimate.estimateNo}`, req);
    res.send(estimate);
  } catch (error) {
    res.status(400).send({ error: 'Failed to issue part: ' + error.message });
  }
});

// Return parts from Job Card (Increment inventory quantity automatically)
router.post('/:id/parts/return', auth, restrictTo('Admin', 'Spares', 'Service', 'Body Shop', 'Accounts Executive'), async (req, res) => {
  try {
    const { partId, qtyToReturn } = req.body;
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).send({ error: 'Estimate not found.' });

    const partItem = estimate.parts.find(p => p.partId.toString() === partId);
    if (!partItem) return res.status(404).send({ error: 'Part not found in estimate.' });

    const qty = Number(qtyToReturn) || 0;
    if (qty <= 0) return res.status(400).send({ error: 'Quantity must be greater than zero.' });

    // Cannot return more than currently issued
    const netIssued = partItem.qtyIssued - partItem.qtyReturned;
    if (qty > netIssued) {
      return res.status(400).send({ error: `Cannot return more than issued quantity. Net issued: ${netIssued}` });
    }

    const Inventory = require('../models/Inventory');
    const invItem = await Inventory.findById(partId);
    if (!invItem) return res.status(404).send({ error: 'Inventory item not found.' });

    // Restock
    invItem.stockQuantity += qty;
    await invItem.save();

    // Increment returned count
    partItem.qtyReturned += qty;
    await estimate.save();

    await logAction(req.user, 'INVENTORY_RESTOCK', `Auto-returned ${qty} units of ${invItem.partName} (${invItem.partNumber}) from Estimate ${estimate.estimateNo}`, req);
    res.send(estimate);
  } catch (error) {
    res.status(400).send({ error: 'Failed to return part: ' + error.message });
  }
});

// DELETE: Delete an Estimate permanently (Admin only)
router.delete('/:id', auth, restrictTo('Admin', 'Accounts', 'Accounts Executive'), async (req, res) => {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).send({ error: 'Estimate not found.' });

    await Estimate.findByIdAndDelete(req.params.id);

    // Create deletion notification entry
    try {
      const mongoose = require('mongoose');
      const Customer = require('../models/Customer');
      const Notification = require('../models/Notification');
      const JobCard = require('../models/JobCard');
      const jobCard = await JobCard.findById(estimate.jobCardId);
      const customer = jobCard ? await Customer.findById(jobCard.customerId) : null;

      const notification = new Notification({
        type: 'estimate',
        title: 'Estimate Deleted',
        message: `Estimate ${estimate.estimateNo} has been deleted.`,
        vehicleNumber: jobCard && jobCard.vehicleId ? (await mongoose.model('Vehicle').findById(jobCard.vehicleId))?.vehicleNumber : undefined,
        customerName: customer ? customer.name : undefined
      });
      await notification.save();
    } catch (notifErr) {
      console.error('Failed to create estimate deletion notification:', notifErr);
    }

    await logAction(req.user, 'ESTIMATE_DELETE', `Deleted Estimate ${estimate.estimateNo}`, req);
    res.send({ message: 'Estimate deleted successfully.' });
  } catch (error) {
    res.status(500).send({ error: 'Failed to delete estimate: ' + error.message });
  }
});

module.exports = router;
