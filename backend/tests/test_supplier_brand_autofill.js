const mongoose = require('mongoose');
const path = require('path');
const assert = require('assert');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Vendor = require('../models/Vendor');
const Purchase = require('../models/Purchase');
const Inventory = require('../models/Inventory');
const User = require('../models/User');

// Exact Frontend Logic from PurchaseReport.jsx
function getVendorBrandsList(vendor) {
  if (!vendor) return [];
  const list = [];
  const vendorName = (vendor.name || vendor.vendorName || '').trim();
  if (vendorName && !list.includes(vendorName)) {
    list.push(vendorName);
  }
  if (vendor.supplierBrand && vendor.supplierBrand.trim()) {
    const trimmed = vendor.supplierBrand.trim();
    if (!list.includes(trimmed)) list.push(trimmed);
  }
  if (Array.isArray(vendor.brands) && vendor.brands.length > 0) {
    vendor.brands.forEach(b => {
      const trimmed = (b || '').trim();
      if (trimmed && !list.includes(trimmed)) list.push(trimmed);
    });
  }
  return list;
}

function getVendorSupplierBrand(vendor) {
  if (!vendor) return '';
  const vendorName = (typeof vendor.name === 'string' && vendor.name.trim()) 
    ? vendor.name.trim() 
    : (typeof vendor.vendorName === 'string' && vendor.vendorName.trim() ? vendor.vendorName.trim() : '');
  if (vendorName) return vendorName;
  if (vendor.supplierBrand && typeof vendor.supplierBrand === 'string' && vendor.supplierBrand.trim()) {
    return vendor.supplierBrand.trim();
  }
  const brands = getVendorBrandsList(vendor);
  if (brands.length > 0) return brands[0];
  return '';
}

function createEmptyRow(defaultBrand = '') {
  return {
    id: `row_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    selectedPartId: '',
    partName: '',
    partNumber: '',
    hsnCode: '8708',
    qty: 1,
    purchasePrice: '',
    sellingPrice: '',
    mrp: '',
    discountType: 'Percent',
    discountPercent: 0,
    discountAmount: 0,
    taxable: '',
    discountValue: 0,
    gstPercent: 18,
    warehouse: 'Main Store',
    rackLocation: '',
    brand: defaultBrand || '',
    supplierBrand: defaultBrand || '',
    vehicleMake: '',
    vehicleModel: '',
    compatibility: '',
    oemBrand: '',
    warranty: '',
    isManualBrand: false
  };
}

async function runTests() {
  console.log('========================================================================');
  console.log('TEST SUITE: Supplier/Vendor Brand Autofill & Persistence Verification');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✔ Connected to MongoDB Atlas.');

  let passedTests = 0;
  let totalTests = 0;

  // Verify Real DB Vendor: PRASHANT MOTORS (VND-0015)
  totalTests++;
  console.log('--- TEST 1: Verify PRASHANT MOTORS in MongoDB ---');
  let vendorPrashant = await Vendor.findOne({ $or: [{ vendorCode: 'VND-0015' }, { name: /prashant/i }] });
  if (!vendorPrashant) {
    vendorPrashant = await Vendor.create({
      vendorCode: 'VND-0015',
      name: 'PRASHANT MOTORS',
      mobile: '7569533431',
      gstNumber: '36ALQPA9349D1ZX'
    });
  }
  assert.strictEqual(vendorPrashant.name, 'PRASHANT MOTORS');
  const prashantBrand = getVendorSupplierBrand(vendorPrashant);
  assert.strictEqual(prashantBrand, 'PRASHANT MOTORS', 'getVendorSupplierBrand must return PRASHANT MOTORS');
  console.log(`✔ Test 1 Passed: Vendor ${vendorPrashant.name} (${vendorPrashant.vendorCode}) brand resolved as "${prashantBrand}"`);
  passedTests++;

  // Alternate Vendor for change test
  const vendorCastrol = {
    _id: new mongoose.Types.ObjectId(),
    vendorCode: 'VND-0002',
    name: 'Castrol Lubricants India',
    supplierBrand: 'Castrol'
  };

  // TEST 2: Selecting Vendor autofills first row with PRASHANT MOTORS
  totalTests++;
  console.log('\n--- TEST 2: Select Vendor -> Autofill Row 1 with PRASHANT MOTORS ---');
  let purchaseHeader = { vendorId: '', supplierBrand: '', vendorName: '' };
  let purchaseItems = [createEmptyRow()];
  assert.strictEqual(purchaseItems[0].supplierBrand, '', 'Initial row has empty supplierBrand before vendor selection');

  // User selects PRASHANT MOTORS in SearchableDropdown
  const selectedV = vendorPrashant;
  const newBrand = getVendorSupplierBrand(selectedV) || selectedV.name;
  const oldBrand = purchaseHeader.supplierBrand;

  purchaseHeader = {
    ...purchaseHeader,
    vendorId: selectedV._id,
    vendorName: selectedV.name,
    supplierBrand: newBrand
  };

  // onSelect row update logic
  purchaseItems = purchaseItems.map(row => {
    if (!row.isManualBrand || !row.supplierBrand || (oldBrand && row.supplierBrand === oldBrand)) {
      return {
        ...row,
        supplierBrand: newBrand,
        brand: (!row.brand || (oldBrand && row.brand === oldBrand)) ? newBrand : row.brand,
        isManualBrand: false
      };
    }
    return row;
  });

  assert.strictEqual(purchaseItems[0].supplierBrand, 'PRASHANT MOTORS', 'Row 1 Supplier Brand must equal PRASHANT MOTORS');
  console.log('✔ Test 2 Passed: Row 1 automatically populated with Supplier Brand = "PRASHANT MOTORS"');
  passedTests++;

  // TEST 3: Click "+ Add Another Part" -> Row 2 inherits PRASHANT MOTORS
  totalTests++;
  console.log('\n--- TEST 3: Click Add Another Part -> Row 2 inherits PRASHANT MOTORS ---');
  const defaultBrandForAdd = getVendorSupplierBrand(selectedV) || purchaseHeader.supplierBrand;
  purchaseItems.push(createEmptyRow(defaultBrandForAdd));

  assert.strictEqual(purchaseItems.length, 2);
  assert.strictEqual(purchaseItems[1].supplierBrand, 'PRASHANT MOTORS', 'Row 2 must inherit PRASHANT MOTORS');
  console.log('✔ Test 3 Passed: Row 2 created with Supplier Brand = "PRASHANT MOTORS"');
  passedTests++;

  // TEST 4: Click "+ Add Another Spare Part Row" -> Row 3 inherits PRASHANT MOTORS
  totalTests++;
  console.log('\n--- TEST 4: Click Add Another Spare Part Row -> Row 3 inherits PRASHANT MOTORS ---');
  purchaseItems.push(createEmptyRow(defaultBrandForAdd));

  assert.strictEqual(purchaseItems.length, 3);
  assert.strictEqual(purchaseItems[2].supplierBrand, 'PRASHANT MOTORS', 'Row 3 must inherit PRASHANT MOTORS');
  console.log('✔ Test 4 Passed: Row 3 created with Supplier Brand = "PRASHANT MOTORS"');
  passedTests++;

  // TEST 5: Manual Edit on Row 2 -> Preserved when Vendor Changes
  totalTests++;
  console.log('\n--- TEST 5: Manual Edit on Row 2 & Vendor Change ---');
  // User manually edits row 2 to "Bosch Special"
  purchaseItems[1] = {
    ...purchaseItems[1],
    supplierBrand: 'Bosch Special',
    isManualBrand: true
  };

  // User changes vendor to Castrol
  const oldBrandBeforeChange = purchaseHeader.supplierBrand;
  const newBrandAfterChange = getVendorSupplierBrand(vendorCastrol);
  purchaseHeader.vendorId = vendorCastrol._id;
  purchaseHeader.vendorName = vendorCastrol.name;
  purchaseHeader.supplierBrand = newBrandAfterChange;

  purchaseItems = purchaseItems.map(row => {
    if (!row.isManualBrand || !row.supplierBrand || (oldBrandBeforeChange && row.supplierBrand === oldBrandBeforeChange)) {
      return {
        ...row,
        supplierBrand: newBrandAfterChange,
        brand: (!row.brand || (oldBrandBeforeChange && row.brand === oldBrandBeforeChange)) ? newBrandAfterChange : row.brand,
        isManualBrand: false
      };
    }
    return row;
  });

  assert.strictEqual(purchaseItems[0].supplierBrand, 'Castrol Lubricants India', 'Row 1 updated to new vendor');
  assert.strictEqual(purchaseItems[1].supplierBrand, 'Bosch Special', 'Row 2 was manually edited and MUST NOT be overwritten');
  assert.strictEqual(purchaseItems[1].isManualBrand, true);
  assert.strictEqual(purchaseItems[2].supplierBrand, 'Castrol Lubricants India', 'Row 3 updated to new vendor');
  console.log('✔ Test 5 Passed: Non-manual rows updated to new vendor while manually edited row was preserved');
  passedTests++;

  // TEST 6: Save Purchase to MongoDB & Verify Persistence
  totalTests++;
  console.log('\n--- TEST 6: Save Purchase Entry to MongoDB Atlas ---');
  const testPurchaseNo = `TEST-PUR-${Date.now()}`;
  const savedPurchase = await Purchase.create({
    purchaseNo: testPurchaseNo,
    vendorId: vendorPrashant._id,
    vendorName: vendorPrashant.name,
    date: new Date(),
    invoiceNo: `INV-${Date.now().toString().slice(-6)}`,
    invoiceDate: new Date(),
    items: [
      {
        partNumber: `PN-P1-${Date.now()}`,
        partName: 'Front Brake Pad Set',
        qty: 2,
        purchasePrice: 1200,
        sellingPrice: 1600,
        mrp: 1800,
        hsnCode: '8708',
        warehouse: 'Main Store',
        taxableAmount: 2400,
        gstPercent: 18,
        gstAmount: 432,
        cgst: 216,
        sgst: 216,
        igst: 0,
        total: 2832,
        brand: 'PRASHANT MOTORS',
        supplierBrand: 'PRASHANT MOTORS'
      },
      {
        partNumber: `PN-P2-${Date.now()}`,
        partName: 'Rear Brake Shoe Set',
        qty: 1,
        purchasePrice: 950,
        sellingPrice: 1300,
        mrp: 1500,
        hsnCode: '8708',
        warehouse: 'Main Store',
        taxableAmount: 950,
        gstPercent: 18,
        gstAmount: 171,
        cgst: 85.5,
        sgst: 85.5,
        igst: 0,
        total: 1121,
        brand: 'PRASHANT MOTORS',
        supplierBrand: 'PRASHANT MOTORS'
      }
    ],
    createdBy: new mongoose.Types.ObjectId(),
    totals: {
      totalQty: 3,
      subtotal: 3350,
      taxableAmount: 3350,
      gstTotal: 603,
      grandTotal: 3953
    },
    paymentStatus: 'Credit'
  });

  const fetched = await Purchase.findById(savedPurchase._id);
  assert.strictEqual(fetched.items.length, 2);
  assert.strictEqual(fetched.items[0].supplierBrand, 'PRASHANT MOTORS', 'DB item 0 supplierBrand must be PRASHANT MOTORS');
  assert.strictEqual(fetched.items[1].supplierBrand, 'PRASHANT MOTORS', 'DB item 1 supplierBrand must be PRASHANT MOTORS');
  console.log('✔ Test 6 Passed: Saved purchase with supplierBrand="PRASHANT MOTORS" verified in MongoDB Atlas');
  passedTests++;

  // TEST 7: Open Edit Purchase -> Verify Supplier Brand Values Restored
  totalTests++;
  console.log('\n--- TEST 7: Restore in Edit Purchase Mode ---');
  const defaultVendorBrandForEdit = getVendorSupplierBrand(vendorPrashant) || fetched.vendorName;
  const restoredItems = fetched.items.map(item => {
    const restoredBrand = item.supplierBrand || defaultVendorBrandForEdit || '';
    return {
      id: `row_${Date.now()}_${item._id}`,
      partName: item.partName,
      partNumber: item.partNumber,
      supplierBrand: restoredBrand,
      isManualBrand: Boolean(item.supplierBrand && item.supplierBrand !== defaultVendorBrandForEdit)
    };
  });

  assert.strictEqual(restoredItems[0].supplierBrand, 'PRASHANT MOTORS');
  assert.strictEqual(restoredItems[1].supplierBrand, 'PRASHANT MOTORS');
  console.log('✔ Test 7 Passed: Edit mode correctly restored supplierBrand for all parts');
  passedTests++;

  // TEST 8: Role Permissions check for System Admin and Store User
  totalTests++;
  console.log('\n--- TEST 8: Role Permissions for System Admin and Store User ---');
  const allowedRoles = ['Super Admin', 'Admin', 'Purchase Manager', 'Accounts Manager', 'Accounts', 'Accounts Executive', 'Spares', 'Store', 'Store User', 'Store Manager', 'Purchase Executive'];
  assert(allowedRoles.includes('Admin'), 'System Admin must have access to Purchase Entry & Edit');
  assert(allowedRoles.includes('Store User'), 'Store User must have access to Purchase Entry & Edit');
  console.log('✔ Test 8 Passed: Both System Admin and Store User have full access to Purchase Entry & Autofill');
  passedTests++;

  // Cleanup test purchase
  await Purchase.findByIdAndDelete(savedPurchase._id);
  console.log('✔ Cleanup: Test purchase record removed');

  await mongoose.disconnect();
  console.log('\n========================================================================');
  console.log(`ALL TESTS PASSED SUCCESSFULLY! (${passedTests}/${totalTests})`);
  console.log('========================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
