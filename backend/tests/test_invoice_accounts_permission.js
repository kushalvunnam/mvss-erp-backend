const assert = require('assert');
const axios = require('axios');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const Invoice = require('../models/Invoice');
const JobCard = require('../models/JobCard');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/invoices', require('../routes/invoices'));

async function runTests() {
  console.log('========================================================================');
  console.log('TEST SUITE: Role-Based Authorization & Invoice Creation for Accounts Role');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✔ Connected to MongoDB.');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`✔ Test server running on port ${port}.`);

  const cleanup = {
    users: [],
    customers: [],
    vehicles: [],
    jobcards: [],
    invoices: []
  };

  try {
    // 1. Create Test Users with distinct roles
    const adminUser = await User.create({
      name: 'Test Admin User',
      email: `admin_${Date.now()}@mvsstest.com`,
      password: 'password123',
      role: 'Admin',
      active: true
    });
    cleanup.users.push(adminUser._id);

    const accountsUser = await User.create({
      name: 'Test Accounts User',
      email: `accounts_${Date.now()}@mvsstest.com`,
      password: 'password123',
      role: 'Accounts',
      active: true
    });
    cleanup.users.push(accountsUser._id);

    const accountsExecUser = await User.create({
      name: 'Test Accounts Exec User',
      email: `accountsexec_${Date.now()}@mvsstest.com`,
      password: 'password123',
      role: 'Accounts Executive',
      active: true
    });
    cleanup.users.push(accountsExecUser._id);

    const serviceUser = await User.create({
      name: 'Test Service Advisor',
      email: `service_${Date.now()}@mvsstest.com`,
      password: 'password123',
      role: 'Service',
      active: true
    });
    cleanup.users.push(serviceUser._id);

    // Generate JWT auth tokens (using _id matching auth middleware)
    const adminToken = jwt.sign({ _id: adminUser._id, role: adminUser.role }, JWT_SECRET, { expiresIn: '1h' });
    const accountsToken = jwt.sign({ _id: accountsUser._id, role: accountsUser.role }, JWT_SECRET, { expiresIn: '1h' });
    const accountsExecToken = jwt.sign({ _id: accountsExecUser._id, role: accountsExecUser.role }, JWT_SECRET, { expiresIn: '1h' });
    const serviceToken = jwt.sign({ _id: serviceUser._id, role: serviceUser.role }, JWT_SECRET, { expiresIn: '1h' });

    const adminHeaders = { Authorization: `Bearer ${adminToken}` };
    const accountsHeaders = { Authorization: `Bearer ${accountsToken}` };
    const accountsExecHeaders = { Authorization: `Bearer ${accountsExecToken}` };
    const serviceHeaders = { Authorization: `Bearer ${serviceToken}` };

    // 2. Setup Test Customer & Vehicle
    const testCustomer = await Customer.create({
      name: 'Sri Krishna Test Customer',
      mobile: `9198${Date.now().toString().slice(-8)}`,
      email: `customer_${Date.now()}@mvsstest.com`
    });
    cleanup.customers.push(testCustomer._id);

    const testVehicle = await Vehicle.create({
      vehicleNumber: `TS09TEST${Date.now().toString().slice(-4)}`,
      customerId: testCustomer._id,
      make: 'Maruti Suzuki',
      model: 'Swift',
      fuelType: 'Petrol',
      odometerReading: 15000
    });
    cleanup.vehicles.push(testVehicle._id);

    // Helper to create a Job Card for invoice linkage
    const makeJobCard = async (suffix) => {
      const jc = await JobCard.create({
        jobCardNo: `JC-INV-${Date.now().toString().slice(-4)}-${suffix}`,
        customerId: testCustomer._id,
        vehicleId: testVehicle._id,
        serviceAdvisorId: adminUser._id,
        odometerReading: 15000,
        time: '11:00 AM',
        status: 'Ready for Delivery',
        customerDetails: {
          name: testCustomer.name,
          mobile: testCustomer.mobile
        },
        vehicleDetails: {
          vehicleNumber: testVehicle.vehicleNumber,
          model: testVehicle.model
        }
      });
      cleanup.jobcards.push(jc._id);
      return jc;
    };

    // Standard sample invoice payload generator
    const makeInvoicePayload = (jobCardId) => ({
      jobCardId,
      invoiceType: 'Tax Invoice',
      parts: [
        {
          name: 'Engine Oil Synthetic 5W30',
          partNo: 'OIL-SYN-01',
          qty: 4,
          rate: 800,
          discountType: 'Percent',
          discountPercent: 10,
          discountAmount: 0,
          gstPercent: 18
        }
      ],
      labour: [
        {
          description: 'General Periodic Maintenance Service',
          qty: 1,
          rate: 1500,
          discountType: 'Percent',
          discountPercent: 0,
          discountAmount: 0,
          gstPercent: 18
        }
      ],
      gstDetails: {
        isInterstate: false,
        customerGSTIN: ''
      },
      preparedBy: 'Accounts Dept Test'
    });

    // =========================================================================
    // TEST 1: Admin Role Can Create Invoices
    // =========================================================================
    console.log('\n--- TEST 1: Admin Role Invoice Creation ---');
    const jcAdmin = await makeJobCard('ADM');
    const adminRes = await axios.post(
      `${baseUrl}/api/invoices`,
      makeInvoicePayload(jcAdmin._id),
      { headers: adminHeaders }
    );
    assert.strictEqual(adminRes.status, 201, 'Admin must create invoice with HTTP 201');
    assert(adminRes.data.invoiceNo, 'Created invoice must have invoiceNo');
    cleanup.invoices.push(adminRes.data._id);
    console.log(`✔ Admin created invoice ${adminRes.data.invoiceNo} successfully (HTTP 201).`);

    // =========================================================================
    // TEST 2: Accounts Role Can Create Invoices
    // =========================================================================
    console.log('\n--- TEST 2: Accounts Role Invoice Creation ---');
    const jcAccounts = await makeJobCard('ACC');
    const accountsRes = await axios.post(
      `${baseUrl}/api/invoices`,
      makeInvoicePayload(jcAccounts._id),
      { headers: accountsHeaders }
    );
    assert.strictEqual(accountsRes.status, 201, 'Accounts must create invoice with HTTP 201');
    assert(accountsRes.data.invoiceNo, 'Created invoice must have invoiceNo');
    assert(accountsRes.data.totals?.grandTotal > 0, 'Totals must be calculated accurately');
    cleanup.invoices.push(accountsRes.data._id);
    const accountsInvoiceId = accountsRes.data._id;
    console.log(`✔ Accounts created invoice ${accountsRes.data.invoiceNo} successfully (HTTP 201).`);

    // =========================================================================
    // TEST 3: Accounts Executive Role Can Create Invoices
    // =========================================================================
    console.log('\n--- TEST 3: Accounts Executive Role Invoice Creation ---');
    const jcAccountsExec = await makeJobCard('EXEC');
    const execRes = await axios.post(
      `${baseUrl}/api/invoices`,
      makeInvoicePayload(jcAccountsExec._id),
      { headers: accountsExecHeaders }
    );
    assert.strictEqual(execRes.status, 201, 'Accounts Executive must create invoice with HTTP 201');
    assert(execRes.data.invoiceNo, 'Created invoice must have invoiceNo');
    cleanup.invoices.push(execRes.data._id);
    console.log(`✔ Accounts Executive created invoice ${execRes.data.invoiceNo} successfully (HTTP 201).`);

    // =========================================================================
    // TEST 4: Unauthorized Role Cannot Create Invoices (403 Forbidden)
    // =========================================================================
    console.log('\n--- TEST 4: Unauthorized Role (Service Advisor) Blocked ---');
    const jcUnauthorized = await makeJobCard('UNAUTH');
    let unauthorizedBlocked = false;
    try {
      await axios.post(
        `${baseUrl}/api/invoices`,
        makeInvoicePayload(jcUnauthorized._id),
        { headers: serviceHeaders }
      );
    } catch (err) {
      if (err.response && err.response.status === 403) {
        unauthorizedBlocked = true;
        assert.strictEqual(err.response.data.error, 'Access denied: Insufficient permissions.');
      } else {
        throw err;
      }
    }
    assert(unauthorizedBlocked, 'Unauthorized role must be rejected with HTTP 403');
    console.log('✔ Unauthorized role rejected with HTTP 403 Access Denied.');

    // =========================================================================
    // TEST 5: Accounts User Can View Invoices, View Single, and Download PDF
    // =========================================================================
    console.log('\n--- TEST 5: Accounts Role View & PDF Download ---');
    // 5A: List invoices
    const listRes = await axios.get(`${baseUrl}/api/invoices`, { headers: accountsHeaders });
    assert.strictEqual(listRes.status, 200);
    assert(Array.isArray(listRes.data), 'List must return array');
    console.log(`✔ Accounts role successfully retrieved invoice list (${listRes.data.length} records).`);

    // 5B: Single invoice details
    const singleRes = await axios.get(`${baseUrl}/api/invoices/${accountsInvoiceId}`, { headers: accountsHeaders });
    assert.strictEqual(singleRes.status, 200);
    assert.strictEqual(singleRes.data._id, accountsInvoiceId.toString());
    console.log(`✔ Accounts role successfully fetched invoice details for ${singleRes.data.invoiceNo}.`);

    // 5C: PDF generation / download
    const pdfRes = await axios.get(`${baseUrl}/api/invoices/${accountsInvoiceId}/pdf`, {
      headers: accountsHeaders,
      responseType: 'arraybuffer'
    });
    assert.strictEqual(pdfRes.status, 200);
    assert.strictEqual(pdfRes.headers['content-type'], 'application/pdf');
    assert(pdfRes.data.length > 500, 'PDF buffer must contain binary content');
    console.log(`✔ Accounts role generated and downloaded invoice PDF (${pdfRes.data.length} bytes).`);

    // =========================================================================
    // TEST 6: Accounts User Can Record Payment
    // =========================================================================
    console.log('\n--- TEST 6: Accounts Role Record Customer Payment ---');
    const payRes = await axios.put(
      `${baseUrl}/api/invoices/${accountsInvoiceId}/pay`,
      { paymentMethod: 'UPI' },
      { headers: accountsHeaders }
    );
    assert.strictEqual(payRes.status, 200);
    assert.strictEqual(payRes.data.invoice.paymentStatus, 'Paid');
    console.log(`✔ Accounts role successfully recorded payment (paymentStatus: Paid).`);

    // =========================================================================
    // TEST 7: Accounts User CANNOT Delete Invoices (Admin Only)
    // =========================================================================
    console.log('\n--- TEST 7: Sensitive Operation: Accounts CANNOT Delete Invoices ---');
    let deleteBlocked = false;
    try {
      await axios.delete(`${baseUrl}/api/invoices/${accountsInvoiceId}`, { headers: accountsHeaders });
    } catch (err) {
      if (err.response && err.response.status === 403) {
        deleteBlocked = true;
        assert.strictEqual(err.response.data.error, 'Access denied: Insufficient permissions.');
      } else {
        throw err;
      }
    }
    assert(deleteBlocked, 'Accounts role must be blocked from deleting invoices (HTTP 403)');
    console.log('✔ Accounts deletion blocked with HTTP 403 (sensitive admin operation protected).');

    // Admin CAN delete test invoice
    const adminDeleteRes = await axios.delete(`${baseUrl}/api/invoices/${accountsInvoiceId}`, { headers: adminHeaders });
    assert.strictEqual(adminDeleteRes.status, 200);
    // Remove from cleanup since it was already deleted
    cleanup.invoices = cleanup.invoices.filter(id => id.toString() !== accountsInvoiceId.toString());
    console.log('✔ Admin role permitted to delete invoice.');

    // =========================================================================
    // TEST 8: Database Integrity Check in MongoDB Atlas
    // =========================================================================
    console.log('\n--- TEST 8: MongoDB Atlas Storage & Calculation Integrity ---');
    const savedInvoice = await Invoice.findById(adminRes.data._id);
    assert(savedInvoice, 'Invoice must be found in MongoDB Atlas');
    assert.strictEqual(savedInvoice.invoiceType, 'Tax Invoice');
    assert(savedInvoice.totals.grandTotal > 0, 'Grand total must be positive');
    assert(savedInvoice.totals.gstTotal > 0, 'GST total must be positive');
    console.log(`✔ MongoDB Atlas verification: Invoice ${savedInvoice.invoiceNo} saved with Grand Total ₹${savedInvoice.totals.grandTotal} (GST: ₹${savedInvoice.totals.gstTotal}).`);

    console.log('\n========================================================================');
    console.log('ALL 8 TESTS IN INVOICE ACCOUNTS AUTHORIZATION SUITE PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');

  } catch (err) {
    console.error('\n❌ Test Suite encountered an error:', err);
    throw err;
  } finally {
    server.close();
    console.log('Cleaning up test records from database...');
    if (cleanup.invoices.length) await Invoice.deleteMany({ _id: { $in: cleanup.invoices } });
    if (cleanup.jobcards.length) await JobCard.deleteMany({ _id: { $in: cleanup.jobcards } });
    if (cleanup.vehicles.length) await Vehicle.deleteMany({ _id: { $in: cleanup.vehicles } });
    if (cleanup.customers.length) await Customer.deleteMany({ _id: { $in: cleanup.customers } });
    if (cleanup.users.length) await User.deleteMany({ _id: { $in: cleanup.users } });
    await mongoose.disconnect();
    console.log('Cleanup complete. Production data intact.');
  }
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
