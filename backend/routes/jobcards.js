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

const mongoose = require('mongoose');
const { uploadPhotoFile, downloadPhotoStream, deletePhotoFile, photoExists } = require('../utils/gridfs');

let cloudinary = null;
try {
  cloudinary = require('cloudinary').v2;
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
  }
} catch (e) {
  cloudinary = null;
}

const isCloudinaryConfigured = () => {
  return Boolean(
    cloudinary &&
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured()) return reject(new Error('Cloudinary is not configured.'));
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    stream.end(buffer);
  });
};

// Memory storage for persistent GridFS & Cloudinary streaming
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Dedicated Body Shop 13 Stages Workflow
const BODY_SHOP_STAGES = [
  'Vehicle Reported',
  'Customer Not Responding',
  'Survey Pending',
  'Awaiting for Documents',
  'Awaiting for Work Approval',
  'Work in Progress',
  'Part not Available',
  'Awaiting for Reinspection',
  'Awaiting for Delivery Order',
  'Ready for Delivery',
  'Delivered',
  'Closed',
  'Estimation Pending'
];

// Helper to auto-generate Job Card Number
const generateJobCardNo = async () => {
  return await getNextSequence('JC', 'JobCard');
};

// Helper to safely normalize payment modes case-insensitively
const normalizePaymentMode = (mode) => {
  if (!mode || typeof mode !== 'string') return 'Cash';
  const m = mode.trim();
  const lower = m.toLowerCase();
  if (lower === 'cash') return 'Cash';
  if (lower === 'upi') return 'UPI';
  if (lower === 'card' || lower === 'card swipe' || lower === 'debit card' || lower === 'credit card' || lower === 'pos') return 'Card';
  if (lower === 'bank transfer' || lower === 'bank' || lower === 'neft' || lower === 'rtgs' || lower === 'imps' || lower === 'net banking') return 'Bank Transfer';
  if (lower === 'cheque' || lower === 'check') return 'Cheque';
  if (lower === 'qr / scanner payment' || lower === 'scanner payment (qr)' || lower === 'scanner payment' || lower === 'qr' || lower.includes('qr') || lower.includes('scanner')) return 'QR / Scanner Payment';
  if (lower === 'online') return 'Online';
  if (lower === 'other' || lower === 'others') return 'Other';
  return m;
};

// UPI Configuration endpoint
router.get('/upi-config', auth, (req, res) => {
  const businessVpa = process.env.BUSINESS_UPI_ID || process.env.VPA || 'auto4m@icici';
  const businessName = process.env.BUSINESS_NAME || 'MVSS Automobiles';
  const isConfigured = Boolean(process.env.BUSINESS_UPI_ID || process.env.VPA || 'auto4m@icici');
  res.send({
    businessVpa,
    businessName,
    isConfigured
  });
});

// List all job cards with search & filters
router.get('/', auth, async (req, res) => {
  try {
    const { search, status, advisor, excludeDelivered } = req.query;
    let query = {};

    if (status) {
      if (['Quality Test', 'Quality Check', 'Final Quality Inspection', 'Pre-Delivery Inspection'].includes(status)) {
        query.status = { $in: ['Quality Test', 'Quality Check', 'Final Quality Inspection', 'Pre-Delivery Inspection'] };
      } else if (status === 'Body Shop') {
        query.$or = [
          { status: 'Body Shop' },
          { bodyShopStatus: { $exists: true, $ne: '' } }
        ];
      } else if (BODY_SHOP_STAGES.includes(status)) {
        query.$or = [
          { status: 'Body Shop', bodyShopStatus: status },
          { bodyShopStatus: status },
          { status: status }
        ];
      } else {
        query.status = status;
      }
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
      .select('jobCardNo status bodyShopStatus bodyShopStage vehicleId customerId odometerReading serviceType serviceTypes date serviceAdvisorId createdAt billingSummary promDate promTime workCategory advisorNotes bodyShopDetails')
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
        { status: { $in: ['Ready for Delivery', 'Vehicle Ready', 'Delivered', 'Closed', 'Completed'] } },
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
        const retiredStages = ['Quality Check', 'Repair'];
        if (retiredStages.includes(initialStatus)) {
          return res.status(400).send({
            error: `The stage "${initialStatus}" has been removed from the active workflow. Please select a valid stage.`
          });
        }
        const initialBodyShopStatus = (initialStatus === 'Body Shop' || req.body.bodyShopStatus)
          ? (req.body.bodyShopStatus || 'Vehicle Reported')
          : '';

        const jobCardData = {
          ...req.body,
          jobCardNo: currentJobCardNo,
          time: req.body.time || timeStr,
          serviceAdvisorId: req.user._id,
          status: initialStatus,
          bodyShopStatus: initialBodyShopStatus,
          bodyShopStage: initialBodyShopStatus,
          statusHistory: [{
            status: initialStatus === 'Body Shop' ? `Body Shop (${initialBodyShopStatus})` : initialStatus,
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

// Persistent Photo Streaming Route (GET and HEAD - supports <img> tags without auth)
const streamJobCardPhoto = async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId) return res.status(400).json({ error: 'Photo identifier is required.' });

    // 1. GridFS Lookup by ObjectId
    if (mongoose.isValidObjectId(fileId)) {
      const fileMeta = await photoExists(fileId);
      if (fileMeta) {
        res.set('Content-Type', fileMeta.contentType || 'image/jpeg');
        res.set('Content-Length', fileMeta.length);
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.set('Content-Disposition', `inline; filename="${encodeURIComponent(fileMeta.filename || 'photo.jpg')}"`);
        if (req.method === 'HEAD') return res.status(200).end();

        const stream = downloadPhotoStream(fileId);
        stream.on('error', (err) => {
          console.error('[Photo Stream Error] fileId:', fileId, err);
          if (!res.headersSent) res.status(500).json({ error: 'Failed to stream photo.' });
        });
        return stream.pipe(res);
      }
    }

    // 2. Legacy fallback to disk storage in uploadsDir
    const uploadsDir = path.join(__dirname, '../uploads');
    const diskPath = path.join(uploadsDir, fileId);
    if (fs.existsSync(diskPath)) {
      if (req.method === 'HEAD') return res.status(200).end();
      return res.sendFile(diskPath);
    }

    // 3. Search GridFS by filename
    try {
      const { getBucket } = require('../utils/gridfs');
      const bucket = getBucket('jobcard_photos');
      const files = await bucket.find({ filename: fileId }).limit(1).toArray();
      if (files.length > 0) {
        const fileMeta = files[0];
        res.set('Content-Type', fileMeta.contentType || 'image/jpeg');
        res.set('Content-Length', fileMeta.length);
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.set('Content-Disposition', `inline; filename="${encodeURIComponent(fileMeta.filename || 'photo.jpg')}"`);
        if (req.method === 'HEAD') return res.status(200).end();

        const stream = bucket.openDownloadStream(fileMeta._id);
        stream.on('error', (err) => {
          if (!res.headersSent) res.status(500).json({ error: 'Failed to stream photo.' });
        });
        return stream.pipe(res);
      }
    } catch (_) {}

    return res.status(404).json({ error: 'Photo not found in persistent database or storage.' });
  } catch (error) {
    console.error('[Get Photo Error]:', error);
    res.status(500).json({ error: 'Failed to retrieve photo: ' + error.message });
  }
};

router.get('/photo/:fileId', streamJobCardPhoto);
router.head('/photo/:fileId', streamJobCardPhoto);

// Standalone Photo Upload (uploads to GridFS or Cloudinary, returns metadata)
router.post('/upload-photo', auth, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No photo file provided.' });
    }

    const photoType = req.body.photoType || 'Vehicle';
    let fileUrl = '';
    let publicId = '';
    const originalName = req.file.originalname || `photo-${Date.now()}.jpg`;
    const mimeType = req.file.mimetype || 'image/jpeg';
    const size = req.file.size || req.file.buffer.length;

    if (isCloudinaryConfigured()) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, {
          folder: 'mvss_jobcards',
          resource_type: 'auto'
        });
        if (uploadResult && uploadResult.secure_url) {
          fileUrl = uploadResult.secure_url;
          publicId = uploadResult.public_id;
        }
      } catch (cErr) {
        console.warn('[Cloudinary Standalone Upload Warning]', cErr.message);
      }
    }

    if (!fileUrl) {
      const fileId = await uploadPhotoFile(req.file.buffer, originalName, mimeType);
      fileUrl = `/api/jobcards/photo/${fileId.toString()}`;
      publicId = fileId.toString();
    }

    res.status(201).json({
      url: fileUrl,
      publicId,
      photoType,
      filename: originalName,
      originalName,
      mimeType,
      size,
      uploadedAt: new Date()
    });
  } catch (error) {
    console.error('[Standalone Upload Error]:', error);
    res.status(500).json({ error: 'Failed to upload photo: ' + error.message });
  }
});

// Upload Photo to an Existing Job Card
router.post('/:id/photo', auth, upload.single('photo'), async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    if (!req.file || !req.file.buffer) {
      return res.status(400).send({ error: 'No photo file provided.' });
    }

    const photoType = req.body.photoType || 'Vehicle';
    let fileUrl = '';
    let publicId = '';
    const originalName = req.file.originalname || `photo-${Date.now()}.jpg`;
    const mimeType = req.file.mimetype || 'image/jpeg';
    const size = req.file.size || req.file.buffer.length;

    // 1. Upload to Cloudinary if configured
    if (isCloudinaryConfigured()) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, {
          folder: 'mvss_jobcards',
          resource_type: 'auto'
        });
        if (uploadResult && uploadResult.secure_url) {
          fileUrl = uploadResult.secure_url;
          publicId = uploadResult.public_id;
        }
      } catch (cErr) {
        console.warn('[Cloudinary Upload Warning] Falling back to MongoDB GridFS:', cErr.message);
      }
    }

    // 2. Persistent MongoDB GridFS storage (Primary or fallback)
    if (!fileUrl) {
      const fileId = await uploadPhotoFile(req.file.buffer, originalName, mimeType);
      fileUrl = `/api/jobcards/photo/${fileId.toString()}`;
      publicId = fileId.toString();
    }

    const newPhoto = {
      url: fileUrl,
      publicId: publicId,
      photoType: photoType,
      filename: originalName,
      originalName: originalName,
      mimeType: mimeType,
      size: size,
      uploadedAt: new Date(),
      uploadedBy: req.user ? `${req.user.name || req.user.username || 'Staff'} (${req.user.role || 'Staff'})` : 'Workshop Staff'
    };

    jobCard.photos.push(newPhoto);
    await jobCard.save();

    await logAction(req.user, 'JOBCARD_PHOTO_UPLOAD', `Attached ${photoType} photo to Job Card ${jobCard.jobCardNo}`, req);

    res.status(201).send({
      message: 'Photo uploaded and persisted successfully.',
      photo: newPhoto,
      photos: jobCard.photos
    });
  } catch (error) {
    console.error('[Upload Photo Error]:', error);
    res.status(500).send({ error: 'Failed to upload photo: ' + error.message });
  }
});

// Delete Photo from Job Card
router.delete('/:id/photo/:photoId', auth, async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    const targetId = req.params.photoId;
    const photoIndex = jobCard.photos.findIndex(p =>
      (p._id && p._id.toString() === targetId) ||
      p.publicId === targetId ||
      (p.url && p.url.includes(targetId))
    );

    if (photoIndex === -1) {
      return res.status(404).send({ error: 'Photo not found on this Job Card.' });
    }

    const photoToDelete = jobCard.photos[photoIndex];

    // Clean up from Cloudinary if stored there
    if (isCloudinaryConfigured() && photoToDelete.publicId && photoToDelete.url?.includes('cloudinary')) {
      try {
        await cloudinary.uploader.destroy(photoToDelete.publicId);
      } catch (cErr) {
        console.warn('[Cloudinary Delete Warning]:', cErr.message);
      }
    }

    // Clean up from GridFS if stored there
    const gridFsMatch = photoToDelete.url?.match(/\/api\/jobcards\/photo\/([a-f\d]{24})/i);
    const targetFileId = gridFsMatch ? gridFsMatch[1] : (mongoose.isValidObjectId(photoToDelete.publicId) ? photoToDelete.publicId : null);
    if (targetFileId) {
      try {
        await deletePhotoFile(targetFileId);
      } catch (gErr) {
        console.warn('[GridFS Delete Warning]:', gErr.message);
      }
    }

    jobCard.photos.splice(photoIndex, 1);
    await jobCard.save();

    await logAction(req.user, 'JOBCARD_PHOTO_DELETE', `Removed photo from Job Card ${jobCard.jobCardNo}`, req);

    res.send({
      message: 'Photo deleted successfully.',
      photos: jobCard.photos
    });
  } catch (error) {
    console.error('[Delete Photo Error]:', error);
    res.status(500).send({ error: 'Failed to delete photo: ' + error.message });
  }
});

// Update digital job card
router.put('/:id', auth, async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    let statusChanged = false;
    const requestedStatus = req.body.status;
    const requestedBodyShopStatus = req.body.bodyShopStatus || req.body.bodyShopStage;
    const isBodyShopRequest = requestedStatus === 'Body Shop' || 
                              req.body.isBodyShop === true || 
                              Boolean(requestedBodyShopStatus) || 
                              (BODY_SHOP_STAGES.includes(requestedStatus) && jobCard.status === 'Body Shop');

    if (isBodyShopRequest) {
      // Role check: Admin, Service Advisor, Workshop Manager, Branch Manager, Body Shop can update the status.
      const allowedRoles = ['Super Admin', 'Admin', 'Service', 'Spares', 'Branch Manager', 'Workshop Manager', 'Body Shop'];
      if (!allowedRoles.includes(req.user?.role)) {
        return res.status(403).send({ error: 'You do not have permission to update the Job Card workflow status.' });
      }

      let targetStage = '';
      if (requestedBodyShopStatus && BODY_SHOP_STAGES.includes(requestedBodyShopStatus)) {
        targetStage = requestedBodyShopStatus;
      } else if (BODY_SHOP_STAGES.includes(requestedStatus)) {
        targetStage = requestedStatus;
      } else {
        targetStage = jobCard.bodyShopStatus || 'Vehicle Reported';
      }

      const isStatusDifferent = jobCard.status !== 'Body Shop';
      const isStageDifferent = jobCard.bodyShopStatus !== targetStage;

      if (isStatusDifferent || isStageDifferent) {
        statusChanged = true;
        const oldDisplay = jobCard.status === 'Body Shop'
          ? `Body Shop (${jobCard.bodyShopStatus || 'Vehicle Reported'})`
          : jobCard.status;
        const newDisplay = `Body Shop (${targetStage})`;

        jobCard.status = 'Body Shop';
        jobCard.bodyShopStatus = targetStage;
        jobCard.bodyShopStage = targetStage;

        jobCard.statusHistory.push({
          status: newDisplay,
          previousStatus: oldDisplay,
          changedAt: new Date(),
          changedBy: req.user ? req.user.name : 'System',
          remarks: req.body.statusRemarks || `Body Shop stage updated to ${targetStage}`
        });
      }
    } else if (req.body.status && req.body.status !== jobCard.status) {
      statusChanged = true;
      const newStatus = req.body.status;
      const oldStatus = jobCard.status;

      // Role check: Admin, Service Advisor, Workshop Manager, Branch Manager, Body Shop, Accounts can update the status.
      // Other roles have read-only access.
      const allowedRoles = ['Super Admin', 'Admin', 'Accounts', 'Accounts Executive', 'Service', 'Spares', 'Branch Manager', 'Workshop Manager', 'Body Shop'];
      if (!allowedRoles.includes(req.user?.role)) {
        return res.status(403).send({ error: 'You do not have permission to update the Job Card workflow status.' });
      }

      // Check for retired stages
      const retiredStages = ['Quality Check', 'Repair'];
      if (retiredStages.includes(newStatus)) {
        return res.status(400).send({
          error: `The stage "${newStatus}" has been removed from the active workflow. Please select a valid stage (e.g. Waiting for Allotment, Allotted, Parts Procuring, Work in Progress, Pre-Delivery Inspection, Ready for Delivery).`
        });
      }

      const isDelivered = newStatus === 'Delivered';
      const isDeliveredPaymentPending = ['Delivered – Payment Pending', 'Delivered - Payment Pending'].includes(newStatus);

      // Rule 1A: Delivered is allowed only after the invoice is generated, PDI is passed, and payment status is Fully Paid.
      if (isDelivered) {
        const Invoice = require('../models/Invoice');
        const invoice = await Invoice.findOne({ jobCardId: jobCard._id, status: { $ne: 'Cancelled' } });
        if (!invoice) {
          return res.status(400).send({ error: 'Delivered status is allowed only after the Invoice is generated.' });
        }

        const effectiveQcStatus = (req.body.qcStatus && typeof req.body.qcStatus === 'string' && req.body.qcStatus.trim())
          ? req.body.qcStatus.trim()
          : (jobCard.qcStatus || '');
        if (effectiveQcStatus !== 'Pass') {
          return res.status(400).send({
            error: 'Pre-Delivery Inspection (PDI) must be completed and marked as Passed before delivering the vehicle.'
          });
        }

        await recalculateJobCardFinancials(jobCard, { invoice });
        const isPaid = ['Fully Paid', 'Paid', 'Settled (Waived Off)', 'Waived', 'Waived / Fully Settled', 'Overpaid'].includes(jobCard.paymentStatus) || 
          (jobCard.financialSummary?.outstandingBalance <= 0.05) || 
          (jobCard.financialSummary?.pendingAmount <= 0.05);
        if (!isPaid) {
          return res.status(400).send({ 
            error: 'Delivered status is allowed only when payment status is Fully Paid. For delivery with outstanding payment, please select "Delivered – Payment Pending".' 
          });
        }

        // Record or preserve delivery details
        if (!jobCard.deliveredBy || !jobCard.deliveredBy.date) {
          jobCard.deliveredBy = {
            name: (req.body.deliveredBy && req.body.deliveredBy.name) || req.body.deliveredByName || (req.user ? req.user.name : 'Workshop Staff'),
            date: (req.body.deliveredBy && req.body.deliveredBy.date) ? new Date(req.body.deliveredBy.date) : (req.body.deliveryDate ? new Date(req.body.deliveryDate) : new Date()),
            time: (req.body.deliveredBy && req.body.deliveredBy.time) || req.body.deliveryTime || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          };
        }
      }

      // Rule 1B: Delivered – Payment Pending allows delivery with outstanding payment when PDI is passed (invoice is optional, estimate must be approved if exists).
      if (isDeliveredPaymentPending) {
        const Invoice = require('../models/Invoice');
        const invoice = await Invoice.findOne({ jobCardId: jobCard._id, status: { $ne: 'Cancelled' } });

        // Mandatory Pre-Delivery Inspection (PDI) Pass
        const effectiveQcStatus = (req.body.qcStatus && typeof req.body.qcStatus === 'string' && req.body.qcStatus.trim())
          ? req.body.qcStatus.trim()
          : (jobCard.qcStatus || '');
        if (effectiveQcStatus !== 'Pass') {
          return res.status(400).send({
            error: 'Pre-Delivery Inspection (PDI) must be completed and marked as Passed before vehicle delivery.'
          });
        }

        // Customer Estimate approval check: If active estimates exist, at least one must be Approved
        const Estimate = require('../models/Estimate');
        const activeEstimates = await Estimate.find({ jobCardId: jobCard._id, status: { $ne: 'Cancelled' } });
        if (activeEstimates && activeEstimates.length > 0) {
          const hasApproved = activeEstimates.some(est => est.status === 'Approved');
          if (!hasApproved) {
            return res.status(400).send({
              error: 'Customer Estimate must be approved before vehicle delivery. Please ensure an estimate is approved first.'
            });
          }
        }

        // Record delivery date, time, and staff member (preserve if already set)
        const delName = (req.body.deliveredBy && req.body.deliveredBy.name) || req.body.deliveredByName || (req.user ? req.user.name : 'Workshop Staff');
        const delDate = (req.body.deliveredBy && req.body.deliveredBy.date) 
          ? new Date(req.body.deliveredBy.date) 
          : (req.body.deliveryDate ? new Date(req.body.deliveryDate) : (jobCard.deliveredBy?.date || new Date()));
        const delTime = (req.body.deliveredBy && req.body.deliveredBy.time) 
          || req.body.deliveryTime 
          || (jobCard.deliveredBy?.time || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));

        jobCard.deliveredBy = {
          name: delName,
          date: delDate,
          time: delTime
        };

        if (req.body.creditDueDate) {
          jobCard.creditDueDate = new Date(req.body.creditDueDate);
          if (invoice) invoice.creditDueDate = jobCard.creditDueDate;
        }
        if (req.body.creditTerms) {
          jobCard.creditTerms = req.body.creditTerms;
          if (invoice) invoice.creditTerms = req.body.creditTerms;
        }
        if (invoice && (req.body.creditDueDate || req.body.creditTerms)) {
          await invoice.save();
        }

        // Recalculate without marking as fully paid (handles both with and without invoice)
        await recalculateJobCardFinancials(jobCard, { invoice });
      }

      // Rule 2: Ready for Delivery requires Pre-Delivery Inspection (PDI) completion.
      if (['Ready for Delivery', 'Vehicle Ready'].includes(newStatus)) {
        const effectiveQcStatus = (req.body.qcStatus && typeof req.body.qcStatus === 'string' && req.body.qcStatus.trim())
          ? req.body.qcStatus.trim()
          : (jobCard.qcStatus || '');

        if (effectiveQcStatus !== 'Pass') {
          return res.status(400).send({
            error: 'Pre-Delivery Inspection must be marked as Passed before this vehicle can be moved to Ready for Delivery. Please complete and save the inspection result.'
          });
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

      const finalStatusToSet = isDeliveredPaymentPending ? 'Delivered – Payment Pending' : newStatus;

      const oldDisplay = oldStatus === 'Body Shop'
        ? `Body Shop (${jobCard.bodyShopStatus || 'Vehicle Reported'})`
        : oldStatus;

      jobCard.status = finalStatusToSet;
      jobCard.statusHistory.push({
        status: finalStatusToSet,
        previousStatus: oldDisplay,
        changedAt: new Date(),
        changedBy: req.user ? req.user.name : 'System',
        remarks: req.body.statusRemarks || `Status changed from ${oldDisplay} to ${finalStatusToSet}`
      });
    }

    // Apply updates
    const updates = { ...req.body };
    delete updates.status;
    delete updates.bodyShopStatus;
    delete updates.bodyShopStage;
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
        } else if (['Ready for Delivery', 'Vehicle Ready'].includes(jobCard.status)) {
          templateName = 'mvss_vehicle_ready';
          parameters = [
            { type: 'text', text: customerName },
            { type: 'text', text: vehicleNumber },
            { type: 'text', text: jobCardNumber }
          ];
        } else if (jobCard.status === 'Work in Progress' || jobCard.status === 'Work In Progress') {
          templateName = 'mvss_work_started';
          parameters = [
            { type: 'text', text: customerName },
            { type: 'text', text: vehicleNumber },
            { type: 'text', text: jobCardNumber }
          ];
        } else if (['Quality Check', 'Quality Test', 'Final Quality Inspection', 'Pre-Delivery Inspection', 'QC Pass', 'Inspection Completed'].includes(jobCard.status) || (req.body.qcStatus === 'Pass')) {
          templateName = 'mvss_inspection_completed';
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

    const updatedJobCard = await JobCard.findById(jobCard._id)
      .populate('customerId')
      .populate('vehicleId')
      .populate('serviceAdvisorId', 'name');

    res.send(updatedJobCard || jobCard);
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
      .select('jobCardNo status bodyShopStatus bodyShopStage vehicleId customerId date createdAt')
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

    const jcObj = jobCard.toObject();

    // Look up associated estimate to retrieve spare parts and labour recorded against this Job Card
    const Estimate = require('../models/Estimate');
    const estimates = await Estimate.find({ jobCardId: jobCard._id }).sort({ createdAt: -1 }).lean();

    // Prioritize Approved estimate, then Waiting for Approval/Sent, then Draft, then latest
    const approvedEst = estimates.find(e => e.status === 'Approved')
      || estimates.find(e => ['Waiting for Approval', 'Sent'].includes(e.status))
      || estimates.find(e => e.status === 'Draft')
      || estimates[0];

    // Priority: JobCard's own parts if populated, otherwise linked Estimate's parts
    const parts = (Array.isArray(jcObj.parts) && jcObj.parts.length > 0)
      ? jcObj.parts
      : (approvedEst && Array.isArray(approvedEst.parts) ? approvedEst.parts : []);

    const labour = (Array.isArray(jcObj.labour) && jcObj.labour.length > 0)
      ? jcObj.labour
      : (approvedEst && Array.isArray(approvedEst.labour) ? approvedEst.labour : []);

    jcObj.parts = parts;
    jcObj.labour = labour;
    jcObj.estimateId = approvedEst?._id || null;
    jcObj.estimate = approvedEst || null;

    res.send(jcObj);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch job card details: ' + error.message });
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

const { recalculateJobCardFinancials } = require('../services/financialCalculationService');
const { generatePaymentReceiptPDF } = require('../utils/pdfGenerator');

// Helper to update Job Card Payment Status based on invoice grand totals and payments (Single Source of Truth)
const updateJobCardPaymentStatus = async (jobCard) => {
  return await recalculateJobCardFinancials(jobCard);
};

// Add advance payment to Job Card
router.post('/:id/advance-payments', auth, restrictTo('Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts', 'Accounts Executive'), async (req, res) => {
  try {
    const { amount, type, paymentMode, transactionId, remarks, paymentDate } = req.body;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).send({ error: 'Valid positive advance payment amount is required.' });
    }
    const cleanMode = normalizePaymentMode(paymentMode || type || 'Cash');
    const cleanType = normalizePaymentMode(type || paymentMode || 'Cash');

    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    // Concurrency / Duplicate protection: Check if identical payment was recorded in the last 5 seconds
    const recentDuplicate = (jobCard.advancePayments || []).find(p => {
      const isSameAmount = Math.abs(Number(p.amount) - numAmount) < 0.001;
      const isSameMode = p.paymentMode === cleanMode;
      const isSameTxn = (!transactionId && !p.transactionId) || (transactionId && p.transactionId === transactionId);
      const isRecent = (Date.now() - new Date(p.paymentDate || p.createdAt || 0).getTime()) < 5000;
      return isSameAmount && isSameMode && isSameTxn && isRecent;
    });
    if (recentDuplicate) {
      return res.status(409).send({ error: 'A duplicate advance payment was just recorded. Please refresh.' });
    }

    jobCard.advancePayments.push({
      amount: numAmount,
      type: cleanType,
      paymentMode: cleanMode,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      transactionId: transactionId || '',
      remarks: remarks || '',
      recordedBy: req.user ? req.user.name : 'System'
    });

    await recalculateJobCardFinancials(jobCard);
    await jobCard.save();

    await logAction(req.user, 'JOBCARD_ADVANCE_PAYMENT_ADD', `Recorded advance payment of ₹${numAmount} for Job Card ${jobCard.jobCardNo}`, req);
    
    // WhatsApp Integration: Advance Payment Received
    try {
      const Customer = require('../models/Customer');
      const VehicleModel = require('../models/Vehicle');
      const customer = await Customer.findById(jobCard.customerId);
      const vehicle = await VehicleModel.findById(jobCard.vehicleId);
      if (customer && (customer.mobile || customer.phone)) {
        const Invoice = require('../models/Invoice');
        let invoice = await Invoice.findOne({ jobCardId: jobCard._id, status: 'Finalized' }) || await Invoice.findOne({ jobCardId: jobCard._id, status: { $ne: 'Cancelled' } });
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
              { type: 'text', text: String(numAmount) },
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
router.put('/:id/advance-payments/:paymentId', auth, restrictTo('Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts', 'Accounts Executive'), async (req, res) => {
  try {
    const { amount, type, paymentMode, transactionId, remarks, paymentDate } = req.body;
    if (amount !== undefined && (isNaN(amount) || Number(amount) <= 0)) {
      return res.status(400).send({ error: 'Valid positive advance payment amount is required.' });
    }

    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    const payment = jobCard.advancePayments.id(req.params.paymentId);
    if (!payment) {
      return res.status(404).send({ error: 'Advance payment record not found.' });
    }

    if (amount !== undefined) payment.amount = Number(amount);
    if (type !== undefined || paymentMode !== undefined) {
      const mode = paymentMode || type;
      payment.type = normalizePaymentMode(mode);
      payment.paymentMode = normalizePaymentMode(mode);
    }
    if (paymentDate !== undefined) payment.paymentDate = new Date(paymentDate);
    if (transactionId !== undefined) payment.transactionId = transactionId || '';
    if (remarks !== undefined) payment.remarks = remarks || '';

    await recalculateJobCardFinancials(jobCard);
    await jobCard.save();

    await logAction(req.user, 'JOBCARD_ADVANCE_PAYMENT_UPDATE', `Updated advance payment ID ${payment._id} on Job Card ${jobCard.jobCardNo}`, req);
    res.send(jobCard);
  } catch (error) {
    res.status(400).send({ error: 'Failed to update advance payment: ' + error.message });
  }
});

// Delete advance payment from Job Card
router.delete('/:id/advance-payments/:paymentId', auth, restrictTo('Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts', 'Accounts Executive'), async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    const paymentIndex = jobCard.advancePayments.findIndex(p => p._id.toString() === req.params.paymentId);
    if (paymentIndex === -1) {
      return res.status(404).send({ error: 'Advance payment entry not found.' });
    }

    const removedPayment = jobCard.advancePayments[paymentIndex];
    jobCard.advancePayments.splice(paymentIndex, 1);
    
    await recalculateJobCardFinancials(jobCard);
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
router.post('/:id/final-payments', auth, restrictTo('Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts', 'Accounts Executive'), async (req, res) => {
  try {
    const { amount, paymentType, transactionId, referenceNumber, remarks, paymentDate } = req.body;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).send({ error: 'Valid positive final payment amount is required.' });
    }
    const cleanType = normalizePaymentMode(paymentType || 'Cash');

    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    // Concurrency / Duplicate protection: Check if identical final payment recorded in last 5 seconds
    const recentDuplicate = (jobCard.finalPayments || []).find(p => {
      const isSameAmount = Math.abs(Number(p.amount) - numAmount) < 0.001;
      const isSameType = p.paymentType === cleanType;
      const isSameTxn = (!transactionId && !p.transactionId) || (transactionId && p.transactionId === transactionId);
      const isRecent = (Date.now() - new Date(p.paymentDate || p.createdAt || 0).getTime()) < 5000;
      return isSameAmount && isSameType && isSameTxn && isRecent;
    });
    if (recentDuplicate) {
      return res.status(409).send({ error: 'A duplicate final payment was just recorded. Please refresh.' });
    }

    jobCard.finalPayments.push({
      amount: numAmount,
      paymentType: cleanType,
      transactionId: transactionId || '',
      referenceNumber: referenceNumber || '',
      remarks: remarks || '',
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      recordedBy: req.user ? req.user.name : 'System'
    });

    await recalculateJobCardFinancials(jobCard);
    await jobCard.save();

    await logAction(req.user, 'JOBCARD_FINAL_PAYMENT_ADD', `Recorded final payment of ₹${numAmount} for Job Card ${jobCard.jobCardNo}`, req);
    
    // WhatsApp Integration: Final Payment Received
    try {
      const Customer = require('../models/Customer');
      const VehicleModel = require('../models/Vehicle');
      const customer = await Customer.findById(jobCard.customerId);
      const vehicle = await VehicleModel.findById(jobCard.vehicleId);
      if (customer && (customer.mobile || customer.phone)) {
        const Invoice = require('../models/Invoice');
        let invoice = await Invoice.findOne({ jobCardId: jobCard._id, status: 'Finalized' }) || await Invoice.findOne({ jobCardId: jobCard._id, status: { $ne: 'Cancelled' } });
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
              { type: 'text', text: String(numAmount) },
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

// Update/edit final payment on Job Card
router.put('/:id/final-payments/:paymentId', auth, restrictTo('Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts'), async (req, res) => {
  try {
    const { amount, paymentType, transactionId, referenceNumber, remarks, paymentDate } = req.body;
    if (amount !== undefined && (isNaN(amount) || Number(amount) <= 0)) {
      return res.status(400).send({ error: 'Valid positive final payment amount is required.' });
    }

    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    const payment = jobCard.finalPayments.id(req.params.paymentId);
    if (!payment) {
      return res.status(404).send({ error: 'Final payment record not found.' });
    }

    if (amount !== undefined) payment.amount = Number(amount);
    if (paymentType !== undefined) payment.paymentType = paymentType;
    if (paymentDate !== undefined) payment.paymentDate = new Date(paymentDate);
    if (transactionId !== undefined) payment.transactionId = transactionId || '';
    if (referenceNumber !== undefined) payment.referenceNumber = referenceNumber || '';
    if (remarks !== undefined) payment.remarks = remarks || '';

    await recalculateJobCardFinancials(jobCard);
    await jobCard.save();

    await logAction(req.user, 'JOBCARD_FINAL_PAYMENT_UPDATE', `Updated final payment ID ${payment._id} on Job Card ${jobCard.jobCardNo}`, req);
    res.send(jobCard);
  } catch (error) {
    res.status(400).send({ error: 'Failed to update final payment: ' + error.message });
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

    await recalculateJobCardFinancials(jobCard);
    await jobCard.save();

    await logAction(req.user, 'JOBCARD_FINAL_PAYMENT_REMOVE', `Deleted final payment of ₹${removedPayment.amount} from Job Card ${jobCard.jobCardNo}`, req);
    res.send(jobCard);
  } catch (error) {
    res.status(400).send({ error: 'Failed to delete final payment: ' + error.message });
  }
});

// Handler helper for creating a waiver
const recordJobCardWaiver = async (req, res) => {
  try {
    const { amount, waivedAmount, reason, category, approvedBy, remarks } = req.body;
    const numWaived = Number(amount !== undefined ? amount : waivedAmount);
    if (isNaN(numWaived) || numWaived <= 0) {
      return res.status(400).send({ error: 'Valid positive waived amount is required.' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).send({ error: 'Valid reason for waiver is mandatory.' });
    }

    const validCategories = [
      'Customer Negotiation',
      'Goodwill Gesture',
      'Management Approval',
      'Service Delay Compensation',
      'Disputed Amount',
      'Round-off / Minor Adjustment',
      'Corporate Discount',
      'Service Recovery',
      'Other'
    ];
    const chosenCategory = validCategories.includes(category) ? category : 'Customer Negotiation';

    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    const Invoice = require('../models/Invoice');
    let invoice = await Invoice.findOne({ jobCardId: jobCard._id, status: 'Finalized' });
    if (!invoice) {
      invoice = await Invoice.findOne({ jobCardId: jobCard._id, status: { $ne: 'Cancelled' } });
    }

    const finalBillAmount = invoice
      ? (invoice.totals?.roundedGrandTotal || invoice.totals?.grandTotal || 0)
      : (jobCard.billingSummary?.grandTotal || 0);

    const estAmount = Number(jobCard.estAmt) || 
      (jobCard.financialSummary?.estimatedRepairAmount !== undefined ? jobCard.financialSummary.estimatedRepairAmount : 0);

    const baseAmount = finalBillAmount > 0 ? finalBillAmount : estAmount;

    const totalAdvance = (jobCard.advancePayments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalFinal = (jobCard.finalPayments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalReceived = totalAdvance + totalFinal;

    // Calculate currently active waivers
    const activeWaiverTotal = (jobCard.waivers || [])
      .filter(w => w.status !== 'Reversed')
      .reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

    const outstandingBeforeThisWaiver = Math.max(0, baseAmount - activeWaiverTotal - totalReceived);

    if (numWaived > (outstandingBeforeThisWaiver + 0.05)) {
      return res.status(400).send({
        error: `Waived amount (₹${numWaived.toFixed(2)}) cannot exceed remaining balance (₹${outstandingBeforeThisWaiver.toFixed(2)}).`
      });
    }

    if (!jobCard.waivers) jobCard.waivers = [];

    const approverName = (approvedBy && approvedBy.trim()) || (req.user ? req.user.name : 'Authorized Staff');

    const newWaiver = {
      amount: numWaived,
      reason: reason.trim(),
      category: chosenCategory,
      approvedBy: approverName,
      approvedById: req.user ? req.user._id : null,
      remarks: (remarks || '').trim(),
      status: 'Active',
      createdAt: new Date(),
      createdBy: req.user ? req.user.name : '',
      createdById: req.user ? req.user._id : null
    };

    jobCard.waivers.push(newWaiver);

    await recalculateJobCardFinancials(jobCard, { invoice });
    await jobCard.save();

    await logAction(
      req.user,
      'JOBCARD_BALANCE_WAIVE_OFF',
      `Waived off ₹${numWaived} (${chosenCategory}) for Job Card ${jobCard.jobCardNo}. Reason: ${reason}. Approved by: ${approverName}`,
      req
    );

    res.send(jobCard);
  } catch (error) {
    res.status(400).send({ error: 'Failed to record waiver: ' + error.message });
  }
};

// Settle / Waive off remaining balance of a Job Card (main & alias routes)
router.post('/:id/waive-off', auth, restrictTo('Super Admin', 'Admin', 'Accounts Executive', 'Accounts'), recordJobCardWaiver);
router.post('/:id/waivers', auth, restrictTo('Super Admin', 'Admin', 'Accounts Executive', 'Accounts'), recordJobCardWaiver);

// Get list of all waivers on a Job Card
router.get('/:id/waivers', auth, async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });
    res.send(jobCard.waivers || []);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch waivers: ' + error.message });
  }
});

// Reverse an approved waiver with audit log
router.post('/:id/waivers/:waiverId/reverse', auth, restrictTo('Super Admin', 'Admin', 'Accounts Executive', 'Accounts'), async (req, res) => {
  try {
    const { reversalReason } = req.body;
    if (!reversalReason || !reversalReason.trim()) {
      return res.status(400).send({ error: 'Reversal reason is mandatory to reverse a waiver.' });
    }

    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    const waiver = jobCard.waivers ? jobCard.waivers.id(req.params.waiverId) : null;
    if (!waiver) {
      return res.status(404).send({ error: 'Waiver record not found.' });
    }

    if (waiver.status === 'Reversed') {
      return res.status(400).send({ error: 'This waiver has already been reversed.' });
    }

    waiver.status = 'Reversed';
    waiver.reversedAt = new Date();
    waiver.reversedBy = req.user ? req.user.name : 'Authorized Staff';
    waiver.reversedById = req.user ? req.user._id : null;
    waiver.reversalReason = reversalReason.trim();

    await recalculateJobCardFinancials(jobCard);
    await jobCard.save();

    await logAction(
      req.user,
      'JOBCARD_WAIVER_REVERSED',
      `Reversed waiver of ₹${waiver.amount} on Job Card ${jobCard.jobCardNo}. Reason: ${reversalReason.trim()}`,
      req
    );

    res.send(jobCard);
  } catch (error) {
    res.status(400).send({ error: 'Failed to reverse waiver: ' + error.message });
  }
});

// Download Payment Receipt PDF for a payment on this Job Card
router.get('/:id/payment-receipt/:paymentId?', auth, async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id);
    if (!jobCard) return res.status(404).send({ error: 'Job Card not found.' });

    const Customer = require('../models/Customer');
    const Vehicle = require('../models/Vehicle');
    const Invoice = require('../models/Invoice');

    const [customer, vehicle, invoice] = await Promise.all([
      jobCard.customerId ? Customer.findById(jobCard.customerId).lean() : null,
      jobCard.vehicleId ? Vehicle.findById(jobCard.vehicleId).lean() : null,
      Invoice.findOne({ jobCardId: jobCard._id, status: 'Finalized' }).lean() || Invoice.findOne({ jobCardId: jobCard._id, status: { $ne: 'Cancelled' } }).lean()
    ]);

    let targetPayment = null;
    let isAdvance = false;

    if (req.params.paymentId) {
      targetPayment = (jobCard.advancePayments || []).find(p => p._id.toString() === req.params.paymentId);
      if (targetPayment) {
        isAdvance = true;
      } else {
        targetPayment = (jobCard.finalPayments || []).find(p => p._id.toString() === req.params.paymentId);
      }
    }

    if (!targetPayment) {
      const allPayments = [
        ...(jobCard.advancePayments || []).map(p => ({ ...p.toObject(), isAdvance: true })),
        ...(jobCard.finalPayments || []).map(p => ({ ...p.toObject(), isAdvance: false }))
      ].sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));

      if (allPayments.length === 0) {
        return res.status(400).send({ error: 'No payments recorded on this Job Card to generate a receipt.' });
      }
      targetPayment = allPayments[0];
      isAdvance = targetPayment.isAdvance;
    }

    const receiptNo = `REC-${(targetPayment._id ? targetPayment._id.toString().slice(-6) : Date.now().toString().slice(-6)).toUpperCase()}`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=receipt-${receiptNo}.pdf`);

    await logAction(req.user, 'REPORT_EXPORTED', `Exported Payment Receipt ${receiptNo} for Job Card ${jobCard.jobCardNo}`, req);

    generatePaymentReceiptPDF({
      receiptNo,
      receiptDate: targetPayment.paymentDate,
      payment: { ...targetPayment, isAdvance },
      jobCard,
      invoice,
      customer: customer || { name: 'Valued Customer', mobile: 'N/A' },
      vehicle: vehicle || { vehicleNumber: 'N/A', make: 'N/A', model: 'N/A' },
      financialSummary: jobCard.financialSummary,
      stream: res
    });
  } catch (error) {
    res.status(500).send({ error: 'Failed to generate payment receipt: ' + error.message });
  }
});

router.updateJobCardPaymentStatus = updateJobCardPaymentStatus;
module.exports = router;
