const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Load env vars
const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/autoworkshop';
const User = require('../models/User');

// Simple fetch replacement or HTTP calls via axios/http node client
const http = require('http');

function post(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }));
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function put(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }));
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTest() {
  try {
    console.log('Connecting to database:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      family: 4
    });

    console.log('Cleaning up existing test users...');
    await User.deleteMany({ email: { $in: ['test_user@mvss.com', 'test_admin@mvss.com'] } });

    console.log('Seeding test users...');
    // Raw user creation (pre-save hook hashes these)
    const adminUser = new User({
      name: 'Test Admin',
      email: 'test_admin@mvss.com',
      password: 'admin_pass_123',
      role: 'Admin'
    });
    await adminUser.save();

    const normalUser = new User({
      name: 'Test User',
      email: 'test_user@mvss.com',
      password: 'user_pass_123',
      role: 'Service'
    });
    await normalUser.save();

    console.log('Users seeded successfully.');

    // We will start the dev server temporarily or call the API endpoints directly.
    const express = require('express');
    const app = express();
    app.use(express.json());
    
    // Mount the auth route
    const authRouter = require('../routes/auth');
    app.use('/api/auth', authRouter);

    // Let's listen on a free port
    const server = app.listen(0, async () => {
      const port = server.address().port;
      const baseUrl = `http://localhost:${port}/api/auth`;
      console.log(`Test server listening on port ${port}`);

      try {
        console.log('\n--- Logging in to get tokens ---');
        const loginAdmin = await post(`${baseUrl}/login`, { email: 'test_admin@mvss.com', password: 'admin_pass_123' });
        const adminToken = loginAdmin.body.token;

        const loginUser = await post(`${baseUrl}/login`, { email: 'test_user@mvss.com', password: 'user_pass_123' });
        const userToken = loginUser.body.token;

        console.log('Tokens retrieved successfully.');

        console.log('\n--- Test 1: Self password change (Success case) ---');
        const changeSelf = await put(`${baseUrl}/change-password`, {
          currentPassword: 'user_pass_123',
          newPassword: 'new_user_pass_123',
          confirmPassword: 'new_user_pass_123'
        }, { Authorization: `Bearer ${userToken}` });

        console.log('Status:', changeSelf.status);
        console.log('Body:', changeSelf.body);
        if (changeSelf.status !== 200 || !changeSelf.body.success) {
          throw new Error('Self password change failed.');
        }

        console.log('\n--- Test 2: Try to login with new password ---');
        const loginNew = await post(`${baseUrl}/login`, { email: 'test_user@mvss.com', password: 'new_user_pass_123' });
        console.log('Status:', loginNew.status);
        if (loginNew.status !== 200) {
          throw new Error('Login with new password failed.');
        }

        console.log('\n--- Test 3: Self password change validation (mismatched confirm) ---');
        const mismatched = await put(`${baseUrl}/change-password`, {
          currentPassword: 'new_user_pass_123',
          newPassword: 'another_pass_123',
          confirmPassword: 'different_pass_123'
        }, { Authorization: `Bearer ${userToken}` });
        console.log('Status:', mismatched.status, 'Error message:', mismatched.body.error);
        if (mismatched.status !== 400) {
          throw new Error('Validation for mismatched password confirmation failed.');
        }

        console.log('\n--- Test 4: Self password change validation (same password as current) ---');
        const samePass = await put(`${baseUrl}/change-password`, {
          currentPassword: 'new_user_pass_123',
          newPassword: 'new_user_pass_123',
          confirmPassword: 'new_user_pass_123'
        }, { Authorization: `Bearer ${userToken}` });
        console.log('Status:', samePass.status, 'Error message:', samePass.body.error);
        if (samePass.status !== 400) {
          throw new Error('Validation for same password failed.');
        }

        console.log('\n--- Test 5: Self password change validation (short length) ---');
        const shortPass = await put(`${baseUrl}/change-password`, {
          currentPassword: 'new_user_pass_123',
          newPassword: '123',
          confirmPassword: '123'
        }, { Authorization: `Bearer ${userToken}` });
        console.log('Status:', shortPass.status, 'Error message:', shortPass.body.error);
        if (shortPass.status !== 400) {
          throw new Error('Validation for password length failed.');
        }

        console.log('\n--- Test 6: Admin resets user password ---');
        const targetUserId = loginUser.body.user.id;
        const adminReset = await put(`${baseUrl}/users/${targetUserId}/change-password`, {
          newPassword: 'admin_reset_pass_123',
          confirmPassword: 'admin_reset_pass_123'
        }, { Authorization: `Bearer ${adminToken}` });
        console.log('Status:', adminReset.status);
        console.log('Body:', adminReset.body);
        if (adminReset.status !== 200 || !adminReset.body.success) {
          throw new Error('Admin password reset failed.');
        }

        console.log('\n--- Test 7: Normal user attempts to reset admin password (should fail) ---');
        const adminUserId = loginAdmin.body.user.id;
        const unauthorizedReset = await put(`${baseUrl}/users/${adminUserId}/change-password`, {
          newPassword: 'hacker_pass_123',
          confirmPassword: 'hacker_pass_123'
        }, { Authorization: `Bearer ${userToken}` });
        console.log('Status:', unauthorizedReset.status, 'Error message:', unauthorizedReset.body.error);
        if (unauthorizedReset.status !== 403) {
          throw new Error('Authorization check failed: normal user could hit admin reset endpoint.');
        }

        console.log('\nALL TESTS PASSED SUCCESSFULLY!');
      } catch (err) {
        console.error('Test assertions failed:', err);
        process.exitCode = 1;
      } finally {
        server.close(async () => {
          console.log('Cleaning up database test users...');
          await User.deleteMany({ email: { $in: ['test_user@mvss.com', 'test_admin@mvss.com'] } });
          await mongoose.disconnect();
          console.log('Done.');
          process.exit(process.exitCode || 0);
        });
      }
    });

  } catch (error) {
    console.error('Test setup error:', error);
    process.exit(1);
  }
}

runTest();
