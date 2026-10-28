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
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (mkdirErr) {}

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
    const { search, status, advisor, excludeDelivered } = req.query;
    let query = {};

    if (status) {
      query.status = status;
    } else if (excludeDelivered === 'true') {
      query.status = { $nin: ['Delivered', 'Closed'] };
    }

    if (advisor) {
      query.serviceAdvisorId = advisor;
    }

    if (search) {
      // Find matching customers and vehicles concurrently using Promise.all and lean()
      const [customers, vehicles] = await Promise.all([
        Customer.find({
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { mobile: { $regex: search, $options: 'i' } }
          ]
        }).select('_id').lean(),
        Vehicle.find({
          vehicleNumber: { $regex: search, $options: 'i' }
        }).select('_id').lean()
      ]);

      const customerIds = customers.map(c => c._id);
      const vehicleIds = vehicles.map(v => v._id);

      query.$or = [
        { jobCardNo: { $regex: search, $options: 'i' } },
        { customerId: { $in: customerIds } },
        { vehicleId: { $in: vehicleIds } }
      ];
    }

    const jobCards = await JobCard.find(query)
      .select('jobCardNo status vehicleId customerId odometerReading serviceType serviceTypes date serviceAdvisorId createdAt billingSummary promDate promTime workCategory advisorNotes bodyShopDetails')
      .populate('customerId')
      .populate('vehicleId')
      .populate('serviceAdvisorId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.send(jobCards);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch job cards.' });
  }
});

// General Service History: search complete vehicle service and invoice records
router.get('/service-history', auth, async (req, res) => {
  try {
    const { search } = req.query;
    const term = search ? search.trim() : '';

    const ExternalRepair = require('../models/ExternalRepair');
    const externalRepairs = await ExternalRepair.find({ status: { $ne: 'Cancelled' } }).select('jobCardId').lean();
    const externalJcIds = externalRepairs.map(er => er.jobCardId).filter(Boolean);

    const Invoice = require('../models/Invoice');
    const Estimate = require('../models/Estimate');

    // Find all job card IDs that have finalized invoices
    const finalizedInvoices = await Invoice.find({ status: 'Finalized' }).select('jobCardId').lean();
    const invoicedJcIds = finalizedInvoices.map(inv => inv.jobCardId).filter(Boolean);

    const query = {
      $or: [
        { status: { $in: ['Ready for Delivery', 'Delivered', 'Closed', 'Completed'] } },
        { _id: { $in: invoicedJcIds } }
      ],
      $and: [
        {
          $or: [
            { workCategory: { $in: ['PMS', 'General Service', 'General Servicing', 'Paid Service'] } },
            { serviceType: { $in: ['PMS', 'General Service', 'General Servicing', 'Paid Service'] } },
            { serviceTypes: { $in: ['PMS', 'General Service', 'General Servicing', 'Paid Service'] } }
          ]
        },
        {
          jobType: { $nin: ['Insurance Job'] },
          workCategory: { $nin: ['Insurance Jobs'] },
          _id: { $nin: externalJcIds }
        }
      ]
    };

    if (term) {
      const Customer = require('../models/Customer');
      const Vehicle = require('../models/Vehicle');

      const customers = await Customer.find({
        $or: [
          { name: { $regex: term, $options: 'i' } },
          { mobile: { $regex: term, $options: 'i' } }
        ]
      }).lean();
      const customerIds = customers.map(c => c._id);

      const vehicles = await Vehicle.find({
        $or: [
          { vehicleNumber: { $regex: term, $options: 'i' } },
          { chassisNumber: { $regex: term, $options: 'i' } }
        ]
      }).lean();
      const vehicleIds = vehicles.map(v => v._id);

      query.$and.push({
        $or: [
          { jobCardNo: { $regex: term, $options: 'i' } },
          { customerId: { $in: customerIds } },
          { vehicleId: { $in: vehicleIds } }
        ]
      });
    }

    const jobCards = await JobCard.find(query)
      .populate('customerId')
      .populate('vehicleId')
      .sort({ createdAt: -1 })
      .lean();

    const jcIds = jobCards.map(jc => jc._id);
    const [invoices, estimates] = await Promise.all([
      Invoice.find({ jobCardId: { $in: jcIds } }).sort({ createdAt: -1 }).lean(),
      Estimate.find({ jobCardId: { $in: jcIds } }).sort({ createdAt: -1 }).lean()
    ]);

    const invoiceMap = {};
    invoices.forEach(inv => {
      if (!invoiceMap[inv.jobCardId.toString()]) {
        invoiceMap[inv.jobCardId.toString()] = inv;
      }
    });

    const estimateMap = {};
    estimates.forEach(est => {
      if (!estimateMap[est.jobCardId.toString()]) {
        estimateMap[est.jobCardId.toString()] = est;
      }
    });

    const history = jobCards.map((jc) => {
      const invoice = invoiceMap[jc._id.toString()] || null;
      const estimate = invoice ? null : (estimateMap[jc._id.toString()] || null);
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
        partsReplaced,
        serviceCategory: 'PMS / General Service'
      };
    });

    res.send(history);
  } catch (error) {
    console.error('Failed to fetch service history:', error);
    res.status(500).send({ error: 'Failed to fetch service history.' });
  }
});

router.post('/', auth, restrictTo('Admin', 'Service', 'Accounts', 'Body Shop', 'Reception'), async (req, res) => {
  // [Stage 1] Job-card creation request received
  const reqCustomerId = (req.body?.customerId && req.body.customerId._id) ? req.body.customerId._id : req.body?.customerId;
  const reqVehicleId = (req.body?.vehicleId && req.body.vehicleId._id) ? req.body.vehicleId._id : req.body?.vehicleId;
  const creatorName = req.user ? (req.user.name || req.user.email || 'System') : 'Unknown';
  console.log(`[JobCard] [Stage 1] Job-card creation request received: Customer=${reqCustomerId || 'N/A'}, Vehicle=${reqVehicleId || 'N/A'}, User=${creatorName}`);

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

    // [Stage 2] Job card saved successfully, with internal job-card reference
    console.log(`[JobCard] [Stage 2] Job card saved successfully: ID=${jobCard._id}, JobCardNo=${jobCard.jobCardNo}`);

    // Automatically create internal notification
    try {
      const Customer = require('../models/Customer');
      const VehicleModel = require('../models/Vehicle');
      const Notification = require('../models/Notification');
      
      const custLookupId = (jobCard.customerId && jobCard.customerId._id) ? jobCard.customerId._id : jobCard.customerId;
      const vehLookupId = (jobCard.vehicleId && jobCard.vehicleId._id) ? jobCard.vehicleId._id : jobCard.vehicleId;
      const customer = custLookupId ? await Customer.findById(custLookupId).lean() : null;
      const vehicle = vehLookupId ? await VehicleModel.findById(vehLookupId).lean() : null;

      const notification = new Notification({
        type: 'jobcard',
        title: 'Job Card Created',
        message: `Job card ${jobCard.jobCardNo} has been created for vehicle ${vehicle ? (vehicle.vehicleNumber || vehicle.regNo || 'N/A') : 'N/A'}.`,
        vehicleNumber: vehicle ? (vehicle.vehicleNumber || vehicle.regNo) : undefined,
        customerName: customer ? customer.name : undefined
      });
      await notification.save();
    } catch (notifErr) {
      console.warn('[JobCard Notification] Failed to create internal job card notification:', notifErr.message);
    }

    // =========================================================================
    // WhatsApp Automation: Job Card Created (Stages 3 to 6)
    // =========================================================================
    try {
      // [Stage 3] Automation event triggered
      console.log(`[JobCard Automation] [Stage 3] Automation event triggered for JobCard: ${jobCard.jobCardNo} (ID: ${jobCard._id})`);

      const Customer = require('../models/Customer');
      const VehicleModel = require('../models/Vehicle');
      const { sendTemplateMessage, validateCustomerContact } = require('../services/whatsappService');

      const custId = (jobCard.customerId && jobCard.customerId._id) ? jobCard.customerId._id : jobCard.customerId;
      const vehId = (jobCard.vehicleId && jobCard.vehicleId._id) ? jobCard.vehicleId._id : jobCard.vehicleId;

      let customer = null;
      let vehicle = null;

      if (jobCard.customerId && jobCard.customerId.name && (jobCard.customerId.mobile || jobCard.customerId.phone)) {
        customer = jobCard.customerId;
      } else if (custId) {
        customer = await Customer.findById(custId).lean();
      }

      if (jobCard.vehicleId && (jobCard.vehicleId.vehicleNumber || jobCard.vehicleId.regNo)) {
        vehicle = jobCard.vehicleId;
      } else if (vehId) {
        vehicle = await VehicleModel.findById(vehId).lean();
      }

      const rawPhone = customer ? (customer.mobile || customer.phone || customer.contactNumber) : null;
      const customerName = String((customer && customer.name) ? customer.name : 'Valued Customer').trim();
      const jobCardNumber = String(jobCard.jobCardNo || currentJobCardNo || 'N/A').trim();
      const vehicleRegNumber = String((vehicle && (vehicle.vehicleNumber || vehicle.regNo)) ? (vehicle.vehicleNumber || vehicle.regNo) : 'your vehicle').trim();
      const serviceDescription = String(
        jobCard.serviceType ||
        (Array.isArray(jobCard.serviceTypes) && jobCard.serviceTypes.length > 0 ? jobCard.serviceTypes.join(', ') : null) ||
        jobCard.workCategory ||
        'General Service'
      ).trim();

      const contactCheck = validateCustomerContact(customer, rawPhone);
      const templateName = 'mvss_job_card_created';
      const correlationKey = `job_card_created_${jobCard._id}`;

      // [Stage 4] Customer contact/template validation result
      console.log(`[JobCard Automation] [Stage 4] Contact/template validation result: Customer="${customerName}", Phone="${contactCheck.masked}", Valid=${contactCheck.valid}, Template="${templateName}"${!contactCheck.valid ? `, Reason="${contactCheck.reason}"` : ''}`);

      if (contactCheck.valid) {
        // [Stage 5] WhatsApp send attempted
        console.log(`[JobCard Automation] [Stage 5] WhatsApp send attempted: To=${contactCheck.masked}, Template=${templateName}, CorrelationKey=${correlationKey}`);

        try {
          const waResult = await sendTemplateMessage({
            to: contactCheck.phone,
            templateName,
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: customerName },
                  { type: 'text', text: jobCardNumber },
                  { type: 'text', text: vehicleRegNumber },
                  { type: 'text', text: serviceDescription }
                ]
              }
            ],
            recipientName: customerName,
            relatedEntity: jobCard._id,
            onModel: 'JobCard',
            idempotencyKey: correlationKey
          });

          // [Stage 6] Meta response accepted
          console.log(`[JobCard Automation] [Stage 6] Meta response accepted: JobCard=${jobCardNumber}, wamid=${waResult.messageId || 'duplicate_skipped'}, Status=${waResult.status || 'accepted'}`);
        } catch (waSendErr) {
          // [Stage 6] Meta response failed (isolated, does not fail job card creation)
          console.error(`[JobCard Automation] [Stage 6] Meta response failed: JobCard=${jobCardNumber}, Error=${waSendErr.message || waSendErr}`);
        }
      } else {
        console.warn(`[JobCard Automation] [Stage 4] Skipping WhatsApp dispatch: ${contactCheck.reason}`);
      }
    } catch (waError) {
      console.error('[JobCard Automation] Unexpected error in WhatsApp automation hook:', waError.message || waError);
    }

    // Update odometer reading on the Vehicle model
    if (jobCard.vehicleId && jobCard.odometerReading) {
      await Vehicle.findByIdAndUpdate(jobCard.vehicleId, { odometerReading: jobCard.odometerReading });
    }

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

      // Role check: Admin, Service Advisor, Workshop Manager, Branch Manager, Body Shop can update the status.
      // Other roles have read-only access.
      const allowedRoles = ['Super Admin', 'Admin', 'Service', 'Spares', 'Branch Manager', 'Workshop Manager', 'Body Shop'];
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

    // [Stage 2] Job Card updated
    console.log(`[JobCard] [Stage 2] Job card updated successfully: ID=${jobCard._id}, JobCardNo=${jobCard.jobCardNo}, Status=${jobCard.status}, StatusChanged=${statusChanged}`);

    // WhatsApp Integration: Job Card Status Changes and Service Delay
    const isServiceDelay = Boolean(req.body.serviceDelay || req.body.isDelayed || req.body.delayReason || jobCard.status === 'Delayed');
    if (statusChanged || isServiceDelay) {
      try {
        const Customer = require('../models/Customer');
        const VehicleModel = require('../models/Vehicle');
        const { sendTemplateMessage, validateCustomerContact } = require('../services/whatsappService');

        const custId = (jobCard.customerId && jobCard.customerId._id) ? jobCard.customerId._id : jobCard.customerId;
        const vehId = (jobCard.vehicleId && jobCard.vehicleId._id) ? jobCard.vehicleId._id : jobCard.vehicleId;

        const customer = (jobCard.customerId && jobCard.customerId.name && (jobCard.customerId.mobile || jobCard.customerId.phone))
          ? jobCard.customerId
          : (custId ? await Customer.findById(custId).lean() : null);

        const vehicle = (jobCard.vehicleId && (jobCard.vehicleId.vehicleNumber || jobCard.vehicleId.regNo))
          ? jobCard.vehicleId
          : (vehId ? await VehicleModel.findById(vehId).lean() : null);

        const rawPhone = customer ? (customer.mobile || customer.phone || customer.contactNumber) : null;
        const customerName = String(customer?.name || 'Valued Customer').trim();
        const vehicleNumber = String(vehicle?.vehicleNumber || vehicle?.regNo || 'your vehicle').trim();
        const jobCardNumber = String(jobCard.jobCardNo || 'N/A').trim();
        const contactCheck = validateCustomerContact(customer, rawPhone);

        let templateName = null;
        let parameters = [];

        if (isServiceDelay && (req.body.delayReason || req.body.serviceDelay || jobCard.status === 'Delayed')) {
          templateName = 'mvss_service_delay';
          const delayDetail = String(req.body.delayReason || req.body.serviceDelay || (jobCard.promDate ? `Delivery updated to ${jobCard.promDate}` : 'Service experiencing a slight delay')).trim();
          parameters = [
            { type: 'text', text: customerName },
            { type: 'text', text: vehicleNumber },
            { type: 'text', text: jobCardNumber },
            { type: 'text', text: delayDetail }
          ];
        } else if (jobCard.status === 'Work in Progress' || jobCard.status === 'Work In Progress') {
          templateName = 'mvss_work_started';
          parameters = [
            { type: 'text', text: customerName },
            { type: 'text', text: vehicleNumber },
            { type: 'text', text: jobCardNumber }
          ];
        } else if (['Quality Check', 'Quality Test', 'QC Pass', 'Inspection Completed'].includes(jobCard.status) || (req.body.qcStatus === 'Pass')) {
          templateName = 'mvss_inspection_completed';
          parameters = [
            { type: 'text', text: customerName },
            { type: 'text', text: vehicleNumber },
            { type: 'text', text: jobCardNumber }
          ];
        } else if (jobCard.status === 'Ready for Delivery') {
          templateName = 'mvss_vehicle_ready';
          parameters = [
            { type: 'text', text: customerName },
            { type: 'text', text: vehicleNumber },
            { type: 'text', text: jobCardNumber }
          ];
        } else if (['Job Completed', 'Repair Completed', 'Closed'].includes(jobCard.status) || (req.body.jobProgress === 100)) {
          templateName = 'mvss_job_completed';
          parameters = [
            { type: 'text', text: customerName },
            { type: 'text', text: vehicleNumber },
            { type: 'text', text: jobCardNumber }
          ];
        } else if (jobCard.status === 'Delivered') {
          templateName = 'mvss_vehicle_delivered';
          const Invoice = require('../models/Invoice');
          const invoice = await Invoice.findOne({ jobCardId: jobCard._id, status: 'Finalized' }).lean() 
            || await Invoice.findOne({ jobCardId: jobCard._id }).lean();
          parameters = [
            { type: 'text', text: customerName },
            { type: 'text', text: vehicleNumber },
            { type: 'text', text: jobCardNumber },
            { type: 'text', text: invoice ? invoice.invoiceNo : 'N/A' }
          ];
        } else if (['Vehicle Received', 'Intake Completed'].includes(jobCard.status)) {
          templateName = 'mvss_vehicle_received';
          parameters = [
            { type: 'text', text: customerName },
            { type: 'text', text: vehicleNumber },
            { type: 'text', text: jobCardNumber }
          ];
        }

        if (templateName) {
          const correlationKey = templateName === 'mvss_service_delay'
            ? `${templateName}_${jobCard._id}_${new Date().toISOString().slice(0, 10)}`
            : `${templateName}_${jobCard._id}`;

          // [Stage 3] Automation event triggered
          console.log(`[JobCard Automation] [Stage 3] Automation event triggered: Event="${templateName}", JobCard=${jobCardNumber}, Status="${jobCard.status}"`);

          // [Stage 4] Customer contact/template validation result
          console.log(`[JobCard Automation] [Stage 4] Contact/template validation result: Customer="${customerName}", Phone="${contactCheck.masked}", Valid=${contactCheck.valid}, Template="${templateName}"${!contactCheck.valid ? `, Reason="${contactCheck.reason}"` : ''}`);

          if (contactCheck.valid) {
            // [Stage 5] WhatsApp send attempted
            console.log(`[JobCard Automation] [Stage 5] WhatsApp send attempted: To=${contactCheck.masked}, Template=${templateName}, CorrelationKey=${correlationKey}`);

            try {
              const waResult = await sendTemplateMessage({
                to: contactCheck.phone,
                templateName,
                components: [{ type: 'body', parameters }],
                recipientName: customerName,
                relatedEntity: jobCard._id,
                onModel: 'JobCard',
                idempotencyKey: correlationKey
              });

              // [Stage 6] Meta response accepted
              console.log(`[JobCard Automation] [Stage 6] Meta response accepted: JobCard=${jobCardNumber}, Template=${templateName}, wamid=${waResult.messageId || 'duplicate_skipped'}, Status=${waResult.status || 'accepted'}`);
            } catch (waSendErr) {
              // [Stage 6] Meta response failed (isolated, does not fail job card update)
              console.error(`[JobCard Automation] [Stage 6] Meta response failed: JobCard=${jobCardNumber}, Template=${templateName}, Error=${waSendErr.message || waSendErr}`);
            }
          } else {
            console.warn(`[JobCard Automation] [Stage 4] Skipping WhatsApp dispatch: ${contactCheck.reason}`);
          }
        }
      } catch (waError) {
        console.error('[JobCard Automation] Unexpected error in status change WhatsApp hook:', waError.message || waError);
      }
    }

    res.send(jobCard);
  } catch (error) {
    res.status(400).send({ error: 'Failed to update job card: ' + error.message });
  }
});

// Search Job Cards for Dropdown
router.get('/search', auth, async (req, res) => {
  try {
    const { q, excludeDelivered } = req.query;
    let query = {};

    if (excludeDelivered === 'true') {
      query.status = { $nin: ['Delivered', 'Closed'] };
    }

    if (q && q.trim() !== '') {
      const term = q.trim();
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Find matching customers and vehicles concurrently using Promise.all and lean()
      const [customers, vehicles] = await Promise.all([
        Customer.find({
          $or: [
            { name: { $regex: escapedTerm, $options: 'i' } },
            { companyName: { $regex: escapedTerm, $options: 'i' } },
            { mobile: { $regex: escapedTerm, $options: 'i' } }
          ]
        }).select('_id').lean(),
        Vehicle.find({
          $or: [
            { vehicleNumber: { $regex: escapedTerm, $options: 'i' } },
            { make: { $regex: escapedTerm, $options: 'i' } },
            { model: { $regex: escapedTerm, $options: 'i' } }
          ]
        }).select('_id').lean()
      ]);

      const customerIds = customers.map(c => c._id);
      const vehicleIds = vehicles.map(v => v._id);

      query.$or = [
        { jobCardNo: { $regex: escapedTerm, $options: 'i' } },
        { customerId: { $in: customerIds } },
        { vehicleId: { $in: vehicleIds } }
      ];
    }

    // Limit results for dropdown search (max 50 for rapid rendering)
    const jobCards = await JobCard.find(query)
      .select('jobCardNo status vehicleId customerId date createdAt')
      .populate('customerId', 'name companyName mobile')
      .populate('vehicleId', 'vehicleNumber make model')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Map to required structure
    const mapped = jobCards.map(jc => ({
      _id: jc._id,
      jobCardNo: jc.jobCardNo,
      status: jc.status,
      vehicleNo: jc.vehicleId?.vehicleNumber || '',
      customerName: jc.customerId?.name || jc.customerId?.companyName || 'Unknown Customer',
      vehicleModel: jc.vehicleId ? `${jc.vehicleId.make || ''} ${jc.vehicleId.model || ''}`.trim() : '',
      dateFormatted: new Date(jc.date || jc.createdAt).toLocaleDateString('en-IN')
    }));

    res.json(mapped);
  } catch (error) {
    console.error('JobCard search error:', error);
    res.status(500).send({ error: 'Failed to search job cards: ' + error.message });
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
    // WhatsApp Integration: Advance Payment Received
    try {
      const Customer = require('../models/Customer');
      const VehicleModel = require('../models/Vehicle');
      const customer = await Customer.findById(jobCard.customerId);
      const vehicle = await VehicleModel.findById(jobCard.vehicleId);
      if (customer && (customer.mobile || customer.phone)) {
        const Invoice = require('../models/Invoice');
        let invoice = await Invoice.findOne({ jobCardId: jobCard._id, status: 'Finalized' }) || await Invoice.findOne({ jobCardId: jobCard._id });
        const { sendTemplateMessage } = require('../services/whatsappService');
        
        const addedPaymentId = jobCard.advancePayments[jobCard.advancePayments.length - 1]?._id;
        sendTemplateMessage({
          to: customer.mobile || customer.phone,
          templateName: 'mvss_payment_received',
          components: [
            { type: 'body', parameters: [
              { type: 'text', text: customer.name },
              { type: 'text', text: vehicle ? vehicle.vehicleNumber : 'your vehicle' },
              { type: 'text', text: invoice ? invoice.invoiceNo : 'N/A' },
              { type: 'text', text: String(amount) },
              { type: 'text', text: 'Advance' }
            ]}
          ],
          recipientName: customer.name,
          relatedEntity: jobCard._id,
          onModel: 'JobCard',
          idempotencyKey: `payment_received_${addedPaymentId || Date.now()}`
        }).catch(err => console.error('[WhatsApp] Async advance payment error:', err.message || err));
      }
    } catch (waError) {
      console.error('[WhatsApp] Failed to trigger advance payment received message:', waError);
    }

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

  let pendingAmount = Math.max(0, finalBillAmount - totalReceived);

  if (jobCard.waiver && jobCard.waiver.waivedAmount > 0) {
    pendingAmount = Math.max(0, pendingAmount - jobCard.waiver.waivedAmount);
  }

  if (jobCard.waiver && jobCard.waiver.waivedAmount > 0 && pendingAmount <= 0.05) {
    jobCard.paymentStatus = 'Settled (Waived Off)';
  } else if (finalBillAmount > 0) {
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

  if (invoice) {
    const isWaiverPaid = (jobCard.waiver && jobCard.waiver.waivedAmount > 0 && pendingAmount <= 0.05);
    const newStatus = (pendingAmount <= 0.05 || isWaiverPaid) ? 'Paid' : (totalReceived > 0 ? 'Partially Paid' : 'Unpaid');
    if (invoice.amountPaid !== totalReceived || invoice.balanceDue !== pendingAmount || invoice.paymentStatus !== newStatus) {
      invoice.amountPaid = totalReceived;
      invoice.balanceDue = pendingAmount;
      invoice.paymentStatus = newStatus;
      await invoice.save();
    }
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
    // WhatsApp Integration: Final Payment Received
    try {
      const Customer = require('../models/Customer');
      const VehicleModel = require('../models/Vehicle');
      const customer = await Customer.findById(jobCard.customerId);
      const vehicle = await VehicleModel.findById(jobCard.vehicleId);
      if (customer && (customer.mobile || customer.phone)) {
        const Invoice = require('../models/Invoice');
        let invoice = await Invoice.findOne({ jobCardId: jobCard._id, status: 'Finalized' }) || await Invoice.findOne({ jobCardId: jobCard._id });
        const { sendTemplateMessage } = require('../services/whatsappService');
        
        const addedPaymentId = jobCard.finalPayments[jobCard.finalPayments.length - 1]?._id;
        sendTemplateMessage({
          to: customer.mobile || customer.phone,
          templateName: 'mvss_payment_received',
          components: [
            { type: 'body', parameters: [
              { type: 'text', text: customer.name },
              { type: 'text', text: vehicle ? vehicle.vehicleNumber : 'your vehicle' },
              { type: 'text', text: invoice ? invoice.invoiceNo : 'N/A' },
              { type: 'text', text: String(amount) },
              { type: 'text', text: 'Final' }
            ]}
          ],
          recipientName: customer.name,
          relatedEntity: jobCard._id,
          onModel: 'JobCard',
          idempotencyKey: `payment_received_${addedPaymentId || Date.now()}`
        }).catch(err => console.error('[WhatsApp] Async final payment error:', err.message || err));
      }
    } catch (waError) {
      console.error('[WhatsApp] Failed to trigger final payment received message:', waError);
    }

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

// Settle / Waive off remaining balance of a Job Card
router.post('/:id/waive-off', auth, restrictTo('Super Admin', 'Admin', 'Accounts Executive', 'Accounts'), async (req, res) => {
  try {
    const { waivedAmount, reason } = req.body;
    if (waivedAmount === undefined || Number(waivedAmount) <= 0) {
      return res.status(400).send({ error: 'Valid waived amount is required.' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).send({ error: 'Waiver reason is required.' });
    }

    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    const Invoice = require('../models/Invoice');
    let invoice = await Invoice.findOne({ jobCardId: jobCard._id, status: 'Finalized' });
    if (!invoice) {
      invoice = await Invoice.findOne({ jobCardId: jobCard._id });
    }

    const finalBillAmount = invoice ? (invoice.totals?.roundedGrandTotal || invoice.totals?.grandTotal || 0) : (jobCard.billingSummary?.grandTotal || 0);

    const totalAdvance = (jobCard.advancePayments || []).reduce((sum, p) => sum + p.amount, 0);
    const totalFinal = (jobCard.finalPayments || []).reduce((sum, p) => sum + p.amount, 0);
    const totalReceived = totalAdvance + totalFinal;

    const finalCollectedAmount = totalReceived;

    jobCard.waiver = {
      originalBillAmount: finalBillAmount,
      amountReceived: totalReceived,
      waivedAmount: Number(waivedAmount),
      finalCollectedAmount: finalCollectedAmount,
      approvedBy: req.user ? req.user.name : 'System Admin',
      waivedAt: new Date(),
      reason: reason.trim()
    };

    await updateJobCardPaymentStatus(jobCard);
    await jobCard.save();

    await logAction(
      req.user,
      'JOBCARD_BALANCE_WAIVE_OFF',
      `Waived off ₹${waivedAmount} for Job Card ${jobCard.jobCardNo}. Reason: ${reason}`,
      req
    );

    res.send(jobCard);
  } catch (error) {
    res.status(400).send({ error: 'Failed to record waiver: ' + error.message });
  }
});

router.updateJobCardPaymentStatus = updateJobCardPaymentStatus;
module.exports = router;
