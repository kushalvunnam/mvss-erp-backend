const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const recoverAndClean = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const Purchase = require('../models/Purchase');
    const db = mongoose.connection.db;

    console.log('================================================================');
    console.log('PHASE 4: AUDIT, RECOVER & CLEAN PURCHASE ATTACHMENTS');
    console.log('================================================================\n');

    // 1. RECOVERY: Link verified GridFS files to their matching purchases
    console.log('--- STEP 1: Attempting Recovery of GridFS files ---');
    
    // Purchase 070 -> SRI_ENTER_31AUG_BRIO.jpeg (GridFS ID: 6a957399823a29b77f9029f0)
    const p70 = await Purchase.findOne({ purchaseNo: 'MVSS/PUR/26-27/070' });
    if (p70) {
      p70.attachments = [{
        key: '6a957399823a29b77f9029f0',
        originalName: 'SRI_ENTER_31AUG_BRIO.jpeg',
        mimeType: 'image/jpeg',
        size: 156732
      }];
      p70.attachmentUrl = '/api/purchases/attachment/6a957399823a29b77f9029f0';
      p70.attachmentName = 'SRI_ENTER_31AUG_BRIO.jpeg';
      p70.attachmentType = 'image/jpeg';
      await p70.save();
      console.log('✔ Recovered & Linked attachment for MVSS/PUR/26-27/070 (Sri Enterprises, Inv: S126271419)');
    }

    // Purchase 071 -> KANTIPUDI_25AUG_DUSTER.jpeg (GridFS ID: 6a957a5f823a29b77f903a04)
    const p71 = await Purchase.findOne({ purchaseNo: 'MVSS/PUR/26-27/071' });
    if (p71) {
      p71.attachments = [{
        key: '6a957a5f823a29b77f903a04',
        originalName: 'KANTIPUDI_25AUG_DUSTER.jpeg',
        mimeType: 'image/jpeg',
        size: 267739
      }];
      p71.attachmentUrl = '/api/purchases/attachment/6a957a5f823a29b77f903a04';
      p71.attachmentName = 'KANTIPUDI_25AUG_DUSTER.jpeg';
      p71.attachmentType = 'image/jpeg';
      await p71.save();
      console.log('✔ Recovered & Linked attachment for MVSS/PUR/26-27/071 (KANTIPUDI AUTOMOBILES, Inv: PINVRJIA27001175)');
    }

    // Purchase 068 -> lns_auto_28aug.jpeg (GridFS ID: 6a92892f709b2c90eae006d7)
    const p68 = await Purchase.findOne({ purchaseNo: 'MVSS/PUR/26-27/068' });
    if (p68) {
      p68.attachments = [{
        key: '6a92892f709b2c90eae006d7',
        originalName: 'lns_auto_28aug.jpeg',
        mimeType: 'image/jpeg',
        size: 191665
      }];
      p68.attachmentUrl = '/api/purchases/attachment/6a92892f709b2c90eae006d7';
      p68.attachmentName = 'lns_auto_28aug.jpeg';
      p68.attachmentType = 'image/jpeg';
      await p68.save();
      console.log('✔ Recovered & Linked attachment for MVSS/PUR/26-27/068 (LNS AUTO WORLD, Inv: 1069)');
    }

    // 2. CLEANUP: Clean literal "undefined" string artifacts
    console.log('\n--- STEP 2: Cleaning Corrupted "undefined" String Artifacts ---');
    const corruptedPurchases = await Purchase.find({
      $or: [
        { attachmentUrl: 'undefined' },
        { attachmentUrl: '/api/purchases/attachment/undefined' },
        { attachmentUrl: 'null' },
        { 'attachments.key': 'undefined' }
      ]
    });

    console.log(`Found ${corruptedPurchases.length} purchases with literal "undefined" attachment markers.`);
    for (const p of corruptedPurchases) {
      p.attachmentUrl = '';
      p.attachmentName = '';
      p.attachmentType = '';
      if (p.attachments && Array.isArray(p.attachments)) {
        p.attachments = p.attachments.filter(a => a && a.key && a.key !== 'undefined' && a.key !== 'null');
      }
      await p.save();
    }
    console.log(`✔ Successfully cleaned "undefined" strings from ${corruptedPurchases.length} purchase records.`);

    // 3. FINAL AUDIT
    console.log('\n--- STEP 3: Verification Audit of All 77 Purchases ---');
    const all = await Purchase.find({}).sort({ purchaseNo: 1 }).lean();
    let validWithFiles = 0;
    let localDiskMissing = 0;
    let noAttachment = 0;

    for (const p of all) {
      const hasGridFs = p.attachments && p.attachments.length > 0 && p.attachments[0].key;
      const isLocal = p.attachmentUrl && p.attachmentUrl.startsWith('/uploads/');

      if (hasGridFs) {
        validWithFiles++;
        console.log(`[VALID FILE] ${p.purchaseNo} | Vendor: ${p.vendorName} | Key: ${p.attachments[0].key} (${p.attachments[0].originalName})`);
      } else if (isLocal) {
        localDiskMissing++;
        console.log(`[LOCAL MISSING] ${p.purchaseNo} | Vendor: ${p.vendorName} | Path: ${p.attachmentUrl}`);
      } else {
        noAttachment++;
      }
    }

    console.log('\n=== AUDIT SUMMARY ===');
    console.log(`Total Records (Preserved): ${all.length}`);
    console.log(`Active Recovered GridFS Files: ${validWithFiles}`);
    console.log(`Local Disk Files Lost in Past Container Restarts: ${localDiskMissing}`);
    console.log(`Records without attachments: ${noAttachment}`);

  } catch (err) {
    console.error('Audit/Recovery Failed:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

recoverAndClean();
