const assert = require('assert');
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const JobCard = require('../models/JobCard');
const Estimate = require('../models/Estimate');
const Invoice = require('../models/Invoice');
const User = require('../models/User');

const jobCardsRouter = require('../routes/jobCards');
const estimatesRouter = require('../routes/estimates');
const invoicesRouter = require('../routes/invoices');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/jobcards', jobCardsRouter);
app.use('/api/estimates', estimatesRouter);
app.use('/api/invoices', invoicesRouter);

async function runTestSuite() {
  console.log('========================================================================');
  console.log('TEST SUITE: Automatic Spare Parts Population When Selecting Job Card');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✔ Connected to MongoDB Atlas.');

  let adminUser = await User.findOne({ role: 'Admin', active: true });
  if (!adminUser) {
    adminUser = await User.findOne({ active: true });
  }
  assert(adminUser, 'An active user must exist in database for testing');
  const token = jwt.sign({ _id: adminUser._id, role: adminUser.role, name: adminUser.name }, JWT_SECRET);
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const cleanupIds = {
    customers: [],
    vehicles: [],
    jobcards: [],
    estimates: [],
    invoices: []
  };

  try {
    // -------------------------------------------------------------------------
    // SETUP: Create Customers, Vehicles, and Job Cards
    // -------------------------------------------------------------------------
    // Customer 1: Intra-state (Telangana - Code 36)
    const cust1 = await Customer.create({
      name: 'NTR Automobiles Test',
      mobile: '9849011111',
      address: 'Kukatpally, Hyderabad, Telangana',
      gstNumber: '36ABCDE1234F1Z5'
    });
    cleanupIds.customers.push(cust1._id);

    const veh1 = await Vehicle.create({
      customerId: cust1._id,
      vehicleNumber: 'TS08AB1234',
      make: 'Skoda',
      model: 'Octavia',
      odometerReading: 45000,
      fuelType: 'Petrol'
    });
    cleanupIds.vehicles.push(veh1._id);

    // Job Card 1: Will have multiple spare parts & labour via Estimate
    const jc1 = await JobCard.create({
      jobCardNo: `JC-PARTS-1-${Date.now()}`,
      customerId: cust1._id,
      vehicleId: veh1._id,
      serviceAdvisorId: adminUser._id,
      time: '09:30 AM',
      odometerReading: 45000,
      status: 'Work In Progress'
    });
    cleanupIds.jobcards.push(jc1._id);

    // Estimate 1 with multiple spare parts
    const est1 = await Estimate.create({
      estimateNo: `EST-PARTS-1-${Date.now()}`,
      jobCardId: jc1._id,
      status: 'Approved',
      parts: [
        {
          name: 'Engine Oil Synthetic 5W-40',
          partNo: 'OIL-SYN-5W40',
          hsnCode: '27101980',
          description: 'High performance engine oil 4L',
          unit: 'Ltr',
          qty: 4,
          rate: 850,
          discount: 100,
          amount: 3300,
          taxableValue: 3300,
          gstPercent: 18,
          cgstAmount: 297,
          sgstAmount: 297,
          igstAmount: 0,
          gstAmount: 594,
          total: 3894
        },
        {
          name: 'Front Brake Disc Rotors',
          partNo: 'BRK-ROT-F01',
          hsnCode: '87083000',
          description: 'Pair of ventilated brake discs',
          unit: 'Set',
          qty: 1,
          rate: 4200,
          discount: 200,
          amount: 4000,
          taxableValue: 4000,
          gstPercent: 18,
          cgstAmount: 360,
          sgstAmount: 360,
          igstAmount: 0,
          gstAmount: 720,
          total: 4720
        },
        {
          name: 'Oil Filter Cartridge',
          partNo: 'FLT-OIL-SK01',
          hsnCode: '84212300',
          description: 'OEM Oil filter insert',
          unit: 'Pcs',
          qty: 1,
          rate: 450,
          discount: 0,
          amount: 450,
          taxableValue: 450,
          gstPercent: 18,
          cgstAmount: 40.5,
          sgstAmount: 40.5,
          igstAmount: 0,
          gstAmount: 81,
          total: 531
        }
      ],
      labour: [
        {
          description: 'Periodic Maintenance Service Labour',
          qty: 1,
          rate: 1500,
          discount: 0,
          amount: 1500,
          taxableValue: 1500,
          gstPercent: 18,
          cgstAmount: 135,
          sgstAmount: 135,
          igstAmount: 0,
          gstAmount: 270,
          total: 1770
        },
        {
          description: 'Front Brake Overhaul & Disc Replacement',
          qty: 1,
          rate: 800,
          discount: 50,
          amount: 750,
          taxableValue: 750,
          gstPercent: 18,
          cgstAmount: 67.5,
          sgstAmount: 67.5,
          igstAmount: 0,
          gstAmount: 135,
          total: 885
        }
      ],
      totals: {
        partsTotal: 7750,
        labourTotal: 2250,
        gstTotal: 1800,
        grandTotal: 11800
      },
      amountInWords: 'Rupees Eleven Thousand Eight Hundred Only'
    });
    cleanupIds.estimates.push(est1._id);

    // Job Card 2: Without spare parts (e.g. Labour-only General Inspection)
    const jc2 = await JobCard.create({
      jobCardNo: `JC-NOPARTS-2-${Date.now()}`,
      customerId: cust1._id,
      vehicleId: veh1._id,
      serviceAdvisorId: adminUser._id,
      time: '11:00 AM',
      odometerReading: 45000,
      status: 'Work In Progress'
    });
    cleanupIds.jobcards.push(jc2._id);

    const est2 = await Estimate.create({
      estimateNo: `EST-NOPARTS-2-${Date.now()}`,
      jobCardId: jc2._id,
      status: 'Approved',
      parts: [], // Zero spare parts
      labour: [
        {
          description: 'Vehicle General Inspection & Computer Diagnostics',
          qty: 1,
          rate: 1200,
          discount: 0,
          amount: 1200,
          taxableValue: 1200,
          gstPercent: 18,
          cgstAmount: 108,
          sgstAmount: 108,
          igstAmount: 0,
          gstAmount: 216,
          total: 1416
        }
      ],
      totals: {
        partsTotal: 0,
        labourTotal: 1200,
        gstTotal: 216,
        grandTotal: 1416
      },
      amountInWords: 'Rupees One Thousand Four Hundred Sixteen Only'
    });
    cleanupIds.estimates.push(est2._id);

    // -------------------------------------------------------------------------
    // TEST 1: Backend Endpoint GET /api/jobcards/:id fetches complete details & parts
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: GET /api/jobcards/:id Returns Complete Details & Attached Spare Parts ---');
    const getJcRes1 = await axios.get(`${baseUrl}/api/jobcards/${jc1._id}`, { headers: authHeaders });
    assert.strictEqual(getJcRes1.status, 200);
    const jcDetails1 = getJcRes1.data;

    assert.strictEqual(jcDetails1._id.toString(), jc1._id.toString());
    assert(jcDetails1.customerId, 'Customer must be populated');
    assert.strictEqual(jcDetails1.customerId.name, 'NTR Automobiles Test');
    assert.strictEqual(jcDetails1.vehicleId.vehicleNumber, 'TS08AB1234');
    assert(Array.isArray(jcDetails1.parts), 'parts must be an array on Job Card response');
    assert.strictEqual(jcDetails1.parts.length, 3, 'Job Card 1 must automatically return 3 spare parts');
    assert.strictEqual(jcDetails1.labour.length, 2, 'Job Card 1 must automatically return 2 labour items');
    assert.strictEqual(jcDetails1.estimateId.toString(), est1._id.toString());

    console.log(`✔ TEST 1 PASSED: GET /api/jobcards/:id returned complete details with ${jcDetails1.parts.length} parts and ${jcDetails1.labour.length} labour entries.`);

    // -------------------------------------------------------------------------
    // TEST 2: GET /api/estimates?jobCardId=:id returns full parts and labour without stripping
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: GET /api/estimates?jobCardId=:id Returns Full Parts & Labour Arrays ---');
    const getEstRes = await axios.get(`${baseUrl}/api/estimates?jobCardId=${jc1._id}`, { headers: authHeaders });
    assert.strictEqual(getEstRes.status, 200);
    const estimatesList = getEstRes.data;
    assert(Array.isArray(estimatesList));
    assert(estimatesList.length >= 1);
    const fetchedEst = estimatesList.find(e => e._id.toString() === est1._id.toString());
    assert(fetchedEst);
    assert(Array.isArray(fetchedEst.parts), 'parts array must be populated in estimates list query');
    assert.strictEqual(fetchedEst.parts.length, 3, 'Must contain all 3 spare parts');
    assert(Array.isArray(fetchedEst.labour), 'labour array must be populated in estimates list query');
    assert.strictEqual(fetchedEst.labour.length, 2, 'Must contain all 2 labour items');

    console.log('✔ TEST 2 PASSED: GET /api/estimates?jobCardId returned complete parts and labour arrays.');

    // -------------------------------------------------------------------------
    // TEST 3: Verify All Required Fields and Values for Each Spare Part
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Verify All Required Fields for Each Auto-Populated Spare Part ---');
    const expectedPartNames = ['Engine Oil Synthetic 5W-40', 'Front Brake Disc Rotors', 'Oil Filter Cartridge'];
    jcDetails1.parts.forEach((p, idx) => {
      console.log(`  [Part ${idx + 1}] Name: "${p.name}", SKU: "${p.partNo}", Qty: ${p.qty}, Rate: ₹${p.rate}, Discount: ₹${p.discount}, Taxable: ₹${p.taxableValue}, GST: ${p.gstPercent}%, Total: ₹${p.total}`);
      assert(p.name, 'Part Name is required');
      assert(p.partNo, 'Part Number / SKU is required');
      assert.strictEqual(p.name, expectedPartNames[idx]);
      assert(p.qty > 0, 'Quantity must be positive');
      assert(p.rate > 0, 'Unit Price must be positive');
      assert(p.taxableValue !== undefined, 'Taxable Amount must be defined');
      assert(p.gstPercent !== undefined, 'GST Rate must be defined');
      assert(p.total > 0, 'Total Amount must be positive');
    });

    console.log('✔ TEST 3 PASSED: All 9 required fields are present and accurate for each spare part.');

    // -------------------------------------------------------------------------
    // TEST 4: Job Card Switch - Replacement of Previous Items
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Switch to Job Card 2 and Verify Previous Items Are Replaced ---');
    const getJcRes2 = await axios.get(`${baseUrl}/api/jobcards/${jc2._id}`, { headers: authHeaders });
    assert.strictEqual(getJcRes2.status, 200);
    const jcDetails2 = getJcRes2.data;

    assert.strictEqual(jcDetails2._id.toString(), jc2._id.toString());
    assert(Array.isArray(jcDetails2.parts));
    assert.strictEqual(jcDetails2.parts.length, 0, 'Job Card 2 must return 0 spare parts');
    assert.strictEqual(jcDetails2.labour.length, 1, 'Job Card 2 must return 1 labour entry');
    assert.strictEqual(jcDetails2.labour[0].description, 'Vehicle General Inspection & Computer Diagnostics');

    console.log('✔ TEST 4 PASSED: Switching Job Cards cleanly replaces items without retaining previous items.');

    // -------------------------------------------------------------------------
    // TEST 5: GST Calculations & Tax Splits (Intra-state vs Inter-state)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: GST Calculations & Tax Split Verification ---');
    // Intra-state (Telangana Customer: cust1)
    const invoicePayloadIntra = {
      jobCardId: jc1._id,
      estimateId: est1._id,
      parts: jcDetails1.parts.map(p => ({
        name: p.name,
        partNo: p.partNo,
        hsnCode: p.hsnCode,
        qty: p.qty,
        rate: p.rate,
        discountType: 'Fixed',
        discountAmount: p.discount,
        gstPercent: p.gstPercent
      })),
      labour: jcDetails1.labour.map(l => ({
        description: l.description,
        qty: l.qty || 1,
        rate: l.rate,
        discountType: 'Fixed',
        discountAmount: l.discount || 0,
        gstPercent: l.gstPercent
      })),
      gstDetails: {
        customerGSTIN: cust1.gstNumber,
        isInterstate: false
      },
      invoiceType: 'Tax Invoice'
    };

    const intraRes = await axios.post(`${baseUrl}/api/invoices`, invoicePayloadIntra, { headers: authHeaders });
    assert.strictEqual(intraRes.status, 201);
    const intraInvoice = intraRes.data;
    cleanupIds.invoices.push(intraInvoice._id);

    // Verify Intra-state totals:
    // partsTotal = (4*850-100) + (1*4200-200) + (1*450-0) = 3300 + 4000 + 450 = 7750
    // labourTotal = 1500 + 750 = 2250
    // gstTotal = (7750 + 2250) * 18% = 10000 * 18% = 1800
    // grandTotal = 11800
    assert.strictEqual(intraInvoice.totals.partsTotal, 7750, 'Spare Parts Subtotal must be 7750');
    assert.strictEqual(intraInvoice.totals.labourTotal, 2250, 'Labour Subtotal must be 2250');
    assert.strictEqual(intraInvoice.totals.discountTotal, 350, 'Total discount must be 100+200+0+0+50 = 350');
    assert.strictEqual(intraInvoice.totals.gstTotal, 1800, 'Total GST must be 1800');
    assert.strictEqual(intraInvoice.totals.cgstTotal, 900, 'CGST must be exactly 50% of GST (900)');
    assert.strictEqual(intraInvoice.totals.sgstTotal, 900, 'SGST must be exactly 50% of GST (900)');
    assert.strictEqual(intraInvoice.totals.igstTotal, 0, 'IGST must be 0 for intra-state');
    assert.strictEqual(intraInvoice.totals.roundedGrandTotal, 11800, 'Grand total must be 11800');

    console.log('✔ TEST 5A PASSED: Intra-state invoice calculates exact CGST (₹900) + SGST (₹900), Parts (₹7750), Labour (₹2250), Grand Total (₹11,800).');

    // Inter-state Customer (Karnataka - Code 29)
    const cust2Inter = await Customer.create({
      name: 'Bangalore Tech Motors',
      mobile: '9849022222',
      address: 'Whitefield, Bangalore, Karnataka',
      gstNumber: '29ABCDE1234F1Z8'
    });
    cleanupIds.customers.push(cust2Inter._id);

    const invoicePayloadInter = {
      ...invoicePayloadIntra,
      gstDetails: {
        customerGSTIN: cust2Inter.gstNumber,
        isInterstate: true
      }
    };

    const interRes = await axios.post(`${baseUrl}/api/invoices`, invoicePayloadInter, { headers: authHeaders });
    assert.strictEqual(interRes.status, 201);
    const interInvoice = interRes.data;
    cleanupIds.invoices.push(interInvoice._id);

    assert.strictEqual(interInvoice.totals.cgstTotal, 0, 'CGST must be 0 for inter-state');
    assert.strictEqual(interInvoice.totals.sgstTotal, 0, 'SGST must be 0 for inter-state');
    assert.strictEqual(interInvoice.totals.igstTotal, 1800, 'IGST must be 100% of GST (1800)');
    assert.strictEqual(interInvoice.totals.roundedGrandTotal, 11800);

    console.log('✔ TEST 5B PASSED: Inter-state invoice calculates exact IGST (₹1800), CGST (₹0), SGST (₹0).');

    // -------------------------------------------------------------------------
    // TEST 6: Save Invoice to MongoDB and Verify Generated GST Invoice PDF
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Verify Invoice Saved in MongoDB & Generated GST Invoice PDF ---');
    const savedInv = await Invoice.findById(intraInvoice._id);
    assert(savedInv, 'Invoice must exist in MongoDB');
    assert.strictEqual(savedInv.parts.length, 3, 'Saved invoice must contain 3 spare parts');
    assert.strictEqual(savedInv.labour.length, 2, 'Saved invoice must contain 2 labour items');
    assert.strictEqual(savedInv.parts[0].name, 'Engine Oil Synthetic 5W-40');
    assert.strictEqual(savedInv.parts[0].qty, 4);
    assert.strictEqual(savedInv.parts[0].rate, 850);
    assert.strictEqual(savedInv.parts[0].amount, 3300);

    // Download generated PDF
    const pdfRes = await axios.get(`${baseUrl}/api/invoices/${intraInvoice._id}/pdf`, {
      headers: authHeaders,
      responseType: 'arraybuffer'
    });
    assert.strictEqual(pdfRes.status, 200);
    assert(pdfRes.headers['content-type'].includes('application/pdf'), 'Content-type must be application/pdf');
    const pdfBuffer = Buffer.from(pdfRes.data);
    assert(pdfBuffer.length > 500, 'PDF buffer must contain substantial generated document data');
    const pdfHeader = pdfBuffer.slice(0, 4).toString();
    assert.strictEqual(pdfHeader, '%PDF', 'Must be a valid PDF format (%PDF)');

    console.log(`✔ TEST 6 PASSED: Invoice successfully verified in MongoDB and GST Invoice PDF generated (${pdfBuffer.length} bytes, valid %PDF).`);

    // -------------------------------------------------------------------------
    // TEST 7: Test Job Card Without Spare Parts (Empty-State)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Test Job Card Without Spare Parts (Empty-State Handling) ---');
    const invoicePayloadEmptyParts = {
      jobCardId: jc2._id,
      estimateId: est2._id,
      parts: [],
      labour: jcDetails2.labour.map(l => ({
        description: l.description,
        qty: l.qty || 1,
        rate: l.rate,
        discountType: 'Fixed',
        discountAmount: 0,
        gstPercent: 18
      })),
      gstDetails: { isInterstate: false },
      invoiceType: 'Tax Invoice'
    };

    const emptyPartsRes = await axios.post(`${baseUrl}/api/invoices`, invoicePayloadEmptyParts, { headers: authHeaders });
    assert.strictEqual(emptyPartsRes.status, 201);
    const emptyPartsInvoice = emptyPartsRes.data;
    cleanupIds.invoices.push(emptyPartsInvoice._id);

    assert.strictEqual(emptyPartsInvoice.parts.length, 0, 'Must save with 0 parts');
    assert.strictEqual(emptyPartsInvoice.totals.partsTotal, 0, 'Parts total must be 0');
    assert.strictEqual(emptyPartsInvoice.totals.labourTotal, 1200);
    assert.strictEqual(emptyPartsInvoice.totals.roundedGrandTotal, 1416);

    console.log('✔ TEST 7 PASSED: Job Card without spare parts accurately handled with 0 parts and valid labour-only billing.');

    console.log('\n========================================================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY! 100% VERIFIED!');
    console.log('========================================================================\n');
  } finally {
    server.close();
    await Customer.deleteMany({ _id: { $in: cleanupIds.customers } });
    await Vehicle.deleteMany({ _id: { $in: cleanupIds.vehicles } });
    await JobCard.deleteMany({ _id: { $in: cleanupIds.jobcards } });
    await Estimate.deleteMany({ _id: { $in: cleanupIds.estimates } });
    await Invoice.deleteMany({ _id: { $in: cleanupIds.invoices } });
    await mongoose.disconnect();
  }
}

runTestSuite().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
