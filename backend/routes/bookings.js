const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const https = require('https');
const router = express.Router();

const { sendEmail } = require('../services/emailService');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const Message = require('../models/Message');
const { logAction } = require('../utils/logger');
const { auth } = require('../middleware/auth');

// n8n PRODUCTION webhook URL
const DEFAULT_BOOKING_WEBHOOK_URL = 'https://vamshiyadav406.app.n8n.cloud/webhook/5f347f8c-353b-4af8-ae83-3c26f152f11a';

/**
 * Send booking data to n8n webhook
 */
function postToBookingWebhook(payload) {
  return new Promise((resolve, reject) => {
    try {
      const webhookUrl = process.env.BOOKING_WEBHOOK_URL || DEFAULT_BOOKING_WEBHOOK_URL;
      const url = new URL(webhookUrl);
      const transport = url.protocol === 'https:' ? https : http;
      const body = JSON.stringify(payload);

      const request = transport.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (response) => {
          let responseBody = '';

          response.on('data', (chunk) => {
            responseBody += chunk;
          });

          response.on('end', () => {
            if (
              response.statusCode >= 200 &&
              response.statusCode < 300
            ) {
              resolve({
                statusCode: response.statusCode,
                body: responseBody,
              });
            } else {
              reject(
                new Error(
                  `n8n webhook responded with status ${response.statusCode}: ${responseBody}`
                )
              );
            }
          });
        }
      );

      request.on('error', (error) => {
        reject(error);
      });

      request.setTimeout(10000);
      request.on('timeout', () => {
        request.destroy(new Error('Webhook request timed out (10s)'));
      });

      request.write(body);
      request.end();
    } catch (error) {
      reject(error);
    }
  });
}


// Create new booking (Public)
router.post('/', async (req, res) => {
  try {
    console.log('[BOOKING ROUTE] Booking request received.');
    console.log('REQUEST BODY:', req.body);

    const {
      customerName,
      mobile,
      email,
      vehicleNumber,
      vehicleModel,
      serviceType,
      preferredDate,
      bookingDate,
      bookingTime,
      remarks,
      branch,
    } = req.body;

    const customerEmail = email ? String(email).trim() : '';

    console.log(`[BOOKING ROUTE] Booking received for ${customerName} (${vehicleNumber})`);
    console.log('Booking request received');

    // Validate required fields
    if (!customerName || !mobile || !vehicleNumber || !serviceType) {
      return res.status(400).json({
        success: false,
        error: 'Customer name, mobile, vehicle number and service type are required',
      });
    }

    if (!customerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Customer email is missing.',
      });
    }

    // Validate env variables
    const missingEnvVars = [];
    if (!process.env.RESEND_API_KEY) missingEnvVars.push('RESEND_API_KEY');
    if (!process.env.RESEND_FROM_EMAIL) missingEnvVars.push('RESEND_FROM_EMAIL');
    if (!process.env.ADMIN_EMAIL) missingEnvVars.push('ADMIN_EMAIL');

    if (missingEnvVars.length > 0) {
      return res.status(500).json({
        success: false,
        error: `Required email environment variable(s) missing: ${missingEnvVars.join(', ')}`,
      });
    }

    const bDate =
      bookingDate || new Date().toLocaleDateString('en-IN');

    const bTime =
      bookingTime || new Date().toLocaleTimeString('en-IN');


    const adminEmail = process.env.ADMIN_EMAIL;

    // ==========================================
    // 1. PREPARE DATA FOR N8N WEBHOOK
    // ==========================================

    const bookingPayload = {
      customerName,
      mobile,
      email: customerEmail,
      customerEmail: customerEmail,
      adminEmail: adminEmail,
      workshopEmail: adminEmail,
      vehicleNumber,
      vehicleModel: vehicleModel || '',
      serviceType,
      preferredDate: preferredDate || '',
      bookingDate: bDate,
      bookingTime: bTime,
      remarks: remarks || '',
      source: 'backend_booking_route',
    };

    const BOOKING_WEBHOOK_URL = process.env.BOOKING_WEBHOOK_URL || DEFAULT_BOOKING_WEBHOOK_URL;
    console.log('[BOOKING ROUTE] N8N WEBHOOK URL:', BOOKING_WEBHOOK_URL);
    console.log('[BOOKING ROUTE] N8N WEBHOOK PAYLOAD:', bookingPayload);


    // ==========================================
    // 2. SEND DATA TO N8N WEBHOOK
    // ==========================================

    let webhookTriggered = false;
    let webhookError = null;

    try {
      console.log('CALLING WEBHOOK...');
      const webhookResult = await postToBookingWebhook(bookingPayload);

      webhookTriggered = true;

      console.log('WEBHOOK SUCCESS');
      console.log('Status:', webhookResult.statusCode);
      console.log('Response:', webhookResult.body);
    } catch (error) {
      webhookError = error.message;

      console.log('WEBHOOK FAILURE:', error);
    }


    // ==========================================
    // 3. SAVE BOOKING TO DATABASE
    // ==========================================

    const booking = new Booking({
      customerName,
      mobile,
      email: customerEmail,
      vehicleNumber,
      vehicleModel: vehicleModel || '',
      serviceType,
      bookingDate: bDate,
      bookingTime: bTime,
      preferredDate: preferredDate || '',
      remarks: remarks || '',
    });

    await booking.save();
    console.log(`[BOOKING ROUTE] Booking Created with ID: ${booking._id}`);


    // ==========================================
    // 4. CREATE NOTIFICATION
    // ==========================================

    const notification = new Notification({
      type: 'booking',
      title: 'New Service Booking',

      message: preferredDate
        ? `${customerName} has requested a service appointment on ${preferredDate}.`
        : `${customerName} has requested a service appointment.`,

      customerName,
      mobile,
      vehicleNumber,
      serviceType,
      preferredDate: preferredDate || '',
      status: 'unread',
    });

    await notification.save();


    // ==========================================
    // 5. CREATE MESSAGE INQUIRY
    // ==========================================

    const message = new Message({
      type: 'booking',
      senderName: customerName,
      phone: mobile,
      subject: 'Service Booking Message',

      body: `${customerName} has requested a service slot for vehicle ${vehicleNumber} (Type: ${serviceType})${
        preferredDate ? ` on ${preferredDate}` : ''
      }. Submitted on ${bDate} at ${bTime}. Remarks: ${
        remarks || 'None'
      }`,

      status: 'unread',
    });

    await message.save();


    // ==========================================
    // 6. LOG BOOKING ACTION
    // ==========================================

    try {
      const guestUser = {
        _id: new mongoose.Types.ObjectId(),
        name: customerName,
        role: 'Guest',
      };

      await logAction(
        guestUser,
        'BOOKING_CREATE',
        `Customer ${customerName} requested service booking for ${vehicleNumber} (Type: ${serviceType})`,
        req
      );
    } catch (logErr) {
      console.warn('Logging failed:', logErr.message);
    }


    // ==========================================
    // 7. SEND EMAIL NOTIFICATIONS (CUSTOMER & ADMIN)
    // ==========================================

    let adminEmailSent = false;
    let customerEmailSent = false;
    let adminEmailError = null;
    let customerEmailError = null;
    let adminEmailId = null;
    let customerEmailId = null;
    let emailLogs = [];

    const senderEmail = process.env.RESEND_FROM_EMAIL;
    const recipientAdminEmail = process.env.ADMIN_EMAIL;

    // 7a. Send Customer Booking Confirmation
    if (customerEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(customerEmail)) {
        try {
          console.log(`[BOOKING ROUTE] Customer Email sending started to: ${customerEmail}`);
          const htmlBodyCustomer = `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
              <h2 style="color: #c1121f; margin-top: 0;">Service Booking Confirmed</h2>
              <p>Dear ${customerName},</p>
              <p>Thank you for choosing MVSS Automobiles. Your service booking has been registered successfully. Our service team will contact you shortly to confirm your final slot reservation.</p>
              
              <h3 style="color: #1e293b; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px;">Booking Details</h3>
              <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px;">
                <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold; width: 45%;">Booking Reference Code:</td><td style="padding: 8px 0; font-family: monospace; font-weight: bold; color: #c1121f;">${booking._id.toString().toUpperCase()}</td></tr>
                <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Vehicle Reg No:</td><td style="padding: 8px 0; text-transform: uppercase;">${vehicleNumber}</td></tr>
                <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Vehicle Model:</td><td style="padding: 8px 0;">${vehicleModel || 'N/A'}</td></tr>
                <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Service Category:</td><td style="padding: 8px 0;">${serviceType}</td></tr>
                <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Preferred Service Date:</td><td style="padding: 8px 0;">${preferredDate || 'Not provided'}</td></tr>
                <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Branch:</td><td style="padding: 8px 0;">${branch || 'MVSS Automobiles Main Branch'}</td></tr>
              </table>
              
              <div style="margin-top: 25px; padding: 15px; background-color: #f8fafc; border-radius: 8px; font-size: 12px; color: #64748b; border-left: 4px solid #c1121f;">
                <strong>Need Help?</strong> Contact us at +91 99494 79765 or reply to this email for any questions.
              </div>
              <p style="font-size: 11px; color: #94a3b8; margin-top: 20px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px;">
                © ${new Date().getFullYear()} MVSS Automobiles. Quality service with passion.
              </p>
            </div>
          `;

          const customerResult = await sendEmail({
            to: customerEmail,
            subject: `Service Booking Confirmed - MVSS Automobiles`,
            html: htmlBodyCustomer,
            from: senderEmail
          });

          if (customerResult.success) {
            customerEmailSent = true;
            customerEmailId = customerResult.emailId || customerResult.data?.id || 'N/A';
            console.log(`[BOOKING ROUTE SUCCESS] Customer Email Sent to ${customerEmail}. ID: ${customerEmailId}`);
            emailLogs.push(`Customer email sent successfully to ${customerEmail} (ID: ${customerEmailId})`);
          } else {
            customerEmailError = customerResult.error?.message || JSON.stringify(customerResult.error);
            console.error(`[BOOKING ROUTE ERROR] Customer Email Failed: ${customerEmailError}`);
            emailLogs.push(`Customer email failed: ${customerEmailError}`);
          }
        } catch (custErr) {
          customerEmailError = custErr.message || String(custErr);
          console.error('[BOOKING ROUTE EXCEPTION] Customer Email Failed:', custErr);
          emailLogs.push(`Customer email exception: ${customerEmailError}`);
        }
      } else {
        customerEmailError = 'Invalid email address format';
        console.warn(`[BOOKING ROUTE WARNING] Customer Email is invalid: ${customerEmail}`);
        emailLogs.push(`Customer email skipped: invalid format`);
      }
    } else {
      console.log('[BOOKING ROUTE] Customer email not provided, skipping confirmation email.');
      emailLogs.push('Customer email skipped: not provided');
    }

    // 7b. Send Admin Booking Notification
    try {
      console.log(`[BOOKING ROUTE] Admin Email sending started to: ${recipientAdminEmail}`);
      const htmlBodyAdmin = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #4f46e5; margin-top: 0;">New Service Booking Received</h2>
          <p>A new service appointment has been booked via the MVSS portal.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px;">
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold; width: 45%;">Booking Reference Number:</td><td style="padding: 8px 0; font-family: monospace; font-weight: bold;">${booking._id.toString().toUpperCase()}</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Customer Name:</td><td style="padding: 8px 0;">${customerName}</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Mobile Number:</td><td style="padding: 8px 0;">${mobile}</td></tr>
            ${customerEmail ? `<tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Customer Email:</td><td style="padding: 8px 0;">${customerEmail}</td></tr>` : ''}
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Vehicle Number:</td><td style="padding: 8px 0; text-transform: uppercase;">${vehicleNumber}</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Vehicle Model:</td><td style="padding: 8px 0;">${vehicleModel || 'N/A'}</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Service Category:</td><td style="padding: 8px 0;">${serviceType}</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Preferred Service Date:</td><td style="padding: 8px 0;">${preferredDate || 'Not provided'}</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Branch:</td><td style="padding: 8px 0;">${branch || 'MVSS Automobiles Main Branch'}</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Date & Time of Booking:</td><td style="padding: 8px 0;">${bDate} at ${bTime}</td></tr>
            ${remarks ? `<tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: bold;">Remarks:</td><td style="padding: 8px 0;">${remarks}</td></tr>` : ''}
          </table>
          <p style="font-size: 11px; color: #94a3b8; margin-bottom: 0;">This is an automated notification. Please handle the booking reservation accordingly.</p>
        </div>
      `;

      const adminResult = await sendEmail({
        to: recipientAdminEmail,
        subject: `New Service Booking - MVSS Automobiles`,
        html: htmlBodyAdmin,
        from: senderEmail
      });

      if (adminResult.success) {
        adminEmailSent = true;
        adminEmailId = adminResult.emailId || adminResult.data?.id || 'N/A';
        console.log(`[BOOKING ROUTE SUCCESS] Admin Email Sent to ${recipientAdminEmail}. ID: ${adminEmailId}`);
        emailLogs.push(`Admin email sent successfully to ${recipientAdminEmail} (ID: ${adminEmailId})`);
      } else {
        adminEmailError = adminResult.error?.message || JSON.stringify(adminResult.error);
        console.error(`[BOOKING ROUTE ERROR] Admin Email Failed: ${adminEmailError}`);
        emailLogs.push(`Admin email failed: ${adminEmailError}`);
      }
    } catch (adminErr) {
      adminEmailError = adminErr.message || String(adminErr);
      console.error('[BOOKING ROUTE EXCEPTION] Admin Email Failed:', adminErr);
      emailLogs.push(`Admin email exception: ${adminEmailError}`);
    }

    // Required logging details
    console.log(`[BOOKING LOG] Customer email: ${customerEmail}`);
    console.log(`[BOOKING LOG] Admin email: ${recipientAdminEmail}`);
    console.log(`[BOOKING LOG] Resend status: ${customerEmailSent && adminEmailSent ? 'Success' : 'Failed'}`);
    console.log(`[BOOKING LOG] Email ID: ${customerEmailId || 'N/A'} / ${adminEmailId || 'N/A'}`);

    // ==========================================
    // 8. RETURN SUCCESS RESPONSE
    // ==========================================

    console.log('Booking response returned');
    return res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      bookingSaved: true,
      webhookTriggered,
      webhookError,
      webhookUrl: BOOKING_WEBHOOK_URL,
      emailSent: adminEmailSent || customerEmailSent,
      adminEmailSent,
      customerEmailSent,
      adminEmailId,
      customerEmailId,
      adminEmailError,
      customerEmailError,
      emailLogs,
      booking,
    });

  } catch (err) {
    console.error('Failed to create booking:', err);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      message: 'Failed to create booking',
      details: err.message,
    });
  }
});


// Get all bookings (Authenticated)
router.get('/', auth, async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    console.error('Failed to fetch bookings:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
