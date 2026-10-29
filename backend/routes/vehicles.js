const express = require('express');
const Vehicle = require('../models/Vehicle');
const Customer = require('../models/Customer');
const JobCard = require('../models/JobCard');
const { auth, restrictTo } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const { sendTemplateMessage, validateCustomerContact } = require('../services/whatsappService');
const router = express.Router();

/**
 * Dispatches the customer welcome WhatsApp notification upon vehicle creation.
 * Resolves the linked customer and sends the template `mvss_welcome_customer`
 * with parameter 1 = customer.name and parameter 2 = vehicle.vehicleNumber.
 *
 * Requirements:
 * - Customer and vehicle must both exist; vehicle registration number must be present.
 * - Idempotency key per vehicle (`vehicle_welcome_${vehicle._id}`) prevents duplicates.
 * - Existing customers adding a new vehicle receive the welcome message for the new vehicle.
 * - If customer or vehicle registration number is missing, do not send.
 */
async function sendVehicleWelcomeNotification(vehicle, options = {}) {
  try {
    if (!vehicle) {
      console.warn('[Vehicle Automation] [Stage 3] Cannot trigger welcome message: Vehicle object is missing.');
      return { success: false, reason: 'Vehicle object is missing.' };
    }

    const vehicleNumber = vehicle.vehicleNumber ? String(vehicle.vehicleNumber).trim().toUpperCase() : '';
    if (!vehicleNumber) {
      console.warn(`[Vehicle Automation] [Stage 3] Skipping welcome message: Vehicle registration number is missing for vehicle ID=${vehicle._id || 'unknown'}.`);
      return { success: false, reason: 'Vehicle registration number is missing.' };
    }

    const customerId = vehicle.customerId?._id || vehicle.customerId;
    if (!customerId) {
      console.warn(`[Vehicle Automation] [Stage 3] Skipping welcome message: Linked customer ID is missing on vehicle ${vehicleNumber}.`);
      return { success: false, reason: 'Linked customer ID is missing.' };
    }

    // Retrieve customer record if not fully populated
    let customer = null;
    if (vehicle.customerId && typeof vehicle.customerId === 'object' && vehicle.customerId.name && (vehicle.customerId.mobile || vehicle.customerId.phone)) {
      customer = vehicle.customerId;
    } else {
      customer = await Customer.findById(customerId);
    }

    if (!customer) {
      console.warn(`[Vehicle Automation] [Stage 3] Skipping welcome message: Linked customer ${customerId} not found in database for vehicle ${vehicleNumber}.`);
      return { success: false, reason: 'Linked customer not found in database.' };
    }

    const customerName = String(customer.name || '').trim();
    if (!customerName) {
      console.warn(`[Vehicle Automation] [Stage 3] Skipping welcome message: Customer name is missing for customer ID=${customer._id}.`);
      return { success: false, reason: 'Customer name is missing.' };
    }

    const rawPhone = customer.mobile || customer.phone;
    const contactCheck = validateCustomerContact(customer, rawPhone);

    const templateName = 'mvss_welcome_customer';
    const correlationKey = options.idempotencyKey || (options.forceResend ? `vehicle_welcome_${vehicle._id}_${Date.now()}` : `vehicle_welcome_${vehicle._id}`);

    // [Stage 3] Automation event triggered
    console.log(`[Vehicle Automation] [Stage 3] Automation event triggered: Event="Customer Welcome (Vehicle Created)", VehicleId=${vehicle._id}, CustomerId=${customer._id}, Name="${customerName}", VehicleNumber="${vehicleNumber}"`);

    // [Stage 4] Contact/template validation result
    console.log(`[Vehicle Automation] [Stage 4] Contact/template validation result: Customer="${customerName}", Phone="${contactCheck.masked}", Valid=${contactCheck.valid}, Template="${templateName}"${!contactCheck.valid ? `, Reason="${contactCheck.reason}"` : ''}`);

    if (contactCheck.valid) {
      // [Stage 5] WhatsApp send attempted
      console.log(`[Vehicle Automation] [Stage 5] WhatsApp send attempted: To=${contactCheck.masked}, Template=${templateName}, CorrelationKey=${correlationKey}, VehicleNumber=${vehicleNumber}`);

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
        console.log(`[Vehicle Automation] [Stage 6] Meta response accepted: Customer="${customerName}", Vehicle="${vehicleNumber}", wamid=${waResult.messageId || 'duplicate_skipped'}, Status=${waResult.status || 'accepted'}`);
        return { success: true, waResult, customerName, vehicleNumber, correlationKey };
      } catch (waSendErr) {
        // [Stage 6] Meta response failed (isolated, does not fail vehicle creation)
        console.error(`[Vehicle Automation] [Stage 6] Meta response failed: Customer="${customerName}", Vehicle="${vehicleNumber}", Error=${waSendErr.message || waSendErr}`);
        return { success: false, error: waSendErr.message || waSendErr, customerName, vehicleNumber, correlationKey };
      }
    } else {
      console.warn(`[Vehicle Automation] [Stage 4] Skipping WhatsApp dispatch: ${contactCheck.reason}`);
      return { success: false, reason: contactCheck.reason, customerName, vehicleNumber, correlationKey };
    }
  } catch (err) {
    console.error('[Vehicle Automation] Error in sendVehicleWelcomeNotification:', err.message || err);
    return { success: false, error: err.message || err };
  }
}

// Create vehicle
router.post('/', auth, async (req, res) => {
  try {
    const rawVehNumber = req.body.vehicleNumber ? String(req.body.vehicleNumber).trim().toUpperCase().replace(/\s/g, '') : '';
    if (!rawVehNumber) {
      return res.status(400).send({ error: 'Vehicle registration number is required.' });
    }

    const vehicleData = {
      ...req.body,
      vehicleNumber: rawVehNumber
    };
    
    const existingVehicle = await Vehicle.findOne({ vehicleNumber: vehicleData.vehicleNumber });
    if (existingVehicle) {
      return res.status(400).send({ error: 'Vehicle with this registration number already exists.' });
    }

    const vehicle = new Vehicle(vehicleData);
    await vehicle.save();
    await logAction(req.user, 'VEHICLE_CREATE', `Created vehicle ${vehicle.vehicleNumber} (Make: ${vehicle.make} ${vehicle.model})`, req);

    // WhatsApp Automation: Customer Welcome triggered on vehicle creation
    try {
      await sendVehicleWelcomeNotification(vehicle, { idempotencyKey: req.body?.idempotencyKey });
    } catch (waError) {
      console.error('[Vehicle Automation] Unexpected error in vehicle welcome WhatsApp hook:', waError.message || waError);
    }

    res.status(201).send(vehicle);
  } catch (error) {
    res.status(400).send({ error: error.message || 'Failed to create vehicle.' });
  }
});

// List all vehicles with search
router.get('/', auth, async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};
    if (search) {
      query.$or = [
        { vehicleNumber: { $regex: search, $options: 'i' } },
        { chassisNumber: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } }
      ];
    }
    const vehicles = await Vehicle.find(query).populate('customerId').sort({ createdAt: -1 });
    res.send(vehicles);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch vehicles.' });
  }
});

// Find vehicle by number
router.get('/number/:vehicleNumber', auth, async (req, res) => {
  try {
    const vehicle = await Vehicle.findOne({ 
      vehicleNumber: req.params.vehicleNumber.toUpperCase().replace(/\s/g, '') 
    }).populate('customerId');
    
    if (!vehicle) {
      return res.status(404).send({ error: 'Vehicle not found.' });
    }
    res.send(vehicle);
  } catch (error) {
    res.status(500).send({ error: 'Failed to find vehicle.' });
  }
});

// Get vehicle details by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id).populate('customerId');
    if (!vehicle) return res.status(404).send({ error: 'Vehicle not found.' });
    res.send(vehicle);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch vehicle.' });
  }
});

// Create vehicle
router.post('/', auth, async (req, res) => {
  try {
    const vehicleData = {
      ...req.body,
      vehicleNumber: req.body.vehicleNumber.toUpperCase().replace(/\s/g, '')
    };
    
    const existingVehicle = await Vehicle.findOne({ vehicleNumber: vehicleData.vehicleNumber });
    if (existingVehicle) {
      return res.status(400).send({ error: 'Vehicle with this registration number already exists.' });
    }

    const vehicle = new Vehicle(vehicleData);
    await vehicle.save();
    await logAction(req.user, 'VEHICLE_CREATE', `Created vehicle ${vehicle.vehicleNumber} (Make: ${vehicle.make} ${vehicle.model})`, req);
    res.status(201).send(vehicle);
  } catch (error) {
    res.status(400).send({ error: 'Failed to create vehicle.' });
  }
});

// Update vehicle
router.put('/:id', auth, async (req, res) => {
  try {
    const vehicleData = { ...req.body };
    if (vehicleData.vehicleNumber) {
      vehicleData.vehicleNumber = vehicleData.vehicleNumber.toUpperCase().replace(/\s/g, '');
    }
    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, vehicleData, { new: true, runValidators: true });
    if (!vehicle) return res.status(404).send({ error: 'Vehicle not found.' });
    await logAction(req.user, 'VEHICLE_UPDATE', `Updated vehicle ${vehicle.vehicleNumber}`, req);
    res.send(vehicle);
  } catch (error) {
    res.status(400).send({ error: 'Failed to update vehicle.' });
  }
});

// Get Vehicle Service History
router.get('/:id/history', auth, async (req, res) => {
  try {
    const jobCards = await JobCard.find({ vehicleId: req.params.id })
      .populate('serviceAdvisorId', 'name')
      .sort({ date: -1 });
    res.send(jobCards);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch vehicle service history.' });
  }
});

// Get vehicles by customer ID
router.get('/customer/:customerId', auth, async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ customerId: req.params.customerId }).sort({ createdAt: -1 });
    res.send(vehicles);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch customer vehicles.' });
  }
});

// Delete Vehicle
router.delete('/:id', auth, restrictTo('Admin'), async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndDelete(req.params.id);
    if (!vehicle) return res.status(404).send({ error: 'Vehicle not found.' });
    await logAction(req.user, 'VEHICLE_DELETE', `Deleted vehicle ${vehicle.vehicleNumber}`, req);
    res.send({ message: 'Vehicle deleted successfully.' });
  } catch (error) {
    res.status(500).send({ error: 'Failed to delete vehicle.' });
  }
});

// Trigger/Resend Vehicle Welcome WhatsApp Message
router.post('/:id/welcome', auth, async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).send({ error: 'Vehicle not found.' });

    const result = await sendVehicleWelcomeNotification(vehicle, { 
      forceResend: req.body?.forceResend,
      idempotencyKey: req.body?.idempotencyKey 
    });

    res.json({
      success: result.success,
      vehicleNumber: result.vehicleNumber,
      customerName: result.customerName,
      result
    });
  } catch (error) {
    console.error('[Vehicle Automation] Failed to send welcome message:', error);
    res.status(500).send({ error: 'Failed to send welcome message.' });
  }
});

router.sendVehicleWelcomeNotification = sendVehicleWelcomeNotification;
module.exports = router;
