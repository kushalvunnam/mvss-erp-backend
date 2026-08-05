const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const JobCard = require('../models/JobCard');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const { auth, restrictTo } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const { generateJobCardPDF, generateGatePassPDF } = require('../utils/pdfGenerator');
const { getNextSequence } = require('../utils/documentNumbering');
const router = express.Router();

// Multer Local Storage Config
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
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Helper to auto-generate Job Card Number
const generateJobCardNo = async () => {
  return await getNextSequence('JC', 'JobCard');
};

// List all job cards with search & filters
router.get('/', auth, async (req, res) => {
  try {
    const { search, status, advisor } = req.query;
    let query = {};

    if (status) {
      query.status = status;
    }

    if (advisor) {
      query.serviceAdvisorId = advisor;
    }

    let customerIds = [];
    let vehicleIds = [];

    if (search) {
      // Find matching customers or vehicles
      const customers = await Customer.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } }
        ]
      });
      customerIds = customers.map(c => c._id);

      const vehicles = await Vehicle.find({
        vehicleNumber: { $regex: search, $options: 'i' }
      });
      vehicleIds = vehicles.map(v => v._id);

      query.$or = [
        { jobCardNo: { $regex: search, $options: 'i' } },
        { customerId: { $in: customerIds } },
        { vehicleId: { $in: vehicleIds } }
      ];
    }

    const jobCards = await JobCard.find(query)
      .populate('customerId')
      .populate('vehicleId')
      .populate('serviceAdvisorId', 'name')
      .sort({ createdAt: -1 });

    res.send(jobCards);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch job cards.' });
  }
});

// General Service History: search complete vehicle service and invoice records
router.get('/service-history', auth, async (req, res) => {
  try {
    const { search } = req.query;
    if (!search || !search.trim()) {
      return res.send([]);
    }

    const term = search.trim();

    const customers = await Customer.find({
      $or: [
        { name: { $regex: term, $options: 'i' } },
        { mobile: { $regex: term, $options: 'i' } }
      ]
    });
    const customerIds = customers.map(c => c._id);

    const vehicles = await Vehicle.find({
      $or: [
        { vehicleNumber: { $regex: term, $options: 'i' } },
        { chassisNumber: { $regex: term, $options: 'i' } }
      ]
    });
    const vehicleIds = vehicles.map(v => v._id);

    const ExternalRepair = require('../models/ExternalRepair');
    const externalRepairs = await ExternalRepair.find({ status: { $ne: 'Cancelled' } }).select('jobCardId');
    const externalJcIds = externalRepairs.map(er => er.jobCardId).filter(Boolean);

    const jobCards = await JobCard.find({
      status: { $in: ['Delivered', 'Closed'] },
      workCategory: { $in: ['PMS', 'General Service', 'RR', 'Corporate'] },
      jobType: { $nin: ['Insurance Job'] },
      serviceType: { $in: ['General Servicing', 'Paid Service'] },
      _id: { $nin: externalJcIds },
      $or: [
        { jobCardNo: { $regex: term, $options: 'i' } },
        { customerId: { $in: customerIds } },
        { vehicleId: { $in: vehicleIds } }
      ]
    })
      .populate('customerId')
      .populate('vehicleId')
      .sort({ createdAt: -1 });

    const Invoice = require('../models/Invoice');
    const Estimate = require('../models/Estimate');

    const history = await Promise.all(jobCards.map(async (jc) => {
      const invoice = await Invoice.findOne({ jobCardId: jc._id }).sort({ createdAt: -1 });
      const estimate = invoice ? null : await Estimate.findOne({ jobCardId: jc._id }).sort({ createdAt: -1 });
      const source = invoice || estimate;

      const servicesPerformed = source && Array.isArray(source.labour)
        ? source.labour.map(l => l.description).filter(Boolean)
        : [];
      const partsReplaced = source && Array.isArray(source.parts)
        ? source.parts.map(p => p.name).filter(Boolean)
        : [];

      const invoiceAmount = invoice
        ? (invoice.totals?.roundedGrandTotal || invoice.totals?.grandTotal || 0)
        : (jc.billingSummary?.grandTotal || jc.estAmt || 0);

      const vehicle = jc.vehicleId || {};
      const customer = jc.customerId || {};

      return {
        _id: jc._id,
        visitDate: jc.date || jc.createdAt,
        jobCardNo: jc.jobCardNo,
        vehicleNumber: vehicle.vehicleNumber || 'N/A',
        model: vehicle.model ? `${vehicle.make || ''} ${vehicle.model}`.trim() : (vehicle.make || 'N/A'),
        chassisNumber: vehicle.chassisNumber || '',
        customerName: customer.name || 'N/A',
        customerMobile: customer.mobile || 'N/A',
        odometer: jc.odometerReading || 0,
        technician: jc.technicianName || 'N/A',
        invoiceAmount: Number(invoiceAmount) || 0,
        status: jc.status || 'N/A',
        servicesPerformed,
        partsReplaced
      };
    }));

    res.send(history);
  } catch (error) {
    console.error('Failed to fetch service history:', error);
    res.status(500).send({ error: 'Failed to fetch service history.' });
  }
});

router.post('/', auth, restrictTo('Admin', 'Service', 'Accounts', 'Body Shop', 'Reception'), async (req, res) => {
  try {
    let jobCard;
    let saved = false;
    let attempts = 0;
    let currentJobCardNo = '';

    while (!saved && attempts < 3) {
      try {
        currentJobCardNo = await generateJobCardNo();
        const today = new Date();
        const timeStr = today.toTimeString().split(' ')[0].slice(0, 5); // HH:MM

        const initialStatus = req.body.status || 'Waiting for Customer Approval';
        const jobCardData = {
          ...req.body,
          jobCardNo: currentJobCardNo,
          time: req.body.time || timeStr,
          serviceAdvisorId: req.user._id,
          status: initialStatus,
          statusHistory: [{
            status: initialStatus,
            changedAt: new Date(),
            changedBy: req.user ? req.user.name : 'System',
            remarks: 'Initial Job Card Creation'
          }]
        };

        jobCard = new JobCard(jobCardData);
        await jobCard.save();
        saved = true;
      } catch (saveErr) {
        attempts++;
        if (saveErr.code === 11000 && attempts < 3) {
          console.warn(`[Duplicate JobCardNo] Collision detected for ${currentJobCardNo}, retrying generation (Attempt ${attempts})...`);
          continue;
        }
        throw saveErr;
      }
    }

    // Automatically create a notification
    try {
      const Customer = require('../models/Customer');
      const VehicleModel = require('../models/Vehicle');
      const Notification = require('../models/Notification');
      
      const customer = await Customer.findById(jobCard.customerId);
      const vehicle = await VehicleModel.findById(jobCard.vehicleId);

      const notification = new Notification({
        type: 'jobcard',
        title: 'Job Card Created',
        message: `Job card ${jobCard.jobCardNo} has been created for vehicle ${vehicle ? vehicle.vehicleNumber : 'N/A'}.`,
        vehicleNumber: vehicle ? vehicle.vehicleNumber : undefined,
        customerName: customer ? customer.name : undefined
      });
      await notification.save();
    } catch (notifErr) {
      console.error('Failed to create job card notification:', notifErr);
    }

    // Update odometer reading on the Vehicle model
    await Vehicle.findByIdAndUpdate(jobCard.vehicleId, { odometerReading: jobCard.odometerReading });

    await logAction(req.user, 'JOBCARD_CREATE', `Created Job Card ${jobCard.jobCardNo} for vehicle ID ${jobCard.vehicleId}`, req);
    res.status(201).send(jobCard);
  } catch (error) {
    res.status(400).send({ error: 'Failed to create job card: ' + error.message });
  }
});

// Upload Photo
router.post('/:id/photo', auth, upload.single('photo'), async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    const photoType = req.body.photoType || 'Vehicle';
    const fileUrl = `/uploads/${req.file.filename}`;

    jobCard.photos.push({
      url: fileUrl,
      photoType
    });
    
    await jobCard.save();
    res.send({ message: 'Photo uploaded successfully.', photos: jobCard.photos });
  } catch (error) {
    res.status(500).send({ error: 'Failed to upload photo.' });
  }
});

// Update digital job card
router.put('/:id', auth, async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    let statusChanged = false;
    if (req.body.status && req.body.status !== jobCard.status) {
      statusChanged = true;
      const newStatus = req.body.status;
      const oldStatus = jobCard.status;

      // Role check: Admin, Service Advisor, Workshop Manager, Branch Manager can update the status.
      // Other roles have read-only access.
      const allowedRoles = ['Super Admin', 'Admin', 'Service', 'Spares', 'Branch Manager', 'Workshop Manager'];
      if (!allowedRoles.includes(req.user?.role)) {
        return res.status(403).send({ error: 'You do not have permission to update the Job Card workflow status.' });
      }

      // Rule 1: Delivered is allowed only after the invoice is generated and payment status is Fully Paid.
      if (newStatus === 'Delivered') {
        const Invoice = require('../models/Invoice');
        const invoice = await Invoice.findOne({ jobCardId: jobCard._id });
        if (!invoice) {
          return res.status(400).send({ error: 'Delivered status is allowed only after the Invoice is generated.' });
        }
        if (jobCard.paymentStatus !== 'Fully Paid') {
          return res.status(400).send({ error: 'Delivered status is allowed only when payment status is Fully Paid.' });
        }
      }

      // Rule 2: Ready for Delivery should require Quality Test completion.
      if (newStatus === 'Ready for Delivery') {
        if (jobCard.qcStatus !== 'Pass') {
          return res.status(400).send({ error: 'Ready for Delivery status requires Quality Test completion (QC status must be Pass).' });
        }
      }

      // Rule 3: Work in Progress can only begin after Parts Procuring or if no parts are required.
      if (['Work in Progress', 'Work In Progress'].includes(newStatus)) {
        const Estimate = require('../models/Estimate');
        const estimate = await Estimate.findOne({ jobCardId: jobCard._id });
        const hasParts = estimate && estimate.parts && estimate.parts.length > 0;
        const wasPartsProcuring = oldStatus === 'Parts Procuring' || (jobCard.statusHistory && jobCard.statusHistory.some(h => h.status === 'Parts Procuring'));
        if (hasParts && !wasPartsProcuring) {
          return res.status(400).send({ error: 'Work in Progress can only begin after Parts Procuring or if no parts are required.' });
        }
      }

      jobCard.statusHistory.push({
        status: newStatus,
        previousStatus: oldStatus,
        changedAt: new Date(),
        changedBy: req.user ? req.user.name : 'System',
        remarks: req.body.statusRemarks || `Status changed from ${oldStatus} to ${newStatus}`
      });
    }

    // Apply updates
    const updates = { ...req.body };
    delete updates.statusHistory;
    delete updates.statusRemarks;

    Object.assign(jobCard, updates);
    await jobCard.save();

    if (statusChanged) {
      const { calculateBillingSummary } = require('../utils/billing');
      await calculateBillingSummary(jobCard._id);
    }

    if (req.body.odometerReading) {
      await Vehicle.findByIdAndUpdate(jobCard.vehicleId, { odometerReading: req.body.odometerReading });
    }

    await logAction(req.user, 'JOBCARD_UPDATE', `Updated Job Card ${jobCard.jobCardNo}. Status: ${jobCard.status}`, req);
    res.send(jobCard);
  } catch (error) {
    res.status(400).send({ error: 'Failed to update job card: ' + error.message });
  }
});

// Get Single Job Card Details
router.get('/:id', auth, async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id)
      .populate('customerId')
      .populate('vehicleId')
      .populate('serviceAdvisorId', 'name');

    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });
    res.send(jobCard);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch job card details.' });
  }
});

// Download Job Card PDF
router.get('/:id/pdf', auth, async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    const customer = (jobCard.customerId ? await Customer.findById(jobCard.customerId) : null) || { name: 'Walk-in Customer', mobile: 'N/A' };
    const vehicle = (jobCard.vehicleId ? await Vehicle.findById(jobCard.vehicleId) : null) || { vehicleNumber: 'N/A', make: 'N/A', model: 'N/A' };

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=jobcard-${jobCard.jobCardNo}.pdf`);

    await logAction(req.user, 'REPORT_EXPORTED', `Exported PDF for Job Card ${jobCard.jobCardNo}`, req);

    generateJobCardPDF(jobCard, customer, vehicle, res);
  } catch (error) {
    res.status(500).send({ error: 'Failed to generate PDF: ' + error.message });
  }
});

// Download Gate Pass PDF from Job Card
router.get('/:id/gatepass/pdf', auth, async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    const customer = (jobCard.customerId ? await Customer.findById(jobCard.customerId) : null) || { name: 'Walk-in Customer', mobile: 'N/A' };
    const vehicle = (jobCard.vehicleId ? await Vehicle.findById(jobCard.vehicleId) : null) || { vehicleNumber: 'N/A', make: 'N/A', model: 'N/A' };

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=gatepass-${jobCard.jobCardNo}.pdf`);

    await logAction(req.user, 'REPORT_EXPORTED', `Exported Gate Pass PDF for Job Card ${jobCard.jobCardNo}`, req);

    generateGatePassPDF(jobCard, customer, vehicle, res);
  } catch (error) {
    res.status(500).send({ error: 'Failed to generate Gate Pass PDF: ' + error.message });
  }
});

// DELETE: Delete a Job Card (Admin only)
router.delete('/:id', auth, restrictTo('Admin'), async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    await JobCard.findByIdAndDelete(req.params.id);

    // Create database notification trigger
    try {
      const Notification = require('../models/Notification');
      const Customer = require('../models/Customer');
      const VehicleModel = require('../models/Vehicle');
      const customer = await Customer.findById(jobCard.customerId);
      const vehicle = await VehicleModel.findById(jobCard.vehicleId);

      const notification = new Notification({
        type: 'jobcard',
        title: 'Job Card Deleted',
        message: `Job card ${jobCard.jobCardNo} has been deleted.`,
        vehicleNumber: vehicle ? vehicle.vehicleNumber : undefined,
        customerName: customer ? customer.name : undefined
      });
      await notification.save();
    } catch (notifErr) {
      console.error('Failed to create job card deletion notification:', notifErr);
    }

    await logAction(req.user, 'JOBCARD_DELETE', `Deleted Job Card ${jobCard.jobCardNo}`, req);
    res.send({ message: 'Job Card deleted successfully.' });
  } catch (error) {
    res.status(500).send({ error: 'Failed to delete job card: ' + error.message });
  }
});

// Get all advance payments for a Job Card
router.get('/:id/advance-payments', auth, async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });
    res.send(jobCard.advancePayments || []);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch advance payments: ' + error.message });
  }
});

// Add advance payment to Job Card
router.post('/:id/advance-payments', auth, restrictTo('Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts'), async (req, res) => {
  try {
    const { amount, type, paymentMode, transactionId, remarks, paymentDate } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).send({ error: 'Valid advance payment amount is required.' });
    }
    if (!type || !paymentMode) {
      return res.status(400).send({ error: 'Advance type and payment mode are required.' });
    }

    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    jobCard.advancePayments.push({
      amount: Number(amount),
      type,
      paymentMode,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      transactionId: transactionId || '',
      remarks: remarks || '',
      recordedBy: req.user ? req.user.name : 'System'
    });

    await updateJobCardPaymentStatus(jobCard);
    await jobCard.save();

    await logAction(req.user, 'JOBCARD_ADVANCE_PAYMENT_ADD', `Recorded advance payment of ₹${amount} for Job Card ${jobCard.jobCardNo}`, req);
    res.send(jobCard);
  } catch (error) {
    res.status(400).send({ error: 'Failed to record advance payment: ' + error.message });
  }
});

// Update/edit advance payment on Job Card
router.put('/:id/advance-payments/:paymentId', auth, restrictTo('Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts'), async (req, res) => {
  try {
    const { amount, type, paymentMode, transactionId, remarks, paymentDate } = req.body;
    if (amount !== undefined && (isNaN(amount) || amount <= 0)) {
      return res.status(400).send({ error: 'Valid advance payment amount is required.' });
    }

    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    const payment = jobCard.advancePayments.id(req.params.paymentId);
    if (!payment) {
      return res.status(404).send({ error: 'Advance payment record not found.' });
    }

    if (amount !== undefined) payment.amount = Number(amount);
    if (type !== undefined) payment.type = type;
    if (paymentMode !== undefined) payment.paymentMode = paymentMode;
    if (paymentDate !== undefined) payment.paymentDate = new Date(paymentDate);
    if (transactionId !== undefined) payment.transactionId = transactionId || '';
    if (remarks !== undefined) payment.remarks = remarks || '';

    await updateJobCardPaymentStatus(jobCard);
    await jobCard.save();

    await logAction(req.user, 'JOBCARD_ADVANCE_PAYMENT_UPDATE', `Updated advance payment ID ${payment._id} on Job Card ${jobCard.jobCardNo}`, req);
    res.send(jobCard);
  } catch (error) {
    res.status(400).send({ error: 'Failed to update advance payment: ' + error.message });
  }
});

// Helper to update Job Card Payment Status based on invoice grand totals and payments
const updateJobCardPaymentStatus = async (jobCard) => {
  const Invoice = require('../models/Invoice');
  let invoice = await Invoice.findOne({ jobCardId: jobCard._id, status: 'Finalized' });
  if (!invoice) {
    invoice = await Invoice.findOne({ jobCardId: jobCard._id });
  }

  const finalBillAmount = invoice ? (invoice.totals?.roundedGrandTotal || invoice.totals?.grandTotal || 0) : (jobCard.billingSummary?.grandTotal || 0);

  const totalAdvance = (jobCard.advancePayments || []).reduce((sum, p) => sum + p.amount, 0);
  const totalFinal = (jobCard.finalPayments || []).reduce((sum, p) => sum + p.amount, 0);
  const totalReceived = totalAdvance + totalFinal;

  const pendingAmount = Math.max(0, finalBillAmount - totalReceived);

  if (finalBillAmount > 0) {
    if (pendingAmount <= 0.05) {
      jobCard.paymentStatus = 'Fully Paid';
    } else if (totalReceived > 0) {
      jobCard.paymentStatus = 'Partially Paid';
    } else {
      jobCard.paymentStatus = 'Pending';
    }
  } else {
    jobCard.paymentStatus = totalReceived > 0 ? 'Partially Paid' : 'Pending';
  }
};

// Delete advance payment from Job Card
router.delete('/:id/advance-payments/:paymentId', auth, restrictTo('Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts'), async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    const paymentIndex = jobCard.advancePayments.findIndex(p => p._id.toString() === req.params.paymentId);
    if (paymentIndex === -1) {
      return res.status(404).send({ error: 'Advance payment entry not found.' });
    }

    const removedPayment = jobCard.advancePayments[paymentIndex];
    jobCard.advancePayments.splice(paymentIndex, 1);
    
    await updateJobCardPaymentStatus(jobCard);
    await jobCard.save();

    await logAction(req.user, 'JOBCARD_ADVANCE_PAYMENT_REMOVE', `Deleted advance payment of ₹${removedPayment.amount} from Job Card ${jobCard.jobCardNo}`, req);
    res.send(jobCard);
  } catch (error) {
    res.status(400).send({ error: 'Failed to delete advance payment: ' + error.message });
  }
});

// Get all final payments for a Job Card
router.get('/:id/final-payments', auth, async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });
    res.send(jobCard.finalPayments || []);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch final payments: ' + error.message });
  }
});

// Add final payment to Job Card
router.post('/:id/final-payments', auth, restrictTo('Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts'), async (req, res) => {
  try {
    const { amount, paymentType, transactionId, referenceNumber, remarks, paymentDate } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).send({ error: 'Valid final payment amount is required.' });
    }
    if (!paymentType) {
      return res.status(400).send({ error: 'Payment type is required.' });
    }

    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    jobCard.finalPayments.push({
      amount: Number(amount),
      paymentType,
      transactionId: transactionId || '',
      referenceNumber: referenceNumber || '',
      remarks: remarks || '',
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      recordedBy: req.user ? req.user.name : 'System'
    });

    await updateJobCardPaymentStatus(jobCard);
    await jobCard.save();

    await logAction(req.user, 'JOBCARD_FINAL_PAYMENT_ADD', `Recorded final payment of ₹${amount} for Job Card ${jobCard.jobCardNo}`, req);
    res.send(jobCard);
  } catch (error) {
    res.status(400).send({ error: 'Failed to record final payment: ' + error.message });
  }
});

// Delete final payment from Job Card
router.delete('/:id/final-payments/:paymentId', auth, restrictTo('Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts'), async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    const paymentIndex = jobCard.finalPayments.findIndex(p => p._id.toString() === req.params.paymentId);
    if (paymentIndex === -1) {
      return res.status(404).send({ error: 'Final payment entry not found.' });
    }

    const removedPayment = jobCard.finalPayments[paymentIndex];
    jobCard.finalPayments.splice(paymentIndex, 1);

    await updateJobCardPaymentStatus(jobCard);
    await jobCard.save();

    await logAction(req.user, 'JOBCARD_FINAL_PAYMENT_REMOVE', `Deleted final payment of ₹${removedPayment.amount} from Job Card ${jobCard.jobCardNo}`, req);
    res.send(jobCard);
  } catch (error) {
    res.status(400).send({ error: 'Failed to delete final payment: ' + error.message });
  }
});

router.updateJobCardPaymentStatus = updateJobCardPaymentStatus;
module.exports = router;
