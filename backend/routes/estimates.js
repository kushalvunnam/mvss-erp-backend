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
      .select('estimateNo jobCardId totals status date validUntil amountInWords createdAt pdfUrl whatsappHistory revisionHistory approvalMetadata')
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
    const { jobCardId, parts, labour } = req.body;
    
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

    const estimate = new Estimate({
      estimateNo,
      jobCardId,
      parts: calculations.parts,
      labour: calculations.labour,
      totals: calculations.totals,
      amountInWords: calculations.amountInWords,
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
const executeEstimateApproval = async ({ estimate, user, req, isAdditionalWork, additionalRemarks }) => {
  const oldStatus = estimate.status;
  estimate.status = 'Approved';
  estimate.approvalMetadata = {
    approvedBy: user?._id,
    approvedByName: user?.name || user?.username || 'Authorized User',
    approvedAt: new Date(),
    finalAmount: estimate.totals?.grandTotal || 0,
    previousStatus: oldStatus
  };

  // 1. Persist to MongoDB first
  await estimate.save();

  // 2. Sync to Job Card
  if (estimate.jobCardId) {
    await JobCard.findByIdAndUpdate(estimate.jobCardId, {
      status: 'Work In Progress',
      estAmt: estimate.totals?.grandTotal || 0
    });
  }

  await logAction(user, 'ESTIMATE_APPROVE', `Approved Estimate ${estimate.estimateNo} for ₹${estimate.totals?.grandTotal}. Previous status: ${oldStatus}`, req);
  console.log(`[Estimate] [Stage 2] Estimate approved successfully: ID=${estimate._id}, EstimateNo=${estimate.estimateNo}, FinalAmount=${estimate.totals?.grandTotal}`);

  // 3. Trigger WhatsApp notification (Isolated)
  try {
    const Customer = require('../models/Customer');
    const VehicleModel = require('../models/Vehicle');
    const { sendTemplateMessage, validateCustomerContact } = require('../services/whatsappService');

    const jc = estimate.jobCardId ? await JobCard.findById(estimate.jobCardId).lean() : null;
    const customerRecord = jc 
      ? (jc.customerId && jc.customerId.name ? jc.customerId : await Customer.findById(jc.customerId).lean())
      : null;
    const vehicle = jc 
      ? (jc.vehicleId && (jc.vehicleId.vehicleNumber || jc.vehicleId.regNo) ? jc.vehicleId : await VehicleModel.findById(jc.vehicleId).lean())
      : null;

    const rawPhone = customerRecord ? (customerRecord.mobile || customerRecord.phone || customerRecord.contactNumber) : null;
    const customerName = String(customerRecord?.name || 'Valued Customer').trim();
    const vehicleNumber = String(vehicle?.vehicleNumber || vehicle?.regNo || 'your vehicle').trim();
    const estimateNumber = String(estimate.estimateNo || 'N/A').trim();
    const jobCardNumber = String(jc?.jobCardNo || 'N/A').trim();
    const totalAmount = String(estimate.totals?.roundedGrandTotal || estimate.totals?.grandTotal || '0').trim();

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
        { type: 'text', text: totalAmount }
      ];
    } else {
      templateName = 'mvss_estimate_approved';
      parameters = [
        { type: 'text', text: customerName },
        { type: 'text', text: vehicleNumber },
        { type: 'text', text: estimateNumber },
        { type: 'text', text: jobCardNumber },
        { type: 'text', text: totalAmount }
      ];
    }

    const revisionCount = estimate.revisionHistory?.length || 0;
    const correlationKey = `${templateName}_${estimate._id}_rev${revisionCount}`;

    // [Stage 3] Automation event triggered
    console.log(`[Estimate Automation] [Stage 3] Automation event triggered: Event="${templateName}", EstimateId=${estimate._id}, EstimateNo=${estimateNumber}, Rev=${revisionCount}`);

    // [Stage 4] Customer contact/template validation result
    console.log(`[Estimate Automation] [Stage 4] Contact/template validation result: Customer="${customerName}", Phone="${contactCheck.masked}", Valid=${contactCheck.valid}, Template="${templateName}"${!contactCheck.valid ? `, Reason="${contactCheck.reason}"` : ''}`);

    if (contactCheck.valid) {
      // [Stage 5] WhatsApp send attempted
      console.log(`[Estimate Automation] [Stage 5] WhatsApp send attempted: To=${contactCheck.masked}, Template=${templateName}, CorrelationKey=${correlationKey}`);

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

        // [Stage 6] Meta response accepted
        console.log(`[Estimate Automation] [Stage 6] Meta response accepted: Estimate=${estimateNumber}, wamid=${waResult.messageId || 'duplicate_skipped'}, Status=${waResult.status || 'accepted'}`);
      } catch (waSendErr) {
        // [Stage 6] Meta response failed (isolated)
        console.error(`[Estimate Automation] [Stage 6] Meta response failed: Estimate=${estimateNumber}, Error=${waSendErr.message || waSendErr}`);
      }
    } else {
      console.warn(`[Estimate Automation] [Stage 4] Skipping WhatsApp dispatch: ${contactCheck.reason}`);
    }
  } catch (waError) {
    console.error('[Estimate Automation] Unexpected error in WhatsApp estimate approved hook:', waError.message || waError);
  }

  return estimate;
};

// Update estimate
router.put('/:id', auth, restrictTo('Admin', 'Service', 'Accounts', 'Body Shop', 'Accounts Executive'), async (req, res) => {
  try {
    const { parts, labour, status } = req.body;
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

    if (parts || labour) {
      // Find Job Card and Customer to determine if interstate
      const jobCard = await JobCard.findById(estimate.jobCardId);
      let isInterstate = false;
      if (jobCard) {
        const customer = await Customer.findById(jobCard.customerId);
        isInterstate = checkIsInterstate(customer);
      }
      const calculations = recalculateEstimate(parts || estimate.parts, labour || estimate.labour, isInterstate);

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
          previousAmount: estimate.totals?.grandTotal || 0,
          newAmount: calculations.totals?.grandTotal || 0,
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
      await logAction(req.user, 'ESTIMATE_UPDATE', `Updated Estimate ${estimate.estimateNo}. Status: ${estimate.status}`, req);
      console.log(`[Estimate] [Stage 2] Estimate updated successfully: ID=${estimate._id}, EstimateNo=${estimate.estimateNo}, Status=${estimate.status}`);

      // WhatsApp Integration: If estimate was revised, notify customer of the revised quote
      if (estimate.status === 'Revised') {
        try {
          const CustomerModel = require('../models/Customer');
          const VehicleModel = require('../models/Vehicle');
          const { sendTemplateMessage, validateCustomerContact } = require('../services/whatsappService');

          const jc = estimate.jobCardId ? await JobCard.findById(estimate.jobCardId).lean() : null;
          const customerRecord = jc 
            ? (jc.customerId && jc.customerId.name ? jc.customerId : await CustomerModel.findById(jc.customerId).lean())
            : null;
          const vehicle = jc 
            ? (jc.vehicleId && (jc.vehicleId.vehicleNumber || jc.vehicleId.regNo) ? jc.vehicleId : await VehicleModel.findById(jc.vehicleId).lean())
            : null;

          const rawPhone = customerRecord ? (customerRecord.mobile || customerRecord.phone || customerRecord.contactNumber) : null;
          const customerName = String(customerRecord?.name || 'Valued Customer').trim();
          const vehicleNumber = String(vehicle?.vehicleNumber || vehicle?.regNo || 'your vehicle').trim();
          const estimateNumber = String(estimate.estimateNo || 'N/A').trim();
          const jobCardNumber = String(jc?.jobCardNo || 'N/A').trim();
          const totalAmount = String(calculations.totals.roundedGrandTotal || calculations.totals.grandTotal || '0').trim();

          const contactCheck = validateCustomerContact(customerRecord, rawPhone);
          const templateName = 'mvss_estimate_created';
          const revCount = estimate.revisionHistory?.length || 0;
          const correlationKey = `estimate_revised_${estimate._id}_rev${revCount}`;

          if (contactCheck.valid) {
            try {
              await sendTemplateMessage({
                to: contactCheck.phone,
                templateName,
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
                idempotencyKey: correlationKey
              });
              console.log(`[Estimate Automation] Revised estimate quote dispatched to customer: Estimate=${estimateNumber}, Rev=${revCount}, Amount=${totalAmount}`);
            } catch (waSendErr) {
              console.error(`[Estimate Automation] Revised estimate WhatsApp failed (isolated): ${waSendErr.message || waSendErr}`);
            }
          }
        } catch (waError) {
          console.error('[Estimate Automation] Unexpected error in revised estimate WhatsApp hook:', waError.message || waError);
        }
      }

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

    generateCustomerEstimatePDF(estimate, customer, vehicle, res);
  } catch (error) {
    res.status(500).send({ error: 'Failed to generate Customer PDF: ' + error.message });
  }
});

// Helper for sending Customer Estimate PDF via WhatsApp
const sendCustomerEstimateWhatsApp = async ({ estimateId, user, req }) => {
  const estimate = await Estimate.findById(estimateId);
  if (!estimate) {
    return { status: 404, error: 'Estimate not found.' };
  }

  const JobCardModel = require('../models/JobCard');
  const CustomerModel = require('../models/Customer');
  const VehicleModel = require('../models/Vehicle');
  const WhatsAppLog = require('../models/WhatsAppLog');
  const { validateCustomerContact, sendDocumentMessage } = require('../services/whatsappService');
  const { generateCustomerEstimatePDF } = require('../utils/pdfGenerator');

  const jc = estimate.jobCardId ? await JobCardModel.findById(estimate.jobCardId).lean() : null;
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

  // 2. Prevent duplicate messages when Send is clicked multiple times (Idempotency)
  const revCount = estimate.revisionHistory?.length || 0;
  const rawGrandTotal = estimate.totals?.grandTotal || 0;
  const idempotencyKey = `estimate_customer_pdf_${estimate._id}_rev${revCount}_${Math.round(rawGrandTotal)}`;

  // Check if message was already sent and accepted
  const alreadySentLog = await WhatsAppLog.findOne({
    idempotencyKey,
    status: { $in: ['sent', 'delivered', 'read'] }
  }).lean();

  if (alreadySentLog) {
    if (['Draft', 'Sent'].includes(estimate.status)) {
      estimate.status = 'Waiting for Approval';
      await estimate.save();
    }
    if (estimate.jobCardId) {
      await JobCardModel.findByIdAndUpdate(estimate.jobCardId, {
        status: 'Waiting for Customer Approval'
      });
    }
    return {
      status: 200,
      data: {
        success: true,
        message: 'Customer Estimate PDF and Waiting for Approval request have already been sent to customer via WhatsApp.',
        alreadySent: true,
        estimate,
        pdfUrl: alreadySentLog.pdfUrl,
        messageId: alreadySentLog.messageId
      }
    };
  }

  // In-flight concurrency guard (within last 30s)
  const inFlight = await WhatsAppLog.findOne({
    idempotencyKey,
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

  // 3. Generate Customer Estimate PDF buffer and persist to uploads/estimates/
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

  let pdfBuffer;
  try {
    pdfBuffer = await new Promise((resolve, reject) => {
      const pass = new PassThrough();
      const chunks = [];
      pass.on('data', chunk => chunks.push(chunk));
      pass.on('end', () => resolve(Buffer.concat(chunks)));
      pass.on('error', err => reject(err));
      generateCustomerEstimatePDF(estimate, customerRecord, vehicleRecord || {}, pass);
    });

    await fs.promises.writeFile(pdfDiskPath, pdfBuffer);
  } catch (pdfErr) {
    console.error(`[WhatsApp Estimate PDF] Failed to generate Customer Estimate PDF:`, pdfErr);
    return {
      status: 500,
      error: 'Failed to generate Customer Estimate PDF: ' + pdfErr.message,
      estimate
    };
  }

  // Determine public PDF URL
  const host = req ? req.get('host') : null;
  const protocol = req && (req.protocol === 'https' || req.get('x-forwarded-proto') === 'https') ? 'https' : 'http';
  const serverBase = process.env.PUBLIC_API_URL || process.env.API_BASE_URL || (host ? `${protocol}://${host}` : '');
  const pdfUrl = `${serverBase}/uploads/estimates/customer_estimate_${estimate._id}.pdf`;

  // 4. Construct Exact Sample Message
  const customerName = String(customerRecord.name || 'Valued Customer').trim();
  let vehicleNumber = 'your vehicle';
  const rawVeh = vehicleRecord?.vehicleNumber || vehicleRecord?.regNo;
  if (rawVeh && typeof rawVeh === 'string' && !/mvss\s*automobiles/i.test(rawVeh)) {
    vehicleNumber = rawVeh.trim().toUpperCase();
  }
  const estimateNumber = String(estimate.estimateNo || 'N/A').trim();
  const formattedGrandTotal = Math.round(rawGrandTotal).toLocaleString('en-IN');

  const caption = 
`Dear ${customerName},

Greetings from MVSS Automobiles!

Your vehicle service estimate ${estimateNumber} is ready.

Vehicle: ${vehicleNumber}
Estimated Amount: ₹${formattedGrandTotal}

Please find your detailed estimate attached.

Kindly review and share your approval:
👉 Reply APPROVE to approve
👉 Reply REJECT to request changes

Thank you for choosing MVSS Automobiles!`;

  // 5. Send WhatsApp Document Message (AUTOMATION 1)
  try {
    const waResult = await sendDocumentMessage({
      to: contactCheck.phone,
      documentUrl: pdfUrl,
      pdfBuffer,
      filename: pdfFilename,
      caption,
      recipientName: customerName,
      relatedEntity: estimate._id,
      onModel: 'Estimate',
      idempotencyKey
    });

    // 5b. Send WhatsApp Approval Request Template (AUTOMATION 2)
    let approvalMsgId = null;
    const approvalCorrelationKey = `estimate_awaiting_approval_${estimate._id}_rev${revCount}`;
    try {
      const { sendTemplateMessage } = require('../services/whatsappService');
      const waApprovalResult = await sendTemplateMessage({
        to: contactCheck.phone,
        templateName: 'estimate_awaiting_customer_approval',
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: customerName },
              { type: 'text', text: vehicleNumber },
              { type: 'text', text: estimateNumber },
              { type: 'text', text: formattedGrandTotal }
            ]
          }
        ],
        recipientName: customerName,
        relatedEntity: estimate._id,
        onModel: 'Estimate',
        idempotencyKey: approvalCorrelationKey
      });
      approvalMsgId = waApprovalResult?.messageId;
      console.log(`[WhatsApp Estimate Approval] Approval request message dispatched: wamid=${approvalMsgId}`);
    } catch (tplErr) {
      console.warn(`[WhatsApp Estimate Approval] Note: Template approval message dispatch:`, tplErr.message || tplErr);
    }

    // 6. WhatsApp API accepted: Update estimate status to Waiting for Approval, sync JobCard, and persist audit history
    estimate.status = 'Waiting for Approval';
    estimate.pdfUrl = pdfUrl;
    if (!estimate.whatsappHistory) estimate.whatsappHistory = [];
    // Record Customer Estimate PDF document dispatch
    estimate.whatsappHistory.push({
      sentAt: new Date(),
      recipientPhone: contactCheck.phone,
      pdfUrl,
      status: 'sent',
      messageId: waResult.messageId,
      templateName: 'document_customer_estimate_pdf',
      sentBy: user?._id,
      sentByName: user?.name || user?.username || 'Authorized User'
    });

    // Record approval template dispatch
    if (approvalMsgId) {
      estimate.whatsappHistory.push({
        sentAt: new Date(),
        recipientPhone: contactCheck.phone,
        pdfUrl,
        status: 'sent',
        messageId: approvalMsgId,
        templateName: 'estimate_awaiting_customer_approval',
        sentBy: user?._id,
        sentByName: user?.name || user?.username || 'Authorized User'
      });
    }
    await estimate.save();

    // Sync linked Job Card to 'Waiting for Customer Approval'
    if (estimate.jobCardId) {
      await JobCardModel.findByIdAndUpdate(estimate.jobCardId, {
        status: 'Waiting for Customer Approval',
        estAmt: rawGrandTotal
      });
    }

    await logAction(user, 'ESTIMATE_WHATSAPP_SENT', `Sent Customer Estimate PDF & Approval Request ${estimate.estimateNo} to WhatsApp ${contactCheck.masked}. Status: Waiting for Approval`, req);

    console.log(`[WhatsApp Estimate PDF] Estimate ${estimate.estimateNo} successfully sent to ${contactCheck.masked} (wamid: ${waResult.messageId || approvalMsgId}). Status updated to Waiting for Approval.`);

    return {
      status: 200,
      data: {
        success: true,
        message: 'Customer Estimate PDF and Waiting for Approval request sent to WhatsApp successfully.',
        estimate,
        pdfUrl,
        messageId: waResult.messageId || approvalMsgId
      }
    };

  } catch (waError) {
    // 7. WhatsApp sending failed: RETAIN Draft status (do NOT mark as Sent) and log failure
    console.error(`[WhatsApp Estimate PDF] WhatsApp dispatch failed for estimate ${estimate.estimateNo}:`, waError.message);

    if (!estimate.whatsappHistory) estimate.whatsappHistory = [];
    estimate.whatsappHistory.push({
      sentAt: new Date(),
      recipientPhone: contactCheck.phone,
      pdfUrl,
      status: 'failed',
      error: waError.message,
      sentBy: user?._id,
      sentByName: user?.name || user?.username || 'Authorized User'
    });
    await estimate.save();

    return {
      status: 500,
      error: `WhatsApp sending failed: ${waError.message}`,
      estimate
    };
  }
};

// Send Customer Estimate PDF via WhatsApp
router.post('/:id/send', auth, restrictTo('Admin', 'Service', 'Accounts', 'Body Shop', 'Accounts Executive', 'Spares'), async (req, res) => {
  try {
    const result = await sendCustomerEstimateWhatsApp({
      estimateId: req.params.id,
      user: req.user,
      req
    });
    if (result.error) {
      return res.status(result.status || 400).send({ error: result.error, estimate: result.estimate });
    }
    return res.status(result.status || 200).send(result.data);
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
    if (result.error) {
      return res.status(result.status || 400).send({ error: result.error, estimate: result.estimate });
    }
    return res.status(result.status || 200).send(result.data);
  } catch (err) {
    return res.status(500).send({ error: 'Failed to send estimate via WhatsApp: ' + err.message });
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
