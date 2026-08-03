const express = require('express');
const Insurance = require('../models/Insurance');
const Vehicle = require('../models/Vehicle');
const { auth } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const router = express.Router();

// List insurance policies with search & filters
router.get('/', auth, async (req, res) => {
  try {
    const { search, company, claimStatus } = req.query;
    let query = {};

    if (company) {
      query.insuranceCompany = { $regex: company, $options: 'i' };
    }
    if (claimStatus) {
      query.claimStatus = claimStatus;
    }

    if (search) {
      const vehicles = await Vehicle.find({
        vehicleNumber: { $regex: search, $options: 'i' }
      });
      const vehicleIds = vehicles.map(v => v._id);

      query.$or = [
        { ownerName: { $regex: search, $options: 'i' } },
        { ownerMobile: { $regex: search, $options: 'i' } },
        { policyNumber: { $regex: search, $options: 'i' } },
        { insuranceCompany: { $regex: search, $options: 'i' } },
        { vehicleId: { $in: vehicleIds } }
      ];
    }

    const policies = await Insurance.find(query)
      .populate('vehicleId')
      .sort({ expiryDate: 1 });

    res.send(policies);
  } catch (error) {
    console.error('Failed to fetch insurance policies:', error);
    res.status(500).send({ error: 'Failed to fetch insurance policies.' });
  }
});

// Create new insurance policy
router.post('/', auth, async (req, res) => {
  try {
    const policy = new Insurance(req.body);
    await policy.save();

    await logAction(req.user, 'INSURANCE_CREATE', `Created insurance policy ${policy.policyNumber} (${policy.insuranceCompany})`, req);
    res.status(201).send(policy);
  } catch (error) {
    res.status(400).send({ error: 'Failed to save policy details: ' + error.message });
  }
});

// Update insurance policy
router.put('/:id', auth, async (req, res) => {
  try {
    const policy = await Insurance.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!policy) return res.status(404).send({ error: 'Insurance policy not found.' });

    await logAction(req.user, 'INSURANCE_UPDATE', `Updated insurance policy ${policy.policyNumber} (${policy.insuranceCompany})`, req);
    res.send(policy);
  } catch (error) {
    res.status(400).send({ error: 'Failed to save policy details: ' + error.message });
  }
});

// Delete insurance policy
router.delete('/:id', auth, async (req, res) => {
  try {
    const policy = await Insurance.findByIdAndDelete(req.params.id);
    if (!policy) return res.status(404).send({ error: 'Insurance policy not found.' });

    await logAction(req.user, 'INSURANCE_DELETE', `Deleted insurance policy ${policy.policyNumber} (${policy.insuranceCompany})`, req);
    res.send({ message: 'Policy deleted successfully.' });
  } catch (error) {
    const status = error.name === 'CastError' ? 400 : 500;
    res.status(status).send({ error: 'Failed to delete policy.' });
  }
});

module.exports = router;
