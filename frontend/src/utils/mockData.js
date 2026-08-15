// Initial mock database state for offline demo testing
export const initialCustomers = [
  { _id: 'cust_1', name: 'Rahul Sharma', mobile: '9949479765', email: 'rahul@example.com', address: 'Plot 45, Jubilee Hills, Hyderabad', gstNumber: '36AABCM1234F1Z0', type: 'Individual' },
  { _id: 'cust_2', companyName: 'Mehta Logistics', name: 'Ravi Kumar', mobile: '9848022338', email: 'billing@mehtalogistics.com', address: 'Survey 12, Medchal, Hyderabad', gstNumber: '27AAACM5555F1Z2', type: 'Corporate' },
  { _id: 'cust_3', name: 'National Insurance Agency', mobile: '9900112233', email: 'claims@nationalins.com', address: 'Koti, Hyderabad', gstNumber: '36AAACN9999A1Z9', type: 'Insurance' }
];

export const initialVehicles = [
  { _id: 'veh_1', vehicleNumber: 'TS09EP1234', chassisNumber: 'MA3FDB123456789', engineNumber: 'K12M12345', make: 'Maruti Suzuki', model: 'Swift', variant: 'VXI', fuelType: 'Petrol', odometerReading: 45000, customerId: { _id: 'cust_1', name: 'Rahul Sharma' } },
  { _id: 'veh_2', vehicleNumber: 'AP28TV9999', chassisNumber: 'MA3FDB987654321', engineNumber: 'D13A98765', make: 'Hyundai', model: 'i20', variant: 'Asta', fuelType: 'Diesel', odometerReading: 82000, customerId: { _id: 'cust_2', name: 'Mehta Logistics' } }
];

export const initialInventory = [
  { _id: 'inv_1', partName: 'Engine Oil (10W-40)', partNumber: 'SP-ENG-OIL', hsnCode: '27101980', brand: 'Castrol', model: 'Universal', variant: 'All', stockQuantity: 50, lowStockThreshold: 10, purchasePrice: 400, sellingPrice: 600, gstPercent: 18 },
  { _id: 'inv_2', partName: 'Brake Pads (Front)', partNumber: 'SP-BRK-FRT', hsnCode: '87083000', brand: 'Bosch', model: 'Swift / Dzire', variant: 'LXI / VXI', stockQuantity: 15, lowStockThreshold: 5, purchasePrice: 1100, sellingPrice: 1650, gstPercent: 18 },
  { _id: 'inv_3', partName: 'Air Filter', partNumber: 'SP-FIL-AIR', hsnCode: '84213100', brand: 'MGP', model: 'Swift', variant: 'VXI', stockQuantity: 25, lowStockThreshold: 8, purchasePrice: 200, sellingPrice: 320, gstPercent: 18 },
  { _id: 'inv_4', partName: 'Oil Filter', partNumber: 'SP-FIL-OIL', hsnCode: '84212300', brand: 'MGP', model: 'Alto / Swift', variant: 'All', stockQuantity: 30, lowStockThreshold: 8, purchasePrice: 120, sellingPrice: 220, gstPercent: 18 },
  { _id: 'inv_5', partName: 'Gear Box Fluid (80W-90)', partNumber: 'SP-GRB-FLD', hsnCode: '27101980', brand: 'Castrol', model: 'Universal', variant: 'All', stockQuantity: 18, lowStockThreshold: 5, purchasePrice: 300, sellingPrice: 450, gstPercent: 18 },
  { _id: 'inv_6', partName: 'Automatic Transmission Fluid', partNumber: 'SP-ATF-FLD', hsnCode: '27101980', brand: 'Castrol', model: 'Universal', variant: 'All', stockQuantity: 12, lowStockThreshold: 4, purchasePrice: 550, sellingPrice: 800, gstPercent: 18 },
  { _id: 'inv_7', partName: 'Differential Fluid (90W)', partNumber: 'SP-DFF-FLD', hsnCode: '27101980', brand: 'Castrol', model: 'Universal', variant: 'All', stockQuantity: 10, lowStockThreshold: 4, purchasePrice: 320, sellingPrice: 480, gstPercent: 18 },
  { _id: 'inv_8', partName: 'Brake & Clutch Fluid (DOT 4)', partNumber: 'SP-BRK-DOT4', hsnCode: '38190000', brand: 'Bosch', model: 'Universal', variant: 'All', stockQuantity: 22, lowStockThreshold: 6, purchasePrice: 120, sellingPrice: 220, gstPercent: 18 },
  { _id: 'inv_9', partName: 'Power Steering Fluid', partNumber: 'SP-PST-FLD', hsnCode: '27101980', brand: 'Castrol', model: 'Universal', variant: 'All', stockQuantity: 15, lowStockThreshold: 5, purchasePrice: 180, sellingPrice: 290, gstPercent: 18 },
  { _id: 'inv_10', partName: 'Battery Water / Fluid', partNumber: 'SP-BAT-WTR', hsnCode: '28539030', brand: 'Exide', model: 'Universal', variant: 'All', stockQuantity: 60, lowStockThreshold: 15, purchasePrice: 15, sellingPrice: 40, gstPercent: 18 },
  { _id: 'inv_11', partName: 'Windscreen Washer Concentrate', partNumber: 'SP-WSH-CONC', hsnCode: '34022090', brand: '3M', model: 'Universal', variant: 'All', stockQuantity: 45, lowStockThreshold: 10, purchasePrice: 25, sellingPrice: 60, gstPercent: 18 },
  { _id: 'inv_12', partName: 'Coolant Concentrate', partNumber: 'SP-CLT-CONC', hsnCode: '38200000', brand: 'Golden Crux', model: 'Universal', variant: 'All', stockQuantity: 20, lowStockThreshold: 5, purchasePrice: 210, sellingPrice: 350, gstPercent: 18 },
  { _id: 'inv_13', partName: 'Cabin A/C Filter', partNumber: 'SP-FIL-CABIN', hsnCode: '84213100', brand: 'Bosch', model: 'Swift', variant: 'VXI / ZXI', stockQuantity: 15, lowStockThreshold: 5, purchasePrice: 220, sellingPrice: 380, gstPercent: 18 },
  { _id: 'inv_14', partName: 'Fuel Filter Assembly', partNumber: 'SP-FIL-FUEL', hsnCode: '84212300', brand: 'MGP', model: 'Swift Diesel', variant: 'LDI / VDI', stockQuantity: 12, lowStockThreshold: 4, purchasePrice: 310, sellingPrice: 550, gstPercent: 18 },
  { _id: 'inv_15', partName: 'Alternator Fan Belt', partNumber: 'SP-BLT-ALT', hsnCode: '40103190', brand: 'Gates', model: 'Swift', variant: 'All', stockQuantity: 8, lowStockThreshold: 3, purchasePrice: 240, sellingPrice: 450, gstPercent: 18 },
  { _id: 'inv_16', partName: 'Spark Plug (Iridium)', partNumber: 'SP-SPK-IRID', hsnCode: '85111000', brand: 'NGK', model: 'Swift / Dzire', variant: 'VXI', stockQuantity: 40, lowStockThreshold: 12, purchasePrice: 150, sellingPrice: 280, gstPercent: 18 },
  { _id: 'inv_17', partName: 'Suspension Front Bushing Kit', partNumber: 'SP-SUS-BSH', hsnCode: '87088000', brand: 'MGP', model: 'Swift / Dzire', variant: 'All', stockQuantity: 6, lowStockThreshold: 2, purchasePrice: 600, sellingPrice: 1100, gstPercent: 18 },
  { _id: 'inv_18', partName: 'Rubber Mud Flap Set', partNumber: 'SP-MUD-FLAP', hsnCode: '40169990', brand: 'MGP', model: 'Swift', variant: 'All', stockQuantity: 14, lowStockThreshold: 4, purchasePrice: 180, sellingPrice: 320, gstPercent: 18 },
  { _id: 'inv_19', partName: 'Fuel Injector Assembly', partNumber: 'SP-INJ-FUEL', hsnCode: '84099199', brand: 'Bosch', model: 'i20', variant: 'Asta', stockQuantity: 5, lowStockThreshold: 2, purchasePrice: 1800, sellingPrice: 2800, gstPercent: 18 },
  { _id: 'inv_20', partName: 'Headlight Bulb (H4 12V)', partNumber: 'SP-BLB-H4', hsnCode: '85392120', brand: 'Philips', model: 'Universal', variant: 'All', stockQuantity: 30, lowStockThreshold: 8, purchasePrice: 90, sellingPrice: 180, gstPercent: 18 },
  { _id: 'inv_21', partName: 'Tail / Brake Light Bulb', partNumber: 'SP-BLB-TAIL', hsnCode: '85392990', brand: 'Philips', model: 'Universal', variant: 'All', stockQuantity: 25, lowStockThreshold: 5, purchasePrice: 30, sellingPrice: 70, gstPercent: 18 },
  { _id: 'inv_22', partName: 'Turn Signal Indicator Bulb', partNumber: 'SP-BLB-SIG', hsnCode: '85392990', brand: 'Philips', model: 'Universal', variant: 'All', stockQuantity: 25, lowStockThreshold: 5, purchasePrice: 25, sellingPrice: 60, gstPercent: 18 },
  { _id: 'inv_23', partName: 'Premium Wiper Blades Set', partNumber: 'SP-WIP-PREM', hsnCode: '85124000', brand: 'Bosch', model: 'Swift', variant: 'All', stockQuantity: 12, lowStockThreshold: 4, purchasePrice: 280, sellingPrice: 480, gstPercent: 18 },
  { _id: 'inv_24', partName: 'Dual Tone Horn Assembly', partNumber: 'SP-HRN-DUAL', hsnCode: '85123010', brand: 'Hella', model: 'Universal', variant: 'All', stockQuantity: 8, lowStockThreshold: 3, purchasePrice: 350, sellingPrice: 650, gstPercent: 18 },
  { _id: 'inv_25', partName: 'Drive Shaft Dust Cover (CV Boot)', partNumber: 'SP-SHF-BOOT', hsnCode: '40169990', brand: 'MGP', model: 'Swift / Dzire', variant: 'All', stockQuantity: 16, lowStockThreshold: 5, purchasePrice: 140, sellingPrice: 260, gstPercent: 18 }
];

export const initialJobCards = [
  {
    _id: 'jc_1',
    jobCardNo: 'JC-20260619-001',
    date: new Date().toISOString(),
    time: '10:30',
    customerId: { _id: 'cust_1', name: 'Rahul Sharma', mobile: '9949479765', address: 'Plot 45, Jubilee Hills, Hyderabad' },
    vehicleId: { _id: 'veh_1', vehicleNumber: 'TS09EP1234', make: 'Maruti Suzuki', model: 'Swift' },
    odometerReading: 45000,
    serviceType: 'General Servicing',
    workCategory: 'RR',
    jobType: 'Cash Job',
    status: 'Ready for Delivery',
    fuelLevel: '1/2',
    inspectionChecklist: { engineOil: 'OK', gearboxFluid: 'OK', brakeClutchFluid: 'Not OK' },
    accessories: { toolKit: 'Yes', spareWheel: 'Yes' },
    complaints: ['Front bumper damaged', 'Slight brake noise'],
    damageMarkings: [{ x: 150, y: 200, type: 'Scratch', description: 'Left bumper scratch' }],
    advisorNotes: 'Suggest brake pad replacement',
    serviceAdvisorId: { name: 'Demo Advisor' },
    serviceAdvisorName: 'Demo Advisor',
    technicianName: 'Suresh Kumar',
    qcName: 'Anil Kumar',
    floorInchargeName: 'Vikram Singh',
    estAmt: 3500
  },
  {
    _id: 'jc_2',
    jobCardNo: 'JC-20260626-002',
    date: new Date().toISOString(),
    time: '11:15',
    customerId: { _id: 'cust_1', name: 'Rahul Sharma', mobile: '9949479765', address: 'Plot 45, Jubilee Hills, Hyderabad' },
    vehicleId: { _id: 'veh_1', vehicleNumber: 'TS09EP1234', make: 'Maruti Suzuki', model: 'Swift' },
    odometerReading: 45200,
    serviceType: 'Accident Repair',
    workCategory: 'B/P',
    jobType: 'Cash Job',
    status: 'Body Shop',
    fuelLevel: '1/4',
    inspectionChecklist: { engineOil: 'OK', gearboxFluid: 'OK' },
    accessories: { toolKit: 'Yes', spareWheel: 'Yes' },
    complaints: ['Rear panel dent and scratches', 'Bumper misalignment'],
    damageMarkings: [{ x: 300, y: 150, type: 'Dent', description: 'Rear panel dent' }],
    advisorNotes: 'Repair rear dent and repaint panel',
    serviceAdvisorId: { name: 'Demo Advisor' },
    serviceAdvisorName: 'Demo Advisor',
    technicianName: 'Rajesh Patil',
    qcName: 'Anil Kumar',
    floorInchargeName: 'Vikram Singh',
    estAmt: 8500,
    bodyShopDetails: JSON.stringify({
      dentProgress: 40,
      paintProgress: 10,
      chassisProgress: 0,
      glassProgress: 0,
      bumperProgress: 20,
      labourDetails: 'Dent pulling completed, prepping for paint.',
      notes: 'Bumper brackets need correction.'
    })
  },
  {
    _id: 'jc_3',
    jobCardNo: 'JC-20260626-003',
    date: new Date().toISOString(),
    time: '09:00',
    customerId: { _id: 'cust_3', name: 'National Insurance Agency', mobile: '9900112233', address: 'Koti, Hyderabad' },
    vehicleId: { _id: 'veh_2', vehicleNumber: 'AP28TV9999', make: 'Hyundai', model: 'i20' },
    odometerReading: 82500,
    serviceType: 'Accident Repair',
    workCategory: 'Insurance Jobs',
    jobType: 'Insurance Job',
    status: 'Body Shop',
    fuelLevel: '1/2',
    inspectionChecklist: { engineOil: 'OK', gearboxFluid: 'OK' },
    accessories: { toolKit: 'Yes', spareWheel: 'Yes', jack: 'Yes' },
    complaints: ['Front end impact damage', 'Right fender dent', 'Windshield cracked'],
    damageMarkings: [
      { x: 100, y: 120, type: 'Crack', description: 'Front windshield crack' },
      { x: 140, y: 180, type: 'Paint Damage', description: 'Right fender scrape' }
    ],
    advisorNotes: 'Surveyor claim approved. Replace windshield, repair and paint fender.',
    serviceAdvisorId: { name: 'Demo Advisor' },
    serviceAdvisorName: 'Demo Advisor',
    technicianName: 'Suresh Kumar',
    qcName: 'Anil Kumar',
    floorInchargeName: 'Vikram Singh',
    estAmt: 24000,
    bodyShopDetails: JSON.stringify({
      dentProgress: 80,
      paintProgress: 60,
      chassisProgress: 50,
      glassProgress: 100,
      bumperProgress: 90,
      labourDetails: 'Windshield replaced. Fender dent removed, base coat applied.',
      notes: 'Waiting for paint curing.'
    })
  }
];

export const initialEstimates = [
  {
    _id: 'est_1',
    estimateNo: 'EST-20260619-001',
    jobCardId: { _id: 'jc_1', jobCardNo: 'JC-20260619-001', customerId: { _id: 'cust_1', name: 'Rahul Sharma' }, vehicleId: { _id: 'veh_1', vehicleNumber: 'TS09EP1234' } },
    parts: [{ name: 'Engine Oil', qty: 1, rate: 600, gstPercent: 18, total: 708 }],
    labour: [{ description: 'General Labour charges', rate: 1200, gstPercent: 18, total: 1416 }],
    totals: { partsTotal: 600, labourTotal: 1200, gstTotal: 324, grandTotal: 2124 },
    status: 'Approved',
    date: new Date().toISOString()
  }
];

export const initialInvoices = [
  {
    _id: 'inv_1',
    invoiceNo: 'INV-20260619-001',
    jobCardId: 'jc_1',
    estimateId: 'est_1',
    customerId: { _id: 'cust_1', name: 'Rahul Sharma', mobile: '9949479765', address: 'Plot 45, Jubilee Hills, Hyderabad', gstNumber: '36AABCM1234F1Z0' },
    vehicleId: { _id: 'veh_1', vehicleNumber: 'TS09EP1234', make: 'Maruti Suzuki', model: 'Swift' },
    gstDetails: {
      companyGSTIN: '36AAJCM4778P1Z0',
      customerGSTIN: '36AABCM1234F1Z0',
      isInterstate: false
    },
    parts: [
      { partId: 'inv_1', name: 'Engine Oil (10W-40)', partNo: 'SP-ENG-OIL', hsnCode: '27101980', qty: 1, rate: 600, gstPercent: 18, amount: 600, gstAmount: 108, cgstAmount: 54, sgstAmount: 54, total: 708 }
    ],
    labour: [
      { description: 'General Service Labour', rate: 1200, gstPercent: 18, amount: 1200, gstAmount: 216, cgstAmount: 108, sgstAmount: 108, total: 1416 }
    ],
    totals: {
      partsTotal: 600,
      labourTotal: 1200,
      cgstTotal: 162,
      sgstTotal: 162,
      igstTotal: 0,
      gstTotal: 324,
      grandTotal: 2124
    },
    grandTotalWords: 'Rupees Two Thousand One Hundred and Twenty Four Only',
    invoiceType: 'Tax Invoice',
    paymentStatus: 'Paid',
    paymentMethod: 'Cash',
    amountPaid: 2124,
    status: 'Finalized',
    date: new Date().toISOString()
  }
];

export const initialClaims = [
  { _id: 'claim_1', claimNo: 'CLM99082', customerId: { _id: 'cust_1', name: 'Rahul Sharma' }, vehicleId: { _id: 'veh_1', vehicleNumber: 'TS09EP1234' }, insuranceCompany: 'ICICI Lombard', surveyorName: 'K. S. Rao', status: 'Under Review', documents: [] }
];

export const initialAuditLogs = [
  { _id: 'log_1', userName: 'Demo Advisor', userRole: 'Service Advisor', action: 'USER_LOGIN', details: 'User advisor@autoworkshop.com logged in (Offline Demo)', createdAt: new Date().toISOString() },
  { _id: 'log_2', userName: 'Demo Admin', userRole: 'Admin', action: 'JOBCARD_CREATE', details: 'Created Job Card JC-20260619-001', createdAt: new Date().toISOString() }
];
