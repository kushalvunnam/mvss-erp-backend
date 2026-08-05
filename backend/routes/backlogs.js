const express = require('express');
const Backlog = require('../models/Backlog');
const Inventory = require('../models/Inventory');
const Vendor = require('../models/Vendor');
const Purchase = require('../models/Purchase');
const { auth, restrictTo } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const mongoose = require('mongoose');
const router = express.Router();

router.use((req, res, next) => {
  console.log(`[BACKLOGS] Request received: ${req.method} ${req.baseUrl}${req.path}`);
  next();
});

// Helper to generate unique Backlog ID
const generateBacklogId = async () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const prefix = `BL-${year}${month}-`;
  
  // Find count of entries starting with this month prefix
  const count = await Backlog.countDocuments({ backlogId: new RegExp('^' + prefix) });
  const sequence = String(count + 1).padStart(4, '0');
  return `${prefix}${sequence}`;
};

const { getNextSequence } = require('../utils/documentNumbering');

// Helper to generate Purchase entry number
const generatePurchaseNo = async () => {
  return await getNextSequence('PUR', 'Purchase');
};

// Apply auth middleware to all routes
router.use(auth);

// 1. GET: List procurement backlogs with search, filtering, and role-based constraints
router.get('/', async (req, res) => {
  try {
    const { 
      search, 
      status, 
      priority, 
      vendorName, 
      partNumber, 
      jobCardNo, 
      vehicleNo,
      orderedFromDate,
      orderedToDate,
      expectedFromDate,
      expectedToDate
    } = req.query;

    let query = {};

    // Role Permission Constraint: Service Advisors only see their assigned/created entries
    if (req.user.role === 'Service') {
      query.$or = [
        { serviceAdvisorId: req.user.id },
        { createdBy: req.user.name }
      ];
    }

    // Status / Priority filter
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (vendorName) query.vendorName = { $regex: vendorName, $options: 'i' };
    if (partNumber) query.partNumber = { $regex: partNumber, $options: 'i' };
    if (jobCardNo) query.jobCardNo = { $regex: jobCardNo, $options: 'i' };
    if (vehicleNo) query.vehicleNo = { $regex: vehicleNo, $options: 'i' };

    // Ordered Date Range filter
    if (orderedFromDate || orderedToDate) {
      query.orderedDate = {};
      if (orderedFromDate) {
        const start = new Date(orderedFromDate);
        start.setHours(0,0,0,0);
        query.orderedDate.$gte = start;
      }
      if (orderedToDate) {
        const end = new Date(orderedToDate);
        end.setHours(23,59,59,999);
        query.orderedDate.$lte = end;
      }
    }

    // Expected Delivery Date Range filter
    if (expectedFromDate || expectedToDate) {
      query.expectedDeliveryDate = {};
      if (expectedFromDate) {
        const start = new Date(expectedFromDate);
        start.setHours(0,0,0,0);
        query.expectedDeliveryDate.$gte = start;
      }
      if (expectedToDate) {
        const end = new Date(expectedToDate);
        end.setHours(23,59,59,999);
        query.expectedDeliveryDate.$lte = end;
      }
    }

    // Search term matching multiple fields
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      const searchConditions = [
        { vehicleNo: searchRegex },
        { jobCardNo: searchRegex },
        { partNumber: searchRegex },
        { partName: searchRegex },
        { vendorName: searchRegex },
        { customerName: searchRegex }
      ];
      
      // Merge search conditions with existing query
      if (query.$or) {
        query = { $and: [ { $or: query.$or }, { $or: searchConditions } ] };
      } else {
        query.$or = searchConditions;
      }
    }

    const backlogs = await Backlog.find(query).sort({ expectedDeliveryDate: 1, createdAt: -1 });
    res.send(backlogs);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch procurement backlogs: ' + error.message });
  }
});

// 2. GET single backlog
router.get('/:id', async (req, res) => {
  try {
    const backlog = await Backlog.findById(req.params.id);
    if (!backlog) return res.status(404).send({ error: 'Backlog entry not found.' });
    
    // Service Advisor authorization check
    if (req.user.role === 'Service') {
      const isOwner = backlog.createdBy === req.user.name || 
                      (backlog.serviceAdvisorId && backlog.serviceAdvisorId.toString() === req.user.id);
      if (!isOwner) {
        return res.status(403).send({ error: 'Access denied to this backlog entry.' });
      }
    }

    res.send(backlog);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch backlog details: ' + error.message });
  }
});

router.post('/', restrictTo('Admin', 'Accounts', 'Service', 'Body Shop', 'Spares'), async (req, res) => {
  try {
    const { 
      vehicleNo, 
      customerName, 
      jobCardNo, 
      vehicleModel, 
      vendorName, 
      vendorContact, 
      poNumber, 
      orderedDate, 
      expectedDeliveryDate, 
      priority, 
      remarks,
      items // Array of { partNumber, partName, brand, qty }
    } = req.body;

    if (!vehicleNo || !vehicleModel || !vendorName || !expectedDeliveryDate) {
      return res.status(400).send({ error: 'Required fields missing: vehicleNo, vehicleModel, vendorName, expectedDeliveryDate' });
    }

    // Resolve Customer Details from Job Card if missing
    let serviceAdvisorId = req.user.role === 'Service' ? req.user.id : undefined;
    let serviceAdvisorName = req.user.role === 'Service' ? req.user.name : '';
    let finalCustomerName = customerName || '';

    if (jobCardNo) {
      try {
        const JobCard = mongoose.model('JobCard');
        const jc = await JobCard.findOne({ jobCardNo: jobCardNo.trim() });
        if (jc) {
          serviceAdvisorId = jc.serviceAdvisorId;
          serviceAdvisorName = jc.serviceAdvisorName;
          
          if (!finalCustomerName && jc.customerId) {
            const Customer = mongoose.model('Customer');
            const cust = await Customer.findById(jc.customerId);
            if (cust) {
              finalCustomerName = cust.name;
            }
          }
        }
      } catch (err) {
        console.error('JobCard validation lookup failed:', err);
      }
    }

    const baseBacklogId = await generateBacklogId();
    const savedBacklogs = [];

    // If items array is provided, process multiple parts
    if (items && Array.isArray(items) && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.partNumber || !item.partName || !item.qty) {
          return res.status(400).send({ error: `Item #${i + 1}: Required fields missing: partNumber, partName, qty` });
        }

        const backlogId = i === 0 ? baseBacklogId : `${baseBacklogId}-${i}`;

        const backlog = new Backlog({
          backlogId,
          vehicleNo,
          customerName: finalCustomerName,
          jobCardNo,
          vehicleModel,
          partNumber: item.partNumber,
          partName: item.partName,
          brand: item.brand || '',
          qty: Number(item.qty) || 1,
          vendorName,
          vendorContact,
          poNumber,
          orderedDate: orderedDate ? new Date(orderedDate) : new Date(),
          expectedDeliveryDate: new Date(expectedDeliveryDate),
          priority: priority || 'Medium',
          remarks: remarks || '',
          serviceAdvisorId,
          serviceAdvisorName,
          createdBy: req.user ? req.user.name : 'Staff'
        });

        await backlog.save();
        savedBacklogs.push(backlog);
      }
    } else {
      // Fallback to single part format
      const { partNumber, partName, brand, qty } = req.body;
      if (!partNumber || !partName || !qty) {
        return res.status(400).send({ error: 'Required fields missing: partNumber, partName, qty' });
      }

      const backlog = new Backlog({
        backlogId: baseBacklogId,
        vehicleNo,
        customerName: finalCustomerName,
        jobCardNo,
        vehicleModel,
        partNumber,
        partName,
        brand: brand || '',
        qty: Number(qty) || 1,
        vendorName,
        vendorContact,
        poNumber,
        orderedDate: orderedDate ? new Date(orderedDate) : new Date(),
        expectedDeliveryDate: new Date(expectedDeliveryDate),
        priority: priority || 'Medium',
        remarks: remarks || '',
        serviceAdvisorId,
        serviceAdvisorName,
        createdBy: req.user ? req.user.name : 'Staff'
      });

      await backlog.save();
      savedBacklogs.push(backlog);
    }

    res.status(201).send(savedBacklogs.length === 1 ? savedBacklogs[0] : savedBacklogs);
  } catch (error) {
    res.status(400).send({ error: 'Failed to create backlog request: ' + error.message });
  }
});

// 4. PUT: Update Backlog Details (Restricted from Service Advisor updates)
router.put('/:id', restrictTo('Admin', 'Accounts', 'Body Shop', 'Spares'), async (req, res) => {
  try {
    const backlog = await Backlog.findById(req.params.id);
    if (!backlog) return res.status(404).send({ error: 'Backlog entry not found.' });

    // Block core fields changes if already received, but allow status changes
    const postReceivedStatuses = ['Received', 'In Stock', 'Issued', 'Completed'];
    const isPostReceived = postReceivedStatuses.includes(backlog.status);

    if (isPostReceived) {
      const restrictedFields = [
        'vehicleNo', 'customerName', 'jobCardNo', 'vehicleModel',
        'partNumber', 'partName', 'brand', 'qty', 'vendorName',
        'vendorContact', 'poNumber', 'orderedDate'
      ];
      const modifyingRestricted = restrictedFields.some(field => 
        req.body[field] !== undefined && String(req.body[field]) !== String(backlog[field])
      );
      if (modifyingRestricted) {
        return res.status(400).send({ error: 'Cannot modify backlog part/quantity/details after the item has been marked as Received.' });
      }
    }

    const updatableFields = [
      'vehicleNo', 'customerName', 'jobCardNo', 'vehicleModel',
      'partNumber', 'partName', 'brand', 'qty', 'vendorName',
      'vendorContact', 'poNumber', 'orderedDate', 'expectedDeliveryDate',
      'priority', 'remarks', 'status'
    ];

    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        backlog[field] = req.body[field];
      }
    });

    backlog.lastUpdatedBy = req.user.name;
    await backlog.save();

    await logAction(req.user, 'BACKLOG_UPDATE', `Updated details for backlog ${backlog.backlogId} (${backlog.partName})`, req);
    res.send(backlog);
  } catch (error) {
    res.status(400).send({ error: 'Failed to update backlog: ' + error.message });
  }
});

// 5. PUT: Mark Backlog as Received (Updates status, restocks inventory and logs purchase history)
router.put('/:id/receive', restrictTo('Admin', 'Accounts', 'Body Shop', 'Spares'), async (req, res) => {
  try {
    const backlog = await Backlog.findById(req.params.id);
    if (!backlog) return res.status(404).send({ error: 'Backlog entry not found.' });

    const postReceivedStatuses = ['Received', 'In Stock', 'Issued', 'Completed'];
    if (postReceivedStatuses.includes(backlog.status)) {
      return res.status(400).send({ error: 'This backlog item has already been received.' });
    }

    const roundToTwo = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

    // A. Update backlog status
    backlog.status = 'Received';
    backlog.receivedDate = new Date();
    backlog.lastUpdatedBy = req.user.name;
    await backlog.save();

    // B. Integrate with Parts & Labour Master (Find or Create Inventory Item)
    let inventoryItem = await Inventory.findOne({ partNumber: backlog.partNumber.trim() });
    
    // Find or create Vendor object to prevent schema validation failures in Purchase History
    let vendor = await Vendor.findOne({ name: { $regex: new RegExp('^' + backlog.vendorName.trim() + '$', 'i') } });
    if (!vendor) {
      vendor = new Vendor({
        name: backlog.vendorName.trim(),
        vendorCode: `VND-AUTO-${Date.now().toString().slice(-6)}`,
        phone: backlog.vendorContact || '0000000000',
        mobile: backlog.vendorContact || '0000000000',
        address: 'Auto-created via Backlog procurement trigger'
      });
      await vendor.save();
    }

    if (inventoryItem) {
      inventoryItem.stockQuantity += backlog.qty;
      inventoryItem.vendorId = vendor._id;
      inventoryItem.vendorName = vendor.name;
      await inventoryItem.save();
    } else {
      inventoryItem = new Inventory({
        partName: backlog.partName,
        partNumber: backlog.partNumber,
        hsnCode: '8708',
        stockQuantity: backlog.qty,
        purchasePrice: 0,
        sellingPrice: 0,
        mrp: 0,
        gstPercent: 18,
        brand: backlog.brand || '',
        vendorId: vendor._id,
        vendorName: vendor.name,
        warehouse: 'Main Store'
      });
      await inventoryItem.save();
    }

    // C. Integrate with Purchases (Create history record of the procurement receipt)
    const purchaseNo = await generatePurchaseNo();
    const mockRate = 0; // Procurement price is unknown at receipt stage
    const mockTotal = 0;
    
    const purchaseEntry = new Purchase({
      purchaseNo,
      vendorId: vendor._id,
      vendorName: vendor.name,
      date: new Date(),
      invoiceNo: backlog.poNumber || `RCV-${backlog.backlogId}`,
      invoiceDate: new Date(),
      items: [{
        partId: inventoryItem._id,
        partNumber: inventoryItem.partNumber,
        partName: inventoryItem.partName,
        hsnCode: inventoryItem.hsnCode || '8708',
        warehouse: inventoryItem.warehouse || 'Main Store',
        qty: backlog.qty,
        purchasePrice: mockRate,
        sellingPrice: inventoryItem.sellingPrice,
        mrp: inventoryItem.mrp,
        gstPercent: inventoryItem.gstPercent || 18,
        taxableAmount: 0,
        gstAmount: 0,
        total: 0
      }],
      totals: {
        totalQty: backlog.qty,
        subtotal: 0,
        totalDiscount: 0,
        taxableAmount: 0,
        gstTotal: 0,
        grandTotal: 0
      },
      paymentStatus: 'Paid',
      amountPaid: 0,
      notes: backlog.remarks || `Received from Backlog Request ${backlog.backlogId}`,
      createdBy: req.user ? req.user.name : 'System'
    });

    await purchaseEntry.save();

    await logAction(req.user, 'BACKLOG_RECEIVE', `Received backlog parts for request ${backlog.backlogId}. Restocked ${backlog.qty} units of ${backlog.partName} and logged Purchase Entry ${purchaseNo}`, req);
    res.send({ backlog, inventoryItem, purchase: purchaseEntry });
  } catch (error) {
    res.status(400).send({ error: 'Failed to process backlog item receipt: ' + error.message });
  }
});

// 6. DELETE: Delete Backlog Request (Restricted to Admin Only)
router.delete('/:id', restrictTo('Admin'), async (req, res) => {
  try {
    const backlog = await Backlog.findById(req.params.id);
    if (!backlog) return res.status(404).send({ error: 'Backlog entry not found.' });

    await Backlog.findByIdAndDelete(req.params.id);
    await logAction(req.user, 'BACKLOG_DELETE', `Deleted backlog entry ${backlog.backlogId} (${backlog.partName})`, req);
    
    res.send({ message: `Backlog entry ${backlog.backlogId} has been deleted.` });
  } catch (error) {
    res.status(500).send({ error: 'Failed to delete backlog entry: ' + error.message });
  }
});

module.exports = router;
