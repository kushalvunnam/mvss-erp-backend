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

// Recalculate parts/labour totals and GST
const recalculateEstimate = (parts = [], labour = []) => {
  let partsTotal = 0;
  let labourTotal = 0;
  let gstTotal = 0;

  const processedParts = parts.map(part => {
    const qty = Number(part.qty) || 1;
    const rate = Number(part.rate) || 0;
    const discount = Number(part.discount) || 0;
    const unit = part.unit || 'Pcs';
    const gstPercent = (part.gstPercent !== undefined && part.gstPercent !== null && part.gstPercent !== '') ? Number(part.gstPercent) : 18;
    
    // Taxable Value = qty * rate - discount
    const taxableValue = Math.round(((qty * rate) - discount) * 100) / 100;
    const amount = taxableValue;
    
    // CGST, SGST, IGST (assume local billing CGST+SGST, since MVSS is local Telangana)
    const cgstPercent = gstPercent / 2;
    const sgstPercent = gstPercent / 2;
    const cgstAmount = Math.round((taxableValue * (cgstPercent / 100)) * 100) / 100;
    const sgstAmount = Math.round((taxableValue * (sgstPercent / 100)) * 100) / 100;
    const igstAmount = 0;
    const gstAmount = cgstAmount + sgstAmount;
    
    const total = taxableValue + gstAmount;

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
    const rate = Number(lab.rate) || 0;
    const discount = Number(lab.discount) || 0;
    const gstPercent = (lab.gstPercent !== undefined && lab.gstPercent !== null && lab.gstPercent !== '') ? Number(lab.gstPercent) : 18;
    
    const taxableValue = Math.round((rate - discount) * 100) / 100;
    const amount = taxableValue;
    
    const cgstPercent = gstPercent / 2;
    const sgstPercent = gstPercent / 2;
    const cgstAmount = Math.round((taxableValue * (cgstPercent / 100)) * 100) / 100;
    const sgstAmount = Math.round((taxableValue * (sgstPercent / 100)) * 100) / 100;
    const igstAmount = 0;
    const gstAmount = cgstAmount + sgstAmount;
    
    const total = taxableValue + gstAmount;

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
    const { status, jobCardId } = req.query;
    let query = {};
    if (status) query.status = status;
    if (jobCardId) query.jobCardId = jobCardId;

    const estimates = await Estimate.find(query)
      .select('estimateNo jobCardId totals status date validUntil amountInWords createdAt')
      .populate({
        path: 'jobCardId',
        populate: [{ path: 'customerId' }, { path: 'vehicleId' }]
      })
      .sort({ createdAt: -1 });

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
router.post('/', auth, restrictTo('Admin', 'Service', 'Accounts', 'Body Shop'), async (req, res) => {
  try {
    const { jobCardId, parts, labour } = req.body;
    
    // Check if Job Card exists
    const jobCard = await JobCard.findById(jobCardId);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

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
    const calculations = recalculateEstimate(parts, labour);

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
    res.status(201).send(estimate);
  } catch (error) {
    res.status(400).send({ error: 'Failed to create estimate: ' + error.message });
  }
});

// Update estimate
router.put('/:id', auth, restrictTo('Admin', 'Service', 'Accounts', 'Body Shop'), async (req, res) => {
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
      const calculations = recalculateEstimate(parts || estimate.parts, labour || estimate.labour);

      // Save a revision copy if modifying a finalized estimate (Sent or Approved)
      if (estimate.status !== 'Draft') {
        const nextVersion = (estimate.revisionHistory?.length || 0) + 1;
        estimate.revisionHistory.push({
          version: nextVersion,
          date: new Date(),
          status: estimate.status,
          totals: estimate.totals,
          parts: estimate.parts,
          labour: estimate.labour,
        });
        
        estimate.status = 'Revised';
      }

      estimate.parts = calculations.parts;
      estimate.labour = calculations.labour;
      estimate.totals = calculations.totals;
      estimate.amountInWords = calculations.amountInWords;
    }

    if (status) {
      estimate.status = status;
      // If approved, sync status back to Job Card
      if (status === 'Approved') {
        await JobCard.findByIdAndUpdate(estimate.jobCardId, { status: 'Work In Progress' });
      }
    }

    await estimate.save();
    await logAction(req.user, 'ESTIMATE_UPDATE', `Updated Estimate ${estimate.estimateNo}. Status: ${estimate.status}`, req);
    res.send(estimate);
  } catch (error) {
    res.status(400).send({ error: 'Failed to update estimate: ' + error.message });
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

// Issue parts to Job Card (Reduce inventory quantity automatically)
router.post('/:id/parts/issue', auth, restrictTo('Admin', 'Spares', 'Service', 'Accounts', 'Body Shop'), async (req, res) => {
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
router.post('/:id/parts/return', auth, restrictTo('Admin', 'Spares', 'Service'), async (req, res) => {
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
router.delete('/:id', auth, restrictTo('Admin'), async (req, res) => {
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
