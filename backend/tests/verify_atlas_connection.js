const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('No MONGODB_URI found in backend/.env');
  process.exit(1);
}

// Mask credentials for display
const maskedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
console.log('--- Verifying MongoDB Atlas Connectivity ---');
console.log('Target URI:', maskedUri);

async function run() {
  const startTime = Date.now();
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000
    });
    const latency = Date.now() - startTime;
    console.log(`✅ Connected to MongoDB Atlas in ${latency}ms`);
    console.log(`Database Name: ${mongoose.connection.name}`);
    console.log(`Connection State: ${mongoose.connection.readyState} (1 = connected)`);

    // Ping
    const adminDb = mongoose.connection.db.admin();
    const pingRes = await adminDb.ping();
    console.log('Atlas Admin Ping Result:', pingRes);

    // List collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`Collections in database (${collections.length}):`);
    console.log(collections.map(c => c.name).sort().join(', '));

    // Count sample collections
    const collectionsToCount = ['users', 'jobcards', 'estimates', 'invoices', 'customers', 'vehicles'];
    console.log('\nRecord Counts in Live Atlas DB:');
    for (const collName of collectionsToCount) {
      if (collections.some(c => c.name === collName)) {
        const count = await mongoose.connection.db.collection(collName).countDocuments();
        console.log(` - ${collName}: ${count} records`);
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ MongoDB Atlas connectivity verification 100% SUCCESSFUL!');
    process.exit(0);
  } catch (err) {
    console.error('❌ MongoDB Atlas connection error:', err.message);
    process.exit(1);
  }
}

run();
