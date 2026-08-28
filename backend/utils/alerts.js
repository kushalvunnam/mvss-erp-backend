const Inventory = require('../models/Inventory');
const Notification = require('../models/Notification');

const checkLowStockAlerts = async () => {
  try {
    // 1. Fetch only inventory items that are actually low in stock
    const lowStockItems = await Inventory.find({
      $or: [
        { $expr: { $lte: ["$currentStock", "$minimumStock"] } },
        { $expr: { $lte: ["$stockQuantity", "$lowStockThreshold"] } }
      ]
    }).lean();

    if (lowStockItems.length === 0) return;

    // 2. Fetch all unread low stock notifications in bulk to check in memory
    const existingNotifications = await Notification.find({
      type: 'low_stock',
      status: 'unread'
    }).select('customerName title').lean();

    const existingKeys = new Set(
      existingNotifications.map(n => `${n.customerName || ''}:${n.title || ''}`)
    );

    const newNotifications = [];

    for (const item of lowStockItems) {
      const curStock = item.currentStock !== undefined ? item.currentStock : item.stockQuantity;
      const minStock = item.minimumStock !== undefined ? item.minimumStock : item.lowStockThreshold;

      if (curStock <= minStock) {
        const isOut = curStock === 0;
        const severity = isOut ? 'CRITICAL' : 'WARNING';
        const title = isOut ? 'OUT OF STOCK ALERT' : 'LOW STOCK ALERT';
        const key = `${item.partName}:${title}`;

        if (!existingKeys.has(key)) {
          const alertMessage = `${item.partName} (${item.partNumber})\nCurrent Stock: ${curStock}\nMinimum Stock: ${minStock}\nSeverity Level: ${severity}`;

          newNotifications.push({
            type: 'low_stock',
            title: title,
            message: alertMessage,
            serviceType: severity, // Severity level
            vehicleNumber: item.partNumber, // Part Number
            customerName: item.partName, // Part Name
            status: 'unread'
          });
        }
      }
    }

    // 3. Bulk insert new notifications
    if (newNotifications.length > 0) {
      await Notification.insertMany(newNotifications);
    }
  } catch (error) {
    console.error('Failed to process low stock alerts:', error);
  }
};

module.exports = { checkLowStockAlerts };
