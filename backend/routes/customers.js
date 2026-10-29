const express = require('express');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const JobCard = require('../models/JobCard');
const Estimate = require('../models/Estimate');
const Invoice = require('../models/Invoice');
const InsuranceClaim = require('../models/InsuranceClaim');
const Booking = require('../models/Booking');
const { auth, restrictTo } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const { sendTemplateMessage, validateCustomerContact } = require('../services/whatsappService');
const router = express.Router();

// Get Customers with search
router.get('/', auth, async (req, res) => {
  try {
    const { search, type } = req.query;
    let query = {};
    
    if (search) {
      // Find matching vehicles and job cards concurrently
      const [matchingVehicles, matchingJobCards] = await Promise.all([
        Vehicle.find({
          $or: [
            { vehicleNumber: { $regex: search, $options: 'i' } },
            { make: { $regex: search, $options: 'i' } },
            { model: { $regex: search, $options: 'i' } }
          ]
        }).select('customerId').lean(),
        JobCard.find({
          jobCardNo: { $regex: search, $options: 'i' }
        }).select('customerId').lean()
      ]);
      
      const vehicleCustomerIds = matchingVehicles.map(v => v.customerId);
      const jobCardCustomerIds = matchingJobCards.map(jc => jc.customerId);

      // Combine customer IDs and filter out duplicates/nulls
      const extraCustomerIds = [...new Set([...vehicleCustomerIds, ...jobCardCustomerIds].filter(id => id).map(id => id.toString()))];

      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } },
        { gstNumber: { $regex: search, $options: 'i' } },
        { _id: { $in: extraCustomerIds } }
      ];
    }
    
    if (type) {
      query.type = type;
    }

    const customers = await Customer.find(query).sort({ createdAt: -1 }).lean();
    res.send(customers);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch customers.' });
  }
});

// GET /api/customers/search?q=
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    if (!q || q.trim().length < 2) {
      return res.send([]);
    }

    const trimmedQuery = q.trim();

    // 1. Search customers by name or mobile (using regex case-insensitive)
    const matchedCustomers = await Customer.find({
      $or: [
        { name: { $regex: trimmedQuery, $options: 'i' } },
        { mobile: { $regex: trimmedQuery, $options: 'i' } }
      ]
    }).limit(10);

    const matchedCustomerIds = matchedCustomers.map(c => c._id);

    // 2. Search vehicles by matched customers, or search vehicles directly by vehicleNumber
    const matchedVehiclesByNo = await Vehicle.find({
      vehicleNumber: { $regex: trimmedQuery, $options: 'i' }
    }).populate('customerId').limit(10);

    const matchedVehiclesByCust = await Vehicle.find({
      customerId: { $in: matchedCustomerIds }
    }).populate('customerId');

    // Combine results into a single list of auto-fill entries
    const resultsMap = new Map();

    // Helper to add unique entries
    const addResult = (customer, vehicle) => {
      if (!customer) return;
      const key = `${customer._id}_${vehicle ? vehicle._id : 'no_vehicle'}`;
      if (!resultsMap.has(key)) {
        resultsMap.set(key, {
          customerId: customer._id,
          customerName: customer.name,
          mobile: customer.mobile,
          vehicleId: vehicle ? vehicle._id : null,
          vehicleNumber: vehicle ? vehicle.vehicleNumber : '',
          vehicleModel: vehicle ? `${vehicle.make} ${vehicle.model}` : ''
        });
      }
    };

    // First add results from direct customer matches
    for (const customer of matchedCustomers) {
      const custVehicles = matchedVehiclesByCust.filter(v => v.customerId && v.customerId._id.toString() === customer._id.toString());
      if (custVehicles.length > 0) {
        for (const vehicle of custVehicles) {
          addResult(customer, vehicle);
        }
      } else {
        addResult(customer, null);
      }
    }

    // Then add results from vehicle matches
    for (const vehicle of matchedVehiclesByNo) {
      addResult(vehicle.customerId, vehicle);
    }

    const results = Array.from(resultsMap.values());
    res.send(results);
  } catch (error) {
    console.error('Search API error:', error);
    res.status(500).send({ error: 'Search failed' });
  }
});

// Get Single Customer Details
router.get('/:id', auth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).send({ error: 'Customer not found.' });
    res.send(customer);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch customer details.' });
  }
});

/**
 * Resolves the vehicle registration number for a customer welcome message.
 * Follows priority:
 * 1. Explicit vehicleNumber passed in context/req.body
 * 2. Explicit vehicleId passed in context/req.body -> Vehicle.vehicleNumber
 * 3. Associated JobCard (explicit jobCardId or latest JobCard for this customer) -> Vehicle.vehicleNumber
 * 4. Vehicles directly linked to this customer (sorted by latest updatedAt/createdAt)
 * 5. Service Booking/Appointment linked to customer's mobile number
 * 6. Fallback to 'Not provided' (never company name)
 */
async function resolveCustomerVehicleNumber(customer, context = {}) {
  try {
    // 1. Explicit vehicleNumber in context/body
    if (context && context.vehicleNumber && typeof context.vehicleNumber === 'string' && context.vehicleNumber.trim()) {
      return context.vehicleNumber.trim().toUpperCase();
    }

    // 2. Explicit vehicleId in context/body
    if (context && context.vehicleId) {
      try {
        const directVeh = await Vehicle.findById(context.vehicleId).select('vehicleNumber').lean();
        if (directVeh?.vehicleNumber) {
          return directVeh.vehicleNumber.trim().toUpperCase();
        }
      } catch (vehErr) {
        console.warn('[Customer Automation] Error resolving vehicle from vehicleId:', vehErr.message);
      }
    }

    // 3. Vehicle associated with relevant Job Card (explicit jobCardId or most recent for customer)
    try {
      let jc = null;
      if (context && context.jobCardId) {
        jc = await JobCard.findById(context.jobCardId).populate('vehicleId', 'vehicleNumber').lean();
      }
      if (!jc && customer?._id) {
        jc = await JobCard.findOne({ customerId: customer._id })
          .sort({ date: -1, createdAt: -1 })
          .populate('vehicleId', 'vehicleNumber')
          .lean();
      }
      if (jc?.vehicleId?.vehicleNumber) {
        return jc.vehicleId.vehicleNumber.trim().toUpperCase();
      }
    } catch (jcErr) {
      console.warn('[Customer Automation] Error resolving vehicle from JobCard:', jcErr.message);
    }

    // 4. Vehicles linked to this customer (if multiple, pick most recently updated/created)
    if (customer?._id) {
      try {
        const custVeh = await Vehicle.findOne({ customerId: customer._id })
          .sort({ updatedAt: -1, createdAt: -1 })
          .select('vehicleNumber')
          .lean();
        if (custVeh?.vehicleNumber) {
          return custVeh.vehicleNumber.trim().toUpperCase();
        }
      } catch (cvErr) {
        console.warn('[Customer Automation] Error resolving customer vehicles:', cvErr.message);
      }
    }

    // 5. Service Appointment / Booking linked to customer mobile
    const rawPhone = customer?.mobile || customer?.phone || context?.mobile || context?.phone;
    if (rawPhone) {
      try {
        const cleanDigits = String(rawPhone).replace(/\D/g, '');
        const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;
        const booking = await Booking.findOne({
          $or: [
            { mobile: rawPhone },
            { mobile: `+${cleanDigits}` },
            { mobile: last10 },
            { mobile: new RegExp(last10 + '$') }
          ]
        }).sort({ createdAt: -1 }).select('vehicleNumber').lean();

        if (booking?.vehicleNumber) {
          return booking.vehicleNumber.trim().toUpperCase();
        }
      } catch (bErr) {
        console.warn('[Customer Automation] Error resolving vehicle from Booking:', bErr.message);
      }
    }
  } catch (err) {
    console.warn('[Customer Automation] Error in resolveCustomerVehicleNumber:', err.message);
  }

  // If no vehicle is found, return null so no welcome message is sent without a vehicle
  return null;
}

/**
 * Dispatches the customer welcome WhatsApp notification.
 * Ensures parameter 1 is customer name and parameter 2 is the resolved vehicle registration number.
 * If no vehicle is registered for the customer, skips dispatch.
 */
async function sendCustomerWelcomeNotification(customer, context = {}, options = {}) {
  const vehicleNumber = await resolveCustomerVehicleNumber(customer, context);
  if (!vehicleNumber) {
    console.warn(`[Customer Automation] [Stage 3] Skipping welcome message: No vehicle registered for customer ID=${customer._id}. A valid vehicle registration number is required.`);
    return { success: false, reason: 'No vehicle registered for customer. A valid vehicle registration number is required.', vehicleNumber: null };
  }

  const rawPhone = customer.mobile || customer.phone;
  const customerName = String(customer.name || 'Valued Customer').trim();

  const contactCheck = validateCustomerContact(customer, rawPhone);
  const templateName = 'mvss_welcome_customer';
  const correlationKey = context.idempotencyKey || (options.forceResend ? `customer_welcome_${customer._id}_${Date.now()}` : `customer_created_${customer._id}`);

  // [Stage 3] Automation event triggered
  console.log(`[Customer Automation] [Stage 3] Automation event triggered: Event="Customer Welcome", CustomerId=${customer._id}, Name=${customerName}, VehicleNumber=${vehicleNumber}`);

  // [Stage 4] Customer contact/template validation result
  console.log(`[Customer Automation] [Stage 4] Contact/template validation result: Customer="${customerName}", Phone="${contactCheck.masked}", Valid=${contactCheck.valid}, Template="${templateName}"${!contactCheck.valid ? `, Reason="${contactCheck.reason}"` : ''}`);

  if (contactCheck.valid) {
    // [Stage 5] WhatsApp send attempted
    console.log(`[Customer Automation] [Stage 5] WhatsApp send attempted: To=${contactCheck.masked}, Template=${templateName}, CorrelationKey=${correlationKey}, VehicleNumber=${vehicleNumber}`);

    try {
      const waResult = await sendTemplateMessage({
        to: contactCheck.phone,
        templateName,
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: customerName },
              { type: 'text', text: vehicleNumber }
            ]
          }
        ],
        recipientName: customerName,
        relatedEntity: customer._id,
        onModel: 'Customer',
        idempotencyKey: correlationKey
      });

      // [Stage 6] Meta response accepted
      console.log(`[Customer Automation] [Stage 6] Meta response accepted: Customer=${customerName}, Vehicle=${vehicleNumber}, wamid=${waResult.messageId || 'duplicate_skipped'}, Status=${waResult.status || 'accepted'}`);
      return { success: true, waResult, vehicleNumber };
    } catch (waSendErr) {
      // [Stage 6] Meta response failed (isolated, does not fail customer creation)
      console.error(`[Customer Automation] [Stage 6] Meta response failed: Customer=${customerName}, Error=${waSendErr.message || waSendErr}`);
      return { success: false, error: waSendErr.message || waSendErr, vehicleNumber };
    }
  } else {
    console.warn(`[Customer Automation] [Stage 4] Skipping WhatsApp dispatch: ${contactCheck.reason}`);
    return { success: false, reason: contactCheck.reason, vehicleNumber };
  }
}

// Create Customer
router.post('/', auth, async (req, res) => {
  try {
    const customer = new Customer(req.body);
    await customer.save();
    
    // [Stage 2] Customer created
    console.log(`[Customer] [Stage 2] Customer saved successfully: ID=${customer._id}, Name=${customer.name}, Mobile=${customer.mobile}`);

    // Automatically create a notification
    try {
      const Notification = require('../models/Notification');
      const notification = new Notification({
        type: 'customer',
        title: 'New Customer Registered',
        message: `New customer ${customer.name} has been registered.`,
        customerName: customer.name,
        mobile: customer.phone || customer.mobile
      });
      await notification.save();
    } catch (notifErr) {
      console.error('Failed to create customer notification:', notifErr);
    }

    await logAction(req.user, 'CUSTOMER_CREATE', `Created customer ${customer.name} (Mobile: ${customer.mobile})`, req);
    res.status(201).send(customer);
  } catch (error) {
    res.status(400).send({ error: 'Failed to create customer.' });
  }
});

// Update Customer
router.put('/:id', auth, async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!customer) return res.status(404).send({ error: 'Customer not found.' });
    await logAction(req.user, 'CUSTOMER_UPDATE', `Updated customer ${customer.name}`, req);
    res.send(customer);
  } catch (error) {
    res.status(400).send({ error: 'Failed to update customer.' });
  }
});

// Get Customer Service History Timeline
router.get('/:id/timeline', auth, async (req, res) => {
  try {
    const customerId = req.params.id;
    
    // Find all Job Cards, Estimates, Invoices, Claims for this customer
    const jobCards = await JobCard.find({ customerId }).sort({ date: -1 }).populate('vehicleId');
    const estimates = await Estimate.find({ jobCardId: { $in: jobCards.map(jc => jc._id) } }).sort({ date: -1 });
    const invoices = await Invoice.find({ customerId }).sort({ date: -1 });
    const claims = await InsuranceClaim.find({ customerId }).sort({ createdAt: -1 });

    // Combine into a timeline format
    const timeline = [];
    
    jobCards.forEach(jc => {
      timeline.push({
        id: jc._id,
        type: 'Job Card',
        number: jc.jobCardNo,
        date: jc.date,
        status: jc.status,
        details: `Vehicle: ${jc.vehicleId ? jc.vehicleId.vehicleNumber : 'Unknown'}, Odo: ${jc.odometerReading} km, Complaints: ${jc.complaints.length}`
      });
    });

    estimates.forEach(est => {
      const matchJc = jobCards.find(jc => jc._id.toString() === est.jobCardId.toString());
      timeline.push({
        id: est._id,
        type: 'Estimate',
        number: est.estimateNo,
        date: est.date,
        status: est.status,
        details: `Grand Total: Rs. ${est.totals.grandTotal.toFixed(2)}, Spare parts count: ${est.parts.length}`
      });
    });

    invoices.forEach(inv => {
      timeline.push({
        id: inv._id,
        type: 'Invoice',
        number: inv.invoiceNo,
        date: inv.date,
        status: inv.status,
        details: `Net Total: Rs. ${inv.totals.grandTotal.toFixed(2)}, Payment: ${inv.paymentStatus}`
      });
    });

    claims.forEach(claim => {
      timeline.push({
        id: claim._id,
        type: 'Claim',
        number: claim.claimNo,
        date: claim.createdAt,
        status: claim.status,
        details: `Company: ${claim.insuranceCompany}, Surveyor: ${claim.surveyorName || 'Pending'}`
      });
    });

    // Sort timeline by date descending
    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.send(timeline);
  } catch (error) {
    res.status(500).send({ error: 'Failed to compile service history timeline.' });
  }
});

// Delete Customer
router.delete('/:id', auth, restrictTo('Admin'), async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).send({ error: 'Customer not found.' });
    await logAction(req.user, 'CUSTOMER_DELETE', `Deleted customer ${customer.name}`, req);
    res.send({ message: 'Customer deleted successfully.', customer });
  } catch (error) {
    res.status(500).send({ error: 'Failed to delete customer.' });
  }
});

// Trigger/Resend Customer Welcome WhatsApp Message
router.post('/:id/welcome', auth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).send({ error: 'Customer not found.' });

    const result = await sendCustomerWelcomeNotification(customer, req.body, { forceResend: req.body?.forceResend });
    if (!result.success && !result.vehicleNumber) {
      return res.status(400).send({
        error: result.reason || 'Cannot send welcome message: No vehicle registered for this customer yet.',
        success: false
      });
    }

    res.json({
      success: result.success,
      vehicleNumber: result.vehicleNumber,
      customerName: customer.name,
      result
    });
  } catch (error) {
    console.error('[Customer Automation] Failed to send welcome message:', error);
    res.status(500).send({ error: 'Failed to send welcome message.' });
  }
});

router.resolveCustomerVehicleNumber = resolveCustomerVehicleNumber;
router.sendCustomerWelcomeNotification = sendCustomerWelcomeNotification;
module.exports = router;
