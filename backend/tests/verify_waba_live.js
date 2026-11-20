const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const uri = process.env.MONGODB_URI;
const auth = uri.split('mongodb+srv://')[1].split('@')[0];
const rest = uri.split('@')[1].split('/')[1];
const directUri = 'mongodb://' + auth + '@ac-ypzs3c0-shard-00-00.8xri3nn.mongodb.net:27017,ac-ypzs3c0-shard-00-01.8xri3nn.mongodb.net:27017,ac-ypzs3c0-shard-00-02.8xri3nn.mongodb.net:27017/' + rest.split('?')[0] + '?ssl=true&replicaSet=atlas-rfh39b-shard-0&authSource=admin';

const RENDER_BASE = 'https://mvss-erp-backend.onrender.com';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDeploy(token) {
  console.log('[1/4] Waiting for Render deployment of commit 2fda55b to become live...');
  const maxAttempts = 60; // 60 * 10s = 10 minutes
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await axios.get(`${RENDER_BASE}/api/whatsapp/deep-audit`, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true,
        timeout: 15000
      });
      // The old build had missing axios in routes/whatsapp.js which caused me.status === 0
      // When 2fda55b is live, me will return an actual HTTP status (> 0, e.g. 200 or 400)
      if (res.status === 200 && res.data?.me && res.data.me.status !== 0) {
        console.log(`[Render Deployment Ready] /api/whatsapp/deep-audit responded with live data on attempt ${i}. Deployed!`);
        return res.data;
      }
      console.log(`[Attempt ${i}/${maxAttempts}] HTTP status: ${res.status}, me.status: ${res.data?.me?.status}. Waiting 10s for build/rollout...`);
    } catch (err) {
      console.log(`[Attempt ${i}/${maxAttempts}] Connection note: ${err.message}. Waiting 10s...`);
    }
    await sleep(10000);
  }
  throw new Error('Timeout waiting for Render deployment to complete.');
}

async function runVerification() {
  console.log('[1/3] Generating authenticated admin JWT...');
  await mongoose.connect(directUri);
  const User = require('../models/User');
  const user = await User.findOne({ active: true, role: 'Super Admin' }) || await User.findOne({ active: true });
  const token = jwt.sign({ _id: user._id, role: user.role, name: user.name }, process.env.JWT_SECRET || 'autoworkshop_secret_key_123');
  await mongoose.disconnect();
  console.log(`Admin user authenticated: ${user.name} (${user.role})`);

  console.log('[2/3] Waiting for Render deployment of commit 2fda55b to become live...');
  const deep = await waitForDeploy(token);

  console.log('[3/3] Querying /api/whatsapp/meta-status on live Render backend...');
  const metaStatusRes = await axios.get(`${RENDER_BASE}/api/whatsapp/meta-status`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000
  });

  console.log('\n===============================================================');
  console.log('            LIVE META WABA AUDIT & VERIFICATION REPORT          ');
  console.log('===============================================================\n');

  const metaStatus = metaStatusRes.data;

  // 1. Candidate WABA 1718873676471685 Node details
  console.log('--- 1. CANDIDATE WABA 1718873676471685 NODE DETAILS ---');
  console.log('Basic Info:', JSON.stringify(deep.targetWaba_1718873676471685?.basic, null, 2));
  console.log('Metadata Info:', JSON.stringify(deep.targetWaba_1718873676471685?.metadata, null, 2));

  // 2. Phone Numbers owned by 1718873676471685
  console.log('\n--- 2. PHONE NUMBERS OWNED BY WABA 1718873676471685 ---');
  console.log(JSON.stringify(deep.targetWaba_1718873676471685?.phoneNumbers, null, 2));

  // 3. Templates in 1718873676471685
  console.log('\n--- 3. MESSAGE TEMPLATES IN WABA 1718873676471685 ---');
  const tpls = deep.targetWaba_1718873676471685?.templates?.data || [];
  console.log(`Found ${tpls.length} template(s) in WABA 1718873676471685:`);
  tpls.forEach(t => console.log(`  - Name: ${t.name} | Lang: ${t.language} | Status: ${t.status}`));

  // 4. Introspect Candidate Messaging Account 4778078332414981
  console.log('\n--- 4. INTROSPECT MESSAGING ACCOUNT 4778078332414981 (COMPARISON) ---');
  console.log('Basic Info:', JSON.stringify(deep.targetAccount_4778078332414981?.basic, null, 2));
  console.log('Phone Numbers:', JSON.stringify(deep.targetAccount_4778078332414981?.phoneNumbers, null, 2));
  console.log('Templates:', JSON.stringify(deep.targetAccount_4778078332414981?.templates, null, 2));

  // 5. Token Permissions & Granular Scopes
  console.log('\n--- 5. TOKEN PERMISSIONS & ASSET ASSIGNMENTS ---');
  console.log('Granted Permissions:', JSON.stringify(deep.permissions?.data, null, 2));
  console.log('Assigned WABAs to System User (/me/assigned_whatsapp_business_accounts):', JSON.stringify(deep.meAssignedWabas, null, 2));
  console.log('Owned WABAs (/me/owned_whatsapp_business_accounts):', JSON.stringify(deep.meOwnedWabas, null, 2));
  console.log('Debug Token Scopes & Target IDs:', JSON.stringify(deep.debugToken?.data?.granular_scopes, null, 2));

  // 6. WhatsApp Service Meta Status Verification
  console.log('\n--- 6. WHATSAPP SERVICE SYNC META TEMPLATES AUDIT ---');
  console.log('Phone Verification:', JSON.stringify(metaStatus.phoneVerification, null, 2));
  console.log('WABA Verification:', JSON.stringify(metaStatus.wabaVerification, null, 2));
  console.log('Templates Count:', metaStatus.templatesAudit?.count);

  // Save evidence without any tokens
  const evidence = {
    timestamp: new Date().toISOString(),
    targetWaba_1718873676471685: deep.targetWaba_1718873676471685,
    targetAccount_4778078332414981: deep.targetAccount_4778078332414981,
    targetPhone_1435390016330145: deep.targetPhone_1435390016330145,
    permissions: deep.permissions,
    meAssignedWabas: deep.meAssignedWabas,
    debugTokenGranularScopes: deep.debugToken?.data?.granular_scopes,
    metaStatusAudit: metaStatus
  };
  fs.writeFileSync(path.join(__dirname, 'meta_waba_verification_evidence.json'), JSON.stringify(evidence, null, 2));
  console.log('\nEvidence saved to backend/tests/meta_waba_verification_evidence.json');
}

runVerification().catch(err => {
  console.error('\nVerification execution failed:', err.message);
  if (err.response?.data) console.error('Response data:', err.response.data);
  process.exit(1);
});
