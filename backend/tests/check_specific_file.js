const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const checkFile = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    
    console.log('Searching for files matching key 6a92d88f3d7ca59e5877902...');
    // Search in GridFS purchase_attachments.files collection
    const files = await db.collection('purchase_attachments.files').find({}).toArray();
    let found = false;
    for (const f of files) {
      if (f._id.toString().includes('6a92d88f3d7ca59e5877902') || f._id.toString().startsWith('6a92d88f3d7ca59e5877902')) {
        console.log('Found matching file in GridFS purchase_attachments:');
        console.log(`- FileID: ${f._id}`);
        console.log(`  Filename: ${f.filename}`);
        console.log(`  Length: ${f.length}`);
        console.log(`  ContentType: ${f.contentType}`);
        found = true;
      }
    }
    
    if (!found) {
      console.log('No file matches this ID in GridFS.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

checkFile();
