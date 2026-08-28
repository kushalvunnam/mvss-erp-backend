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
router.get('/stats', auth, async (req, res) => {
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

    const VendorModel = require('../models/Vendor');
    const PurchaseModel = require('../models/Purchase');

    const startOfMonth = new Date(targetDate);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0,0,0,0);

    const startOfYear = new Date(targetDate);
    startOfYear.setMonth(0);
    startOfYear.setDate(1);
    startOfYear.setHours(0,0,0,0);

    // Run all database operations in parallel using Promise.all
    const [
      totalCustomers,
      totalVehicles,
      activeJobCards,
      completedJobCards,
      pendingJobCards,
      bodyShopJobs,
      waitingPartsJobCards,
      revenueThisMonthAgg,
      revenueThisYearAgg,
      pendingPaymentsAgg,
      inventoryStatsAgg,
      lowStockItemsListQuery,
      totalVendors,
      recentPurchases,
      insuranceClaims,
      totalGatePasses,
      issuedToday,
      pendingReturns,
      returnedMaterials,
      latestAuditLogs
    ] = await Promise.all([
      Customer.countDocuments(queryFilter),
      Vehicle.countDocuments(queryFilter),
      
      isHistorical ? JobCard.countDocuments({
        createdAt: { $lte: endOfDay },
        $or: [
          { status: { $ne: 'Delivered' } },
          { updatedAt: { $gt: endOfDay } }
        ]
      }) : JobCard.countDocuments({ status: { $in: ['Work in Progress', 'Work In Progress', 'Body Shop', 'Repair', 'Quality Test', 'Quality Check', 'Ready for Delivery'] } }),
      
      isHistorical ? JobCard.countDocuments({
        status: 'Delivered',
        updatedAt: { $lte: endOfDay }
      }) : JobCard.countDocuments({ status: { $in: ['Delivered', 'Closed'] } }),
      
      isHistorical ? JobCard.countDocuments({
        createdAt: { $lte: endOfDay },
        status: { $in: ['Created', 'Inspect Stage', 'Estimation', 'Customer Approval'] },
        $or: [
          { status: { $ne: 'Delivered' } },
          { updatedAt: { $gt: endOfDay } }
        ]
      }) : JobCard.countDocuments({
        status: { $in: ['Waiting for Customer Approval', 'Created', 'Inspect Stage', 'Estimation', 'Customer Approval'] }
      }),
      
      isHistorical ? JobCard.countDocuments({
        createdAt: { $lte: endOfDay },
        $or: [
          { status: 'Body Shop' },
          { workCategory: 'B/P' }
        ],
        $or: [
          { status: { $ne: 'Delivered' } },
          { updatedAt: { $gt: endOfDay } }
        ]
      }) : JobCard.countDocuments({
        $or: [
          { status: 'Body Shop' },
          { workCategory: 'B/P' }
        ]
      }),

      isHistorical ? Promise.resolve(0) : JobCard.countDocuments({ status: 'Parts Procuring' }),

      Invoice.aggregate([
        { $match: { status: 'Finalized', date: { $gte: startOfMonth, $lte: endOfDay } } },
        { $group: { _id: null, total: { $sum: '$totals.grandTotal' } } }
      ]),

      Invoice.aggregate([
        { $match: { status: 'Finalized', date: { $gte: startOfYear, $lte: endOfDay } } },
        { $group: { _id: null, total: { $sum: '$totals.grandTotal' } } }
      ]),

      Invoice.aggregate([
        {
          $match: isHistorical ? {
            status: 'Finalized',
            date: { $lte: endOfDay },
            $or: [
              { paymentStatus: { $ne: 'Paid' } },
              { updatedAt: { $gt: endOfDay } }
            ]
          } : {
            status: 'Finalized',
            paymentStatus: { $ne: 'Paid' }
          }
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $cond: [
                  { $ifNull: ['$balanceDue', false] },
                  '$balanceDue',
                  { $subtract: ['$totals.roundedGrandTotal', { $ifNull: ['$advanceReceived', 0] }] }
                ]
              }
            }
          }
        }
      ]),

      Inventory.aggregate([
        { $match: isHistorical ? { createdAt: { $lte: endOfDay } } : {} },
        {
          $group: {
            _id: null,
            inventoryValue: {
              $sum: { $multiply: [ { $ifNull: ['$stockQuantity', 0] }, { $ifNull: ['$purchasePrice', 0] } ] }
            },
            sellingValuation: {
              $sum: { $multiply: [ { $ifNull: ['$stockQuantity', 0] }, { $ifNull: ['$sellingPrice', 0] } ] }
            },
            lowStockItems: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: [{ $ifNull: ['$stockQuantity', 0] }, 0] },
                      { $lte: [{ $ifNull: ['$stockQuantity', 0] }, { $ifNull: ['$lowStockThreshold', 5] }] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            outOfStockItems: {
              $sum: {
                $cond: [
                  { $lte: [{ $ifNull: ['$stockQuantity', 0] }, 0] },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),

      Inventory.find({
        $or: [
          { $expr: { $lte: ["$currentStock", "$minimumStock"] } },
          { $expr: { $lte: ["$stockQuantity", "$lowStockThreshold"] } }
        ]
      })
      .select('partName partNumber currentStock stockQuantity minimumStock lowStockThreshold')
      .lean(),

      VendorModel.countDocuments(isHistorical ? { createdAt: { $lte: endOfDay } } : {}),

      PurchaseModel.find(isHistorical ? { createdAt: { $lte: endOfDay } } : {})
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      InsuranceClaim.countDocuments(isHistorical ? { createdAt: { $lte: endOfDay } } : {}),

      GatePass.countDocuments(isHistorical ? { createdAt: { $lte: endOfDay } } : {}),
      
      GatePass.countDocuments({
        createdAt: { $gte: startOfDay, $lte: endOfDay }
      }),

      isHistorical ? GatePass.countDocuments({
        createdAt: { $lte: endOfDay },
        status: 'Pending',
        $or: [
          { status: 'Pending' },
          { updatedAt: { $gt: endOfDay } }
        ]
      }) : GatePass.countDocuments({ status: 'Pending' }),

      isHistorical ? GatePass.countDocuments({
        status: 'Returned',
        updatedAt: { $lte: endOfDay }
      }) : GatePass.countDocuments({ status: 'Returned' }),

      AuditLog.find(isHistorical ? { createdAt: { $lte: endOfDay } } : {})
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
    ]);

    const revenueThisMonth = revenueThisMonthAgg[0] ? revenueThisMonthAgg[0].total : 0;
    const revenueThisYear = revenueThisYearAgg[0] ? revenueThisYearAgg[0].total : 0;
    const pendingPayments = pendingPaymentsAgg[0] ? pendingPaymentsAgg[0].total : 0;

    const valStats = inventoryStatsAgg[0] || { inventoryValue: 0, sellingValuation: 0, lowStockItems: 0, outOfStockItems: 0 };
    const { inventoryValue, sellingValuation, lowStockItems, outOfStockItems } = valStats;

    const lowStockItemsList = lowStockItemsListQuery.map(item => {
      const curStock = item.currentStock !== undefined ? item.currentStock : item.stockQuantity;
      const minStock = item.minimumStock !== undefined ? item.minimumStock : item.lowStockThreshold;
      return {
        partName: item.partName,
        partNumber: item.partNumber,
        currentStock: curStock,
        minimumStock: minStock,
        severity: curStock === 0 ? 'CRITICAL' : 'WARNING'
      };
    });

    res.send({
      noData,
      totalCustomers,
      totalVehicles,
      activeJobCards,
      completedJobCards,
      pendingJobCards,
      waitingPartsJobCards,
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
router.get('/charts', auth, async (req, res) => {
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

    // Fetch all aggregations in parallel
    const [
      monthlyRevenueAgg,
      serviceTypeAgg,
      topPartsAgg,
      billingBreakdownAgg
    ] = await Promise.all([
      Invoice.aggregate([
        {
          $match: {
            status: 'Finalized',
            date: { $gte: sixMonthsAgo, $lte: endOfDay }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' }
            },
            total: { $sum: '$totals.grandTotal' }
          }
        }
      ]),
      JobCard.aggregate(
        isHistorical
          ? [
              { $match: { createdAt: { $lte: endOfDay } } },
              { $group: { _id: '$serviceType', count: { $sum: 1 } } }
            ]
          : [
              { $group: { _id: '$serviceType', count: { $sum: 1 } } }
            ]
      ),
      Invoice.aggregate([
        {
          $match: {
            status: 'Finalized',
            date: { $lte: endOfDay }
          }
        },
        { $unwind: '$parts' },
        {
          $group: {
            _id: '$parts.name',
            qty: { $sum: '$parts.qty' }
          }
        },
        { $sort: { qty: -1 } },
        { $limit: 5 }
      ]),
      Invoice.aggregate([
        {
          $match: {
            status: 'Finalized',
            date: { $lte: endOfDay }
          }
        },
        {
          $group: {
            _id: null,
            parts: { $sum: '$totals.partsTotal' },
            labour: { $sum: '$totals.labourTotal' },
            gst: { $sum: '$totals.gstTotal' }
          }
        }
      ])
    ]);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const revenueMap = {};

    // Initialize last 6 months relative to targetDate
    for (let i = 5; i >= 0; i--) {
      const d = new Date(targetDate);
      d.setMonth(d.getMonth() - i);
      const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      revenueMap[key] = 0;
    }

    monthlyRevenueAgg.forEach(item => {
      if (item._id && item._id.month) {
        const mIdx = item._id.month - 1;
        const key = `${monthNames[mIdx]} ${item._id.year}`;
        if (revenueMap[key] !== undefined) {
          revenueMap[key] = item.total;
        }
      }
    });

    const revenueChart = Object.entries(revenueMap).map(([month, amount]) => ({
      month,
      amount: Math.round(amount * 100) / 100
    }));

    const serviceTypeChart = serviceTypeAgg.map(item => ({
      name: item._id || 'General Servicing',
      value: item.count
    }));

    const topPartsChart = topPartsAgg.map(item => ({
      name: item._id,
      qty: item.qty
    }));

    const breakdown = billingBreakdownAgg[0] || { parts: 0, labour: 0, gst: 0 };
    const billingBreakdown = {
      spareParts: Math.round((breakdown.parts || 0) * 100) / 100,
      labour: Math.round((breakdown.labour || 0) * 100) / 100,
      gst: Math.round((breakdown.gst || 0) * 100) / 100
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

    // Search concurrently using Promise.all and lean() for optimal performance
    const Employee = require('../models/Employee');
    const [customers, vehicles, jobcards, invoices, inventory, employees, claims] = await Promise.all([
      Customer.find({
        $or: [
          { name: regex },
          { mobile: regex },
          { email: regex }
        ]
      }).limit(5).lean(),
      Vehicle.find({
        $or: [
          { vehicleNumber: regex },
          { chassisNumber: regex },
          { make: regex },
          { model: regex }
        ]
      }).limit(5).lean(),
      JobCard.find({
        jobCardNo: regex
      }).limit(5).lean(),
      Invoice.find({
        invoiceNo: regex
      }).limit(5).lean(),
      Inventory.find({
        $or: [
          { partName: regex },
          { partNumber: regex }
        ]
      }).limit(5).lean(),
      Employee.find({
        $or: [
          { name: regex },
          { email: regex },
          { phone: regex }
        ]
      }).limit(5).lean(),
      InsuranceClaim.find({
        $or: [
          { claimNo: regex },
          { insuranceCompany: regex }
        ]
      }).limit(5).lean()
    ]);

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
router.get('/summary', auth, async (req, res) => {
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
      // Run both aggregation pipelines in parallel
      const [summaryAgg, expensesAgg] = await Promise.all([
        JobCard.aggregate([
          {
            $match: {
              status: { $in: ['Delivered', 'Closed'] },
              updatedAt: { $gte: s, $lte: e }
            }
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              salePartsValue: { $sum: { $toDouble: { $ifNull: ['$billingSummary.partsSaleAmount', 0] } } },
              purchasePartsValue: { $sum: { $toDouble: { $ifNull: ['$billingSummary.partsPurchaseAmount', 0] } } },
              labourRevenue: { $sum: { $toDouble: { $ifNull: ['$billingSummary.labourAmount', 0] } } },
              grossProfit: { $sum: { $toDouble: { $ifNull: ['$billingSummary.grossProfit', 0] } } },
              gstCollected: { $sum: { $toDouble: { $ifNull: ['$billingSummary.totalGST', 0] } } },
              discounts: { $sum: { $toDouble: { $ifNull: ['$billingSummary.totalDiscount', 0] } } },
              totalBilling: { $sum: { $toDouble: { $ifNull: ['$billingSummary.grandTotal', 0] } } }
            }
          }
        ]),
        Expense.aggregate([
          {
            $match: {
              date: { $gte: s, $lte: e }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' }
            }
          }
        ])
      ]);

      const data = summaryAgg[0] || {
        count: 0,
        salePartsValue: 0,
        purchasePartsValue: 0,
        labourRevenue: 0,
        grossProfit: 0,
        gstCollected: 0,
        discounts: 0,
        totalBilling: 0
      };

      const totalExpenses = expensesAgg[0] ? expensesAgg[0].total : 0;
      const netProfit = data.grossProfit - totalExpenses;

      return {
        closedJobCardsCount: data.count,
        salePartsValue: Math.round(data.salePartsValue * 100) / 100,
        purchasePartsValue: Math.round(data.purchasePartsValue * 100) / 100,
        labourRevenue: Math.round(data.labourRevenue * 100) / 100,
        grossProfit: Math.round(data.grossProfit * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        gstCollected: Math.round(data.gstCollected * 100) / 100,
        discounts: Math.round(data.discounts * 100) / 100,
        totalBilling: Math.round(data.totalBilling * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100
      };
    };

    // Parallelize all three calls to getDashboardSummaryData
    const todayStart = new Date(targetDate);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(targetDate);
    todayEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date(targetDate);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(targetDate);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    monthEnd.setDate(0);
    monthEnd.setHours(23, 59, 59, 999);

    const [periodStats, todayStats, monthlyStats] = await Promise.all([
      getDashboardSummaryData(start, end),
      getDashboardSummaryData(todayStart, todayEnd),
      getDashboardSummaryData(monthStart, monthEnd)
    ]);

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
router.get('/reports', auth, async (req, res) => {
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

    const [closedCards, expenses] = await Promise.all([
      JobCard.find({
        status: { $in: ['Delivered', 'Closed'] },
        updatedAt: { $lte: endOfDay }
      }).select('billingSummary updatedAt').lean(),
      Expense.find({
        date: { $lte: endOfDay }
      }).select('amount date').lean()
    ]);

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
