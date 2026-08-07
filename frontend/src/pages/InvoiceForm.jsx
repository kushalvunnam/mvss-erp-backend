import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { Save, ShoppingBag, ShieldCheck, Scale, Receipt, Plus, Trash2, Activity, ShoppingCart } from 'lucide-react';
import { calculatePricing } from '../utils/pricingEngine';

const STANDARD_SERVICES = [
  { description: 'General Servicing', rate: 1500, gstPercent: 18 },
  { description: 'Engine Tuning', rate: 1200, gstPercent: 18 },
  { description: 'Clutch Overhaul', rate: 2800, gstPercent: 18 },
  { description: 'Brake System Overhaul', rate: 900, gstPercent: 18 },
  { description: 'Front Bumper Repair & Painting', rate: 3500, gstPercent: 18 },
  { description: 'Rear Bumper Repair & Painting', rate: 3500, gstPercent: 18 },
  { description: 'Wheel Alignment & Balancing', rate: 800, gstPercent: 18 },
  { description: 'A/C Evaporator Cleaning', rate: 1800, gstPercent: 18 },
  { description: 'Water Wash & Full Vacuum', rate: 600, gstPercent: 18 },
  { description: 'Suspension Check & Repair', rate: 2200, gstPercent: 18 }
];

const checkAddressIsInterstate = (address) => {
  if (!address) return false;
  const addr = address.toLowerCase();
  if (addr.includes('telangana') || addr.includes('hyderabad') || addr.includes('secunderabad')) {
    return false;
  }
  const otherStates = [
    'andhra', 'karnataka', 'maharashtra', 'bangalore', 'mumbai', 'pune', 'delhi', 
    'tamil nadu', 'chennai', 'kerala', 'goa', 'gujarat', 'rajasthan', 'madhya pradesh',
    'ap', 'ka', 'mh', 'dl', 'tn'
  ];
  return otherStates.some(state => addr.includes(state));
};

export default function InvoiceForm({ token, user, onSaved, onCancel, editId = null }) {
  const [jobCards, setJobCards] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [selectedJcId, setSelectedJcId] = useState('');
  const [selectedEstimateId, setSelectedEstimateId] = useState('');

  // Tables
  const [partsList, setPartsList] = useState([]);
  const [labourList, setLabourList] = useState([{ description: '', qty: '1', rate: '', gstPercent: '', discountPercent: '0', discountAmount: '0', discountType: 'Percent' }]);
  const { data: partsInventory } = useInventoryCache(token, 'parts');
  const { data: labourInventory } = useInventoryCache(token, 'labour');
  const [gstDetails, setGstDetails] = useState({ customerGSTIN: '', isInterstate: false });
  const [invoiceType, setInvoiceType] = useState('Tax Invoice');
  const [poNumber, setPoNumber] = useState('');
  const [roNumber, setRoNumber] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  const [manualInvoiceRef, setManualInvoiceRef] = useState('');
  const [insuranceDetails, setInsuranceDetails] = useState({
    claimNo: '',
    insuranceCompany: '',
    surveyorName: '',
    surveyDate: '',
    approvedAmount: '',
    customerPayableAmount: 0,
  });

  const [totals, setTotals] = useState({
    partsTotal: 0,
    labourTotal: 0,
    cgstTotal: 0,
    sgstTotal: 0,
    igstTotal: 0,
    gstTotal: 0,
    discountTotal: 0,
    grandTotal: 0,
    roundedGrandTotal: 0
  });

  const [manualOverride, setManualOverride] = useState(false);
  const [overriddenGrandTotal, setOverriddenGrandTotal] = useState('');
  const [triggerRecalc, setTriggerRecalc] = useState(0);
  const [advanceReceived, setAdvanceReceived] = useState(0);

  const cleanNumberInput = (val, allowDecimal = true, maxVal = null) => {
    if (val === undefined || val === null) return '';
    let cleaned = val.toString().replace(/[^0-9.]/g, '');
    if (!allowDecimal) {
      cleaned = cleaned.replace(/\./g, '');
    }
    if (cleaned === '.') return '0.';
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    if (cleaned.startsWith('0') && cleaned.length > 1 && cleaned[1] !== '.') {
      cleaned = cleaned.replace(/^0+/, '');
      if (cleaned === '') cleaned = '';
    }
    if (maxVal !== null && cleaned !== '') {
      const num = parseFloat(cleaned);
      if (!isNaN(num) && num > maxVal) {
        cleaned = maxVal.toString();
      }
    }
    return cleaned;
  };

  const handleRowFieldChange = (list, setter, idx, field, value) => {
    setManualOverride(false);
    const updated = [...list];
    let row = { ...updated[idx] };

    // Set the field directly first so the input value shows the typed text
    row[field] = value;

    const qty = Math.max(1, parseFloat(row.qty) || 1);
    const gstP = parseFloat(row.gstPercent) || 0;
    
    // Call pricing engine
    const pricing = calculatePricing({
      sellingPrice: parseFloat(row.rate) || 0,
      quantity: qty,
      discountPercent: parseFloat(row.discountPercent) || 0,
      discountAmount: parseFloat(row.discountAmount) || 0,
      discountType: row.discountType || 'Percent',
      gstPercent: gstP,
      mrp: parseFloat(row.mrp) || 0,
      taxableAmount: field === 'taxableAmount' && value !== '' ? parseFloat(value) : null,
      changedField: field
    });

    // Update row fields with calculated values
    row.mrp = pricing.mrp.toFixed(2);
    row.rate = pricing.unitBasic.toFixed(2);
    row.discountPercent = pricing.discountPercent.toFixed(2);
    row.discountAmount = pricing.discountAmount.toFixed(2);
    row.discount = pricing.discountAmount.toFixed(2);
    row.taxableAmount = pricing.taxableAmount.toFixed(2);

    // Preserve the typed value to prevent cursor jumping
    row[field] = value;

    updated[idx] = row;
    setter(updated);
  };

  const handleTotalChange = (e, list, setter, idx) => {
    setManualOverride(false);
    const input = e.target;
    const originalValue = input.value;
    const processedValue = cleanNumberInput(originalValue, true);

    const updatedList = [...list];
    let row = { ...updatedList[idx] };

    if (processedValue !== '') {
      const totalNum = parseFloat(processedValue);
      if (!isNaN(totalNum)) {
        const qty = Math.max(1, parseFloat(row.qty) || 1);
        const gstP = parseFloat(row.gstPercent) || 0;
        
        const pricing = calculatePricing({
          sellingPrice: parseFloat(row.rate) || 0,
          quantity: qty,
          discountPercent: parseFloat(row.discountPercent) || 0,
          discountAmount: parseFloat(row.discountAmount) || 0,
          discountType: row.discountType || 'Percent',
          gstPercent: gstP,
          mrp: parseFloat(row.mrp) || 0,
          manualFinalTotal: totalNum
        });

        row.mrp = pricing.mrp.toFixed(2);
        row.rate = pricing.unitBasic.toFixed(2);
        row.discountPercent = pricing.discountPercent.toFixed(2);
        row.discountAmount = pricing.discountAmount.toFixed(2);
        row.discount = pricing.discountAmount.toFixed(2);
        row.taxableAmount = pricing.taxableAmount.toFixed(2);
      }
    } else {
      row.totalCustom = '';
    }

    updatedList[idx] = row;
    setter(updatedList);
  };

  const handleInsuranceNumericChange = (e, field, allowDecimal = true, maxVal = null) => {
    const input = e.target;
    const originalValue = input.value;
    const processedValue = cleanNumberInput(originalValue, allowDecimal, maxVal);
    
    const selectionStart = input.selectionStart;
    setInsuranceDetails(prev => ({ ...prev, [field]: processedValue }));

    requestAnimationFrame(() => {
      if (input && input.setSelectionRange) {
        const beforeCursor = originalValue.slice(0, selectionStart);
        const cleanBeforeCursor = cleanNumberInput(beforeCursor, allowDecimal, maxVal);
        const newCursorPos = cleanBeforeCursor.length;
        input.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  };

  // Local helper to convert number to words on the client
  const convertNumberToWords = (num) => {
    const roundedNum = Math.round(num * 100) / 100;
    if (roundedNum === 0) return 'Rupees Zero Only';
    
    const a = [
      '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    function convert(n) {
      if (n < 20) return a[n];
      if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
      if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convert(n % 100) : '');
      if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + convert(n % 1000) : '');
      if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + convert(n % 100000) : '');
      return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + convert(n % 10000000) : '');
    }
    
    const parts = roundedNum.toString().split('.');
    const rupees = parseInt(parts[0], 10);
    const paise = parts[1] ? parseInt(parts[1].padEnd(2, '0').slice(0, 2), 10) : 0;
    
    let result = 'Rupees ';
    if (rupees > 0) {
      result += convert(rupees);
    } else {
      result += 'Zero';
    }
    
    if (paise > 0) {
      result += ' and ' + convert(paise) + ' Paise';
    }
    result += ' Only';
    return result.replace(/\s+/g, ' ').trim();
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const jcRes = await fetch(`${API_BASE_URL}/jobcards`, { headers });
        const estRes = await fetch(`${API_BASE_URL}/estimates`, { headers });

        if (jcRes.ok && estRes.ok) {
          const jcData = await jcRes.json();
          const estData = await estRes.json();
          // Filter jobcards that are ready or work in progress
          setJobCards(jcData.filter(jc => jc.status !== 'Delivered'));
          setEstimates(estData.filter(e => e.status === 'Approved'));
        }

        // Check if loading pre-filled estimate conversion
        const convertEstId = localStorage.getItem('convert_estimate_id');
        const defaultJcId = localStorage.getItem('create_invoice_jc_id');
        
        if (convertEstId) {
          setSelectedEstimateId(convertEstId);
          setSelectedJcId(defaultJcId || '');
          localStorage.removeItem('convert_estimate_id');
          localStorage.removeItem('create_invoice_jc_id');

          const estDetailsRes = await fetch(`${API_BASE_URL}/estimates/${convertEstId}`, { headers });
          if (estDetailsRes.ok) {
            const est = await estDetailsRes.json();
            
            // Auto fill parts, labour and customer details
            setPartsList(est.parts.map(p => {
              const qty = p.qty || 1;
              const rate = p.rate || 0;
              const gst = p.gstPercent || 0;
              const mrp = p.mrp || (rate * (1 + gst / 100));
              const discAmt = p.discount || 0;
              const pricing = calculatePricing({
                sellingPrice: rate,
                quantity: qty,
                discountAmount: discAmt,
                discountType: 'Fixed',
                gstPercent: gst,
                mrp: mrp,
                changedField: 'discountAmount'
              });
              return {
                partId: p.partId?._id || p.partId || '',
                name: p.name,
                partNo: p.partNo,
                hsnCode: p.hsnCode,
                qty: qty.toString(),
                mrp: pricing.mrp.toFixed(2),
                rate: pricing.unitBasic.toFixed(2),
                discountPercent: pricing.discountPercent.toFixed(2),
                discountAmount: pricing.discountAmount.toFixed(2),
                discountType: 'Fixed',
                gstPercent: gst.toString(),
                taxableAmount: pricing.taxableAmount.toFixed(2)
              };
            }));
            setLabourList(est.labour.map(l => {
              const qty = 1;
              const rate = l.rate || 0;
              const gst = l.gstPercent || 0;
              const discAmt = l.discount || 0;
              const pricing = calculatePricing({
                sellingPrice: rate,
                quantity: qty,
                discountAmount: discAmt,
                discountType: 'Fixed',
                gstPercent: gst,
                changedField: 'discountAmount'
              });
              return {
                description: l.description,
                qty: '1',
                mrp: pricing.mrp.toFixed(2),
                rate: pricing.unitBasic.toFixed(2),
                discountPercent: pricing.discountPercent.toFixed(2),
                discountAmount: pricing.discountAmount.toFixed(2),
                discountType: 'Fixed',
                gstPercent: gst.toString(),
                taxableAmount: pricing.taxableAmount.toFixed(2)
              };
            }));

            const jc = est.jobCardId || {};
            const cust = jc.customerId || {};
            const veh = jc.vehicleId || {};

            setGstDetails({
              customerGSTIN: cust.gstNumber || '',
              isInterstate: cust.gstNumber 
                ? !cust.gstNumber.startsWith('36') 
                : checkAddressIsInterstate(cust.address)
            });

            setInsuranceDetails({
              claimNo: jc.claimNo || '',
              insuranceCompany: jc.insuranceName || veh.insuranceCompany || '',
              surveyorName: '',
              surveyDate: '',
              approvedAmount: '',
              customerPayableAmount: est.totals.grandTotal
            });
          }
        }

        if (editId) {
          const invDetailsRes = await fetch(`${API_BASE_URL}/invoices/${editId}`, { headers });
          if (invDetailsRes.ok) {
            const inv = await invDetailsRes.json();
            setSelectedJcId(inv.jobCardId?._id || inv.jobCardId || '');
            setSelectedEstimateId(inv.estimateId?._id || inv.estimateId || '');
            setInvoiceType(inv.invoiceType || 'Tax Invoice');
            setPoNumber(inv.poNumber || '');
            setRoNumber(inv.roNumber || '');
            setPreparedBy(inv.preparedBy || '');
            setManualInvoiceRef(inv.manualInvoiceRef || '');
            setGstDetails({
              customerGSTIN: inv.gstDetails?.customerGSTIN || '',
              isInterstate: inv.gstDetails?.isInterstate || false
            });
            setPartsList(inv.parts.map(p => {
              const qty = p.qty || 1;
              const rate = p.rate || 0;
              const gst = p.gstPercent || 0;
              const mrp = p.mrp || (rate * (1 + gst / 100));
              const pricing = calculatePricing({
                sellingPrice: rate,
                quantity: qty,
                discountPercent: p.discountPercent || 0,
                discountAmount: p.discountAmount || 0,
                discountType: p.discountType || 'Percent',
                gstPercent: gst,
                mrp: mrp,
                changedField: p.discountType === 'Fixed' ? 'discountAmount' : 'discountPercent'
              });
              return {
                partId: p.partId?._id || p.partId || '',
                name: p.name,
                partNo: p.partNo,
                hsnCode: p.hsnCode,
                qty: qty.toString(),
                mrp: pricing.mrp.toFixed(2),
                rate: pricing.unitBasic.toFixed(2),
                discountPercent: pricing.discountPercent.toFixed(2),
                discountAmount: pricing.discountAmount.toFixed(2),
                discountType: p.discountType || 'Percent',
                gstPercent: gst.toString(),
                taxableAmount: pricing.taxableAmount.toFixed(2)
              };
            }));
            setLabourList(inv.labour.map(l => {
              const qty = l.qty || 1;
              const rate = l.rate || 0;
              const gst = l.gstPercent || 0;
              const pricing = calculatePricing({
                sellingPrice: rate,
                quantity: qty,
                discountPercent: l.discountPercent || 0,
                discountAmount: l.discountAmount || 0,
                discountType: l.discountType || 'Percent',
                gstPercent: gst,
                changedField: l.discountType === 'Fixed' ? 'discountAmount' : 'discountPercent'
              });
              return {
                description: l.description,
                qty: qty.toString(),
                mrp: pricing.mrp.toFixed(2),
                rate: pricing.unitBasic.toFixed(2),
                discountPercent: pricing.discountPercent.toFixed(2),
                discountAmount: pricing.discountAmount.toFixed(2),
                discountType: l.discountType || 'Percent',
                gstPercent: gst.toString(),
                taxableAmount: pricing.taxableAmount.toFixed(2)
              };
            }));
            setInsuranceDetails({
              claimNo: inv.insuranceClaimDetails?.claimNo || '',
              insuranceCompany: inv.insuranceClaimDetails?.insuranceCompany || '',
              surveyorName: inv.insuranceClaimDetails?.surveyorName || '',
              surveyDate: inv.insuranceClaimDetails?.surveyDate ? new Date(inv.insuranceClaimDetails.surveyDate).toISOString().split('T')[0] : '',
              approvedAmount: inv.insuranceClaimDetails?.approvedAmount !== undefined && inv.insuranceClaimDetails?.approvedAmount !== null ? inv.insuranceClaimDetails.approvedAmount.toString() : '',
              customerPayableAmount: inv.insuranceClaimDetails?.customerPayableAmount || 0
            });
            setAdvanceReceived(inv.advanceReceived || 0);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, [token, editId]);

  // Recalculate invoice totals with tax splits
  useEffect(() => {
    const roundToTwo = (num) => {
      return Math.round((num + Number.EPSILON) * 100) / 100;
    };

    let partsTotal = 0; // net taxable parts sum
    let labourTotal = 0; // net taxable labour sum
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;
    let gstTotal = 0;
    let discountTotal = 0;

    partsList.forEach(part => {
      const amount = roundToTwo(parseFloat(part.taxableAmount) || 0);
      const gstP = parseFloat(part.gstPercent) || 0;
      const gstAmount = roundToTwo(amount * (gstP / 100));

      partsTotal += amount;
      discountTotal += parseFloat(part.discountAmount) || 0;
      gstTotal += gstAmount;

      if (gstDetails.isInterstate) {
        igstTotal += gstAmount;
      } else {
        const cgstItem = roundToTwo(gstAmount / 2);
        const sgstItem = roundToTwo(gstAmount - cgstItem);
        cgstTotal += cgstItem;
        sgstTotal += sgstItem;
      }
    });

    labourList.forEach(lab => {
      const amount = roundToTwo(parseFloat(lab.taxableAmount) || 0);
      const gstP = parseFloat(lab.gstPercent) || 0;
      const gstAmount = roundToTwo(amount * (gstP / 100));

      labourTotal += amount;
      discountTotal += parseFloat(lab.discountAmount) || 0;
      gstTotal += gstAmount;

      if (gstDetails.isInterstate) {
        igstTotal += gstAmount;
      } else {
        const cgstItem = roundToTwo(gstAmount / 2);
        const sgstItem = roundToTwo(gstAmount - cgstItem);
        cgstTotal += cgstItem;
        sgstTotal += sgstItem;
      }
    });

    const grandTotal = roundToTwo(partsTotal + labourTotal + gstTotal);
    const finalGrandTotal = manualOverride && overriddenGrandTotal !== '' ? parseFloat(overriddenGrandTotal) || 0 : grandTotal;
    const finalRoundedGrandTotal = Math.round(finalGrandTotal);

    setTotals({
      partsTotal: roundToTwo(partsTotal),
      labourTotal: roundToTwo(labourTotal),
      cgstTotal: roundToTwo(cgstTotal),
      sgstTotal: roundToTwo(sgstTotal),
      igstTotal: roundToTwo(igstTotal),
      gstTotal: roundToTwo(gstTotal),
      discountTotal: roundToTwo(discountTotal),
      grandTotal: finalGrandTotal,
      roundedGrandTotal: finalRoundedGrandTotal
    });

    // Update insurance split payable
    const approvedAmt = Number(insuranceDetails.approvedAmount) || 0;
    setInsuranceDetails(prev => ({
      ...prev,
      customerPayableAmount: Math.max(0, finalRoundedGrandTotal - approvedAmt)
    }));

  }, [partsList, labourList, gstDetails.isInterstate, insuranceDetails.approvedAmount, manualOverride, overriddenGrandTotal, triggerRecalc]);

  const handleGrandTotalOverride = (val) => {
    setOverriddenGrandTotal(val);
    if (val === '') return;
    const newGrandTotal = parseFloat(val) || 0;
    if (newGrandTotal < 0) return;

    // Calculate Parts Total (incl. Tax)
    let partsTotal = 0;
    let partsGst = 0;
    partsList.forEach(part => {
      const pricing = calculatePricing({
        sellingPrice: part.rate,
        quantity: part.qty,
        discountPercent: part.discountPercent,
        discountAmount: part.discountAmount,
        lastDiscountEdited: part.discountType === 'Fixed' ? 'amount' : 'percent',
        gstPercent: part.gstPercent
      });
      partsTotal += pricing.taxableAmount;
      partsGst += pricing.gstAmount;
    });
    const P_tot = partsTotal + partsGst;

    // L_tot_new = newGrandTotal - P_tot
    const L_tot_new = Math.max(0, newGrandTotal - P_tot);

    // Re-distribute/scale labour rates
    const L_tot_old = labourList.reduce((sum, lab) => {
      const pricing = calculatePricing({
        sellingPrice: lab.rate,
        quantity: lab.qty || 1,
        discountPercent: lab.discountPercent,
        discountAmount: lab.discountAmount,
        lastDiscountEdited: lab.discountType === 'Fixed' ? 'amount' : 'percent',
        gstPercent: lab.gstPercent
      });
      return sum + pricing.taxableAmount + pricing.gstAmount;
    }, 0);

    if (L_tot_old > 0) {
      const ratio = L_tot_new / L_tot_old;
      const updatedLabour = labourList.map(lab => {
        const rate = parseFloat(lab.rate) || 0;
        const qty = parseFloat(lab.qty) || 1;
        const gst = parseFloat(lab.gstPercent) || 0;
        const discAmt = parseFloat(lab.discountAmount) || 0;
        const discPct = parseFloat(lab.discountPercent) || 0;
        
        let oldTaxable = 0;
        if (lab.discountType === 'Fixed') {
          oldTaxable = Math.max(0, (rate * qty) - discAmt);
        } else {
          oldTaxable = Math.max(0, (rate * qty) * (1 - discPct / 100));
        }
        const oldTotal = oldTaxable * (1 + gst / 100);
        
        const newTotal = oldTotal * ratio;
        const newTaxable = newTotal / (1 + gst / 100);
        
        // Let's find the new rate:
        let newRate = 0;
        if (lab.discountType === 'Fixed') {
          // Rate * Qty = newTaxable + discAmt
          newRate = (newTaxable + discAmt) / qty;
        } else {
          // Rate * Qty * (1 - discPct / 100) = newTaxable
          newRate = newTaxable / (qty * (1 - discPct / 100));
        }
        
        return {
          ...lab,
          rate: Math.max(0, Math.round(newRate * 100) / 100).toString()
        };
      });
      setLabourList(updatedLabour);
    } else if (labourList.length > 0) {
      const newTotalPerItem = L_tot_new / labourList.length;
      const updatedLabour = labourList.map(lab => {
        const qty = parseFloat(lab.qty) || 1;
        const gst = parseFloat(lab.gstPercent) || 18;
        const discPct = parseFloat(lab.discountPercent) || 0;
        const newTaxable = newTotalPerItem / (1 + gst / 100);
        const newRate = newTaxable / (qty * (1 - discPct / 100));
        return {
          ...lab,
          rate: Math.max(0, Math.round(newRate * 100) / 100).toString()
        };
      });
      setLabourList(updatedLabour);
    }
  };

  const handleGstinChange = (e) => {
    const input = e.target;
    const originalValue = input.value;
    const processedValue = originalValue.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
    
    const selectionStart = input.selectionStart;
    const isInterstate = processedValue ? !processedValue.startsWith('36') : false;
    setGstDetails({ customerGSTIN: processedValue, isInterstate });

    requestAnimationFrame(() => {
      if (input && input.setSelectionRange) {
        const beforeCursor = originalValue.slice(0, selectionStart);
        const cleanBeforeCursor = beforeCursor.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const newCursorPos = cleanBeforeCursor.length;
        input.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  };

  const handleJcChange = async (jcId) => {
    setSelectedJcId(jcId);
    if (!jcId) {
      setPartsList([]);
      setLabourList([{ description: '', rate: '', gstPercent: '' }]);
      setGstDetails({ customerGSTIN: '', isInterstate: false });
      setInsuranceDetails({
        claimNo: '',
        insuranceCompany: '',
        surveyorName: '',
        surveyDate: '',
        approvedAmount: '',
        customerPayableAmount: 0
      });
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const jcRes = await fetch(`${API_BASE_URL}/jobcards/${jcId}`, { headers });
      if (jcRes.ok) {
        const jc = await jcRes.json();
        const cust = jc.customerId || {};
        const veh = jc.vehicleId || {};

        setGstDetails({
          customerGSTIN: cust.gstNumber || '',
          isInterstate: cust.gstNumber 
            ? !cust.gstNumber.startsWith('36') 
            : checkAddressIsInterstate(cust.address)
        });

        const totalAdvance = jc.advancePayments ? jc.advancePayments.reduce((sum, p) => sum + p.amount, 0) : 0;
        setAdvanceReceived(totalAdvance);

        setInsuranceDetails(prev => ({
          ...prev,
          claimNo: jc.claimNo || '',
          insuranceCompany: jc.insuranceName || veh.insuranceCompany || '',
          customerPayableAmount: totals.grandTotal
        }));

        // Fetch approved estimate for this jobcard
        const estRes = await fetch(`${API_BASE_URL}/estimates?jobCardId=${jcId}`, { headers });
        if (estRes.ok) {
          const estimatesList = await estRes.json();
          const approvedEst = estimatesList.find(e => e.status === 'Approved') || estimatesList[0];
          if (approvedEst) {
            setSelectedEstimateId(approvedEst._id);
             setPartsList(approvedEst.parts.map(p => {
              const qty = p.qty || 1;
              const rate = p.rate || 0;
              const gst = p.gstPercent || 0;
              const mrp = p.mrp || (rate * (1 + gst / 100));
              const discAmt = p.discount || 0;
              const pricing = calculatePricing({
                sellingPrice: rate,
                quantity: qty,
                discountAmount: discAmt,
                discountType: 'Fixed',
                gstPercent: gst,
                mrp: mrp,
                changedField: 'discountAmount'
              });
              return {
                partId: p.partId?._id || p.partId || '',
                name: p.name,
                partNo: p.partNo,
                hsnCode: p.hsnCode,
                qty: qty.toString(),
                mrp: pricing.mrp.toFixed(2),
                rate: pricing.unitBasic.toFixed(2),
                discountPercent: pricing.discountPercent.toFixed(2),
                discountAmount: pricing.discountAmount.toFixed(2),
                discountType: 'Fixed',
                gstPercent: gst.toString(),
                taxableAmount: pricing.taxableAmount.toFixed(2)
              };
            }));
            setLabourList(approvedEst.labour.map(l => {
              const qty = l.qty || 1;
              const rate = l.rate || 0;
              const gst = l.gstPercent || 0;
              const discAmt = l.discount || 0;
              const pricing = calculatePricing({
                sellingPrice: rate,
                quantity: qty,
                discountAmount: discAmt,
                discountType: 'Fixed',
                gstPercent: gst,
                changedField: 'discountAmount'
              });
              return {
                description: l.description,
                qty: qty.toString(),
                mrp: pricing.mrp.toFixed(2),
                rate: pricing.unitBasic.toFixed(2),
                discountPercent: pricing.discountPercent.toFixed(2),
                discountAmount: pricing.discountAmount.toFixed(2),
                discountType: 'Fixed',
                gstPercent: gst.toString(),
                taxableAmount: pricing.taxableAmount.toFixed(2)
              };
            }));
          } else {
            setSelectedEstimateId('');
            setPartsList([]);
            setLabourList([{ description: '', qty: '1', rate: '', gstPercent: '', discountPercent: '0', discountAmount: '0', discountType: 'Percent' }]);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Parts rows operations
  const handleAddPartRow = () => {
    setManualOverride(false);
    setPartsList([...partsList, { partId: '', name: '', partNo: '', hsnCode: '', qty: '1', mrp: '', rate: '', gstPercent: '', discountPercent: '0', discountAmount: '0', discountType: 'Percent', taxableAmount: '' }]);
  };

  const handleRemovePartRow = (idx) => {
    setManualOverride(false);
    const list = [...partsList];
    list.splice(idx, 1);
    setPartsList(list);
  };

  const handlePartSelect = (idx, partId) => {
    setManualOverride(false);
    const part = partsInventory.find(item => item._id === partId);
    if (!part) return;

    const list = [...partsList];
    const rawRow = {
      ...list[idx],
      partId: part._id,
      name: part.partName,
      partNo: part.partNumber,
      hsnCode: part.hsnCode,
      qty: '1',
      rate: part.sellingPrice !== undefined && part.sellingPrice !== null ? part.sellingPrice.toString() : '',
      mrp: part.mrp !== undefined && part.mrp !== null ? part.mrp.toString() : '',
      gstPercent: part.gstPercent !== undefined && part.gstPercent !== null ? part.gstPercent.toString() : '18',
      discountPercent: part.discountPercent !== undefined && part.discountPercent !== null ? part.discountPercent.toString() : '0',
      discountAmount: part.discountAmount !== undefined && part.discountAmount !== null ? part.discountAmount.toString() : '0',
      discountType: part.discountType || 'Percent',
      purchasePrice: part.purchasePrice !== undefined && part.purchasePrice !== null ? part.purchasePrice.toString() : '',
      stockQuantity: part.stockQuantity !== undefined && part.stockQuantity !== null ? part.stockQuantity.toString() : '0',
      unit: part.unit || 'Pcs'
    };

    const pricing = calculatePricing({
      sellingPrice: parseFloat(rawRow.rate) || 0,
      quantity: parseFloat(rawRow.qty) || 1,
      discountPercent: parseFloat(rawRow.discountPercent) || 0,
      discountAmount: parseFloat(rawRow.discountAmount) || 0,
      discountType: rawRow.discountType || 'Percent',
      gstPercent: parseFloat(rawRow.gstPercent) || 18,
      mrp: parseFloat(rawRow.mrp) || 0,
      changedField: 'mrp'
    });

    rawRow.mrp = pricing.mrp.toFixed(2);
    rawRow.rate = pricing.unitBasic.toFixed(2);
    rawRow.discountPercent = pricing.discountPercent.toFixed(2);
    rawRow.discountAmount = pricing.discountAmount.toFixed(2);
    rawRow.discount = pricing.discountAmount.toFixed(2);
    rawRow.taxableAmount = pricing.taxableAmount.toFixed(2);

    list[idx] = rawRow;
    setPartsList(list);
  };

  const handlePartRowValue = (idx, field, value) => {
    setManualOverride(false);
    const list = [...partsList];
    list[idx] = { ...list[idx], [field]: value };
    setPartsList(list);
  };

  // Labour rows operations
  const handleAddLabourRow = () => {
    setManualOverride(false);
    setLabourList([...labourList, { description: '', qty: '1', rate: '', gstPercent: '', discountPercent: '0', discountAmount: '0', discountType: 'Percent', taxableAmount: '' }]);
  };

  const handleRemoveLabourRow = (idx) => {
    setManualOverride(false);
    const list = [...labourList];
    list.splice(idx, 1);
    setLabourList(list);
  };

  const handleLabourRowValue = (idx, field, value) => {
    setManualOverride(false);
    const list = [...labourList];
    list[idx] = { ...list[idx], [field]: value };

    // Auto-calculate labour row when rate or gstPercent is updated by preset
    if (field === 'rate' || field === 'gstPercent') {
      const row = { ...list[idx] };
      const pricing = calculatePricing({
        sellingPrice: parseFloat(row.rate) || 0,
        quantity: parseFloat(row.qty) || 1,
        discountPercent: parseFloat(row.discountPercent) || 0,
        discountAmount: parseFloat(row.discountAmount) || 0,
        discountType: row.discountType || 'Percent',
        gstPercent: parseFloat(row.gstPercent) || 0,
        mrp: parseFloat(row.mrp) || 0,
        changedField: 'rate'
      });
      row.mrp = pricing.mrp.toFixed(2);
      row.rate = pricing.unitBasic.toFixed(2);
      row.discountPercent = pricing.discountPercent.toFixed(2);
      row.discountAmount = pricing.discountAmount.toFixed(2);
      row.discount = pricing.discountAmount.toFixed(2);
      row.taxableAmount = pricing.taxableAmount.toFixed(2);
      list[idx] = row;
    }
    setLabourList(list);
  };

  const handleSave = async (isFinalize = false) => {
    if (!selectedJcId) {
      alert('Please select a Job Card first.');
      return;
    }

    if (gstDetails.customerGSTIN) {
      const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstRegex.test(gstDetails.customerGSTIN)) {
        alert('Please enter a valid 15-character Indian GSTIN number (e.g. 29ABCDE1234F1Z5).');
        return;
      }
    }

    // Validation: prevent negative values, invalid GST rates, and verify stock availability
    const validGstRates = [0, 5, 12, 18, 28];

    for (const part of partsList) {
      if (part.name && part.name.trim() !== '') {
        const qty = Number(part.qty) || 0;
        const rate = Number(part.rate) || 0;
        const discPercent = Number(part.discountPercent) || 0;
        const discAmount = Number(part.discountAmount) || 0;
        const gstVal = Number(part.gstPercent) || 0;

        if (qty < 0) {
          alert(`Quantity for part "${part.name}" cannot be negative.`);
          return;
        }
        if (rate < 0) {
          alert(`Rate for part "${part.name}" cannot be negative.`);
          return;
        }
        if (part.discountType === 'Fixed') {
          if (discAmount < 0) {
            alert(`Discount for part "${part.name}" cannot be negative.`);
            return;
          }
          if (discAmount > qty * rate) {
            alert(`Discount for part "${part.name}" cannot exceed subtotal (₹${qty * rate}).`);
            return;
          }
        } else {
          if (discPercent < 0 || discPercent > 100) {
            alert(`Discount percentage for part "${part.name}" must be between 0% and 100%.`);
            return;
          }
        }
        if (gstVal < 0 || gstVal > 100) {
          alert(`Invalid GST rate ${gstVal}% for part "${part.name}". Rate must be between 0% and 100%.`);
          return;
        }

        // Validate stock availability if finalizing
        if (isFinalize && part.partId && part.partId.trim() !== '') {
          const invItem = partsInventory.find(item => item._id === part.partId);
          if (invItem) {
            const availStock = invItem.stockQuantity || 0;
            if (qty > availStock) {
              alert(`Insufficient stock for "${part.name}". Available stock: ${availStock}.`);
              return;
            }
          }
        }
      }
    }

    for (const lab of labourList) {
      if (lab.description && lab.description.trim() !== '') {
        const qty = lab.qty !== undefined && lab.qty !== null && lab.qty !== '' ? Number(lab.qty) : 1;
        const rate = Number(lab.rate) || 0;
        const discPercent = Number(lab.discountPercent) || 0;
        const discAmount = Number(lab.discountAmount) || 0;
        const gstVal = Number(lab.gstPercent) || 0;

        if (qty < 0) {
          alert(`Labour quantity for "${lab.description}" cannot be negative.`);
          return;
        }
        if (rate < 0) {
          alert(`Labour rate for "${lab.description}" cannot be negative.`);
          return;
        }
        if (lab.discountType === 'Fixed') {
          if (discAmount < 0) {
            alert(`Labour discount for "${lab.description}" cannot be negative.`);
            return;
          }
          if (discAmount > qty * rate) {
            alert(`Labour discount for "${lab.description}" cannot exceed subtotal (₹${qty * rate}).`);
            return;
          }
        } else {
          if (discPercent < 0 || discPercent > 100) {
            alert(`Labour discount percentage for "${lab.description}" must be between 0% and 100%.`);
            return;
          }
        }
        if (gstVal < 0 || gstVal > 100) {
          alert(`Invalid GST rate ${gstVal}% for labour "${lab.description}". Rate must be between 0% and 100%.`);
          return;
        }
      }
    }

    // Clean up empty or invalid parts rows before saving
    const cleanedParts = partsList
      .filter(p => p.name && p.name.trim() !== '')
      .map(p => {
        const item = {
          name: p.name.trim(),
          partNo: p.partNo ? p.partNo.trim() : '',
          hsnCode: p.hsnCode ? p.hsnCode.trim() : '',
          qty: Math.max(1, Number(p.qty) || 1), // ensure qty is min 1
          rate: Number(p.rate) || 0,
          discountType: p.discountType || 'Percent',
          discountPercent: Number(p.discountPercent) || 0,
          discountAmount: Number(p.discountAmount) || 0,
          gstPercent: Number(p.gstPercent) || 0
        };
        // Only include partId if it's a valid non-empty string to avoid CastError
        if (p.partId && p.partId.trim() !== '') {
          item.partId = p.partId.trim();
        }
        return item;
      });

    // Clean up empty or invalid labour rows before saving
    const cleanedLabour = labourList
      .filter(l => l.description && l.description.trim() !== '')
      .map(l => ({
        description: l.description.trim(),
        qty: l.qty !== undefined && l.qty !== null && l.qty !== '' ? Math.max(1, Number(l.qty) || 1) : 1,
        rate: Number(l.rate) || 0,
        discountType: l.discountType || 'Percent',
        discountPercent: Number(l.discountPercent) || 0,
        discountAmount: Number(l.discountAmount) || 0,
        gstPercent: Number(l.gstPercent) || 0
      }));

    if (cleanedParts.length === 0 && cleanedLabour.length === 0) {
      alert('Please add at least one spare part or labour service with a description.');
      return;
    }

    const cleanIsInterstate = typeof gstDetails?.isInterstate === 'boolean' 
      ? gstDetails.isInterstate 
      : (typeof gstDetails?.isInterstate === 'string' && gstDetails.isInterstate.trim() !== '' 
          ? gstDetails.isInterstate.trim().toLowerCase() === 'true' 
          : false);

    const payload = {
      jobCardId: selectedJcId,
      estimateId: selectedEstimateId || null,
      parts: cleanedParts,
      labour: cleanedLabour,
      gstDetails: {
        companyGSTIN: gstDetails?.companyGSTIN || '36AAJCM4778P1ZI',
        customerGSTIN: gstDetails?.customerGSTIN || '',
        isInterstate: Boolean(cleanIsInterstate)
      },
      insuranceClaimDetails: {
        ...insuranceDetails,
        approvedAmount: Number(insuranceDetails.approvedAmount) || 0
      },
      invoiceType,
      poNumber,
      roNumber,
      preparedBy,
      manualInvoiceRef,
      advanceReceived: Number(advanceReceived) || 0,
      balanceDue: Math.max(0, totals.roundedGrandTotal - Number(advanceReceived)),
      status: isFinalize ? 'Finalized' : 'Draft'
    };

    try {
      const url = editId
        ? `${API_BASE_URL}/invoices/${editId}`
        : `${API_BASE_URL}/invoices`;
      const method = editId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const createdInv = await res.json();
        
        // 2. If finalize is requested, trigger finalization route
        if (isFinalize) {
          const finalRes = await fetch(`${API_BASE_URL}/invoices/${createdInv._id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ status: 'Finalized', paymentStatus: 'Paid' })
          });
          
          if (!finalRes.ok) {
            const err = await finalRes.json();
            alert('Stock deduction or invoice finalize failed: ' + err.error);
          }
        }
        onSaved();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create invoice.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl max-w-[96%] xl:max-w-[1450px] mx-auto select-none animate-fade-in">
      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
        <div>
          <h2 className="text-base font-extrabold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-500" /> Create GST Tax Invoice
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
            Compute CGST/SGST/IGST tax splits and surveyor claims
          </p>
        </div>
        <button
          onClick={onCancel}
          className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3.5 py-1.5 rounded-xl border border-slate-250/20"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-6">
        
        {/* Job Card selection & GSTIN */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-950/20 p-5 rounded-2xl border border-slate-205/30">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Select Job Card
            </label>
            <select
              value={selectedJcId}
              onChange={(e) => handleJcChange(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none"
            >
              <option value="">-- Choose Job Card --</option>
              {jobCards.map(jc => (
                <option key={jc._id} value={jc._id}>
                  {jc.jobCardNo} - {jc.vehicleId?.vehicleNumber} ({jc.customerId?.name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Customer GSTIN
            </label>
            <input
              type="text"
              value={gstDetails.customerGSTIN}
              onChange={handleGstinChange}
              placeholder="Enter GST Number"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none uppercase font-mono tracking-wider"
            />
            <div className="mt-2">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">
                Billing Category *
              </label>
              <select
                value={gstDetails.isInterstate ? 'interstate' : 'intrastate'}
                onChange={(e) => {
                  const isInter = e.target.value === 'interstate';
                  setGstDetails(prev => ({ ...prev, isInterstate: isInter }));
                }}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold text-slate-800 dark:text-white focus:outline-none"
              >
                <option value="intrastate">CGST + SGST (Intra-State)</option>
                <option value="interstate">IGST (Inter-State)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Invoice Type
            </label>
            <select
              value={invoiceType}
              onChange={(e) => setInvoiceType(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500"
            >
              <option value="Tax Invoice">Tax Invoice</option>
              <option value="Proforma invoice">Proforma invoice</option>
              <option value="Retail invoice">Retail invoice</option>
            </select>
          </div>
        </div>

        {/* Additional Invoice Metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 bg-slate-50 dark:bg-slate-950/20 p-5 rounded-2xl border border-slate-205/30">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              PO Number
            </label>
            <input
              type="text"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              placeholder="e.g. PO-98765"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              RO Number (Repair Order)
            </label>
            <input
              type="text"
              value={roNumber}
              onChange={(e) => setRoNumber(e.target.value)}
              placeholder="e.g. RO-12345 (Defaults to JC No)"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Prepared By
            </label>
            <input
              type="text"
              value={preparedBy}
              onChange={(e) => setPreparedBy(e.target.value)}
              placeholder="e.g. Kumar (Accounts)"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Manual Invoice Ref
            </label>
            <input
              type="text"
              value={manualInvoiceRef}
              onChange={(e) => setManualInvoiceRef(e.target.value)}
              placeholder="e.g. MVSS/26-27/001"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Claim No
            </label>
            <input
              type="text"
              value={insuranceDetails.claimNo}
              onChange={(e) => setInsuranceDetails({ ...insuranceDetails, claimNo: e.target.value })}
              placeholder="e.g. CLM-83749"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none"
            />
          </div>
        </div>

        {/* Spare parts section */}
        <div className="space-y-3">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
              <ShoppingCart className="w-4 h-4 text-indigo-500" /> Spare Parts List
            </h4>
            <button
              type="button"
              onClick={handleAddPartRow}
              className="text-xs font-bold text-indigo-650 hover:text-indigo-700"
            >
              + Add Spare Part
            </button>
          </div>
          <div className="overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
            <div className="min-w-[1950px] space-y-2 pr-2">
              {partsList.map((part, idx) => (
                <div key={idx} className="flex gap-3 items-end bg-slate-50 dark:bg-slate-800/10 p-3 rounded-xl border border-slate-100 dark:border-slate-850">
                  <div className="w-56 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Select Part Catalog</label>
                    <SearchableDropdown
                      items={partsInventory}
                      value={part.partId}
                      onSelect={(partId) => handlePartSelect(idx, partId)}
                      placeholder="Search part name, number, OEM, HSN..."
                      emptyOptionLabel="-- Custom Part --"
                      token={token}
                      type="parts"
                      className="w-full"
                    />
                    {part.partId && (() => {
                      const itemInInv = partsInventory.find(item => item._id === part.partId);
                      const displayStock = itemInInv?.stockQuantity ?? part.stockQuantity ?? 0;
                      const displayUnit = itemInInv?.unit ?? part.unit ?? 'Pcs';
                      const displayPur = itemInInv?.purchasePrice ?? part.purchasePrice;
                      return (
                        <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-semibold leading-tight">
                          Stock: <strong className="text-indigo-650 dark:text-indigo-400">{displayStock} {displayUnit}</strong>
                          {displayPur !== undefined && displayPur !== '' && ` | Pur: ₹${Number(displayPur).toFixed(2)}`}
                        </span>
                      );
                    })()}
                  </div>

                  <div className="w-72 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Part Name (Editable)</label>
                    <input
                      type="text"
                      required
                      value={part.name}
                      onChange={(e) => handlePartRowValue(idx, 'name', e.target.value)}
                      placeholder="e.g. Engine Oil 10W-40"
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none"
                    />
                  </div>

                  <div className="w-44 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Part Number</label>
                    <input
                      type="text"
                      value={part.partNo || ''}
                      onChange={(e) => handlePartRowValue(idx, 'partNo', e.target.value)}
                      placeholder="e.g. SP-ENG-10W40"
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none"
                    />
                  </div>

                  <div className="w-32 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">HSN Code</label>
                    <input
                      type="text"
                      value={part.hsnCode || ''}
                      onChange={(e) => handlePartRowValue(idx, 'hsnCode', e.target.value)}
                      placeholder="e.g. 27101980"
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none"
                    />
                  </div>

                  <div className="w-32 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">MRP (₹)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={part.mrp || ''}
                      onChange={(e) => handleRowFieldChange(partsList, setPartsList, idx, 'mrp', e.target.value)}
                      placeholder="MRP"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                    />
                  </div>

                  <div className="w-32 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Rate (₹)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={part.rate || ''}
                      onChange={(e) => handleRowFieldChange(partsList, setPartsList, idx, 'rate', e.target.value)}
                      placeholder="Rate"
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                    />
                  </div>

                  <div className="w-20 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Qty</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={part.qty || ''}
                      onChange={(e) => handleRowFieldChange(partsList, setPartsList, idx, 'qty', e.target.value)}
                      placeholder="Qty"
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                    />
                  </div>

                  <div className="w-28 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Disc Type</label>
                    <select
                      value={part.discountType || 'Percent'}
                      onChange={(e) => handleRowFieldChange(partsList, setPartsList, idx, 'discountType', e.target.value)}
                      className="w-full h-[28px] px-1 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none"
                    >
                      <option value="Percent">Percent (%)</option>
                      <option value="Fixed">Flat (₹)</option>
                    </select>
                  </div>

                  <div className="w-20 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Disc %</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={part.discountPercent !== undefined ? part.discountPercent : ''}
                      onChange={(e) => handleRowFieldChange(partsList, setPartsList, idx, 'discountPercent', e.target.value)}
                      placeholder="0"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                    />
                  </div>

                  <div className="w-28 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Disc Amt (₹)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={part.discountAmount !== undefined ? part.discountAmount : ''}
                      onChange={(e) => handleRowFieldChange(partsList, setPartsList, idx, 'discountAmount', e.target.value)}
                      placeholder="0.00"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                    />
                  </div>

                  <div className="w-32 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Taxable (₹)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={part.taxableAmount !== undefined ? part.taxableAmount : ''}
                      onChange={(e) => handleRowFieldChange(partsList, setPartsList, idx, 'taxableAmount', e.target.value)}
                      placeholder="0.00"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono text-right"
                    />
                  </div>

                  <div className="w-40 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">GST %</label>
                    <div className="flex gap-1 items-center">
                      <select
                        value={[0, 3, 5, 12, 18, 28].includes(Number(part.gstPercent)) ? Number(part.gstPercent) : 'custom'}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            handleRowFieldChange(partsList, setPartsList, idx, 'gstPercent', 'custom');
                          } else {
                            handleRowFieldChange(partsList, setPartsList, idx, 'gstPercent', val);
                          }
                        }}
                        disabled={!['Admin', 'Accounts'].includes(user?.role)}
                        className="w-full px-2 py-1 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none flex-1"
                      >
                        <option value={0}>0%</option>
                        <option value={3}>3%</option>
                        <option value={5}>5%</option>
                        <option value={12}>12%</option>
                        <option value={18}>18%</option>
                        <option value={28}>28%</option>
                        <option value="custom">Custom...</option>
                      </select>
                      {![0, 3, 5, 12, 18, 28].includes(Number(part.gstPercent)) && (
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="0.00"
                          value={part.gstPercent === 'custom' ? '' : part.gstPercent}
                          onChange={(e) => handleRowFieldChange(partsList, setPartsList, idx, 'gstPercent', e.target.value)}
                          disabled={!['Admin', 'Accounts'].includes(user?.role)}
                          className="w-14 px-1.5 py-1 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                        />
                      )}
                    </div>
                  </div>

                  <div className="w-36 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Total (₹)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={(() => {
                        const taxable = parseFloat(part.taxableAmount) || 0;
                        const gstPercent = parseFloat(part.gstPercent) || 0;
                        const rowTotal = Math.round((taxable * (1 + gstPercent / 100)) * 100) / 100;
                        return rowTotal ? rowTotal.toString() : '';
                      })()}
                      onChange={(e) => handleTotalChange(e, partsList, setPartsList, idx)}
                      placeholder="Total"
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono text-right font-bold text-indigo-650 focus:border-indigo-500"
                    />
                  </div>

                  <div className="w-12 shrink-0 pb-1 flex justify-center">
                    <button
                      type="button"
                      onClick={() => handleRemovePartRow(idx)}
                      className="text-red-500 hover:text-red-700 p-2 rounded-lg border border-slate-200/40 hover:bg-red-50 dark:hover:bg-red-950/20"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {partsList.length === 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic py-2">No spare parts added to estimate.</p>
              )}
            </div>
          </div>
        </div>

        {/* Labour section */}
        <div className="space-y-3">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-indigo-500" /> Labour & Service charges
            </h4>
            <button
              type="button"
              onClick={handleAddLabourRow}
              className="text-xs font-bold text-indigo-650 hover:text-indigo-700"
            >
              + Add Labour Description
            </button>
          </div>
          <div className="overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
            <div className="min-w-[1600px] space-y-2 pr-2">
              {labourList.map((lab, idx) => (
                <div key={idx} className="flex gap-3 items-end bg-slate-50 dark:bg-slate-800/10 p-3 rounded-xl border border-slate-100 dark:border-slate-850">
                  <div className="w-56 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Select Service</label>
                    <SearchableDropdown
                      items={[...labourInventory, ...STANDARD_SERVICES.filter(s => !labourInventory.some(l => l.partName === s.description)).map(s => ({ _id: `preset_${s.description}`, partName: s.description, partNumber: '', partCode: '', category: '', hsnCode: '', model: '', _isPreset: true, _preset: s }))]}
                      value={lab.labourId || ''}
                      onSelect={(id) => {
                        if (!id) { handleLabourRowValue(idx, 'description', ''); handleLabourRowValue(idx, 'labourId', ''); return; }
                        const presetItem = STANDARD_SERVICES.find(s => `preset_${s.description}` === id);
                        if (presetItem) {
                          handleLabourRowValue(idx, 'description', presetItem.description);
                          handleLabourRowValue(idx, 'rate', presetItem.rate);
                          handleLabourRowValue(idx, 'gstPercent', presetItem.gstPercent);
                          handleLabourRowValue(idx, 'labourId', id);
                          return;
                        }
                        const labour = labourInventory.find(l => l._id === id);
                        if (labour) {
                          handleLabourRowValue(idx, 'description', labour.partName);
                          handleLabourRowValue(idx, 'rate', labour.sellingPrice !== undefined && labour.sellingPrice !== null ? labour.sellingPrice : '');
                          handleLabourRowValue(idx, 'gstPercent', labour.gstPercent !== undefined && labour.gstPercent !== null ? labour.gstPercent : '18');
                          handleLabourRowValue(idx, 'labourId', id);
                        }
                      }}
                      placeholder="Search labour code, description, category..."
                      emptyOptionLabel="-- Custom Preset --"
                      token={token}
                      type="labour"
                      className="w-full"
                    />
                  </div>

                  <div className="w-96 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Service Description (Editable)</label>
                    <input
                      type="text"
                      required
                      value={lab.description}
                      onChange={(e) => handleLabourRowValue(idx, 'description', e.target.value)}
                      placeholder="e.g. Engine tuning or Front bumper painting"
                      className="w-full px-3.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none"
                    />
                  </div>

                  <div className="w-36 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Labour Cost (₹)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={lab.rate || ''}
                      onChange={(e) => handleRowFieldChange(labourList, setLabourList, idx, 'rate', e.target.value)}
                      placeholder="Cost"
                      className="w-full px-3.5 py-1.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                    />
                  </div>

                  <div className="w-20 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Qty</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={lab.qty !== undefined && lab.qty !== null ? lab.qty : '1'}
                      onChange={(e) => handleRowFieldChange(labourList, setLabourList, idx, 'qty', e.target.value)}
                      placeholder="Qty"
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                    />
                  </div>

                  <div className="w-28 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Disc Type</label>
                    <select
                      value={lab.discountType || 'Percent'}
                      onChange={(e) => handleRowFieldChange(labourList, setLabourList, idx, 'discountType', e.target.value)}
                      className="w-full h-[28px] px-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none"
                    >
                      <option value="Percent">Percent (%)</option>
                      <option value="Fixed">Flat (₹)</option>
                    </select>
                  </div>

                  <div className="w-20 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Disc %</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={lab.discountPercent !== undefined ? lab.discountPercent : ''}
                      onChange={(e) => handleRowFieldChange(labourList, setLabourList, idx, 'discountPercent', e.target.value)}
                      placeholder="0"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                    />
                  </div>

                  <div className="w-28 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Disc Amt (₹)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={lab.discountAmount !== undefined ? lab.discountAmount : ''}
                      onChange={(e) => handleRowFieldChange(labourList, setLabourList, idx, 'discountAmount', e.target.value)}
                      placeholder="0.00"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                    />
                  </div>

                  <div className="w-32 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Taxable (₹)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={lab.taxableAmount !== undefined ? lab.taxableAmount : ''}
                      onChange={(e) => handleRowFieldChange(labourList, setLabourList, idx, 'taxableAmount', e.target.value)}
                      placeholder="0.00"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono text-right"
                    />
                  </div>

                  <div className="w-40 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">GST %</label>
                    <div className="flex gap-1 items-center">
                      <select
                        value={[0, 3, 5, 12, 18, 28].includes(Number(lab.gstPercent)) ? Number(lab.gstPercent) : 'custom'}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            handleRowFieldChange(labourList, setLabourList, idx, 'gstPercent', 'custom');
                          } else {
                            handleRowFieldChange(labourList, setLabourList, idx, 'gstPercent', val);
                          }
                        }}
                        disabled={!['Admin', 'Accounts'].includes(user?.role)}
                        className="w-full px-2 py-1 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none flex-1"
                      >
                        <option value={0}>0%</option>
                        <option value={3}>3%</option>
                        <option value={5}>5%</option>
                        <option value={12}>12%</option>
                        <option value={18}>18%</option>
                        <option value={28}>28%</option>
                        <option value="custom">Custom...</option>
                      </select>
                      {![0, 3, 5, 12, 18, 28].includes(Number(lab.gstPercent)) && (
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="0.00"
                          value={lab.gstPercent === 'custom' ? '' : lab.gstPercent}
                          onChange={(e) => handleRowFieldChange(labourList, setLabourList, idx, 'gstPercent', e.target.value)}
                          disabled={!['Admin', 'Accounts'].includes(user?.role)}
                          className="w-14 px-1.5 py-1 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                        />
                      )}
                    </div>
                  </div>

                  <div className="w-36 shrink-0">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Total (₹)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={(() => {
                        const taxable = parseFloat(lab.taxableAmount) || 0;
                        const gstPercent = parseFloat(lab.gstPercent) || 0;
                        const rowTotal = Math.round((taxable * (1 + gstPercent / 100)) * 100) / 100;
                        return rowTotal ? rowTotal.toString() : '';
                      })()}
                      onChange={(e) => handleTotalChange(e, labourList, setLabourList, idx)}
                      placeholder="Total"
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono text-right font-bold text-indigo-650 focus:border-indigo-500"
                    />
                  </div>

                  <div className="w-12 shrink-0 pb-1 flex justify-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveLabourRow(idx)}
                      className="text-red-500 hover:text-red-700 p-2 rounded-lg border border-slate-200/40 hover:bg-red-50 dark:hover:bg-red-950/20"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Insurance Claim parameters */}
        <div className="bg-slate-50 dark:bg-slate-950/20 p-5 rounded-2xl border border-slate-100 dark:border-slate-850 space-y-4">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" /> Insurance Surveyor claims
          </h4>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Insurance Provider</label>
              <input
                type="text"
                value={insuranceDetails.insuranceCompany}
                onChange={(e) => setInsuranceDetails({ ...insuranceDetails, insuranceCompany: e.target.value })}
                placeholder="e.g. HDFC Ergo"
                className="w-full px-3.5 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Claim Number</label>
              <input
                type="text"
                value={insuranceDetails.claimNo}
                onChange={(e) => setInsuranceDetails({ ...insuranceDetails, claimNo: e.target.value })}
                placeholder="e.g. CLM192837"
                className="w-full px-3.5 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Surveyor Name</label>
              <input
                type="text"
                value={insuranceDetails.surveyorName}
                onChange={(e) => setInsuranceDetails({ ...insuranceDetails, surveyorName: e.target.value })}
                placeholder="e.g. Mr. Amit Mehta"
                className="w-full px-3.5 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Survey Date</label>
              <input
                type="date"
                value={insuranceDetails.surveyDate}
                onChange={(e) => setInsuranceDetails({ ...insuranceDetails, surveyorDate: e.target.value })}
                className="w-full px-3.5 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* GST Tax Invoice Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-100 dark:border-slate-800 pt-6">
          <div className="space-y-4">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Amount In Words (Auto Generated)</span>
              <p className="text-xs font-bold text-slate-650 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/20 p-3 rounded-xl border border-slate-200/50 mt-1 italic">
                {convertNumberToWords(totals.roundedGrandTotal || totals.grandTotal)}
              </p>
            </div>
            {/* Insurance Splits */}
            <div className="bg-indigo-50/30 dark:bg-indigo-950/15 border border-indigo-150/30 p-4 rounded-2xl space-y-3">
              <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider block">Insurance Coverage split</span>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Approved Amount (₹)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={insuranceDetails.approvedAmount}
                    onChange={(e) => handleInsuranceNumericChange(e, 'approvedAmount', true)}
                    placeholder="Enter approved amount"
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                  />
                </div>
                <div className="flex-1">
                  <span className="block text-[9px] font-bold text-slate-450 uppercase tracking-wider mb-1">Customer Payable (₹)</span>
                  <span className="text-sm font-extrabold text-indigo-900 dark:text-indigo-400 h-[30px] flex items-center font-mono">
                    ₹{insuranceDetails.customerPayableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Totals Table */}
          <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-205/30 p-5 rounded-2xl space-y-3">
            <div className="flex justify-between text-xs font-semibold text-slate-550">
              <span>Spare Parts Subtotal (after discount):</span>
              <span>₹{totals.partsTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold text-slate-550">
              <span>Labour Subtotal (after discount):</span>
              <span>₹{totals.labourTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 border-t border-slate-200/50 pt-2 pb-1">
              <span>Net Taxable Value:</span>
              <span>₹{(totals.partsTotal + totals.labourTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold text-slate-550">
              <span>Total Discount:</span>
              <span className="text-emerald-600 font-bold">-₹{totals.discountTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            
            {gstDetails.isInterstate ? (
              <div className="flex justify-between text-xs font-semibold text-slate-550">
                <span>IGST Total:</span>
                <span>₹{totals.igstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-xs font-semibold text-slate-550">
                  <span>CGST Total:</span>
                  <span>₹{totals.cgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold text-slate-550">
                  <span>SGST Total:</span>
                  <span>₹{totals.sgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </>
            )}

            <div className="flex justify-between text-xs font-semibold text-slate-550">
              <span>Total GST:</span>
              <span>₹{totals.gstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            {/* Grand Total Manual Override */}
            {['Super Admin', 'Admin', 'Billing', 'Accounts', 'Branch Manager'].includes(user?.role) && (
              <div className="flex items-center justify-between border-t border-slate-200/50 pt-2 text-xs font-bold text-slate-550 select-none">
                <span className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualOverride}
                    onChange={(e) => {
                      if (!e.target.checked) {
                        setManualOverride(false);
                        setTriggerRecalc(prev => prev + 1);
                      } else {
                        setManualOverride(true);
                        setOverriddenGrandTotal(totals.grandTotal.toString());
                      }
                    }}
                    className="rounded border-slate-300 text-indigo-650 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>Manual Override Grand Total</span>
                </span>
                {manualOverride && (
                  <span className="text-[10px] text-red-500 uppercase tracking-widest font-black animate-pulse">
                    Manual Override Active
                  </span>
                )}
              </div>
            )}

            <div className="flex justify-between items-center text-sm font-semibold border-t border-slate-200/50 pt-3 text-slate-900 dark:text-white">
              <span>Grand Total:</span>
              {manualOverride ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={overriddenGrandTotal}
                    onChange={(e) => handleGrandTotalOverride(e.target.value)}
                    className="w-32 px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono font-black focus:outline-none focus:ring-2 focus:ring-indigo-500 text-right"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setManualOverride(false);
                      setTriggerRecalc(prev => prev + 1);
                    }}
                    className="text-[10px] bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-1.5 rounded-lg transition-colors font-bold"
                  >
                    Reset
                  </button>
                </div>
              ) : (
                <span>₹{totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              )}
            </div>

            <div className="flex justify-between text-base font-black border-t-2 border-double border-slate-300/60 pt-3 text-indigo-700 dark:text-indigo-400">
              <span>Rounded Grand Total:</span>
              <span>₹{totals.roundedGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <div className="flex justify-between text-xs font-semibold text-slate-550 border-t border-slate-205 pt-2">
              <span>Advance Received:</span>
              <span className="text-emerald-600 dark:text-emerald-450 font-mono">- ₹{advanceReceived.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <div className="flex justify-between text-base font-black border-t border-slate-200/50 pt-2 text-indigo-750 dark:text-indigo-400">
              <span>Final Bill / Balance Due:</span>
              <span className="text-indigo-800 dark:text-indigo-300 font-mono">₹{Math.max(0, totals.roundedGrandTotal - advanceReceived).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Action Footers */}
        <div className="flex justify-between gap-3 pt-6 border-t border-slate-100 dark:border-slate-800 mt-8">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-750 dark:text-slate-350 transition-colors"
          >
            Cancel
          </button>
          
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleSave(false)}
              className="px-5 py-2.5 bg-slate-805 hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-200"
            >
              Save as Draft
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10"
            >
              Finalize & Deduct Stock
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
