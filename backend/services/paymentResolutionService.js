/**
 * Payment & Delivery Resolution Service
 * MVSS Automobiles ERP
 *
 * Authoritative single source of truth for:
 * 1. Payment mode normalization across all 7 supported modes:
 *    - Cash
 *    - UPI
 *    - Card
 *    - Bank Transfer
 *    - Cheque
 *    - QR / Scanner Payment
 *    - Other
 * 2. Multi-payment breakdown and resolution from JobCard advancePayments and finalPayments.
 * 3. Authoritative vehicle delivery date resolution.
 */

const roundToTwo = (num) => Math.round((Number(num || 0) + Number.EPSILON) * 100) / 100;

/**
 * Normalizes any payment mode string to one of the 7 standard modes,
 * or 'Unknown / Not Recorded' when missing or unidentifiable.
 * NEVER assumes 'Cash'.
 */
const normalizePaymentMode = (rawMode) => {
  if (!rawMode || typeof rawMode !== 'string') return 'Unknown / Not Recorded';
  const m = rawMode.trim();
  const lower = m.toLowerCase();

  if (!lower || lower === 'unknown' || lower === 'not recorded' || lower === 'n/a' || lower === 'none' || lower === 'undefined') {
    return 'Unknown / Not Recorded';
  }

  if (lower === 'cash') return 'Cash';
  if (lower === 'upi' || lower === 'gpay' || lower === 'phonepe' || lower === 'paytm' || lower === 'bhim') return 'UPI';
  if (lower === 'card' || lower === 'card swipe' || lower === 'credit card' || lower === 'debit card' || lower === 'pos' || lower === 'swipe') return 'Card';
  if (lower === 'bank transfer' || lower === 'bank' || lower === 'neft' || lower === 'rtgs' || lower === 'imps' || lower === 'net banking' || lower === 'wire') return 'Bank Transfer';
  if (lower === 'cheque' || lower === 'check' || lower === 'dd' || lower === 'demand draft') return 'Cheque';
  if (
    lower === 'qr / scanner payment' ||
    lower === 'qr/scanner' ||
    lower === 'scanner payment' ||
    lower === 'scanner payment (qr)' ||
    lower === 'qr' ||
    lower.includes('qr') ||
    lower.includes('scanner')
  ) {
    return 'QR / Scanner Payment';
  }
  if (lower === 'online') return 'UPI';
  if (lower === 'other' || lower === 'others') return 'Other';

  return m;
};

/**
 * Resolves all payment transactions and the effective payment method for an invoice / jobcard.
 * Returns:
 * {
 *   paymentMethod: String (e.g. 'UPI', 'Cash + Card', 'Unknown / Not Recorded'),
 *   paymentBreakdown: String (e.g. 'Split (UPI: ₹1,000.00, Bank Transfer: ₹2,000.00)'),
 *   distinctModes: Array of strings,
 *   transactions: Array of { amount, mode, type, date, reference, remarks }
 * }
 */
const resolvePaymentDetails = (invoice, jobCard) => {
  const transactions = [];

  // 1. Collect payments from JobCard
  if (jobCard) {
    if (Array.isArray(jobCard.advancePayments)) {
      jobCard.advancePayments.forEach((p) => {
        const amt = Number(p.amount) || 0;
        if (amt > 0) {
          const rawMode = p.paymentMode || p.type;
          const cleanMode = normalizePaymentMode(rawMode);
          transactions.push({
            amount: roundToTwo(amt),
            mode: cleanMode,
            rawMode: rawMode || '',
            type: 'Advance',
            date: p.paymentDate || p.createdAt || null,
            reference: p.transactionId || '',
            remarks: p.remarks || '',
            recordedBy: p.recordedBy || ''
          });
        }
      });
    }

    if (Array.isArray(jobCard.finalPayments)) {
      jobCard.finalPayments.forEach((p) => {
        const amt = Number(p.amount) || 0;
        if (amt > 0) {
          const rawMode = p.paymentType || p.paymentMode;
          const cleanMode = normalizePaymentMode(rawMode);
          transactions.push({
            amount: roundToTwo(amt),
            mode: cleanMode,
            rawMode: rawMode || '',
            type: 'Final',
            date: p.paymentDate || p.createdAt || null,
            reference: p.transactionId || p.referenceNumber || '',
            remarks: p.remarks || '',
            recordedBy: p.recordedBy || ''
          });
        }
      });
    }
  }

  // 2. If no JobCard transactions, inspect invoice directly
  if (transactions.length === 0) {
    const paidAmt = Number(invoice?.amountPaid || 0);
    const rawMethod = invoice?.paymentMethod;

    if (paidAmt > 0) {
      const cleanMode = rawMethod ? normalizePaymentMode(rawMethod) : 'Unknown / Not Recorded';
      transactions.push({
        amount: roundToTwo(paidAmt),
        mode: cleanMode,
        rawMode: rawMethod || '',
        type: 'Invoice Payment',
        date: invoice?.date || invoice?.createdAt || null,
        reference: invoice?.manualInvoiceRef || '',
        remarks: '',
        recordedBy: ''
      });
    } else {
      // Not paid or zero amount paid
      return {
        paymentMethod: rawMethod ? normalizePaymentMode(rawMethod) : 'Pending / Not Paid',
        paymentBreakdown: rawMethod ? normalizePaymentMode(rawMethod) : 'Pending / Not Paid',
        distinctModes: rawMethod ? [normalizePaymentMode(rawMethod)] : [],
        transactions: []
      };
    }
  }

  // 3. Aggregate by mode
  const modeTotals = {};
  transactions.forEach((t) => {
    modeTotals[t.mode] = roundToTwo((modeTotals[t.mode] || 0) + t.amount);
  });

  const distinctModes = Object.keys(modeTotals);

  if (distinctModes.length === 0) {
    return {
      paymentMethod: 'Unknown / Not Recorded',
      paymentBreakdown: 'Unknown / Not Recorded',
      distinctModes: [],
      transactions: []
    };
  }

  if (distinctModes.length === 1) {
    const singleMode = distinctModes[0];
    return {
      paymentMethod: singleMode,
      paymentBreakdown: singleMode,
      distinctModes,
      transactions
    };
  }

  // Multiple payment modes (Split payment)
  const breakdownParts = distinctModes.map(
    (m) => `${m}: ₹${modeTotals[m].toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  );
  const shortMethod = distinctModes.join(' + ');
  const detailedBreakdown = `Split (${breakdownParts.join(', ')})`;

  return {
    paymentMethod: shortMethod,
    paymentBreakdown: detailedBreakdown,
    distinctModes,
    transactions
  };
};

/**
 * Authoritative Vehicle Delivery Date Resolver
 *
 * Rules:
 * 1. STRICT: If vehicle has not been delivered (status is NOT 'Delivered', 'Delivered – Payment Pending',
 *    'Delivered - Payment Pending', or 'Closed'), return null.
 *    DO NOT infer delivery from invoice generation, payment receipt, or 'Ready for Delivery'.
 * 2. If status is delivered, resolve the authoritative delivery timestamp in order:
 *    a) jc.actualDeliveryDate
 *    b) jc.deliveredBy?.date
 *    c) jc.vehicleDeliveredAt
 *    d) Delivery timestamp from jc.statusHistory
 *    e) GatePass issuance date for vehicle delivery
 *    f) jc.updatedAt
 */
const resolveAuthoritativeDeliveryDate = (jobCard, gatePasses = []) => {
  if (!jobCard) return null;

  const status = String(jobCard.status || '').trim();
  const isDeliveredStatus = [
    'Delivered',
    'Delivered – Payment Pending',
    'Delivered - Payment Pending',
    'Closed'
  ].includes(status);

  // If vehicle has not been delivered, strictly return null
  if (!isDeliveredStatus) {
    return null;
  }

  // 1. First-class delivery date fields on JobCard
  if (jobCard.actualDeliveryDate && !isNaN(new Date(jobCard.actualDeliveryDate).getTime())) {
    return new Date(jobCard.actualDeliveryDate);
  }

  if (jobCard.deliveredBy && jobCard.deliveredBy.date && !isNaN(new Date(jobCard.deliveredBy.date).getTime())) {
    return new Date(jobCard.deliveredBy.date);
  }

  if (jobCard.vehicleDeliveredAt && !isNaN(new Date(jobCard.vehicleDeliveredAt).getTime())) {
    return new Date(jobCard.vehicleDeliveredAt);
  }

  // 2. Check statusHistory for when status was transitioned to Delivered / Delivered – Payment Pending
  if (Array.isArray(jobCard.statusHistory) && jobCard.statusHistory.length > 0) {
    const deliveryHistItem = jobCard.statusHistory
      .slice()
      .reverse()
      .find((h) => {
        const s = String(h.status || '').trim();
        return (
          s === 'Delivered' ||
          s === 'Delivered – Payment Pending' ||
          s === 'Delivered - Payment Pending' ||
          s === 'Closed'
        );
      });

    const histDate = deliveryHistItem?.changedAt || deliveryHistItem?.date;
    if (histDate && !isNaN(new Date(histDate).getTime())) {
      return new Date(histDate);
    }
  }

  // 3. Check linked GatePass if provided or attached
  if (Array.isArray(gatePasses) && gatePasses.length > 0) {
    const gp = gatePasses.find(
      (g) =>
        (String(g.jobCardId) === String(jobCard._id) || g.jobCardNumber === jobCard.jobCardNo) &&
        (g.passType === 'Vehicle Delivery' || g.passType === 'Customer Delivery')
    );
    if (gp && (gp.date || gp.createdAt)) {
      const gpDate = gp.date || gp.createdAt;
      if (!isNaN(new Date(gpDate).getTime())) {
        return new Date(gpDate);
      }
    }
  }

  // 4. Fallback to updatedAt for historical delivered records without explicit date
  if (jobCard.updatedAt && !isNaN(new Date(jobCard.updatedAt).getTime())) {
    return new Date(jobCard.updatedAt);
  }

  return null;
};

module.exports = {
  roundToTwo,
  normalizePaymentMode,
  resolvePaymentDetails,
  resolveAuthoritativeDeliveryDate
};
