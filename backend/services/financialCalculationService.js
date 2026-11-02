/**
 * Financial Calculation Service - MVSS Automobiles ERP
 * 
 * Central source of truth for all financial calculations and payment status evaluations
 * across Job Cards, Invoices, Customer Credits, and Waivers.
 */

const roundToTwo = (num) => {
  return Math.round((Number(num || 0) + Number.EPSILON) * 100) / 100;
};

/**
 * Pure calculation function for financial balances and payment status
 * 
 * Calculations:
 * 1. Estimated Balance Due = Estimated Repair Amount - Total Valid Advance Received
 * 2. If Advance > Estimated Repair Amount => excessAdvanceCredit = Advance - Estimated Repair Amount
 * 3. Total Waived = Sum of active approved waivers
 * 4. Net Amount Payable = Final Bill Amount - Total Waived
 * 5. Outstanding Balance = Net Amount Payable - Total Received (Advance + Final Payments)
 */
const computeFinancials = ({
  estimatedRepairAmount = 0,
  finalBillAmount = 0,
  advancePayments = [],
  finalPayments = [],
  waiver = null,
  waivers = []
}) => {
  const estAmount = Math.max(0, roundToTwo(estimatedRepairAmount));
  const billAmount = Math.max(0, roundToTwo(finalBillAmount));

  // 1. Advance Payments (sum only valid positive numbers)
  const totalAdvance = roundToTwo(
    (advancePayments || []).reduce((sum, p) => {
      const amt = Number(p?.amount) || 0;
      return sum + (amt > 0 ? amt : 0);
    }, 0)
  );

  // 2. Estimated Balance Due & Excess Advance Credit
  const rawEstBalance = roundToTwo(estAmount - totalAdvance);
  const estimatedBalanceDue = rawEstBalance > 0 ? rawEstBalance : 0;
  const excessAdvanceCredit = totalAdvance > (estAmount + 0.05)
    ? roundToTwo(totalAdvance - estAmount)
    : 0;

  // 3. Final Payments (sum only valid positive numbers)
  const totalFinal = roundToTwo(
    (finalPayments || []).reduce((sum, p) => {
      const amt = Number(p?.amount) || 0;
      return sum + (amt > 0 ? amt : 0);
    }, 0)
  );

  // 4. Total Received (Advance + Final)
  const totalReceived = roundToTwo(totalAdvance + totalFinal);

  // 5. Total Waived (sum of active waivers, or fallback to single waiver object)
  let totalWaived = 0;
  if (Array.isArray(waivers) && waivers.length > 0) {
    totalWaived = roundToTwo(
      waivers.reduce((sum, w) => {
        if (w.status !== 'Reversed') {
          const amt = Number(w.amount) || 0;
          return sum + (amt > 0 ? amt : 0);
        }
        return sum;
      }, 0)
    );
  } else if (waiver && Number(waiver.waivedAmount) > 0) {
    totalWaived = roundToTwo(Number(waiver.waivedAmount));
  }

  // 6. Net Amount Payable (Final Bill Amount minus approved waivers)
  const netAmountPayable = Math.max(0, roundToTwo(billAmount - totalWaived));

  // 7. Balance Due before waiver (legacy reference)
  const rawBalance = roundToTwo(billAmount - totalReceived);
  const balanceDue = rawBalance > 0 ? rawBalance : 0;

  // 8. Outstanding Balance after waiver deduction and total received
  let outstanding = roundToTwo(Math.max(0, netAmountPayable - totalReceived));
  if (outstanding <= 0.05) {
    outstanding = 0;
  }
  const outstandingBalance = outstanding;
  const pendingAmount = outstandingBalance; // alias for backward compatibility

  // 9. Customer Credit / Overpayment
  // If total payment received exceeds the net amount payable
  let customerCredit = 0;
  if (totalReceived > (netAmountPayable + 0.05)) {
    customerCredit = roundToTwo(totalReceived - netAmountPayable);
  }

  // 10. Payment Status Logic
  let paymentStatus = 'Pending';
  let invoicePaymentStatus = 'Unpaid';

  if (billAmount === 0) {
    if (totalReceived > 0.05) {
      paymentStatus = 'Overpaid';
      invoicePaymentStatus = 'Overpaid';
    } else {
      paymentStatus = 'Fully Paid';
      invoicePaymentStatus = 'Paid';
    }
  } else if (outstandingBalance <= 0.05) {
    if (totalWaived > 0) {
      paymentStatus = 'Waived / Fully Settled';
      invoicePaymentStatus = 'Waived / Fully Settled';
    } else if (customerCredit > 0) {
      paymentStatus = 'Overpaid';
      invoicePaymentStatus = 'Overpaid';
    } else {
      paymentStatus = 'Fully Paid';
      invoicePaymentStatus = 'Paid';
    }
  } else if (totalReceived > 0.05) {
    paymentStatus = 'Partially Paid';
    invoicePaymentStatus = 'Partially Paid';
  } else {
    paymentStatus = 'Pending';
    invoicePaymentStatus = 'Unpaid';
  }

  return {
    estimatedRepairAmount: estAmount,
    estimatedBalanceDue,
    excessAdvanceCredit,
    finalBillAmount: billAmount,
    totalAdvance,
    totalFinal,
    totalReceived,
    totalWaived,
    waivedAmount: totalWaived, // alias for backwards compatibility
    netAmountPayable,
    balanceDue,
    pendingAmount,
    outstandingBalance,
    customerCredit,
    isSettled: outstandingBalance <= 0.05,
    paymentStatus,
    invoicePaymentStatus
  };
};

/**
 * Recalculates Job Card financial totals and synchronizes with linked Invoice and Estimate.
 * Single source of truth update helper.
 */
const recalculateJobCardFinancials = async (jobCard, options = {}) => {
  if (!jobCard) return null;

  const Invoice = require('../models/Invoice');
  const Estimate = require('../models/Estimate');
  let invoice = options.invoice;

  if (!invoice && jobCard._id) {
    invoice = await Invoice.findOne({ jobCardId: jobCard._id, status: 'Finalized' });
    if (!invoice) {
      invoice = await Invoice.findOne({ jobCardId: jobCard._id, status: { $ne: 'Cancelled' } });
    }
  }

  // Synchronize Estimated Repair Amount from linked Estimate if not explicitly set
  let estAmt = Number(jobCard.estAmt) || 0;
  if (estAmt <= 0 && jobCard._id) {
    let estimate = null;
    if (jobCard.estimateId) {
      estimate = await Estimate.findById(jobCard.estimateId);
    }
    if (!estimate) {
      estimate = await Estimate.findOne({ jobCardId: jobCard._id, status: { $ne: 'Cancelled' } });
    }
    if (estimate) {
      estAmt = Number(estimate.totals?.roundedGrandTotal || estimate.totals?.grandTotal || 0);
      jobCard.estAmt = estAmt;
    }
  }

  const finalBillAmount = invoice
    ? (invoice.totals?.roundedGrandTotal || invoice.totals?.grandTotal || 0)
    : (jobCard.billingSummary?.grandTotal || 0);

  const calc = computeFinancials({
    estimatedRepairAmount: estAmt,
    finalBillAmount,
    advancePayments: jobCard.advancePayments || [],
    finalPayments: jobCard.finalPayments || [],
    waiver: jobCard.waiver || null,
    waivers: jobCard.waivers || []
  });

  // Synchronize aggregate waiver object if waivers array exists
  if (Array.isArray(jobCard.waivers) && jobCard.waivers.length > 0) {
    const activeWaivers = jobCard.waivers.filter(w => w.status !== 'Reversed');
    const latestActive = activeWaivers[activeWaivers.length - 1];
    jobCard.waiver = {
      originalBillAmount: calc.finalBillAmount,
      amountReceived: calc.totalReceived,
      waivedAmount: calc.totalWaived,
      finalCollectedAmount: calc.totalReceived,
      category: latestActive?.category || 'Customer Negotiation',
      approvedBy: latestActive?.approvedBy || '',
      remarks: latestActive?.remarks || '',
      waivedAt: latestActive?.createdAt || new Date(),
      reason: latestActive?.reason || ''
    };
  }

  // Update Job Card state
  jobCard.paymentStatus = calc.paymentStatus;
  jobCard.financialSummary = {
    estimatedRepairAmount: calc.estimatedRepairAmount,
    estimatedBalanceDue: calc.estimatedBalanceDue,
    excessAdvanceCredit: calc.excessAdvanceCredit,
    finalBillAmount: calc.finalBillAmount,
    totalAdvance: calc.totalAdvance,
    totalFinal: calc.totalFinal,
    totalReceived: calc.totalReceived,
    totalWaived: calc.totalWaived,
    waivedAmount: calc.totalWaived,
    netAmountPayable: calc.netAmountPayable,
    balanceDue: calc.balanceDue,
    pendingAmount: calc.pendingAmount,
    outstandingBalance: calc.outstandingBalance,
    customerCredit: calc.customerCredit,
    paymentStatus: calc.paymentStatus,
    lastCalculatedAt: new Date()
  };

  // If vehicle was already marked Delivered, but now has an outstanding balance due to payment deletion/reversal,
  // revert workflow status to Delivered – Payment Pending while strictly preserving historical delivery date.
  if (jobCard.status === 'Delivered' && calc.outstandingBalance > 0.05) {
    const oldStatus = jobCard.status;
    jobCard.status = 'Delivered – Payment Pending';
    if (!jobCard.statusHistory) jobCard.statusHistory = [];
    jobCard.statusHistory.push({
      status: 'Delivered – Payment Pending',
      previousStatus: oldStatus,
      changedAt: new Date(),
      changedBy: 'System / Payment Adjustment',
      remarks: 'Payment modified or removed. Outstanding balance remains on delivered vehicle.'
    });
  }

  // Synchronize to linked Invoice
  if (invoice) {
    let invoiceChanged = false;

    if (invoice.advanceReceived !== calc.totalAdvance) {
      invoice.advanceReceived = calc.totalAdvance;
      invoiceChanged = true;
    }
    if (invoice.amountPaid !== calc.totalReceived) {
      invoice.amountPaid = calc.totalReceived;
      invoiceChanged = true;
    }
    if (invoice.totalWaived !== calc.totalWaived) {
      invoice.totalWaived = calc.totalWaived;
      invoice.waiverAmount = calc.totalWaived;
      invoiceChanged = true;
    }
    if (invoice.netAmountPayable !== calc.netAmountPayable) {
      invoice.netAmountPayable = calc.netAmountPayable;
      invoiceChanged = true;
    }
    if (invoice.estimatedRepairAmount !== calc.estimatedRepairAmount) {
      invoice.estimatedRepairAmount = calc.estimatedRepairAmount;
      invoiceChanged = true;
    }
    if (invoice.balanceDue !== calc.outstandingBalance) {
      invoice.balanceDue = calc.outstandingBalance;
      invoiceChanged = true;
    }
    if (invoice.customerCredit !== calc.customerCredit) {
      invoice.customerCredit = calc.customerCredit;
      invoiceChanged = true;
    }
    if (invoice.paymentStatus !== calc.invoicePaymentStatus) {
      invoice.paymentStatus = calc.invoicePaymentStatus;
      invoiceChanged = true;
    }

    if (invoiceChanged && options.saveInvoice !== false) {
      await invoice.save();
    }
  }

  return {
    jobCard,
    invoice,
    summary: calc
  };
};

module.exports = {
  roundToTwo,
  computeFinancials,
  recalculateJobCardFinancials
};
