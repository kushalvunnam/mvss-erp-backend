const express = require('express');
const ExternalRepair = require('../models/ExternalRepair');

// Ensure referenced models are registered for mongoose population
require('../models/JobCard');
require('../models/Vendor');
require('../models/Vehicle');

// Auto-create collection in DB if missing
ExternalRepair.createCollection().catch(err => {
  console.log('ExternalRepair collection auto-creation:', err.message);
});

const { auth, restrictTo } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const { getNextSequence } = require('../utils/documentNumbering');
const router = express.Router();

router.use(auth);

// GET: List all external repairs
router.get('/', async (req, res) => {
  try {
    const repairs = await ExternalRepair.find()
      .populate('jobCardId')
      .populate('vendorId')
      .populate('vehicleId')
      .sort({ createdAt: -1 });
    res.send(repairs);
  } catch (error) {
    res.status(500).send({ error: 'Failed to retrieve external repairs: ' + error.message });
  }
});

// GET: Get specific external repair
router.get('/:id', async (req, res) => {
  try {
    const repair = await ExternalRepair.findById(req.params.id)
      .populate('jobCardId')
      .populate('vendorId')
      .populate('vehicleId');
    if (!repair) return res.status(404).send({ error: 'External repair not found.' });
    res.send(repair);
  } catch (error) {
    res.status(500).send({ error: 'Failed to retrieve repair details: ' + error.message });
  }
});

// POST: Create external repair
router.post('/', restrictTo('Admin', 'Accounts', 'Service', 'Body Shop'), async (req, res) => {
  try {
    const {
      jobCardId,
      jobCardNo,
      vendorId,
      vendorName,
      vehicleId,
      vehicleNo,
      repairDescription,
      cost,
      status,
      date,
      remarks
    } = req.body;

    if (!vendorName || !vehicleNo || !repairDescription || cost === undefined) {
      return res.status(400).send({ error: 'Required fields missing: vendorName, vehicleNo, repairDescription, cost' });
    }

    const repairNo = await getNextSequence('EXT', 'ExternalRepair');

    const repair = new ExternalRepair({
      repairNo,
      jobCardId,
      jobCardNo,
      vendorId,
      vendorName,
      vehicleId,
      vehicleNo,
      repairDescription,
      cost: Number(cost) || 0,
      status: status || 'Pending',
      date: date ? new Date(date) : new Date(),
      remarks: remarks || '',
      createdBy: req.user ? req.user.name : 'Staff'
    });

    await repair.save();
    await logAction(req.user, 'EXTERNAL_REPAIR_CREATE', `Created external repair ${repair.repairNo} for vehicle ${repair.vehicleNo}`, req);
    res.status(201).send(repair);
  } catch (error) {
    res.status(400).send({ error: 'Failed to create external repair: ' + error.message });
  }
});

// PUT: Update external repair
router.put('/:id', restrictTo('Admin', 'Accounts', 'Service', 'Body Shop'), async (req, res) => {
  try {
    const repair = await ExternalRepair.findById(req.params.id);
    if (!repair) return res.status(404).send({ error: 'External repair not found.' });

    const updatableFields = [
      'jobCardId', 'jobCardNo', 'vendorId', 'vendorName',
      'vehicleId', 'vehicleNo', 'repairDescription', 'cost',
      'status', 'date', 'remarks'
    ];

    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        repair[field] = req.body[field];
      }
    });

    repair.lastUpdatedBy = req.user ? req.user.name : 'Staff';
    await repair.save();

    await logAction(req.user, 'EXTERNAL_REPAIR_UPDATE', `Updated external repair ${repair.repairNo}`, req);
    res.send(repair);
  } catch (error) {
    res.status(400).send({ error: 'Failed to update external repair: ' + error.message });
  }
});

// DELETE: Delete external repair
router.delete('/:id', restrictTo('Admin'), async (req, res) => {
  try {
    const repair = await ExternalRepair.findByIdAndDelete(req.params.id);
    if (!repair) return res.status(404).send({ error: 'External repair not found.' });

    await logAction(req.user, 'EXTERNAL_REPAIR_DELETE', `Deleted external repair ${repair.repairNo}`, req);
    res.send({ message: 'External repair deleted successfully.' });
  } catch (error) {
    res.status(500).send({ error: 'Failed to delete external repair: ' + error.message });
  }
});

module.exports = router;
