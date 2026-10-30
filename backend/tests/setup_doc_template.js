const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const uri = process.env.MONGODB_URI;
const auth = uri.split('mongodb+srv://')[1].split('@')[0];
const rest = uri.split('@')[1].split('/')[1];
const directUri = 'mongodb://' + auth + '@ac-ypzs3c0-shard-00-00.8xri3nn.mongodb.net:27017,ac-ypzs3c0-shard-00-01.8xri3nn.mongodb.net:27017,ac-ypzs3c0-shard-00-02.8xri3nn.mongodb.net:27017/' + rest.split('?')[0] + '?ssl=true&replicaSet=atlas-rfh39b-shard-0&authSource=admin';

async function setup() {
  const token = jwt.sign({ _id: '6a55f477693cff6ff3ac6dde', role: 'Super Admin', name: 'System Admin' }, process.env.JWT_SECRET || 'autoworkshop_secret_key_123');

  const res = await axios.post('https://mvss-erp-backend.onrender.com/api/whatsapp/setup-document-template', {}, {
    headers: { Authorization: 'Bearer ' + token }
  });
  console.log('Setup Document Template Result:', res.data);
}
setup().catch(err => {
  console.error('Error status:', err.response?.status);
  console.error('Error data:', err.response?.data || err.message);
});
