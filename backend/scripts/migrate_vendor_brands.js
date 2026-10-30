const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Vendor = require('../models/Vendor');

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const vendors = await Vendor.find({});
    console.log(`Found ${vendors.length} vendors in database.`);

    for (const v of vendors) {
      let updated = false;
      let brand = v.supplierBrand || '';
      let brands = Array.isArray(v.brands) ? [...v.brands] : [];

      if (!brand || brands.length === 0) {
        const lowerName = (v.name || '').toLowerCase();
        if (lowerName.includes('bosch')) brand = 'Bosch';
        else if (lowerName.includes('castrol')) brand = 'Castrol';
        else if (lowerName.includes('gates')) brand = 'Gates';
        else if (lowerName.includes('philips')) brand = 'Philips';
        else if (lowerName.includes('exide')) brand = 'Exide';
        else if (lowerName.includes('minda')) brand = 'Minda';
        else if (lowerName.includes('lumax')) brand = 'Lumax';
        else if (lowerName.includes('tvs')) brand = 'TVS';
        else if (lowerName.includes('maruti')) brand = 'Maruti Suzuki Genuine';
        else if (lowerName.includes('hyundai')) brand = 'Hyundai Genuine';
        else if (lowerName.includes('tata')) brand = 'Tata Genuine';
        else if (lowerName.includes('mahindra')) brand = 'Mahindra Genuine';

        if (brand) {
          v.supplierBrand = brand;
          if (!brands.includes(brand)) brands.push(brand);
          v.brands = brands;
          await v.save();
          updated = true;
        }
      }
      console.log(`[VENDOR] ${v.vendorCode} | ${v.name} | brand: "${v.supplierBrand}" | brands: ${JSON.stringify(v.brands)} | updated: ${updated}`);
    }

    await mongoose.disconnect();
    console.log('Vendor migration finished successfully.');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

migrate();
