const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb+srv://mvssadmin:MVSS2026@cluster0.8xri3nn.mongodb.net/autoworkshop?retryWrites=true&w=majority&appName=Cluster0';
async function run() {
  await mongoose.connect(MONGODB_URI);
  const User = require('./models/User');
  const users = await User.find();
  console.log(users.map(u => ({ name: u.name, role: u.role })));
  await mongoose.disconnect();
}
run().catch(console.error);
