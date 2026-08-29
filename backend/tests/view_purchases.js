const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const checkPurchases = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('No MONGODB_URI found in env!');
      process.exit(1);
    }
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);

    const Purchase = require('../models/Purchase');
    const purchases = await Purchase.find({}).lean();

    console.log(`Total purchase records: ${purchases.length}`);
    const withAttachments = purchases.filter(p => p.attachmentUrl || (p.attachments && p.attachments.length > 0));
    console.log(`Purchases with attachments: ${withAttachments.length}`);

    for (const p of withAttachments) {
      console.log(`- Purchase No: ${p.purchaseNo}, Vendor: ${p.vendorName}`);
      console.log(`  Single URL: "${p.attachmentUrl}"`);
      console.log(`  Single Name: "${p.attachmentName}"`);
      console.log(`  Single Type: "${p.attachmentType}"`);
      console.log(`  Multiple:`, p.attachments);
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

checkPurchases();
