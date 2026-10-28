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

router.use(auth, restrictTo('Admin', 'Service', 'Body Shop', 'Accounts Executive'));

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
    
    // [Stage 2] Claim status updated
    console.log(`[InsuranceClaim] [Stage 2] Claim updated successfully: ID=${claim._id}, ClaimNo=${claim.claimNo || claim.claimNumber}, Status=${claim.status}`);

    // WhatsApp Integration: Insurance Claim Update
    if (status && status !== oldStatus) {
      try {
        const JobCard = require('../models/JobCard');
        const Customer = require('../models/Customer');
        const VehicleModel = require('../models/Vehicle');
        const { sendTemplateMessage, normalizePhoneNumber, resolveTemplateSpec } = require('../services/whatsappService');

        const custId = (claim.customerId && claim.customerId._id) ? claim.customerId._id : claim.customerId;
        const vehId = (claim.vehicleId && claim.vehicleId._id) ? claim.vehicleId._id : claim.vehicleId;
        const jcId = (claim.jobCardId && claim.jobCardId._id) ? claim.jobCardId._id : claim.jobCardId;

        const jc = jcId ? await JobCard.findById(jcId).lean() : null;
        const customerRecord = custId 
          ? await Customer.findById(custId).lean() 
          : (jc?.customerId ? await Customer.findById(jc.customerId).lean() : null);
        const vehicle = vehId 
          ? await VehicleModel.findById(vehId).lean() 
          : (jc?.vehicleId ? await VehicleModel.findById(jc.vehicleId).lean() : null);

        const rawPhone = customerRecord ? (customerRecord.mobile || customerRecord.phone || customerRecord.contactNumber) : null;
        const customerName = String(customerRecord?.name || claim.customerName || 'Valued Customer').trim();
        const vehicleNumber = String(vehicle?.vehicleNumber || vehicle?.regNo || claim.vehicleNumber || 'your vehicle').trim();
        const claimNumber = String(claim.claimNumber || claim.claimNo || 'N/A').trim();
        const claimStatus = String(claim.status || 'Updated').trim();

        const normalizedPhone = rawPhone ? normalizePhoneNumber(rawPhone) : null;
        const templateName = 'mvss_insurance_claim_update';
        const correlationKey = `insurance_claim_update_${claim._id}_${claimStatus.replace(/\s+/g, '')}`;
        const maskedPhone = rawPhone ? (rawPhone.substring(0, 3) + '****' + rawPhone.slice(-3)) : 'missing';
        const isValidContact = Boolean(normalizedPhone && normalizedPhone.length >= 10);

        // [Stage 3] Automation event triggered
        console.log(`[Claim Automation] [Stage 3] Automation event triggered: ClaimNo=${claimNumber}, Status=${claimStatus}`);

        // Check if template is registered/approved in Meta WABA
        const templateSpec = resolveTemplateSpec(templateName);
        const isMetaApproved = templateSpec && templateSpec.status === 'APPROVED';

        // [Stage 4] Customer contact/template validation result
        console.log(`[Claim Automation] [Stage 4] Contact/template validation: Customer="${customerName}", Phone="${maskedPhone}", ValidContact=${isValidContact}, Template="${templateName}", MetaApproved=${isMetaApproved}`);

        if (isValidContact) {
          // [Stage 5] WhatsApp send attempted
          console.log(`[Claim Automation] [Stage 5] WhatsApp send attempted: To=${maskedPhone}, Template=${templateName}, CorrelationKey=${correlationKey}`);

          try {
            const waResult = await sendTemplateMessage({
              to: normalizedPhone,
              templateName,
              components: [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: customerName },
                    { type: 'text', text: vehicleNumber },
                    { type: 'text', text: claimNumber },
                    { type: 'text', text: claimStatus }
                  ]
                }
              ],
              recipientName: customerName,
              relatedEntity: claim._id,
              onModel: 'InsuranceClaim',
              idempotencyKey: correlationKey
            });

            // [Stage 6] Meta response accepted
            console.log(`[Claim Automation] [Stage 6] Meta response accepted: Claim=${claimNumber}, wamid=${waResult.messageId || 'duplicate_skipped'}, Status=${waResult.status || 'accepted'}`);
          } catch (waSendErr) {
            // [Stage 6] Meta response failed (isolated, does not fail claim update)
            console.error(`[Claim Automation] [Stage 6] Meta response failed: Claim=${claimNumber}, Error=${waSendErr.message || waSendErr}`);
          }
        } else {
          console.warn(`[Claim Automation] [Stage 4] Skipping WhatsApp dispatch: Customer contact invalid (${maskedPhone})`);
        }
      } catch (waError) {
        console.error('[Claim Automation] Unexpected error in WhatsApp insurance claim hook:', waError.message || waError);
      }
    }

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
