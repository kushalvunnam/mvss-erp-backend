const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const uri = process.env.MONGODB_URI;
const auth = uri.split('mongodb+srv://')[1].split('@')[0];
const rest = uri.split('@')[1].split('/')[1];
const directUri = 'mongodb://' + auth + '@ac-ypzs3c0-shard-00-00.8xri3nn.mongodb.net:27017,ac-ypzs3c0-shard-00-01.8xri3nn.mongodb.net:27017,ac-ypzs3c0-shard-00-02.8xri3nn.mongodb.net:27017/' + rest.split('?')[0] + '?ssl=true&replicaSet=atlas-rfh39b-shard-0&authSource=admin';

async function check() {
  await mongoose.connect(directUri);
  const User = require('../models/User');
  const user = await User.findOne({ active: true, role: 'Super Admin' }) || await User.findOne({ active: true });
  console.log('User:', user.name, user.role, user._id);
  const token = jwt.sign({ _id: user._id, role: user.role, name: user.name }, process.env.JWT_SECRET || 'autoworkshop_secret_key_123');
  await mongoose.disconnect();

  const res = await axios.get('https://mvss-erp-backend.onrender.com/api/whatsapp/meta-status', {
    headers: { Authorization: 'Bearer ' + token }
  });
  console.log('--- META STATUS AUDIT REPORT ---');
  console.log('Phone Verification:', JSON.stringify(res.data.phoneVerification, null, 2));
  console.log('WABA Verification:', JSON.stringify(res.data.wabaVerification, null, 2));
  console.log('Templates Count:', res.data.templatesAudit?.count);
  if (res.data.templatesAudit?.templates) {
    for (const t of res.data.templatesAudit.templates) {
      console.log('Template:', t.name, '| Lang:', t.language, '| Status:', t.status, '| Params:', t.paramCount);
      if (t.components) {
        for (const c of t.components) {
          console.log('   Comp:', c.type, c.format ? 'Format: ' + c.format : '', c.text ? 'Text: ' + c.text.substring(0, 50) : '');
        }
      }
    }
  } else {
    console.log('Templates Error / Data:', res.data.templatesAudit);
  }
}
check().catch(err => {
  console.error('Error status:', err.response?.status);
  console.error('Error data:', err.response?.data || err.message);
});
