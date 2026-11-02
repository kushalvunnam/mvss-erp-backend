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
 */
const computeFinancials = ({
  finalBillAmount = 0,
  advancePayments = [],
  finalPayments = [],
  waiver = null
}) => {
  const billAmount = Math.max(0, roundToTwo(finalBillAmount));

  // 1. Advance Payments (sum only valid positive numbers)
  const totalAdvance = roundToTwo(
    (advancePayments || []).reduce((sum, p) => {
      const amt = Number(p?.amount) || 0;
      return sum + (amt > 0 ? amt : 0);
    }, 0)
  );

  // 2. Final Payments (sum only valid positive numbers)
  const totalFinal = roundToTwo(
    (finalPayments || []).reduce((sum, p) => {
      const amt = Number(p?.amount) || 0;
      return sum + (amt > 0 ? amt : 0);
    }, 0)
  );

  // 3. Total Received (Advance + Final)
  const totalReceived = roundToTwo(totalAdvance + totalFinal);

  // 4. Waived Amount (from approved waiver record)
  const waivedAmount = (waiver && Number(waiver.waivedAmount) > 0)
    ? roundToTwo(Number(waiver.waivedAmount))
    : 0;

  // 5. Balance Due before waiver
  const rawBalance = roundToTwo(billAmount - totalReceived);
  const balanceDue = rawBalance > 0 ? rawBalance : 0;

  // 6. Pending Amount after waiver deduction
  let pending = roundToTwo(Math.max(0, balanceDue - waivedAmount));
  if (pending <= 0.05) {
    pending = 0;
  }
  const pendingAmount = pending;

  // 7. Customer Credit / Overpayment
  // If total payment received exceeds the bill amount
  let customerCredit = 0;
  if (totalReceived > (billAmount + 0.05)) {
    customerCredit = roundToTwo(totalReceived - billAmount);
  }

  // 8. Payment Status Logic
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
  } else if (waivedAmount > 0 && pendingAmount <= 0.05) {
    if (totalReceived <= 0.05) {
      paymentStatus = 'Settled (Waived Off)';
      invoicePaymentStatus = 'Settled (Waived Off)';
    } else {
      paymentStatus = 'Settled (Waived Off)';
      invoicePaymentStatus = 'Settled (Waived Off)';
    }
  } else if (customerCredit > 0) {
    paymentStatus = 'Overpaid';
    invoicePaymentStatus = 'Overpaid';
  } else if (pendingAmount <= 0.05 && totalReceived >= (billAmount - 0.05)) {
    paymentStatus = 'Fully Paid';
    invoicePaymentStatus = 'Paid';
  } else if (totalReceived > 0.05) {
    paymentStatus = 'Partially Paid';
    invoicePaymentStatus = 'Partially Paid';
  } else {
    paymentStatus = 'Pending';
    invoicePaymentStatus = 'Unpaid';
  }

  return {
    finalBillAmount: billAmount,
    totalAdvance,
    totalFinal,
    totalReceived,
    waivedAmount,
    balanceDue,
    pendingAmount,
    customerCredit,
    isSettled: pendingAmount <= 0.05,
    paymentStatus,
    invoicePaymentStatus
  };
};

/**
 * Recalculates Job Card financial totals and synchronizes with linked Invoice
 * Single source of truth update helper.
 */
const recalculateJobCardFinancials = async (jobCard, options = {}) => {
  if (!jobCard) return null;

  const Invoice = require('../models/Invoice');
  let invoice = options.invoice;

  if (!invoice && jobCard._id) {
    invoice = await Invoice.findOne({ jobCardId: jobCard._id, status: 'Finalized' });
    if (!invoice) {
      invoice = await Invoice.findOne({ jobCardId: jobCard._id, status: { $ne: 'Cancelled' } });
    }
  }

  const finalBillAmount = invoice
    ? (invoice.totals?.roundedGrandTotal || invoice.totals?.grandTotal || 0)
    : (jobCard.billingSummary?.grandTotal || 0);

  const calc = computeFinancials({
    finalBillAmount,
    advancePayments: jobCard.advancePayments || [],
    finalPayments: jobCard.finalPayments || [],
    waiver: jobCard.waiver || null
  });

  // Update Job Card state
  jobCard.paymentStatus = calc.paymentStatus;
  jobCard.financialSummary = {
    finalBillAmount: calc.finalBillAmount,
    totalAdvance: calc.totalAdvance,
    totalFinal: calc.totalFinal,
    totalReceived: calc.totalReceived,
    waivedAmount: calc.waivedAmount,
    balanceDue: calc.balanceDue,
    pendingAmount: calc.pendingAmount,
    customerCredit: calc.customerCredit,
    paymentStatus: calc.paymentStatus,
    lastCalculatedAt: new Date()
  };

  // If vehicle was already marked Delivered, but now has an outstanding balance due to payment deletion/reversal,
  // revert workflow status to Delivered – Payment Pending while strictly preserving historical delivery date.
  if (jobCard.status === 'Delivered' && calc.pendingAmount > 0.05) {
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
    if (invoice.balanceDue !== calc.pendingAmount) {
      invoice.balanceDue = calc.pendingAmount;
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
