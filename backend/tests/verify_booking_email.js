const mongoose = require('mongoose');
require('dotenv').config({ path: 'backend/.env' });

const Booking = require('../models/Booking');
const bookingsRouter = require('../routes/bookings');

async function testBookingEmail() {
  console.log('--- Booking Service Email Verification Tool ---');
  console.log('Connecting to database...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected!');

  // Locate the POST / handler
  const postLayer = bookingsRouter.stack.find(layer => layer.route && layer.route.path === '/' && layer.route.methods.post);
  const postHandler = postLayer.route.stack[postLayer.route.stack.length - 1].handle; // last one is the controller

  try {
    // 1. Test missing customer email error
    console.log('\n1. Testing booking request with missing customer email...');
    const mockReq1 = {
      body: {
        customerName: 'Kushal Test',
        mobile: '+919949479765',
        vehicleNumber: 'TS-09-XX-1234',
        vehicleModel: 'Maruti Swift',
        serviceType: 'General Servicing',
        preferredDate: '2026-08-10'
      }
    };
    let statusReturned1;
    let bodyReturned1;
    const mockRes1 = {
      status: function(code) {
        statusReturned1 = code;
        return this;
      },
      json: (data) => {
        bodyReturned1 = data;
      }
    };

    await postHandler(mockReq1, mockRes1);
    console.log('Status code returned:', statusReturned1);
    console.log('Response body:', bodyReturned1);
    if (statusReturned1 === 400 && bodyReturned1.error === 'Customer email is required') {
      console.log('✔ Correctly returned 400 Bad Request with "Customer email is required"!');
    } else {
      console.error('❌ Failed validation test 1!');
      process.exit(1);
    }

    // 2. Test successful booking and customer email delivery
    console.log('\n2. Testing booking request with valid customer email...');
    // We send from onboarding@resend.dev to accounts@auto4m.in because that is authorized in sandbox.
    // For the test, we temporarily set customer email to accounts@auto4m.in.
    // But since the API key is not authorized to send *from* auto4m.in in sandbox mode, we temporarily override RESEND_FROM_EMAIL in process.env
    const originalFrom = process.env.RESEND_FROM_EMAIL;
    process.env.RESEND_FROM_EMAIL = 'onboarding@resend.dev';

    const mockReq2 = {
      body: {
        customerName: 'Kushal Test',
        mobile: '+919949479765',
        email: 'accounts@auto4m.in', // customer email (must be accounts@auto4m.in for sandbox delivery)
        vehicleNumber: 'TS-09-XX-1234',
        vehicleModel: 'Maruti Swift',
        serviceType: 'General Servicing',
        preferredDate: '2026-08-10'
      }
    };
    let statusReturned2;
    let bodyReturned2;
    const mockRes2 = {
      status: function(code) {
        statusReturned2 = code;
        return this;
      },
      json: (data) => {
        bodyReturned2 = data;
      }
    };

    await postHandler(mockReq2, mockRes2);
    console.log('Status code returned:', statusReturned2);
    console.log('Response body:', bodyReturned2);

    // Restore original
    process.env.RESEND_FROM_EMAIL = originalFrom;

    if (statusReturned2 === 201 && bodyReturned2.success === true) {
      console.log('✔ Booking created successfully!');
      console.log('Customer Email Sent:', bodyReturned2.customerEmailSent);
      console.log('Customer Email ID:', bodyReturned2.customerEmailId);
      console.log('Customer Email Error:', bodyReturned2.customerEmailError);
      
      if (bodyReturned2.customerEmailSent) {
        console.log('✔ Booking confirmation email successfully delivered to customer!');
      } else {
        console.error('❌ Email sending failed:', bodyReturned2.customerEmailError);
        process.exit(1);
      }
    } else {
      console.error('❌ Failed booking creation test 2!');
      process.exit(1);
    }

    // Cleanup
    if (bodyReturned2 && bodyReturned2.booking && bodyReturned2.booking._id) {
      await Booking.findByIdAndDelete(bodyReturned2.booking._id);
      console.log('✔ Cleanup completed successfully!');
    }

    console.log('\n🎉 ALL BOOKING EMAIL TESTS PASSED SUCCESSFULLY!');

  } catch (error) {
    console.error('Error during test execution:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

testBookingEmail();
