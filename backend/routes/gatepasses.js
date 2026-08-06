const express = require('express');
const router = express.Router();
const GatePass = require('../models/GatePass');
const Notification = require('../models/Notification');
const { auth, restrictTo } = require('../middleware/auth');
const { logAction } = require('../utils/logger');

router.use(auth, restrictTo('Admin', 'Service', 'Body Shop', 'Accounts Executive'));

// Generate unique sequential gate pass number (e.g. GP-260702-001)
const generateGatePassNo = async () => {
  const today = new Date();
  const year = today.getFullYear().toString().slice(-2);
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  const latest = await GatePass.findOne({ gatePassNo: new RegExp(`^GP-${dateStr}-`) })
    .sort({ gatePassNo: -1 });

  let sequence = '001';
  if (latest) {
    const parts = latest.gatePassNo.split('-');
    if (parts.length === 3) {
      const lastSeq = parseInt(parts[2], 10);
      sequence = (lastSeq + 1).toString().padStart(3, '0');
    }
  }

  return `GP-${dateStr}-${sequence}`;
};

// GET: Fetch list of gate passes with search and query filters
router.get('/', auth, async (req, res) => {
  try {
    const { searchQuery, status } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    if (searchQuery) {
      const searchRegex = new RegExp(searchQuery, 'i');
      query.$or = [
        { gatePassNo: searchRegex },
        { customerName: searchRegex },
        { customerMobile: searchRegex },
        { vehicleNumber: searchRegex },
        { jobCardNumber: searchRegex },
        { materialName: searchRegex },
        { sentTo: searchRegex }
      ];
    }

    const gatepasses = await GatePass.find(query).sort({ createdAt: -1 });
    res.json(gatepasses);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch gate passes: ' + error.message });
  }
});

// GET: Fetch single gate pass
router.get('/:id', auth, async (req, res) => {
  try {
    const gatepass = await GatePass.findById(req.params.id);
    if (!gatepass) {
      return res.status(404).json({ error: 'Gate Pass not found' });
    }
    res.json(gatepass);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch gate pass: ' + error.message });
  }
});

// POST: Create a new gate pass
router.post('/', auth, async (req, res) => {
  try {
    const {
      jobCardNumber,
      vehicleNumber,
      customerName,
      customerMobile,
      materialName,
      quantity,
      unit,
      reasonForIssue,
      sentTo,
      receiverName,
      receiverMobile,
      receiverSignature,
      authorizedSignature,
      status,
      attachments
    } = req.body;

    if (!vehicleNumber || !customerName || !customerMobile || !materialName || !quantity || !reasonForIssue || !sentTo || !receiverName || !receiverMobile) {
      return res.status(400).json({ error: 'Missing required gate pass fields' });
    }

    const gatePassNo = await generateGatePassNo();
    const issuedBy = req.user?.name || 'Staff Member';

    const gatepass = new GatePass({
      gatePassNo,
      jobCardNumber: jobCardNumber || '',
      vehicleNumber,
      customerName,
      customerMobile,
      materialName,
      quantity,
      unit: unit || 'Nos',
      reasonForIssue,
      sentTo,
      issuedBy,
      authorizedBy: req.user?.role === 'Admin' ? req.user.name : '',
      receiverName,
      receiverMobile,
      receiverSignature: receiverSignature || '',
      authorizedSignature: authorizedSignature || '',
      status: status || 'Issued',
      attachments: attachments || []
    });

    await gatepass.save();

    // Automatically create a notification
    const notification = new Notification({
      type: 'gatepass',
      title: 'Gate Pass Created',
      message: `Gate Pass ${gatepass.gatePassNo} has been issued for ${gatepass.materialName} (${gatepass.quantity} ${gatepass.unit}) to ${gatepass.sentTo}.`,
      vehicleNumber: gatepass.vehicleNumber,
      customerName: gatepass.customerName,
      status: 'unread'
    });
    await notification.save();

    // Log action in audit log
    await logAction(req.user, 'GATEPASS_CREATE', `Created Gate Pass ${gatepass.gatePassNo} for vehicle ${gatepass.vehicleNumber}`, req);

    res.status(201).json(gatepass);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create gate pass: ' + error.message });
  }
});

// PUT: Update a gate pass / log material return
router.post('/:id/print-log', auth, async (req, res) => {
  try {
    const gatepass = await GatePass.findById(req.params.id);
    if (!gatepass) {
      return res.status(404).json({ error: 'Gate Pass not found' });
    }
    await logAction(req.user, 'GATEPASS_PRINT', `Printed Gate Pass ${gatepass.gatePassNo} PDF`, req);
    res.json({ message: 'Print logged.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const gatepass = await GatePass.findById(req.params.id);
    if (!gatepass) {
      return res.status(404).json({ error: 'Gate Pass not found' });
    }

    const oldStatus = gatepass.status;
    const { status, returnDate, receiverSignature, authorizedSignature, attachments } = req.body;

    if (status) gatepass.status = status;
    if (receiverSignature) gatepass.receiverSignature = receiverSignature;
    if (authorizedSignature) gatepass.authorizedSignature = authorizedSignature;
    if (attachments) gatepass.attachments = attachments;

    if (status === 'Returned' && oldStatus !== 'Returned') {
      gatepass.returnDate = returnDate || new Date();
      
      // Save notification for returned material
      const notification = new Notification({
        type: 'gatepass',
        title: 'Material Returned',
        message: `Materials on Gate Pass ${gatepass.gatePassNo} (${gatepass.materialName}) have been returned.`,
        vehicleNumber: gatepass.vehicleNumber,
        customerName: gatepass.customerName,
        status: 'unread'
      });
      await notification.save();
      
      await logAction(req.user, 'GATEPASS_RETURN', `Logged material return for Gate Pass ${gatepass.gatePassNo}`, req);
    } else {
      await logAction(req.user, 'GATEPASS_UPDATE', `Updated Gate Pass ${gatepass.gatePassNo} status to ${status}`, req);
    }

    await gatepass.save();
    res.json(gatepass);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update gate pass: ' + error.message });
  }
});

// DELETE: Delete a gate pass (Admin only)
router.delete('/:id', auth, restrictTo('Admin'), async (req, res) => {
  try {
    const gatepass = await GatePass.findById(req.params.id);
    if (!gatepass) {
      return res.status(404).json({ error: 'Gate Pass not found' });
    }
    await GatePass.findByIdAndDelete(req.params.id);
    await logAction(req.user, 'GATEPASS_DELETE', `Deleted Gate Pass ${gatepass.gatePassNo}`, req);
    res.json({ message: 'Gate pass deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete gate pass: ' + error.message });
  }
});

module.exports = router;
