const PDFDocument = require('pdfkit');
const numberToWords = require('./numberToWords');
const fs = require('fs');
const path = require('path');

// Helper to draw horizontal lines
function drawLine(doc, y) {
  doc.strokeColor('#cccccc')
     .lineWidth(1)
     .moveTo(30, y)
     .lineTo(565, y)
     .stroke();
}

// Helper to draw section header
function drawSectionHeader(doc, title, y) {
  doc.fillColor('#1e293b')
     .rect(30, y, 535, 18)
     .fill();
  doc.fillColor('#ffffff')
     .font('Helvetica-Bold')
     .fontSize(10)
     .text(title, 35, y + 4);
}

// Draw invoice/estimate header
function drawDocumentHeader(doc, title, number, date, isInvoice = false) {
  // Brand Header
  doc.fillColor('#1e293b')
     .font('Helvetica-Bold')
     .fontSize(18)
     .text('MVSS Automobiles Private Limited', 30, 30);
  
  doc.fillColor('#64748b')
     .font('Helvetica')
     .fontSize(8)
     .text('Sy. No. 25/1, Opp. Cine Planet, Beside PSR Convention, Kompally, Hyderabad - 500014.', 30, 50)
     .text('PH. No. 9949479765 | Email: accounts@auto4m.in', 30, 60)
     .text('GSTIN: 36AAJCM4778P1ZI', 30, 70);

  // Document Title & Metadata Box
  doc.rect(400, 30, 165, 50)
     .strokeColor('#1e293b')
     .lineWidth(1.5)
     .stroke();

  doc.fillColor('#1e293b')
     .font('Helvetica-Bold')
     .fontSize(12)
     .text(title, 405, 36, { width: 155, align: 'center' });
  
  doc.fillColor('#334155')
     .font('Helvetica')
     .fontSize(9)
     .text(`No: ${number}`, 405, 52, { width: 155, align: 'center' })
     .text(`Date: ${new Date(date).toLocaleDateString('en-IN')}`, 405, 66, { width: 155, align: 'center' });

  drawLine(doc, 90);
}

// Generate Job Card PDF
function generateJobCardPDF(jobCard, customer, vehicle, stream) {
  const doc = new PDFDocument({ margin: 30, size: 'A4' });
  doc.pipe(stream);

  drawDocumentHeader(doc, 'DIGITAL JOB CARD', jobCard.jobCardNo, jobCard.date);

  // Customer & Vehicle Info Grid
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(10).text('Customer Details', 35, 100);
  
  const getWorkCategoryName = (cat) => {
    if (cat === 'RR') return 'RR (Running repair)';
    if (cat === 'PMS') return 'PMS (Periodical maintenance)';
    if (cat === 'B/P') return 'Body Shop';
    if (cat === 'Insurance Jobs') return 'Insurance';
    if (cat === 'Corporate') return 'Corporate';
    if (cat === 'General Service') return 'General Service';
    return cat || 'N/A';
  };

  doc.font('Helvetica').fontSize(9)
     .text(`Name: ${customer.name}`, 35, 115)
     .text(`Mobile: ${customer.mobile}`, 35, 128)
     .text(`Address: ${customer.address || 'N/A'}`, 35, 141)
     .text(`Contact Person: ${jobCard.contactPerson || 'N/A'}`, 35, 154)
     .text(`Customer Type: ${getWorkCategoryName(jobCard.workCategory)}`, 35, 167);

  doc.font('Helvetica-Bold').text('Vehicle Details', 300, 100);
  doc.font('Helvetica').fontSize(9)
     .text(`Reg No: ${vehicle.vehicleNumber}`, 300, 115)
     .text(`Make & Model: ${vehicle.make} ${vehicle.model}`, 300, 128)
     .text(`Chassis No: ${vehicle.chassisNumber || 'N/A'}`, 300, 141)
     .text(`Engine No: ${vehicle.engineNumber || 'N/A'}`, 300, 154)
     .text(`Odometer Reading: ${jobCard.odometerReading} km`, 300, 167)
     .text(`Fuel Level: ${jobCard.fuelLevel}`, 300, 180);

  drawLine(doc, 195);

  let currentY = 205;

  const checkPageOverflow = (neededHeight) => {
    if (currentY + neededHeight > 750) {
      doc.addPage();
      drawDocumentHeader(doc, 'DIGITAL JOB CARD', jobCard.jobCardNo, jobCard.date);
      currentY = 100;
      return true;
    }
    return false;
  };

  // Format check keys nicely
  const formatKey = (str) => str.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());

  // 1. Accessories Checklist Box
  checkPageOverflow(50);
  drawSectionHeader(doc, 'Accessories checklist & complaints', currentY);
  currentY += 20;

  doc.font('Helvetica-Bold').fontSize(8.5).text('Accessories Provided:', 35, currentY);
  doc.font('Helvetica').fontSize(8);
  let accText = Object.entries(jobCard.accessories || {})
    .filter(([_, v]) => v === 'Yes' || (v && v !== 'No' && v !== '0'))
    .map(([k, v]) => `${formatKey(k)}: ${v}`)
    .join(', ');
  
  const accHeight = doc.heightOfString(accText || 'None recorded', { width: 520 }) + 10;
  doc.text(accText || 'None recorded', 35, currentY + 12, { width: 520 });
  currentY += accHeight + 15;

  // 2. Complaints
  const compLines = (jobCard.complaints && jobCard.complaints.length > 0) ? jobCard.complaints.length : 1;
  const compHeightNeeded = compLines * 12 + 25;
  checkPageOverflow(compHeightNeeded);
  
  doc.font('Helvetica-Bold').fontSize(8.5).text('Customer Complaints:', 35, currentY);
  doc.font('Helvetica').fontSize(8);
  let compY = currentY + 12;
  if (jobCard.complaints && jobCard.complaints.length > 0) {
    jobCard.complaints.forEach((comp, idx) => {
      doc.text(`${idx + 1}. ${comp}`, 35, compY, { width: 520 });
      compY += 12;
    });
  } else {
    doc.text('No complaints registered.', 35, compY);
    compY += 12;
  }
  currentY = compY + 15;

  // 3. Damage Markings
  const damageLines = (jobCard.damageMarkings && jobCard.damageMarkings.length > 0) ? jobCard.damageMarkings.length : 1;
  const damageHeightNeeded = damageLines * 12 + 25;
  checkPageOverflow(damageHeightNeeded);

  doc.font('Helvetica-Bold').fontSize(8.5).text('Reported Damage Markings:', 35, currentY);
  doc.font('Helvetica').fontSize(8);
  let damageText = jobCard.damageMarkings.map(d => `${d.type} (${d.description || 'No notes'})`).join(' | ');
  const dmgTextHeight = doc.heightOfString(damageText || 'No external damage markings recorded.', { width: 520 }) + 10;
  doc.text(damageText || 'No external damage markings recorded.', 35, currentY + 12, { width: 520 });
  currentY += dmgTextHeight + 15;

  // 4. 32 point Checklist summary (Listing items with Yes/No status and remarks)
  checkPageOverflow(40);
  drawSectionHeader(doc, '32 Servicing and Maintenance Checklist', currentY);
  currentY += 20;
  
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#1e293b');
  doc.text('Check Item', 35, currentY);
  doc.text('Status', 200, currentY);
  doc.text('Check Item', 290, currentY);
  doc.text('Status', 460, currentY);
  drawLine(doc, currentY + 10);
  currentY += 15;

  doc.font('Helvetica').fillColor('#000000');
  
  const checklistItems = Object.entries(jobCard.inspectionChecklist || {});
  const midPoint = Math.ceil(checklistItems.length / 2);
  
  for (let i = 0; i < midPoint; i++) {
    const left = checklistItems[i];
    const right = checklistItems[i + midPoint];

    let leftStatus = 'Pending';
    let leftRemarks = '';
    if (left) {
      const val = left[1];
      if (typeof val === 'string') {
        leftStatus = val === 'OK' ? 'Yes' : val === 'Not OK' ? 'No' : (val || 'Pending');
      } else if (val && typeof val === 'object') {
        leftStatus = val.status || 'Pending';
        leftRemarks = val.remarks || '';
      }
    }

    let rightStatus = 'Pending';
    let rightRemarks = '';
    if (right) {
      const val = right[1];
      if (typeof val === 'string') {
        rightStatus = val === 'OK' ? 'Yes' : val === 'Not OK' ? 'No' : (val || 'Pending');
      } else if (val && typeof val === 'object') {
        rightStatus = val.status || 'Pending';
        rightRemarks = val.remarks || '';
      }
    }

    const hasRemarksRow = leftRemarks || rightRemarks;
    const rowHeight = hasRemarksRow ? 22 : 14;

    const overflowed = checkPageOverflow(rowHeight);
    if (overflowed) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#1e293b');
      doc.text('Check Item', 35, currentY);
      doc.text('Status', 200, currentY);
      doc.text('Check Item', 290, currentY);
      doc.text('Status', 460, currentY);
      drawLine(doc, currentY + 10);
      currentY += 15;
      doc.font('Helvetica').fillColor('#000000');
    }

    if (left) {
      doc.fontSize(8).text(formatKey(left[0]), 35, currentY, { width: 160, height: 10, ellipsis: true });
      doc.fillColor(leftStatus === 'No' || leftStatus === 'Not OK' ? '#b91c1c' : leftStatus === 'Yes' || leftStatus === 'OK' ? '#15803d' : '#64748b');
      doc.font('Helvetica-Bold').text(leftStatus, 200, currentY);
      doc.font('Helvetica').fillColor('#000000');
      if (leftRemarks) {
        doc.fillColor('#64748b').fontSize(7.5).text(`* ${leftRemarks}`, 35, currentY + 10, { width: 160, height: 9, ellipsis: true });
        doc.fontSize(8).fillColor('#000000');
      }
    }

    if (right) {
      doc.fontSize(8).text(formatKey(right[0]), 290, currentY, { width: 160, height: 10, ellipsis: true });
      doc.fillColor(rightStatus === 'No' || rightStatus === 'Not OK' ? '#b91c1c' : rightStatus === 'Yes' || rightStatus === 'OK' ? '#15803d' : '#64748b');
      doc.font('Helvetica-Bold').text(rightStatus, 460, currentY);
      doc.font('Helvetica').fillColor('#000000');
      if (rightRemarks) {
        doc.fillColor('#64748b').fontSize(7.5).text(`* ${rightRemarks}`, 290, currentY + 10, { width: 160, height: 9, ellipsis: true });
        doc.fontSize(8).fillColor('#000000');
      }
    }

    currentY += rowHeight;
  }
  currentY += 15;

  // 5. Notes & Remarks (Advisor, Technician, Internal, QC, Est Details)
  checkPageOverflow(40);
  drawSectionHeader(doc, 'Remarks & Workshop Logs', currentY);
  currentY += 20;

  const noteItems = [
    { label: 'Advisor Notes', val: jobCard.advisorNotes },
    { label: 'Technician Notes', val: jobCard.technicianNotes },
    { label: 'Internal Remarks', val: jobCard.internalRemarks },
    { label: 'Technician Remarks', val: jobCard.technicianRemarks },
    { label: 'QC Remarks', val: jobCard.qcRemarks }
  ];

  noteItems.forEach(note => {
    if (note.val) {
      const textHeight = doc.heightOfString(`${note.label}: ${note.val}`, { width: 520 }) + 10;
      checkPageOverflow(textHeight);
      doc.font('Helvetica-Bold').fontSize(8.5).text(`${note.label}:`, 35, currentY);
      doc.font('Helvetica').fontSize(8).text(note.val, 150, currentY, { width: 400 });
      currentY += textHeight - 2;
    }
  });
  currentY += 10;

  // Estimated Work details & QC Status info Box
  checkPageOverflow(85);
  doc.rect(35, currentY, 520, 75).strokeColor('#cccccc').lineWidth(1).stroke();
  
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1e293b').text('Estimated Work details:', 45, currentY + 8);
  doc.font('Helvetica').fontSize(8).fillColor('#000000')
     .text(`Est. Amount: Rs. ${jobCard.estAmt || 0}`, 45, currentY + 22)
     .text(`Promised Date: ${jobCard.promDate ? new Date(jobCard.promDate).toLocaleDateString('en-IN') : 'TBD'}`, 45, currentY + 36)
     .text(`Promised Time: ${jobCard.promTime || 'TBD'}`, 45, currentY + 50);

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1e293b').text('Workshop & QC Status details:', 300, currentY + 8);
  doc.font('Helvetica').fontSize(8).fillColor('#000000')
     .text(`Job Progress: ${jobCard.jobProgress || 0}% Completed`, 300, currentY + 22)
     .text(`QC Status: ${jobCard.qcStatus || 'Pending Inspection'}`, 300, currentY + 36)
     .text(`Est. Completion: ${jobCard.estimatedCompletionDate ? new Date(jobCard.estimatedCompletionDate).toLocaleDateString('en-IN') : 'TBD'}`, 300, currentY + 50);

  currentY += 95;

  // 6. Signatures Section
  checkPageOverflow(65);
  doc.font('Helvetica').fontSize(8.5);
  doc.text('Customer Signature', 50, currentY + 45);
  doc.text('Technician Signature', 230, currentY + 45);
  doc.text('Service Advisor Signature', 415, currentY + 45);

  if (jobCard.signatures && jobCard.signatures.customer) {
    try {
      doc.image(jobCard.signatures.customer, 40, currentY + 5, { width: 80, height: 35 });
    } catch(e) {}
  } else {
    doc.strokeColor('#cccccc').dash(3, {space: 3}).moveTo(30, currentY + 38).lineTo(130, currentY + 38).stroke().undash();
  }

  if (jobCard.signatures && jobCard.signatures.technician) {
    try {
      doc.image(jobCard.signatures.technician, 220, currentY + 5, { width: 80, height: 35 });
    } catch(e) {}
  } else {
    doc.strokeColor('#cccccc').dash(3, {space: 3}).moveTo(210, currentY + 38).lineTo(310, currentY + 38).stroke().undash();
  }
  
  if (jobCard.signatures && jobCard.signatures.advisor) {
    try {
      doc.image(jobCard.signatures.advisor, 430, currentY + 5, { width: 80, height: 35 });
    } catch(e) {}
  } else {
    doc.strokeColor('#cccccc').dash(3, {space: 3}).moveTo(400, currentY + 38).lineTo(500, currentY + 38).stroke().undash();
  }

  doc.end();
}

function drawVerticalLines(doc, yStart, yEnd, gstMode = 'cgst_sgst') {
  let xCoords;
  if (gstMode === 'cgst_sgst') {
    xCoords = [30, 50, 175, 210, 235, 255, 295, 340, 385, 410, 445, 470, 505, 565];
  } else if (gstMode === 'igst') {
    xCoords = [30, 50, 175, 210, 235, 255, 295, 340, 385, 425, 505, 565];
  } else {
    // none mode
    xCoords = [30, 50, 175, 210, 235, 255, 295, 340, 385, 565];
  }
  doc.strokeColor('#cccccc').lineWidth(0.7);
  xCoords.forEach(x => {
    doc.moveTo(x, yStart).lineTo(x, yEnd).stroke();
  });
}

function drawCompanyHeader(doc, title, companyGstin = '36AAJCM4778P1ZI') {
  // Border box of the header starts at x: 30, y: 30, width: 535
  doc.fillColor('#000000')
     .font('Helvetica-Bold')
     .fontSize(11)
     .text('MVSS Automobiles Private Limited', 30, 36, { width: 535, align: 'center' });
     
  doc.font('Helvetica')
     .fontSize(7.5)
     .text('Sy. No. 25/1, Opp. Cine Planet, Beside PSR Convention, Kompally, Hyderabad - 500014.', 30, 48, { width: 535, align: 'center' })
     .text('PH. No. 9949479765 | Email: accounts@auto4m.in', 30, 58, { width: 535, align: 'center' });

  // Line separating Company info and Banner
  doc.strokeColor('#000000').lineWidth(1)
     .moveTo(30, 72).lineTo(565, 72).stroke();

  // Banner with dark background
  doc.fillColor('#1e293b')
     .rect(30, 72, 535, 16)
     .fill();
     
  doc.fillColor('#ffffff')
     .font('Helvetica-Bold')
     .fontSize(9.5)
     .text(title.toUpperCase(), 30, 76, { width: 535, align: 'center' });

  // GSTIN line
  doc.strokeColor('#000000').lineWidth(1)
     .moveTo(30, 88).lineTo(565, 88).stroke();
     
  doc.fillColor('#000000')
     .font('Helvetica-Bold')
     .fontSize(8.5)
     .text(`GSTIN: ${companyGstin}`, 30, 93, { width: 535, align: 'center' });

  // Line separating GSTIN and Customer/Vehicle metadata
  doc.strokeColor('#000000').lineWidth(1)
     .moveTo(30, 105).lineTo(565, 105).stroke();
}

function drawMetadataGrid(doc, y, customer, vehicle, docNo, docDate, isInvoice, invoice) {
  doc.fillColor('#000000').font('Helvetica').fontSize(7.5);
  
  // Left Column Customer Details
  let leftY = y + 5;
  doc.font('Helvetica-Bold').text('Name:', 35, leftY);
  doc.font('Helvetica').text(customer.name || 'N/A', 95, leftY, { width: 195 });
  leftY += 12;
  
  doc.font('Helvetica-Bold').text('Address:', 35, leftY);
  doc.font('Helvetica').text(customer.address || 'N/A', 95, leftY, { width: 195, height: 24, ellipsis: true });
  leftY += 26;
  
  // Only show GSTIN if it exists and is not N/A
  const hasCustGst = customer.gstNumber && customer.gstNumber.trim() !== '' && customer.gstNumber.toUpperCase() !== 'N/A';
  if (hasCustGst) {
    doc.font('Helvetica-Bold').text('GSTIN:', 35, leftY);
    doc.font('Helvetica').text(customer.gstNumber, 95, leftY);
    leftY += 12;
  }
  
  doc.font('Helvetica-Bold').text('Phone:', 35, leftY);
  let phoneStr = customer.mobile || 'N/A';
  if (customer.alternateNumber) phoneStr += `, ${customer.alternateNumber}`;
  doc.font('Helvetica').text(phoneStr, 95, leftY);
  leftY += 12;

  if (isInvoice && invoice && invoice.insuranceClaimDetails) {
    if (invoice.insuranceClaimDetails.insuranceCompany) {
      doc.font('Helvetica-Bold').text('Insurance Co:', 35, leftY);
      doc.font('Helvetica').text(invoice.insuranceClaimDetails.insuranceCompany, 95, leftY, { width: 195, height: 10, ellipsis: true });
      leftY += 12;
    }
    if (invoice.insuranceClaimDetails.claimNo) {
      doc.font('Helvetica-Bold').text('Claim No:', 35, leftY);
      doc.font('Helvetica').text(invoice.insuranceClaimDetails.claimNo, 95, leftY);
      leftY += 12;
    }
  }

  // Right Column Vehicle & Document Details
  let rightY = y + 5;
  const rightXLabel = 302.5;
  const rightXValue = 380;
  
  // Use Estimate No for estimates, Invoice No for invoices
  const docTypeLabel = isInvoice ? 'Invoice No:' : 'Estimate No:';
  doc.font('Helvetica-Bold').text(docTypeLabel, rightXLabel, rightY);
  doc.font('Helvetica').text(docNo, rightXValue, rightY);
  rightY += 12;
  
  if (isInvoice && invoice && invoice.manualInvoiceRef) {
    doc.font('Helvetica-Bold').text('Manual Ref No:', rightXLabel, rightY);
    doc.font('Helvetica').text(invoice.manualInvoiceRef, rightXValue, rightY);
    rightY += 12;
  }
  
  const dateLabel = isInvoice ? 'Invoice Date:' : 'Estimate Date:';
  doc.font('Helvetica-Bold').text(dateLabel, rightXLabel, rightY);
  doc.font('Helvetica').text(new Date(docDate).toLocaleDateString('en-IN'), rightXValue, rightY);
  rightY += 12;
  
  doc.font('Helvetica-Bold').text('Reg No:', rightXLabel, rightY);
  doc.font('Helvetica').text(vehicle.vehicleNumber || 'N/A', rightXValue, rightY);
  rightY += 12;
  
  doc.font('Helvetica-Bold').text('Model & Make:', rightXLabel, rightY);
  doc.font('Helvetica').text(`${vehicle.make || ''} ${vehicle.model || ''}`, rightXValue, rightY, { width: 180 });
  rightY += 12;
  
  // Only show Chassis No if it exists and is not N/A
  const hasChassis = vehicle.chassisNumber && vehicle.chassisNumber.trim() !== '' && vehicle.chassisNumber.toUpperCase() !== 'N/A';
  if (hasChassis) {
    doc.font('Helvetica-Bold').text('Chassis No:', rightXLabel, rightY);
    doc.font('Helvetica').text(vehicle.chassisNumber, rightXValue, rightY);
    rightY += 12;
  }
  
  // Only show Engine No if it exists and is not N/A
  const hasEngine = vehicle.engineNumber && vehicle.engineNumber.trim() !== '' && vehicle.engineNumber.toUpperCase() !== 'N/A';
  if (hasEngine) {
    doc.font('Helvetica-Bold').text('Engine No:', rightXLabel, rightY);
    doc.font('Helvetica').text(vehicle.engineNumber, rightXValue, rightY);
    rightY += 12;
  }
  
  doc.font('Helvetica-Bold').text('Odometer:', rightXLabel, rightY);
  const odo = invoice?.jobCardId?.odometerReading || vehicle.odometerReading || 0;
  doc.font('Helvetica').text(`${odo} km`, rightXValue, rightY);
  rightY += 12;

  // Only show PO Number if it exists and is not N/A
  const hasPo = invoice?.poNumber && invoice.poNumber.trim() !== '' && invoice.poNumber.toUpperCase() !== 'N/A';
  if (hasPo) {
    doc.font('Helvetica-Bold').text('PO Number:', rightXLabel, rightY);
    doc.font('Helvetica').text(invoice.poNumber, rightXValue, rightY);
    rightY += 12;
  }

  // Only show RO Number if it exists and is not N/A
  const roNumber = invoice?.roNumber || invoice?.jobCardId?.jobCardNo;
  const hasRo = roNumber && roNumber.trim() !== '' && roNumber.toUpperCase() !== 'N/A';
  if (hasRo) {
    doc.font('Helvetica-Bold').text('RO Number:', rightXLabel, rightY);
    doc.font('Helvetica').text(roNumber, rightXValue, rightY);
  }

  // Vertical Separator Line between metadata columns
  doc.strokeColor('#000000').lineWidth(1)
     .moveTo(297.5, y).lineTo(297.5, y + 115).stroke();
}

function drawTableHeader(doc, y, gstMode = 'cgst_sgst') {
  doc.fillColor('#f8fafc').rect(30, y, 535, 25).fill();
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(6.5);
  
  doc.text('S.No', 30, y + 9, { width: 20, align: 'center' });
  doc.text('Description', 50, y + 9, { width: 125, align: 'center' });
  doc.text('HSN Code', 175, y + 9, { width: 35, align: 'center' });
  doc.text('UOM', 210, y + 9, { width: 25, align: 'center' });
  doc.text('Qty', 235, y + 9, { width: 20, align: 'center' });
  doc.text('Rate (Rs.)', 255, y + 9, { width: 40, align: 'center' });
  doc.text('Parts Taxable', 295, y + 5, { width: 45, align: 'center' });
  doc.text('Labour Taxable', 340, y + 5, { width: 45, align: 'center' });
  
  if (gstMode === 'cgst_sgst') {
    doc.text('CGST %', 385, y + 9, { width: 25, align: 'center' });
    doc.text('CGST Amt', 410, y + 9, { width: 35, align: 'center' });
    doc.text('SGST %', 445, y + 9, { width: 25, align: 'center' });
    doc.text('SGST Amt', 470, y + 9, { width: 35, align: 'center' });
    doc.text('Total (Rs.)', 505, y + 9, { width: 60, align: 'center' });
  } else if (gstMode === 'igst') {
    doc.text('IGST %', 385, y + 9, { width: 40, align: 'center' });
    doc.text('IGST Amt', 425, y + 9, { width: 80, align: 'center' });
    doc.text('Total (Rs.)', 505, y + 9, { width: 60, align: 'center' });
  } else {
    // none mode
    doc.text('Total (Rs.)', 385, y + 9, { width: 180, align: 'center' });
  }
  
  doc.strokeColor('#000000').lineWidth(1)
     .moveTo(30, y).lineTo(565, y).stroke()
     .moveTo(30, y + 25).lineTo(565, y + 25).stroke();
     
  drawVerticalLines(doc, y, y + 25, gstMode);
}

function drawTableRow(doc, y, index, desc, hsn, uom, qty, rate, partsTaxable, labourTaxable, cgstRate, cgstAmt, sgstRate, sgstAmt, total, gstMode = 'cgst_sgst', igstRate = '', igstAmt = '') {
  doc.fillColor('#000000').font('Helvetica').fontSize(7);
  
  doc.text(index, 30, y + 4, { width: 20, align: 'center' });
  doc.text(desc, 53, y + 4, { width: 119, height: 10, ellipsis: true });
  doc.text(hsn, 175, y + 4, { width: 35, align: 'center' });
  doc.text(uom, 210, y + 4, { width: 25, align: 'center' });
  doc.text(qty, 235, y + 4, { width: 20, align: 'center' });
  doc.text(rate, 255, y + 4, { width: 37, align: 'right' });
  doc.text(partsTaxable, 295, y + 4, { width: 42, align: 'right' });
  doc.text(labourTaxable, 340, y + 4, { width: 42, align: 'right' });
  
  if (gstMode === 'cgst_sgst') {
    doc.text(cgstRate, 385, y + 4, { width: 25, align: 'center' });
    doc.text(cgstAmt, 410, y + 4, { width: 32, align: 'right' });
    doc.text(sgstRate, 445, y + 4, { width: 25, align: 'center' });
    doc.text(sgstAmt, 470, y + 4, { width: 32, align: 'right' });
    doc.text(total, 505, y + 4, { width: 57, align: 'right' });
  } else if (gstMode === 'igst') {
    doc.text(igstRate, 385, y + 4, { width: 40, align: 'center' });
    doc.text(igstAmt, 425, y + 4, { width: 77, align: 'right' });
    doc.text(total, 505, y + 4, { width: 57, align: 'right' });
  } else {
    // none mode
    doc.text(total, 385, y + 4, { width: 177, align: 'right' });
  }
  
  doc.strokeColor('#cccccc').lineWidth(0.7)
     .moveTo(30, y + 16).lineTo(565, y + 16).stroke();
  
  drawVerticalLines(doc, y, y + 16, gstMode);
}

function drawPartsTotalRow(doc, y, taxableSum, cgstSum, sgstSum, totalSum, gstMode = 'cgst_sgst', igstSum = 0) {
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7);
  doc.text('PARTS TOTAL', 53, y + 4, { width: 119 });
  doc.text(taxableSum.toFixed(2), 295, y + 4, { width: 42, align: 'right' });
  
  if (gstMode === 'cgst_sgst') {
    doc.text(cgstSum.toFixed(2), 410, y + 4, { width: 32, align: 'right' });
    doc.text(sgstSum.toFixed(2), 470, y + 4, { width: 32, align: 'right' });
    doc.text(totalSum.toFixed(2), 505, y + 4, { width: 57, align: 'right' });
  } else if (gstMode === 'igst') {
    doc.text(igstSum.toFixed(2), 425, y + 4, { width: 77, align: 'right' });
    doc.text(totalSum.toFixed(2), 505, y + 4, { width: 57, align: 'right' });
  } else {
    // none mode
    doc.text(totalSum.toFixed(2), 385, y + 4, { width: 177, align: 'right' });
  }

  doc.strokeColor('#000000').lineWidth(0.7)
     .moveTo(30, y + 16).lineTo(565, y + 16).stroke();
  drawVerticalLines(doc, y, y + 16, gstMode);
}

function drawLabourTotalRow(doc, y, taxableSum, cgstSum, sgstSum, totalSum, gstMode = 'cgst_sgst', igstSum = 0) {
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7);
  doc.text('LABOUR TOTAL', 53, y + 4, { width: 119 });
  doc.text(taxableSum.toFixed(2), 340, y + 4, { width: 42, align: 'right' });
  
  if (gstMode === 'cgst_sgst') {
    doc.text(cgstSum.toFixed(2), 410, y + 4, { width: 32, align: 'right' });
    doc.text(sgstSum.toFixed(2), 470, y + 4, { width: 32, align: 'right' });
    doc.text(totalSum.toFixed(2), 505, y + 4, { width: 57, align: 'right' });
  } else if (gstMode === 'igst') {
    doc.text(igstSum.toFixed(2), 425, y + 4, { width: 77, align: 'right' });
    doc.text(totalSum.toFixed(2), 505, y + 4, { width: 57, align: 'right' });
  } else {
    // none mode
    doc.text(totalSum.toFixed(2), 385, y + 4, { width: 177, align: 'right' });
  }

  doc.strokeColor('#000000').lineWidth(0.7)
     .moveTo(30, y + 16).lineTo(565, y + 16).stroke();
  drawVerticalLines(doc, y, y + 16, gstMode);
}

function checkPageOverflow(doc, currentY, gstMode = 'cgst_sgst') {
  if (currentY > 730) {
    doc.addPage();
    // draw new page borders
    doc.strokeColor('#000000').lineWidth(1)
       .rect(30, 30, 535, 782).stroke();
     // mini company name header
     doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8.5)
        .text('MVSS Automobiles Private Limited (Continued)', 30, 36, { width: 535, align: 'center' });
    doc.strokeColor('#000000').lineWidth(1)
       .moveTo(30, 50).lineTo(565, 50).stroke();
    
    // redraw table header
    drawTableHeader(doc, 55, gstMode);
    return 80; // new Y coordinate
  }
  return currentY;
}

function drawSummaryBlock(doc, y, totals, isInterstate, grandTotalWords) {
  if (y > 570) {
    doc.addPage();
    doc.strokeColor('#000000').lineWidth(1)
       .rect(30, 30, 535, 782).stroke();
    y = 40;
  }
  
  // Outer border of the summary block (ends at y + 100)
  doc.strokeColor('#000000').lineWidth(1)
     .rect(30, y, 535, 100).stroke();
     
  // Vertical separator line
  doc.moveTo(297.5, y).lineTo(297.5, y + 100).stroke();
  
  const partsBeforeTax = totals.partsTotal || 0;
  const partsCgst = totals.cgstTotalParts || 0;
  const partsSgst = totals.sgstTotalParts || 0;
  const partsIgst = totals.igstTotalParts || 0;
  const partsTaxTotal = partsCgst + partsSgst + partsIgst;
  const partsTotalVal = partsBeforeTax + partsTaxTotal;

  const labourBeforeTax = totals.labourTotal || 0;
  const labourCgst = totals.cgstTotalLabour || 0;
  const labourSgst = totals.sgstTotalLabour || 0;
  const labourIgst = totals.igstTotalLabour || 0;
  const labourTaxTotal = labourCgst + labourSgst + labourIgst;
  const labourTotalVal = labourBeforeTax + labourTaxTotal;

  const discount = totals.discount || 0;
  const totalBeforeDiscount = partsTotalVal + labourTotalVal;
  const grandTotal = totalBeforeDiscount - discount;

  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7.5);
  
  // Left Side PARTS Summary
  doc.text('PARTS SUMMARY', 35, y + 5);
  doc.font('Helvetica').fontSize(7);
  
  let leftY = y + 18;
  doc.text('Total Parts Amount Before Tax:', 35, leftY);
  doc.text(partsBeforeTax.toFixed(2), 220, leftY, { width: 70, align: 'right' });
  leftY += 12;

  if (!isInterstate) {
    doc.text('Add: CGST:', 35, leftY);
    doc.text(partsCgst.toFixed(2), 220, leftY, { width: 70, align: 'right' });
    leftY += 12;
    
    doc.text('Add: SGST:', 35, leftY);
    doc.text(partsSgst.toFixed(2), 220, leftY, { width: 70, align: 'right' });
    leftY += 12;
  } else {
    doc.text('Add: IGST:', 35, leftY);
    doc.text(partsIgst.toFixed(2), 220, leftY, { width: 70, align: 'right' });
    leftY += 15;
  }
  
  doc.text('Total Parts Tax Amount:', 35, leftY);
  doc.text(partsTaxTotal.toFixed(2), 220, leftY, { width: 70, align: 'right' });
  leftY += 16;
  
  doc.font('Helvetica-Bold');
  doc.text('Total Parts Amount After Tax:', 35, leftY);
  doc.text(partsTotalVal.toFixed(2), 220, leftY, { width: 70, align: 'right' });

  // Right Side LABOUR Summary
  doc.font('Helvetica-Bold').fontSize(7.5);
  doc.text('LABOUR SUMMARY', 302.5, y + 5);
  doc.font('Helvetica').fontSize(7);
  
  let rightY = y + 18;
  doc.text('Total Labour Amount Before Tax:', 302.5, rightY);
  doc.text(labourBeforeTax.toFixed(2), 485, rightY, { width: 70, align: 'right' });
  rightY += 12;
  
  if (!isInterstate) {
    doc.text('Add: CGST:', 302.5, rightY);
    doc.text(labourCgst.toFixed(2), 485, rightY, { width: 70, align: 'right' });
    rightY += 12;
    
    doc.text('Add: SGST:', 302.5, rightY);
    doc.text(labourSgst.toFixed(2), 485, rightY, { width: 70, align: 'right' });
    rightY += 12;
  } else {
    doc.text('Add: IGST:', 302.5, rightY);
    doc.text(labourIgst.toFixed(2), 485, rightY, { width: 70, align: 'right' });
    rightY += 15;
  }
  
  doc.text('Total Labour Tax Amount:', 302.5, rightY);
  doc.text(labourTaxTotal.toFixed(2), 485, rightY, { width: 70, align: 'right' });
  rightY += 16;
  
  doc.font('Helvetica-Bold');
  doc.text('Total Labour Amount After Tax:', 302.5, rightY);
  doc.text(labourTotalVal.toFixed(2), 485, rightY, { width: 70, align: 'right' });
  
  y += 100;
  
  // Total Grand Box
  doc.strokeColor('#000000').lineWidth(1)
     .rect(30, y, 535, 30).stroke();
     
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8.5);
  doc.text('TOTAL VALUE:', 35, y + 10);
  
  const roundedGrandTotal = Math.round(grandTotal);
  doc.text(`Rs. ${roundedGrandTotal.toFixed(2)}`, 130, y + 10);
  
  const computedWords = numberToWords(roundedGrandTotal);
  doc.fontSize(7).text(`(${computedWords})`, 220, y + 11, { width: 340, height: 16, ellipsis: true });
  
  y += 30;

  // Discount box if applicable
  if (discount > 0) {
    doc.strokeColor('#000000').lineWidth(1)
       .rect(30, y, 535, 20).stroke();
    doc.fillColor('#dc2626').font('Helvetica-Bold').fontSize(7.5);
    doc.text(`Less: Discount: Rs. ${discount.toFixed(2)}`, 35, y + 6);
    doc.text(`Net Payable: Rs. ${grandTotal.toFixed(2)}`, 302.5, y + 6);
    y += 20;
  }

  // Insurance box mappings
  if (totals.approvedAmount > 0) {
    doc.strokeColor('#000000').lineWidth(1)
       .rect(30, y, 535, 20).stroke();
    doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(7.5);
    doc.text(`Insurance Claim Approved: Rs. ${totals.approvedAmount.toFixed(2)}`, 35, y + 6);
    doc.text(`Customer Net Payable: Rs. ${totals.customerPayableAmount.toFixed(2)}`, 302.5, y + 6);
    y += 20;
  }

  return y;
}

function drawInvoiceFooter(doc, y, isInvoice = false, invoice = null) {
  if (y > 690) {
    doc.addPage();
    doc.strokeColor('#000000').lineWidth(1)
       .rect(30, 30, 535, 782).stroke();
    y = 40;
  }
  
  doc.strokeColor('#000000').lineWidth(1)
     .moveTo(30, y).lineTo(565, y).stroke();
      
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7.5);
  
  if (isInvoice) {
    doc.text('Declaration:', 35, y + 10);
    doc.font('Helvetica').fontSize(6.5).fillColor('#64748b')
       .text('We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.', 35, y + 22, { width: 250 });
    if (invoice) {
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7)
         .text(`Prepared By: ${invoice.preparedBy || 'Staff Incharge'}`, 50, y + 45);
    }
  } else {
    doc.text('Terms & Conditions:', 35, y + 10);
    doc.font('Helvetica').fontSize(6.5).fillColor('#64748b')
       .text('1. All estimates are valid for 15 days only.', 35, y + 22)
       .text('2. Subject to changes in spare parts price at the time of delivery.', 35, y + 32)
       .text('3. Demurrage charges applicable if vehicle not picked up within 3 days of ready alert.', 35, y + 42);
  }
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7.5)
      .text('For MVSS Automobiles Private Limited', 350, y + 10);

  // Draw the admin signature if it exists
  try {
    const signaturePath = path.join(__dirname, '../uploads/admin_signature.png');
    if (fs.existsSync(signaturePath)) {
      doc.image(signaturePath, 390, y + 20, { fit: [90, 36], align: 'center' });
    }
  } catch (sigErr) {
    console.error('Error drawing admin signature on PDF:', sigErr);
  }
       
  doc.strokeColor('#cccccc').dash(2, {space: 2})
     .moveTo(350, y + 60).lineTo(520, y + 60).stroke().undash();
      
  doc.font('Helvetica').fontSize(7)
     .text('Authorized Signatory', 350, y + 65);
      
  doc.strokeColor('#cccccc').dash(2, {space: 2})
     .moveTo(50, y + 60).lineTo(200, y + 60).stroke().undash();
      
  doc.font('Helvetica').fontSize(7).text('Customer Signature', 50, y + 65);
}

// Generate Estimate PDF
function generateEstimatePDF(estimate, customer, vehicle, stream, jobCard) {
  const doc = new PDFDocument({ margin: 30, size: 'A4' });
  doc.pipe(stream);

  // draw Page 1 outer border
  doc.strokeColor('#000000').lineWidth(1)
     .rect(30, 30, 535, 782).stroke();

  // Company and title header
  drawCompanyHeader(doc, 'GST ESTIMATE', '36AAJCM4778P1ZI');

  // Customer & Vehicle metadata
  const docDate = estimate.date || new Date();
  const isInvoice = false;
  drawMetadataGrid(doc, 105, customer, vehicle, estimate.estimateNo, docDate, isInvoice, { jobCardId: jobCard });

  const isInterstate = customer.gstNumber ? !customer.gstNumber.startsWith('36') : false;
  const gstMode = isInterstate ? 'igst' : 'cgst_sgst';

  // Table header
  let y = 220;
  drawTableHeader(doc, y, gstMode);
  y += 25;

  let sNo = 1;
  
  // Calculate dynamic parts and labour GST sums
  let partsTaxableSum = 0;
  let partsCgstSum = 0;
  let partsSgstSum = 0;
  let partsIgstSum = 0;
  let partsTotalSum = 0;

  // Parts List
  if (estimate.parts && estimate.parts.length > 0) {
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7.5);
    doc.text('PARTS', 53, y + 4);
    
    // draw horizontal line at y + 16
    doc.strokeColor('#cccccc').lineWidth(0.7)
       .moveTo(30, y + 16).lineTo(565, y + 16).stroke();
    drawVerticalLines(doc, y, y + 16, gstMode);
    y += 16;
    
    estimate.parts.forEach(part => {
      y = checkPageOverflow(doc, y, gstMode);
      
      const qty = part.qty || 1;
      const rate = part.rate || 0;
      const amount = part.taxableValue !== undefined ? part.taxableValue : (qty * rate);
      const hasGst = part.gstPercent !== undefined && part.gstPercent !== null && part.gstPercent !== '';
      const gstPercent = hasGst ? Number(part.gstPercent) : 0;
      const gstAmount = amount * (gstPercent / 100);
      const total = amount + gstAmount;

      const cgstAmt = gstMode === 'cgst_sgst' ? (gstAmount / 2) : 0;
      const sgstAmt = gstMode === 'cgst_sgst' ? (gstAmount / 2) : 0;
      const igstAmt = gstMode === 'igst' ? gstAmount : 0;
      
      partsTaxableSum += amount;
      partsCgstSum += cgstAmt;
      partsSgstSum += sgstAmt;
      partsIgstSum += igstAmt;
      partsTotalSum += total;

      const cgstRateStr = hasGst ? `${(gstPercent / 2).toFixed(1)}%` : '';
      const cgstAmtStr = hasGst ? cgstAmt.toFixed(2) : '';
      const sgstRateStr = hasGst ? `${(gstPercent / 2).toFixed(1)}%` : '';
      const sgstAmtStr = hasGst ? sgstAmt.toFixed(2) : '';
      const igstRateStr = hasGst ? `${gstPercent.toFixed(1)}%` : '';
      const igstAmtStr = hasGst ? igstAmt.toFixed(2) : '';

      drawTableRow(
        doc,
        y,
        sNo.toString(),
        part.name,
        part.hsnCode || 'N/A',
        part.unit || 'Pcs',
        qty.toString(),
        rate.toFixed(2),
        amount.toFixed(2),
        '',
        cgstRateStr,
        cgstAmtStr,
        sgstRateStr,
        sgstAmtStr,
        total.toFixed(2),
        gstMode,
        igstRateStr,
        igstAmtStr
      );
      y += 16;
      sNo++;
    });

    // Parts Subtotal Row
    y = checkPageOverflow(doc, y, gstMode);
    drawPartsTotalRow(doc, y, partsTaxableSum, partsCgstSum, partsSgstSum, partsTotalSum, gstMode, partsIgstSum);
    y += 16;
  }

  let labourTaxableSum = 0;
  let labourCgstSum = 0;
  let labourSgstSum = 0;
  let labourIgstSum = 0;
  let labourTotalSum = 0;

  // Labour List
  if (estimate.labour && estimate.labour.length > 0) {
    y = checkPageOverflow(doc, y, gstMode);
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7.5);
    doc.text('LABOUR CHARGES', 53, y + 4);
    
    doc.strokeColor('#cccccc').lineWidth(0.7)
       .moveTo(30, y + 16).lineTo(565, y + 16).stroke();
    drawVerticalLines(doc, y, y + 16, gstMode);
    y += 16;

    estimate.labour.forEach(item => {
      y = checkPageOverflow(doc, y, gstMode);
      
      const qty = item.qty || 1;
      const rate = item.rate || 0;
      const amount = item.taxableValue !== undefined ? item.taxableValue : (qty * rate);
      const hasGst = item.gstPercent !== undefined && item.gstPercent !== null && item.gstPercent !== '';
      const gstPercent = hasGst ? Number(item.gstPercent) : 0;
      const gstAmount = amount * (gstPercent / 100);
      const total = amount + gstAmount;

      const cgstAmt = gstMode === 'cgst_sgst' ? (gstAmount / 2) : 0;
      const sgstAmt = gstMode === 'cgst_sgst' ? (gstAmount / 2) : 0;
      const igstAmt = gstMode === 'igst' ? gstAmount : 0;

      labourTaxableSum += amount;
      labourCgstSum += cgstAmt;
      labourSgstSum += sgstAmt;
      labourIgstSum += igstAmt;
      labourTotalSum += total;

      const cgstRateStr = hasGst ? `${(gstPercent / 2).toFixed(1)}%` : '';
      const cgstAmtStr = hasGst ? cgstAmt.toFixed(2) : '';
      const sgstRateStr = hasGst ? `${(gstPercent / 2).toFixed(1)}%` : '';
      const sgstAmtStr = hasGst ? sgstAmt.toFixed(2) : '';
      const igstRateStr = hasGst ? `${gstPercent.toFixed(1)}%` : '';
      const igstAmtStr = hasGst ? igstAmt.toFixed(2) : '';

      drawTableRow(
        doc,
        y,
        sNo.toString(),
        item.description,
        '998729',
        'ACT',
        qty.toString(),
        rate.toFixed(2),
        '',
        amount.toFixed(2),
        cgstRateStr,
        cgstAmtStr,
        sgstRateStr,
        sgstAmtStr,
        total.toFixed(2),
        gstMode,
        igstRateStr,
        igstAmtStr
      );
      y += 16;
      sNo++;
    });

    // Labour Subtotal Row
    y = checkPageOverflow(doc, y, gstMode);
    drawLabourTotalRow(doc, y, labourTaxableSum, labourCgstSum, labourSgstSum, labourTotalSum, gstMode, labourIgstSum);
    y += 16;
  }

  // Draw vertical line borders to close the table cells bottom
  doc.strokeColor('#000000').lineWidth(1)
     .moveTo(30, y).lineTo(565, y).stroke();

  // Calculate gross parts and labour discount
  const partsGross = (estimate.parts || []).reduce((sum, p) => sum + (p.qty * p.rate), 0);
  const labourGross = (estimate.labour || []).reduce((sum, l) => sum + (l.rate), 0);
  const partsDiscount = (estimate.parts || []).reduce((sum, p) => sum + (p.discount || 0), 0);
  const labourDiscount = (estimate.labour || []).reduce((sum, l) => sum + (l.discount || 0), 0);
  const discountAmount = partsDiscount + labourDiscount;
  
  // Summary box totals representation using gross values
  const summaryTotals = {
    partsTotal: partsGross,
    labourTotal: labourGross,
    cgstTotalParts: partsCgstSum,
    sgstTotalParts: partsSgstSum,
    igstTotalParts: partsIgstSum,
    gstTotalParts: partsCgstSum + partsSgstSum + partsIgstSum,
    cgstTotalLabour: labourCgstSum,
    sgstTotalLabour: labourSgstSum,
    igstTotalLabour: labourIgstSum,
    gstTotalLabour: labourCgstSum + labourSgstSum + labourIgstSum,
    discount: discountAmount,
    grandTotal: partsTaxableSum + partsCgstSum + partsSgstSum + partsIgstSum + labourTaxableSum + labourCgstSum + labourSgstSum + labourIgstSum
  };
  
  const grandTotalWords = numberToWords(summaryTotals.grandTotal);

  y = drawSummaryBlock(doc, y, summaryTotals, isInterstate, grandTotalWords);
  drawInvoiceFooter(doc, y, false);

  doc.end();
}

// Generate GST Tax Invoice PDF
function generateInvoicePDF(invoice, customer, vehicle, stream) {
  const doc = new PDFDocument({ margin: 30, size: 'A4' });
  doc.pipe(stream);

  // Page 1 border
  doc.strokeColor('#000000').lineWidth(1)
     .rect(30, 30, 535, 782).stroke();

  const isInterstate = invoice.gstDetails.isInterstate || false;
  const hasGst = customer.gstNumber && customer.gstNumber.trim() !== '';

  const docTitle = invoice.invoiceType ? invoice.invoiceType.toUpperCase() : 'TAX INVOICE';
  drawCompanyHeader(doc, docTitle, '36AAJCM4778P1ZI');

  // Customer & Vehicle metadata
  const docDate = invoice.date || new Date();
  drawMetadataGrid(doc, 105, customer, vehicle, invoice.invoiceNo, docDate, true, invoice);

  // Table header
  let y = 220;
  drawTableHeader(doc, y);
  y += 25;

  let sNo = 1;
  
  // Calculate dynamic parts and labour GST sums
  let partsTaxableSum = 0;
  let partsCgstSum = 0;
  let partsSgstSum = 0;
  let partsIgstSum = 0;
  let partsTotalSum = 0;

  // Parts List
  if (invoice.parts && invoice.parts.length > 0) {
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7.5);
    doc.text('PARTS', 53, y + 4);
    
    // draw horizontal line at y + 16
    doc.strokeColor('#cccccc').lineWidth(0.7)
       .moveTo(30, y + 16).lineTo(565, y + 16).stroke();
    drawVerticalLines(doc, y, y + 16);
    y += 16;
    
    invoice.parts.forEach(part => {
      y = checkPageOverflow(doc, y);
      
      const qty = part.qty || 1;
      const rate = part.rate || 0;
      const amount = part.amount || (qty * rate);
      const gstPercent = part.gstPercent || 0;
      const gstAmount = part.gstAmount || (hasGst ? (amount * (gstPercent / 100)) : 0);
      const total = part.total || (amount + gstAmount);

      const cgstAmt = part.cgstAmount || (isInterstate ? 0 : (gstAmount / 2));
      const sgstAmt = part.sgstAmount || (isInterstate ? 0 : (gstAmount / 2));
      const igstAmt = part.igstAmount || (isInterstate ? gstAmount : 0);
      
      partsTaxableSum += amount;
      partsCgstSum += cgstAmt;
      partsSgstSum += sgstAmt;
      partsIgstSum += igstAmt;
      partsTotalSum += total;

      let cgstRateStr, sgstRateStr;
      if (!hasGst) {
        cgstRateStr = 'N/A';
        sgstRateStr = 'N/A';
      } else if (isInterstate) {
        cgstRateStr = '0%';
        sgstRateStr = '0%';
      } else {
        cgstRateStr = `${(gstPercent / 2).toFixed(1)}%`;
        sgstRateStr = `${(gstPercent / 2).toFixed(1)}%`;
      }

      drawTableRow(
        doc,
        y,
        sNo.toString(),
        part.name,
        part.hsnCode || 'N/A',
        'NOS',
        qty.toString(),
        rate.toFixed(2),
        amount.toFixed(2),
        '',
        cgstRateStr,
        cgstAmt.toFixed(2),
        sgstRateStr,
        sgstAmt.toFixed(2),
        total.toFixed(2)
      );
      y += 16;
      sNo++;
    });

    // Parts Subtotal Row
    y = checkPageOverflow(doc, y);
    drawPartsTotalRow(doc, y, partsTaxableSum, partsCgstSum, partsSgstSum, partsTotalSum);
    y += 16;
  }

  let labourTaxableSum = 0;
  let labourCgstSum = 0;
  let labourSgstSum = 0;
  let labourIgstSum = 0;
  let labourTotalSum = 0;

  // Labour List
  if (invoice.labour && invoice.labour.length > 0) {
    y = checkPageOverflow(doc, y);
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7.5);
    doc.text('LABOUR CHARGES', 53, y + 4);
    
    doc.strokeColor('#cccccc').lineWidth(0.7)
       .moveTo(30, y + 16).lineTo(565, y + 16).stroke();
    drawVerticalLines(doc, y, y + 16);
    y += 16;

    invoice.labour.forEach(item => {
      y = checkPageOverflow(doc, y);
      
      const qty = item.qty || 1;
      const rate = item.rate || 0;
      const amount = item.amount || (qty * rate);
      const gstPercent = item.gstPercent || 0;
      const gstAmount = item.gstAmount || (hasGst ? (amount * (gstPercent / 100)) : 0);
      const total = item.total || (amount + gstAmount);

      const cgstAmt = item.cgstAmount || (isInterstate ? 0 : (gstAmount / 2));
      const sgstAmt = item.sgstAmount || (isInterstate ? 0 : (gstAmount / 2));
      const igstAmt = item.igstAmount || (isInterstate ? gstAmount : 0);

      labourTaxableSum += amount;
      labourCgstSum += cgstAmt;
      labourSgstSum += sgstAmt;
      labourIgstSum += igstAmt;
      labourTotalSum += total;

      let cgstRateStr, sgstRateStr;
      if (!hasGst) {
        cgstRateStr = 'N/A';
        sgstRateStr = 'N/A';
      } else if (isInterstate) {
        cgstRateStr = '0%';
        sgstRateStr = '0%';
      } else {
        cgstRateStr = `${(gstPercent / 2).toFixed(1)}%`;
        sgstRateStr = `${(gstPercent / 2).toFixed(1)}%`;
      }

      drawTableRow(
        doc,
        y,
        sNo.toString(),
        item.description,
        '998729',
        'ACT',
        qty.toString(),
        rate.toFixed(2),
        '',
        amount.toFixed(2),
        cgstRateStr,
        cgstAmt.toFixed(2),
        sgstRateStr,
        sgstAmt.toFixed(2),
        total.toFixed(2)
      );
      y += 16;
      sNo++;
    });

    // Labour Subtotal Row
    y = checkPageOverflow(doc, y);
    drawLabourTotalRow(doc, y, labourTaxableSum, labourCgstSum, labourSgstSum, labourTotalSum);
    y += 16;
  }

  // Draw vertical line borders to close the table cells bottom
  doc.strokeColor('#000000').lineWidth(1)
     .moveTo(30, y).lineTo(565, y).stroke();

  // Calculate discount from invoice totals
  const discountAmount = invoice.totals.discount || 0;

  // Summary box totals representation
  const summaryTotals = {
    partsTotal: partsTaxableSum,
    labourTotal: labourTaxableSum,
    cgstTotalParts: partsCgstSum,
    sgstTotalParts: partsSgstSum,
    igstTotalParts: partsIgstSum,
    gstTotalParts: partsCgstSum + partsSgstSum + partsIgstSum,
    cgstTotalLabour: labourCgstSum,
    sgstTotalLabour: labourSgstSum,
    igstTotalLabour: labourIgstSum,
    gstTotalLabour: labourCgstSum + labourSgstSum + labourIgstSum,
    discount: discountAmount,
    grandTotal: invoice.totals.roundedGrandTotal || invoice.totals.grandTotal,
    approvedAmount: invoice.insuranceClaimDetails?.approvedAmount || 0,
    customerPayableAmount: invoice.insuranceClaimDetails?.customerPayableAmount || invoice.totals.roundedGrandTotal || invoice.totals.grandTotal
  };
  
  const grandTotalWords = invoice.grandTotalWords || numberToWords(invoice.totals.roundedGrandTotal || invoice.totals.grandTotal);

  y = drawSummaryBlock(doc, y, summaryTotals, isInterstate, grandTotalWords);
  drawInvoiceFooter(doc, y, true, invoice);

  doc.end();
}

// Generate Gate Pass PDF
function generateGatePassPDF(docData, customer, vehicle, stream) {
  const doc = new PDFDocument({ margin: 30, size: 'A4' });
  doc.pipe(stream);

  // Page 1 border
  doc.strokeColor('#000000').lineWidth(1)
     .rect(30, 30, 535, 782).stroke();

  // Company Header
  drawCompanyHeader(doc, 'VEHICLE GATE EXIT PASS', '36AAJCM4778P1ZI');

  // Metadata / Details Table Grid
  let y = 115;
  doc.strokeColor('#000000').lineWidth(1)
     .rect(30, y, 535, 230).stroke();

  // Vertical separator
  doc.moveTo(200, y).lineTo(200, y + 230).stroke();

  const isInvoice = docData.invoiceNo !== undefined;
  const gpNo = isInvoice ? `GP-${docData.invoiceNo}` : `GP-${docData.jobCardNo}`;
  const refNo = isInvoice ? docData.invoiceNo : docData.jobCardNo;
  const refType = isInvoice ? 'Reference Invoice:' : 'Reference Job Card:';
  
  const dateStr = new Date(docData.date || new Date()).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
  const timeStr = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit'
  });

  const fields = [
    { label: 'Gate Pass Number:', value: gpNo, isBold: true },
    { label: 'Date & Time:', value: `${dateStr} | ${timeStr}` },
    { label: refType, value: refNo, isBold: true },
    { label: 'Customer Name:', value: customer.name || 'N/A' },
    { label: 'Contact Phone:', value: customer.mobile || 'N/A' },
    { label: 'Vehicle Number:', value: vehicle.vehicleNumber || 'N/A', isBold: true },
    { label: 'Vehicle Model & Make:', value: `${vehicle.make || ''} ${vehicle.model || ''}` },
    { label: 'Odometer Reading:', value: `${docData.odometerReading || vehicle.odometerReading || 0} km` },
    { label: 'Service Advisor:', value: docData.serviceAdvisorName || 'Demo Advisor' }
  ];

  fields.forEach((f, idx) => {
    let rowY = y + (idx * 25) + 5;
    
    // Label (left column)
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8.5);
    doc.text(f.label, 45, rowY);
    
    // Value (right column)
    doc.font(f.isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    doc.text(f.value, 215, rowY);

    if (idx < fields.length - 1) {
      doc.strokeColor('#cccccc').lineWidth(0.5)
         .moveTo(30, y + ((idx + 1) * 25)).lineTo(565, y + ((idx + 1) * 25)).stroke();
    }
  });

  y += 230;

  // Status Box
  doc.strokeColor('#000000').lineWidth(1)
     .rect(30, y + 20, 535, 40).stroke();

  doc.fillColor('#15803d')
     .rect(31, y + 21, 533, 38)
     .fill();

  doc.fillColor('#ffffff')
     .font('Helvetica-Bold')
     .fontSize(10)
     .text('RELEASED - PAYMENT RECEIVED & VEHICLE DELIVERED', 30, y + 35, { width: 535, align: 'center' });

  y += 90;

  // Signatures Section
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8.5);
  doc.text('Customer Signature', 50, y + 100);
  doc.text('Security Sign-off', 240, y + 100);
  doc.text('Authorized Signatory', 415, y + 100);

  // Draw the admin signature if it exists
  try {
    const signaturePath = path.join(__dirname, '../uploads/admin_signature.png');
    if (fs.existsSync(signaturePath)) {
      doc.image(signaturePath, 430, y + 55, { fit: [80, 30], align: 'center' });
    }
  } catch (sigErr) {
    console.error('Error drawing admin signature on Gate Pass PDF:', sigErr);
  }

  doc.strokeColor('#cccccc').dash(2, {space: 2})
     .moveTo(50, y + 90).lineTo(170, y + 90).stroke()
     .moveTo(230, y + 90).lineTo(350, y + 90).stroke()
     .moveTo(410, y + 90).lineTo(530, y + 90).stroke()
     .undash();

  doc.end();
}

function drawCustomerVerticalLines(doc, yStart, yEnd) {
  const xCoords = [30, 60, 390, 420, 480, 565];
  doc.strokeColor('#cccccc').lineWidth(0.7);
  xCoords.forEach(x => {
    doc.moveTo(x, yStart).lineTo(x, yEnd).stroke();
  });
}

function drawCustomerTableRow(doc, y, index, desc, qty, unitPrice, total) {
  doc.fillColor('#000000').font('Helvetica').fontSize(8);
  
  doc.text(index, 30, y + 4, { width: 30, align: 'center' });
  doc.text(desc, 65, y + 4, { width: 320, height: 10, ellipsis: true });
  doc.text(qty, 390, y + 4, { width: 30, align: 'center' });
  doc.text(unitPrice, 420, y + 4, { width: 55, align: 'right' });
  doc.text(total, 480, y + 4, { width: 80, align: 'right' });
  
  doc.strokeColor('#cccccc').lineWidth(0.7)
     .moveTo(30, y + 16).lineTo(565, y + 16).stroke();
  
  drawCustomerVerticalLines(doc, y, y + 16);
}

function checkCustomerPageOverflow(doc, currentY) {
  if (currentY > 730) {
    doc.addPage();
    doc.strokeColor('#000000').lineWidth(1)
       .rect(30, 30, 535, 782).stroke();
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8.5)
       .text('MVSS Automobiles Private Limited (Continued)', 30, 36, { width: 535, align: 'center' });
    doc.strokeColor('#000000').lineWidth(1)
       .moveTo(30, 50).lineTo(565, 50).stroke();
    
    drawCustomerTableHeader(doc, 55);
    return 80;
  }
  return currentY;
}

function drawCustomerTableHeader(doc, y) {
  doc.fillColor('#f8fafc').rect(30, y, 535, 25).fill();
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8);
  
  doc.text('S.No', 30, y + 9, { width: 30, align: 'center' });
  doc.text('Description', 65, y + 9, { width: 320, align: 'left' });
  doc.text('Qty', 390, y + 9, { width: 30, align: 'center' });
  doc.text('Unit Price (Rs.)', 420, y + 9, { width: 55, align: 'right' });
  doc.text('Line Total (Rs.)', 480, y + 9, { width: 80, align: 'right' });
  
  doc.strokeColor('#000000').lineWidth(1)
     .moveTo(30, y).lineTo(565, y).stroke()
     .moveTo(30, y + 25).lineTo(565, y + 25).stroke();
       
  drawCustomerVerticalLines(doc, y, y + 25);
}

function drawCustomerCompanyHeader(doc, title) {
  doc.fillColor('#000000')
     .font('Helvetica-Bold')
     .fontSize(11)
     .text('MVSS Automobiles Private Limited', 30, 36, { width: 535, align: 'center' });
     
  doc.font('Helvetica')
     .fontSize(7)
     .text('Sy. No. 25/1, Opp. Cine Planet, Beside PSR Convention, Kompally, Hyderabad - 500014.', 30, 50, { width: 535, align: 'center' })
     .text('PH. No. 9949479765 | Email: accounts@auto4m.in', 30, 60, { width: 535, align: 'center' });

  // Draw title box below company info
  doc.fillColor('#f1f5f9').rect(30, 72, 535, 20).fill();
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9)
     .text(title, 30, 78, { width: 535, align: 'center' });
     
  doc.strokeColor('#000000').lineWidth(1)
     .moveTo(30, 72).lineTo(565, 72).stroke()
     .moveTo(30, 92).lineTo(565, 92).stroke();
}

function drawCustomerMetadataGrid(doc, y, customer, vehicle, docNo, docDate, estimate) {
  doc.fillColor('#000000').font('Helvetica').fontSize(8);
  
  // Left Column Customer Details
  let leftY = y + 5;
  doc.font('Helvetica-Bold').text('Name:', 35, leftY);
  doc.font('Helvetica').text(customer.name || 'N/A', 95, leftY, { width: 195 });
  leftY += 14;
  
  doc.font('Helvetica-Bold').text('Address:', 35, leftY);
  doc.font('Helvetica').text(customer.address || 'N/A', 95, leftY, { width: 195, height: 28, ellipsis: true });
  leftY += 30;
  
  doc.font('Helvetica-Bold').text('Phone:', 35, leftY);
  let phoneStr = customer.mobile || 'N/A';
  if (customer.alternateNumber) phoneStr += `, ${customer.alternateNumber}`;
  doc.font('Helvetica').text(phoneStr, 95, leftY);
  
  leftY += 14;
  doc.font('Helvetica-Bold').text('Advisor:', 35, leftY);
  doc.font('Helvetica').text(estimate.serviceAdvisorName || 'N/A', 95, leftY);

  // Right Column Vehicle Details
  let rightY = y + 5;
  const rightXLabel = 302.5;
  const rightXValue = 380;
  
  doc.font('Helvetica-Bold').text('Estimate No:', rightXLabel, rightY);
  doc.font('Helvetica').text(docNo, rightXValue, rightY);
  rightY += 14;
  
  doc.font('Helvetica-Bold').text('Date:', rightXLabel, rightY);
  doc.font('Helvetica').text(new Date(docDate).toLocaleDateString('en-IN'), rightXValue, rightY);
  rightY += 14;
  
  doc.font('Helvetica-Bold').text('Reg No:', rightXLabel, rightY);
  doc.font('Helvetica').text(vehicle.vehicleNumber || 'N/A', rightXValue, rightY);
  rightY += 14;
  
  doc.font('Helvetica-Bold').text('Model & Make:', rightXLabel, rightY);
  doc.font('Helvetica').text(`${vehicle.make || ''} ${vehicle.model || ''}`, rightXValue, rightY, { width: 180 });
  rightY += 14;
  
  doc.font('Helvetica-Bold').text('Chassis No:', rightXLabel, rightY);
  doc.font('Helvetica').text(vehicle.chassisNumber || 'N/A', rightXValue, rightY);
  rightY += 14;
  
  doc.font('Helvetica-Bold').text('Engine No:', rightXLabel, rightY);
  doc.font('Helvetica').text(vehicle.engineNumber || 'N/A', rightXValue, rightY);
  rightY += 14;
  
  doc.font('Helvetica-Bold').text('Odometer:', rightXLabel, rightY);
  const odo = vehicle.odometerReading || 0;
  doc.font('Helvetica').text(`${odo} km`, rightXValue, rightY);

  // Vertical Separator Line between metadata columns
  doc.strokeColor('#000000').lineWidth(1)
     .moveTo(297.5, y).lineTo(297.5, y + 115).stroke();
}

function drawCustomerSummaryBlock(doc, y, totals, grandTotalWords) {
  if (y > 580) {
    doc.addPage();
    doc.strokeColor('#000000').lineWidth(1)
       .rect(30, 30, 535, 782).stroke();
    y = 40;
  }
  
  // Outer border of the summary block (ends at y + 60)
  doc.strokeColor('#000000').lineWidth(1)
     .rect(30, y, 535, 60).stroke();
     
  // Vertical separator line
  doc.moveTo(297.5, y).lineTo(297.5, y + 60).stroke();
  
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8.5);
  
  // Left Side Summary
  doc.text('PARTS TOTAL (INCL. TAXES):', 35, y + 15);
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text(`Rs. ${totals.partsTotalSum.toFixed(2)}`, 35, y + 32);
  
  // Right Side Summary
  doc.font('Helvetica-Bold').fontSize(8.5);
  doc.text('LABOUR TOTAL (INCL. TAXES):', 302.5, y + 15);
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text(`Rs. ${totals.labourTotalSum.toFixed(2)}`, 302.5, y + 32);
  
  y += 60;
  
  // Total Grand Box
  doc.strokeColor('#000000').lineWidth(1)
     .rect(30, y, 535, 30).stroke();
     
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9.5);
  doc.text('CUSTOMER GRAND TOTAL:', 35, y + 10);
  
  const roundedGrandTotal = Math.round(totals.grandTotal);
  doc.text(`Rs. ${roundedGrandTotal.toFixed(2)}`, 200, y + 10);
  doc.fontSize(7.5).text(`(${grandTotalWords})`, 290, y + 11, { width: 270, height: 16, ellipsis: true });
  
  return y + 30;
}

function generateCustomerEstimatePDF(estimate, customer, vehicle, stream) {
  const doc = new PDFDocument({ margin: 30, size: 'A4' });
  doc.pipe(stream);

  // draw outer border
  doc.strokeColor('#000000').lineWidth(1)
     .rect(30, 30, 535, 782).stroke();

  // Company and title header
  drawCustomerCompanyHeader(doc, 'CUSTOMER ESTIMATION');

  // Customer & Vehicle metadata
  const docDate = estimate.date || new Date();
  drawCustomerMetadataGrid(doc, 105, customer, vehicle, estimate.estimateNo, docDate, estimate);

  // Table header
  let y = 220;
  drawCustomerTableHeader(doc, y);
  y += 25;

  let sNo = 1;
  let partsTotalSum = 0;

  // Parts List
  if (estimate.parts && estimate.parts.length > 0) {
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8);
    doc.text('PARTS', 53, y + 4);
    
    doc.strokeColor('#cccccc').lineWidth(0.7)
       .moveTo(30, y + 16).lineTo(565, y + 16).stroke();
    drawCustomerVerticalLines(doc, y, y + 16);
    y += 16;
    
    estimate.parts.forEach(part => {
      y = checkCustomerPageOverflow(doc, y);
      
      const qty = part.qty || 1;
      const rate = part.rate || 0;
      const amount = part.taxableValue !== undefined ? part.taxableValue : (part.amount !== undefined ? part.amount : (qty * rate));
      const gstAmount = part.gstAmount || (amount * (part.gstPercent / 100));
      const total = part.total || (amount + gstAmount);
      
      partsTotalSum += total;

      // Inclusive Net Unit Price: Total line amount / quantity
      const inclusiveUnitPrice = total / qty;

      drawCustomerTableRow(
        doc,
        y,
        sNo.toString(),
        part.name,
        qty.toString(),
        inclusiveUnitPrice.toFixed(2),
        total.toFixed(2)
      );
      y += 16;
      sNo++;
    });

    // Parts Subtotal Row
    y = checkCustomerPageOverflow(doc, y);
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8);
    doc.text('PARTS TOTAL', 53, y + 4, { width: 225 });
    doc.text(partsTotalSum.toFixed(2), 480, y + 4, { width: 80, align: 'right' });
    doc.strokeColor('#000000').lineWidth(0.7)
       .moveTo(30, y + 16).lineTo(565, y + 16).stroke();
    drawCustomerVerticalLines(doc, y, y + 16);
    y += 16;
  }

  let labourTotalSum = 0;

  // Labour List
  if (estimate.labour && estimate.labour.length > 0) {
    y = checkCustomerPageOverflow(doc, y);
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8);
    doc.text('LABOUR CHARGES', 53, y + 4);
    
    doc.strokeColor('#cccccc').lineWidth(0.7)
       .moveTo(30, y + 16).lineTo(565, y + 16).stroke();
    drawCustomerVerticalLines(doc, y, y + 16);
    y += 16;

    estimate.labour.forEach(item => {
      y = checkCustomerPageOverflow(doc, y);
      
      const qty = item.qty || 1;
      const rate = item.rate || 0;
      const amount = item.taxableValue !== undefined ? item.taxableValue : (item.amount !== undefined ? item.amount : (qty * rate));
      const gstAmount = item.gstAmount || (amount * (item.gstPercent / 100));
      const total = item.total || (amount + gstAmount);

      labourTotalSum += total;

      // Inclusive Net Unit Price: Total line amount / quantity
      const inclusiveUnitPrice = total / qty;

      drawCustomerTableRow(
        doc,
        y,
        sNo.toString(),
        item.description,
        qty.toString(),
        inclusiveUnitPrice.toFixed(2),
        total.toFixed(2)
      );
      y += 16;
      sNo++;
    });

    // Labour Subtotal Row
    y = checkCustomerPageOverflow(doc, y);
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8);
    doc.text('LABOUR TOTAL', 53, y + 4, { width: 225 });
    doc.text(labourTotalSum.toFixed(2), 480, y + 4, { width: 80, align: 'right' });
    doc.strokeColor('#000000').lineWidth(0.7)
       .moveTo(30, y + 16).lineTo(565, y + 16).stroke();
    drawCustomerVerticalLines(doc, y, y + 16);
    y += 16;
  }

  // Draw bottom border to close the table cells
  doc.strokeColor('#000000').lineWidth(1)
     .moveTo(30, y).lineTo(565, y).stroke();

  const summaryTotals = {
    partsTotalSum,
    labourTotalSum,
    grandTotal: estimate.totals.grandTotal
  };
  
  const grandTotalWords = numberToWords(estimate.totals.grandTotal);

  y = drawCustomerSummaryBlock(doc, y, summaryTotals, grandTotalWords);
  drawInvoiceFooter(doc, y, false);

  doc.end();
}

module.exports = {
  generateJobCardPDF,
  generateEstimatePDF,
  generateCustomerEstimatePDF,
  generateInvoicePDF,
  generateGatePassPDF,
};
