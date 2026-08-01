const express = require('express');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const JobCard = require('../models/JobCard');
const Invoice = require('../models/Invoice');
const InsuranceClaim = require('../models/InsuranceClaim');
const Inventory = require('../models/Inventory');
const AuditLog = require('../models/AuditLog');
const GatePass = require('../models/GatePass');
const { auth, restrictTo } = require('../middleware/auth');
const router = express.Router();

router.use((req, res, next) => {
  console.log(`[DASHBOARD] Route request received: ${req.method} ${req.baseUrl}${req.path}`);
  next();
});

const { checkLowStockAlerts } = require('../utils/alerts');

// Get dashboard KPIs
router.get('/stats', auth, restrictTo('Admin', 'Service', 'Reception'), async (req, res) => {
  try {
    await checkLowStockAlerts();
    
    // Parse query date
    const dateParam = req.query.date;
    let targetDate = new Date();
    let isHistorical = false;
    if (dateParam) {
      targetDate = new Date(dateParam);
      isHistorical = true;
    }
    
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23,59,59,999);

    // Calculate total activity for historical date check
    let noData = false;
    if (isHistorical) {
      const Customer = require('../models/Customer');
      const Vehicle = require('../models/Vehicle');
      const JobCard = require('../models/JobCard');
      const Invoice = require('../models/Invoice');
      const GatePass = require('../models/GatePass');
      const InsuranceClaim = require('../models/InsuranceClaim');
      const Expense = require('../models/Expense');

      const activityCounts = await Promise.all([
        Customer.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }),
        Vehicle.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }),
        JobCard.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }),
        JobCard.countDocuments({ updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
        Invoice.countDocuments({ date: { $gte: startOfDay, $lte: endOfDay } }),
        GatePass.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }),
        InsuranceClaim.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }),
        Expense.countDocuments({ date: { $gte: startOfDay, $lte: endOfDay } })
      ]);
      const totalActivity = activityCounts.reduce((a, b) => a + b, 0);
      if (totalActivity === 0) {
        noData = true;
      }
    }

    const queryFilter = isHistorical ? { createdAt: { $lte: endOfDay } } : {};
    const invoiceFilter = isHistorical ? { date: { $lte: endOfDay } } : {};

    const totalCustomers = await Customer.countDocuments(queryFilter);
    const totalVehicles = await Vehicle.countDocuments(queryFilter);
    
    let activeJobCards, completedJobCards, pendingJobCards, bodyShopJobs;
    if (isHistorical) {
      activeJobCards = await JobCard.countDocuments({
        createdAt: { $lte: endOfDay },
        $or: [
          { status: { $ne: 'Delivered' } },
          { updatedAt: { $gt: endOfDay } }
        ]
      });
      completedJobCards = await JobCard.countDocuments({
        status: 'Delivered',
        updatedAt: { $lte: endOfDay }
      });
      pendingJobCards = await JobCard.countDocuments({
        createdAt: { $lte: endOfDay },
        status: { $in: ['Created', 'Inspect Stage', 'Estimation', 'Customer Approval'] },
        $or: [
          { status: { $ne: 'Delivered' } },
          { updatedAt: { $gt: endOfDay } }
        ]
      });
      bodyShopJobs = await JobCard.countDocuments({
        createdAt: { $lte: endOfDay },
        $or: [
          { status: 'Body Shop' },
          { workCategory: 'B/P' }
        ],
        $or: [
          { status: { $ne: 'Delivered' } },
          { updatedAt: { $gt: endOfDay } }
        ]
      });
    } else {
      activeJobCards = await JobCard.countDocuments({ status: { $in: ['Work in Progress', 'Work In Progress', 'Body Shop', 'Repair', 'Quality Test', 'Quality Check', 'Ready for Delivery'] } });
      completedJobCards = await JobCard.countDocuments({ status: { $in: ['Delivered', 'Closed'] } });
      pendingJobCards = await JobCard.countDocuments({
        status: { $in: ['Waiting for Customer Approval', 'Created', 'Inspect Stage', 'Estimation', 'Customer Approval'] }
      });
      bodyShopJobs = await JobCard.countDocuments({
        $or: [
          { status: 'Body Shop' },
          { workCategory: 'B/P' }
        ]
      });
    }

    // Revenue This Month relative to targetDate
    const startOfMonth = new Date(targetDate);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0,0,0,0);
    const monthlyInvoices = await Invoice.find({
      status: 'Finalized',
      date: { $gte: startOfMonth, $lte: endOfDay }
    });
    const revenueThisMonth = monthlyInvoices.reduce((sum, inv) => sum + inv.totals.grandTotal, 0);

    // Revenue This Year relative to targetDate
    const startOfYear = new Date(targetDate);
    startOfYear.setMonth(0);
    startOfYear.setDate(1);
    startOfYear.setHours(0,0,0,0);
    const yearlyInvoices = await Invoice.find({
      status: 'Finalized',
      date: { $gte: startOfYear, $lte: endOfDay }
    });
    const revenueThisYear = yearlyInvoices.reduce((sum, inv) => sum + inv.totals.grandTotal, 0);

    // Pending Payments as of endOfDay
    let unpaidInvoices;
    if (isHistorical) {
      unpaidInvoices = await Invoice.find({
        status: 'Finalized',
        date: { $lte: endOfDay },
        $or: [
          { paymentStatus: { $ne: 'Paid' } },
          { updatedAt: { $gt: endOfDay } }
        ]
      });
    } else {
      unpaidInvoices = await Invoice.find({
        status: 'Finalized',
        paymentStatus: { $ne: 'Paid' }
      });
    }
    const pendingPayments = unpaidInvoices.reduce((sum, inv) => sum + (inv.balanceDue !== undefined ? inv.balanceDue : (inv.totals.roundedGrandTotal - (inv.advanceReceived || 0))), 0);

    const VendorModel = require('../models/Vendor');
    const PurchaseModel = require('../models/Purchase');
    const allInventory = await Inventory.find(isHistorical ? { createdAt: { $lte: endOfDay } } : {});
    const inventoryValue = allInventory.reduce((sum, item) => sum + ((item.stockQuantity || 0) * (item.purchasePrice || 0)), 0);
    const sellingValuation = allInventory.reduce((sum, item) => sum + ((item.stockQuantity || 0) * (item.sellingPrice || 0)), 0);
    const lowStockItems = allInventory.filter(item => (item.stockQuantity || 0) <= (item.lowStockThreshold || 5) && (item.stockQuantity || 0) > 0).length;
    const outOfStockItems = allInventory.filter(item => (item.stockQuantity || 0) <= 0).length;
    
    const totalVendors = await VendorModel.countDocuments(isHistorical ? { createdAt: { $lte: endOfDay } } : {});
    const recentPurchases = await PurchaseModel.find(isHistorical ? { createdAt: { $lte: endOfDay } } : {}).sort({ createdAt: -1 }).limit(5);

    const insuranceClaims = await InsuranceClaim.countDocuments(isHistorical ? { createdAt: { $lte: endOfDay } } : {});

    // Gate passes
    const totalGatePasses = await GatePass.countDocuments(isHistorical ? { createdAt: { $lte: endOfDay } } : {});
    const issuedToday = await GatePass.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });
    
    let pendingReturns, returnedMaterials;
    if (isHistorical) {
      pendingReturns = await GatePass.countDocuments({
        createdAt: { $lte: endOfDay },
        status: 'Pending',
        $or: [
          { status: 'Pending' },
          { updatedAt: { $gt: endOfDay } }
        ]
      });
      returnedMaterials = await GatePass.countDocuments({
        status: 'Returned',
        updatedAt: { $lte: endOfDay }
      });
    } else {
      pendingReturns = await GatePass.countDocuments({ status: 'Pending' });
      returnedMaterials = await GatePass.countDocuments({ status: 'Returned' });
    }

    const latestAuditLogs = await AuditLog.find(isHistorical ? { createdAt: { $lte: endOfDay } } : {})
      .sort({ createdAt: -1 })
      .limit(10);

    const lowStockItemsList = allInventory
      .filter(item => (item.currentStock || item.stockQuantity || 0) <= (item.minimumStock || item.lowStockThreshold || 5))
      .map(item => ({
        partName: item.partName,
        partNumber: item.partNumber,
        currentStock: item.currentStock || item.stockQuantity || 0,
        minimumStock: item.minimumStock || item.lowStockThreshold || 5,
        severity: (item.currentStock || item.stockQuantity || 0) === 0 ? 'CRITICAL' : 'WARNING'
      }));

    res.send({
      noData,
      totalCustomers,
      totalVehicles,
      activeJobCards,
      completedJobCards,
      pendingJobCards,
      waitingPartsJobCards: isHistorical ? 0 : (await JobCard.countDocuments({ status: 'Parts Procuring' })),
      deliveredJobCards: completedJobCards,
      revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
      revenueThisYear: Math.round(revenueThisYear * 100) / 100,
      pendingPayments: Math.round(pendingPayments * 100) / 100,
      inventoryValue: Math.round(inventoryValue * 100) / 100,
      sellingValuation: Math.round(sellingValuation * 100) / 100,
      lowStockItems,
      outOfStockItems,
      totalVendors,
      recentPurchases,
      lowStockItemsList,
      latestAuditLogs,
      insuranceClaims,
      bodyShopJobs,
      totalGatePasses,
      issuedToday,
      pendingReturns,
      returnedMaterials
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).send({ error: 'Failed to fetch dashboard stats.' });
  }
});

// Get chart data
router.get('/charts', auth, restrictTo('Admin', 'Service', 'Reception'), async (req, res) => {
  try {
    const dateParam = req.query.date;
    let targetDate = new Date();
    let isHistorical = false;
    if (dateParam) {
      targetDate = new Date(dateParam);
      isHistorical = true;
    }
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23,59,59,999);

    // 1. Revenue by Month (last 6 months relative to targetDate)
    const sixMonthsAgo = new Date(targetDate);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0,0,0,0);

    const invoices = await Invoice.find({
      status: 'Finalized',
      date: { $gte: sixMonthsAgo, $lte: endOfDay }
    });

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const revenueMap = {};

    // Initialize last 6 months relative to targetDate
    for (let i = 5; i >= 0; i--) {
      const d = new Date(targetDate);
      d.setMonth(d.getMonth() - i);
      const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      revenueMap[key] = 0;
    }

    invoices.forEach(inv => {
      const d = new Date(inv.date);
      const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      if (revenueMap[key] !== undefined) {
        revenueMap[key] += inv.totals.grandTotal;
      }
    });

    const revenueChart = Object.entries(revenueMap).map(([month, amount]) => ({
      month,
      amount: Math.round(amount * 100) / 100
    }));

    // 2. Service Type Analytics (grouped by job cards created on or before endOfDay)
    let serviceTypeAgg;
    if (isHistorical) {
      serviceTypeAgg = await JobCard.aggregate([
        { $match: { createdAt: { $lte: endOfDay } } },
        { $group: { _id: '$serviceType', count: { $sum: 1 } } }
      ]);
    } else {
      serviceTypeAgg = await JobCard.aggregate([
        { $group: { _id: '$serviceType', count: { $sum: 1 } } }
      ]);
    }
    const serviceTypeChart = serviceTypeAgg.map(item => ({
      name: item._id || 'General Servicing',
      value: item.count
    }));

    // 3. Top Used Spare Parts (finalized on or before endOfDay)
    const partUsage = {};
    const finalizedInvsWithParts = await Invoice.find({
      status: 'Finalized',
      date: { $lte: endOfDay }
    });
    finalizedInvsWithParts.forEach(inv => {
      inv.parts.forEach(part => {
        if (partUsage[part.name]) {
          partUsage[part.name] += part.qty;
        } else {
          partUsage[part.name] = part.qty;
        }
      });
    });

    const topPartsChart = Object.entries(partUsage)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    // 4. Domain spent/billed breakdown
    let totalSpentParts = 0;
    let totalSpentLabour = 0;
    let totalSpentGst = 0;

    finalizedInvsWithParts.forEach(inv => {
      totalSpentParts += inv.totals.partsTotal || 0;
      totalSpentLabour += inv.totals.labourTotal || 0;
      totalSpentGst += inv.totals.gstTotal || 0;
    });

    const billingBreakdown = {
      spareParts: Math.round(totalSpentParts * 100) / 100,
      labour: Math.round(totalSpentLabour * 100) / 100,
      gst: Math.round(totalSpentGst * 100) / 100
    };

    res.send({
      revenueChart,
      serviceTypeChart,
      topPartsChart,
      billingBreakdown
    });
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch chart data.' });
  }
});

// Admin-only: Fetch Audit Logs with Query Filters & Pagination & Search
router.get('/auditlogs', auth, restrictTo('Admin'), async (req, res) => {
  try {
    const { userName, role, moduleName, action, startDate, endDate, search, page, limit } = req.query;
    const query = {};

    if (userName) {
      query.userName = { $regex: userName, $options: 'i' };
    }
    if (role) {
      query.$or = [{ role: role }, { userRole: role }];
    }
    if (moduleName) {
      query.module = moduleName;
    }
    if (action) {
      query.action = { $regex: action, $options: 'i' };
    }
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      query.$or = [
        { userName: searchRegex },
        { action: searchRegex },
        { module: searchRegex },
        { details: searchRegex },
        { ipAddress: searchRegex }
      ];
    }

    const p = parseInt(page, 10) || 1;
    const l = parseInt(limit, 10) || 25;
    const skip = (p - 1) * l;

    const totalCount = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l);

    res.send({
      logs,
      totalPages: Math.ceil(totalCount / l),
      currentPage: p,
      totalCount
    });
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch audit logs: ' + error.message });
  }
});

// Authenticated: Log custom activity (e.g. report exported, client action)
router.post('/auditlogs', auth, async (req, res) => {
  try {
    const { action, details } = req.body;
    if (!action || !details) {
      return res.status(400).send({ error: 'Action and details are required.' });
    }
    const { logAction } = require('../utils/logger');
    await logAction(req.user, action, details, req);
    res.status(201).send({ message: 'Audit log created.' });
  } catch (error) {
    res.status(500).send({ error: 'Failed to create audit log: ' + error.message });
  }
});

// Admin-only: Reset database for real testing mode
router.post('/reset-database', auth, restrictTo('Admin'), async (req, res) => {
  try {
    const Customer = require('../models/Customer');
    const Vehicle = require('../models/Vehicle');
    const JobCard = require('../models/JobCard');
    const Booking = require('../models/Booking');
    const Estimate = require('../models/Estimate');
    const InsuranceClaim = require('../models/InsuranceClaim');
    const Invoice = require('../models/Invoice');
    const GatePass = require('../models/GatePass');
    const Notification = require('../models/Notification');
    const Message = require('../models/Message');
    const AuditLog = require('../models/AuditLog');
    const { logAction } = require('../utils/logger');

    const resCust = await Customer.deleteMany({});
    const resVeh = await Vehicle.deleteMany({});
    const resJc = await JobCard.deleteMany({});
    const resBook = await Booking.deleteMany({});
    const resEst = await Estimate.deleteMany({});
    const resClaim = await InsuranceClaim.deleteMany({});
    const resInv = await Invoice.deleteMany({});
    const resGp = await GatePass.deleteMany({});
    const resNotif = await Notification.deleteMany({});
    const resMsg = await Message.deleteMany({});
    
    // Clear all audit logs except USER_LOGIN and USER_LOGOUT
    const resLogs = await AuditLog.deleteMany({ action: { $nin: ['USER_LOGIN', 'USER_LOGOUT'] } });

    // Log the reset action
    await logAction(req.user, 'SYSTEM_RESET', 'Purged customers, vehicles, job cards, bookings, estimates, claims, invoices, gate passes, notifications, messages, and logs for real testing mode.', req);

    res.send({
      message: 'Database reset successful.',
      counts: {
        customers: resCust.deletedCount,
        vehicles: resVeh.deletedCount,
        jobCards: resJc.deletedCount,
        bookings: resBook.deletedCount,
        estimates: resEst.deletedCount,
        claims: resClaim.deletedCount,
        invoices: resInv.deletedCount,
        gatePasses: resGp.deletedCount,
        notifications: resNotif.deletedCount,
        messages: resMsg.deletedCount,
        logs: resLogs.deletedCount
      }
    });
  } catch (error) {
    res.status(500).send({ error: 'Failed to reset database: ' + error.message });
  }
});

// Authenticated: Global ERP search across modules
router.get('/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.send([]);
    }

    const query = q.trim();
    const regex = { $regex: query, $options: 'i' };

    // Search Customers
    const customers = await Customer.find({
      $or: [
        { name: regex },
        { mobile: regex },
        { email: regex }
      ]
    }).limit(5);

    // Search Vehicles
    const vehicles = await Vehicle.find({
      $or: [
        { vehicleNumber: regex },
        { chassisNumber: regex },
        { make: regex },
        { model: regex }
      ]
    }).limit(5);

    // Search Job Cards
    const jobcards = await JobCard.find({
      jobCardNo: regex
    }).limit(5);

    // Search Invoices
    const invoices = await Invoice.find({
      invoiceNo: regex
    }).limit(5);

    // Search Inventory
    const inventory = await Inventory.find({
      $or: [
        { partName: regex },
        { partNumber: regex }
      ]
    }).limit(5);

    // Search Employees
    const Employee = require('../models/Employee');
    const employees = await Employee.find({
      $or: [
        { name: regex },
        { email: regex },
        { phone: regex }
      ]
    }).limit(5);

    // Search Insurance Claims
    const claims = await InsuranceClaim.find({
      $or: [
        { claimNo: regex },
        { insuranceCompany: regex }
      ]
    }).limit(5);

    // Format output
    const results = [];

    customers.forEach(c => {
      results.push({
        title: c.name,
        subtitle: `Customer • ${c.mobile}`,
        tabId: 'customers',
        filterVal: c.name,
        type: 'Customer'
      });
    });

    vehicles.forEach(v => {
      results.push({
        title: v.vehicleNumber,
        subtitle: `Vehicle • ${v.make} ${v.model}`,
        tabId: 'vehicles',
        filterVal: v.vehicleNumber,
        type: 'Vehicle'
      });
    });

    jobcards.forEach(jc => {
      results.push({
        title: jc.jobCardNo,
        subtitle: `Job Card • ${jc.status}`,
        tabId: 'jobcards',
        filterVal: jc.jobCardNo,
        type: 'JobCard',
        id: jc._id
      });
    });

    invoices.forEach(inv => {
      results.push({
        title: inv.invoiceNo,
        subtitle: `Invoice • ₹${inv.totals?.grandTotal?.toLocaleString('en-IN') || 0} (${inv.paymentStatus})`,
        tabId: 'invoices',
        filterVal: inv.invoiceNo,
        type: 'Invoice'
      });
    });

    inventory.forEach(item => {
      results.push({
        title: item.partName,
        subtitle: `Inventory • Stock: ${item.stockQuantity} (${item.partNumber})`,
        tabId: 'inventory',
        filterVal: item.partName,
        type: 'Inventory'
      });
    });

    employees.forEach(emp => {
      results.push({
        title: emp.name,
        subtitle: `Employee • ${emp.phone || emp.email || 'Staff'}`,
        tabId: 'employees',
        filterVal: emp.name,
        type: 'Employee'
      });
    });

    claims.forEach(cl => {
      results.push({
        title: cl.claimNo,
        subtitle: `Insurance Claim • ${cl.insuranceCompany} (${cl.status})`,
        tabId: 'claims',
        filterVal: cl.claimNo,
        type: 'Claim'
      });
    });

    res.send(results);
  } catch (error) {
    res.status(500).send({ error: 'Global search failed: ' + error.message });
  }
});

// Get dashboard summary with filters and comparisons
router.get('/summary', auth, restrictTo('Admin', 'Service', 'Reception'), async (req, res) => {
  try {
    const { filter, startDate, endDate, date } = req.query;

    const targetDate = date ? new Date(date) : new Date();
    let start, end;

    if (filter === 'Today') {
      start = new Date(targetDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(targetDate);
      end.setHours(23, 59, 59, 999);
    } else if (filter === 'Yesterday') {
      start = new Date(targetDate);
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(targetDate);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    } else if (filter === 'This Week') {
      start = new Date(targetDate);
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      end = new Date(targetDate);
      end.setHours(23, 59, 59, 999);
    } else if (filter === 'This Month') {
      start = new Date(targetDate);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end = new Date(targetDate);
      end.setHours(23, 59, 59, 999);
    } else if (filter === 'Custom' && startDate && endDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      // Default to This Month
      start = new Date(targetDate);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end = new Date(targetDate);
      end.setHours(23, 59, 59, 999);
    }

    const JobCard = require('../models/JobCard');
    const Expense = require('../models/Expense');

    const getDashboardSummaryData = async (s, e) => {
      const closedCards = await JobCard.find({
        status: { $in: ['Delivered', 'Closed'] },
        updatedAt: { $gte: s, $lte: e }
      });

      let closedJobCardsCount = closedCards.length;
      let salePartsValue = 0;
      let purchasePartsValue = 0;
      let labourRevenue = 0;
      let grossProfit = 0;
      let gstCollected = 0;
      let discounts = 0;
      let totalBilling = 0;

      closedCards.forEach(jc => {
        const summary = jc.billingSummary || {};
        salePartsValue += Number(summary.partsSaleAmount) || 0;
        purchasePartsValue += Number(summary.partsPurchaseAmount) || 0;
        labourRevenue += Number(summary.labourAmount) || 0;
        grossProfit += Number(summary.grossProfit) || 0;
        gstCollected += Number(summary.totalGST) || 0;
        discounts += Number(summary.totalDiscount) || 0;
        totalBilling += Number(summary.grandTotal) || 0;
      });

      const expenses = await Expense.find({
        date: { $gte: s, $lte: e }
      });
      const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
      const netProfit = grossProfit - totalExpenses;

      return {
        closedJobCardsCount,
        salePartsValue: Math.round(salePartsValue * 100) / 100,
        purchasePartsValue: Math.round(purchasePartsValue * 100) / 100,
        labourRevenue: Math.round(labourRevenue * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        gstCollected: Math.round(gstCollected * 100) / 100,
        discounts: Math.round(discounts * 100) / 100,
        totalBilling: Math.round(totalBilling * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100
      };
    };

    // Filtered Period Stats
    const periodStats = await getDashboardSummaryData(start, end);

    // Today's Stats
    const todayStart = new Date(targetDate);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(targetDate);
    todayEnd.setHours(23, 59, 59, 999);
    const todayStats = await getDashboardSummaryData(todayStart, todayEnd);

    // Monthly Stats
    const monthStart = new Date(targetDate);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(targetDate);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    monthEnd.setDate(0);
    monthEnd.setHours(23, 59, 59, 999);
    const monthlyStats = await getDashboardSummaryData(monthStart, monthEnd);

    res.json({
      success: true,
      filter,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      periodStats,
      todayStats,
      monthlyStats
    });
  } catch (error) {
    console.error('[DASHBOARD] Summary stats fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary: ' + error.message });
  }
});

// Get dashboard reports grouping data
router.get('/reports', auth, restrictTo('Admin', 'Service', 'Reception'), async (req, res) => {
  try {
    const { type } = req.query; // 'daily', 'weekly', 'monthly', 'yearly'
    if (!type) {
      return res.status(400).json({ error: 'Report type query param is required.' });
    }

    const JobCard = require('../models/JobCard');
    const Expense = require('../models/Expense');

    const dateParam = req.query.date;
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const closedCards = await JobCard.find({
      status: { $in: ['Delivered', 'Closed'] },
      updatedAt: { $lte: endOfDay }
    });

    const expenses = await Expense.find({
      date: { $lte: endOfDay }
    });

    const groups = {};

    closedCards.forEach(jc => {
      const summary = jc.billingSummary || {};
      const date = new Date(jc.updatedAt);
      
      let key;
      if (type === 'daily') {
        key = date.toISOString().substring(0, 10);
      } else if (type === 'weekly') {
        const oneJan = new Date(date.getFullYear(), 0, 1);
        const numberOfDays = Math.floor((date - oneJan) / (24 * 60 * 60 * 1000));
        const week = Math.ceil(( date.getDay() + 1 + numberOfDays) / 7);
        key = `${date.getFullYear()}-W${week}`;
      } else if (type === 'monthly') {
        key = date.toISOString().substring(0, 7);
      } else {
        key = `${date.getFullYear()}`;
      }

      if (!groups[key]) {
        groups[key] = {
          periodLabel: key,
          closedJobCardsCount: 0,
          salePartsValue: 0,
          purchasePartsValue: 0,
          labourRevenue: 0,
          grossProfit: 0,
          netProfit: 0,
          totalBilling: 0,
          totalExpenses: 0
        };
      }

      groups[key].closedJobCardsCount += 1;
      groups[key].salePartsValue += Number(summary.partsSaleAmount) || 0;
      groups[key].purchasePartsValue += Number(summary.partsPurchaseAmount) || 0;
      groups[key].labourRevenue += Number(summary.labourAmount) || 0;
      groups[key].grossProfit += Number(summary.grossProfit) || 0;
      groups[key].totalBilling += Number(summary.grandTotal) || 0;
    });

    expenses.forEach(exp => {
      const date = new Date(exp.date);
      let key;
      if (type === 'daily') {
        key = date.toISOString().substring(0, 10);
      } else if (type === 'weekly') {
        const oneJan = new Date(date.getFullYear(), 0, 1);
        const numberOfDays = Math.floor((date - oneJan) / (24 * 60 * 60 * 1000));
        const week = Math.ceil(( date.getDay() + 1 + numberOfDays) / 7);
        key = `${date.getFullYear()}-W${week}`;
      } else if (type === 'monthly') {
        key = date.toISOString().substring(0, 7);
      } else {
        key = `${date.getFullYear()}`;
      }

      if (!groups[key]) {
        groups[key] = {
          periodLabel: key,
          closedJobCardsCount: 0,
          salePartsValue: 0,
          purchasePartsValue: 0,
          labourRevenue: 0,
          grossProfit: 0,
          netProfit: 0,
          totalBilling: 0,
          totalExpenses: 0
        };
      }
      groups[key].totalExpenses += exp.amount || 0;
    });

    Object.keys(groups).forEach(key => {
      groups[key].netProfit = groups[key].grossProfit - groups[key].totalExpenses;
      groups[key].salePartsValue = Math.round(groups[key].salePartsValue * 100) / 100;
      groups[key].purchasePartsValue = Math.round(groups[key].purchasePartsValue * 100) / 100;
      groups[key].labourRevenue = Math.round(groups[key].labourRevenue * 100) / 100;
      groups[key].grossProfit = Math.round(groups[key].grossProfit * 100) / 100;
      groups[key].netProfit = Math.round(groups[key].netProfit * 100) / 100;
      groups[key].totalBilling = Math.round(groups[key].totalBilling * 100) / 100;
      groups[key].totalExpenses = Math.round(groups[key].totalExpenses * 100) / 100;
    });

    const reportData = Object.values(groups).sort((a, b) => b.periodLabel.localeCompare(a.periodLabel));
    res.json({ success: true, type, reports: reportData });
  } catch (error) {
    console.error('[DASHBOARD] Reports fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch reports summary: ' + error.message });
  }
});

module.exports = router;
