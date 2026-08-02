const mongoose = require('mongoose');

let Counter;
try {
  Counter = mongoose.model('Counter');
} catch (e) {
  const counterSchema = new mongoose.Schema({
    module: { type: String, required: true }, // 'JC', 'EST', 'INV', 'PUR'
    financialYear: { type: String, required: true }, // '26-27'
    seq: { type: Number, default: 0 }
  });
  // Unique composite index to prevent duplicate entries for a module + financial year
  counterSchema.index({ module: 1, financialYear: 1 }, { unique: true });
  Counter = mongoose.model('Counter', counterSchema);
}

/**
 * Calculates the Financial Year string (e.g. '26-27') for a given date
 * @param {Date} date
 * @returns {string}
 */
function getFinancialYear(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed: 0 is Jan, 3 is Apr

  let startYear, endYear;
  if (month >= 3) {
    // April to December
    startYear = year;
    endYear = year + 1;
  } else {
    // January to March
    startYear = year - 1;
    endYear = year;
  }

  const startStr = String(startYear).slice(-2);
  const endStr = String(endYear).slice(-2);
  return `${startStr}-${endStr}`;
}

/**
 * Generates the next sequential document number for a given module and financial year
 * @param {string} moduleName - 'JC' | 'EST' | 'INV' | 'PUR'
 * @param {string} modelName - Mongoose model name, e.g. 'JobCard' | 'Estimate' | 'Invoice' | 'Purchase'
 * @param {Date} [date] - Optional date of the document
 * @returns {Promise<string>} - Formatted document number e.g. 'MVSS/JC/26-27/001'
 */
async function getNextSequence(moduleName, modelName, date = new Date()) {
  const fy = getFinancialYear(date);
  const prefix = `MVSS/${moduleName}/${fy}/`;

  // 1. Try to find the counter
  let counter = await Counter.findOne({ module: moduleName, financialYear: fy });

  // 2. If the counter does not exist, initialize it by scanning the database
  if (!counter) {
    const Model = mongoose.model(modelName);
    
    // Identify the field name dynamically based on modelName
    let fieldName = 'jobCardNo';
    if (modelName === 'Estimate') fieldName = 'estimateNo';
    else if (modelName === 'Invoice') fieldName = 'invoiceNo';
    else if (modelName === 'Purchase') fieldName = 'purchaseNo';
    else if (modelName === 'ExternalRepair') fieldName = 'repairNo';

    const records = await Model.find({
      [fieldName]: new RegExp('^' + prefix)
    }, { [fieldName]: 1 });

    let maxSeq = 0;
    for (const r of records) {
      const val = r[fieldName];
      if (val) {
        const parts = val.split('/');
        const seqStr = parts[parts.length - 1];
        const seq = parseInt(seqStr, 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }

    try {
      counter = new Counter({ module: moduleName, financialYear: fy, seq: maxSeq });
      await counter.save();
    } catch (saveErr) {
      // If concurrent write occurred, retrieve the written counter
      counter = await Counter.findOne({ module: moduleName, financialYear: fy });
    }
  }

  // 3. Atomically increment the sequence counter
  let updatedCounter = await Counter.findOneAndUpdate(
    { module: moduleName, financialYear: fy },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  // 4. Double check uniqueness in the collection (to prevent duplicate index errors)
  const Model = mongoose.model(modelName);
  let fieldName = 'jobCardNo';
  if (modelName === 'Estimate') fieldName = 'estimateNo';
  else if (modelName === 'Invoice') fieldName = 'invoiceNo';
  else if (modelName === 'Purchase') fieldName = 'purchaseNo';
  else if (modelName === 'ExternalRepair') fieldName = 'repairNo';

  let seqNum = updatedCounter.seq;
  while (true) {
    const sequenceStr = String(seqNum).padStart(3, '0');
    const candidateNo = `${prefix}${sequenceStr}`;
    const exists = await Model.findOne({ [fieldName]: candidateNo });
    if (!exists) {
      // If we had to increment beyond the counter's current value due to manually created items, sync the counter
      if (seqNum !== updatedCounter.seq) {
        await Counter.updateOne(
          { module: moduleName, financialYear: fy },
          { $set: { seq: seqNum } }
        );
      }
      return candidateNo;
    }
    seqNum++;
  }
}

function formatLegacyNumber(val, moduleName, fallbackDate = new Date()) {
  if (!val) return val;
  if (val.startsWith('MVSS/')) return val;

  // If it matches JC/26-27/005, map to MVSS/JC/26-27/005
  if (val.includes('/')) {
    const subParts = val.split('/');
    if (subParts.length === 3) {
      return `MVSS/${moduleName}/${subParts[1]}/${subParts[2]}`;
    }
  }

  // Try to parse format e.g. EST-20260802-001 or EST-2026-001
  const parts = val.split('-');
  if (parts.length >= 3) {
    const dateStr = parts[1]; // e.g. "20260802"
    const seqStr = parts[2]; // e.g. "001"
    let d = new Date(fallbackDate);
    if (dateStr && dateStr.length === 8) {
      const year = parseInt(dateStr.slice(0, 4), 10);
      const month = parseInt(dateStr.slice(4, 6), 10) - 1;
      const day = parseInt(dateStr.slice(6, 8), 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        d = new Date(year, month, day);
      }
    } else if (dateStr && dateStr.length === 4) {
      const year = parseInt(dateStr, 10);
      if (!isNaN(year)) {
        d = new Date(year, 6, 1); // default to middle of year
      }
    }
    const fy = getFinancialYear(d);
    return `MVSS/${moduleName}/${fy}/${seqStr}`;
  }
  return val;
}

module.exports = {
  getFinancialYear,
  getNextSequence,
  formatLegacyNumber,
  Counter
};
