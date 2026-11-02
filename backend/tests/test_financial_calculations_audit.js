/**
 * Comprehensive Financial Calculation Audit Test Suite
 * MVSS Automobiles ERP
 * 
 * Verifies Scenarios A through G and all Edge Cases
 */

const assert = require('assert');
const { computeFinancials, roundToTwo } = require('../services/financialCalculationService');

console.log('===============================================================');
console.log('   MVSS AUTOMOBILES ERP - FINANCIAL CALCULATION AUDIT TESTS    ');
console.log('===============================================================');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

// SCENARIO A
runTest('Scenario A: Job Card created -> Advance payment added (₹5,000)', () => {
  const result = computeFinancials({
    finalBillAmount: 0,
    advancePayments: [{ amount: 5000, paymentMode: 'UPI' }],
    finalPayments: [],
    waiver: null
  });

  assert.strictEqual(result.totalAdvance, 5000, 'Total advance should be 5000');
  assert.strictEqual(result.totalFinal, 0, 'Total final should be 0');
  assert.strictEqual(result.totalReceived, 5000, 'Total received should be 5000');
  // For bill = 0, advance received is treated as credit / overpaid, NOT partially paid
  assert.strictEqual(result.paymentStatus, 'Overpaid', 'Status should be Overpaid for 0 bill with 5000 advance');
  assert.strictEqual(result.customerCredit, 5000, 'Customer credit should be 5000');
});

// SCENARIO B
runTest('Scenario B: Invoice generated (₹15,000) -> Advance deducted (₹5,000) -> Balance Due = ₹10,000', () => {
  const result = computeFinancials({
    finalBillAmount: 15000,
    advancePayments: [{ amount: 5000, paymentMode: 'Bank Transfer' }],
    finalPayments: [],
    waiver: null
  });

  assert.strictEqual(result.finalBillAmount, 15000, 'Bill amount should be 15000');
  assert.strictEqual(result.totalAdvance, 5000, 'Advance should be 5000');
  assert.strictEqual(result.totalReceived, 5000, 'Total received should be 5000');
  assert.strictEqual(result.balanceDue, 10000, 'Balance due should be 10000');
  assert.strictEqual(result.pendingAmount, 10000, 'Pending amount should be 10000');
  assert.strictEqual(result.customerCredit, 0, 'Customer credit should be 0');
  assert.strictEqual(result.paymentStatus, 'Partially Paid', 'Status should be Partially Paid');
  assert.strictEqual(result.invoicePaymentStatus, 'Partially Paid', 'Invoice status should be Partially Paid');
});

// SCENARIO C
runTest('Scenario C: Final payment made (₹10,000) -> Total Received = ₹15,000, Balance Due = ₹0, status = PAID', () => {
  const result = computeFinancials({
    finalBillAmount: 15000,
    advancePayments: [{ amount: 5000, paymentMode: 'Cash' }],
    finalPayments: [{ amount: 10000, paymentType: 'QR / Scanner Payment' }],
    waiver: null
  });

  assert.strictEqual(result.totalAdvance, 5000, 'Advance should be 5000');
  assert.strictEqual(result.totalFinal, 10000, 'Final payment should be 10000');
  assert.strictEqual(result.totalReceived, 15000, 'Total received should be 15000');
  assert.strictEqual(result.balanceDue, 0, 'Balance due should be 0');
  assert.strictEqual(result.pendingAmount, 0, 'Pending amount should be 0');
  assert.strictEqual(result.customerCredit, 0, 'Customer credit should be 0');
  assert.strictEqual(result.paymentStatus, 'Fully Paid', 'JobCard status should be Fully Paid');
  assert.strictEqual(result.invoicePaymentStatus, 'Paid', 'Invoice status should be Paid');
  assert.strictEqual(result.isSettled, true, 'isSettled should be true');
});

// SCENARIO D
runTest('Scenario D: Partial final payment (₹6,000) -> Total Received = ₹11,000, Balance Due = ₹4,000, status = PARTIALLY PAID', () => {
  const result = computeFinancials({
    finalBillAmount: 15000,
    advancePayments: [{ amount: 5000, paymentMode: 'UPI' }],
    finalPayments: [{ amount: 6000, paymentType: 'Card Swipe' }],
    waiver: null
  });

  assert.strictEqual(result.totalAdvance, 5000, 'Advance should be 5000');
  assert.strictEqual(result.totalFinal, 6000, 'Final payment should be 6000');
  assert.strictEqual(result.totalReceived, 11000, 'Total received should be 11000');
  assert.strictEqual(result.balanceDue, 4000, 'Balance due should be 4000');
  assert.strictEqual(result.pendingAmount, 4000, 'Pending amount should be 4000');
  assert.strictEqual(result.customerCredit, 0, 'Customer credit should be 0');
  assert.strictEqual(result.paymentStatus, 'Partially Paid', 'JobCard status should be Partially Paid');
  assert.strictEqual(result.invoicePaymentStatus, 'Partially Paid', 'Invoice status should be Partially Paid');
  assert.strictEqual(result.isSettled, false, 'isSettled should be false');
});

// SCENARIO E
runTest('Scenario E: Balance waiver (₹4,000 waived) -> Waived = ₹4,000, Balance Due = ₹0, status = SETTLED / WAIVED', () => {
  const result = computeFinancials({
    finalBillAmount: 15000,
    advancePayments: [{ amount: 5000, paymentMode: 'UPI' }],
    finalPayments: [{ amount: 6000, paymentType: 'Cash' }],
    waiver: { waivedAmount: 4000, reason: 'Customer goodwill discount approved by management' }
  });

  assert.strictEqual(result.totalReceived, 11000, 'Cash received must remain 11000 (never inflate cash with waiver!)');
  assert.strictEqual(result.waivedAmount, 4000, 'Waived amount should be 4000');
  assert.strictEqual(result.balanceDue, 4000, 'Gross balance due should be 4000');
  assert.strictEqual(result.pendingAmount, 0, 'Net pending obligation must be 0 after waiver');
  assert.strictEqual(result.paymentStatus, 'Settled (Waived Off)', 'JobCard status should be Settled (Waived Off)');
  assert.strictEqual(result.invoicePaymentStatus, 'Settled (Waived Off)', 'Invoice status should be Settled (Waived Off)');
  assert.strictEqual(result.isSettled, true, 'isSettled should be true');
});

// SCENARIO F
runTest('Scenario F: Overpayment test (Bill = ₹10,000, Total Paid = ₹12,000) -> Customer Credit = ₹2,000, Balance Due = ₹0, status = OVERPAID', () => {
  const result = computeFinancials({
    finalBillAmount: 10000,
    advancePayments: [{ amount: 6000, paymentMode: 'Bank Transfer' }],
    finalPayments: [{ amount: 6000, paymentType: 'UPI' }],
    waiver: null
  });

  assert.strictEqual(result.totalReceived, 12000, 'Total received should be 12000');
  assert.strictEqual(result.balanceDue, 0, 'Balance due must be 0 (never negative)');
  assert.strictEqual(result.pendingAmount, 0, 'Pending amount must be 0 (never negative)');
  assert.strictEqual(result.customerCredit, 2000, 'Customer credit should be 2000');
  assert.strictEqual(result.paymentStatus, 'Overpaid', 'Status should be Overpaid');
  assert.strictEqual(result.invoicePaymentStatus, 'Overpaid', 'Invoice status should be Overpaid');
  assert.strictEqual(result.isSettled, true, 'isSettled should be true');
});

// SCENARIO G
runTest('Scenario G: Payment deletion -> Delete ₹5,000 payment -> System recalculates totals and reverts status accurately', () => {
  // Initial state: ₹15,000 bill, ₹5,000 advance, ₹10,000 final -> Fully Paid
  let payments = [
    { amount: 5000, paymentMode: 'UPI' },
    { amount: 10000, paymentMode: 'Cash' }
  ];

  let state1 = computeFinancials({
    finalBillAmount: 15000,
    advancePayments: [payments[0]],
    finalPayments: [payments[1]]
  });
  assert.strictEqual(state1.paymentStatus, 'Fully Paid');
  assert.strictEqual(state1.pendingAmount, 0);

  // Deletion simulation: Remove the ₹5,000 advance
  let state2 = computeFinancials({
    finalBillAmount: 15000,
    advancePayments: [],
    finalPayments: [payments[1]]
  });
  assert.strictEqual(state2.totalAdvance, 0, 'Advance must revert to 0');
  assert.strictEqual(state2.totalReceived, 10000, 'Total received must drop to 10000');
  assert.strictEqual(state2.balanceDue, 5000, 'Balance due must revert to 5000');
  assert.strictEqual(state2.pendingAmount, 5000, 'Pending amount must revert to 5000');
  assert.strictEqual(state2.paymentStatus, 'Partially Paid', 'Status must accurately revert to Partially Paid');
});

// EDGE CASES
runTest('Edge Case 1: Decimal precision & rounding (₹1,499.50 bill, ₹500.25 adv, ₹999.25 final)', () => {
  const result = computeFinancials({
    finalBillAmount: 1499.50,
    advancePayments: [{ amount: 500.25, paymentMode: 'UPI' }],
    finalPayments: [{ amount: 999.25, paymentType: 'Online' }],
    waiver: null
  });

  assert.strictEqual(result.totalAdvance, 500.25);
  assert.strictEqual(result.totalFinal, 999.25);
  assert.strictEqual(result.totalReceived, 1499.50);
  assert.strictEqual(result.balanceDue, 0);
  assert.strictEqual(result.pendingAmount, 0);
  assert.strictEqual(result.customerCredit, 0);
  assert.strictEqual(result.paymentStatus, 'Fully Paid');
});

runTest('Edge Case 2: Zero-value invoice with zero payment', () => {
  const result = computeFinancials({
    finalBillAmount: 0,
    advancePayments: [],
    finalPayments: [],
    waiver: null
  });

  assert.strictEqual(result.finalBillAmount, 0);
  assert.strictEqual(result.totalReceived, 0);
  assert.strictEqual(result.balanceDue, 0);
  assert.strictEqual(result.pendingAmount, 0);
  assert.strictEqual(result.paymentStatus, 'Fully Paid', 'Zero bill with zero payment should be Fully Paid (settled)');
  assert.strictEqual(result.invoicePaymentStatus, 'Paid');
});

runTest('Edge Case 3: Zero-value invoice with advance payment (held as credit)', () => {
  const result = computeFinancials({
    finalBillAmount: 0,
    advancePayments: [{ amount: 1500, paymentMode: 'Cash' }],
    finalPayments: [],
    waiver: null
  });

  assert.strictEqual(result.totalReceived, 1500);
  assert.strictEqual(result.balanceDue, 0);
  assert.strictEqual(result.pendingAmount, 0);
  assert.strictEqual(result.customerCredit, 1500);
  assert.strictEqual(result.paymentStatus, 'Overpaid', 'Zero bill with advance must NOT be Partially Paid');
});

runTest('Edge Case 4: Invalid amounts (negative, zero, NaN, string input)', () => {
  const result = computeFinancials({
    finalBillAmount: '5000',
    advancePayments: [
      { amount: -500 },
      { amount: 0 },
      { amount: NaN },
      { amount: '1000' }
    ],
    finalPayments: [
      { amount: '2000' },
      { amount: null }
    ]
  });

  assert.strictEqual(result.finalBillAmount, 5000);
  assert.strictEqual(result.totalAdvance, 1000, 'Invalid numbers must be ignored, string 1000 converted');
  assert.strictEqual(result.totalFinal, 2000, 'Null must be ignored, string 2000 converted');
  assert.strictEqual(result.totalReceived, 3000);
  assert.strictEqual(result.balanceDue, 2000);
  assert.strictEqual(result.pendingAmount, 2000);
  assert.strictEqual(result.paymentStatus, 'Partially Paid');
});

runTest('Edge Case 5: 100% Full Waiver (No cash paid, full bill waived)', () => {
  const result = computeFinancials({
    finalBillAmount: 8500,
    advancePayments: [],
    finalPayments: [],
    waiver: { waivedAmount: 8500, reason: 'Insurance company courtesy discount' }
  });

  assert.strictEqual(result.totalReceived, 0, 'Total cash received must be 0');
  assert.strictEqual(result.waivedAmount, 8500);
  assert.strictEqual(result.balanceDue, 8500);
  assert.strictEqual(result.pendingAmount, 0);
  assert.strictEqual(result.paymentStatus, 'Settled (Waived Off)');
  assert.strictEqual(result.isSettled, true);
});

console.log('---------------------------------------------------------------');
console.log(`Results: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('===============================================================');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
