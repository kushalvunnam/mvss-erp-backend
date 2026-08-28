const { spawn } = require('child_process');
const path = require('path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const runTest = async () => {
  console.log('Starting local integration test...');

  // Load env config
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/autoworkshop';
  const secret = process.env.JWT_SECRET || 'autoworkshop_secret_key_123';

  // Connect to find a real active user ID
  console.log('Finding a real active user ID from database...');
  await mongoose.connect(mongoUri);
  const User = require('../models/User');
  const user = await User.findOne({ active: true });
  if (!user) {
    console.error('No active user found in DB to sign token!');
    process.exit(1);
  }
  const userId = user._id.toString();
  await mongoose.disconnect();
  console.log(`Found active user: ${user.email} (ID: ${userId})`);

  // Sign token
  const token = jwt.sign(
    { _id: userId, email: user.email, role: user.role },
    secret,
    { expiresIn: '1d' }
  );
  console.log('Direct test token signed successfully.');

  const server = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '5001' }
  });

  server.stdout.on('data', (data) => {
    console.log(`[Server Out]: ${data.toString().trim()}`);
  });

  server.stderr.on('data', (data) => {
    console.error(`[Server Err]: ${data.toString().trim()}`);
  });

  // Wait 15 seconds to observe server boot output
  await new Promise(resolve => setTimeout(resolve, 15000));

  try {
    console.log('Querying autocomplete search endpoint...');
    const searchRes = await fetch('http://localhost:5001/api/jobcards/search?q=Ran', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!searchRes.ok) {
      throw new Error(`Search failed with status ${searchRes.status}`);
    }

    const results = await searchRes.json();
    console.log('\n--- SEARCH RESULTS ---');
    console.log(JSON.stringify(results, null, 2));
    console.log('----------------------\n');
    console.log('✅ Autocomplete Search Integration Test Passed!');
  } catch (err) {
    console.error('❌ Test Failed:', err.message);
  } finally {
    console.log('Shutting down local server...');
    server.kill();
    process.exit(0);
  }
};

runTest();
