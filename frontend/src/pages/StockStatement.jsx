import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { 
  FileText, 
  Search, 
  Filter, 
  FileSpreadsheet, 
  Printer, 
  Download, 
  Building2, 
  Package, 
  IndianRupee, 
  AlertTriangle,
  Layers,
  MapPin
} from 'lucide-react';

export default function StockStatement({ token, user }) {
  const [data, setData] = useState({ summary: {}, items: [] });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockAlertFilter, setStockAlertFilter] = useState('');

  useEffect(() => {
    fetchStatement();
  }, [token, warehouseFilter, brandFilter, categoryFilter, stockAlertFilter]);

  const fetchStatement = async () => {
    setLoading(true);
    try {
      let url = `${API_BASE_URL}/reports/stock-statement?`;
      if (warehouseFilter) url += `warehouse=${encodeURIComponent(warehouseFilter)}&`;
      if (brandFilter) url += `brand=${encodeURIComponent(brandFilter)}&`;
      if (categoryFilter) url += `category=${encodeURIComponent(categoryFilter)}&`;
      if (stockAlertFilter) url += `stockAlert=${encodeURIComponent(stockAlertFilter)}&`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (err) {
      console.error('Failed to fetch stock statement:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = [
      'Part Code', 'Part Number', 'Barcode', 'Part Name', 'Brand', 'Category', 'HSN Code',
      'GST %', 'Purchase Price', 'Selling Price', 'MRP', 'Margin %', 'Warehouse', 'Location Rack',
      'Current Stock', 'Available Stock', 'Reserved Stock', 'Minimum Stock', 'Vendor', 'Stock Value (Purchase)', 'Selling Valuation'
    ];
    const rows = filteredItems.map(i => [
      i.partCode,
      i.partNumber,
      i.barcode,
      `"${i.partName}"`,
      i.brand,
      i.category,
      i.hsnCode,
      i.gstPercent,
      i.purchasePrice,
      i.sellingPrice,
      i.mrp,
      i.marginPercent,
      i.warehouse,
      i.locationRack,
      i.currentStock,
      i.availableStock,
      i.reservedStock,
      i.minimumStock,
      `"${i.vendorName}"`,
      i.stockValue,
      i.sellingValue
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `stock_statement_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredItems = (data.items || []).filter(item => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.partName?.toLowerCase().includes(term) ||
      item.partNumber?.toLowerCase().includes(term) ||
      item.partCode?.toLowerCase().includes(term) ||
      item.barcode?.toLowerCase().includes(term) ||
      item.brand?.toLowerCase().includes(term) ||
      item.vendorName?.toLowerCase().includes(term) ||
      item.locationRack?.toLowerCase().includes(term) ||
      item.warehouse?.toLowerCase().includes(term)
    );
  });

  const summary = data.summary || {};

  return (
    <div className="space-y-6 animate-fade-in p-1 print:p-0 print:space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <FileText className="w-7 h-7 text-indigo-500" /> Stock Statement & Valuation
          </h1>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Real-time inventory valuation, warehouse locations, rack assignments & reorder thresholds
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={exportToCSV}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
          >
            <FileSpreadsheet className="w-4 h-4" /> Export Excel/CSV
          </button>

          <button
            onClick={handlePrint}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" /> Print / PDF
          </button>
        </div>
      </div>

      {/* Printable Header Notice */}
      <div className="hidden print:block text-center border-b pb-4">
        <h1 className="text-xl font-bold">MVSS AUTOMOBILES PRIVATE LIMITED</h1>
        <p className="text-xs font-semibold">Sy. No. 25/1, Opp. Cine Planet, Kompally, Hyderabad - 500014</p>
        <h2 className="text-base font-bold mt-2 uppercase tracking-wide">INVENTORY STOCK STATEMENT & VALUATION REPORT</h2>
        <p className="text-xs text-slate-500">Date: {new Date().toLocaleDateString('en-IN')}</p>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-lg">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total SKUs / Items</span>
            <span className="text-2xl font-black text-slate-900 dark:text-white">{summary.totalItemsCount || 0}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-lg">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Stock Qty</span>
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">{summary.totalStockQty || 0}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-lg">
            <IndianRupee className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Purchase Valuation</span>
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              ₹{(summary.totalPurchaseValuation || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-lg">
            <IndianRupee className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Selling Valuation</span>
            <span className="text-xl font-black text-purple-600 dark:text-purple-400 font-mono">
              ₹{(summary.totalSellingValuation || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 print:hidden">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search part name, part number, code, barcode, brand, rack, vendor..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
          >
            <option value="">All Warehouses</option>
            <option value="Main Store">Main Store</option>
            <option value="Body Shop Warehouse">Body Shop Warehouse</option>
            <option value="Lubricant Depot">Lubricant Depot</option>
          </select>

          <select
            value={stockAlertFilter}
            onChange={(e) => setStockAlertFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
          >
            <option value="">All Stock Levels</option>
            <option value="low">Low Stock Items</option>
            <option value="out">Out of Stock</option>
            <option value="negative">Negative Stock</option>
          </select>
        </div>
      </div>

      {/* Stock Statement Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden print:border-none print:shadow-none">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs font-semibold">Generating stock statement...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No inventory items found</p>
            <p className="text-xs text-slate-400">Clear your filters to view the full inventory statement.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  <th className="p-3">Part Details</th>
                  <th className="p-3">Brand & Category</th>
                  <th className="p-3">Location & Whse</th>
                  <th className="p-3 text-right">Prices (P.Price / S.Price / MRP)</th>
                  <th className="p-3 text-center">Current Stock</th>
                  <th className="p-3 text-center">Avail / Reserved</th>
                  <th className="p-3 text-center">Min / Max Stock</th>
                  <th className="p-3 text-right">Stock Valuation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-medium">
                {filteredItems.map(item => {
                  const isLow = item.currentStock <= item.minimumStock && item.currentStock > 0;
                  const isOut = item.currentStock === 0;

                  return (
                    <tr key={item._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-slate-900 dark:text-white">{item.partName}</div>
                        <div className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                          <span>PN: {item.partNumber}</span>
                          {item.barcode && item.barcode !== 'N/A' && <span>| BC: {item.barcode}</span>}
                        </div>
                        <div className="text-[9px] text-slate-400">HSN: {item.hsnCode} | GST: {item.gstPercent}%</div>
                      </td>

                      <td className="p-3">
                        <span className="inline-block px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-[10px] font-bold">
                          {item.brand}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">{item.category}</div>
                      </td>

                      <td className="p-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" /> Rack: {item.locationRack || 'A1'}
                        </div>
                        <div className="text-[10px] text-slate-400">{item.warehouse}</div>
                      </td>

                      <td className="p-3 text-right font-mono text-[11px] space-y-0.5">
                        <div className="text-slate-500">P: ₹{item.purchasePrice?.toFixed(2)}</div>
                        <div className="font-bold text-slate-900 dark:text-white">S: ₹{item.sellingPrice?.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-400">MRP: ₹{item.mrp?.toFixed(2)}</div>
                      </td>

                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-mono font-bold ${
                          isOut
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                            : isLow
                            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {item.currentStock} {item.unit}
                        </span>
                      </td>

                      <td className="p-3 text-center font-mono text-[11px]">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{item.availableStock}</span> / <span className="text-slate-400">{item.reservedStock}</span>
                      </td>

                      <td className="p-3 text-center font-mono text-[10px] text-slate-500">
                        Min: {item.minimumStock} | Max: {item.maximumStock}
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        ₹{item.stockValue?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
