const express = require('express');
const Invoice = require('../models/Invoice');
const JobCard = require('../models/JobCard');
const Estimate = require('../models/Estimate');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const Inventory = require('../models/Inventory');
const { auth, restrictTo } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const { generateInvoicePDF, generateGatePassPDF } = require('../utils/pdfGenerator');
const numberToWords = require('../utils/numberToWords');
const { getNextSequence } = require('../utils/documentNumbering');
const router = express.Router();

// Helper to auto-generate Invoice Number
const generateInvoiceNo = async () => {
  return await getNextSequence('INV', 'Invoice');
};

// Recalculate Invoice totals with GST splits
const recalculateInvoice = (parts = [], labour = [], isInterstate = false) => {
  const roundToTwo = (num) => {
    return Math.round((num + Number.EPSILON) * 100) / 100;
  };

  let partsTotal = 0; // Net taxable sum
  let labourTotal = 0; // Net taxable sum
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;
  let gstTotal = 0;
  let discountTotal = 0;

  const processedParts = parts.map(part => {
    const qty = Math.max(0, Number(part.qty) || 0);
    const rate = Math.max(0, Number(part.rate) || 0);
    const gstPercent = (part.gstPercent !== undefined && part.gstPercent !== null && part.gstPercent !== '') ? Number(part.gstPercent) : 18;
    
    const grossAmount = roundToTwo(qty * rate);
    
    let discountAmount = 0;
    let discountPercent = 0;
    const discountType = part.discountType || 'Percent';

    if (discountType === 'Fixed') {
      discountAmount = roundToTwo(Number(part.discountAmount) || 0);
      discountPercent = grossAmount > 0 ? roundToTwo((discountAmount / grossAmount) * 100) : 0;
    } else {
      discountPercent = Number(part.discountPercent) || 0;
      discountAmount = roundToTwo(grossAmount * (discountPercent / 100));
    }

    if (discountAmount > grossAmount) discountAmount = grossAmount;
    if (discountAmount < 0) discountAmount = 0;

    const amount = roundToTwo(grossAmount - discountAmount); // taxable amount
    const gstAmount = roundToTwo(amount * (gstPercent / 100));
    const total = roundToTwo(amount + gstAmount);

    partsTotal += amount;
    discountTotal += discountAmount;
    gstTotal += gstAmount;

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    if (isInterstate) {
      igstAmount = gstAmount;
      igstTotal += gstAmount;
    } else {
      cgstAmount = roundToTwo(gstAmount / 2);
      sgstAmount = roundToTwo(gstAmount - cgstAmount); // prevent split loss
      cgstTotal += cgstAmount;
      sgstTotal += sgstAmount;
    }

    const partId = (part.partId && typeof part.partId === 'string' && part.partId.trim().length === 24) ? part.partId.trim() : undefined;

    return {
      partId,
      name: part.name,
      partNo: part.partNo,
      hsnCode: part.hsnCode,
      qty,
      rate,
      discountType,
      discountPercent,
      discountAmount,
      gstPercent,
      amount,
      gstAmount,
      cgstAmount,
      sgstAmount,
      igstAmount,
      total
    };
  });

  const processedLabour = labour.map(lab => {
    const qty = Math.max(0, Number(lab.qty) !== undefined && lab.qty !== null && lab.qty !== '' ? Number(lab.qty) : 1);
    const rate = Math.max(0, Number(lab.rate) || 0);
    const gstPercent = (lab.gstPercent !== undefined && lab.gstPercent !== null && lab.gstPercent !== '') ? Number(lab.gstPercent) : 18;
    
    const grossAmount = roundToTwo(qty * rate);

    let discountAmount = 0;
    let discountPercent = 0;
    const discountType = lab.discountType || 'Percent';

    if (discountType === 'Fixed') {
      discountAmount = roundToTwo(Number(lab.discountAmount) || 0);
      discountPercent = grossAmount > 0 ? roundToTwo((discountAmount / grossAmount) * 100) : 0;
    } else {
      discountPercent = Number(lab.discountPercent) || 0;
      discountAmount = roundToTwo(grossAmount * (discountPercent / 100));
    }

    if (discountAmount > grossAmount) discountAmount = grossAmount;
    if (discountAmount < 0) discountAmount = 0;

    const amount = roundToTwo(grossAmount - discountAmount); // taxable amount
    const gstAmount = roundToTwo(amount * (gstPercent / 100));
    const total = roundToTwo(amount + gstAmount);

    labourTotal += amount;
    discountTotal += discountAmount;
    gstTotal += gstAmount;

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    if (isInterstate) {
      igstAmount = gstAmount;
      igstTotal += gstAmount;
    } else {
      cgstAmount = roundToTwo(gstAmount / 2);
      sgstAmount = roundToTwo(gstAmount - cgstAmount);
      cgstTotal += cgstAmount;
      sgstTotal += sgstAmount;
    }

    return {
      description: lab.description,
      qty,
      rate,
      discountType,
      discountPercent,
      discountAmount,
      gstPercent,
      amount,
      gstAmount,
      cgstAmount,
      sgstAmount,
      igstAmount,
      total
    };
  });

  const rawGrandTotal = partsTotal + labourTotal + gstTotal;
  const grandTotal = roundToTwo(rawGrandTotal);
  const roundedGrandTotal = Math.round(grandTotal);

  return {
    parts: processedParts,
    labour: processedLabour,
    totals: {
      partsTotal: roundToTwo(partsTotal),
      labourTotal: roundToTwo(labourTotal),
      cgstTotal: roundToTwo(cgstTotal),
      sgstTotal: roundToTwo(sgstTotal),
      igstTotal: roundToTwo(igstTotal),
      gstTotal: roundToTwo(gstTotal),
      discountTotal: roundToTwo(discountTotal),
      grandTotal,
      roundedGrandTotal
    },
    grandTotalWords: numberToWords(roundedGrandTotal)
  };
};

// Enforce permissions for all Invoice routes
router.use(auth, restrictTo('Admin', 'Accounts', 'Accounts Executive'));

// List invoices
router.get('/', async (req, res) => {
  try {
    const { status, paymentStatus, search } = req.query;
    let query = {};
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;

    if (search && search.trim() !== '') {
      const term = search.trim();
      const Customer = require('../models/Customer');
      const Vehicle = require('../models/Vehicle');

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

      query.$or = [
        { invoiceNo: { $regex: term, $options: 'i' } },
        { customerId: { $in: customerIds } },
        { vehicleId: { $in: vehicleIds } }
      ];
    }

    const invoices = await Invoice.find(query)
      .select('invoiceNo jobCardId customerId vehicleId totals parts labour invoiceType paymentStatus paymentMethod amountPaid advanceReceived balanceDue isSent sentStatus status date createdAt')
      .populate('customerId')
      .populate('vehicleId')
      .sort({ createdAt: -1 })
      .lean();

    res.send(invoices);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch invoices.' });
  }
});

// Get single invoice
router.get('/:id', auth, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('customerId')
      .populate('vehicleId')
      .populate('jobCardId');
    if (!invoice) return res.status(404).send({ error: 'Invoice not found.' });

    // Log Invoice Viewed
    await logAction(req.user, 'INVOICE_VIEW', `Viewed Invoice ${invoice.invoiceNo}`, req);

    res.send(invoice);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch invoice.' });
  }
});

// Create Invoice (can link to estimate)
router.post('/', auth, restrictTo('Admin', 'Accounts', 'Accounts Executive'), async (req, res) => {
  try {
    const { jobCardId, estimateId, parts, labour, gstDetails, insuranceClaimDetails, invoiceType, billingNameOption, poNumber, roNumber, preparedBy, manualInvoiceRef } = req.body;
    
    // Find customer & vehicle
    const jobCard = await JobCard.findById(jobCardId);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    const customer = await Customer.findById(jobCard.customerId);
    const vehicle = await Vehicle.findById(jobCard.vehicleId);

    const invoiceNo = await generateInvoiceNo();
    
    // Check if interstate based on customer and shop state (we assume shop is in Telangana code 36)
    let isInterstate = false;
    if (typeof gstDetails?.isInterstate === 'boolean') {
      isInterstate = gstDetails.isInterstate;
    } else if (typeof gstDetails?.isInterstate === 'string' && gstDetails.isInterstate.trim() !== '') {
      isInterstate = gstDetails.isInterstate.trim().toLowerCase() === 'true';
    } else if (gstDetails?.customerGSTIN) {
      isInterstate = !gstDetails.customerGSTIN.startsWith('36');
    } else if (customer?.gstNumber) {
      isInterstate = !customer.gstNumber.startsWith('36');
    }

    const calculations = recalculateInvoice(parts, labour, isInterstate);

    const finalRoNumber = roNumber || jobCard.jobCardNo;
    const finalPreparedBy = preparedBy || (req.user && req.user.name) || 'Staff Incharge';

    const invoiceData = {
      invoiceNo,
      jobCardId,
      estimateId,
      customerId: customer._id,
      vehicleId: vehicle._id,
      poNumber: poNumber || '',
      roNumber: finalRoNumber,
      preparedBy: finalPreparedBy,
      manualInvoiceRef: manualInvoiceRef || '',
      gstDetails: {
        companyGSTIN: '36AAJCM4778P1ZI',
        customerGSTIN: gstDetails?.customerGSTIN || customer.gstNumber || '',
        isInterstate: Boolean(isInterstate)
      },
      parts: calculations.parts,
      labour: calculations.labour,
      totals: calculations.totals,
      grandTotalWords: calculations.grandTotalWords,
      advanceReceived: jobCard.advancePayments ? jobCard.advancePayments.reduce((sum, p) => sum + p.amount, 0) : 0,
      balanceDue: Math.max(0, calculations.totals.roundedGrandTotal - (jobCard.advancePayments ? jobCard.advancePayments.reduce((sum, p) => sum + p.amount, 0) : 0)),
      insuranceClaimDetails: {
        claimNo: insuranceClaimDetails?.claimNo || '',
        insuranceCompany: insuranceClaimDetails?.insuranceCompany || '',
        surveyorName: insuranceClaimDetails?.surveyorName || '',
        surveyDate: insuranceClaimDetails?.surveyDate,
        approvedAmount: Number(insuranceClaimDetails?.approvedAmount) || 0,
        customerPayableAmount: Math.max(0, calculations.totals.roundedGrandTotal - (Number(insuranceClaimDetails?.approvedAmount) || 0))
      },
      invoiceType: invoiceType || 'Tax Invoice',
      billingNameOption: billingNameOption || 'CompanyName',
      status: 'Draft'
    };

    const invoice = new Invoice(invoiceData);
    await invoice.save();

    try {
      const { updateJobCardPaymentStatus } = require('./jobcards');
      await updateJobCardPaymentStatus(jobCard);
      await jobCard.save();
    } catch (err) {
      console.error('Failed to update job card payment status:', err);
    }

    // Automatically create a notification
    try {
      const Customer = require('../models/Customer');
      const VehicleModel = require('../models/Vehicle');
      const Notification = require('../models/Notification');
      
      const customer = await Customer.findById(invoice.customerId);
      const vehicle = await VehicleModel.findById(invoice.vehicleId);

      const notification = new Notification({
        type: 'invoice',
        title: 'Bill Generated',
        message: `Invoice ${invoice.invoiceNo} of amount Rs. ${invoice.totals ? invoice.totals.grandTotal : 0} has been generated.`,
        vehicleNumber: vehicle ? vehicle.vehicleNumber : undefined,
        customerName: customer ? customer.name : undefined
      });
      await notification.save();
    } catch (notifErr) {
      console.error('Failed to create invoice notification:', notifErr);
    }

    await logAction(req.user, 'INVOICE_CREATE', `Created Invoice ${invoiceNo} for Job Card ${jobCard.jobCardNo}`, req);
    res.status(201).send(invoice);
  } catch (error) {
    res.status(400).send({ error: 'Failed to create invoice: ' + error.message });
  }
});

// Update / Finalize Invoice (Triggers Inventory stock deduction)
router.put('/:id', auth, restrictTo('Admin', 'Accounts', 'Accounts Executive'), async (req, res) => {
  try {
    const { parts, labour, status, paymentStatus, paymentMethod, amountPaid, insuranceClaimDetails, invoiceType, billingNameOption, poNumber, roNumber, preparedBy, manualInvoiceRef } = req.body;
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).send({ error: 'Invoice not found.' });

    const isFinalizing = status === 'Finalized' && invoice.status !== 'Finalized';

    if (isFinalizing) {
      const partsToCheck = parts || invoice.parts;
      for (const part of partsToCheck) {
        if (part.partId) {
          const invItem = await Inventory.findById(part.partId);
          if (!invItem) {
            return res.status(400).send({ error: `Inventory item for part "${part.name}" not found.` });
          }
          if (Number(part.qty) > invItem.stockQuantity) {
            return res.status(400).send({ error: `Insufficient stock for "${part.name}". Available: ${invItem.stockQuantity}, Required: ${part.qty}.` });
          }
        }
      }
    }

    if (parts || labour) {
      // Allow modifying items even if finalized
      /*
      if (invoice.status === 'Finalized') {
        return res.status(400).send({ error: 'Cannot modify items on a finalized invoice.' });
      }
      */
      const calculations = recalculateInvoice(
        parts || invoice.parts,
        labour || invoice.labour,
        invoice.gstDetails.isInterstate
      );
      invoice.parts = calculations.parts;
      invoice.labour = calculations.labour;
      invoice.totals = calculations.totals;
      invoice.grandTotalWords = calculations.grandTotalWords;
    }

    if (status) {
      invoice.status = status;
      if (status === 'Finalized') {
        invoice.date = new Date();
      }
    }

    if (paymentStatus) {
      invoice.paymentStatus = paymentStatus;
      if (paymentStatus === 'Paid') {
        invoice.amountPaid = invoice.totals.roundedGrandTotal || invoice.totals.grandTotal;
      }
    }

    if (amountPaid !== undefined) {
      invoice.amountPaid = amountPaid;
    }

    if (paymentMethod) {
      invoice.paymentMethod = paymentMethod;
    }

    if (insuranceClaimDetails) {
      const approvedAmount = Number(insuranceClaimDetails.approvedAmount) || 0;
      invoice.insuranceClaimDetails = {
        ...insuranceClaimDetails,
        approvedAmount,
        customerPayableAmount: Math.max(0, (invoice.totals.roundedGrandTotal || invoice.totals.grandTotal || 0) - approvedAmount)
      };
    } else if (invoice.insuranceClaimDetails) {
      const approvedAmount = invoice.insuranceClaimDetails.approvedAmount || 0;
      invoice.insuranceClaimDetails.customerPayableAmount = Math.max(0, (invoice.totals.roundedGrandTotal || invoice.totals.grandTotal || 0) - approvedAmount);
    }

    if (invoiceType) {
      invoice.invoiceType = invoiceType;
    }

    if (billingNameOption !== undefined) {
      invoice.billingNameOption = billingNameOption;
    }

    if (poNumber !== undefined) {
      invoice.poNumber = poNumber;
    }

    if (roNumber !== undefined) {
      invoice.roNumber = roNumber;
    }

    if (preparedBy !== undefined) {
      invoice.preparedBy = preparedBy;
    }

    if (manualInvoiceRef !== undefined) {
      invoice.manualInvoiceRef = manualInvoiceRef;
    }

    invoice.balanceDue = Math.max(0, (invoice.totals.roundedGrandTotal || invoice.totals.grandTotal || 0) - (invoice.advanceReceived || 0));

    await invoice.save();

    try {
      const { updateJobCardPaymentStatus } = require('./jobcards');
      const jc = await JobCard.findById(invoice.jobCardId);
      if (jc) {
        await updateJobCardPaymentStatus(jc);
        await jc.save();
      }
    } catch (err) {
      console.error('Failed to update job card payment status:', err);
    }

    // Trigger stock deduction and job card updates upon finalization
    if (isFinalizing) {
      // Deduct from Inventory
      for (const part of invoice.parts) {
        if (part.partId) {
          const invItem = await Inventory.findById(part.partId);
          if (invItem) {
            invItem.stockQuantity = Math.max(0, invItem.stockQuantity - part.qty);
            await invItem.save();
          }
        }
      }

      // Mark Job Card as Delivered/Closed
      await JobCard.findByIdAndUpdate(invoice.jobCardId, { status: 'Delivered' });
      const { calculateBillingSummary } = require('../utils/billing');
      await calculateBillingSummary(invoice.jobCardId);
      await logAction(req.user, 'INVOICE_FINALIZE', `Finalized Invoice ${invoice.invoiceNo} & deducted inventory items`, req);

      // [Stage 2] Invoice finalized
      console.log(`[Invoice] [Stage 2] Invoice finalized successfully: ID=${invoice._id}, InvoiceNo=${invoice.invoiceNo}, JobCard=${invoice.jobCardId}`);

      // WhatsApp Integration: Invoice Generated
      try {
        const Customer = require('../models/Customer');
        const VehicleModel = require('../models/Vehicle');
        const JobCard = require('../models/JobCard');
        const { sendTemplateMessage, validateCustomerContact } = require('../services/whatsappService');

        const custId = (invoice.customerId && invoice.customerId._id) ? invoice.customerId._id : invoice.customerId;
        const vehId = (invoice.vehicleId && invoice.vehicleId._id) ? invoice.vehicleId._id : invoice.vehicleId;

        const customer = (invoice.customerId && invoice.customerId.name && (invoice.customerId.mobile || invoice.customerId.phone))
          ? invoice.customerId
          : (custId ? await Customer.findById(custId).lean() : null);

        const vehicle = (invoice.vehicleId && (invoice.vehicleId.vehicleNumber || invoice.vehicleId.regNo))
          ? invoice.vehicleId
          : (vehId ? await VehicleModel.findById(vehId).lean() : null);

        const jc = invoice.jobCardId ? await JobCard.findById(invoice.jobCardId).lean() : null;

        const rawPhone = customer ? (customer.mobile || customer.phone || customer.contactNumber) : null;
        const customerName = String(customer?.name || 'Valued Customer').trim();
        const vehicleNumber = String(vehicle?.vehicleNumber || vehicle?.regNo || 'your vehicle').trim();
        const invoiceNumber = String(invoice.invoiceNo || 'N/A').trim();
        const jobCardNumber = String(jc?.jobCardNo || invoice.jobCardId?.toString() || 'N/A').trim();
        const grandTotal = String(invoice.totals?.roundedGrandTotal || invoice.totals?.grandTotal || '0').trim();

        const contactCheck = validateCustomerContact(customer, rawPhone);
        const templateName = 'mvss_invoice_generated';
        const correlationKey = `invoice_generated_${invoice._id}`;

        // [Stage 3] Automation event triggered
        console.log(`[Invoice Automation] [Stage 3] Automation event triggered: Event="Invoice Finalized", InvoiceNo=${invoiceNumber}, JobCardNo=${jobCardNumber}`);

        // [Stage 4] Customer contact/template validation result
        console.log(`[Invoice Automation] [Stage 4] Contact/template validation result: Customer="${customerName}", Phone="${contactCheck.masked}", Valid=${contactCheck.valid}, Template="${templateName}"${!contactCheck.valid ? `, Reason="${contactCheck.reason}"` : ''}`);

        if (contactCheck.valid) {
          // [Stage 5] WhatsApp send attempted
          console.log(`[Invoice Automation] [Stage 5] WhatsApp send attempted: To=${contactCheck.masked}, Template=${templateName}, CorrelationKey=${correlationKey}`);

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
                    { type: 'text', text: invoiceNumber },
                    { type: 'text', text: jobCardNumber },
                    { type: 'text', text: grandTotal }
                  ]
                }
              ],
              recipientName: customerName,
              relatedEntity: invoice._id,
              onModel: 'Invoice',
              idempotencyKey: correlationKey
            });

            // [Stage 6] Meta response accepted
            console.log(`[Invoice Automation] [Stage 6] Meta response accepted: Invoice=${invoiceNumber}, wamid=${waResult.messageId || 'duplicate_skipped'}, Status=${waResult.status || 'accepted'}`);
          } catch (waSendErr) {
            // [Stage 6] Meta response failed (isolated, does not fail invoice update)
            console.error(`[Invoice Automation] [Stage 6] Meta response failed: Invoice=${invoiceNumber}, Error=${waSendErr.message || waSendErr}`);
          }
        } else {
          console.warn(`[Invoice Automation] [Stage 4] Skipping WhatsApp dispatch: ${contactCheck.reason}`);
        }
      } catch (waError) {
        console.error('[Invoice Automation] Unexpected error in WhatsApp invoice generated hook:', waError.message || waError);
      }
    } else {
      const { calculateBillingSummary } = require('../utils/billing');
      await calculateBillingSummary(invoice.jobCardId);
      await logAction(req.user, 'INVOICE_EDIT', `Updated Invoice ${invoice.invoiceNo}`, req);
    }

    res.send(invoice);
  } catch (error) {
    res.status(400).send({ error: 'Failed to update invoice: ' + error.message });
  }
});

// Download Invoice PDF
router.get('/:id/pdf', auth, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).send({ error: 'Invoice not found.' });

    const customer = (invoice.customerId ? await Customer.findById(invoice.customerId) : null) || { name: 'Walk-in Customer', mobile: 'N/A' };
    const vehicle = (invoice.vehicleId ? await Vehicle.findById(invoice.vehicleId) : null) || { vehicleNumber: 'N/A', make: 'N/A', model: 'N/A' };

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=invoice-${invoice.invoiceNo}.pdf`);

    await logAction(req.user, 'REPORT_EXPORTED', `Exported PDF for Invoice ${invoice.invoiceNo}`, req);

    generateInvoicePDF(invoice, customer, vehicle, res);
  } catch (error) {
    res.status(500).send({ error: 'Failed to generate PDF: ' + error.message });
  }
});

// Download Gate Pass PDF from Invoice
router.get('/:id/gatepass/pdf', auth, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).send({ error: 'Invoice not found.' });

    if (invoice.paymentStatus !== 'Paid') {
      return res.status(400).send({ error: 'Gate Pass can be generated only if Payment Status is Paid.' });
    }

    const customer = (invoice.customerId ? await Customer.findById(invoice.customerId) : null) || { name: 'Walk-in Customer', mobile: 'N/A' };
    const vehicle = (invoice.vehicleId ? await Vehicle.findById(invoice.vehicleId) : null) || { vehicleNumber: 'N/A', make: 'N/A', model: 'N/A' };

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=gatepass-${invoice.invoiceNo}.pdf`);

    await logAction(req.user, 'REPORT_EXPORTED', `Exported Gate Pass PDF for Invoice ${invoice.invoiceNo}`, req);

    generateGatePassPDF(invoice, customer, vehicle, res);
  } catch (error) {
    res.status(500).send({ error: 'Failed to generate Gate Pass PDF: ' + error.message });
  }
});

// DELETE: Remove an invoice record permanently (Admin only)
router.delete('/:id', auth, restrictTo('Admin', 'Accounts Executive'), async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).send({ error: 'Invoice not found.' });

    await Invoice.findByIdAndDelete(req.params.id);

    // Create deletion notification entry
    try {
      const mongoose = require('mongoose');
      const Customer = require('../models/Customer');
      const Notification = require('../models/Notification');
      const customer = await Customer.findById(invoice.customerId);

      const notification = new Notification({
        type: 'invoice',
        title: 'Invoice Deleted',
        message: `Invoice ${invoice.invoiceNo} has been deleted.`,
        vehicleNumber: invoice.vehicleId ? (await mongoose.model('Vehicle').findById(invoice.vehicleId))?.vehicleNumber : undefined,
        customerName: customer ? customer.name : undefined
      });
      await notification.save();
    } catch (notifErr) {
      console.error('Failed to create invoice deletion notification:', notifErr);
    }

    await logAction(req.user, 'INVOICE_DELETE', `Deleted Invoice ${invoice.invoiceNo}`, req);
    res.send({ message: 'Invoice deleted successfully.' });
  } catch (error) {
    res.status(500).send({ error: 'Failed to delete invoice: ' + error.message });
  }
});

// POST: Log invoice printed
router.post('/:id/print', auth, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).send({ error: 'Invoice not found.' });

    await logAction(req.user, 'INVOICE_PRINT', `Printed Invoice ${invoice.invoiceNo}`, req);
    res.send({ message: 'Print logged successfully.' });
  } catch (error) {
    res.status(500).send({ error: 'Failed to log print action.' });
  }
});

// POST: Send invoice via email (updates status, notifies, logs audit)
router.post('/:id/send', auth, async (req, res) => {
  try {
    const { email } = req.body;
    const invoice = await Invoice.findById(req.params.id).populate('customerId');
    if (!invoice) return res.status(404).send({ error: 'Invoice not found.' });

    // Store sent status in MongoDB
    invoice.isSent = true;
    invoice.sentStatus = 'Sent';
    await invoice.save();

    // Create notification entry
    try {
      const mongoose = require('mongoose');
      const Notification = require('../models/Notification');
      const notification = new Notification({
        type: 'invoice',
        title: 'Invoice Sent',
        message: `Invoice ${invoice.invoiceNo} of amount Rs. ${invoice.totals.grandTotal} has been sent to ${email || invoice.customerId?.email || 'customer'}.`,
        vehicleNumber: invoice.vehicleId ? (await mongoose.model('Vehicle').findById(invoice.vehicleId))?.vehicleNumber : undefined,
        customerName: invoice.customerId ? invoice.customerId.name : undefined
      });
      await notification.save();
    } catch (notifErr) {
      console.error('Failed to create invoice sent notification:', notifErr);
    }

    // Create audit log entry
    await logAction(req.user, 'INVOICE_SEND', `Sent Invoice ${invoice.invoiceNo} to ${email || invoice.customerId?.email}`, req);

    res.send({ message: 'Invoice sent successfully.', invoice });
  } catch (error) {
    res.status(500).send({ error: 'Failed to send invoice: ' + error.message });
  }
});

// PUT: Mark invoice as paid (updates payment status and logs audit/notifications)
router.put('/:id/pay', auth, restrictTo('Admin', 'Accounts', 'Accounts Executive'), async (req, res) => {
  try {
    const { paymentMethod, amountPaid } = req.body;
    const invoice = await Invoice.findById(req.params.id).populate('customerId');
    if (!invoice) return res.status(404).send({ error: 'Invoice not found.' });

    invoice.paymentStatus = 'Paid';
    invoice.status = 'Finalized'; // Finalized when paid
    if (paymentMethod) invoice.paymentMethod = paymentMethod;
    invoice.amountPaid = amountPaid || invoice.totals.grandTotal;
    await invoice.save();

    try {
      const { updateJobCardPaymentStatus } = require('./jobcards');
      const jc = await JobCard.findById(invoice.jobCardId);
      if (jc) {
        await updateJobCardPaymentStatus(jc);
        await jc.save();
      }
    } catch (err) {
      console.error('Failed to update job card payment status:', err);
    }

    // Create notification entry
    try {
      const mongoose = require('mongoose');
      const Notification = require('../models/Notification');
      const notification = new Notification({
        type: 'invoice',
        title: 'Invoice Paid',
        message: `Invoice ${invoice.invoiceNo} of amount Rs. ${invoice.totals.grandTotal} has been marked as Paid.`,
        vehicleNumber: invoice.vehicleId ? (await mongoose.model('Vehicle').findById(invoice.vehicleId))?.vehicleNumber : undefined,
        customerName: invoice.customerId ? invoice.customerId.name : undefined
      });
      await notification.save();
    } catch (notifErr) {
      console.error('Failed to create invoice paid notification:', notifErr);
    }

    // [Stage 2] Invoice payment recorded
    console.log(`[Invoice] [Stage 2] Invoice payment recorded successfully: ID=${invoice._id}, InvoiceNo=${invoice.invoiceNo}, AmountPaid=${invoice.amountPaid || invoice.totals?.grandTotal}`);

    // WhatsApp Integration: Payment Received
    try {
      const Customer = require('../models/Customer');
      const VehicleModel = require('../models/Vehicle');
      const { sendTemplateMessage, validateCustomerContact } = require('../services/whatsappService');

      const custId = (invoice.customerId && invoice.customerId._id) ? invoice.customerId._id : invoice.customerId;
      const vehId = (invoice.vehicleId && invoice.vehicleId._id) ? invoice.vehicleId._id : invoice.vehicleId;

      const customer = (invoice.customerId && invoice.customerId.name && (invoice.customerId.mobile || invoice.customerId.phone))
        ? invoice.customerId
        : (custId ? await Customer.findById(custId).lean() : null);

      const vehicle = (invoice.vehicleId && (invoice.vehicleId.vehicleNumber || invoice.vehicleId.regNo))
        ? invoice.vehicleId
        : (vehId ? await VehicleModel.findById(vehId).lean() : null);

      const rawPhone = customer ? (customer.mobile || customer.phone || customer.contactNumber) : null;
      const customerName = String(customer?.name || 'Valued Customer').trim();
      const vehicleNumber = String(vehicle?.vehicleNumber || vehicle?.regNo || 'your vehicle').trim();
      const invoiceNumber = String(invoice.invoiceNo || 'N/A').trim();
      const amountPaid = String(invoice.amountPaid || invoice.totals?.grandTotal || '0').trim();
      const paymentStatus = String(invoice.paymentStatus || 'Paid').trim();

      const contactCheck = validateCustomerContact(customer, rawPhone);
      const templateName = 'mvss_payment_received';
      const correlationKey = `payment_received_${invoice._id}_full`;

      // [Stage 3] Automation event triggered
      console.log(`[Invoice Automation] [Stage 3] Automation event triggered: Event="Payment Received", InvoiceNo=${invoiceNumber}, Amount=${amountPaid}`);

      // [Stage 4] Customer contact/template validation result
      console.log(`[Invoice Automation] [Stage 4] Contact/template validation result: Customer="${customerName}", Phone="${contactCheck.masked}", Valid=${contactCheck.valid}, Template="${templateName}"${!contactCheck.valid ? `, Reason="${contactCheck.reason}"` : ''}`);

      if (contactCheck.valid) {
        // [Stage 5] WhatsApp send attempted
        console.log(`[Invoice Automation] [Stage 5] WhatsApp send attempted: To=${contactCheck.masked}, Template=${templateName}, CorrelationKey=${correlationKey}`);

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
                  { type: 'text', text: invoiceNumber },
                  { type: 'text', text: amountPaid },
                  { type: 'text', text: paymentStatus }
                ]
              }
            ],
            recipientName: customerName,
            relatedEntity: invoice._id,
            onModel: 'Invoice',
            idempotencyKey: correlationKey
          });

          // [Stage 6] Meta response accepted
          console.log(`[Invoice Automation] [Stage 6] Meta response accepted: Invoice=${invoiceNumber}, wamid=${waResult.messageId || 'duplicate_skipped'}, Status=${waResult.status || 'accepted'}`);
        } catch (waSendErr) {
          // [Stage 6] Meta response failed (isolated, does not fail payment update)
          console.error(`[Invoice Automation] [Stage 6] Meta response failed: Invoice=${invoiceNumber}, Error=${waSendErr.message || waSendErr}`);
        }
      } else {
        console.warn(`[Invoice Automation] [Stage 4] Skipping WhatsApp dispatch: ${contactCheck.reason}`);
      }
    } catch (waError) {
      console.error('[Invoice Automation] Unexpected error in payment received WhatsApp hook:', waError.message || waError);
    }

    // Create audit log entry
    await logAction(req.user, 'INVOICE_PAY', `Marked Invoice ${invoice.invoiceNo} as Paid`, req);

    res.send({ message: 'Invoice marked as paid successfully.', invoice });
  } catch (error) {
    res.status(500).send({ error: 'Failed to mark invoice as paid: ' + error.message });
  }
});

// POST: Duplicate Invoice
router.post('/:id/duplicate', auth, restrictTo('Admin', 'Accounts', 'Accounts Executive'), async (req, res) => {
  try {
    const sourceInvoice = await Invoice.findById(req.params.id);
    if (!sourceInvoice) return res.status(404).send({ error: 'Source invoice not found.' });

    // Generate new unique invoice number
    const newInvoiceNo = await generateInvoiceNo();

    // Create duplicate data
    const duplicateData = sourceInvoice.toObject();
    delete duplicateData._id;
    delete duplicateData.createdAt;
    delete duplicateData.updatedAt;
    duplicateData.invoiceNo = newInvoiceNo;
    duplicateData.status = 'Draft';
    duplicateData.paymentStatus = 'Unpaid';
    duplicateData.amountPaid = 0;

    const newInvoice = new Invoice(duplicateData);
    await newInvoice.save();

    // Create audit log entry
    await logAction(req.user, 'INVOICE_DUPLICATE', `Duplicated Invoice ${sourceInvoice.invoiceNo} as ${newInvoiceNo}`, req);

    res.status(201).send(newInvoice);
  } catch (error) {
    res.status(500).send({ error: 'Failed to duplicate invoice: ' + error.message });
  }
});

// POST: Log invoice shared
router.post('/:id/share', auth, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('customerId');
    if (!invoice) return res.status(404).send({ error: 'Invoice not found.' });

    // Create notification entry
    try {
      const mongoose = require('mongoose');
      const Notification = require('../models/Notification');
      const notification = new Notification({
        type: 'invoice',
        title: 'Invoice Shared',
        message: `Invoice ${invoice.invoiceNo} has been shared.`,
        vehicleNumber: invoice.vehicleId ? (await mongoose.model('Vehicle').findById(invoice.vehicleId))?.vehicleNumber : undefined,
        customerName: invoice.customerId ? invoice.customerId.name : undefined
      });
      await notification.save();
    } catch (notifErr) {
      console.error('Failed to create invoice shared notification:', notifErr);
    }

    await logAction(req.user, 'INVOICE_SHARE', `Shared Invoice ${invoice.invoiceNo}`, req);
    res.send({ message: 'Share logged successfully.' });
  } catch (error) {
    res.status(500).send({ error: 'Failed to log share action: ' + error.message });
  }
});

// POST: Send payment due reminder via WhatsApp
router.post('/:id/send-payment-due', auth, restrictTo('Admin', 'Accounts', 'Accounts Executive', 'Service'), async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('customerId')
      .populate('vehicleId');
    if (!invoice) return res.status(404).send({ error: 'Invoice not found.' });

    const Customer = require('../models/Customer');
    const VehicleModel = require('../models/Vehicle');
    const JobCard = require('../models/JobCard');
    const { sendTemplateMessage, validateCustomerContact } = require('../services/whatsappService');

    const customer = invoice.customerId;
    const vehicle = invoice.vehicleId;
    const jc = invoice.jobCardId ? await JobCard.findById(invoice.jobCardId).lean() : null;

    const rawPhone = customer ? (customer.mobile || customer.phone || customer.contactNumber) : null;
    const customerName = String(customer?.name || 'Valued Customer').trim();
    const vehicleNumber = String(vehicle?.vehicleNumber || vehicle?.regNo || 'your vehicle').trim();
    const invoiceNumber = String(invoice.invoiceNo || 'N/A').trim();
    const balanceDue = String(invoice.balanceDue || (invoice.totals?.roundedGrandTotal || invoice.totals?.grandTotal || '0')).trim();

    const contactCheck = validateCustomerContact(customer, rawPhone);
    if (!contactCheck.valid) {
      return res.status(400).send({ error: `Cannot send WhatsApp reminder: ${contactCheck.reason}` });
    }

    const templateName = 'mvss_payment_due';
    const correlationKey = `payment_due_${invoice._id}_${Date.now()}`;

    const waResult = await sendTemplateMessage({
      to: contactCheck.phone,
      templateName,
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: customerName },
            { type: 'text', text: vehicleNumber },
            { type: 'text', text: invoiceNumber },
            { type: 'text', text: balanceDue }
          ]
        }
      ],
      recipientName: customerName,
      relatedEntity: invoice._id,
      onModel: 'Invoice',
      idempotencyKey: correlationKey
    });

    await logAction(req.user, 'INVOICE_PAYMENT_DUE_WHATSAPP', `Sent payment due reminder WhatsApp for Invoice ${invoice.invoiceNo}`, req);

    res.send({
      success: true,
      message: 'Payment due reminder sent successfully via WhatsApp',
      messageId: waResult.messageId
    });
  } catch (error) {
    res.status(500).send({ error: 'Failed to send payment due reminder: ' + error.message });
  }
});

module.exports = router;
