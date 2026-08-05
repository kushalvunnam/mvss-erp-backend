const fs = require('fs');
const path = require('path');
const { generateEstimatePDF, generateInvoicePDF } = require('../utils/pdfGenerator');

const mockCustomer = {
  name: 'John Doe',
  address: '123 Main Street, Banjara Hills, Hyderabad, Telangana',
  gstNumber: '36ABCDE1234F1Z5',
  mobile: '9876543210',
  alternateNumber: '9123456789'
};

const mockVehicle = {
  vehicleNumber: 'TS 09 EQ 1234',
  make: 'Hyundai',
  model: 'i20',
  chassisNumber: 'MALTF51CLM123456',
  engineNumber: 'G4LAHM123456',
  odometerReading: 45000
};

const mockEstimate = {
  estimateNo: 'EST-2026-001',
  date: new Date(),
  parts: [
    { name: 'Front Bumper', hsnCode: '8708', qty: 1, rate: 3500.00, amount: 3500.00, gstPercent: 18, total: 4130.00 },
    { name: 'Engine Oil 3.5L', hsnCode: '2710', qty: 1, rate: 1800.00, amount: 1800.00, gstPercent: 18, total: 2124.00 }
  ],
  labour: [
    { description: 'Front Bumper Painting & Fitting', rate: 1500.00, amount: 1500.00, gstPercent: 18, total: 1770.00 },
    { description: 'General Service Labour', rate: 1000.00, amount: 1000.00, gstPercent: 18, total: 1180.00 }
  ],
  totals: {
    grandTotal: 9204.00
  }
};

const mockInvoice = {
  invoiceNo: 'INV-2026-001',
  date: new Date(),
  invoiceType: 'tax invoice',
  gstDetails: {
    isInterstate: false
  },
  parts: [
    { name: 'Front Bumper', hsnCode: '8708', qty: 1, rate: 3500.00, amount: 3500.00, gstPercent: 18, total: 4130.00, cgstAmount: 315.00, sgstAmount: 315.00, igstAmount: 0 },
    { name: 'Engine Oil 3.5L', hsnCode: '2710', qty: 1, rate: 1800.00, amount: 1800.00, gstPercent: 18, total: 2124.00, cgstAmount: 162.00, sgstAmount: 162.00, igstAmount: 0 }
  ],
  labour: [
    { description: 'Front Bumper Painting & Fitting', rate: 1500.00, amount: 1500.00, gstPercent: 18, total: 1770.00, cgstAmount: 135.00, sgstAmount: 135.00, igstAmount: 0 },
    { description: 'General Service Labour', rate: 1000.00, amount: 1000.00, gstPercent: 18, total: 1180.00, cgstAmount: 90.00, sgstAmount: 90.00, igstAmount: 0 }
  ],
  totals: {
    grandTotal: 9204.00
  },
  insuranceClaimDetails: {
    approvedAmount: 5000.00,
    customerPayableAmount: 4204.00,
    insuranceCompany: 'ICICI Lombard General Insurance Co.',
    claimNo: 'CLM12345678'
  }
};

async function testPDFGeneration() {
  console.log('Generating Estimate PDF...');
  const estStream = fs.createWriteStream(path.join(__dirname, 'test_estimate.pdf'));
  generateEstimatePDF(mockEstimate, mockCustomer, mockVehicle, estStream, { jobCardNo: 'JC-MOCK-123' });
  
  await new Promise((resolve) => estStream.on('finish', resolve));
  console.log('✓ Estimate PDF generated successfully at:', path.join(__dirname, 'test_estimate.pdf'));

  console.log('Generating Invoice PDF...');
  const invStream = fs.createWriteStream(path.join(__dirname, 'test_invoice.pdf'));
  generateInvoicePDF(mockInvoice, mockCustomer, mockVehicle, invStream);
  
  await new Promise((resolve) => invStream.on('finish', resolve));
  console.log('✓ Invoice PDF generated successfully at:', path.join(__dirname, 'test_invoice.pdf'));
}

testPDFGeneration().catch(err => {
  console.error('PDF Generation Failed:', err);
  process.exit(1);
});
