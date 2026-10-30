const express = require('express');
const Vendor = require('../models/Vendor');
const Purchase = require('../models/Purchase');
const { auth, restrictTo } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const router = express.Router();

router.use((req, res, next) => {
  console.log(`[VENDORS] Route request received: ${req.method} ${req.baseUrl}${req.path}`);
  next();
});

// Helper to auto-generate Vendor Code
const generateVendorCode = async () => {
  const count = await Vendor.countDocuments();
  const sequence = String(count + 1).padStart(4, '0');
  return `VND-${sequence}`;
};

// List all vendors with search, category, type filter, and summary stats
router.get('/', auth, async (req, res) => {
  try {
    const { search, category, type, status } = req.query;
    let query = {};

    if (category) query.category = category;
    if (type) query.type = type;
    if (status) query.status = status;

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { vendorCode: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { gstNumber: { $regex: search, $options: 'i' } },
        { supplierBrand: { $regex: search, $options: 'i' } },
        { brands: { $regex: search, $options: 'i' } }
      ];
    }

    let vendors = await Vendor.find(query).sort({ name: 1 });

    if (vendors.length === 0 && !search && !category && !type) {
      const defaultVendors = [
        { vendorCode: 'VND-0001', name: 'Bosch Automotive Parts', category: 'Spares', type: 'Authorized Distributor', mobile: '9876543210', city: 'Hyderabad', paymentTerms: 'Net 30', supplierBrand: 'Bosch', brands: ['Bosch'] },
        { vendorCode: 'VND-0002', name: 'Castrol Lubricants India', category: 'Lubricants', type: 'Manufacturer', mobile: '9876543211', city: 'Hyderabad', paymentTerms: 'Immediate', supplierBrand: 'Castrol', brands: ['Castrol'] },
        { vendorCode: 'VND-0003', name: 'Gates Auto Belts & Hoses', category: 'Spares', type: 'Wholesaler', mobile: '9876543212', city: 'Hyderabad', paymentTerms: 'Net 15', supplierBrand: 'Gates', brands: ['Gates'] },
        { vendorCode: 'VND-0004', name: 'Philips Automotive Lighting', category: 'Spares', type: 'Authorized Distributor', mobile: '9876543213', city: 'Hyderabad', paymentTerms: 'Net 30', supplierBrand: 'Philips', brands: ['Philips'] },
        { vendorCode: 'VND-0005', name: 'Exide Batteries Ltd', category: 'Batteries & Tyres', type: 'Wholesaler', mobile: '9876543214', city: 'Hyderabad', paymentTerms: 'Net 30', supplierBrand: 'Exide', brands: ['Exide'] }
      ];
      try {
        await Vendor.insertMany(defaultVendors);
        vendors = await Vendor.find(query).sort({ name: 1 });
      } catch (e) {
        console.error('Vendor auto-seed error:', e);
      }
    }

    // Calculate overall stats
    const totalVendors = vendors.length;
    const totalPurchaseValue = vendors.reduce((acc, v) => acc + (v.totalPurchaseValue || 0), 0);
    const totalOutstanding = vendors.reduce((acc, v) => acc + (v.outstandingBalance || 0), 0);
    const totalPaid = vendors.reduce((acc, v) => acc + (v.totalPaidAmount || 0), 0);

    res.json({
      success: true,
      vendors,
      stats: {
        totalVendors,
        totalPurchaseValue,
        totalOutstanding,
        totalPaid
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch vendors: ' + error.message, message: error.message });
  }
});

// Get single vendor
router.get('/:id', auth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found.', message: 'Vendor not found.' });

    const purchases = await Purchase.find({ vendorId: vendor._id }).sort({ createdAt: -1 });
    res.json({ success: true, vendor, purchases });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch vendor details.', message: error.message });
  }
});

// Create Vendor
router.post('/', auth, restrictTo('Admin', 'Spares'), async (req, res) => {
  console.log('[VENDORS] POST request received');
  try {
    const { name, mobile, vendorCode, email, gstNumber } = req.body;
    
    // Validation
    const trimmedName = name ? name.trim() : '';
    const trimmedMobile = mobile ? mobile.trim() : '';
    
    if (!trimmedName || !trimmedMobile) {
      console.warn('[VENDORS] Validation failed: Name or mobile is empty');
      return res.status(400).json({ 
        success: false, 
        error: 'Vendor Name and Mobile Number are required.', 
        message: 'Vendor Name and Mobile Number are required.' 
      });
    }

    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        console.warn('[VENDORS] Validation failed: Invalid email format');
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid email format.', 
          message: 'Invalid email format.' 
        });
      }
    }

    if (gstNumber && gstNumber.trim()) {
      const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstRegex.test(gstNumber.trim().toUpperCase())) {
        console.warn('[VENDORS] Validation failed: Invalid GSTIN format');
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid GSTIN format.', 
          message: 'Invalid GSTIN format.' 
        });
      }
    }

    const code = vendorCode ? vendorCode.trim() : await generateVendorCode();
    
    // Unique check
    const existingCode = await Vendor.findOne({ vendorCode: code });
    if (existingCode) {
      console.warn(`[VENDORS] Validation failed: Vendor code "${code}" already exists`);
      return res.status(400).json({ 
        success: false, 
        error: `Vendor code "${code}" already exists.`, 
        message: `Vendor code "${code}" already exists.` 
      });
    }

    const vendor = new Vendor({
      ...req.body,
      vendorCode: code
    });

    await vendor.save();
    console.log('[VENDORS] Vendor created');
    await logAction(req.user, 'VENDOR_CREATE', `Created vendor ${vendor.name} (${vendor.vendorCode})`, req);
    res.status(201).json({ success: true, vendor });
  } catch (error) {
    console.error('[VENDORS] Error creating vendor:', error);
    res.status(400).json({ 
      success: false, 
      error: 'Failed to create vendor: ' + error.message, 
      message: error.message 
    });
  }
});

// Update Vendor
router.put('/:id', auth, restrictTo('Admin', 'Spares'), async (req, res) => {
  try {
    const { name, mobile, email, gstNumber } = req.body;

    if (name !== undefined) {
      if (!name || !name.trim()) {
        console.warn('[VENDORS] Validation failed: Name is empty on update');
        return res.status(400).json({ 
          success: false, 
          error: 'Vendor Name cannot be empty.', 
          message: 'Vendor Name cannot be empty.' 
        });
      }
    }

    if (mobile !== undefined) {
      if (!mobile || !mobile.trim()) {
        console.warn('[VENDORS] Validation failed: Mobile is empty on update');
        return res.status(400).json({ 
          success: false, 
          error: 'Mobile number cannot be empty.', 
          message: 'Mobile number cannot be empty.' 
        });
      }
    }

    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        console.warn('[VENDORS] Validation failed: Invalid email format on update');
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid email format.', 
          message: 'Invalid email format.' 
        });
      }
    }

    if (gstNumber && gstNumber.trim()) {
      const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstRegex.test(gstNumber.trim().toUpperCase())) {
        console.warn('[VENDORS] Validation failed: Invalid GSTIN format on update');
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid GSTIN format.', 
          message: 'Invalid GSTIN format.' 
        });
      }
    }

    const vendor = await Vendor.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found.', message: 'Vendor not found.' });

    await logAction(req.user, 'VENDOR_UPDATE', `Updated vendor ${vendor.name} (${vendor.vendorCode})`, req);
    res.json({ success: true, vendor });
  } catch (error) {
    res.status(400).json({ success: false, error: 'Failed to update vendor: ' + error.message, message: error.message });
  }
});

// Delete Vendor
router.delete('/:id', auth, restrictTo('Admin'), async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found.', message: 'Vendor not found.' });

    // Check if vendor has purchases
    const purchaseCount = await Purchase.countDocuments({ vendorId: vendor._id });
    if (purchaseCount > 0) {
      return res.status(400).json({ success: false, error: `Cannot delete vendor with ${purchaseCount} existing purchase transactions. Set status to Inactive instead.`, message: `Cannot delete vendor with ${purchaseCount} existing purchase transactions.` });
    }

    await Vendor.findByIdAndDelete(req.params.id);
    await logAction(req.user, 'VENDOR_DELETE', `Deleted vendor ${vendor.name} (${vendor.vendorCode})`, req);
    res.json({ success: true, message: 'Vendor deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete vendor: ' + error.message, message: error.message });
  }
});

module.exports = router;
