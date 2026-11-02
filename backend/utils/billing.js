const JobCard = require('../models/JobCard');
const Invoice = require('../models/Invoice');
const Inventory = require('../models/Inventory');

const calculateBillingSummary = async (jobCardId) => {
  try {
    const jobCard = await JobCard.findById(jobCardId);
    if (!jobCard) return;

    // Check if status is closed (Delivered, Delivered – Payment Pending, or Closed)
    const isJcClosed = ['Delivered', 'Delivered – Payment Pending', 'Delivered - Payment Pending', 'Closed'].includes(jobCard.status);

    if (!isJcClosed) {
      // Clear summary if not closed
      jobCard.billingSummary = {
        totalPartsUsed: 0,
        totalPartsSellingValue: 0,
        totalPartsDiscount: 0,
        partsGST: 0,
        netPartsAmount: 0,
        totalPurchaseCostOfPartsUsed: 0,
        totalPurchaseGST: 0,
        totalPurchaseAmount: 0,
        totalLabourHours: 0,
        totalLabourCharges: 0,
        labourDiscount: 0,
        labourGST: 0,
        netLabourAmount: 0,
        partsSaleAmount: 0,
        partsPurchaseAmount: 0,
        labourAmount: 0,
        totalDiscount: 0,
        totalGST: 0,
        grandTotal: 0,
        grossProfit: 0,
        profitPercentage: 0
      };
      await jobCard.save();
      return;
    }

    // Find non-cancelled invoice for this job card
    const invoice = await Invoice.findOne({ jobCardId, status: { $ne: 'Cancelled' } });
    if (!invoice) {
      jobCard.billingSummary = {
        totalPartsUsed: 0,
        totalPartsSellingValue: 0,
        totalPartsDiscount: 0,
        partsGST: 0,
        netPartsAmount: 0,
        totalPurchaseCostOfPartsUsed: 0,
        totalPurchaseGST: 0,
        totalPurchaseAmount: 0,
        totalLabourHours: 0,
        totalLabourCharges: 0,
        labourDiscount: 0,
        labourGST: 0,
        netLabourAmount: 0,
        partsSaleAmount: 0,
        partsPurchaseAmount: 0,
        labourAmount: 0,
        totalDiscount: 0,
        totalGST: 0,
        grandTotal: 0,
        grossProfit: 0,
        profitPercentage: 0
      };
      await jobCard.save();
      return;
    }

    // 1. Sale Parts Summary
    let totalPartsUsed = 0;
    let totalPartsSellingValue = 0;
    let totalPartsDiscount = 0;
    let partsGST = 0;

    // 2. Purchase Parts Summary
    let totalPurchaseCostOfPartsUsed = 0;
    let totalPurchaseGST = 0;

    for (const part of invoice.parts) {
      const qty = Number(part.qty) || 0;
      totalPartsUsed += qty;
      totalPartsSellingValue += (Number(part.rate) || 0) * qty;
      totalPartsDiscount += Number(part.discountAmount) || 0;
      partsGST += Number(part.gstAmount) || 0;

      // Look up purchase price from Inventory
      let purchasePrice = 0;
      let gstPercent = Number(part.gstPercent) || 18;
      if (part.partId) {
        const invItem = await Inventory.findById(part.partId);
        if (invItem) {
          purchasePrice = Number(invItem.purchasePrice) || 0;
          gstPercent = Number(invItem.gstPercent) || gstPercent;
        }
      }
      const itemPurchaseCost = purchasePrice * qty;
      totalPurchaseCostOfPartsUsed += itemPurchaseCost;
      totalPurchaseGST += itemPurchaseCost * (gstPercent / 100);
    }

    const netPartsAmount = totalPartsSellingValue - totalPartsDiscount + partsGST;
    const totalPurchaseAmount = totalPurchaseCostOfPartsUsed + totalPurchaseGST;

    // 3. Labour Summary
    let totalLabourHours = 0;
    let totalLabourCharges = 0;
    let labourDiscount = 0;
    let labourGST = 0;

    for (const lab of invoice.labour) {
      const qty = Number(lab.qty) || 0;
      totalLabourHours += qty;
      totalLabourCharges += (Number(lab.rate) || 0) * qty;
      labourDiscount += Number(lab.discountAmount) || 0;
      labourGST += Number(lab.gstAmount) || 0;
    }

    const netLabourAmount = totalLabourCharges - labourDiscount + labourGST;

    // 4. Overall Job Summary
    const partsSaleAmount = totalPartsSellingValue;
    const partsPurchaseAmount = totalPurchaseCostOfPartsUsed;
    const labourAmount = totalLabourCharges;
    const totalDiscount = totalPartsDiscount + labourDiscount;
    const totalGST = partsGST + labourGST;
    
    // Grand Total = Sale Parts + Labour + GST - Discounts
    const grandTotal = partsSaleAmount + labourAmount + totalGST - totalDiscount;
    
    // Gross Profit = Sale Parts + Labour - Purchase Parts
    const grossProfit = partsSaleAmount + labourAmount - partsPurchaseAmount;
    
    const profitPercentage = (partsSaleAmount + labourAmount) > 0
      ? (grossProfit / (partsSaleAmount + labourAmount)) * 100
      : 0;

    jobCard.billingSummary = {
      totalPartsUsed,
      totalPartsSellingValue,
      totalPartsDiscount,
      partsGST,
      netPartsAmount,
      totalPurchaseCostOfPartsUsed,
      totalPurchaseGST,
      totalPurchaseAmount,
      totalLabourHours,
      totalLabourCharges,
      labourDiscount,
      labourGST,
      netLabourAmount,
      partsSaleAmount,
      partsPurchaseAmount,
      labourAmount,
      totalDiscount,
      totalGST,
      grandTotal,
      grossProfit,
      profitPercentage
    };

    await jobCard.save();
    console.log(`[BILLING] Auto calculated billing summary for Job Card ${jobCard.jobCardNo}`);
  } catch (err) {
    console.error(`[BILLING] Error calculating billing summary for Job Card ${jobCardId}:`, err);
  }
};

module.exports = {
  calculateBillingSummary
};
