const express = require('express');
const Inventory = require('../models/Inventory');
const Vendor = require('../models/Vendor');
const Purchase = require('../models/Purchase');
const StockAdjustment = require('../models/StockAdjustment');
const Invoice = require('../models/Invoice');
const JobCard = require('../models/JobCard');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const PDFDocument = require('pdfkit');
const { roundToTwo } = require('../services/financialCalculationService');
const { auth, restrictTo } = require('../middleware/auth');
const router = express.Router();

router.use((req, res, next) => {
  console.log(`[REPORTS] Route request received: ${req.method} ${req.baseUrl}${req.path}`);
  next();
});

router.use(auth, restrictTo('Super Admin', 'Admin', 'Service', 'Spares', 'Body Shop', 'Accounts', 'Accounts Executive', 'Billing', 'Billing Executive'));

// 1. Stock Valuation & Statement Report
router.get('/stock-statement', auth, async (req, res) => {
  try {
    const { warehouse, brand, category, movementSpeed, stockAlert, search } = req.query;
    let query = {};

    if (warehouse) query.warehouse = warehouse;
    if (brand) query.brand = brand;
    if (category) query.category = category;
    if (movementSpeed) query.movementSpeed = movementSpeed;

    if (search) {
      query.$or = [
        { partName: { $regex: search, $options: 'i' } },
        { partNumber: { $regex: search, $options: 'i' } },
        { partCode: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } },
        { hsnCode: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { locationRack: { $regex: search, $options: 'i' } },
        { warehouse: { $regex: search, $options: 'i' } }
      ];
    }

    let items = await Inventory.find(query).sort({ partName: 1 });

    if (stockAlert === 'low') {
      items = items.filter(i => i.stockQuantity <= i.lowStockThreshold && i.stockQuantity > 0);
    } else if (stockAlert === 'out') {
      items = items.filter(i => i.stockQuantity === 0);
    } else if (stockAlert === 'negative') {
      items = items.filter(i => i.stockQuantity < 0);
    }

    // Compute valuation statistics
    const roundToTwo = num => Math.round((num + Number.EPSILON) * 100) / 100;
    let totalItemsCount = items.length;
    let totalStockQty = 0;
    let totalPurchaseValuation = 0;
    let totalSellingValuation = 0;
    let totalMrpValuation = 0;

    const statementData = items.map(item => {
      const qty = item.stockQuantity || 0;
      const purchaseVal = roundToTwo(qty * (item.purchasePrice || 0));
      const sellingVal = roundToTwo(qty * (item.sellingPrice || 0));
      const mrpVal = roundToTwo(qty * (item.mrp || item.sellingPrice || 0));

      totalStockQty += qty;
      totalPurchaseValuation += purchaseVal;
      totalSellingValuation += sellingVal;
      totalMrpValuation += mrpVal;

      return {
        _id: item._id,
        partCode: item.partCode || item.partNumber,
        partNumber: item.partNumber,
        barcode: item.barcode || 'N/A',
        partName: item.partName,
        type: item.type || 'Part',
        brand: item.brand || 'N/A',
        category: item.category || 'General',
        hsnCode: item.hsnCode || '8708',
        gstPercent: item.gstPercent || 18,
        purchasePrice: item.purchasePrice || 0,
        sellingPrice: item.sellingPrice || 0,
        mrp: item.mrp || item.sellingPrice || 0,
        marginPercent: item.marginPercent || 0,
        warehouse: item.warehouse || 'Main Store',
        locationRack: item.locationRack || 'A1',
        currentStock: qty,
        reservedStock: item.reservedStock || 0,
        availableStock: Math.max(0, qty - (item.reservedStock || 0)),
        minimumStock: item.minimumStock || item.lowStockThreshold || 5,
        maximumStock: item.maxStock || 100,
        reorderLevel: item.reorderLevel || 5,
        unit: item.unit || 'Pcs',
        vendorName: item.vendorName || item.supplier || 'N/A',
        stockValue: purchaseVal,
        sellingValue: sellingVal,
        status: item.status || (qty === 0 ? 'Out of Stock' : 'Active')
      };
    });

    res.send({
      summary: {
        totalItemsCount,
        totalStockQty,
        totalPurchaseValuation: roundToTwo(totalPurchaseValuation),
        totalSellingValuation: roundToTwo(totalSellingValuation),
        totalMrpValuation: roundToTwo(totalMrpValuation)
      },
      items: statementData
    });
  } catch (error) {
    res.status(500).send({ error: 'Failed to generate stock statement report: ' + error.message });
  }
});

// 2. Vendor Summary & Ledger Report
router.get('/vendor-ledger', auth, async (req, res) => {
  try {
    const vendors = await Vendor.find().sort({ name: 1 });
    const purchases = await Purchase.find().select('vendorId').sort({ createdAt: -1 });

    const vendorReport = vendors.map(v => {
      const vPurchases = purchases.filter(p => p.vendorId && p.vendorId.toString() === v._id.toString());
      return {
        _id: v._id,
        vendorCode: v.vendorCode,
        name: v.name,
        category: v.category,
        type: v.type,
        contactPerson: v.contactPerson,
        mobile: v.mobile,
        email: v.email,
        gstNumber: v.gstNumber,
        paymentTerms: v.paymentTerms,
        purchaseCount: vPurchases.length,
        totalPurchaseValue: v.totalPurchaseValue || 0,
        totalPaidAmount: v.totalPaidAmount || 0,
        outstandingBalance: v.outstandingBalance || 0,
        status: v.status
      };
    });

    res.send(vendorReport);
  } catch (error) {
    res.status(500).send({ error: 'Failed to generate vendor ledger report.' });
  }
});

// 3. Inventory Movement & Adjustment Report
router.get('/inventory-movement', auth, async (req, res) => {
  try {
    const adjustments = await StockAdjustment.find().sort({ createdAt: -1 }).limit(100);
    const invoices = await Invoice.find().select('parts createdAt date invoiceNo paymentStatus preparedBy status').sort({ createdAt: -1 }).limit(50);

    const movementLogs = [];

    adjustments.forEach(adj => {
      movementLogs.push({
        date: adj.createdAt || adj.date,
        type: 'ADJUSTMENT',
        reference: adj.adjustmentNo,
        partName: adj.partName,
        partNumber: adj.partNumber,
        qty: adj.type.includes('Increase') || adj.type.includes('Returned') ? `+${adj.qty}` : `-${adj.qty}`,
        reason: `${adj.type} (${adj.reason})`,
        createdBy: adj.createdBy,
        status: adj.status
      });
    });

    invoices.forEach(inv => {
      if (inv.parts && Array.isArray(inv.parts)) {
        inv.parts.forEach(p => {
          movementLogs.push({
            date: inv.createdAt || inv.date,
            type: 'SALE',
            reference: inv.invoiceNo,
            partName: p.name,
            partNumber: p.partNo || 'N/A',
            qty: `-${p.qty}`,
            reason: `Invoice Billed (${inv.paymentStatus})`,
            createdBy: inv.preparedBy || 'Billing',
            status: inv.status
          });
        });
      }
    });

    // Sort by date descending
    movementLogs.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.send(movementLogs.slice(0, 100));
  } catch (error) {
    res.status(500).send({ error: 'Failed to generate inventory movement report.' });
  }
});

// 4. Purchase History Report
router.get('/purchase-history', auth, async (req, res) => {
  try {
    const { fromDate, toDate, vendorId, partName, category, search } = req.query;
    const roundToTwo = num => Math.round(((num || 0) + Number.EPSILON) * 100) / 100;

    // 1. Fetch Purchase entries from dedicated Purchase collection
    let dbPurchases = [];
    try {
      const pQuery = {};
      if (vendorId) {
        pQuery.vendorId = vendorId;
      }
      if (fromDate || toDate) {
        pQuery.date = {};
        if (fromDate) pQuery.date.$gte = new Date(fromDate);
        if (toDate) pQuery.date.$lte = new Date(toDate);
      }
      dbPurchases = await Purchase.find(pQuery)
        .populate('items.partId')
        .sort({ date: -1, createdAt: -1 });
    } catch (err) {
      console.error('Error fetching Purchase collection:', err);
    }

    const itemsList = [];
    const trackedPartIds = new Set();

    // Process Purchase collection items
    for (const p of dbPurchases) {
      if (p.items && Array.isArray(p.items)) {
        for (const item of p.items) {
          const invItem = item.partId || {};
          const pName = item.partName || invItem.partName || '';
          const pNum = item.partNumber || invItem.partNumber || '';
          const pCat = invItem.category || 'General Spares';
          const pWarehouse = item.warehouse || invItem.warehouse || 'Main Store';
          const pRack = invItem.locationRack || '';
          const pDate = p.invoiceDate || p.date || p.createdAt || new Date();

          if (item.partId && item.partId._id) {
            trackedPartIds.add(item.partId._id.toString());
          }

          itemsList.push({
            _id: `${p._id}_${item._id || item.partNumber || Math.random()}`,
            purchaseId: p._id,
            purchaseNo: p.purchaseNo,
            invoiceNo: p.invoiceNo || p.purchaseNo,
            purchaseDate: pDate,
            createdAt: p.createdAt || pDate,
            vendorId: p.vendorId,
            vendorName: p.vendorName || 'General Supplier',
            partId: item.partId ? item.partId._id : null,
            partName: pName,
            partNumber: pNum,
            category: pCat,
            hsnCode: item.hsnCode || invItem.hsnCode || '8708',
            qty: Number(item.qty) || 0,
            purchasePrice: Number(item.purchasePrice) || 0,
            mrp: Number(item.mrp) || Number(invItem.mrp) || 0,
            gstPercent: item.gstPercent || 18,
            gstAmount: Number(item.gstAmount) || roundToTwo((Number(item.qty) || 0) * (Number(item.purchasePrice) || 0) * ((item.gstPercent || 18) / 100)),
            total: Number(item.total) || roundToTwo((Number(item.qty) || 0) * (Number(item.purchasePrice) || 0) * (1 + ((item.gstPercent || 18) / 100))),
            warehouse: pWarehouse,
            locationRack: pRack,
            paymentStatus: p.paymentStatus || 'Paid',
            createdBy: p.createdBy || 'System'
          });
        }
      }
    }

    // 2. Fetch Inventory items with stock to include existing parts procurement entries
    const inventoryItems = await Inventory.find({ type: { $ne: 'Labour' } }).sort({ createdAt: -1 });

    for (const inv of inventoryItems) {
      if ((inv.stockQuantity > 0 || inv.purchasePrice > 0) && !trackedPartIds.has(inv._id.toString())) {
        const qty = inv.stockQuantity || 1;
        const price = inv.purchasePrice || 0;
        const gstPct = inv.gstPercent || 18;
        const taxable = roundToTwo(qty * price);
        const gstAmt = roundToTwo(taxable * (gstPct / 100));
        const totalAmt = roundToTwo(taxable + gstAmt);
        const pDate = inv.createdAt || inv.updatedAt || new Date();

        itemsList.push({
          _id: `INV_${inv._id}`,
          purchaseId: inv._id,
          purchaseNo: `PUR-INV-${inv._id.toString().slice(-6).toUpperCase()}`,
          invoiceNo: `BILL-${inv.partNumber || inv._id.toString().slice(-6).toUpperCase()}`,
          purchaseDate: pDate,
          createdAt: pDate,
          vendorId: inv.vendorId || inv._id,
          vendorName: inv.vendorName || inv.supplier || (inv.brand ? `${inv.brand} Distributor` : 'General Supplier'),
          partId: inv._id,
          partName: inv.partName,
          partNumber: inv.partNumber,
          category: inv.category || 'General Spares',
          hsnCode: inv.hsnCode || '8708',
          qty,
          purchasePrice: price,
          mrp: Number(inv.mrp) || 0,
          gstPercent: gstPct,
          gstAmount: gstAmt,
          total: totalAmt,
          warehouse: inv.warehouse || 'Main Store',
          locationRack: inv.locationRack || '',
          paymentStatus: 'Paid',
          createdBy: 'System Stock'
        });
      }
    }

    // 3. Apply memory filtering for From Date, To Date, Vendor, Part Name, Category, Search
    let filteredList = itemsList.filter(item => {
      // Date filter (compares against purchaseDate)
      if (fromDate || toDate) {
        const itemDate = new Date(item.purchaseDate);
        if (fromDate) {
          const start = new Date(fromDate);
          start.setHours(0, 0, 0, 0);
          if (itemDate < start) return false;
        }
        if (toDate) {
          const end = new Date(toDate);
          end.setHours(23, 59, 59, 999);
          if (itemDate > end) return false;
        }
      }

      // Vendor filter
      if (vendorId) {
        const vLower = vendorId.toLowerCase();
        const vMatch = (item.vendorId && item.vendorId.toString().toLowerCase() === vLower) ||
                       (item.vendorName && item.vendorName.toLowerCase().includes(vLower));
        if (!vMatch) return false;
      }

      // Part Name / Part Number filter
      if (partName) {
        const pLower = partName.toLowerCase();
        const pMatch = (item.partName && item.partName.toLowerCase().includes(pLower)) ||
                       (item.partNumber && item.partNumber.toLowerCase().includes(pLower));
        if (!pMatch) return false;
      }

      // Category filter
      if (category) {
        const cLower = category.toLowerCase();
        const cMatch = item.category && item.category.toLowerCase().includes(cLower);
        if (!cMatch) return false;
      }

      // General Search filter
      if (search) {
        const sLower = search.toLowerCase();
        const sMatch = (item.partName && item.partName.toLowerCase().includes(sLower)) ||
                       (item.partNumber && item.partNumber.toLowerCase().includes(sLower)) ||
                       (item.vendorName && item.vendorName.toLowerCase().includes(sLower)) ||
                       (item.invoiceNo && item.invoiceNo.toLowerCase().includes(sLower)) ||
                       (item.purchaseNo && item.purchaseNo.toLowerCase().includes(sLower));
        if (!sMatch) return false;
      }

      return true;
    });

    // Sort by purchaseDate descending
    filteredList.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate));

    // Calculate Summary Totals
    let totalPurchaseAmount = 0;
    let totalQuantityPurchased = 0;
    const transactionIds = new Set();

    filteredList.forEach(item => {
      totalPurchaseAmount += item.total || 0;
      totalQuantityPurchased += item.qty || 0;
      transactionIds.add(item.purchaseNo || item.invoiceNo || item._id);
    });

    res.send({
      success: true,
      reports: filteredList,
      data: filteredList,
      items: filteredList,
      summary: {
        totalPurchaseAmount: roundToTwo(totalPurchaseAmount),
        totalQuantityPurchased,
        transactionCount: transactionIds.size,
        itemsCount: filteredList.length
      }
    });
  } catch (error) {
    res.status(500).send({ error: 'Failed to generate purchase history report: ' + error.message });
  }
});

/**
 * 3. Pending Payments Report Engine
 * Comprehensive data retrieval with financial reconciliation and filtering
 */
const getPendingPaymentsReportData = async (query = {}) => {
  const {
    status,
    filter,
    paymentStatus,
    customerType,
    customerName,
    vehicleNumber,
    jobCardNumber,
    jobCardNo,
    search,
    fromDate,
    toDate
  } = query;

  // 1. Fetch all Job Cards and active Invoices
  const jobCards = await JobCard.find({})
    .populate('customerId')
    .populate('vehicleId')
    .sort({ createdAt: -1 });

  const invoices = await Invoice.find({ status: { $ne: 'Cancelled' } })
    .populate('customerId')
    .populate('vehicleId')
    .sort({ date: -1, createdAt: -1 });

  const invoiceByJobCardId = new Map();
  invoices.forEach(inv => {
    if (inv.jobCardId) {
      invoiceByJobCardId.set(inv.jobCardId.toString(), inv);
    }
  });

  const processedJobCardIds = new Set();
  const rawList = [];

  // 2. Process Job Cards
  for (const jc of jobCards) {
    processedJobCardIds.add(jc._id.toString());
    const linkedInvoice = invoiceByJobCardId.get(jc._id.toString());
    const customer = jc.customerId || linkedInvoice?.customerId;
    const vehicle = jc.vehicleId || linkedInvoice?.vehicleId;

    const custName = customer?.name || 'N/A';
    const custType = customer?.type || (customer?.companyName ? 'Corporate' : 'Individual');
    const vehReg = vehicle?.vehicleNumber || vehicle?.regNo || 'N/A';
    const vehModel = vehicle?.model || vehicle?.brand || '';

    const invNo = linkedInvoice?.invoiceNo || 'N/A';
    const invDate = linkedInvoice?.date || linkedInvoice?.createdAt || null;
    const deliveryDate = jc.deliveredBy?.date || null;
    const deliveryStaff = jc.deliveredBy?.name || '';
    const deliveryTime = jc.deliveredBy?.time || '';

    const finalBillAmount = linkedInvoice
      ? (linkedInvoice.totals?.roundedGrandTotal || linkedInvoice.totals?.grandTotal || 0)
      : (jc.financialSummary?.finalBillAmount || jc.billingSummary?.grandTotal || 0);

    const estAmount = jc.financialSummary?.estimatedRepairAmount || jc.estAmt || 0;
    const totalAdvance = jc.financialSummary?.totalAdvance ?? (jc.advancePayments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const totalFinal = jc.financialSummary?.totalFinal ?? (jc.finalPayments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const totalReceived = jc.financialSummary?.totalReceived ?? roundToTwo(totalAdvance + totalFinal);
    const totalWaived = jc.financialSummary?.totalWaived ?? (jc.waivers ? jc.waivers.filter(w => w.status !== 'Reversed').reduce((s, w) => s + (Number(w.amount) || 0), 0) : (Number(jc.waiver?.waivedAmount) || 0));
    const netPayable = jc.financialSummary?.netAmountPayable ?? Math.max(0, roundToTwo(finalBillAmount - totalWaived));
    const balanceDue = jc.financialSummary?.outstandingBalance ?? (jc.financialSummary?.pendingAmount ?? Math.max(0, roundToTwo(netPayable - totalReceived)));

    const effectivePaymentStatus = jc.paymentStatus || linkedInvoice?.paymentStatus || (balanceDue <= 0.05 ? 'Fully Paid' : (totalReceived > 0.05 ? 'Partially Paid' : 'Pending'));

    const creditDueDate = linkedInvoice?.creditDueDate || jc.creditDueDate || ((custType === 'Corporate' || customer?.companyName) && invDate ? new Date(new Date(invDate).getTime() + 30 * 86400000) : null);
    const creditTerms = linkedInvoice?.creditTerms || jc.creditTerms || (custType === 'Corporate' ? '30 Days' : '');

    rawList.push({
      _id: jc._id,
      jobCardId: jc._id,
      jobCardNo: jc.jobCardNo || 'N/A',
      customerId: customer?._id || null,
      customerName: custName,
      customerType: custType,
      companyName: customer?.companyName || '',
      customerPhone: customer?.mobile || customer?.phone || '',
      vehicleId: vehicle?._id || null,
      vehicleRegNo: vehReg,
      vehicleModel: vehModel,
      invoiceId: linkedInvoice?._id || null,
      invoiceNo: invNo,
      invoiceDate: invDate,
      vehicleDeliveryDate: deliveryDate,
      deliveryStaff,
      deliveryTime,
      estimatedRepairAmount: roundToTwo(estAmount),
      finalInvoiceAmount: roundToTwo(finalBillAmount),
      totalAdvanceReceived: roundToTwo(totalAdvance),
      additionalPaymentsReceived: roundToTwo(totalFinal),
      totalPaymentsReceived: roundToTwo(totalReceived),
      totalWaived: roundToTwo(totalWaived),
      netAmountPayable: roundToTwo(netPayable),
      outstandingBalance: roundToTwo(balanceDue),
      paymentStatus: effectivePaymentStatus,
      jobCardStatus: jc.status,
      creditDueDate,
      creditTerms
    });
  }

  // 3. Process standalone invoices without Job Cards
  for (const inv of invoices) {
    if (inv.jobCardId && processedJobCardIds.has(inv.jobCardId.toString())) {
      continue;
    }
    const customer = inv.customerId;
    const vehicle = inv.vehicleId;
    const custType = customer?.type || (customer?.companyName ? 'Corporate' : 'Individual');
    const finalBillAmount = inv.totals?.roundedGrandTotal || inv.totals?.grandTotal || 0;
    const totalReceived = inv.amountPaid || 0;
    const totalAdvance = inv.advanceReceived || 0;
    const totalFinal = Math.max(0, roundToTwo(totalReceived - totalAdvance));
    const totalWaived = inv.totalWaived || inv.waiverAmount || 0;
    const netPayable = inv.netAmountPayable || Math.max(0, roundToTwo(finalBillAmount - totalWaived));
    const balanceDue = inv.balanceDue ?? Math.max(0, roundToTwo(netPayable - totalReceived));
    const creditDueDate = inv.creditDueDate || ((custType === 'Corporate' || customer?.companyName) && inv.date ? new Date(new Date(inv.date).getTime() + 30 * 86400000) : null);

    rawList.push({
      _id: inv._id,
      jobCardId: null,
      jobCardNo: 'N/A',
      customerId: customer?._id || null,
      customerName: customer?.name || 'N/A',
      customerType: custType,
      companyName: customer?.companyName || '',
      customerPhone: customer?.mobile || customer?.phone || '',
      vehicleId: vehicle?._id || null,
      vehicleRegNo: vehicle?.vehicleNumber || vehicle?.regNo || 'N/A',
      vehicleModel: vehicle?.model || vehicle?.brand || '',
      invoiceId: inv._id,
      invoiceNo: inv.invoiceNo || 'N/A',
      invoiceDate: inv.date || inv.createdAt || null,
      vehicleDeliveryDate: null,
      deliveryStaff: '',
      deliveryTime: '',
      estimatedRepairAmount: roundToTwo(inv.estimatedRepairAmount || 0),
      finalInvoiceAmount: roundToTwo(finalBillAmount),
      totalAdvanceReceived: roundToTwo(totalAdvance),
      additionalPaymentsReceived: roundToTwo(totalFinal),
      totalPaymentsReceived: roundToTwo(totalReceived),
      totalWaived: roundToTwo(totalWaived),
      netAmountPayable: roundToTwo(netPayable),
      outstandingBalance: roundToTwo(balanceDue),
      paymentStatus: inv.paymentStatus || (balanceDue <= 0.05 ? 'Fully Paid' : 'Pending'),
      jobCardStatus: 'Invoice Only',
      creditDueDate,
      creditTerms: inv.creditTerms || (custType === 'Corporate' ? '30 Days' : '')
    });
  }

  // 4. Filtering logic
  const targetFilter = (filter || status || '').trim().toLowerCase();

  let filtered = rawList.filter(item => {
    // A. Status / Category filters
    if (targetFilter === 'delivered_pending' || targetFilter === 'delivered – payment pending' || targetFilter === 'delivered - payment pending') {
      const isDelPending = ['Delivered – Payment Pending', 'Delivered - Payment Pending'].includes(item.jobCardStatus);
      if (!isDelPending) return false;
    } else if (targetFilter === 'partially_paid' || targetFilter === 'partially paid') {
      if (item.paymentStatus !== 'Partially Paid') return false;
    } else if (targetFilter === 'fully_paid' || targetFilter === 'fully paid' || targetFilter === 'paid') {
      if (!['Fully Paid', 'Paid'].includes(item.paymentStatus)) return false;
    } else if (targetFilter === 'corporate') {
      const isCorp = item.customerType === 'Corporate' || Boolean(item.companyName);
      if (!isCorp) return false;
    } else if (targetFilter && targetFilter !== 'all') {
      const matchJcStatus = item.jobCardStatus.toLowerCase() === targetFilter;
      const matchPayStatus = item.paymentStatus.toLowerCase() === targetFilter;
      if (!matchJcStatus && !matchPayStatus) return false;
    } else {
      // Default view: Include all records with balance due OR delivered with pending payment
      if (item.outstandingBalance <= 0.05 && !['Delivered – Payment Pending', 'Delivered - Payment Pending'].includes(item.jobCardStatus)) {
        return false;
      }
    }

    // B. Explicit paymentStatus filter
    if (paymentStatus && paymentStatus.toLowerCase() !== 'all') {
      const pLower = paymentStatus.toLowerCase();
      if (pLower === 'fully paid' || pLower === 'paid') {
        if (!['Fully Paid', 'Paid'].includes(item.paymentStatus)) return false;
      } else if (pLower === 'partially paid') {
        if (item.paymentStatus !== 'Partially Paid') return false;
      } else if (pLower === 'pending' || pLower === 'unpaid') {
        if (!['Pending', 'Unpaid'].includes(item.paymentStatus)) return false;
      } else if (item.paymentStatus.toLowerCase() !== pLower) {
        return false;
      }
    }

    // C. Explicit customerType filter
    if (customerType && customerType.toLowerCase() !== 'all') {
      const ctLower = customerType.toLowerCase();
      if (ctLower === 'corporate') {
        if (item.customerType !== 'Corporate' && !item.companyName) return false;
      } else if (ctLower === 'individual') {
        if (item.customerType === 'Corporate' || item.companyName) return false;
      }
    }

    // D. Customer Name search
    if (customerName && customerName.trim()) {
      if (!item.customerName.toLowerCase().includes(customerName.trim().toLowerCase())) return false;
    }

    // E. Vehicle Number search
    if (vehicleNumber && vehicleNumber.trim()) {
      if (!item.vehicleRegNo.toLowerCase().includes(vehicleNumber.trim().toLowerCase())) return false;
    }

    // F. Job Card Number search
    const jcQuery = jobCardNumber || jobCardNo;
    if (jcQuery && jcQuery.trim()) {
      if (!item.jobCardNo.toLowerCase().includes(jcQuery.trim().toLowerCase())) return false;
    }

    // G. Date range filter
    if (fromDate || toDate) {
      const dateToCheck = item.invoiceDate || item.vehicleDeliveryDate;
      if (dateToCheck) {
        const itemDate = new Date(dateToCheck);
        if (fromDate) {
          const start = new Date(fromDate);
          start.setHours(0, 0, 0, 0);
          if (itemDate < start) return false;
        }
        if (toDate) {
          const end = new Date(toDate);
          end.setHours(23, 59, 59, 999);
          if (itemDate > end) return false;
        }
      }
    }

    // H. Universal search string
    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      const match =
        item.jobCardNo.toLowerCase().includes(s) ||
        item.customerName.toLowerCase().includes(s) ||
        item.vehicleRegNo.toLowerCase().includes(s) ||
        item.invoiceNo.toLowerCase().includes(s) ||
        item.companyName.toLowerCase().includes(s) ||
        item.customerPhone.toLowerCase().includes(s);
      if (!match) return false;
    }

    return true;
  });

  // Sort by invoiceDate or createdAt descending
  filtered.sort((a, b) => {
    const da = new Date(a.invoiceDate || a.vehicleDeliveryDate || 0);
    const db = new Date(b.invoiceDate || b.vehicleDeliveryDate || 0);
    return db - da;
  });

  // Calculate summary metrics
  let totalReceivables = 0;
  let totalBilled = 0;
  let totalReceived = 0;
  let totalWaived = 0;
  let totalNetPayable = 0;
  let deliveredPendingCount = 0;
  let corporatePendingCount = 0;

  filtered.forEach(item => {
    totalReceivables += item.outstandingBalance || 0;
    totalBilled += item.finalInvoiceAmount || 0;
    totalReceived += item.totalPaymentsReceived || 0;
    totalWaived += item.totalWaived || 0;
    totalNetPayable += item.netAmountPayable || 0;
    if (['Delivered – Payment Pending', 'Delivered - Payment Pending'].includes(item.jobCardStatus)) {
      deliveredPendingCount++;
    }
    if ((item.customerType === 'Corporate' || item.companyName) && item.outstandingBalance > 0.05) {
      corporatePendingCount++;
    }
  });

  return {
    items: filtered,
    summary: {
      totalRecords: filtered.length,
      totalReceivables: roundToTwo(totalReceivables),
      totalBilled: roundToTwo(totalBilled),
      totalReceived: roundToTwo(totalReceived),
      totalWaived: roundToTwo(totalWaived),
      totalNetPayable: roundToTwo(totalNetPayable),
      deliveredPendingCount,
      corporatePendingCount
    }
  };
};

// GET Pending Payments Report (JSON API)
router.get('/pending-payments', auth, async (req, res) => {
  try {
    const { items, summary } = await getPendingPaymentsReportData(req.query);
    res.send({
      success: true,
      data: items,
      items,
      reports: items,
      summary
    });
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch pending payments report: ' + error.message });
  }
});

// GET Pending Payments Report (Excel / CSV Export)
router.get('/pending-payments/export/excel', auth, async (req, res) => {
  try {
    const { items } = await getPendingPaymentsReportData(req.query);

    const headers = [
      'Job Card No',
      'Customer Name',
      'Customer Type',
      'Vehicle Reg No',
      'Invoice No',
      'Invoice Date',
      'Vehicle Delivery Date',
      'Estimated Repair Amount',
      'Final Invoice Amount',
      'Total Advance Received',
      'Additional Payments Received',
      'Total Payments Received',
      'Approved Waiver / Discount',
      'Net Amount Payable',
      'Outstanding Balance',
      'Payment Status',
      'Credit Due Date'
    ];

    const rows = items.map(item => [
      item.jobCardNo || 'N/A',
      item.customerName || 'N/A',
      item.customerType || 'Individual',
      item.vehicleRegNo || 'N/A',
      item.invoiceNo || 'N/A',
      item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString('en-IN') : 'N/A',
      item.vehicleDeliveryDate ? new Date(item.vehicleDeliveryDate).toLocaleDateString('en-IN') : 'N/A',
      (item.estimatedRepairAmount || 0).toFixed(2),
      item.finalInvoiceAmount.toFixed(2),
      item.totalAdvanceReceived.toFixed(2),
      (item.additionalPaymentsReceived || 0).toFixed(2),
      item.totalPaymentsReceived.toFixed(2),
      (item.totalWaived || 0).toFixed(2),
      (item.netAmountPayable !== undefined ? item.netAmountPayable : item.finalInvoiceAmount).toFixed(2),
      item.outstandingBalance.toFixed(2),
      item.paymentStatus,
      item.creditDueDate ? new Date(item.creditDueDate).toLocaleDateString('en-IN') : 'N/A'
    ]);

    const csvContent = [
      headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map(row => row.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pending_payments_report_${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (error) {
    res.status(500).send({ error: 'Failed to generate Excel report: ' + error.message });
  }
});

// GET Pending Payments Report (PDF Export)
router.get('/pending-payments/export/pdf', auth, async (req, res) => {
  try {
    const { items, summary } = await getPendingPaymentsReportData(req.query);

    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="pending_payments_report_${Date.now()}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a8a').text('MVSS AUTOMOBILES', 30, 30);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#334155').text('Financial & Tax Reports — Pending Payments', 30, 52);
    doc.fontSize(8.5).font('Helvetica').fillColor('#64748b').text(`Generated on: ${new Date().toLocaleString('en-IN')} | Total Records: ${summary.totalRecords} | Total Waived: ₹${summary.totalWaived.toLocaleString('en-IN')} | Outstanding Receivables: ₹${summary.totalReceivables.toLocaleString('en-IN')}`, 30, 68);

    doc.moveTo(30, 84).lineTo(812, 84).strokeColor('#cbd5e1').lineWidth(1).stroke();

    // Table Header
    let y = 96;
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#0f172a');
    doc.text('Job Card No', 30, y, { width: 55 });
    doc.text('Customer Name', 88, y, { width: 88 });
    doc.text('Type', 178, y, { width: 44 });
    doc.text('Vehicle Reg', 224, y, { width: 55 });
    doc.text('Invoice No', 281, y, { width: 55 });
    doc.text('Inv Date', 338, y, { width: 44 });
    doc.text('Final Bill (₹)', 384, y, { width: 50, align: 'right' });
    doc.text('Advance (₹)', 436, y, { width: 46, align: 'right' });
    doc.text('Received (₹)', 484, y, { width: 46, align: 'right' });
    doc.text('Waived (₹)', 532, y, { width: 46, align: 'right' });
    doc.text('Net Bill (₹)', 580, y, { width: 48, align: 'right' });
    doc.text('Outstanding (₹)', 630, y, { width: 58, align: 'right' });
    doc.text('Status', 694, y, { width: 75 });

    doc.moveTo(30, y + 14).lineTo(812, y + 14).strokeColor('#0f172a').lineWidth(0.8).stroke();
    y += 20;

    // Table Rows
    doc.font('Helvetica').fontSize(7);
    items.forEach((item, idx) => {
      if (y > 530) {
        doc.addPage({ margin: 30, size: 'A4', layout: 'landscape' });
        y = 35;
      }

      if (idx % 2 === 1) {
        doc.rect(30, y - 2, 782, 14).fillColor('#f8fafc').fill();
      }

      doc.fillColor('#0f172a');
      doc.text(item.jobCardNo || 'N/A', 30, y, { width: 55 });
      doc.text(item.customerName || 'N/A', 88, y, { width: 88 });
      doc.text(item.customerType || 'Individual', 178, y, { width: 44 });
      doc.text(item.vehicleRegNo || 'N/A', 224, y, { width: 55 });
      doc.text(item.invoiceNo || 'N/A', 281, y, { width: 55 });
      doc.text(item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString('en-IN') : 'N/A', 338, y, { width: 44 });
      doc.text(item.finalInvoiceAmount.toFixed(2), 384, y, { width: 50, align: 'right' });
      doc.text(item.totalAdvanceReceived.toFixed(2), 436, y, { width: 46, align: 'right' });
      doc.text(item.totalPaymentsReceived.toFixed(2), 484, y, { width: 46, align: 'right' });
      doc.text((item.totalWaived || 0).toFixed(2), 532, y, { width: 46, align: 'right' });
      doc.text((item.netAmountPayable !== undefined ? item.netAmountPayable : item.finalInvoiceAmount).toFixed(2), 580, y, { width: 48, align: 'right' });

      if (item.outstandingBalance > 0.05) {
        doc.fillColor('#dc2626').font('Helvetica-Bold');
      } else {
        doc.fillColor('#16a34a').font('Helvetica');
      }
      doc.text(item.outstandingBalance.toFixed(2), 630, y, { width: 58, align: 'right' });

      doc.fillColor('#0f172a').font('Helvetica');
      doc.text(item.paymentStatus, 694, y, { width: 75 });

      y += 15;
    });

    // Summary footer
    y += 10;
    if (y > 510) {
      doc.addPage({ margin: 30, size: 'A4', layout: 'landscape' });
      y = 35;
    }
    doc.moveTo(30, y).lineTo(812, y).strokeColor('#cbd5e1').lineWidth(1).stroke();
    y += 8;
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#0f172a');
    doc.text(`Total Records: ${summary.totalRecords}  |  Delivered (Pending Payment): ${summary.deliveredPendingCount}  |  Total Billed: ₹${summary.totalBilled.toLocaleString('en-IN')}  |  Total Waived: ₹${summary.totalWaived.toLocaleString('en-IN')}  |  Total Received: ₹${summary.totalReceived.toLocaleString('en-IN')}  |  Total Receivables: ₹${summary.totalReceivables.toLocaleString('en-IN')}`, 30, y);

    doc.end();
  } catch (error) {
    res.status(500).send({ error: 'Failed to generate PDF report: ' + error.message });
  }
});

module.exports = router;
