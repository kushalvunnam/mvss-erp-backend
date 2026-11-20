const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const uri = process.env.MONGODB_URI;
const auth = uri.split('mongodb+srv://')[1].split('@')[0];
const rest = uri.split('@')[1].split('/')[1];
const directUri = 'mongodb://' + auth + '@ac-ypzs3c0-shard-00-00.8xri3nn.mongodb.net:27017,ac-ypzs3c0-shard-00-01.8xri3nn.mongodb.net:27017,ac-ypzs3c0-shard-00-02.8xri3nn.mongodb.net:27017/' + rest.split('?')[0] + '?ssl=true&replicaSet=atlas-rfh39b-shard-0&authSource=admin';

async function test() {
  await mongoose.connect(directUri);
  const User = require('../models/User');
  const user = await User.findOne({ active: true, role: 'Super Admin' }) || await User.findOne({ active: true });
  const token = jwt.sign({ _id: user._id, role: user.role, name: user.name }, process.env.JWT_SECRET || 'autoworkshop_secret_key_123');
  await mongoose.disconnect();

  try {
    const res = await axios.get('https://mvss-erp-backend.onrender.com/api/whatsapp/deep-audit', {
      headers: { Authorization: 'Bearer ' + token },
      timeout: 35000
    });
    console.log('SUCCESS! deep-audit responded:');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.log('HTTP status:', err.response?.status, err.response?.data || err.message);
  }
}
test().catch(console.error);
