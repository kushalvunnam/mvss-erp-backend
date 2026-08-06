const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const InsuranceClaim = require('../models/InsuranceClaim');
const { auth, restrictTo } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const router = express.Router();

router.use((req, res, next) => {
  console.log(`[CLAIMS] Route request received: ${req.method} ${req.baseUrl}${req.path}`);
  next();
});

router.use(auth, restrictTo('Admin', 'Service', 'Body Shop'));

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

// List all claims
router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};
    if (status) query.status = status;

    const claims = await InsuranceClaim.find(query)
      .populate('customerId')
      .populate('vehicleId')
      .populate('invoiceId')
      .populate('jobCardId')
      .sort({ createdAt: -1 });

    res.send(claims);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch insurance claims.' });
  }
});

// Create new claim entry
router.post('/', auth, async (req, res) => {
  try {
    let claim = new InsuranceClaim(req.body);
    claim.approvalHistory.push({
      status: claim.status || 'Pending',
      updatedBy: req.user.email || 'System User',
      remarks: 'Initial claim created',
      updatedAt: new Date()
    });
    await claim.save();

    // Automatically create a notification
    try {
      const Notification = require('../models/Notification');
      const notification = new Notification({
        type: 'claim',
        title: 'Insurance Claim Request',
        message: `New insurance claim request submitted for vehicle ${claim.vehicleNumber || 'Pending'}.`,
        vehicleNumber: claim.vehicleNumber,
        customerName: claim.customerName
      });
      await notification.save();
    } catch (notifErr) {
      console.error('Failed to create claim notification:', notifErr);
    }

    claim = await InsuranceClaim.findById(claim._id)
      .populate('customerId')
      .populate('vehicleId')
      .populate('invoiceId')
      .populate('jobCardId');
    await logAction(req.user, 'CLAIM_CREATE', `Created Insurance Claim ${claim.claimNo} with status ${claim.status}`, req);
    res.status(201).send(claim);
  } catch (error) {
    res.status(400).send({ error: 'Failed to create claim.' });
  }
});

// Upload Claim Document
router.post('/:id/upload', auth, upload.single('document'), async (req, res) => {
  try {
    const claim = await InsuranceClaim.findById(req.params.id);
    if (!claim) return res.status(404).send({ error: 'Insurance Claim not found.' });

    const docName = req.body.name || 'Other Document';
    const docUrl = `/uploads/${req.file.filename}`;

    claim.documents.push({
      name: docName,
      url: docUrl
    });

    await claim.save();
    await logAction(req.user, 'CLAIM_DOC_UPLOAD', `Uploaded document "${docName}" for claim ${claim.claimNo}`, req);
    
    res.send({ message: 'Document uploaded.', documents: claim.documents });
  } catch (error) {
    res.status(500).send({ error: 'Failed to upload document.' });
  }
});

// Update claim details / status
router.put('/:id', auth, async (req, res) => {
  try {
    const claim = await InsuranceClaim.findById(req.params.id);
    if (!claim) return res.status(404).send({ error: 'Insurance Claim not found.' });

    const oldStatus = claim.status;
    const { status, remarks, ...otherFields } = req.body;

    // Apply updates
    Object.assign(claim, otherFields);

    if (status && status !== oldStatus) {
      claim.status = status;
      claim.approvalHistory.push({
        status,
        updatedBy: req.user.email || 'System User',
        remarks: remarks || 'Status updated',
        updatedAt: new Date()
      });
    }

    await claim.save();
    
    const populated = await InsuranceClaim.findById(claim._id)
      .populate('customerId')
      .populate('vehicleId')
      .populate('invoiceId')
      .populate('jobCardId');

    await logAction(req.user, 'CLAIM_UPDATE', `Updated Insurance Claim ${populated.claimNo}. Status: ${populated.status}`, req);
    res.send(populated);
  } catch (error) {
    res.status(400).send({ error: 'Failed to update claim.' });
  }
});

// Get single claim details
router.get('/:id', auth, async (req, res) => {
  try {
    const claim = await InsuranceClaim.findById(req.params.id)
      .populate('customerId')
      .populate('vehicleId')
      .populate('invoiceId')
      .populate('jobCardId');
    if (!claim) return res.status(404).send({ error: 'Claim not found.' });
    res.send(claim);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch claim.' });
  }
});

module.exports = router;
