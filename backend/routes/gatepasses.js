const express = require('express');
const router = express.Router();
const GatePass = require('../models/GatePass');
const Notification = require('../models/Notification');
const { auth, restrictTo } = require('../middleware/auth');
const { logAction } = require('../utils/logger');

router.use(auth, restrictTo('Admin', 'Service', 'Body Shop', 'Accounts Executive', 'Accounts'));

// Generate unique sequential gate pass number (e.g. GP-260702-001)
const generateGatePassNo = async () => {
  const today = new Date();
  const year = today.getFullYear().toString().slice(-2);
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  const latest = await GatePass.findOne({ gatePassNo: new RegExp(`^GP-${dateStr}-`) })
    .sort({ gatePassNo: -1 });

  let sequence = '001';
  if (latest) {
    const parts = latest.gatePassNo.split('-');
    if (parts.length === 3) {
      const lastSeq = parseInt(parts[2], 10);
      sequence = (lastSeq + 1).toString().padStart(3, '0');
    }
  }

  return `GP-${dateStr}-${sequence}`;
};

// GET: Fetch eligible invoices and job cards for auto-populating gate passes
router.get('/eligible-releases', auth, async (req, res) => {
  try {
    const Invoice = require('../models/Invoice');
    const JobCard = require('../models/JobCard');
    const Customer = require('../models/Customer');
    const Vehicle = require('../models/Vehicle');

    const { search } = req.query;

    // 1. Fetch all non-cancelled invoices
    const invoices = await Invoice.find({ status: { $ne: 'Cancelled' } })
      .populate('customerId', 'name mobile phone contactNumber email')
      .populate('vehicleId', 'vehicleNumber make model variant color chassisNumber')
      .populate('jobCardId', 'jobCardNo status date serviceType estAmt')
      .sort({ createdAt: -1 })
      .lean();

    // 2. Fetch Job Cards that don't have an invoice yet (or in ready/delivered state)
    const invoicedJobCardIds = new Set(
      invoices.map(i => (i.jobCardId && i.jobCardId._id ? i.jobCardId._id.toString() : null)).filter(Boolean)
    );

    const readyJobCards = await JobCard.find({
      _id: { $nin: Array.from(invoicedJobCardIds) },
      status: { $in: ['Ready for Delivery', 'Vehicle Ready', 'Delivered', 'Quality Check', 'Closed', 'Work In Progress'] }
    })
      .populate('customerId', 'name mobile phone contactNumber email')
      .populate('vehicleId', 'vehicleNumber make model variant color chassisNumber')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    // 3. Batch fetch active gate passes to avoid N+1 queries
    const vehicleNumbers = [
      ...invoices.map(i => i.vehicleId?.vehicleNumber),
      ...readyJobCards.map(j => j.vehicleId?.vehicleNumber)
    ].filter(Boolean);

    const activeGatePasses = await GatePass.find({
      vehicleNumber: { $in: vehicleNumbers },
      status: { $in: ['Issued', 'Pending'] }
    })
      .sort({ createdAt: -1 })
      .lean();

    const activeGpByVehicle = new Map();
    const activeGpByJobCard = new Map();

    for (const gp of activeGatePasses) {
      if (gp.vehicleNumber) {
        const key = gp.vehicleNumber.trim().toUpperCase();
        if (!activeGpByVehicle.has(key)) activeGpByVehicle.set(key, gp);
      }
      if (gp.jobCardNumber) {
        const key = gp.jobCardNumber.trim().toUpperCase();
        if (!activeGpByJobCard.has(key)) activeGpByJobCard.set(key, gp);
      }
    }

    // 4. Transform invoices into release records
    const invoiceRecords = invoices.map(inv => {
      const customer = inv.customerId || {};
      const vehicle = inv.vehicleId || {};
      const jc = inv.jobCardId || {};

      const vNum = (vehicle.vehicleNumber || '').toUpperCase().trim();
      const jcNum = (jc.jobCardNo || '').toUpperCase().trim();

      const activeGp = (jcNum && activeGpByJobCard.get(jcNum)) || (vNum && activeGpByVehicle.get(vNum)) || null;

      const total = inv.totals?.roundedGrandTotal || inv.totals?.grandTotal || 0;
      const rawBalance = typeof inv.balanceDue === 'number' ? inv.balanceDue : (inv.paymentStatus === 'Paid' ? 0 : total);
      const balance = Math.max(0, Math.round(Number(rawBalance) * 100) / 100);
      const isPaid = balance <= 0 && (inv.paymentStatus === 'Paid' || inv.amountPaid >= total);
      const effectivePaymentStatus = balance <= 0 ? 'Paid' : (inv.amountPaid > 0 ? 'Partially Paid' : (inv.paymentStatus === 'Paid' ? 'Partially Paid' : inv.paymentStatus || 'Unpaid'));

      return {
        id: `inv_${inv._id}`,
        recordType: 'invoice',
        invoiceId: inv._id,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.date || inv.createdAt,
        invoiceStatus: inv.status, // Finalized / Draft
        paymentStatus: effectivePaymentStatus,
        paymentMethod: inv.paymentMethod || 'Cash',
        totalAmount: total,
        amountPaid: inv.amountPaid || 0,
        balanceDue: balance,
        isPaid,
        customerId: customer._id || null,
        customerName: customer.name || 'Valued Customer',
        customerMobile: customer.mobile || customer.phone || customer.contactNumber || '',
        vehicleId: vehicle._id || null,
        vehicleNumber: vehicle.vehicleNumber || '',
        vehicleMake: vehicle.make || '',
        vehicleModel: vehicle.model || '',
        vehicleDetails: `${vehicle.make || ''} ${vehicle.model || ''}`.trim(),
        jobCardId: jc._id || null,
        jobCardNumber: jc.jobCardNo || '',
        jobCardStatus: jc.status || '',
        serviceType: jc.serviceType || '',
        hasActiveGatePass: !!activeGp,
        activeGatePass: activeGp ? {
          gatePassNo: activeGp.gatePassNo,
          status: activeGp.status,
          date: activeGp.date || activeGp.createdAt,
          reasonForIssue: activeGp.reasonForIssue
        } : null
      };
    });

    // 5. Transform unbilled job cards
    const jobCardRecords = readyJobCards.map(jc => {
      const customer = jc.customerId || {};
      const vehicle = jc.vehicleId || {};

      const vNum = (vehicle.vehicleNumber || '').toUpperCase().trim();
      const jcNum = (jc.jobCardNo || '').toUpperCase().trim();

      const activeGp = (jcNum && activeGpByJobCard.get(jcNum)) || (vNum && activeGpByVehicle.get(vNum)) || null;

      return {
        id: `jc_${jc._id}`,
        recordType: 'jobcard',
        invoiceId: null,
        invoiceNo: 'Pending Invoice',
        invoiceDate: jc.date || jc.createdAt,
        invoiceStatus: 'Unbilled',
        paymentStatus: 'Pending',
        paymentMethod: 'N/A',
        totalAmount: jc.estAmt || 0,
        amountPaid: 0,
        balanceDue: jc.estAmt || 0,
        isPaid: false,
        customerId: customer._id || null,
        customerName: customer.name || 'Valued Customer',
        customerMobile: customer.mobile || customer.phone || customer.contactNumber || '',
        vehicleId: vehicle._id || null,
        vehicleNumber: vehicle.vehicleNumber || '',
        vehicleMake: vehicle.make || '',
        vehicleModel: vehicle.model || '',
        vehicleDetails: `${vehicle.make || ''} ${vehicle.model || ''}`.trim(),
        jobCardId: jc._id,
        jobCardNumber: jc.jobCardNo || '',
        jobCardStatus: jc.status || '',
        serviceType: jc.serviceType || '',
        hasActiveGatePass: !!activeGp,
        activeGatePass: activeGp ? {
          gatePassNo: activeGp.gatePassNo,
          status: activeGp.status,
          date: activeGp.date || activeGp.createdAt,
          reasonForIssue: activeGp.reasonForIssue
        } : null
      };
    });

    let records = [...invoiceRecords, ...jobCardRecords];

    // Optional query filtering
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      records = records.filter(r =>
        (r.customerName && r.customerName.toLowerCase().includes(q)) ||
        (r.customerMobile && r.customerMobile.includes(q)) ||
        (r.vehicleNumber && r.vehicleNumber.toLowerCase().includes(q)) ||
        (r.jobCardNumber && r.jobCardNumber.toLowerCase().includes(q)) ||
        (r.invoiceNo && r.invoiceNo.toLowerCase().includes(q))
      );
    }

    // Sort order:
    // 1. Invoices before standalone JobCards
    // 2. Finalized before Draft
    // 3. Paid before Unpaid
    // 4. Inactive Gate Pass before Active Gate Pass
    // 5. Newest date first
    records.sort((a, b) => {
      // Invoices come first
      if (a.recordType === 'invoice' && b.recordType !== 'invoice') return -1;
      if (a.recordType !== 'invoice' && b.recordType === 'invoice') return 1;

      // Finalized invoices before Draft
      if (a.invoiceStatus === 'Finalized' && b.invoiceStatus !== 'Finalized') return -1;
      if (a.invoiceStatus !== 'Finalized' && b.invoiceStatus === 'Finalized') return 1;

      // Paid before Unpaid
      if (a.isPaid && !b.isPaid) return -1;
      if (!a.isPaid && b.isPaid) return 1;

      // Without active gate pass before with active gate pass
      if (!a.hasActiveGatePass && b.hasActiveGatePass) return -1;
      if (a.hasActiveGatePass && !b.hasActiveGatePass) return 1;

      return new Date(b.invoiceDate) - new Date(a.invoiceDate);
    });

    res.json(records);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch eligible releases: ' + error.message });
  }
});

// GET: Fetch list of gate passes with search and query filters
router.get('/', auth, async (req, res) => {
  try {
    const { searchQuery, status } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    if (searchQuery) {
      const searchRegex = new RegExp(searchQuery, 'i');
      query.$or = [
        { gatePassNo: searchRegex },
        { invoiceNo: searchRegex },
        { customerName: searchRegex },
        { customerMobile: searchRegex },
        { vehicleNumber: searchRegex },
        { jobCardNumber: searchRegex },
        { materialName: searchRegex },
        { sentTo: searchRegex }
      ];
    }

    const gatepasses = await GatePass.find(query).sort({ createdAt: -1 });
    res.json(gatepasses);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch gate passes: ' + error.message });
  }
});

// GET: Fetch single gate pass
router.get('/:id', auth, async (req, res) => {
  try {
    const gatepass = await GatePass.findById(req.params.id);
    if (!gatepass) {
      return res.status(404).json({ error: 'Gate Pass not found' });
    }
    res.json(gatepass);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch gate pass: ' + error.message });
  }
});

// POST: Create a new gate pass
router.post('/', auth, async (req, res) => {
  try {
    const {
      jobCardNumber,
      vehicleNumber,
      customerName,
      customerMobile,
      materialName,
      quantity,
      unit,
      reasonForIssue,
      sentTo,
      receiverName,
      receiverMobile,
      receiverSignature,
      authorizedSignature,
      status,
      attachments,
      invoiceId,
      invoiceNo,
      jobCardId,
      customerId,
      vehicleId,
      passType,
      paymentStatus,
      balanceDue,
      allowUnpaidOverride
    } = req.body;

    if (!vehicleNumber || !customerName || !customerMobile || !materialName || !quantity || !reasonForIssue || !sentTo || !receiverName || !receiverMobile) {
      return res.status(400).json({ error: 'Missing required gate pass fields' });
    }

    let verifiedInvoice = null;
    if (invoiceId) {
      const Invoice = require('../models/Invoice');
      verifiedInvoice = await Invoice.findById(invoiceId);
      if (!verifiedInvoice || verifiedInvoice.status === 'Cancelled') {
        return res.status(400).json({ error: 'Selected invoice is invalid or has been cancelled.' });
      }
      const invBalance = typeof verifiedInvoice.balanceDue === 'number' 
        ? verifiedInvoice.balanceDue 
        : (verifiedInvoice.totals?.roundedGrandTotal || verifiedInvoice.totals?.grandTotal || 0);

      const isInvoiceFullyPaid = invBalance <= 0 && (verifiedInvoice.paymentStatus === 'Paid' || verifiedInvoice.amountPaid >= (verifiedInvoice.totals?.grandTotal || 0));

      if (!isInvoiceFullyPaid && invBalance > 0 && !allowUnpaidOverride) {
        return res.status(400).json({
          error: `Outstanding payment balance of ₹${invBalance} exists on invoice ${verifiedInvoice.invoiceNo}. Please confirm payment clearance before issuing gate pass.`,
          requiresOverride: true,
          balanceDue: invBalance
        });
      }
    }

    const gatePassNo = await generateGatePassNo();
    const issuedBy = req.user?.name || 'Staff Member';

    const gatepass = new GatePass({
      gatePassNo,
      jobCardNumber: jobCardNumber || '',
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
      customerName: customerName.trim(),
      customerMobile: customerMobile.trim(),
      materialName: materialName.trim(),
      quantity: Number(quantity) || 1,
      unit: unit || 'Nos',
      reasonForIssue: reasonForIssue.trim(),
      sentTo: sentTo.trim(),
      issuedBy,
      authorizedBy: req.user?.role === 'Admin' ? req.user.name : (authorizedSignature ? req.user?.name || 'Authorized Staff' : ''),
      receiverName: receiverName.trim(),
      receiverMobile: receiverMobile.trim(),
      receiverSignature: receiverSignature || '',
      authorizedSignature: authorizedSignature || '',
      status: status || 'Issued',
      attachments: attachments || [],
      invoiceId: invoiceId || verifiedInvoice?._id || undefined,
      invoiceNo: invoiceNo || verifiedInvoice?.invoiceNo || '',
      jobCardId: jobCardId || verifiedInvoice?.jobCardId || undefined,
      customerId: customerId || verifiedInvoice?.customerId || undefined,
      vehicleId: vehicleId || verifiedInvoice?.vehicleId || undefined,
      passType: passType || (verifiedInvoice ? 'Vehicle Delivery' : 'Vendor Material'),
      paymentStatus: paymentStatus || (verifiedInvoice ? verifiedInvoice.paymentStatus : 'Paid'),
      balanceDue: typeof balanceDue === 'number' ? balanceDue : (verifiedInvoice?.balanceDue || 0)
    });

    await gatepass.save();

    // Automatically update JobCard status if vehicle delivery gate pass
    if (gatepass.jobCardId && (gatepass.passType === 'Vehicle Delivery' || gatepass.passType === 'Customer Delivery')) {
      try {
        const JobCard = require('../models/JobCard');
        const existingJc = await JobCard.findById(gatepass.jobCardId);
        if (existingJc && ['Ready for Delivery', 'Vehicle Ready', 'Quality Check', 'Work In Progress'].includes(existingJc.status)) {
          existingJc.status = 'Delivered';
          await existingJc.save();
          console.log(`[GatePass] JobCard ${existingJc.jobCardNo} marked as 'Delivered' upon gate pass issuance.`);
        }
      } catch (jcErr) {
        console.warn('[GatePass] Could not update JobCard status:', jcErr.message);
      }
    }

    // Automatically create a notification
    const notification = new Notification({
      type: 'gatepass',
      title: 'Gate Pass Created',
      message: `Gate Pass ${gatepass.gatePassNo} has been issued for ${gatepass.materialName} (${gatepass.quantity} ${gatepass.unit}) to ${gatepass.sentTo}.`,
      vehicleNumber: gatepass.vehicleNumber,
      customerName: gatepass.customerName,
      status: 'unread'
    });
    await notification.save();

    // [Stage 2] Gate Pass saved
    console.log(`[GatePass] [Stage 2] Gate Pass saved successfully: ID=${gatepass._id}, GatePassNo=${gatepass.gatePassNo}, Vehicle=${gatepass.vehicleNumber}`);

    // WhatsApp Integration: Gate Pass Generated & Feedback Scheduling
    try {
      const JobCard = require('../models/JobCard');
      const Customer = require('../models/Customer');
      const { sendTemplateMessage, validateCustomerContact } = require('../services/whatsappService');
      const { scheduleFeedbackReminder } = require('../services/feedbackReminderService');

      let jc = null;
      let customerRecord = null;
      if (gatepass.jobCardNumber) {
        jc = await JobCard.findOne({ jobCardNo: gatepass.jobCardNumber }).lean();
        if (jc && jc.customerId) {
          customerRecord = await Customer.findById(jc.customerId).lean();
        }
      }

      const rawPhone = gatepass.customerMobile;
      const customerName = String(gatepass.customerName || 'Valued Customer').trim();
      const vehicleNumber = String(gatepass.vehicleNumber || 'your vehicle').trim();
      const jobCardNumber = String(gatepass.jobCardNumber || jc?.jobCardNo || 'N/A').trim();
      const gatePassNo = String(gatepass.gatePassNo || 'N/A').trim();

      const contactCheck = validateCustomerContact(customerRecord, rawPhone);
      const templateName = 'mvss_gate_pass_generated';
      const correlationKey = `gate_pass_generated_${gatepass._id}`;

      // [Stage 3] Automation event triggered
      console.log(`[GatePass Automation] [Stage 3] Automation event triggered: GatePassNo=${gatePassNo}, Vehicle=${vehicleNumber}, JobCardNo=${jobCardNumber}`);

      // [Stage 4] Customer contact/template validation result
      console.log(`[GatePass Automation] [Stage 4] Contact/template validation result: Customer="${customerName}", Phone="${contactCheck.masked}", Valid=${contactCheck.valid}, Template="${templateName}"${!contactCheck.valid ? `, Reason="${contactCheck.reason}"` : ''}`);

      if (contactCheck.valid) {
        // [Stage 5] WhatsApp send attempted
        console.log(`[GatePass Automation] [Stage 5] WhatsApp send attempted: To=${contactCheck.masked}, Template=${templateName}, CorrelationKey=${correlationKey}`);

        try {
          const waResult = await sendTemplateMessage({
            to: contactCheck.phone,
            templateName,
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: customerName },
                  { type: 'text', text: vehicleNumber },
                  { type: 'text', text: jobCardNumber },
                  { type: 'text', text: gatePassNo }
                ]
              }
            ],
            recipientName: customerName,
            relatedEntity: gatepass._id,
            onModel: 'GatePass',
            idempotencyKey: correlationKey
          });

          // [Stage 6] Meta response accepted
          console.log(`[GatePass Automation] [Stage 6] Meta response accepted: GatePass=${gatePassNo}, wamid=${waResult.messageId || 'duplicate_skipped'}, Status=${waResult.status || 'accepted'}`);
        } catch (waSendErr) {
          // [Stage 6] Meta response failed (isolated, does not fail gate pass creation)
          console.error(`[GatePass Automation] [Stage 6] Meta response failed: GatePass=${gatePassNo}, Error=${waSendErr.message || waSendErr}`);
        }

        // Schedule Customer Feedback Request (Default delay: 2 hours)
        try {
          await scheduleFeedbackReminder({ gatePass: gatepass });
        } catch (schedErr) {
          console.error('[Feedback Automation] Failed to schedule feedback reminder:', schedErr.message || schedErr);
        }
      } else {
        console.warn(`[GatePass Automation] [Stage 4] Skipping WhatsApp dispatch: ${contactCheck.reason}`);
      }
    } catch (waError) {
      console.error('[GatePass Automation] Unexpected error in WhatsApp gate pass hook:', waError.message || waError);
    }

    // Log action in audit log
    await logAction(req.user, 'GATEPASS_CREATE', `Created Gate Pass ${gatepass.gatePassNo} for vehicle ${gatepass.vehicleNumber}`, req);

    res.status(201).json(gatepass);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create gate pass: ' + error.message });
  }
});

// PUT: Update a gate pass / log material return
router.post('/:id/print-log', auth, async (req, res) => {
  try {
    const gatepass = await GatePass.findById(req.params.id);
    if (!gatepass) {
      return res.status(404).json({ error: 'Gate Pass not found' });
    }
    await logAction(req.user, 'GATEPASS_PRINT', `Printed Gate Pass ${gatepass.gatePassNo} PDF`, req);
    res.json({ message: 'Print logged.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const gatepass = await GatePass.findById(req.params.id);
    if (!gatepass) {
      return res.status(404).json({ error: 'Gate Pass not found' });
    }

    const oldStatus = gatepass.status;
    const { status, returnDate, receiverSignature, authorizedSignature, attachments } = req.body;

    if (status) gatepass.status = status;
    if (receiverSignature) gatepass.receiverSignature = receiverSignature;
    if (authorizedSignature) gatepass.authorizedSignature = authorizedSignature;
    if (attachments) gatepass.attachments = attachments;

    if (status === 'Returned' && oldStatus !== 'Returned') {
      gatepass.returnDate = returnDate || new Date();
      
      // Cancel any pending feedback reminders for this returned gate pass
      try {
        const { cancelFeedbackReminder } = require('../services/feedbackReminderService');
        await cancelFeedbackReminder(gatepass._id, 'Gate pass material returned');
      } catch (cancelErr) {
        console.error('[Feedback Automation] Error cancelling feedback reminder:', cancelErr);
      }

      // Save notification for returned material
      const notification = new Notification({
        type: 'gatepass',
        title: 'Material Returned',
        message: `Materials on Gate Pass ${gatepass.gatePassNo} (${gatepass.materialName}) have been returned.`,
        vehicleNumber: gatepass.vehicleNumber,
        customerName: gatepass.customerName,
        status: 'unread'
      });
      await notification.save();
      
      await logAction(req.user, 'GATEPASS_RETURN', `Logged material return for Gate Pass ${gatepass.gatePassNo}`, req);
    } else {
      await logAction(req.user, 'GATEPASS_UPDATE', `Updated Gate Pass ${gatepass.gatePassNo} status to ${status}`, req);
    }

    await gatepass.save();
    res.json(gatepass);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update gate pass: ' + error.message });
  }
});

// DELETE: Delete a gate pass (Admin only)
router.delete('/:id', auth, restrictTo('Admin'), async (req, res) => {
  try {
    const gatepass = await GatePass.findById(req.params.id);
    if (!gatepass) {
      return res.status(404).json({ error: 'Gate Pass not found' });
    }

    // Cancel pending feedback reminder if gate pass is deleted
    try {
      const { cancelFeedbackReminder } = require('../services/feedbackReminderService');
      await cancelFeedbackReminder(gatepass._id, 'Gate pass record deleted');
    } catch (cancelErr) {
      console.error('[Feedback Automation] Error cancelling feedback reminder on delete:', cancelErr);
    }

    await GatePass.findByIdAndDelete(req.params.id);
    await logAction(req.user, 'GATEPASS_DELETE', `Deleted Gate Pass ${gatepass.gatePassNo}`, req);
    res.json({ message: 'Gate pass deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete gate pass: ' + error.message });
  }
});

module.exports = router;
