import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../config';
import { calculatePricing } from '../utils/pricingEngine';
import { 
  Search, 
  Plus, 
  AlertTriangle, 
  ArrowUpRight, 
  Save, 
  X, 
  Package, 
  Wrench, 
  IndianRupee, 
  Building2, 
  Layers, 
  Tag, 
  Barcode, 
  Check, 
  RotateCcw, 
  Percent, 
  ShieldCheck,
  TrendingUp,
  Boxes,
  Trash2
} from 'lucide-react';
import { getCachedData, setCachedData } from '../utils/apiCache';

export default function Inventory({ token, user }) {
  const [items, setItems] = useState(() => getCachedData(`${API_BASE_URL}/inventory?search=&lowStock=false&category=`) || []);
  const [searchVal, setSearchVal] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [showReduceModal, setShowReduceModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyPart, setHistoryPart] = useState('');

  const [addForm, setAddForm] = useState({
    partName: '',
    partNumber: '',
    hsnCode: '',
    brand: '',
    model: '',
    variant: '',
    stockQuantity: '',
    lowStockThreshold: '',
    purchasePrice: '',
    sellingPrice: '',
    gstPercent: '',
    category: '',
    vehicleCompatibility: '',
    supplier: '',
    reorderLevel: '',
    locationRack: '',
    oemBrand: '',
    warranty: ''
  });

  const [restockForm, setRestockForm] = useState({
    partNumber: '',
    quantityToAdd: '',
    purchasePrice: '',
    sellingPrice: ''
  });

  const [reduceForm, setReduceForm] = useState({
    partNumber: '',
    quantityToReduce: '',
    reason: ''
  });

  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    _id: '',
    partName: '',
    partNumber: '',
    hsnCode: '',
    brand: '',
    model: '',
    variant: '',
    stockQuantity: '',
    lowStockThreshold: '',
    purchasePrice: '',
    sellingPrice: '',
    gstPercent: '',
    category: '',
    vehicleCompatibility: '',
    supplier: '',
    reorderLevel: '',
    locationRack: '',
    oemBrand: '',
    warranty: ''
  });

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

  const handleNumericChange = (e, form, setter, key, allowDecimal = true, maxVal = null) => {
    const input = e.target;
    const originalValue = input.value;
    const processedValue = cleanNumberInput(originalValue, allowDecimal, maxVal);
    
    const selectionStart = input.selectionStart;
    setter({ ...form, [key]: processedValue });

    requestAnimationFrame(() => {
      if (input && input.setSelectionRange) {
        const beforeCursor = originalValue.slice(0, selectionStart);
        const cleanBeforeCursor = cleanNumberInput(beforeCursor, allowDecimal, maxVal);
        const newCursorPos = cleanBeforeCursor.length;
        input.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  };

  const fetchInventory = async () => {
    const url = `${API_BASE_URL}/inventory?search=${encodeURIComponent(search)}&lowStock=${lowStockFilter}&category=${encodeURIComponent(categoryFilter)}`;
    const cached = getCachedData(url);
    if (cached) {
      setItems(cached);
    } else if (items.length === 0) {
      setLoading(true);
    }

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCachedData(url, data);
        setItems(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [search, lowStockFilter, categoryFilter]);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearch(searchVal);
    }, 120);
    return () => clearTimeout(handler);
  }, [searchVal]);

  useEffect(() => {
    const globalFilter = localStorage.getItem('global_search_filter');
    if (globalFilter) {
      setSearchVal(globalFilter);
      setSearch(globalFilter);
      localStorage.removeItem('global_search_filter');
    }
  }, []);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...addForm,
        stockQuantity: Number(addForm.stockQuantity) || 0,
        lowStockThreshold: Number(addForm.lowStockThreshold) || 0,
        purchasePrice: Number(addForm.purchasePrice) || 0,
        sellingPrice: Number(addForm.sellingPrice) || 0,
        gstPercent: Number(addForm.gstPercent) || 0,
        reorderLevel: Number(addForm.reorderLevel) || 0,
        oemBrand: addForm.oemBrand || '',
        warranty: addForm.warranty || ''
      };
      const res = await fetch(`${API_BASE_URL}/inventory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowAddModal(false);
        setAddForm({
          partName: '',
          partNumber: '',
          hsnCode: '',
          brand: '',
          model: '',
          variant: '',
          stockQuantity: '',
          lowStockThreshold: '',
          purchasePrice: '',
          sellingPrice: '',
          gstPercent: '',
          category: '',
          vehicleCompatibility: '',
          supplier: '',
          reorderLevel: '',
          locationRack: '',
          oemBrand: '',
          warranty: ''
        });
        fetchInventory();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to add item.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRestockSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...restockForm,
        quantityToAdd: Number(restockForm.quantityToAdd) || 0,
        purchasePrice: Number(restockForm.purchasePrice) || 0,
        sellingPrice: Number(restockForm.sellingPrice) || 0
      };
      const res = await fetch(`${API_BASE_URL}/inventory/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowRestockModal(false);
        fetchInventory();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to restock item.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReduceSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...reduceForm,
        quantityToReduce: Number(reduceForm.quantityToReduce) || 0
      };
      const res = await fetch(`${API_BASE_URL}/inventory/reduce`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowReduceModal(false);
        setReduceForm({ partNumber: '', quantityToReduce: '', reason: '' });
        fetchInventory();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to reduce stock.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHistory = async (partNumber) => {
    try {
      const res = await fetch(`${API_BASE_URL}/inventory/history/${partNumber}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHistoryLogs(data);
        setHistoryPart(partNumber);
        setShowHistoryModal(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const triggerRestock = (item) => {
    setRestockForm({
      partNumber: item.partNumber,
      quantityToAdd: '',
      purchasePrice: item.purchasePrice !== undefined && item.purchasePrice !== null ? item.purchasePrice.toString() : '',
      sellingPrice: item.sellingPrice !== undefined && item.sellingPrice !== null ? item.sellingPrice.toString() : ''
    });
    setShowRestockModal(true);
  };

  const triggerReduce = (item) => {
    setReduceForm({
      partNumber: item.partNumber,
      quantityToReduce: '',
      reason: ''
    });
    setShowReduceModal(true);
  };

  const triggerEdit = (item) => {
    setEditForm({
      ...item,
      stockQuantity: item.stockQuantity !== undefined && item.stockQuantity !== null ? item.stockQuantity.toString() : '0',
      openingStock: item.openingStock !== undefined && item.openingStock !== null ? item.openingStock.toString() : '0',
      lowStockThreshold: item.lowStockThreshold !== undefined && item.lowStockThreshold !== null ? item.lowStockThreshold.toString() : '5',
      maxStock: item.maxStock !== undefined && item.maxStock !== null ? item.maxStock.toString() : '100',
      reorderLevel: item.reorderLevel !== undefined && item.reorderLevel !== null ? item.reorderLevel.toString() : '5',
      purchasePrice: item.purchasePrice !== undefined && item.purchasePrice !== null ? item.purchasePrice.toString() : '',
      sellingPrice: item.sellingPrice !== undefined && item.sellingPrice !== null ? item.sellingPrice.toString() : '',
      mrp: item.mrp !== undefined && item.mrp !== null ? item.mrp.toString() : '',
      marginPercent: item.marginPercent !== undefined && item.marginPercent !== null ? item.marginPercent.toString() : '',
      quantity: item.quantity !== undefined && item.quantity !== null ? item.quantity.toString() : '1',
      discountPercent: item.discountPercent !== undefined && item.discountPercent !== null ? item.discountPercent.toString() : '0',
      discountAmount: item.discountAmount !== undefined && item.discountAmount !== null ? item.discountAmount.toString() : '0',
      gstPercent: item.gstPercent !== undefined && item.gstPercent !== null ? item.gstPercent.toString() : '18',
      chargeAmount: item.chargeAmount !== undefined && item.chargeAmount !== null ? item.chargeAmount.toString() : '',
      taxableAmount: item.taxableAmount !== undefined && item.taxableAmount !== null ? item.taxableAmount.toString() : '',
      supplier: item.supplier || item.vendorName || '',
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...editForm,
        stockQuantity: Number(editForm.stockQuantity) || 0,
        lowStockThreshold: Number(editForm.lowStockThreshold) || 0,
        purchasePrice: Number(editForm.purchasePrice) || 0,
        sellingPrice: Number(editForm.sellingPrice) || 0,
        gstPercent: Number(editForm.gstPercent) || 0,
        reorderLevel: Number(editForm.reorderLevel) || 0,
        oemBrand: editForm.oemBrand || '',
        warranty: editForm.warranty || ''
      };
      const res = await fetch(`${API_BASE_URL}/inventory/${editForm._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowEditModal(false);
        fetchInventory();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update item.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const triggerDelete = (item) => {
    setDeleteTarget(item);
    setDeleteError('');
    setDeleteSuccess('');
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError('');
    setDeleteSuccess('');

    try {
      const res = await fetch(`${API_BASE_URL}/inventory/${deleteTarget._id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();

      if (res.ok) {
        setDeleteSuccess(data.message || 'Part deleted successfully.');
        fetchInventory();
        setTimeout(() => {
          setShowDeleteModal(false);
          setDeleteTarget(null);
          setDeleteSuccess('');
        }, 1200);
      } else {
        setDeleteError(data.error || 'Failed to delete part.');
      }
    } catch (err) {
      console.error('Failed to delete inventory part:', err);
      setDeleteError('Failed to connect to server.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const isBillingOrAdmin = user?.role === 'Admin' || user?.role === 'Spares' || user?.role === 'Accounts';

  return (
    <div className="space-y-4 animate-fade-in p-1 select-none">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white">Spare Parts Inventory</h2>
          <p className="text-xs text-slate-400 font-semibold dark:text-slate-500">Log stock supplies and track parts replenishment thresholds</p>
        </div>
        {isBillingOrAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10"
            >
              <Plus className="w-4 h-4" /> Add Spare Part
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by part name, brand, model, HSN, compatibility, rack..."
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 text-xs font-semibold focus:outline-none"
          />
        </div>

        {/* Category Filter */}
        <div className="w-44">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-880 rounded-xl text-slate-800 dark:text-slate-200 text-xs font-bold focus:outline-none"
          >
            <option value="">All Categories</option>
            <option value="Engine">Engine Components</option>
            <option value="Brakes">Brakes & Suspension</option>
            <option value="Electrical">Electrical Parts</option>
            <option value="Body">Body Panels / Glass</option>
            <option value="Consumable">Consumables / Oils</option>
            <option value="General">General Spares</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => setLowStockFilter(!lowStockFilter)}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
            lowStockFilter 
              ? 'bg-red-500 text-white border-red-500' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-880 text-slate-700 dark:text-slate-350 hover:bg-slate-50'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Low Stock Warning Alert
        </button>
      </div>

      {/* Datatable */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
                <th className="p-4">Part Details</th>
                <th className="p-4">Brand / Supplier</th>
                <th className="p-4">Compatibility</th>
                <th className="p-4">Part Info</th>
                <th className="p-4 text-right">Purchase Price</th>
                <th className="p-4 text-right">Selling Price</th>
                <th className="p-4">Stock Level</th>
                <th className="p-4">Location (Rack)</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading && items.length === 0 ? (
                Array.from({ length: 8 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="p-4">
                      <div className="h-4 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
                      <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded mt-2" />
                    </td>
                    <td className="p-4">
                      <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                      <div className="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded mt-2" />
                    </td>
                    <td className="p-4">
                      <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded font-mono" />
                    </td>
                    <td className="p-4">
                      <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded font-mono" />
                    </td>
                    <td className="p-4">
                      <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded font-mono" />
                    </td>
                    <td className="p-4">
                      <div className="h-5 w-20 bg-slate-200 dark:bg-slate-800 rounded-full" />
                    </td>
                    <td className="p-4">
                      <div className="h-5 w-24 bg-slate-200 dark:bg-slate-800 rounded-full" />
                    </td>
                    <td className="p-4">
                      <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
                    </td>
                    <td className="p-4 text-right">
                      <div className="h-6 w-20 bg-slate-200 dark:bg-slate-800 rounded inline-block" />
                    </td>
                  </tr>
                ))
              ) : items.length > 0 ? (
                items.map(item => {
                  const isLow = item.stockQuantity <= item.lowStockThreshold;
                  const isReorder = item.stockQuantity <= (item.reorderLevel || item.lowStockThreshold);

                  return (
                    <tr key={item._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all">
                      <td className="p-4">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{item.partName}</div>
                        {item.category && (
                          <div className="text-[10px] text-indigo-500 font-bold uppercase mt-0.5">{item.category}</div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="text-slate-700 dark:text-slate-300 font-semibold">{item.brand || '—'}</div>
                        {item.supplier && (
                          <div className="text-[10px] text-slate-400 font-medium">Supplier: {item.supplier}</div>
                        )}
                      </td>
                      <td className="p-4 text-slate-650 dark:text-slate-350 font-semibold">
                        {item.vehicleCompatibility || item.model || 'Universal'}
                      </td>
                      <td className="p-4">
                        <div className="font-mono font-bold text-slate-600 dark:text-slate-300">{item.partNumber}</div>
                        <div className="text-[9px] text-slate-450 font-mono">HSN: {item.hsnCode}</div>
                      </td>
                      <td className="p-4 text-right font-semibold text-slate-650 dark:text-slate-350">₹{item.purchasePrice.toFixed(2)}</td>
                      <td className="p-4 text-right font-extrabold text-slate-800 dark:text-slate-200">₹{item.sellingPrice.toFixed(2)}</td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] uppercase ${
                              isLow 
                                ? 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400' 
                                : isReorder 
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'
                            }`}>
                              {item.stockQuantity} units
                            </span>
                            {isLow && (
                              <span className="text-[9px] text-red-500 font-bold uppercase flex items-center gap-0.5">
                                <AlertTriangle className="w-3.5 h-3.5" /> Low
                              </span>
                            )}
                          </div>
                          <div className="text-[9px] text-slate-450 font-semibold">
                            Min: {item.lowStockThreshold} | Reorder: {item.reorderLevel || 0}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-semibold text-slate-600 dark:text-slate-400 font-mono">
                        {item.locationRack || '—'}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex gap-1.5 justify-end items-center flex-wrap">
                          <button
                            onClick={() => fetchHistory(item.partNumber)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-350 rounded-lg text-[10px] font-bold transition-all border border-slate-200 dark:border-slate-700"
                          >
                            History
                          </button>
                          {isBillingOrAdmin && (
                            <>
                              <button
                                onClick={() => triggerRestock(item)}
                                className="flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-600 dark:bg-emerald-950/30 dark:hover:bg-emerald-650 text-emerald-600 dark:text-emerald-400 hover:text-white dark:hover:text-white rounded-lg text-[10px] font-bold transition-all border border-emerald-100 dark:border-emerald-950/80"
                              >
                                <Plus className="w-3 h-3" /> Add
                              </button>
                              <button
                                onClick={() => triggerReduce(item)}
                                className="flex items-center gap-1 px-2 py-1 bg-rose-50 hover:bg-rose-600 dark:bg-rose-950/30 dark:hover:bg-rose-650 text-rose-600 dark:text-rose-400 hover:text-white dark:hover:text-white rounded-lg text-[10px] font-bold transition-all border border-rose-100 dark:border-rose-950/80"
                              >
                                Reduce
                              </button>
                            </>
                          )}
                          {isBillingOrAdmin && (
                            <>
                              <button
                                onClick={() => triggerEdit(item)}
                                className="px-2 py-1 bg-indigo-50 hover:bg-indigo-600 dark:bg-indigo-950/30 dark:hover:bg-indigo-650 text-indigo-600 dark:text-indigo-405 hover:text-white dark:hover:text-white rounded-lg text-[10px] font-bold transition-all border border-indigo-100 dark:border-indigo-950/80"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => triggerDelete(item)}
                                className="flex items-center gap-1 px-2 py-1 bg-red-50 hover:bg-red-600 dark:bg-red-950/30 dark:hover:bg-red-650 text-red-600 dark:text-red-400 hover:text-white dark:hover:text-white rounded-lg text-[10px] font-bold transition-all border border-red-100 dark:border-red-950/80"
                              >
                                <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-slate-400 dark:text-slate-500 font-semibold">
                    No inventory spare parts matches found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
            {/* Upgraded Add Part Billing Modal */}
      <PartsMasterBillingModal
        key={showAddModal ? "add-open" : "add-closed"}
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        user={user}
        onSubmit={async (formData) => {
          try {
            const res = await fetch(`${API_BASE_URL}/inventory`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify(formData)
            });
            if (res.ok) {
              setShowAddModal(false);
              fetchInventory();
            } else {
              const err = await res.json();
              alert(err.error || err.message || 'Failed to add item.');
            }
          } catch (err) {
            console.error('Failed to add inventory part:', err);
            alert('Failed to connect to server.');
          }
        }}
        mode="add"
      />

      {/* Restock modal */}
      {showRestockModal && (
        <div className="fixed inset-0 bg-slate-955/60 backdrop-blur-xs flex justify-center items-center z-[99999] p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 overflow-y-auto max-h-[90vh] animate-fade-in text-xs font-semibold">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-black text-slate-850 dark:text-white uppercase tracking-wider">
                Restock Spare Part
              </h3>
              <button
                type="button"
                onClick={() => setShowRestockModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRestockSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Part Number Code</label>
                <input
                  type="text"
                  readOnly
                  value={restockForm.partNumber}
                  className="mt-1 block w-full px-3.5 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl font-mono text-slate-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Quantity to Add</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={restockForm.quantityToAdd}
                  onChange={(e) => handleNumericChange(e, restockForm, setRestockForm, 'quantityToAdd', false)}
                  placeholder="Enter quantity to add"
                  className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl font-bold font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Update Cost Price</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={restockForm.purchasePrice}
                  onChange={(e) => handleNumericChange(e, restockForm, setRestockForm, 'purchasePrice', true)}
                  placeholder="Enter cost price"
                  className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl font-bold font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Update Selling Price</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={restockForm.sellingPrice}
                  onChange={(e) => handleNumericChange(e, restockForm, setRestockForm, 'sellingPrice', true)}
                  placeholder="Enter selling price"
                  className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl font-bold font-mono"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRestockModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-205 dark:bg-slate-800 text-slate-700 dark:text-slate-350 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold"
                >
                  Restock Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upgraded Edit Part Billing Modal */}
      <PartsMasterBillingModal
        key={showEditModal ? `edit-${editForm?._id || 'none'}` : "edit-closed"}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        initialData={editForm}
        mode="edit"
        user={user}
        onDelete={(itemData) => {
          setShowEditModal(false);
          triggerDelete(itemData);
        }}
        onSubmit={async (formData) => {
          try {
            const res = await fetch(`${API_BASE_URL}/inventory/${editForm._id}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify(formData)
            });
            if (res.ok) {
              setShowEditModal(false);
              fetchInventory();
            } else {
              const err = await res.json();
              alert(err.error || err.message || 'Failed to update item.');
            }
          } catch (err) {
            console.error('Failed to update item:', err);
            alert('Failed to connect to server.');
          }
        }}
      />
      {/* Reduce stock modal */}
      {showReduceModal && (
        <div className="fixed inset-0 bg-slate-955/60 backdrop-blur-xs flex justify-center items-center z-[99999] p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 overflow-y-auto max-h-[90vh] animate-fade-in text-xs font-semibold">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-black text-slate-850 dark:text-white uppercase tracking-wider">
                Reduce Spare Part Stock
              </h3>
              <button
                type="button"
                onClick={() => setShowReduceModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReduceSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Part Number Code</label>
                <input
                  type="text"
                  readOnly
                  value={reduceForm.partNumber}
                  className="mt-1 block w-full px-3.5 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl font-mono text-slate-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Quantity to Reduce</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={reduceForm.quantityToReduce}
                  onChange={(e) => handleNumericChange(e, reduceForm, setReduceForm, 'quantityToReduce', false)}
                  placeholder="e.g. 5"
                  className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 font-mono text-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Reason for Reduction</label>
                <input
                  type="text"
                  required
                  value={reduceForm.reason}
                  onChange={(e) => setReduceForm({ ...reduceForm, reason: e.target.value })}
                  placeholder="e.g. Damaged, Internal service use"
                  className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-white"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100 dark:border-slate-800 mt-6">
                <button
                  type="button"
                  onClick={() => setShowReduceModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-205 dark:bg-slate-800 text-slate-700 dark:text-slate-350 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-750 text-white rounded-xl font-bold"
                >
                  Reduce Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock History Logs Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-slate-955/60 backdrop-blur-xs flex justify-center items-center z-[99999] p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 overflow-y-auto max-h-[90vh] animate-fade-in text-xs font-semibold">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-black text-slate-850 dark:text-white uppercase tracking-wider">
                Stock History Logs ({historyPart})
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto space-y-2.5 pr-1">
              {historyLogs.length > 0 ? (
                historyLogs.map(log => (
                  <div key={log._id} className="p-3 bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850 rounded-2xl flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className={`px-2 py-0.5 rounded font-extrabold text-[8px] uppercase ${
                        log.action === 'INVENTORY_CREATE' 
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400'
                          : log.action === 'INVENTORY_RESTOCK'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'
                            : log.action === 'INVENTORY_REDUCE'
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400'
                              : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400'
                      }`}>{log.action.replace('INVENTORY_', '')}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(log.createdAt).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold">{log.description}</p>
                    <div className="text-[10px] text-slate-450 font-medium">Logged by: {log.userEmail}</div>
                  </div>
                ))
              ) : (
                <div className="text-center p-8 text-slate-400 font-semibold">No stock actions history logged for this part number.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deleteTarget && (
        <div className="fixed inset-0 bg-slate-955/60 backdrop-blur-xs flex justify-center items-center z-[99999] p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 overflow-y-auto max-h-[90vh] animate-fade-in text-xs font-semibold">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
                <div className="p-2.5 bg-red-100 dark:bg-red-950/40 rounded-2xl">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-850 dark:text-white uppercase tracking-wider">
                    Delete Spare Part
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400">{deleteTarget.partNumber}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-2xl mb-4 space-y-1">
              <div className="font-bold text-slate-800 dark:text-slate-200 text-xs">{deleteTarget.partName}</div>
              <div className="text-[10px] text-slate-400 flex gap-3">
                <span>Brand: {deleteTarget.brand || 'N/A'}</span>
                <span>Stock: {deleteTarget.stockQuantity} units</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold mb-4">
              Are you sure you want to delete this part? This action cannot be undone.
            </p>

            {deleteError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-2xl text-[11px] font-semibold mb-4 leading-relaxed flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>{deleteError}</div>
              </div>
            )}

            {deleteSuccess && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-2xl text-[11px] font-bold mb-4 flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>{deleteSuccess}</span>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTarget(null);
                  setDeleteError('');
                  setDeleteSuccess('');
                }}
                disabled={deleteLoading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-350 rounded-xl font-bold transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
                className="flex items-center gap-1.5 px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-md shadow-red-600/20 disabled:opacity-50"
              >
                {deleteLoading ? (
                  'Deleting...'
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/**
 * Upgraded Parts & Labour Master Billing Modal (React Portal)
 * Professional ERP Billing Layout with real-time profit margin & GST calculations.
 */
function PartsMasterBillingModal({
  isOpen,
  onClose,
  onSubmit,
  onDelete,
  initialData,
  mode = 'add',
  user
}) {
  if (!isOpen) return null;

  const [form, setForm] = useState(() => ({
    type: initialData?.type || 'Part',
    partName: initialData?.partName || '',
    partNumber: initialData?.partNumber || '',
    partCode: initialData?.partCode || '',
    alias: initialData?.alias || '',
    hsnCode: initialData?.hsnCode || '8708',
    brand: initialData?.brand || '',
    category: initialData?.category || 'General Spares',
    subCategory: initialData?.subCategory || '',
    model: initialData?.model || '',
    variant: initialData?.variant || '',
    vehicleCompatibility: initialData?.vehicleCompatibility || '',
    stockQuantity: initialData?.stockQuantity !== undefined && initialData?.stockQuantity !== null ? initialData.stockQuantity.toString() : '0',
    openingStock: initialData?.openingStock !== undefined && initialData?.openingStock !== null ? initialData.openingStock.toString() : '0',
    lowStockThreshold: initialData?.lowStockThreshold !== undefined && initialData?.lowStockThreshold !== null ? initialData.lowStockThreshold.toString() : '5',
    maxStock: initialData?.maxStock !== undefined && initialData?.maxStock !== null ? initialData.maxStock.toString() : '100',
    reorderLevel: initialData?.reorderLevel !== undefined && initialData?.reorderLevel !== null ? initialData.reorderLevel.toString() : '5',
    purchasePrice: initialData?.purchasePrice !== undefined && initialData?.purchasePrice !== null ? initialData.purchasePrice.toString() : '',
    sellingPrice: initialData?.sellingPrice !== undefined && initialData?.sellingPrice !== null ? initialData.sellingPrice.toString() : '',
    mrp: initialData?.mrp !== undefined && initialData?.mrp !== null ? initialData.mrp.toString() : '',
    marginPercent: initialData?.marginPercent !== undefined && initialData?.marginPercent !== null ? initialData.marginPercent.toString() : '',
    quantity: initialData?.quantity !== undefined && initialData?.quantity !== null ? initialData.quantity.toString() : '1',
    discountPercent: initialData?.discountPercent !== undefined && initialData?.discountPercent !== null ? initialData.discountPercent.toString() : '0',
    discountAmount: initialData?.discountAmount !== undefined && initialData?.discountAmount !== null ? initialData.discountAmount.toString() : '0',
    discountType: initialData?.discountType || 'Percent',
    taxableAmount: initialData?.taxableAmount !== undefined && initialData?.taxableAmount !== null ? initialData.taxableAmount.toString() : '',
    gstPercent: initialData?.gstPercent !== undefined && initialData?.gstPercent !== null ? initialData.gstPercent.toString() : '18',
    chargeAmount: initialData?.chargeAmount !== undefined && initialData?.chargeAmount !== null ? initialData.chargeAmount.toString() : '',
    unit: initialData?.unit || 'Pcs',
    warehouse: initialData?.warehouse || 'Main Store',
    locationRack: initialData?.locationRack || '',
    supplier: initialData?.supplier || '',
    barcode: initialData?.barcode || '',
    notes: initialData?.notes || '',
    oemBrand: initialData?.oemBrand || '',
    warranty: initialData?.warranty || '',
    lastDiscountEdited: initialData?.discountType === 'Fixed' ? 'amount' : 'percent'
  }));

  const [manualFinalTotal, setManualFinalTotal] = useState(
    initialData?.manualFinalTotal !== undefined ? initialData.manualFinalTotal : null
  );
  const [mrpOverride, setMrpOverride] = useState(false);

  const pricing = calculatePricing({
    purchasePrice: form.purchasePrice,
    marginPercent: form.marginPercent,
    sellingPrice: form.sellingPrice,
    quantity: form.quantity,
    discountPercent: form.discountPercent,
    discountAmount: form.discountAmount,
    discountType: form.discountType,
    lastDiscountEdited: form.lastDiscountEdited,
    gstPercent: form.gstPercent,
    mrp: form.mrp,
    taxableAmount: form.taxableAmount !== '' ? form.taxableAmount : null,
    manualFinalTotal
  });

  const cost = pricing.cost;
  const sell = pricing.sellingPrice;
  const qty = pricing.quantity;
  const gstP = pricing.gstPercent;
  const discPercent = pricing.discountPercent;
  const discAmount = pricing.discountAmount;
  const grossAmount = pricing.subtotal;
  const taxableAmount = pricing.taxableAmount;
  const gstAmount = pricing.gstAmount;
  const finalTotalAmount = pricing.finalTotalAmount;
  const unitChargeRate = pricing.unitChargeRate;
  const marginP = pricing.marginPercent;
  const mrpVal = pricing.mrp;
  const customerSaving = pricing.customerSaving;
  const customerSavingPercent = pricing.customerSavingPercent;
  const sellingExceedsMrp = pricing.sellingExceedsMrp;

  // Input Handlers
  const handleMrpChange = (val) => {
    setForm(prev => {
      const p = calculatePricing({
        purchasePrice: prev.purchasePrice,
        marginPercent: prev.marginPercent,
        sellingPrice: prev.sellingPrice,
        quantity: prev.quantity,
        discountPercent: prev.discountPercent,
        discountAmount: prev.discountAmount,
        discountType: prev.discountType,
        gstPercent: prev.gstPercent,
        mrp: val,
        changedField: 'mrp',
        manualFinalTotal
      });
      return {
        ...prev,
        mrp: val,
        taxableAmount: p.taxableAmount.toFixed(2),
        sellingPrice: p.sellingPrice.toFixed(2),
        marginPercent: p.marginPercent.toFixed(2),
        discountAmount: p.discountAmount.toFixed(2),
        discountPercent: p.discountPercent.toFixed(2)
      };
    });
    setManualFinalTotal(null);
  };

  const handlePurchasePriceChange = (val) => {
    const newCost = parseFloat(val) || 0;
    const currentMargin = parseFloat(form.marginPercent) || 0;
    const gstP = parseFloat(form.gstPercent) || 0;
    const qty = parseFloat(form.quantity) || 1;
    let newSell = parseFloat(form.sellingPrice) || 0;
    if (newCost > 0 && currentMargin >= 0) {
      newSell = newCost * (1 + currentMargin / 100);
    }
    const calculatedMrp = newSell * (1 + gstP / 100) * qty;
    setForm(prev => {
      const p = calculatePricing({
        purchasePrice: val,
        marginPercent: prev.marginPercent,
        sellingPrice: newSell.toFixed(2),
        quantity: prev.quantity,
        discountPercent: prev.discountPercent,
        discountAmount: prev.discountAmount,
        discountType: prev.discountType,
        gstPercent: prev.gstPercent,
        mrp: calculatedMrp.toFixed(2),
        changedField: 'mrp',
        manualFinalTotal
      });
      return {
        ...prev,
        purchasePrice: val,
        sellingPrice: newSell.toFixed(2),
        mrp: calculatedMrp.toFixed(2),
        taxableAmount: p.taxableAmount.toFixed(2),
        discountAmount: p.discountAmount.toFixed(2),
        discountPercent: p.discountPercent.toFixed(2)
      };
    });
    setManualFinalTotal(null);
  };

  const handleSellingPriceChange = (val) => {
    const newSell = parseFloat(val) || 0;
    const gstP = parseFloat(form.gstPercent) || 0;
    const qty = parseFloat(form.quantity) || 1;
    const calculatedMrp = newSell * (1 + gstP / 100) * qty;
    setForm(prev => {
      const p = calculatePricing({
        purchasePrice: prev.purchasePrice,
        marginPercent: prev.marginPercent,
        sellingPrice: val,
        quantity: prev.quantity,
        discountPercent: prev.discountPercent,
        discountAmount: prev.discountAmount,
        discountType: prev.discountType,
        gstPercent: prev.gstPercent,
        mrp: calculatedMrp.toFixed(2),
        changedField: 'mrp',
        manualFinalTotal
      });
      return {
        ...prev,
        sellingPrice: val,
        mrp: calculatedMrp.toFixed(2),
        taxableAmount: p.taxableAmount.toFixed(2),
        marginPercent: p.marginPercent.toFixed(2),
        discountAmount: p.discountAmount.toFixed(2),
        discountPercent: p.discountPercent.toFixed(2)
      };
    });
    setManualFinalTotal(null);
  };

  const handleMarginChange = (val) => {
    const newMargin = parseFloat(val) || 0;
    const currentCost = parseFloat(form.purchasePrice) || 0;
    const gstP = parseFloat(form.gstPercent) || 0;
    const qty = parseFloat(form.quantity) || 1;
    let newSell = parseFloat(form.sellingPrice) || 0;
    if (currentCost > 0) {
      newSell = currentCost * (1 + newMargin / 100);
    }
    const calculatedMrp = newSell * (1 + gstP / 100) * qty;
    setForm(prev => {
      const p = calculatePricing({
        purchasePrice: prev.purchasePrice,
        marginPercent: val,
        sellingPrice: newSell.toFixed(2),
        quantity: prev.quantity,
        discountPercent: prev.discountPercent,
        discountAmount: prev.discountAmount,
        discountType: prev.discountType,
        gstPercent: prev.gstPercent,
        mrp: calculatedMrp.toFixed(2),
        changedField: 'mrp',
        manualFinalTotal
      });
      return {
        ...prev,
        marginPercent: val,
        sellingPrice: newSell.toFixed(2),
        mrp: calculatedMrp.toFixed(2),
        taxableAmount: p.taxableAmount.toFixed(2),
        discountAmount: p.discountAmount.toFixed(2),
        discountPercent: p.discountPercent.toFixed(2)
      };
    });
    setManualFinalTotal(null);
  };

  const handleQuantityChange = (val) => {
    const newQty = parseFloat(val) || 1;
    setForm(prev => {
      const prevQty = parseFloat(prev.quantity) || 1;
      const unitMrp = (parseFloat(prev.mrp) || 0) / prevQty;
      const newMrp = (unitMrp * newQty).toFixed(2);

      const pPrev = calculatePricing({
        purchasePrice: prev.purchasePrice,
        marginPercent: prev.marginPercent,
        sellingPrice: prev.sellingPrice,
        quantity: prev.quantity,
        discountPercent: prev.discountPercent,
        discountAmount: prev.discountAmount,
        discountType: prev.discountType,
        gstPercent: prev.gstPercent,
        mrp: prev.mrp,
        changedField: null,
        manualFinalTotal
      });
      const prevTaxable = parseFloat(prev.taxableAmount) || pPrev.taxableAmount || 0;
      const unitTaxable = prevQty > 0 ? prevTaxable / prevQty : 0;
      const newTaxable = (unitTaxable * newQty).toFixed(2);

      const p = calculatePricing({
        purchasePrice: prev.purchasePrice,
        marginPercent: prev.marginPercent,
        sellingPrice: prev.sellingPrice,
        quantity: val,
        discountPercent: prev.discountPercent,
        discountAmount: prev.discountAmount,
        discountType: prev.discountType,
        gstPercent: prev.gstPercent,
        mrp: newMrp,
        taxableAmount: newTaxable,
        changedField: 'qty',
        manualFinalTotal
      });
      return {
        ...prev,
        quantity: val,
        mrp: newMrp,
        taxableAmount: newTaxable,
        discountAmount: p.discountAmount.toFixed(2),
        discountPercent: p.discountPercent.toFixed(2)
      };
    });
    setManualFinalTotal(null);
  };

  const handleDiscountPercentChange = (val) => {
    setForm(prev => {
      const p = calculatePricing({
        purchasePrice: prev.purchasePrice,
        marginPercent: prev.marginPercent,
        sellingPrice: prev.sellingPrice,
        quantity: prev.quantity,
        discountPercent: val,
        discountAmount: prev.discountAmount,
        discountType: prev.discountType,
        gstPercent: prev.gstPercent,
        mrp: prev.mrp,
        changedField: 'discountPercent',
        manualFinalTotal
      });
      return {
        ...prev,
        discountPercent: val,
        discountAmount: p.discountAmount.toFixed(2),
        taxableAmount: p.taxableAmount.toFixed(2)
      };
    });
    setManualFinalTotal(null);
  };

  const handleDiscountAmountChange = (val) => {
    setForm(prev => {
      const p = calculatePricing({
        purchasePrice: prev.purchasePrice,
        marginPercent: prev.marginPercent,
        sellingPrice: prev.sellingPrice,
        quantity: prev.quantity,
        discountPercent: prev.discountPercent,
        discountAmount: val,
        discountType: prev.discountType,
        gstPercent: prev.gstPercent,
        mrp: prev.mrp,
        changedField: 'discountAmount',
        manualFinalTotal
      });
      return {
        ...prev,
        discountAmount: val,
        discountPercent: p.discountPercent.toFixed(2),
        taxableAmount: p.taxableAmount.toFixed(2)
      };
    });
    setManualFinalTotal(null);
  };

  const handleTaxableAmountChange = (val) => {
    setForm(prev => {
      const p = calculatePricing({
        purchasePrice: prev.purchasePrice,
        marginPercent: prev.marginPercent,
        sellingPrice: prev.sellingPrice,
        quantity: prev.quantity,
        discountPercent: prev.discountPercent,
        discountAmount: prev.discountAmount,
        discountType: prev.discountType,
        gstPercent: prev.gstPercent,
        mrp: prev.mrp,
        taxableAmount: val,
        changedField: 'taxableAmount',
        manualFinalTotal
      });
      return {
        ...prev,
        taxableAmount: val,
        mrp: p.mrp.toFixed(2),
        sellingPrice: p.sellingPrice.toFixed(2),
        discountPercent: p.discountPercent.toFixed(2),
        discountAmount: p.discountAmount.toFixed(2)
      };
    });
    setManualFinalTotal(null);
  };

  const handleTaxableBlur = (val) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setForm(prev => ({
        ...prev,
        taxableAmount: num.toFixed(2)
      }));
    }
  };

  const handleLabourTaxableBlur = (val) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setForm(prev => ({
        ...prev,
        taxableAmount: num.toFixed(2)
      }));
    }
  };

  const handleGstPercentChange = (val) => {
    setForm(prev => {
      const p = calculatePricing({
        purchasePrice: prev.purchasePrice,
        marginPercent: prev.marginPercent,
        sellingPrice: prev.sellingPrice,
        quantity: prev.quantity,
        discountPercent: prev.discountPercent,
        discountAmount: prev.discountAmount,
        discountType: prev.discountType,
        gstPercent: val,
        mrp: prev.mrp,
        changedField: 'gstPercent',
        manualFinalTotal
      });
      return {
        ...prev,
        gstPercent: val,
        discountAmount: p.discountAmount.toFixed(2),
        discountPercent: p.discountPercent.toFixed(2)
      };
    });
    setManualFinalTotal(null);
  };

  const handleManualFinalTotalChange = (val) => {
    if (val === '') {
      setManualFinalTotal(null);
      return;
    }
    const finalTotal = parseFloat(val) || 0;
    setManualFinalTotal(finalTotal);

    const gstP = parseFloat(form.gstPercent) || 0;
    const qty = parseFloat(form.quantity) || 1;
    const costVal = parseFloat(form.purchasePrice) || 0;
    const mrpVal = parseFloat(form.mrp) || 0;
    const discAmt = parseFloat(form.discountAmount) || 0;

    const reversePricing = calculatePricing({
      purchasePrice: costVal,
      quantity: qty,
      discountAmount: discAmt,
      gstPercent: gstP,
      mrp: mrpVal,
      manualFinalTotal: finalTotal
    });

    setForm(prev => ({
      ...prev,
      sellingPrice: reversePricing.sellingPrice.toFixed(2),
      marginPercent: reversePricing.marginPercent.toFixed(2),
      discountAmount: reversePricing.discountAmount.toFixed(2),
      discountPercent: reversePricing.discountPercent.toFixed(2)
    }));
  };

  const switchToLabour = () => {
    const taxAmt = parseFloat(form.taxableAmount) || parseFloat(form.sellingPrice) || 0;
    const gstP = parseFloat(form.gstPercent) || 18;
    const calculatedMrp = taxAmt * (1 + gstP / 100);
    setForm(prev => ({
      ...prev,
      type: 'Labour',
      hsnCode: prev.hsnCode === '8708' ? '9987' : prev.hsnCode,
      category: 'Labour Service',
      unit: 'Hours',
      purchasePrice: '0',
      marginPercent: '0',
      quantity: '1',
      discountPercent: '0',
      discountAmount: '0',
      discountType: 'Percent',
      taxableAmount: taxAmt.toString(),
      sellingPrice: taxAmt.toString(),
      mrp: calculatedMrp.toFixed(2),
      gstPercent: gstP.toString()
    }));
  };

  const switchToPart = () => {
    setForm(prev => ({
      ...prev,
      type: 'Part',
      hsnCode: prev.hsnCode === '9987' ? '8708' : prev.hsnCode,
      category: 'General Spares',
      unit: 'Pcs'
    }));
  };

  const handleLabourTaxableChange = (val) => {
    const numVal = parseFloat(val) || 0;
    const gstP = parseFloat(form.gstPercent) || 0;
    const calculatedMrp = numVal * (1 + gstP / 100);
    setForm(prev => ({
      ...prev,
      taxableAmount: val,
      sellingPrice: numVal.toString(),
      mrp: calculatedMrp.toFixed(2),
      quantity: '1',
      discountPercent: '0',
      discountAmount: '0',
      purchasePrice: '0',
      marginPercent: '0'
    }));
  };

  const handleLabourGstChange = (val) => {
    const gstP = parseFloat(val) || 0;
    const taxAmt = parseFloat(form.taxableAmount) || 0;
    const calculatedMrp = taxAmt * (1 + gstP / 100);
    setForm(prev => ({
      ...prev,
      gstPercent: val,
      mrp: calculatedMrp.toFixed(2),
      quantity: '1',
      discountPercent: '0',
      discountAmount: '0',
      purchasePrice: '0',
      marginPercent: '0'
    }));
  };

  const handleLabourFinalAmountChange = (val) => {
    const finalAmt = parseFloat(val) || 0;
    const gstP = parseFloat(form.gstPercent) || 0;
    const calculatedTaxable = finalAmt / (1 + gstP / 100);
    setForm(prev => ({
      ...prev,
      taxableAmount: finalAmt > 0 ? calculatedTaxable.toFixed(4) : '',
      sellingPrice: finalAmt > 0 ? calculatedTaxable.toFixed(4) : '',
      mrp: finalAmt > 0 ? finalAmt.toFixed(2) : '',
      quantity: '1',
      discountPercent: '0',
      discountAmount: '0',
      purchasePrice: '0',
      marginPercent: '0'
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.partName || !form.partNumber) {
      alert('Part Name / Description and Part Number are required.');
      return;
    }

    const q = parseFloat(form.quantity) || 0;
    if (q < 1) {
      alert('Quantity must be greater than or equal to 1.');
      return;
    }

    const gst = parseFloat(form.gstPercent) || 0;
    if (gst < 0 || gst > 100) {
      alert('GST Rate must be between 0% and 100%.');
      return;
    }

    const sellPrice = parseFloat(form.sellingPrice) || 0;
    const costPrice = parseFloat(form.purchasePrice) || 0;
    const mrpValue = parseFloat(form.mrp) || 0;
    const isAuthorized = ['Admin', 'Accounts'].includes(user?.role);

    // 1. Profit margin / selling price below cost validation
    if (sellPrice < costPrice && !isAuthorized) {
      alert('Selling Price cannot be below Cost Price.');
      return;
    }

    // 2. Selling Price above MRP validation
    if (sellingExceedsMrp) {
      if (!isAuthorized) {
        alert('Selling Price cannot exceed MRP.');
        return;
      } else if (!mrpOverride) {
        alert('Selling Price cannot exceed MRP unless Manual Override is confirmed.');
        return;
      }
    }

    // 3. Discount greater than Selling Price validation
    const disc = parseFloat(form.discountAmount) || 0;
    if (disc > grossAmount) {
      alert('Discount cannot exceed the total Selling Price (Subtotal).');
      return;
    }

    if (finalTotalAmount < 0) {
      alert('Final Total cannot be negative.');
      return;
    }

    onSubmit({
      ...form,
      stockQuantity: Number(form.stockQuantity) || 0,
      openingStock: Number(form.openingStock) || 0,
      lowStockThreshold: Number(form.lowStockThreshold) || 0,
      minimumStock: Number(form.lowStockThreshold) || 0,
      maxStock: Number(form.maxStock) || 100,
      reorderLevel: Number(form.reorderLevel) || 0,
      purchasePrice: Number(form.purchasePrice) || 0,
      sellingPrice: Number(form.sellingPrice) || 0,
      quantity: Number(form.quantity) || 1,
      discountPercent: Number(form.discountPercent) || 0,
      discountAmount: Number(form.discountAmount) || 0,
      mrp: Number(form.mrp) || mrpVal,
      marginPercent: Number(form.marginPercent) || marginP,
      gstPercent: Number(form.gstPercent) || 0,
      chargeAmount: Number(unitChargeRate) || 0,
      finalTotalAmount: Number(finalTotalAmount) || 0,
      manualFinalTotal: manualFinalTotal,
      oemBrand: form.oemBrand || '',
      warranty: form.warranty || '',
      vendorName: form.supplier || ''
    });
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex justify-center items-center p-3 sm:p-6 z-[99999] animate-fade-in select-none">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-500/20">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  {mode === 'edit' ? 'Edit Parts & Labour Master' : 'Create Parts & Labour Master'}
                </h3>
                <span className={`px-2 py-0.5 text-[9px] font-extrabold rounded-full uppercase tracking-wider ${
                  form.type === 'Labour' 
                    ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-300/40' 
                    : 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-300/40'
                }`}>
                  {form.type === 'Labour' ? '⚙️ Labour Service' : '📦 Spare Part'}
                </span>
              </div>
              <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
                Configure part identification, HSN, automatic GST tax rates, quantity, dual synchronized discounts & stock
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Real-Time Billing Live Summary Bar */}
        {form.type !== 'Labour' && (
          <div className="bg-slate-900 text-white px-5 py-3 border-b border-slate-800 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-4 text-center sm:text-left text-xs">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Cost Price</span>
                <span className="text-xs font-black font-mono text-slate-200">₹{cost.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">MRP</span>
                <span className="text-xs font-black font-mono text-slate-250">₹{mrpVal.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Profit Margin</span>
                <span className="text-xs font-black font-mono text-emerald-400">{marginP}%</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Selling Price</span>
                <span className="text-xs font-black font-mono text-blue-400">₹{sell.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Discount</span>
                <span className="text-xs font-black font-mono text-amber-400">-₹{discAmount.toFixed(2)} ({discPercent.toFixed(1)}%)</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">GST ({gstP}%)</span>
                <span className="text-xs font-black font-mono text-purple-400">+₹{gstAmount.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Customer Saving</span>
                <span className="text-xs font-black font-mono text-emerald-350">₹{customerSaving.toFixed(2)} ({customerSavingPercent.toFixed(0)}%)</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Net Charge</span>
                <span className="text-xs font-black font-mono text-cyan-400">₹{unitChargeRate.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Final Total</span>
                <span className="text-sm font-black font-mono text-emerald-300">₹{finalTotalAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 text-xs font-semibold">
          
          {/* Section 1: Part Identification */}
          <div className="bg-slate-50/70 dark:bg-slate-950/40 p-4.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200/60 dark:border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-indigo-500" />
                <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  1. Part Identification & Classification
                </h4>
              </div>

              {/* Type Switcher */}
              <div className="flex bg-slate-200 dark:bg-slate-800 p-0.5 rounded-xl">
                <button
                  type="button"
                  onClick={switchToPart}
                  className={`px-3 py-1 text-[10px] font-extrabold rounded-lg transition-all ${
                    form.type === 'Part'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  📦 Spare Part
                </button>
                <button
                  type="button"
                  onClick={switchToLabour}
                  className={`px-3 py-1 text-[10px] font-extrabold rounded-lg transition-all ${
                    form.type === 'Labour'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  ⚙️ Labour Charge
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  {form.type === 'Labour' ? 'Labour Code *' : 'Part Number *'}
                </label>
                <input
                  type="text"
                  required
                  value={form.partNumber}
                  onChange={(e) => setForm({ ...form, partNumber: e.target.value.toUpperCase() })}
                  placeholder={form.type === 'Labour' ? 'e.g. LBR-SERV-01' : 'e.g. SP-FILT-OIL'}
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white uppercase font-bold focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Alias / OEM Number
                </label>
                <input
                  type="text"
                  value={form.alias}
                  onChange={(e) => setForm({ ...form, alias: e.target.value })}
                  placeholder="e.g. OEM-16510-M68K00"
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  {form.type === 'Labour' ? 'SAC Code' : 'HSN Code'}
                </label>
                <input
                  type="text"
                  value={form.hsnCode}
                  onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
                  placeholder="e.g. 8708 / 9987"
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  {form.type === 'Labour' ? 'Labour Description / Title *' : 'Part Name / Description *'}
                </label>
                <input
                  type="text"
                  required
                  value={form.partName}
                  onChange={(e) => setForm({ ...form, partName: e.target.value })}
                  placeholder={form.type === 'Labour' ? 'e.g. Engine Oil & Filter Change Service' : 'e.g. Engine Oil Filter (Swift DDiS)'}
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Category
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:border-indigo-500"
                >
                  <option value="General Spares">General Spares</option>
                  <option value="Engine">Engine Components</option>
                  <option value="Brakes">Brakes & Suspension</option>
                  <option value="Electrical">Electrical Parts</option>
                  <option value="Body">Body Panels / Glass</option>
                  <option value="Consumable">Consumables / Oils</option>
                  <option value="Sublet Service">Sublet Service</option>
                  <option value="Labour Service">Labour Service</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Vehicle Model
                </label>
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="e.g. Swift, Baleno, Universal"
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Variant / Engine Code
                </label>
                <input
                  type="text"
                  value={form.variant}
                  onChange={(e) => setForm({ ...form, variant: e.target.value })}
                  placeholder="e.g. VXI, ZXI, DDiS, All"
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Sub Category / Compatibility
                </label>
                <input
                  type="text"
                  value={form.vehicleCompatibility}
                  onChange={(e) => setForm({ ...form, vehicleCompatibility: e.target.value })}
                  placeholder="e.g. Maruti Swift 2018-2024"
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  OEM Brand (Optional)
                </label>
                <input
                  type="text"
                  value={form.oemBrand}
                  onChange={(e) => setForm({ ...form, oemBrand: e.target.value })}
                  placeholder="e.g. Bosch, Moog"
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Warranty (Optional)
                </label>
                <input
                  type="text"
                  value={form.warranty}
                  onChange={(e) => setForm({ ...form, warranty: e.target.value })}
                  placeholder="e.g. 1 Year, 6 Months"
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Pricing & Tax */}
          <div className="bg-slate-50/70 dark:bg-slate-950/40 p-4.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-2.5">
              <IndianRupee className="w-4 h-4 text-emerald-500" />
              <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                2. Pricing, Margin & Tax Calculation
              </h4>
            </div>

            {form.type === 'Labour' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Taxable Value (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={form.taxableAmount}
                    onChange={(e) => handleLabourTaxableChange(e.target.value)}
                    onBlur={(e) => handleLabourTaxableBlur(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-indigo-650 dark:text-indigo-400 font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    GST Rate (%)
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={['0', '3', '5', '12', '18', '28'].includes(form.gstPercent) ? form.gstPercent : 'custom'}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setForm({ ...form, gstPercent: 'custom' });
                        } else {
                          handleLabourGstChange(val);
                        }
                      }}
                      disabled={!['Admin', 'Accounts', 'Spares'].includes(user?.role)}
                      className="flex-1 px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:border-indigo-500"
                    >
                      <option value="0">0% (Exempted)</option>
                      <option value="3">3% (GST)</option>
                      <option value="5">5% (GST)</option>
                      <option value="12">12% (GST)</option>
                      <option value="18">18% (Standard GST)</option>
                      <option value="28">28% (Luxury / Spares)</option>
                      <option value="custom">Custom...</option>
                    </select>
                    {!['0', '3', '5', '12', '18', '28'].includes(form.gstPercent) && (
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="0.00"
                        value={form.gstPercent === 'custom' ? '' : form.gstPercent}
                        onChange={(e) => handleLabourGstChange(e.target.value)}
                        disabled={!['Admin', 'Accounts', 'Spares'].includes(user?.role)}
                        className="w-24 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Final Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={finalTotalAmount === 0 ? '' : finalTotalAmount.toFixed(2)}
                    onChange={(e) => handleLabourFinalAmountChange(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-emerald-600 dark:text-emerald-450 font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Purchase Price (Cost)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.purchasePrice}
                    onChange={(e) => handlePurchasePriceChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Profit Margin %
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      value={form.marginPercent}
                      onChange={(e) => handleMarginChange(e.target.value)}
                      placeholder="20"
                      className="w-full px-3.5 py-2 pr-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-emerald-600 dark:text-emerald-400 font-bold focus:outline-none focus:border-indigo-500"
                    />
                    <Percent className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Selling Price (Excl. Tax) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={form.sellingPrice}
                    onChange={(e) => handleSellingPriceChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-blue-650 dark:text-blue-400 font-black focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={form.quantity}
                    onChange={(e) => handleQuantityChange(e.target.value)}
                    placeholder="1"
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Discount Type
                  </label>
                  <select
                    value={form.discountType || 'Percent'}
                    onChange={(e) => {
                      const type = e.target.value;
                      const qty = parseFloat(form.quantity) || 1;
                      const sellPrice = parseFloat(form.sellingPrice) || 0;
                      const gross = qty * sellPrice;
                      
                      let newPercent = form.discountPercent;
                      let newAmount = form.discountAmount;
                      
                      if (type === 'Percent') {
                        newAmount = (gross * (parseFloat(newPercent) || 0) / 100).toFixed(2);
                      } else {
                        newPercent = gross > 0 ? ((parseFloat(newAmount) || 0) / gross * 100).toFixed(2) : '0';
                      }
                      
                      setForm(prev => ({
                        ...prev,
                        discountType: type,
                        discountPercent: newPercent,
                        discountAmount: newAmount,
                        lastDiscountEdited: type === 'Percent' ? 'percent' : 'amount'
                      }));
                      setManualFinalTotal(null);
                    }}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500 h-10 text-xs"
                  >
                    <option value="Percent">Percentage</option>
                    <option value="Fixed">Fixed Amount</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Discount %
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      value={form.discountPercent}
                      onChange={(e) => handleDiscountPercentChange(e.target.value)}
                      placeholder="0"
                      className="w-full px-3.5 py-2 pr-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-amber-600 dark:text-amber-400 font-bold focus:outline-none focus:border-indigo-500"
                    />
                    <Percent className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Discount Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.discountAmount}
                    onChange={(e) => handleDiscountAmountChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-amber-600 dark:text-amber-400 font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Taxable Value (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.taxableAmount}
                    onChange={(e) => handleTaxableAmountChange(e.target.value)}
                    onBlur={(e) => handleTaxableBlur(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-indigo-650 dark:text-indigo-400 font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    GST Rate (%)
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={['0', '3', '5', '12', '18', '28'].includes(form.gstPercent) ? form.gstPercent : 'custom'}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setForm({ ...form, gstPercent: 'custom' });
                        } else {
                          handleGstPercentChange(val);
                        }
                      }}
                      disabled={!['Admin', 'Accounts', 'Spares'].includes(user?.role)}
                      className="flex-1 px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:border-indigo-500"
                    >
                      <option value="0">0% (Exempted)</option>
                      <option value="3">3% (GST)</option>
                      <option value="5">5% (GST)</option>
                      <option value="12">12% (GST)</option>
                      <option value="18">18% (Standard GST)</option>
                      <option value="28">28% (Luxury / Spares)</option>
                      <option value="custom">Custom...</option>
                    </select>
                    {!['0', '3', '5', '12', '18', '28'].includes(form.gstPercent) && (
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="0.00"
                        value={form.gstPercent === 'custom' ? '' : form.gstPercent}
                        onChange={(e) => handleGstPercentChange(e.target.value)}
                        disabled={!['Admin', 'Accounts', 'Spares'].includes(user?.role)}
                        className="w-24 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    GST Amount (Auto)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={`₹ ${gstAmount.toFixed(2)}`}
                    className="w-full px-3.5 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-750 rounded-xl font-mono text-purple-600 dark:text-purple-400 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Net Charge Rate (Per Unit)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={`₹ ${unitChargeRate.toFixed(2)}`}
                    className="w-full px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl font-mono text-emerald-700 dark:text-emerald-300 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Final Total Amount (₹)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={manualFinalTotal !== null ? manualFinalTotal : finalTotalAmount.toFixed(2)}
                      onChange={(e) => handleManualFinalTotalChange(e.target.value)}
                      className="w-full px-3.5 py-2 pr-16 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 rounded-xl font-mono text-emerald-800 dark:text-emerald-200 font-black text-sm focus:outline-none"
                    />
                    {manualFinalTotal !== null && (
                      <div className="absolute right-2 top-2 flex items-center gap-1">
                        <span className="text-[8px] bg-red-500 text-white font-extrabold px-1.5 py-0.5 rounded uppercase">Override</span>
                        <button
                          type="button"
                          onClick={() => setManualFinalTotal(null)}
                          className="text-[9px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded font-extrabold hover:bg-slate-300"
                        >
                          Reset
                        </button>
                      </div>
                    )}
                  </div>

                {manualFinalTotal !== null && (
                  <span className="text-[10px] font-bold text-red-500 mt-1 block">Manual Override Enabled</span>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  MRP (Max Retail Price)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.mrp}
                  onChange={(e) => handleMrpChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white font-bold focus:outline-none focus:border-indigo-500"
                />
                {mrpVal > 0 && (
                  <div className="mt-1 space-y-1">
                    {sell <= mrpVal ? (
                      <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-450 block">
                        You Save: ₹{(mrpVal - sell).toFixed(2)} ({Math.round(customerSavingPercent)}%)
                      </span>
                    ) : (
                      <div className="space-y-1.5 p-2 bg-rose-50 dark:bg-rose-950/20 border border-rose-250 dark:border-rose-900/50 rounded-lg">
                        <span className="text-[10px] font-black text-rose-600 dark:text-rose-450 block">
                          Selling price exceeds MRP.
                        </span>
                        <label className="flex items-center gap-1.5 text-[9px] font-extrabold text-slate-650 dark:text-slate-350 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={mrpOverride}
                            onChange={(e) => setMrpOverride(e.target.checked)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                          />
                          <span>Allow Price to exceed MRP (Manual Override)</span>
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

          {/* Section 3: Inventory & Warehouse Control */}
          {form.type !== 'Labour' && (
            <div className="bg-slate-50/70 dark:bg-slate-950/40 p-4.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-2.5">
                <Boxes className="w-4 h-4 text-blue-500" />
                <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  3. Stock Quantity & Warehouse Control
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Unit of Measure
                  </label>
                  <select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Pcs">Pcs (Pieces)</option>
                    <option value="Ltr">Ltr (Liters)</option>
                    <option value="Kg">Kg (Kilograms)</option>
                    <option value="Set">Set</option>
                    <option value="Meter">Meter</option>
                    <option value="Box">Box</option>
                    <option value="Pairs">Pairs</option>
                    <option value="Hours">Hours (Labour)</option>
                    <option value="Job">Job Service</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Warehouse Location
                  </label>
                  <select
                    value={form.warehouse}
                    onChange={(e) => setForm({ ...form, warehouse: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Main Store">Main Store</option>
                    <option value="Spares Warehouse">Spares Warehouse</option>
                    <option value="Body Shop Store">Body Shop Store</option>
                    <option value="Accessories Store">Accessories Store</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Rack / Shelf Position
                  </label>
                  <input
                    type="text"
                    value={form.locationRack}
                    onChange={(e) => setForm({ ...form, locationRack: e.target.value })}
                    placeholder="e.g. Rack A-4, Shelf 2"
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Opening Stock
                  </label>
                  <input
                    type="number"
                    value={form.openingStock}
                    onChange={(e) => setForm({ ...form, openingStock: e.target.value })}
                    placeholder="0"
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Current Stock *
                  </label>
                  <input
                    type="number"
                    required
                    value={form.stockQuantity}
                    onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
                    placeholder="0"
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Minimum Stock Threshold *
                  </label>
                  <input
                    type="number"
                    required
                    value={form.lowStockThreshold}
                    onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
                    placeholder="5"
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section 4: Brand, Supplier & Barcode */}
          {form.type !== 'Labour' && (
            <div className="bg-slate-50/70 dark:bg-slate-950/40 p-4.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-2.5">
                <Building2 className="w-4 h-4 text-purple-500" />
                <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  4. Brand, Supplier & Barcode Identification
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Brand Name / OEM
                  </label>
                  <input
                    type="text"
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    placeholder="e.g. Bosch, MGP, Castrol"
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Supplier / Vendor Name
                  </label>
                  <input
                    type="text"
                    value={form.supplier}
                    onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                    placeholder="e.g. Bosch India Distributors"
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Barcode Number
                  </label>
                  <input
                    type="text"
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    placeholder="e.g. 8901234567890"
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Additional Item Notes / Remarks
                  </label>
                  <textarea
                    rows="2"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Additional specs, warranty info, or fitting instructions..."
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}
        </form>

        {/* Sticky Footer Bar */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {mode === 'edit' && onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (onDelete && initialData) {
                    onDelete(initialData);
                  }
                }}
                className="px-4 py-2.5 bg-red-50 hover:bg-red-600 dark:bg-red-950/30 dark:hover:bg-red-650 text-red-600 dark:text-red-400 hover:text-white dark:hover:text-white rounded-xl text-xs font-bold transition-all border border-red-100 dark:border-red-950/80 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Part
              </button>
            )}
            <div className="text-[11px] text-slate-400 font-medium hidden sm:block">
              Fields marked with <span className="text-rose-500 font-bold">*</span> are required for ERP billing
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
            >
              <Save className="w-4 h-4" /> {mode === 'edit' ? 'Save Part Updates' : 'Save & Register Part'}
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
