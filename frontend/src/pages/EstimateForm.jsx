import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { Plus, Trash2, Save, ShoppingCart, Activity, AlertCircle } from 'lucide-react';
import { calculatePricing } from '../utils/pricingEngine';

const STANDARD_SERVICES = [
  { description: 'General Servicing', rate: 1500, gstPercent: 18 },
  { description: 'Engine Tuning', rate: 1200, gstPercent: 18 },
  { description: 'Clutch Overhaul', rate: 2800, gstPercent: 18 },
  { description: 'Brake System Overhaul', rate: 900, gstPercent: 18 },
  { description: 'Front Bumper Repair & Painting', rate: 3500, gstPercent: 18 },
  { description: 'Rear Bumper Repair & Painting', rate: 3505, gstPercent: 18 },
  { description: 'Wheel Alignment & Balancing', rate: 800, gstPercent: 18 },
  { description: 'A/C Evaporator Cleaning', rate: 1800, gstPercent: 18 },
  { description: 'Water Wash & Full Vacuum', rate: 600, gstPercent: 18 },
  { description: 'Suspension Check & Repair', rate: 2200, gstPercent: 18 }
];

const INSPECTION_MAPPING_RULES = {
  engineOil: {
    partSearch: ['Engine Oil', 'Oil'],
    labourName: 'Engine Oil Replacement Service',
    defaultLabourRate: 350
  },
  gearboxFluid: {
    partSearch: ['Gearbox Oil', 'Transmission Fluid', 'Gear Oil'],
    labourName: 'Gearbox Fluid Replacement Service',
    defaultLabourRate: 400
  },
  automaticTransmissionFluid: {
    partSearch: ['ATF', 'Transmission Fluid', 'Automatic Transmission Fluid'],
    labourName: 'ATF Replacement Service',
    defaultLabourRate: 500
  },
  differentialFluid: {
    partSearch: ['Differential Fluid', 'Diff Oil'],
    labourName: 'Differential Fluid Service',
    defaultLabourRate: 450
  },
  brakeClutchFluid: {
    partSearch: ['Brake Fluid', 'Clutch Fluid'],
    labourName: 'Brake & Clutch Fluid Bleeding',
    defaultLabourRate: 350
  },
  powerSteeringFluid: {
    partSearch: ['Steering Fluid', 'Power Steering Fluid'],
    labourName: 'Power Steering Fluid Flush',
    defaultLabourRate: 300
  },
  batteryFluid: {
    partSearch: ['Distilled Water', 'Battery Water', 'Battery'],
    labourName: 'Battery Service & Top-up',
    defaultLabourRate: 150
  },
  windscreenWashingFluid: {
    partSearch: ['Windshield Washer', 'Wiper Fluid'],
    labourName: 'Windscreen Washer Refill',
    defaultLabourRate: 100
  },
  coolantAntiFreezeFluid: {
    partSearch: ['Coolant', 'Antifreeze'],
    labourName: 'Coolant Level Service',
    defaultLabourRate: 300
  },
  engineOilFilter: {
    partSearch: ['Oil Filter'],
    labourName: 'Engine Oil & Filter Service',
    defaultLabourRate: 400
  },
  airFilterAirconFilter: {
    partSearch: ['Air Filter', 'Cabin Filter', 'AC Filter'],
    labourName: 'Air & AC Filter Replacement',
    defaultLabourRate: 250
  },
  fuelFilter: {
    partSearch: ['Fuel Filter'],
    labourName: 'Fuel Filter Replacement Service',
    defaultLabourRate: 350
  },
  tightnessOfBelts: {
    partSearch: ['V-Belt', 'Alternator Belt', 'Serpentine Belt', 'Belt'],
    labourName: 'Belt Tightening & Adjustment Service',
    defaultLabourRate: 300
  },
  engineTuning: {
    partSearch: ['Spark Plug', 'Sparkplugs', 'Air Intake Cleaner'],
    labourName: 'Engine Tuning Service',
    defaultLabourRate: 1200
  },
  clutch: {
    partSearch: ['Clutch Kit', 'Clutch Plate', 'Release Bearing', 'Clutch Cylinder'],
    labourName: 'Clutch Overhaul & Setting',
    defaultLabourRate: 2800
  },
  handbrakeSystem: {
    partSearch: ['Handbrake Cable', 'Parking Brake'],
    labourName: 'Handbrake Setting & Cable Adjustment',
    defaultLabourRate: 350
  },
  vacuumPumpBrakeBooster: {
    partSearch: ['Brake Booster', 'Vacuum Pump'],
    labourName: 'Brake Booster Vacuum Testing',
    defaultLabourRate: 600
  },
  sparkPlugs: {
    partSearch: ['Spark Plug', 'Plugs'],
    labourName: 'Spark Plug Replacement Service',
    defaultLabourRate: 200
  },
  suspension: {
    partSearch: ['Shock Absorber', 'Strut', 'Lower Arm', 'Link Rod', 'Bush'],
    labourName: 'Suspension Inspection & Greasing',
    defaultLabourRate: 800
  },
  rubberMudFlapProtector: {
    partSearch: ['Mud Flap', 'Mudguard', 'Protector'],
    labourName: 'Mud Flap Fitting Service',
    defaultLabourRate: 150
  },
  fuelInjectors: {
    partSearch: ['Fuel Injector', 'Injector Cleaner'],
    labourName: 'Fuel Injector Cleaning & Calibration',
    defaultLabourRate: 900
  },
  headlightsFoglightsTails: {
    partSearch: ['Bulb', 'Headlight', 'Foglight Bulb', 'Tail Light'],
    labourName: 'Lighting System Bulb Replacement',
    defaultLabourRate: 200
  },
  brakelightsReverse: {
    partSearch: ['Brake Bulb', 'Reverse Bulb'],
    labourName: 'Brake & Reverse Light Service',
    defaultLabourRate: 150
  },
  signalLights: {
    partSearch: ['Indicator Bulb', 'Signal Bulb'],
    labourName: 'Indicator & Signal Light Service',
    defaultLabourRate: 150
  },
  tyreTread: {
    partSearch: ['Tyre', 'Tyres'],
    labourName: 'Tyre Tread Depth Inspection',
    defaultLabourRate: 150
  },
  tyrePressure: {
    partSearch: ['Tyre Valve', 'Air Valve'],
    labourName: 'Tyre Pressure Correction Service',
    defaultLabourRate: 100
  },
  windscreenWiperWasher: {
    partSearch: ['Wiper Blade', 'Wiper'],
    labourName: 'Wiper Motor & Washer Nozzle Adjustment',
    defaultLabourRate: 200
  },
  safetyNutsBolts: {
    partSearch: ['Lug Nut', 'Bolt', 'Wheel Nut'],
    labourName: 'Underchassis Nut & Bolt Tightening',
    defaultLabourRate: 400
  },
  horn: {
    partSearch: ['Horn', 'Dual Horn'],
    labourName: 'Horn Sound Tuning & Relay check',
    defaultLabourRate: 200
  },
  exhaustPipesMounting: {
    partSearch: ['Exhaust Hanger', 'Muffler Mount', 'Silencer Clamp'],
    labourName: 'Exhaust Pipe Mounting Service',
    defaultLabourRate: 350
  },
  safetyBelts: {
    partSearch: ['Seat Belt', 'Safety Belt'],
    labourName: 'Seatbelt Lock Lubrication & Test',
    defaultLabourRate: 150
  },
  driveShaftDustCovers: {
    partSearch: ['Bellows', 'CV Joint Boot', 'Dust Cover', 'Shaft Boot'],
    labourName: 'CV Joint Boot Fitting Service',
    defaultLabourRate: 600
  }
};

export default function EstimateForm({ token, user, onSaved, onCancel, editId = null }) {
  const [jobCards, setJobCards] = useState([]);
  const [inventory, setInventory] = useState([]);
  
  // Selection
  const [selectedJcId, setSelectedJcId] = useState('');
  const [partsList, setPartsList] = useState([]);
  const [labourList, setLabourList] = useState([{ description: '', rate: '', gstPercent: '' }]);

  // Totals
  const [totals, setTotals] = useState({
    partsTotal: 0,
    labourTotal: 0,
    gstTotal: 0,
    grandTotal: 0
  });

  const [manualOverride, setManualOverride] = useState(false);
  const [overriddenGrandTotal, setOverriddenGrandTotal] = useState('');
  const [triggerRecalc, setTriggerRecalc] = useState(0);

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
  const handleDiscountPercentChange = (list, setter, idx, val) => {
    setManualOverride(false);
    const updated = [...list];
    const item = { ...updated[idx] };
    const qty = Math.max(1, parseFloat(item.qty) || 1);
    const rate = parseFloat(item.rate) || 0;
    const gross = qty * rate;
    
    const cleanPct = cleanNumberInput(val, true);
    const pctNum = Math.max(0, Math.min(100, parseFloat(cleanPct) || 0));
    const calculatedAmt = (gross * (pctNum / 100)).toFixed(2);
    
    item.discountPercent = cleanPct;
    item.discountAmount = calculatedAmt;
    item.discount = calculatedAmt;
    updated[idx] = item;
    setter(updated);
  };

  const handleDiscountAmountChange = (list, setter, idx, val) => {
    setManualOverride(false);
    const updated = [...list];
    const item = { ...updated[idx] };
    const qty = Math.max(1, parseFloat(item.qty) || 1);
    const rate = parseFloat(item.rate) || 0;
    const gross = qty * rate;
    
    const cleanAmt = cleanNumberInput(val, true);
    const amtNum = Math.max(0, Math.min(gross, parseFloat(cleanAmt) || 0));
    const calculatedPercent = gross > 0 ? ((amtNum / gross) * 100).toFixed(2) : '0';
    
    item.discountAmount = cleanAmt;
    item.discountPercent = calculatedPercent;
    item.discount = cleanAmt;
    updated[idx] = item;
    setter(updated);
  };

  const handleDiscountTypeChange = (list, setter, idx, type) => {
    setManualOverride(false);
    const updated = [...list];
    const item = { ...updated[idx] };
    item.discountType = type;
    
    const qty = Math.max(1, parseFloat(item.qty) || 1);
    const rate = parseFloat(item.rate) || 0;
    const gross = qty * rate;
    
    if (type === 'Percent') {
      const pct = parseFloat(item.discountPercent) || 0;
      item.discountAmount = (gross * (pct / 100)).toFixed(2);
      item.discount = item.discountAmount;
    } else {
      const amt = parseFloat(item.discountAmount) || 0;
      item.discountPercent = gross > 0 ? ((amt / gross) * 100).toFixed(2) : '0';
      item.discount = amt.toString();
    }
    updated[idx] = item;
    setter(updated);
  };

  const handleRowNumericChange = (e, list, setter, idx, field, allowDecimal = true, maxVal = null) => {
    setManualOverride(false);
    const input = e.target;
    const originalValue = input.value;
    const processedValue = cleanNumberInput(originalValue, allowDecimal, maxVal);
    
    const selectionStart = input.selectionStart;
    
    const updatedList = [...list];
    let item = { ...updatedList[idx], [field]: processedValue };

    if (field === 'qty' || field === 'rate') {
      const qty = Math.max(1, parseFloat(item.qty) || 1);
      const rate = parseFloat(item.rate) || 0;
      const gross = qty * rate;
      const type = item.discountType || 'Percent';
      
      if (type === 'Percent') {
        const pct = parseFloat(item.discountPercent) || 0;
        item.discountAmount = (gross * (pct / 100)).toFixed(2);
        item.discount = item.discountAmount;
      } else {
        const amt = parseFloat(item.discountAmount) || 0;
        item.discountPercent = gross > 0 ? ((amt / gross) * 100).toFixed(2) : '0';
        item.discount = amt.toString();
      }
    }

    updatedList[idx] = item;
    setter(updatedList);

    requestAnimationFrame(() => {
      if (input && input.setSelectionRange) {
        const beforeCursor = originalValue.slice(0, selectionStart);
        const cleanBeforeCursor = cleanNumberInput(beforeCursor, allowDecimal, maxVal);
        const newCursorPos = cleanBeforeCursor.length;
        input.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        
        // Load active jobcards (excluding fully delivered ones)
        const jcRes = await fetch(`${API_BASE_URL}/jobcards`, { headers });
        const invRes = await fetch(`${API_BASE_URL}/inventory`, { headers });
        
        if (jcRes.ok && invRes.ok) {
          const jcData = await jcRes.ok ? await jcRes.json() : [];
          setJobCards(jcData.filter(jc => jc.status !== 'Delivered'));
          setInventory(await invRes.json());
        }

        // If a specific jobcard ID is passed via localStorage
        const storedJcId = localStorage.getItem('create_estimate_jc_id');
        if (storedJcId) {
          setSelectedJcId(storedJcId);
          localStorage.removeItem('create_estimate_jc_id');
        }

        // If editing an existing estimate
        if (editId) {
          const estRes = await fetch(`${API_BASE_URL}/estimates/${editId}`, { headers });
          if (estRes.ok) {
            const est = await estRes.json();
            setSelectedJcId(est.jobCardId._id);
            setPartsList(est.parts.map(p => {
              const qty = p.qty || 1;
              const rate = p.rate || 0;
              const gross = qty * rate;
              const discAmt = p.discount || 0;
              const pct = gross > 0 ? ((discAmt / gross) * 100).toFixed(2) : '0';
              return {
                partId: p.partId?._id || p.partId || '',
                name: p.name,
                partNo: p.partNo,
                hsnCode: p.hsnCode,
                unit: p.unit || 'Pcs',
                qty: qty.toString(),
                rate: rate.toString(),
                discount: discAmt.toString(),
                discountAmount: discAmt.toString(),
                discountPercent: pct,
                discountType: 'Fixed',
                gstPercent: p.gstPercent !== undefined && p.gstPercent !== null ? p.gstPercent.toString() : ''
              };
            }));
            setLabourList(est.labour.map(l => {
              const qty = 1;
              const rate = l.rate || 0;
              const gross = qty * rate;
              const discAmt = l.discount || 0;
              const pct = gross > 0 ? ((discAmt / gross) * 100).toFixed(2) : '0';
              return {
                description: l.description,
                qty: '1',
                rate: rate.toString(),
                discount: discAmt.toString(),
                discountAmount: discAmt.toString(),
                discountPercent: pct,
                discountType: 'Fixed',
                gstPercent: l.gstPercent !== undefined && l.gstPercent !== null ? l.gstPercent.toString() : ''
              };
            }));
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, [token, editId]);

  // Compile Job Card inspection audit report data for matching and UI
  const getInspectionAudit = () => {
    if (!selectedJcId) return null;
    const jc = jobCards.find(item => item._id === selectedJcId);
    if (!jc || !jc.inspectionChecklist) return null;

    const failed = [];
    const matchedParts = [];
    const matchedLabour = [];
    const unmatched = [];

    const mapping = INSPECTION_MAPPING_RULES;

    Object.keys(jc.inspectionChecklist).forEach(key => {
      const val = jc.inspectionChecklist[key];
      let isFail = false;
      let remarks = '';
      if (val && typeof val === 'object') {
        const status = (val.status || '').toUpperCase();
        isFail = (status === 'NO' || status === 'NOT OK' || status === 'FAIL');
        remarks = val.remarks || '';
      } else if (val && typeof val === 'string') {
        const status = val.toUpperCase();
        isFail = (status === 'NO' || status === 'NOT OK' || status === 'FAIL');
      }

      if (isFail) {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
        failed.push({ key, label, remarks });

        const rule = mapping[key] || {
          partSearch: [key.replace(/([A-Z])/g, ' $1')],
          labourName: `${key.replace(/([A-Z])/g, ' $1')} Service`,
          defaultLabourRate: 500
        };

        let matchedPart = null;
        for (const term of rule.partSearch) {
          matchedPart = inventory.find(item => {
            const nameMatch = item.partName.toLowerCase().includes(term.toLowerCase());
            const skuMatch = item.partNumber && item.partNumber.toLowerCase().includes(term.toLowerCase());
            const compatMatch = item.vehicleCompatibility && item.vehicleCompatibility.toLowerCase().includes(term.toLowerCase());
            const categoryMatch = item.category && item.category.toLowerCase().includes(term.toLowerCase());
            return nameMatch || skuMatch || compatMatch || categoryMatch;
          });
          if (matchedPart) break;
        }

        if (matchedPart) {
          matchedParts.push({
            failedItem: label,
            partName: matchedPart.partName,
            sku: matchedPart.partNumber || 'N/A',
            price: matchedPart.sellingPrice || 0,
            stock: matchedPart.stockQuantity || 0
          });
        } else {
          const standardMatch = STANDARD_SERVICES.find(s => 
            s.description.toLowerCase().includes(rule.labourName.toLowerCase()) || 
            rule.labourName.toLowerCase().includes(s.description.toLowerCase())
          );
          const rate = standardMatch ? standardMatch.rate : rule.defaultLabourRate;
          matchedLabour.push({
            failedItem: label,
            serviceName: rule.labourName,
            rate: rate
          });
          unmatched.push({
            failedItem: label,
            suggestedService: rule.labourName
          });
        }
      }
    });

    return { failed, matchedParts, matchedLabour, unmatched };
  };

  // Auto-map failed inspection items to suggested parts list and labour list
  useEffect(() => {
    if (editId) return;

    if (!selectedJcId || jobCards.length === 0 || inventory.length === 0) {
      setPartsList([]);
      setLabourList([{ description: '', rate: '', gstPercent: '' }]);
      return;
    }

    const jc = jobCards.find(item => item._id === selectedJcId);
    if (!jc) return;

    const inspection = jc.inspectionChecklist || {};
    const failedItems = [];

    Object.keys(inspection).forEach(key => {
      const val = inspection[key];
      let isFail = false;
      if (val && typeof val === 'object') {
        const status = (val.status || '').toUpperCase();
        isFail = (status === 'NO' || status === 'NOT OK' || status === 'FAIL');
      } else if (val && typeof val === 'string') {
        const status = val.toUpperCase();
        isFail = (status === 'NO' || status === 'NOT OK' || status === 'FAIL');
      }
      if (isFail) {
        failedItems.push(key);
      }
    });

    const mapping = INSPECTION_MAPPING_RULES;
    const suggestedParts = [];
    const suggestedLabour = [];
    const matchedPartIds = new Set();
    const matchedLabourNames = new Set();

    failedItems.forEach(failedKey => {
      const rule = mapping[failedKey] || {
        partSearch: [failedKey.replace(/([A-Z])/g, ' $1')],
        labourName: `${failedKey.replace(/([A-Z])/g, ' $1')} Service`,
        defaultLabourRate: 500
      };

      let matchedInventoryPart = null;
      for (const term of rule.partSearch) {
        matchedInventoryPart = inventory.find(item => {
          const nameMatch = item.partName.toLowerCase().includes(term.toLowerCase());
          const skuMatch = item.partNumber && item.partNumber.toLowerCase().includes(term.toLowerCase());
          const compatMatch = item.vehicleCompatibility && item.vehicleCompatibility.toLowerCase().includes(term.toLowerCase());
          const categoryMatch = item.category && item.category.toLowerCase().includes(term.toLowerCase());
          return nameMatch || skuMatch || compatMatch || categoryMatch;
        });
        if (matchedInventoryPart) break;
      }

      if (matchedInventoryPart) {
        if (!matchedPartIds.has(matchedInventoryPart._id)) {
          matchedPartIds.add(matchedInventoryPart._id);
          suggestedParts.push({
            partId: matchedInventoryPart._id,
            name: matchedInventoryPart.partName,
            partNo: matchedInventoryPart.partNumber || '',
            hsnCode: matchedInventoryPart.hsnCode || '',
            unit: matchedInventoryPart.unit || 'Pcs',
            qty: '1',
            rate: (matchedInventoryPart.sellingPrice || 0).toString(),
            discount: '0',
            gstPercent: (matchedInventoryPart.gstPercent || 18).toString()
          });
        }
      } else {
        const name = rule.labourName;
        if (!matchedLabourNames.has(name)) {
          matchedLabourNames.add(name);
          
          const standardMatch = STANDARD_SERVICES.find(s => 
            s.description.toLowerCase().includes(name.toLowerCase()) || 
            name.toLowerCase().includes(s.description.toLowerCase())
          );
          const rate = standardMatch ? standardMatch.rate : rule.defaultLabourRate;
          const gstPercent = standardMatch ? standardMatch.gstPercent : 18;

          suggestedLabour.push({
            description: name,
            rate: rate.toString(),
            discount: '0',
            gstPercent: gstPercent.toString()
          });
        }
      }
    });

    setPartsList(suggestedParts);
    setLabourList(suggestedLabour.length > 0 ? suggestedLabour : [{ description: '', rate: '', gstPercent: '' }]);
  }, [selectedJcId, jobCards, inventory, editId]);

  // Handle live recalculation
  useEffect(() => {
    let partsTotal = 0;
    let labourTotal = 0;
    let gstTotal = 0;

    partsList.forEach(part => {
      const pricing = calculatePricing({
        sellingPrice: part.rate,
        quantity: part.qty,
        discountAmount: part.discount,
        lastDiscountEdited: 'amount',
        gstPercent: part.gstPercent
      });
      partsTotal += pricing.taxableAmount;
      gstTotal += pricing.gstAmount;
    });

    labourList.forEach(lab => {
      const pricing = calculatePricing({
        sellingPrice: lab.rate,
        quantity: lab.qty || 1,
        discountAmount: lab.discount,
        lastDiscountEdited: 'amount',
        gstPercent: lab.gstPercent
      });
      labourTotal += pricing.taxableAmount;
      gstTotal += pricing.gstAmount;
    });

    const calculatedGrandTotal = Math.round((partsTotal + labourTotal + gstTotal) * 100) / 100;

    setTotals({
      partsTotal: Math.round(partsTotal * 100) / 100,
      labourTotal: Math.round(labourTotal * 100) / 100,
      gstTotal: Math.round(gstTotal * 100) / 100,
      grandTotal: manualOverride && overriddenGrandTotal !== '' ? parseFloat(overriddenGrandTotal) || 0 : calculatedGrandTotal
    });
  }, [partsList, labourList, manualOverride, overriddenGrandTotal, triggerRecalc]);

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
        discountAmount: part.discount,
        lastDiscountEdited: 'amount',
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
        discountAmount: lab.discount,
        lastDiscountEdited: 'amount',
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
        const disc = parseFloat(lab.discount) || 0;
        const oldTaxable = Math.max(0, (rate * qty) - disc);
        const oldTotal = oldTaxable * (1 + gst / 100);
        
        const newTotal = oldTotal * ratio;
        const newTaxable = newTotal / (1 + gst / 100);
        
        // Rate * Qty = newTaxable + disc
        const newRate = (newTaxable + disc) / qty;
        
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
        const newTaxable = newTotalPerItem / (1 + gst / 100);
        const newRate = newTaxable / qty;
        return {
          ...lab,
          rate: Math.max(0, Math.round(newRate * 100) / 100).toString()
        };
      });
      setLabourList(updatedLabour);
    }
  };

  // Parts rows operations
  const handleAddPartRow = () => {
    setManualOverride(false);
    setPartsList([...partsList, { partId: '', name: '', partNo: '', hsnCode: '', unit: 'Pcs', qty: '1', rate: '', discount: '0', discountPercent: '0', discountAmount: '0', discountType: 'Percent', gstPercent: '' }]);
  };

  const handleRemovePartRow = (idx) => {
    setManualOverride(false);
    const list = [...partsList];
    list.splice(idx, 1);
    setPartsList(list);
  };

  const handlePartSelect = (idx, partId) => {
    setManualOverride(false);
    const part = inventory.find(item => item._id === partId);
    if (!part) return;

    const list = [...partsList];
    list[idx] = {
      ...list[idx],
      partId: part._id,
      name: part.partName,
      partNo: part.partNumber,
      hsnCode: part.hsnCode,
      unit: part.unit || 'Pcs',
      rate: part.sellingPrice !== undefined && part.sellingPrice !== null ? part.sellingPrice.toString() : '',
      gstPercent: part.gstPercent !== undefined && part.gstPercent !== null ? part.gstPercent.toString() : ''
    };
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
    setLabourList([...labourList, { description: '', qty: '1', rate: '', discount: '0', discountPercent: '0', discountAmount: '0', discountType: 'Percent', gstPercent: '' }]);
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
    setLabourList(list);
  };

  const handleSave = async () => {
    if (!selectedJcId) {
      alert('Please select a Job Card first.');
      return;
    }

    // Clean up empty or invalid parts rows before saving
    const cleanedParts = partsList
      .filter(p => p.name && p.name.trim() !== '')
      .map(p => {
        const item = {
          name: p.name.trim(),
          partNo: p.partNo ? p.partNo.trim() : '',
          hsnCode: p.hsnCode ? p.hsnCode.trim() : '',
          unit: p.unit || 'Pcs',
          qty: Math.max(1, Number(p.qty) || 1), // Mongoose requires min: 1
          rate: Number(p.rate) || 0,
          discount: Number(p.discount) || 0,
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
        rate: Number(l.rate) || 0,
        discount: Number(l.discount) || 0,
        gstPercent: Number(l.gstPercent) || 0
      }));

    if (cleanedParts.length === 0 && cleanedLabour.length === 0) {
      alert('Please add at least one spare part or labour service with a description.');
      return;
    }

    const payload = {
      jobCardId: selectedJcId,
      parts: cleanedParts,
      labour: cleanedLabour
    };

    const url = editId
      ? `${API_BASE_URL}/estimates/${editId}`
      : `${API_BASE_URL}/estimates`;
    const method = editId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        onSaved();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save estimate.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred while saving the estimate.');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl max-w-5xl mx-auto select-none animate-fade-in">
      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
        <div>
          <h2 className="text-base font-extrabold text-slate-800 dark:text-white uppercase tracking-wider">
            {editId ? 'Edit Estimate' : 'Create Proforma Estimate'}
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
            Build Parts & Labour cost breakdown
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
        {/* Job Card Selection */}
        <div className="bg-slate-50 dark:bg-slate-950/20 p-5 rounded-2xl border border-slate-100 dark:border-slate-850">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
            Select Job Card Reference
          </label>
          <select
            value={selectedJcId}
            onChange={(e) => setSelectedJcId(e.target.value)}
            disabled={!!editId}
            className="w-full max-w-md px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 disabled:opacity-55"
          >
            <option value="">-- Choose Job Card --</option>
            {jobCards.map(jc => (
              <option key={jc._id} value={jc._id}>
                {jc.jobCardNo} - {jc.vehicleId?.vehicleNumber} ({jc.customerId?.name})
              </option>
            ))}
          </select>
        </div>

        {selectedJcId && (() => {
          const audit = getInspectionAudit();
          if (!audit) return null;
          if (audit.failed.length === 0) {
            return (
              <div className="bg-slate-50 dark:bg-slate-950/20 p-4 rounded-2xl border border-slate-100 dark:border-slate-850 text-center text-xs text-slate-450 font-semibold italic select-none">
                No spare parts suggested from inspection.
              </div>
            );
          }
          return (
            <div className="bg-indigo-50/30 dark:bg-slate-900/40 p-5 rounded-2xl border border-indigo-150/45 space-y-3 select-none">
              <div className="flex items-center gap-1.5 border-b border-indigo-100 dark:border-indigo-950 pb-2">
                <Activity className="w-4 h-4 text-indigo-650 dark:text-indigo-400 animate-pulse" />
                <h5 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">
                  Job Card Inspection Audit Report
                </h5>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Matched Spare Parts */}
                <div>
                  <span className="block text-[10px] font-black text-slate-450 uppercase tracking-widest mb-1.5">
                    Matched Spare Parts ({audit.matchedParts.length})
                  </span>
                  <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                    {audit.matchedParts.map((m, index) => (
                      <div key={index} className="bg-white dark:bg-slate-950 p-2 rounded-xl border border-slate-100 dark:border-slate-850 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                        <span className="font-bold text-indigo-650 dark:text-indigo-400 block">{m.partName}</span>
                        <div className="flex justify-between items-center mt-1 text-[8px] text-slate-400">
                          <span>SKU: {m.sku} | Stock: {m.stock}</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">₹{m.price}</span>
                        </div>
                      </div>
                    ))}
                    {audit.matchedParts.length === 0 && (
                      <span className="text-[10px] text-slate-450 italic">No parts matched in inventory</span>
                    )}
                  </div>
                </div>
                
                {/* 2. Suggested Labour Services */}
                <div>
                  <span className="block text-[10px] font-black text-slate-450 uppercase tracking-widest mb-1.5">
                    Suggested Labour Services ({audit.matchedLabour.length})
                  </span>
                  <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                    {audit.matchedLabour.map((l, index) => (
                      <div key={index} className="bg-white dark:bg-slate-950 p-2 rounded-xl border border-slate-100 dark:border-slate-850 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                        <span className="font-bold text-emerald-650 dark:text-emerald-400 block">{l.serviceName}</span>
                        <div className="flex justify-between items-center mt-1 text-[8px] text-slate-400">
                          <span>Mapped from: {l.failedItem}</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">₹{l.rate}</span>
                        </div>
                      </div>
                    ))}
                    {audit.matchedLabour.length === 0 && (
                      <span className="text-[10px] text-slate-450 italic">No labour suggested</span>
                    )}
                  </div>
                </div>

                {/* 3. Failed checklist items */}
                <div>
                  <span className="block text-[10px] font-black text-slate-450 uppercase tracking-widest mb-1.5">
                    Failed Checklist Items ({audit.failed.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto pr-1">
                    {audit.failed.map(item => {
                      const hasPart = audit.matchedParts.some(p => p.failedItem === item.label);
                      return (
                        <span key={item.key} className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border leading-tight ${
                          hasPart 
                            ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/50 text-indigo-650 dark:text-indigo-400' 
                            : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 text-amber-650 dark:text-amber-400'
                        }`}>
                          {item.label} {item.remarks ? `(${item.remarks})` : ''}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Spare parts section */}
        <div className="space-y-3">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
              <ShoppingCart className="w-4 h-4 text-indigo-500" /> Spare Parts List
            </h4>
            <button
              onClick={handleAddPartRow}
              className="text-xs font-bold text-indigo-650 hover:text-indigo-700"
            >
              + Add Spare Part
            </button>
          </div>

          <div className="space-y-2">
            {partsList.map((part, idx) => (
              <div key={idx} className="flex flex-wrap sm:flex-nowrap gap-2.5 items-end bg-slate-50 dark:bg-slate-800/10 p-3 rounded-xl border border-slate-100 dark:border-slate-850">
                <div className="w-full sm:w-44">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Select Part Catalog</label>
                  <select
                    value={part.partId}
                    onChange={(e) => handlePartSelect(idx, e.target.value)}
                    className="w-full px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-bold focus:outline-none"
                  >
                    <option value="">-- Custom Part --</option>
                    {inventory.map(item => (
                      <option key={item._id} value={item._id}>
                        {item.partName} {item.brand ? `[${item.brand}]` : ''} {item.model ? `(${item.model}${item.variant ? ` - ${item.variant}` : ''})` : ''} ({item.partNumber})
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const matched = inventory.find(item => item._id === part.partId);
                    if (matched) {
                      const avail = matched.stockQuantity;
                      const hasSufficient = avail >= (Number(part.qty) || 0);
                      return (
                        <span className={`block text-[9px] font-bold mt-1 uppercase ${hasSufficient ? 'text-emerald-500' : 'text-red-500'}`}>
                          Stock: {avail} units {hasSufficient ? '✓ Available' : '⚠️ Insufficient'}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div className="flex-1 min-w-[150px]">
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

                <div className="w-28">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Part Number</label>
                  <input
                    type="text"
                    value={part.partNo || ''}
                    onChange={(e) => handlePartRowValue(idx, 'partNo', e.target.value)}
                    placeholder="e.g. SP-ENG-10W40"
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none"
                  />
                </div>

                <div className="w-24">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">HSN Code</label>
                  <input
                    type="text"
                    value={part.hsnCode || ''}
                    onChange={(e) => handlePartRowValue(idx, 'hsnCode', e.target.value)}
                    placeholder="e.g. 27101980"
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none"
                  />
                </div>

                <div className="w-16">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Unit</label>
                  <input
                    type="text"
                    value={part.unit || 'Pcs'}
                    onChange={(e) => handlePartRowValue(idx, 'unit', e.target.value)}
                    placeholder="Unit"
                    className="w-full px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none"
                  />
                </div>

                <div className="w-20">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Rate (₹)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={part.rate}
                    onChange={(e) => handleRowNumericChange(e, partsList, setPartsList, idx, 'rate', true)}
                    placeholder="Rate"
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                  />
                </div>

                <div className="w-16">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Qty</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={part.qty}
                    onChange={(e) => handleRowNumericChange(e, partsList, setPartsList, idx, 'qty', false)}
                    placeholder="Qty"
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                  />
                </div>

                <div className="w-16">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Disc Type</label>
                  <select
                    value={part.discountType || 'Percent'}
                    onChange={(e) => handleDiscountTypeChange(partsList, setPartsList, idx, e.target.value)}
                    className="w-full h-[28px] px-1 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none"
                  >
                    <option value="Percent">Percent (%)</option>
                    <option value="Fixed">Flat (₹)</option>
                  </select>
                </div>

                <div className="w-14">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Disc %</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={part.discountPercent !== undefined ? part.discountPercent : ''}
                    onChange={(e) => handleDiscountPercentChange(partsList, setPartsList, idx, e.target.value)}
                    placeholder="0"
                    className="w-full px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                  />
                </div>

                <div className="w-20">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Disc Amt (₹)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={part.discountAmount !== undefined ? part.discountAmount : ''}
                    onChange={(e) => handleDiscountAmountChange(partsList, setPartsList, idx, e.target.value)}
                    placeholder="0.00"
                    className="w-full px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                  />
                </div>

                <div className="w-20 text-right">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Taxable (₹)</span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-350 h-[28px] flex items-center justify-end font-mono">
                    {Math.round(((Number(part.qty) * Number(part.rate)) - (Number(part.discount) || 0)) * 100) / 100}
                  </span>
                </div>

                <div className="w-36">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">GST %</label>
                  <div className="flex gap-1 items-center">
                    <select
                      value={[0, 3, 5, 12, 18, 28].includes(Number(part.gstPercent)) ? Number(part.gstPercent) : 'custom'}
                      onChange={(e) => {
                        const val = e.target.value;
                        const list = [...partsList];
                        if (val === 'custom') {
                          list[idx].gstPercent = 'custom';
                        } else {
                          list[idx].gstPercent = val;
                        }
                        setPartsList(list);
                      }}
                      disabled={!['Admin', 'Accounts'].includes(user?.role)}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none flex-1"
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
                        onChange={(e) => {
                          const list = [...partsList];
                          list[idx].gstPercent = e.target.value;
                          setPartsList(list);
                        }}
                        disabled={!['Admin', 'Accounts'].includes(user?.role)}
                        className="w-14 px-1.5 py-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                      />
                    )}
                  </div>
                </div>

                <div className="w-24 text-right pr-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Total (₹)</span>
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200 h-[28px] flex items-center justify-end font-mono">
                    {(() => {
                      const taxable = (Number(part.qty) * Number(part.rate)) - (Number(part.discount) || 0);
                      const totalVal = taxable * (1 + (Number(part.gstPercent) || 0) / 100);
                      return Math.round(totalVal * 100) / 100;
                    })()}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemovePartRow(idx)}
                  className="text-red-500 hover:text-red-700 p-2 rounded-lg border border-slate-200/40 hover:bg-red-50 dark:hover:bg-red-950/20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {partsList.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic py-2">No spare parts added to estimate.</p>
            )}
          </div>
        </div>

        {/* Labour section */}
        <div className="space-y-3">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-indigo-500" /> Labour & Service charges
            </h4>
            <button
              onClick={handleAddLabourRow}
              className="text-xs font-bold text-indigo-650 hover:text-indigo-700"
            >
              + Add Labour Description
            </button>
          </div>

          <div className="space-y-2">
            {labourList.map((lab, idx) => (
              <div key={idx} className="flex flex-wrap sm:flex-nowrap gap-2.5 items-end bg-slate-50 dark:bg-slate-800/10 p-3 rounded-xl border border-slate-100 dark:border-slate-850">
                <div className="w-full sm:w-44">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Select Service</label>
                  <select
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) return;
                      const preset = STANDARD_SERVICES.find(s => s.description === val);
                      if (preset) {
                        handleLabourRowValue(idx, 'description', preset.description);
                        handleLabourRowValue(idx, 'rate', preset.rate);
                        handleLabourRowValue(idx, 'gstPercent', preset.gstPercent);
                      }
                    }}
                    className="w-full px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-bold focus:outline-none"
                  >
                    <option value="">-- Custom Preset --</option>
                    {STANDARD_SERVICES.map(s => (
                      <option key={s.description} value={s.description}>{s.description}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1 min-w-[200px]">
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

                <div className="w-24">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Labour Cost (₹)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={lab.rate}
                    onChange={(e) => handleRowNumericChange(e, labourList, setLabourList, idx, 'rate', true)}
                    placeholder="Cost"
                    className="w-full px-3.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                  />
                </div>

                <div className="w-16">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Disc Type</label>
                  <select
                    value={lab.discountType || 'Percent'}
                    onChange={(e) => handleDiscountTypeChange(labourList, setLabourList, idx, e.target.value)}
                    className="w-full h-[28px] px-1 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none"
                  >
                    <option value="Percent">Percent (%)</option>
                    <option value="Fixed">Flat (₹)</option>
                  </select>
                </div>

                <div className="w-14">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Disc %</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={lab.discountPercent !== undefined ? lab.discountPercent : ''}
                    onChange={(e) => handleDiscountPercentChange(labourList, setLabourList, idx, e.target.value)}
                    placeholder="0"
                    className="w-full px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                  />
                </div>

                <div className="w-20">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Disc Amt (₹)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={lab.discountAmount !== undefined ? lab.discountAmount : ''}
                    onChange={(e) => handleDiscountAmountChange(labourList, setLabourList, idx, e.target.value)}
                    placeholder="0.00"
                    className="w-full px-2 py-1.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                  />
                </div>

                <div className="w-20 text-right">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Taxable (₹)</span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-350 h-[28px] flex items-center justify-end font-mono">
                    {Math.round((Number(lab.rate) - (Number(lab.discount) || 0)) * 100) / 100}
                  </span>
                </div>

                <div className="w-36">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">GST %</label>
                  <div className="flex gap-1 items-center">
                    <select
                      value={[0, 3, 5, 12, 18, 28].includes(Number(lab.gstPercent)) ? Number(lab.gstPercent) : 'custom'}
                      onChange={(e) => {
                        const val = e.target.value;
                        const list = [...labourList];
                        if (val === 'custom') {
                          list[idx].gstPercent = 'custom';
                        } else {
                          list[idx].gstPercent = val;
                        }
                        setLabourList(list);
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
                        onChange={(e) => {
                          const list = [...labourList];
                          list[idx].gstPercent = e.target.value;
                          setLabourList(list);
                        }}
                        disabled={!['Admin', 'Accounts'].includes(user?.role)}
                        className="w-14 px-1.5 py-1 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none font-mono"
                      />
                    )}
                  </div>
                </div>

                <div className="w-28 text-right pr-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Total (₹)</span>
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200 h-[28px] flex items-center justify-end font-mono">
                    {(() => {
                      const taxable = Number(lab.rate) - (Number(lab.discount) || 0);
                      const totalVal = taxable * (1 + (Number(lab.gstPercent) || 0) / 100);
                      return Math.round(totalVal * 100) / 100;
                    })()}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveLabourRow(idx)}
                  className="text-red-500 hover:text-red-700 p-2 rounded-lg border border-slate-200/40 hover:bg-red-50 dark:hover:bg-red-950/20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Summary box and action footer */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-100 dark:border-slate-800 pt-6">
          <div className="text-xs text-slate-400 font-semibold space-y-1">
            <p>1. Proforma estimates do not constitute final billing.</p>
            <p>2. Subject to final GST taxation splits based on location.</p>
            <p>3. Deducts spare parts from active catalog stock upon finalization.</p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-205/30 p-5 rounded-2xl space-y-3">
            <div className="flex justify-between text-xs font-semibold text-slate-550">
              <span>Parts Subtotal:</span>
              <span>₹{totals.partsTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold text-slate-550">
              <span>Labour Subtotal:</span>
              <span>₹{totals.labourTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 border-t border-slate-200/50 pt-2 pb-1">
              <span>Net Taxable Total:</span>
              <span>₹{(totals.partsTotal + totals.labourTotal).toLocaleString()}</span>
            </div>
             <div className="flex justify-between text-xs font-semibold text-slate-550">
              <span>GST Total:</span>
              <span>₹{totals.gstTotal.toLocaleString()}</span>
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

            <div className="flex justify-between items-center text-sm font-black border-t border-slate-200/50 pt-3 text-slate-900 dark:text-white">
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
                <span>₹{totals.grandTotal.toLocaleString()}</span>
              )}
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-750 dark:text-slate-350 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10"
          >
            <Save className="w-4 h-4" /> Save Estimate
          </button>
        </div>

      </div>
    </div>
  );
}
