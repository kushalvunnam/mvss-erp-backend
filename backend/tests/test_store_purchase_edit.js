const assert = require('assert');
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Purchase = require('../models/Purchase');
const Inventory = require('../models/Inventory');
require('../models/Notification');
const purchasesRouter = require('../routes/purchases');

const JWT_SECRET = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

const app = express();
app.use(express.json());
app.use('/api/purchases', purchasesRouter);

async function runStorePurchaseEditTests() {
  console.log('========================================================================');
  console.log('TEST SUITE: Enable Purchase Entry Editing for Store User Role');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB Atlas.');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/purchases`;
  console.log(`✓ Test HTTP server listening on port ${port}\n`);

  // Track created entities for guaranteed cleanup
  const cleanupIds = {
    users: [],
    vendors: [],
    purchases: [],
    inventory: []
  };

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Setup Test Users for Different Roles
    // -------------------------------------------------------------------------
    console.log('--- Step 1: Setting up Test Roles and JWT Tokens ---');
    const timestamp = Date.now();

    // 1. Store User with 'Spares' role (active default store role in MVSS)
    const storeSparesUser = new User({
      name: `Test Store Spares ${timestamp}`,
      email: `test_store_spares_${timestamp}@mvss.test`,
      password: 'password123',
      role: 'Spares',
      active: true
    });
    await storeSparesUser.save();
    cleanupIds.users.push(storeSparesUser._id);
    const storeSparesToken = jwt.sign(
      { _id: storeSparesUser._id, role: storeSparesUser.role, name: storeSparesUser.name },
      JWT_SECRET
    );
    const storeSparesHeaders = {
      Authorization: `Bearer ${storeSparesToken}`,
      'Content-Type': 'application/json'
    };

    // 2. Store User with 'Store' role
    const storeRoleUser = new User({
      name: `Test Store User ${timestamp}`,
      email: `test_store_user_${timestamp}@mvss.test`,
      password: 'password123',
      role: 'Store',
      active: true
    });
    await storeRoleUser.save();
    cleanupIds.users.push(storeRoleUser._id);
    const storeRoleToken = jwt.sign(
      { _id: storeRoleUser._id, role: storeRoleUser.role, name: storeRoleUser.name },
      JWT_SECRET
    );
    const storeRoleHeaders = {
      Authorization: `Bearer ${storeRoleToken}`,
      'Content-Type': 'application/json'
    };

    // 3. Unauthorized User (e.g. 'Reception')
    const receptionUser = new User({
      name: `Test Reception ${timestamp}`,
      email: `test_reception_${timestamp}@mvss.test`,
      password: 'password123',
      role: 'Reception',
      active: true
    });
    await receptionUser.save();
    cleanupIds.users.push(receptionUser._id);
    const receptionToken = jwt.sign(
      { _id: receptionUser._id, role: receptionUser.role, name: receptionUser.name },
      JWT_SECRET
    );
    const receptionHeaders = {
      Authorization: `Bearer ${receptionToken}`,
      'Content-Type': 'application/json'
    };

    // 4. Admin User
    const adminUser = new User({
      name: `Test Admin ${timestamp}`,
      email: `test_admin_${timestamp}@mvss.test`,
      password: 'password123',
      role: 'Admin',
      active: true
    });
    await adminUser.save();
    cleanupIds.users.push(adminUser._id);
    const adminToken = jwt.sign(
      { _id: adminUser._id, role: adminUser.role, name: adminUser.name },
      JWT_SECRET
    );
    const adminHeaders = {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    };

    console.log('✓ Users created with roles: Spares, Store, Reception, Admin.');

    // -------------------------------------------------------------------------
    // STEP 2: Setup Test Vendor and Inventory Items
    // -------------------------------------------------------------------------
    console.log('\n--- Step 2: Creating Test Vendor and Initial Inventory ---');
    const testVendor = new Vendor({
      vendorCode: `VND-${timestamp}`,
      name: `Test Spares Supplier ${timestamp}`,
      contactPerson: 'Vendor Rep',
      mobile: '9876543210',
      phone: '9876543210',
      email: `vendor_${timestamp}@mvss.test`,
      supplierBrand: 'Bosch',
      brands: ['Bosch', 'NGK'],
      billingType: 'Intra-State',
      isActive: true
    });
    await testVendor.save();
    cleanupIds.vendors.push(testVendor._id);

    const part1Sku = `TEST-P1-${timestamp}`;
    const part1 = new Inventory({
      partNumber: part1Sku,
      partName: 'Engine Oil Filter Test',
      category: 'Spare Parts',
      brand: 'Bosch',
      supplierBrand: 'Bosch',
      stockQuantity: 10,
      currentStock: 10,
      unit: 'Pcs',
      mrp: 500,
      sellingPrice: 450,
      purchasePrice: 300,
      gstPercent: 18,
      hsnCode: '8708'
    });
    await part1.save();
    cleanupIds.inventory.push(part1._id);

    const part2Sku = `TEST-P2-${timestamp}`;
    const part2 = new Inventory({
      partNumber: part2Sku,
      partName: 'Brake Pad Set Test',
      category: 'Spare Parts',
      brand: 'Bosch',
      supplierBrand: 'Bosch',
      stockQuantity: 10,
      currentStock: 10,
      unit: 'Set',
      mrp: 1800,
      sellingPrice: 1600,
      purchasePrice: 1200,
      gstPercent: 18,
      hsnCode: '8708'
    });
    await part2.save();
    cleanupIds.inventory.push(part2._id);

    console.log(`✓ Vendor created: ${testVendor.name}`);
    console.log(`✓ Part 1 created: ${part1.partName} (${part1.partNumber}), initial stock = 10`);
    console.log(`✓ Part 2 created: ${part2.partName} (${part2.partNumber}), initial stock = 10`);

    // -------------------------------------------------------------------------
    // STEP 3: Create Initial Purchase with only 1 Part (Accidentally saved)
    // -------------------------------------------------------------------------
    console.log('\n--- Step 3: Creating Initial Purchase with only 1 Part ---');
    const initialPurchasePayload = {
      vendorId: testVendor._id.toString(),
      invoiceNo: `INV-TEST-${timestamp}`,
      invoiceDate: new Date().toISOString().split('T')[0],
      items: [
        {
          partId: part1._id.toString(),
          partName: part1.partName,
          partNumber: part1.partNumber,
          hsnCode: '8708',
          qty: 2,
          purchasePrice: 300,
          mrp: 500,
          sellingPrice: 450,
          discountPercent: 0,
          discountAmount: 0,
          taxableAmount: 600,
          gstPercent: 18,
          cgst: 54,
          sgst: 54,
          igst: 0,
          gstAmount: 108,
          total: 708,
          supplierBrand: 'Bosch'
        }
      ],
      paymentStatus: 'Credit',
      amountPaid: 0,
      notes: 'Initial test entry with 1 part'
    };

    const createRes = await axios.post(baseUrl, initialPurchasePayload, { headers: storeSparesHeaders });
    assert.strictEqual(createRes.status, 201, 'Purchase creation should return 201');
    const createdPurchase = createRes.data;
    cleanupIds.purchases.push(createdPurchase._id);

    console.log(`✓ Initial purchase created: ID ${createdPurchase._id}, Purchase No: ${createdPurchase.purchaseNo}`);
    assert.strictEqual(createdPurchase.items.length, 1, 'Initial purchase should have exactly 1 item');
    assert.strictEqual(createdPurchase.items[0].qty, 2, 'Initial item qty should be 2');

    // Verify stock incremented by 2
    const part1AfterCreate = await Inventory.findById(part1._id);
    assert.strictEqual(part1AfterCreate.currentStock, 12, 'Part 1 stock should have increased from 10 to 12');
    console.log(`✓ Verified Part 1 stock incremented to ${part1AfterCreate.currentStock}`);

    // -------------------------------------------------------------------------
    // STEP 4: Store User (Role: Spares) Edits Purchase Entry
    // -------------------------------------------------------------------------
    console.log('\n--- Step 4: Store User Edits Purchase (Modifies Part 1 qty to 5, Adds Part 2 qty 4) ---');
    const editPayload = {
      vendorId: testVendor._id.toString(),
      invoiceNo: `INV-TEST-${timestamp}`,
      invoiceDate: new Date().toISOString().split('T')[0],
      reason: 'Forgot to add brake pads and corrected oil filter count',
      items: [
        {
          partId: part1._id.toString(),
          partName: part1.partName,
          partNumber: part1.partNumber,
          hsnCode: '8708',
          qty: 5, // Modified from 2 to 5 (net +3)
          purchasePrice: 300,
          mrp: 500,
          sellingPrice: 450,
          discountPercent: 0,
          discountAmount: 0,
          taxableAmount: 1500,
          gstPercent: 18,
          cgst: 135,
          sgst: 135,
          igst: 0,
          gstAmount: 270,
          total: 1770,
          supplierBrand: 'Bosch'
        },
        {
          partId: part2._id.toString(),
          partName: part2.partName,
          partNumber: part2.partNumber,
          hsnCode: '8708',
          qty: 4, // Added missing part (net +4)
          purchasePrice: 1200,
          mrp: 1800,
          sellingPrice: 1600,
          discountPercent: 0,
          discountAmount: 0,
          taxableAmount: 4800,
          gstPercent: 18,
          cgst: 432,
          sgst: 432,
          igst: 0,
          gstAmount: 864,
          total: 5664,
          supplierBrand: 'Bosch'
        }
      ],
      paymentStatus: 'Credit',
      amountPaid: 0,
      notes: 'Updated purchase with all parts'
    };

    const editRes = await axios.put(`${baseUrl}/${createdPurchase._id}`, editPayload, { headers: storeSparesHeaders });
    assert.strictEqual(editRes.status, 200, 'Purchase update should return 200 for Store User');
    const updatedPurchase = editRes.data;

    // Verify same purchase ID preserved (no duplicate created)
    assert.strictEqual(updatedPurchase._id.toString(), createdPurchase._id.toString(), 'Original purchase ID must be preserved');
    console.log('✓ Original Purchase ID preserved (no duplicate records).');

    // Verify item counts and quantities
    assert.strictEqual(updatedPurchase.items.length, 2, 'Updated purchase must contain 2 items');
    assert.strictEqual(updatedPurchase.items[0].qty, 5, 'Part 1 qty should now be 5');
    assert.strictEqual(updatedPurchase.items[1].qty, 4, 'Part 2 qty should now be 4');
    console.log('✓ Purchase line items updated: Part 1 qty = 5, Part 2 qty = 4');

    // Verify totals
    // Taxable: 1500 + 4800 = 6300
    // CGST: 135 + 432 = 567, SGST: 135 + 432 = 567
    // Grand Total: 1770 + 5664 = 7434
    assert.strictEqual(updatedPurchase.totals.taxableAmount, 6300, 'Taxable total must be 6300');
    assert.strictEqual(updatedPurchase.totals.grandTotal, 7434, 'Grand total must be 7434');
    console.log(`✓ Recalculated totals verified: Taxable = ₹${updatedPurchase.totals.taxableAmount}, Grand Total = ₹${updatedPurchase.totals.grandTotal}`);

    // Verify updatedBy field
    const dbPurchase = await Purchase.findById(createdPurchase._id);
    assert.strictEqual(dbPurchase.updatedBy, storeSparesUser.name, 'updatedBy must record the store user');
    console.log(`✓ updatedBy recorded correctly as "${dbPurchase.updatedBy}"`);

    // -------------------------------------------------------------------------
    // STEP 5: Verify Inventory Stock Calculations (Delta Changes)
    // -------------------------------------------------------------------------
    console.log('\n--- Step 5: Verifying Inventory Delta Adjustments ---');
    const part1AfterEdit = await Inventory.findById(part1._id);
    const part2AfterEdit = await Inventory.findById(part2._id);

    // Initial stock was 10. Purchase had 2 (+2 => 12).
    // On edit, old 2 reverted (-2 => 10), then new 5 added (+5 => 15).
    // Final stock MUST be 15, NOT 17 (which would happen if old stock wasn't reverted).
    assert.strictEqual(
      part1AfterEdit.currentStock,
      15,
      `Part 1 stock must be exactly 15 (initial 10 + net 5), but was ${part1AfterEdit.currentStock}`
    );
    console.log(`✓ Part 1 stock correctly adjusted to ${part1AfterEdit.currentStock} (Initial 10 + Delta 5).`);

    // Initial stock was 10. Part 2 was newly added with qty 4.
    // Final stock MUST be 14.
    assert.strictEqual(
      part2AfterEdit.currentStock,
      14,
      `Part 2 stock must be exactly 14 (initial 10 + 4), but was ${part2AfterEdit.currentStock}`
    );
    console.log(`✓ Part 2 stock correctly adjusted to ${part2AfterEdit.currentStock} (Initial 10 + Delta 4).`);

    // -------------------------------------------------------------------------
    // STEP 6: Store User with 'Store' Role Also Permitted to Edit
    // -------------------------------------------------------------------------
    console.log('\n--- Step 6: Testing Edit with "Store" Role ---');
    const editPayload2 = {
      ...editPayload,
      reason: 'Reduced Part 1 quantity to 4',
      items: [
        {
          ...editPayload.items[0],
          qty: 4, // 5 -> 4 (-1 net)
          taxableAmount: 1200,
          cgst: 108,
          sgst: 108,
          gstAmount: 216,
          total: 1416
        },
        editPayload.items[1] // qty 4 unchanged
      ]
    };
    const editRes2 = await axios.put(`${baseUrl}/${createdPurchase._id}`, editPayload2, { headers: storeRoleHeaders });
    assert.strictEqual(editRes2.status, 200, 'User with Store role should be authorized to edit');
    const part1AfterEdit2 = await Inventory.findById(part1._id);
    assert.strictEqual(part1AfterEdit2.currentStock, 14, 'Part 1 stock should decrement from 15 to 14');
    console.log(`✓ "Store" role edit succeeded. Part 1 stock reduced to ${part1AfterEdit2.currentStock}`);

    // -------------------------------------------------------------------------
    // STEP 7: Security Boundary — Unauthorized Role Blocked from Editing
    // -------------------------------------------------------------------------
    console.log('\n--- Step 7: Testing Security Boundary (Unauthorized Role Blocked from Edit) ---');
    try {
      await axios.put(`${baseUrl}/${createdPurchase._id}`, editPayload, { headers: receptionHeaders });
      assert.fail('Reception role must NOT be allowed to edit purchases');
    } catch (err) {
      assert.strictEqual(err.response?.status, 403, 'Unauthorized role must receive 403 Forbidden');
      console.log('✓ Unauthorized role (Reception) correctly received HTTP 403 Forbidden on edit.');
    }

    // -------------------------------------------------------------------------
    // STEP 8: Security Boundary — Payment Updates Restricted from Store Users
    // -------------------------------------------------------------------------
    console.log('\n--- Step 8: Testing Security Boundary (Payment Update Restricted) ---');
    try {
      await axios.put(
        `${baseUrl}/${createdPurchase._id}/payment`,
        { paymentStatus: 'Paid', amountPaid: 7080 },
        { headers: storeSparesHeaders }
      );
      assert.fail('Store role must NOT be allowed to update payment status');
    } catch (err) {
      assert.strictEqual(err.response?.status, 403, 'Store role updating payment must receive 403 Forbidden');
      console.log('✓ Store role correctly blocked from payment updates with HTTP 403 Forbidden.');
    }

    // Verify Admin CAN update payment status
    const adminPaymentRes = await axios.put(
      `${baseUrl}/${createdPurchase._id}/payment`,
      { paymentStatus: 'Paid', amountPaid: 7080 },
      { headers: adminHeaders }
    );
    assert.strictEqual(adminPaymentRes.status, 200, 'Admin should be permitted to update payment status');
    console.log('✓ Admin successfully updated payment status to "Paid".');

    console.log('\n========================================================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY! ✓✓✓');
    console.log('========================================================================\n');

  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    console.log('--- Cleaning Up Test Data ---');
    if (cleanupIds.purchases.length > 0) {
      await Purchase.deleteMany({ _id: { $in: cleanupIds.purchases } });
      console.log(`✓ Cleaned up ${cleanupIds.purchases.length} test purchases.`);
    }
    if (cleanupIds.inventory.length > 0) {
      await Inventory.deleteMany({ _id: { $in: cleanupIds.inventory } });
      console.log(`✓ Cleaned up ${cleanupIds.inventory.length} test inventory items.`);
    }
    if (cleanupIds.vendors.length > 0) {
      await Vendor.deleteMany({ _id: { $in: cleanupIds.vendors } });
      console.log(`✓ Cleaned up ${cleanupIds.vendors.length} test vendors.`);
    }
    if (cleanupIds.users.length > 0) {
      await User.deleteMany({ _id: { $in: cleanupIds.users } });
      console.log(`✓ Cleaned up ${cleanupIds.users.length} test users.`);
    }

    server.close();
    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB and closed server.');
  }
}

runStorePurchaseEditTests().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err.message);
  if (err.response) {
    console.error('Response Data:', err.response.data);
    console.error('Response Status:', err.response.status);
  }
  process.exit(1);
});
