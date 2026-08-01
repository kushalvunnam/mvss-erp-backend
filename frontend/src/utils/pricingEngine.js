/**
 * Shared Workshop ERP Pricing Engine
 * Performs standard parts and labour master billing calculations
 * Basic Value = MRP / (1 + GST%)
 * Taxable Value = Basic Value - Discount
 * CGST = Taxable * CGST%
 * SGST = Taxable * SGST%
 * Grand Total = Taxable + GST
 */
export function calculatePricing({
  purchasePrice = 0,
  marginPercent = 0,
  sellingPrice = 0, // basic unit selling price (Rate)
  quantity = 1,
  discountPercent = 0,
  discountAmount = 0,
  discountType = 'Percent',
  gstPercent = 18,
  mrp = 0,
  taxableAmount = null,
  changedField = null,
  manualFinalTotal = null
}) {
  const costVal = Math.max(0, parseFloat(purchasePrice) || 0); // Unit cost
  const qty = Math.max(1, parseFloat(quantity) || 1);
  const gstP = Math.max(0, parseFloat(gstPercent) || 0);
  let mrpVal = Math.max(0, parseFloat(mrp) || 0); // Unit MRP

  // If MRP is 0 but we have a basic rate/sellingPrice, initialize MRP
  if (mrpVal === 0 && parseFloat(sellingPrice) > 0) {
    mrpVal = parseFloat(sellingPrice) * (1 + gstP / 100);
  }

  // 1. Check if we have manual override of grand total
  if (manualFinalTotal !== null) {
    const finalTotalAmount = Math.max(0, parseFloat(manualFinalTotal) || 0);
    const taxVal = finalTotalAmount / (1 + gstP / 100);
    const gstAmt = finalTotalAmount - taxVal;

    let discAmt = parseFloat(discountAmount) || 0;
    let totalBasic = taxVal + discAmt;
    let unitBasic = totalBasic / qty;
    let calculatedMrp = unitBasic * (1 + gstP / 100);

    let discPercent = totalBasic > 0 ? (discAmt / totalBasic) * 100 : 0;
    discPercent = Math.max(0, Math.min(100, discPercent));
    let marginP = costVal > 0 ? ((unitBasic - costVal) / costVal) * 100 : 0;

    return {
      cost: costVal,
      marginPercent: marginP,
      sellingPrice: unitBasic,
      unitBasic,
      quantity: qty,
      subtotal: totalBasic,
      discountPercent: discPercent,
      discountAmount: discAmt,
      taxableAmount: taxVal,
      gstPercent: gstP,
      gstAmount: gstAmt,
      finalTotalAmount: finalTotalAmount,
      unitChargeRate: qty > 0 ? finalTotalAmount / qty : 0,
      mrp: calculatedMrp,
      customerSaving: (calculatedMrp * qty) > totalBasic ? (calculatedMrp * qty) - totalBasic : 0,
      customerSavingPercent: calculatedMrp > 0 && (calculatedMrp * qty) > totalBasic ? (((calculatedMrp * qty) - totalBasic) / (calculatedMrp * qty)) * 100 : 0,
      sellingExceedsMrp: false
    };
  }

  // 2. Forward/Reverse calculations based on changedField
  let unitBasic;
  let totalBasic;
  let discPercent = parseFloat(discountPercent) || 0;
  let discAmt = parseFloat(discountAmount) || 0;
  let taxVal = taxableAmount !== null ? parseFloat(taxableAmount) : null;

  if (changedField === 'taxableAmount' && taxVal !== null) {
    // Taxable Value edited manually -> Reverse calculate Basic Value, MRP, GST and Total
    if (discountType === 'Fixed') {
      totalBasic = taxVal + discAmt;
      discPercent = totalBasic > 0 ? (discAmt / totalBasic) * 100 : 0;
    } else {
      const factor = 1 - (Math.min(99.99, discPercent) / 100);
      totalBasic = taxVal / factor;
      discAmt = totalBasic - taxVal;
    }
    unitBasic = qty > 0 ? totalBasic / qty : 0;
    mrpVal = unitBasic * (1 + gstP / 100);
  } else if (changedField === 'rate') {
    unitBasic = Math.max(0, parseFloat(sellingPrice) || 0);
    mrpVal = unitBasic * (1 + gstP / 100);
    totalBasic = unitBasic * qty;
    if (discountType === 'Fixed') {
      discAmt = Math.max(0, Math.min(totalBasic, discAmt));
      discPercent = totalBasic > 0 ? (discAmt / totalBasic) * 100 : 0;
    } else {
      discPercent = Math.max(0, Math.min(100, discPercent));
      discAmt = totalBasic * (discPercent / 100);
    }
    taxVal = totalBasic - discAmt;
  } else {
    // Forward calculations for mrp changes, quantity changes, gstPercent changes, or discount edits
    unitBasic = mrpVal / (1 + gstP / 100);
    totalBasic = unitBasic * qty;

    if (changedField === 'discountPercent') {
      discPercent = Math.max(0, Math.min(100, discPercent));
      discAmt = totalBasic * (discPercent / 100);
      taxVal = totalBasic - discAmt;
    } else if (changedField === 'discountAmount') {
      discAmt = Math.max(0, Math.min(totalBasic, discAmt));
      discPercent = totalBasic > 0 ? (discAmt / totalBasic) * 100 : 0;
      taxVal = totalBasic - discAmt;
    } else {
      // qty, mrp, or gstPercent change
      if (discountType === 'Fixed') {
        discAmt = Math.max(0, Math.min(totalBasic, discAmt));
        discPercent = totalBasic > 0 ? (discAmt / totalBasic) * 100 : 0;
      } else {
        discPercent = Math.max(0, Math.min(100, discPercent));
        discAmt = totalBasic * (discPercent / 100);
      }
      taxVal = totalBasic - discAmt;
    }
  }

  // Clamp values to valid ranges
  discAmt = Math.max(0, Math.min(totalBasic, discAmt));
  discPercent = Math.max(0, Math.min(100, discPercent));
  taxVal = Math.max(0, totalBasic - discAmt);

  const gstAmt = taxVal * (gstP / 100);
  const finalTotalAmount = taxVal + gstAmt;
  const unitChargeRate = qty > 0 ? finalTotalAmount / qty : 0;

  let marginP = parseFloat(marginPercent) || 0;
  if (unitBasic > 0 && costVal > 0) {
    marginP = ((unitBasic - costVal) / costVal) * 100;
  }

  const totalMrp = mrpVal * qty;
  const customerSaving = totalMrp > totalBasic ? totalMrp - totalBasic : 0;
  const customerSavingPercent = totalMrp > 0 && totalMrp > totalBasic ? (customerSaving / totalMrp) * 100 : 0;
  const sellingExceedsMrp = totalMrp > 0 && totalBasic > totalMrp;

  return {
    cost: costVal,
    marginPercent: marginP,
    sellingPrice: unitBasic, // Basic Value (Rate)
    unitBasic,
    quantity: qty,
    subtotal: totalBasic,
    discountPercent: discPercent,
    discountAmount: discAmt,
    taxableAmount: taxVal,
    gstPercent: gstP,
    gstAmount: gstAmt,
    finalTotalAmount,
    unitChargeRate,
    mrp: mrpVal,
    customerSaving,
    customerSavingPercent,
    sellingExceedsMrp
  };
}
