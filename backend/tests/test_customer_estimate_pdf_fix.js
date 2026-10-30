const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PassThrough } = require('stream');
const assert = require('assert');

// Import PDF generators
const { generateEstimatePDF, generateCustomerEstimatePDF } = require('../utils/pdfGenerator');

async function streamToBuffer(generatorFn, ...args) {
  return new Promise((resolve, reject) => {
    const pass = new PassThrough();
    const chunks = [];
    pass.on('data', chunk => chunks.push(chunk));
    pass.on('end', () => resolve(Buffer.concat(chunks)));
    pass.on('error', err => reject(err));
    generatorFn(...args, pass);
  });
}

function extractTextFromPdf(buf) {
  let fullText = '';
  let offset = 0;
  while ((offset = buf.indexOf('stream', offset)) !== -1) {
    let start = offset + 6;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const end = buf.indexOf('endstream', start);
    if (end !== -1) {
      const slice = buf.subarray(start, end);
      try {
        const decomp = zlib.inflateSync(slice).toString('latin1');
        const tjRegex = /\[(.*?)\]\s*TJ/g;
        let match;
        while ((match = tjRegex.exec(decomp)) !== null) {
          const inner = match[1];
          const hexParts = inner.match(/<([0-9a-fA-F]+)>/g) || [];
          const line = hexParts.map(h => Buffer.from(h.slice(1, -1), 'hex').toString('latin1')).join('');
          fullText += line + '\n';
        }
      } catch (_) {}
      offset = end + 9;
    } else {
      break;
    }
  }
  return fullText;
}

async function runTests() {
  console.log('=== STARTING CUSTOMER ESTIMATE PDF GENERATION VERIFICATION ===\n');

  const mockCustomer = {
    _id: '67c1234567890abcdef12345',
    name: 'Kushal Automobiles Test',
    mobile: '9949479765',
    alternateNumber: '9848012345',
    address: 'Plot 42, Hitech City, Hyderabad, Telangana - 500081',
    gstNumber: '36AAJCM4778P1ZI'
  };

  const mockVehicle = {
    _id: '67c1234567890abcdef12346',
    vehicleNumber: 'TS 09 EA 1234',
    make: 'Hyundai',
    model: 'Creta 1.5 SX(O)',
    odometerReading: 45200,
    chassisNumber: 'MALC1234567890',
    engineNumber: 'D4FA123456'
  };

  const mockJobCard = {
    _id: '67c1234567890abcdef12347',
    jobCardNo: 'JC/26-27/099',
    serviceAdvisor: 'Ramesh Sharma',
    odometerReading: 45200
  };

  // Test 1: Standard Customer Estimate with parts & labour
  console.log('Test 1: Generating standard Customer Estimate PDF...');
  const mockEstimate1 = {
    _id: '67c1234567890abcdef12348',
    estimateNo: 'MVSS/EST/26-27/099',
    date: new Date(),
    serviceAdvisorName: 'Ramesh Sharma',
    parts: [
      { name: 'Engine Oil Synthetic 5W-30', qty: 4, rate: 850, discount: 200, taxableValue: 3200, gstPercent: 18, gstAmount: 576, total: 3776 },
      { name: 'Oil Filter Cartridge', qty: 1, rate: 450, discount: 0, taxableValue: 450, gstPercent: 18, gstAmount: 81, total: 531 },
      { name: 'Front Brake Pads Set', qty: 1, rate: 2800, discount: 300, taxableValue: 2500, gstPercent: 18, gstAmount: 450, total: 2950 }
    ],
    labour: [
      { description: 'Periodic Maintenance Service (PMS)', qty: 1, rate: 2500, discount: 250, taxableValue: 2250, gstPercent: 18, gstAmount: 405, total: 2655 },
      { description: 'Brake Caliper Servicing & Bleeding', qty: 1, rate: 1200, discount: 0, taxableValue: 1200, gstPercent: 18, gstAmount: 216, total: 1416 }
    ],
    totals: {
      partsTotal: 6150,
      labourTotal: 3450,
      gstTotal: 1728,
      grandTotal: 11328
    },
    status: 'Draft'
  };

  const buf1 = await streamToBuffer(
    (est, cust, veh, stream) => generateCustomerEstimatePDF(est, cust, veh, stream, mockJobCard),
    mockEstimate1,
    mockCustomer,
    mockVehicle
  );

  assert(buf1.length > 5000, `Buffer 1 should be > 5KB, got ${buf1.length} bytes`);
  assert(buf1.toString('ascii', 0, 5) === '%PDF-', 'Buffer 1 must be a valid PDF header');
  const text1 = extractTextFromPdf(buf1);
  assert(text1.includes('Kushal Automobiles Test'), 'Must contain customer name');
  assert(text1.includes('TS 09 EA 1234'), 'Must contain vehicle number');
  assert(text1.includes('JC/26-27/099'), 'Must contain job card number');
  assert(text1.includes('CUSTOMER ESTIMATE'), 'Must contain document title');
  console.log(`? Test 1 PASSED: Generated Customer Estimate PDF (${buf1.length} bytes) with complete customer, vehicle, and JC details\n`);

  // Test 2: Customer Estimate with Manual Price Override
  console.log('Test 2: Generating Customer Estimate PDF with manual price override...');
  const mockEstimateOverride = {
    ...mockEstimate1,
    estimateNo: 'MVSS/EST/26-27/100',
    manualOverride: true,
    manualGrandTotal: 9999.00
  };

  const buf2 = await streamToBuffer(
    (est, cust, veh, stream) => generateCustomerEstimatePDF(est, cust, veh, stream, mockJobCard),
    mockEstimateOverride,
    mockCustomer,
    mockVehicle
  );

  assert(buf2.length > 5000, `Buffer 2 should be > 5KB, got ${buf2.length} bytes`);
  assert(buf2.toString('ascii', 0, 5) === '%PDF-', 'Buffer 2 must be a valid PDF header');
  const text2 = extractTextFromPdf(buf2);
  assert(text2.includes('9999.00'), 'Buffer 2 must contain the manual overridden amount 9999.00');
  assert(text2.includes('OVERRIDE'), 'Buffer 2 must label the override');
  console.log(`? Test 2 PASSED: Manual price override (Rs. 9999.00) accurately applied in Customer Estimate PDF (${buf2.length} bytes)\n`);

  // Test 3: Generic items array schema fallback
  console.log('Test 3: Generating Customer Estimate PDF from generic items array...');
  const mockEstimateItems = {
    _id: '67c1234567890abcdef12349',
    estimateNo: 'MVSS/EST/26-27/101',
    date: new Date(),
    items: [
      { name: 'Spark Plugs Platinum (Set of 4)', type: 'part', qty: 1, rate: 1600, discount: 100, taxableValue: 1500, gstPercent: 18, gstAmount: 270, total: 1770 },
      { name: 'Throttle Body Cleaning', type: 'labour', qty: 1, rate: 800, discount: 0, taxableValue: 800, gstPercent: 18, gstAmount: 144, total: 944 }
    ],
    totals: {
      partsTotal: 1500,
      labourTotal: 800,
      gstTotal: 414,
      grandTotal: 2714
    },
    status: 'Waiting for Approval'
  };

  const buf3 = await streamToBuffer(
    (est, cust, veh, stream) => generateCustomerEstimatePDF(est, cust, veh, stream, mockJobCard),
    mockEstimateItems,
    mockCustomer,
    mockVehicle
  );

  assert(buf3.length > 5000, `Buffer 3 should be > 5KB, got ${buf3.length} bytes`);
  assert(buf3.toString('ascii', 0, 5) === '%PDF-', 'Buffer 3 must be a valid PDF header');
  const text3 = extractTextFromPdf(buf3);
  assert(text3.includes('Spark Plugs Platinum'), 'Must contain normalized part name');
  assert(text3.includes('Throttle Body Cleaning'), 'Must contain normalized labour name');
  console.log(`? Test 3 PASSED: Normalized estimate.items accurately into Customer Estimate PDF (${buf3.length} bytes)\n`);

  // Test 4: Verification of Distinctness between GST Estimate and Customer Estimate
  console.log('Test 4: Verifying GST Estimate PDF vs Customer Estimate PDF independence...');
  const bufGST = await streamToBuffer(
    (est, cust, veh, stream) => generateEstimatePDF(est, cust, veh, stream, mockJobCard),
    mockEstimate1,
    mockCustomer,
    mockVehicle
  );

  assert(bufGST.length > 5000, `GST buffer should be > 5KB, got ${bufGST.length} bytes`);
  assert(bufGST.toString('ascii', 0, 5) === '%PDF-', 'GST buffer must be a valid PDF');
  assert.notStrictEqual(buf1.toString('binary'), bufGST.toString('binary'), 'Customer PDF and GST PDF must be distinct documents');
  const textGST = extractTextFromPdf(bufGST);
  assert(textGST.includes('GST ESTIMATE'), 'GST PDF must have GST ESTIMATE banner');
  assert(text1.includes('CUSTOMER ESTIMATE'), 'Customer PDF must have CUSTOMER ESTIMATE banner');
  console.log(`? Test 4 PASSED: Customer Estimate PDF and GST Estimate PDF are distinct (${buf1.length} vs ${bufGST.length} bytes)\n`);

  // Test 5: Save Customer Estimate PDF to disk and verify
  console.log('Test 5: Verifying disk persistence of Customer_Estimate_<estimate_no>.pdf...');
  const outDir = path.join(__dirname, '../uploads/estimates');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const cleanEstNo = String(mockEstimate1.estimateNo).replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetPdf = path.join(outDir, `Customer_Estimate_${cleanEstNo}.pdf`);
  fs.writeFileSync(targetPdf, buf1);
  assert(fs.existsSync(targetPdf), 'Saved Customer Estimate PDF must exist on disk');
  const diskStat = fs.statSync(targetPdf);
  assert(diskStat.size > 5000, 'Saved Customer Estimate PDF file size must be > 5KB');
  console.log(`? Test 5 PASSED: Customer Estimate PDF saved to disk at ${targetPdf} (${diskStat.size} bytes)\n`);

  console.log('=== ALL 5 CUSTOMER ESTIMATE PDF VERIFICATION TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('? Test run failed with error:', err);
  process.exit(1);
});
