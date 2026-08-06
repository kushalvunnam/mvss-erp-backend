const express = require('express');
const Inventory = require('../models/Inventory');
const Vendor = require('../models/Vendor');
const Purchase = require('../models/Purchase');
const StockAdjustment = require('../models/StockAdjustment');
const Invoice = require('../models/Invoice');
const { auth, restrictTo } = require('../middleware/auth');
const router = express.Router();

router.use((req, res, next) => {
  console.log(`[REPORTS] Route request received: ${req.method} ${req.baseUrl}${req.path}`);
  next();
});

router.use(auth, restrictTo('Admin', 'Service', 'Spares', 'Body Shop', 'Accounts', 'Accounts Executive'));

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

module.exports = router;
