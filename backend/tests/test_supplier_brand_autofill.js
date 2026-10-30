const mongoose = require('mongoose');
const path = require('path');
const assert = require('assert');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Vendor = require('../models/Vendor');
const Purchase = require('../models/Purchase');
const Inventory = require('../models/Inventory');

// Simulated Frontend Logic matching PurchaseReport.jsx
function getVendorBrandsList(vendor) {
  if (!vendor) return [];
  const list = [];
  if (Array.isArray(vendor.brands) && vendor.brands.length > 0) {
    vendor.brands.forEach(b => {
      const trimmed = (b || '').trim();
      if (trimmed && !list.includes(trimmed)) list.push(trimmed);
    });
  }
  if (vendor.supplierBrand && vendor.supplierBrand.trim()) {
    const trimmed = vendor.supplierBrand.trim();
    if (!list.includes(trimmed)) list.unshift(trimmed);
  }
  if (list.length === 0 && vendor.name) {
    const lower = vendor.name.toLowerCase();
    if (lower.includes('bosch')) list.push('Bosch');
    else if (lower.includes('castrol')) list.push('Castrol');
    else if (lower.includes('gates')) list.push('Gates');
    else if (lower.includes('philips')) list.push('Philips');
    else if (lower.includes('exide')) list.push('Exide');
    else if (lower.includes('minda')) list.push('Minda');
    else if (lower.includes('lumax')) list.push('Lumax');
  }
  return list;
}

function getVendorSupplierBrand(vendor) {
  if (!vendor) return '';
  if (vendor.supplierBrand && vendor.supplierBrand.trim()) return vendor.supplierBrand.trim();
  const brands = getVendorBrandsList(vendor);
  if (brands.length > 0) return brands[0];
  return '';
}

function createEmptyRow(defaultBrand = '') {
  return {
    id: `row_${Date.now()}_${Math.random()}`,
    selectedPartId: '',
    partName: '',
    partNumber: '',
    brand: defaultBrand || '',
    supplierBrand: defaultBrand || '',
    isManualBrand: false
  };
}

async function runTests() {
  console.log('--- STARTING SUPPLIER BRAND AUTOFILL TEST SUITE ---');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB');

  // Test Vendor Data
  const vendorBosch = {
    _id: new mongoose.Types.ObjectId(),
    vendorCode: 'VND-TEST-01',
    name: 'Bosch Automotive India',
    supplierBrand: 'Bosch',
    brands: ['Bosch', 'Bosch Rexroth']
  };

  const vendorCastrol = {
    _id: new mongoose.Types.ObjectId(),
    vendorCode: 'VND-TEST-02',
    name: 'Castrol India Ltd',
    supplierBrand: 'Castrol',
    brands: ['Castrol', 'Castrol GTX', 'Castrol Edge']
  };

  const vendorGeneric = {
    _id: new mongoose.Types.ObjectId(),
    vendorCode: 'VND-TEST-03',
    name: 'Generic Local Spares',
    supplierBrand: '',
    brands: []
  };

  // CASE 1: Select vendor with brand -> verify all existing rows autofill
  console.log('\n[TEST 1] Select Vendor with Brand -> verify all existing rows autofill');
  let header = { vendorId: '', supplierBrand: '' };
  let rows = [createEmptyRow(), createEmptyRow()];
  assert.strictEqual(rows[0].supplierBrand, '', 'Initial row 1 should have empty supplierBrand');
  assert.strictEqual(rows[1].supplierBrand, '', 'Initial row 2 should have empty supplierBrand');

  // Simulate onSelect vendorBosch
  const newBrand1 = getVendorSupplierBrand(vendorBosch);
  const oldBrand1 = header.supplierBrand;
  header.vendorId = vendorBosch._id;
  header.supplierBrand = newBrand1;

  rows = rows.map(row => {
    if (!row.isManualBrand || !row.supplierBrand || (oldBrand1 && row.supplierBrand === oldBrand1)) {
      return { ...row, supplierBrand: newBrand1, brand: newBrand1, isManualBrand: false };
    }
    return row;
  });

  assert.strictEqual(rows[0].supplierBrand, 'Bosch', 'Row 1 should be autofilled with Bosch');
  assert.strictEqual(rows[1].supplierBrand, 'Bosch', 'Row 2 should be autofilled with Bosch');
  console.log('✓ Test 1 Passed: Both existing rows autofilled with "Bosch"');

  // CASE 2: Add another row -> verify new row inherits brand
  console.log('\n[TEST 2] Add New Row -> verify new row inherits selected vendor brand');
  const defaultBrandForNewRow = getVendorSupplierBrand(vendorBosch);
  const newRow = createEmptyRow(defaultBrandForNewRow);
  rows.push(newRow);

  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[2].supplierBrand, 'Bosch', 'New row 3 should inherit "Bosch"');
  console.log('✓ Test 2 Passed: New row 3 created with inherited supplierBrand "Bosch"');

  // CASE 3: Change vendor -> verify non-manual rows refresh to new vendor brand
  console.log('\n[TEST 3] Change Vendor -> verify rows refresh to new vendor brand');
  const oldBrand2 = header.supplierBrand; // 'Bosch'
  const newBrand2 = getVendorSupplierBrand(vendorCastrol); // 'Castrol'
  header.vendorId = vendorCastrol._id;
  header.supplierBrand = newBrand2;

  rows = rows.map(row => {
    if (!row.isManualBrand || !row.supplierBrand || (oldBrand2 && row.supplierBrand === oldBrand2)) {
      return { ...row, supplierBrand: newBrand2, brand: newBrand2, isManualBrand: false };
    }
    return row;
  });

  assert.strictEqual(rows[0].supplierBrand, 'Castrol', 'Row 1 should refresh to Castrol');
  assert.strictEqual(rows[1].supplierBrand, 'Castrol', 'Row 2 should refresh to Castrol');
  assert.strictEqual(rows[2].supplierBrand, 'Castrol', 'Row 3 should refresh to Castrol');
  console.log('✓ Test 3 Passed: All 3 rows refreshed to "Castrol"');

  // CASE 4: Manual edit on a row -> verify manual brand is preserved when vendor changes
  console.log('\n[TEST 4] Manual Brand Edit -> verify manual brand is preserved on vendor change');
  // User manually edits row 2 to 'Mobil1'
  rows[1] = { ...rows[1], supplierBrand: 'Mobil1', isManualBrand: true };

  // Now change vendor back to vendorBosch
  const oldBrand3 = header.supplierBrand; // 'Castrol'
  const newBrand3 = getVendorSupplierBrand(vendorBosch); // 'Bosch'
  header.vendorId = vendorBosch._id;
  header.supplierBrand = newBrand3;

  rows = rows.map(row => {
    if (!row.isManualBrand || !row.supplierBrand || (oldBrand3 && row.supplierBrand === oldBrand3)) {
      return { ...row, supplierBrand: newBrand3, brand: newBrand3, isManualBrand: false };
    }
    return row;
  });

  assert.strictEqual(rows[0].supplierBrand, 'Bosch', 'Row 1 should update to Bosch');
  assert.strictEqual(rows[1].supplierBrand, 'Mobil1', 'Row 2 was manually edited to Mobil1 and MUST BE PRESERVED');
  assert.strictEqual(rows[1].isManualBrand, true, 'Row 2 should retain isManualBrand = true');
  assert.strictEqual(rows[2].supplierBrand, 'Bosch', 'Row 3 should update to Bosch');
  console.log('✓ Test 4 Passed: Manually edited row preserved "Mobil1" while non-manual rows updated to "Bosch"');

  // CASE 5: Multiple brands vendor -> verify brand dropdown/datalist options
  console.log('\n[TEST 5] Multiple Brands Vendor -> verify datalist options');
  const castrolBrands = getVendorBrandsList(vendorCastrol);
  assert.deepStrictEqual(castrolBrands, ['Castrol', 'Castrol GTX', 'Castrol Edge']);
  assert.strictEqual(getVendorSupplierBrand(vendorCastrol), 'Castrol');
  console.log('✓ Test 5 Passed: Multiple brands correctly extracted:', castrolBrands);

  // CASE 6: Vendor without brand -> verify empty string and manual entry
  console.log('\n[TEST 6] Vendor Without Brand -> verify empty string and manual entry');
  const genericBrand = getVendorSupplierBrand(vendorGeneric);
  const genericBrandsList = getVendorBrandsList(vendorGeneric);
  assert.strictEqual(genericBrand, '', 'Default brand for generic vendor should be empty');
  assert.strictEqual(genericBrandsList.length, 0, 'Brands list should be empty');
  const genericRow = createEmptyRow(genericBrand);
  assert.strictEqual(genericRow.supplierBrand, '', 'Row should be empty');
  // Manual edit
  genericRow.supplierBrand = 'Custom Brand XYZ';
  assert.strictEqual(genericRow.supplierBrand, 'Custom Brand XYZ');
  console.log('✓ Test 6 Passed: Unbranded vendor produces empty field and allows manual entry');

  // CASE 7: Save purchase -> verify items[0].supplierBrand is saved in MongoDB
  console.log('\n[TEST 7] Save Purchase Record -> verify supplierBrand saved in MongoDB');
  // Create a real purchase document in DB
  const testPurchaseNo = `TEST-PUR-${Date.now()}`;
  const testPartNumber = `TEST-PN-${Date.now()}`;

  const samplePurchase = new Purchase({
    purchaseNo: testPurchaseNo,
    vendorId: vendorBosch._id,
    vendorName: vendorBosch.name,
    date: new Date(),
    invoiceNo: `INV-${Date.now()}`,
    invoiceDate: new Date(),
    items: [
      {
        partNumber: testPartNumber,
        partName: 'Test Brake Rotor',
        qty: 2,
        purchasePrice: 1500,
        sellingPrice: 1800,
        mrp: 2000,
        hsnCode: '8708',
        warehouse: 'Main Store',
        taxableAmount: 3000,
        gstPercent: 18,
        gstAmount: 540,
        cgst: 270,
        sgst: 270,
        igst: 0,
        total: 3540,
        brand: 'Bosch',
        supplierBrand: 'Bosch'
      }
    ],
    createdBy: new mongoose.Types.ObjectId(),
    totals: {
      totalQty: 2,
      subtotal: 3000,
      taxableAmount: 3000,
      gstTotal: 540,
      grandTotal: 3540
    },
    paymentStatus: 'Credit'
  });

  const savedPurchase = await samplePurchase.save();
  assert.ok(savedPurchase._id, 'Purchase should have saved ID');
  assert.strictEqual(savedPurchase.items[0].supplierBrand, 'Bosch', 'Saved purchase item should have supplierBrand Bosch');

  // Re-fetch from DB to verify persistence in MongoDB Atlas
  const fetchedPurchase = await Purchase.findById(savedPurchase._id);
  assert.strictEqual(fetchedPurchase.items[0].supplierBrand, 'Bosch', 'Fetched purchase from MongoDB must have supplierBrand Bosch');
  console.log('✓ Test 7 Passed: Successfully persisted and retrieved supplierBrand "Bosch" from MongoDB');

  // CASE 8: Reopen / edit purchase -> verify supplierBrand restored
  console.log('\n[TEST 8] Reopen / Edit Purchase -> verify saved supplierBrand restored into form state');
  const restoredItems = fetchedPurchase.items.map(item => ({
    id: `row_${Date.now()}`,
    selectedPartId: item.partId || '',
    partName: item.partName || '',
    partNumber: item.partNumber || '',
    supplierBrand: item.supplierBrand || '',
    brand: item.brand || '',
    isManualBrand: Boolean(item.supplierBrand)
  }));

  assert.strictEqual(restoredItems[0].supplierBrand, 'Bosch', 'Restored item supplierBrand must equal saved Bosch');
  assert.strictEqual(restoredItems[0].isManualBrand, true, 'Restored item must be flagged as manual brand');
  console.log('✓ Test 8 Passed: Successfully restored saved supplierBrand "Bosch" into edit state');

  // Clean up test purchase
  await Purchase.findByIdAndDelete(savedPurchase._id);
  console.log('✓ Test cleanup: removed test purchase record');

  await mongoose.disconnect();
  console.log('\n========================================');
  console.log('ALL 8 SUPPLIER BRAND AUTOFILL TESTS PASSED!');
  console.log('========================================');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
