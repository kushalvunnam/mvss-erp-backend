const express = require('express');
const mongoose = require('mongoose');
const Purchase = require('../models/Purchase');
const Inventory = require('../models/Inventory');
const Vendor = require('../models/Vendor');
const { auth, restrictTo } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Configure storage for Purchase attachments
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'purchase-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

router.use((req, res, next) => {
  console.log(`[PURCHASES] Route request received: ${req.method} ${req.baseUrl}${req.path}`);
  next();
});

const { getNextSequence } = require('../utils/documentNumbering');

// Auto-generate Purchase Entry Number
const generatePurchaseNo = async () => {
  return await getNextSequence('PUR', 'Purchase');
};
router.use(auth, restrictTo('Super Admin', 'Admin', 'Spares', 'Purchase Manager', 'Accounts Manager', 'Accounts', 'Purchase Executive', 'Accounts Executive'));

// Upload attachment
router.post('/upload-attachment', upload.single('attachment'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ error: 'No file uploaded.' });
    }
    const attachmentUrl = `/uploads/${req.file.filename}`;
    const attachmentName = req.file.originalname;
    const attachmentType = req.file.mimetype;
    res.status(200).send({ attachmentUrl, attachmentName, attachmentType });
  } catch (error) {
    res.status(500).send({ error: 'Upload failed: ' + error.message });
  }
});

// List all purchases with search & vendor filter
router.get('/', async (req, res) => {
  try {
    const { search, vendorId, paymentStatus } = req.query;
    let query = {};

    if (vendorId) query.vendorId = vendorId;
    if (paymentStatus) {
      if (paymentStatus === 'Unpaid') {
        query.paymentStatus = 'Credit';
      } else {
        query.paymentStatus = paymentStatus;
      }
    }

    if (search) {
      query.$or = [
        { purchaseNo: { $regex: search, $options: 'i' } },
        { invoiceNo: { $regex: search, $options: 'i' } },
        { vendorName: { $regex: search, $options: 'i' } }
      ];
    }

    const purchases = await Purchase.find(query)
      .populate('vendorId')
      .sort({ createdAt: -1 });

    res.send(purchases);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch purchases.' });
  }
});

// Check duplicate purchase invoice (Vendor + Invoice No)
router.get('/check-duplicate', async (req, res) => {
  try {
    const { vendorId, invoiceNo, excludeId } = req.query;
    if (!vendorId || !invoiceNo) {
      return res.status(400).send({ error: 'Vendor ID and Invoice No are required for check.' });
    }

    const cleanInvoiceNo = String(invoiceNo).trim().replace(/\s+/g, ' ');
    const escapedInvoiceNo = cleanInvoiceNo.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    const query = {
      vendorId: new mongoose.Types.ObjectId(vendorId),
      invoiceNo: { $regex: new RegExp('^' + escapedInvoiceNo + '$', 'i') }
    };

    if (excludeId && excludeId !== 'null' && excludeId !== 'undefined') {
      query._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    }

    const exists = await Purchase.findOne(query);
    if (exists) {
      return res.status(409).send({ error: 'Invoice No. already exists for this vendor.' });
    }

    return res.status(200).send({ available: true });
  } catch (error) {
    console.error('[DUPLICATE CHECK ERROR]', error);
    res.status(500).send({ error: 'Failed to perform duplicate check.' });
  }
});

// Create Purchase Entry (Restocks Inventory & Updates Vendor Balances)
router.post('/', async (req, res) => {
  try {
    const { vendorId, invoiceNo, invoiceDate, items, paymentStatus, amountPaid, notes, updatePurchasePrice = true, updateMRP = true } = req.body;
    if (!vendorId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).send({ error: 'Vendor ID and at least one purchase item are required.' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).send({ error: 'Vendor not found.' });

    // Check duplicate using Vendor + Invoice No (ignoring case and extra spaces)
    if (invoiceNo && String(invoiceNo).trim()) {
      const cleanInvoiceNo = String(invoiceNo).trim().replace(/\s+/g, ' ');
      const escapedInvoiceNo = cleanInvoiceNo.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const duplicateExists = await Purchase.findOne({
        vendorId: vendor._id,
        invoiceNo: { $regex: new RegExp('^' + escapedInvoiceNo + '$', 'i') }
      });

      if (duplicateExists) {
        return res.status(409).send({ error: 'Invoice No. already exists for this vendor.' });
      }
    }

    const purchaseNo = await generatePurchaseNo();
    const roundToTwo = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

    let totalQtySum = 0;
    let subtotalSum = 0;
    let totalDiscountSum = 0;
    let taxableAmountSum = 0;
    let gstTotalSum = 0;
    let cgstTotalSum = 0;
    let sgstTotalSum = 0;
    let igstTotalSum = 0;
    let grandTotalSum = 0;

    const processedItems = [];

    for (const item of items) {
      if (item.mrp !== undefined && Number(item.mrp) < 0) {
        return res.status(400).send({ error: `MRP cannot be negative for part ${item.partName || ''}.` });
      }

      const qty = Math.max(1, Number(item.qty) || 1);
      const purchasePrice = Math.max(0, Number(item.purchasePrice) || 0);
      const sellingPrice = Math.max(0, Number(item.sellingPrice) || purchasePrice);
      const mrp = Math.max(0, Number(item.mrp) || sellingPrice);
      
      const grossItemValue = roundToTwo(qty * purchasePrice);
      
      const discountType = item.discountType || 'Percent';
      const discountValue = Number(item.discountValue) || 0;

      let discountAmount = 0;
      if (discountType === 'Percent') {
        discountAmount = roundToTwo((grossItemValue * discountValue) / 100);
      } else {
        discountAmount = roundToTwo(discountValue);
      }
      discountAmount = Math.max(0, Math.min(grossItemValue, discountAmount));
      
      const discountPercent = discountType === 'Percent' ? discountValue : (grossItemValue > 0 ? roundToTwo((discountAmount / grossItemValue) * 100) : 0);

      const isInterstate = req.body.billingType 
        ? req.body.billingType === 'Inter-State'
        : (vendor.gstNumber 
            ? !vendor.gstNumber.trim().startsWith('36') 
            : false);

      const itemTaxable = Math.max(0, roundToTwo(grossItemValue - discountAmount));
      const gstPercent = Number(item.gstPercent) !== undefined ? Number(item.gstPercent) : 18;
      const igstPercent = (isInterstate && item.igstPercent !== undefined && item.igstPercent !== null)
        ? Number(item.igstPercent) 
        : gstPercent;

      const itemGst = isInterstate 
        ? roundToTwo(itemTaxable * (igstPercent / 100))
        : roundToTwo(itemTaxable * (gstPercent / 100));
      const itemTotal = roundToTwo(itemTaxable + itemGst);

      const cgst = isInterstate ? 0 : roundToTwo(itemGst / 2);
      const sgst = isInterstate ? 0 : roundToTwo(itemGst / 2);
      const igst = isInterstate ? itemGst : 0;

      totalQtySum += qty;
      subtotalSum += grossItemValue;
      totalDiscountSum += discountAmount;
      taxableAmountSum += itemTaxable;
      gstTotalSum += itemGst;
      cgstTotalSum += cgst;
      sgstTotalSum += sgst;
      igstTotalSum += igst;

      let partId = item.partId;
      let inventoryItem = null;

      if (partId) {
        inventoryItem = await Inventory.findById(partId);
      }
      if (!inventoryItem && item.partNumber) {
        inventoryItem = await Inventory.findOne({ partNumber: item.partNumber.trim() });
      }

      if (inventoryItem) {
        inventoryItem.stockQuantity += qty;
        if (updatePurchasePrice) {
          inventoryItem.purchasePrice = purchasePrice;
        }
        if (sellingPrice > 0) inventoryItem.sellingPrice = sellingPrice;
        if (mrp > 0) {
          inventoryItem.mrp = mrp;
        }
        inventoryItem.vendorId = vendor._id;
        inventoryItem.vendorName = vendor.name;
        inventoryItem.supplier = vendor.name;
        if (gstPercent !== undefined) inventoryItem.gstPercent = gstPercent;
        
        // Update Parts Master fields from Purchase Entry if provided
        if (item.brand && item.brand.trim()) inventoryItem.brand = item.brand.trim();
        if (item.compatibility && item.compatibility.trim()) inventoryItem.vehicleCompatibility = item.compatibility.trim();
        if (item.oemBrand && item.oemBrand.trim()) inventoryItem.oemBrand = item.oemBrand.trim();
        if (item.warranty && item.warranty.trim()) inventoryItem.warranty = item.warranty.trim();
        if (item.rackLocation && item.rackLocation.trim()) inventoryItem.locationRack = item.rackLocation.trim();
        
        await inventoryItem.save();
        partId = inventoryItem._id;
      } else {
        inventoryItem = new Inventory({
          partName: item.partName || 'Unknown Part',
          partNumber: item.partNumber || `PN-${Date.now()}`,
          hsnCode: item.hsnCode || '8708',
          stockQuantity: qty,
          purchasePrice,
          sellingPrice: sellingPrice || purchasePrice,
          mrp: mrp || sellingPrice || purchasePrice,
          gstPercent,
          vendorId: vendor._id,
          vendorName: vendor.name,
          warehouse: item.warehouse || 'Main Store',
          // Set Parts Master fields from Purchase Entry
          brand: item.brand || '',
          supplier: vendor.name,
          vehicleCompatibility: item.compatibility || '',
          oemBrand: item.oemBrand || '',
          warranty: item.warranty || '',
          locationRack: item.rackLocation || ''
        });
        await inventoryItem.save();
        partId = inventoryItem._id;
      }

      processedItems.push({
        partId,
        partNumber: inventoryItem.partNumber,
        partName: inventoryItem.partName,
        hsnCode: item.hsnCode || inventoryItem.hsnCode || '8708',
        warehouse: item.warehouse || inventoryItem.warehouse || 'Main Store',
        qty,
        purchasePrice,
        sellingPrice,
        mrp,
        discountType,
        discountValue,
        discountPercent,
        discountAmount,
        gstPercent,
        taxableAmount: itemTaxable,
        gstAmount: itemGst,
        cgst,
        sgst,
        igst,
        rackLocation: item.rackLocation || '',
        total: itemTotal
      });
    }

    const targetGrandTotal = taxableAmountSum + gstTotalSum;
    const grandTotalRounded = Math.round(targetGrandTotal);
    const roundOff = roundToTwo(grandTotalRounded - targetGrandTotal);

    const paidAmt = Number(amountPaid) || 0;
    let rawStatus = paymentStatus || (paidAmt >= grandTotalRounded ? 'Paid' : (paidAmt > 0 ? 'Partially Paid' : 'Credit'));
    if (rawStatus === 'Unpaid') rawStatus = 'Credit';

    const purchase = new Purchase({
      purchaseNo,
      vendorId: vendor._id,
      vendorName: vendor.name,
      date: new Date(),
      invoiceNo: invoiceNo ? String(invoiceNo).trim().replace(/\s+/g, ' ') : '',
      invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
      items: processedItems,
      totals: {
        totalQty: totalQtySum,
        subtotal: roundToTwo(subtotalSum),
        totalDiscount: roundToTwo(totalDiscountSum),
        taxableAmount: roundToTwo(taxableAmountSum),
        gstTotal: roundToTwo(gstTotalSum),
        cgstTotal: roundToTwo(cgstTotalSum),
        sgstTotal: roundToTwo(sgstTotalSum),
        igstTotal: roundToTwo(igstTotalSum),
        roundOff: roundOff,
        grandTotal: grandTotalRounded
      },
      paymentStatus: rawStatus,
      amountPaid: paidAmt,
      notes: notes || '',
      createdBy: req.user ? req.user.name : 'Staff',
      attachmentUrl: req.body.attachmentUrl || (req.body.attachments && req.body.attachments.length > 0 ? req.body.attachments[0].url : ''),
      attachmentName: req.body.attachmentName || (req.body.attachments && req.body.attachments.length > 0 ? req.body.attachments[0].name : ''),
      attachmentType: req.body.attachmentType || (req.body.attachments && req.body.attachments.length > 0 ? req.body.attachments[0].type : ''),
      attachments: req.body.attachments || []
    });

    await purchase.save();

    // Update Vendor Purchase Statistics & Outstanding Balance
    vendor.totalPurchaseValue = roundToTwo((vendor.totalPurchaseValue || 0) + grandTotalRounded);
    vendor.totalPaidAmount = roundToTwo((vendor.totalPaidAmount || 0) + paidAmt);
    vendor.outstandingBalance = Math.max(0, roundToTwo(vendor.totalPurchaseValue - vendor.totalPaidAmount));
    await vendor.save();

    await logAction(req.user, 'PURCHASE_CREATE', `Created purchase entry ${purchase.purchaseNo} with ${processedItems.length} parts from Vendor ${vendor.name}`, req);
    res.status(201).send(purchase);
  } catch (error) {
    res.status(400).send({ error: 'Failed to record purchase entry: ' + error.message });
  }
});

// Update Vendor Payment for Purchase Entry
router.put('/:id/payment', async (req, res) => {
  try {
    let { amountPaid, paymentStatus } = req.body;
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).send({ error: 'Purchase entry not found.' });

    const vendor = await Vendor.findById(purchase.vendorId);
    
    const newPaid = Number(amountPaid) || 0;
    const diff = newPaid - purchase.amountPaid;

    if (paymentStatus === 'Unpaid') paymentStatus = 'Credit';

    purchase.amountPaid = newPaid;
    purchase.paymentStatus = paymentStatus || (newPaid >= purchase.totals.grandTotal ? 'Paid' : (newPaid > 0 ? 'Partially Paid' : 'Credit'));
    await purchase.save();

    if (vendor) {
      vendor.totalPaidAmount = Math.max(0, (vendor.totalPaidAmount || 0) + diff);
      vendor.outstandingBalance = Math.max(0, vendor.totalPurchaseValue - vendor.totalPaidAmount);
      await vendor.save();
    }

    await logAction(req.user, 'PURCHASE_PAYMENT_UPDATE', `Updated payment for purchase entry ${purchase.purchaseNo}: Amount Paid ₹${newPaid}, Status: ${purchase.paymentStatus}`, req);
    res.send(purchase);
  } catch (error) {
    res.status(400).send({ error: 'Failed to update purchase payment: ' + error.message });
  }
});

// Check if items in purchase are in use in other transactions
router.get('/:id/check-in-use', async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).send({ error: 'Purchase entry not found.' });

    const Invoice = require('../models/Invoice');
    const Estimate = require('../models/Estimate');
    const JobCard = require('../models/JobCard');
    const StockAdjustment = require('../models/StockAdjustment');

    let warnings = [];
    for (const item of purchase.items) {
      const queries = [];
      if (item.partId) {
        queries.push({ 'parts.partId': item.partId });
      }
      queries.push({ 'parts.partNo': item.partNumber });

      const usedInEstimate = await Estimate.findOne({ $or: queries });
      const usedInInvoice = await Invoice.findOne({ $or: queries });
      const usedInJobCard = await JobCard.findOne({ $or: queries });
      const usedInAdjustment = await StockAdjustment.findOne({
        $or: [
          ...(item.partId ? [{ partId: item.partId }] : []),
          { partNumber: item.partNumber }
        ]
      });

      if (usedInEstimate || usedInInvoice || usedInJobCard || usedInAdjustment) {
        let usages = [];
        if (usedInEstimate) usages.push('Estimates');
        if (usedInInvoice) usages.push('Invoices');
        if (usedInJobCard) usages.push('Job Cards');
        if (usedInAdjustment) usages.push('Stock Adjustments');

        warnings.push({
          partNumber: item.partNumber,
          partName: item.partName,
          usages
        });
      }
    }

    res.send({ isInUse: warnings.length > 0, warnings });
  } catch (error) {
    res.status(500).send({ error: 'Failed to check in-use status: ' + error.message });
  }
});

// Edit Purchase Entry
router.put('/:id', async (req, res) => {
  try {
    const editAuthorized = ['Super Admin', 'Admin', 'Purchase Manager', 'Accounts Manager', 'Spares', 'Accounts', 'Purchase Executive', 'Accounts Executive'].includes(req.user?.role);
    if (!editAuthorized) {
      return res.status(403).send({ error: 'You are not authorized to edit purchases.' });
    }

    const { vendorId, invoiceNo, invoiceDate, items, paymentStatus, amountPaid, notes, reason } = req.body;
    if (!vendorId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).send({ error: 'Vendor ID and at least one purchase item are required.' });
    }

    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).send({ error: 'Purchase entry not found.' });

    const oldVendor = await Vendor.findById(purchase.vendorId);
    const newVendor = await Vendor.findById(vendorId);
    if (!newVendor) return res.status(404).send({ error: 'New Vendor not found.' });

    // Check duplicate using Vendor + Invoice No (excluding current ID, ignoring case and extra spaces)
    if (invoiceNo && String(invoiceNo).trim()) {
      const cleanInvoiceNo = String(invoiceNo).trim().replace(/\s+/g, ' ');
      const escapedInvoiceNo = cleanInvoiceNo.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const duplicateExists = await Purchase.findOne({
        _id: { $ne: req.params.id },
        vendorId: newVendor._id,
        invoiceNo: { $regex: new RegExp('^' + escapedInvoiceNo + '$', 'i') }
      });

      if (duplicateExists) {
        return res.status(409).send({ error: 'Invoice No. already exists for this vendor.' });
      }
    }

    // Save old values for audit logging
    const oldValues = {
      vendorId: purchase.vendorId,
      vendorName: purchase.vendorName,
      invoiceNo: purchase.invoiceNo,
      invoiceDate: purchase.invoiceDate,
      items: purchase.items.map(item => ({
        partId: item.partId,
        partNumber: item.partNumber,
        partName: item.partName,
        qty: item.qty,
        purchasePrice: item.purchasePrice,
        total: item.total
      })),
      totals: { ...purchase.totals },
      paymentStatus: purchase.paymentStatus,
      amountPaid: purchase.amountPaid
    };

    const roundToTwo = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

    // 1. Revert inventory quantities of the old items
    for (const oldItem of purchase.items) {
      if (oldItem.partId) {
        const invItem = await Inventory.findById(oldItem.partId);
        if (invItem) {
          invItem.stockQuantity = Math.max(0, invItem.stockQuantity - oldItem.qty);
          await invItem.save();
        }
      }
    }

    // 2. Revert old vendor totals
    if (oldVendor) {
      oldVendor.totalPurchaseValue = roundToTwo(Math.max(0, (oldVendor.totalPurchaseValue || 0) - purchase.totals.grandTotal));
      oldVendor.totalPaidAmount = roundToTwo(Math.max(0, (oldVendor.totalPaidAmount || 0) - purchase.amountPaid));
      oldVendor.outstandingBalance = roundToTwo(Math.max(0, oldVendor.totalPurchaseValue - oldVendor.totalPaidAmount));
      await oldVendor.save();
    }

    // 3. Process new/edited items
    let totalQtySum = 0;
    let subtotalSum = 0;
    let totalDiscountSum = 0;
    let taxableAmountSum = 0;
    let gstTotalSum = 0;
    let cgstTotalSum = 0;
    let sgstTotalSum = 0;
    let igstTotalSum = 0;
    let grandTotalSum = 0;

    const processedItems = [];

    for (const item of items) {
      if (item.mrp !== undefined && Number(item.mrp) < 0) {
        return res.status(400).send({ error: `MRP cannot be negative for part ${item.partName || ''}.` });
      }

      const qty = Math.max(1, Number(item.qty) || 1);
      const purchasePrice = Math.max(0, Number(item.purchasePrice) || 0);
      const sellingPrice = Math.max(0, Number(item.sellingPrice) || purchasePrice);
      const mrp = Math.max(0, Number(item.mrp) || sellingPrice);
      
      const grossItemValue = roundToTwo(qty * purchasePrice);
      
      const discountType = item.discountType || 'Percent';
      const discountValue = Number(item.discountValue) || 0;

      let discountAmount = 0;
      if (discountType === 'Percent') {
        discountAmount = roundToTwo((grossItemValue * discountValue) / 100);
      } else {
        discountAmount = roundToTwo(discountValue);
      }
      discountAmount = Math.max(0, Math.min(grossItemValue, discountAmount));
      
      const discountPercent = discountType === 'Percent' ? discountValue : (grossItemValue > 0 ? roundToTwo((discountAmount / grossItemValue) * 100) : 0);

      const isInterstate = req.body.billingType 
        ? req.body.billingType === 'Inter-State'
        : (newVendor.gstNumber 
            ? !newVendor.gstNumber.trim().startsWith('36') 
            : false);

      const itemTaxable = Math.max(0, roundToTwo(grossItemValue - discountAmount));
      const gstPercent = Number(item.gstPercent) !== undefined ? Number(item.gstPercent) : 18;
      const igstPercent = (isInterstate && item.igstPercent !== undefined && item.igstPercent !== null)
        ? Number(item.igstPercent) 
        : gstPercent;

      const itemGst = isInterstate 
        ? roundToTwo(itemTaxable * (igstPercent / 100))
        : roundToTwo(itemTaxable * (gstPercent / 100));
      const itemTotal = roundToTwo(itemTaxable + itemGst);

      const cgst = isInterstate ? 0 : roundToTwo(itemGst / 2);
      const sgst = isInterstate ? 0 : roundToTwo(itemGst / 2);
      const igst = isInterstate ? itemGst : 0;

      totalQtySum += qty;
      subtotalSum += grossItemValue;
      totalDiscountSum += discountAmount;
      taxableAmountSum += itemTaxable;
      gstTotalSum += itemGst;
      cgstTotalSum += cgst;
      sgstTotalSum += sgst;
      igstTotalSum += igst;

      let partId = item.partId;
      let inventoryItem = null;

      if (partId) {
        inventoryItem = await Inventory.findById(partId);
      }
      if (!inventoryItem && item.partNumber) {
        inventoryItem = await Inventory.findOne({ partNumber: item.partNumber.trim() });
      }

      if (inventoryItem) {
        inventoryItem.stockQuantity += qty;
        inventoryItem.purchasePrice = purchasePrice;
        if (sellingPrice > 0) inventoryItem.sellingPrice = sellingPrice;
        if (mrp > 0) inventoryItem.mrp = mrp;
        inventoryItem.vendorId = newVendor._id;
        inventoryItem.vendorName = newVendor.name;
        inventoryItem.supplier = newVendor.name;
        if (item.brand && item.brand.trim()) inventoryItem.brand = item.brand.trim();
        if (item.compatibility && item.compatibility.trim()) inventoryItem.vehicleCompatibility = item.compatibility.trim();
        if (item.oemBrand && item.oemBrand.trim()) inventoryItem.oemBrand = item.oemBrand.trim();
        if (item.warranty && item.warranty.trim()) inventoryItem.warranty = item.warranty.trim();
        if (gstPercent !== undefined) inventoryItem.gstPercent = gstPercent;
        if (item.warehouse) inventoryItem.warehouse = item.warehouse;
        if (item.rackLocation && item.rackLocation.trim()) inventoryItem.locationRack = item.rackLocation.trim();
        await inventoryItem.save();
        partId = inventoryItem._id;
      } else {
        inventoryItem = new Inventory({
          partName: item.partName || 'Unknown Part',
          partNumber: item.partNumber || `PN-${Date.now()}`,
          hsnCode: item.hsnCode || '8708',
          stockQuantity: qty,
          purchasePrice,
          sellingPrice: sellingPrice || purchasePrice,
          mrp: mrp || sellingPrice || purchasePrice,
          gstPercent,
          vendorId: newVendor._id,
          vendorName: newVendor.name,
          supplier: newVendor.name,
          warehouse: item.warehouse || 'Main Store',
          brand: item.brand || '',
          vehicleCompatibility: item.compatibility || '',
          oemBrand: item.oemBrand || '',
          warranty: item.warranty || '',
          locationRack: item.rackLocation || ''
        });
        await inventoryItem.save();
        partId = inventoryItem._id;
      }

      processedItems.push({
        partId,
        partNumber: inventoryItem.partNumber,
        partName: inventoryItem.partName,
        hsnCode: item.hsnCode || inventoryItem.hsnCode || '8708',
        warehouse: item.warehouse || inventoryItem.warehouse || 'Main Store',
        rackLocation: item.rackLocation || inventoryItem.rackLocation || '',
        qty,
        purchasePrice,
        sellingPrice,
        mrp,
        discountType,
        discountValue,
        discountPercent,
        discountAmount,
        gstPercent,
        taxableAmount: itemTaxable,
        gstAmount: itemGst,
        cgst,
        sgst,
        igst,
        total: itemTotal
      });
    }

    const targetGrandTotal = taxableAmountSum + gstTotalSum;
    const grandTotalRounded = Math.round(targetGrandTotal);
    const roundOff = roundToTwo(grandTotalRounded - targetGrandTotal);

    const paidAmt = Number(amountPaid) || 0;
    let rawStatus = paymentStatus || (paidAmt >= grandTotalRounded ? 'Paid' : (paidAmt > 0 ? 'Partially Paid' : 'Credit'));
    if (rawStatus === 'Unpaid') rawStatus = 'Credit';

    // 4. Update purchase record fields
    purchase.vendorId = newVendor._id;
    purchase.vendorName = newVendor.name;
    purchase.invoiceNo = invoiceNo ? String(invoiceNo).trim().replace(/\s+/g, ' ') : '';
    purchase.invoiceDate = invoiceDate ? new Date(invoiceDate) : new Date();
    purchase.items = processedItems;
    purchase.totals = {
      totalQty: totalQtySum,
      subtotal: roundToTwo(subtotalSum),
      totalDiscount: roundToTwo(totalDiscountSum),
      taxableAmount: roundToTwo(taxableAmountSum),
      gstTotal: roundToTwo(gstTotalSum),
      cgstTotal: roundToTwo(cgstTotalSum),
      sgstTotal: roundToTwo(sgstTotalSum),
      igstTotal: roundToTwo(igstTotalSum),
      roundOff: roundOff,
      grandTotal: grandTotalRounded
    };
    purchase.paymentStatus = rawStatus;
    purchase.amountPaid = paidAmt;
    purchase.notes = notes || '';
    purchase.updatedBy = req.user ? req.user.name : 'Staff';
    if (req.body.attachments !== undefined) {
      purchase.attachments = req.body.attachments;
      purchase.attachmentUrl = req.body.attachments.length > 0 ? req.body.attachments[0].url : '';
      purchase.attachmentName = req.body.attachments.length > 0 ? req.body.attachments[0].name : '';
      purchase.attachmentType = req.body.attachments.length > 0 ? req.body.attachments[0].type : '';
    } else {
      if (req.body.attachmentUrl !== undefined) purchase.attachmentUrl = req.body.attachmentUrl;
      if (req.body.attachmentName !== undefined) purchase.attachmentName = req.body.attachmentName;
      if (req.body.attachmentType !== undefined) purchase.attachmentType = req.body.attachmentType;
    }

    await purchase.save();

    // 5. Update New Vendor totals
    newVendor.totalPurchaseValue = roundToTwo((newVendor.totalPurchaseValue || 0) + grandTotalRounded);
    newVendor.totalPaidAmount = roundToTwo((newVendor.totalPaidAmount || 0) + paidAmt);
    newVendor.outstandingBalance = roundToTwo(Math.max(0, newVendor.totalPurchaseValue - newVendor.totalPaidAmount));
    await newVendor.save();

    const newValues = {
      vendorId: purchase.vendorId,
      vendorName: purchase.vendorName,
      invoiceNo: purchase.invoiceNo,
      invoiceDate: purchase.invoiceDate,
      items: purchase.items.map(item => ({
        partId: item.partId,
        partNumber: item.partNumber,
        partName: item.partName,
        qty: item.qty,
        purchasePrice: item.purchasePrice,
        total: item.total
      })),
      totals: { ...purchase.totals },
      paymentStatus: purchase.paymentStatus,
      amountPaid: purchase.amountPaid
    };

    await logAction(
      req.user,
      'PURCHASE_EDIT',
      `Edited purchase entry ${purchase.purchaseNo}. Reason: ${reason || 'None'}. Old Grand Total: ₹${oldValues.totals.grandTotal}, New Grand Total: ₹${purchase.totals.grandTotal}`,
      req,
      { oldValues, newValues }
    );

    res.send(purchase);
  } catch (error) {
    res.status(400).send({ error: 'Failed to edit purchase entry: ' + error.message });
  }
});

module.exports = router;
