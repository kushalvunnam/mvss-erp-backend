import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../config';
import SearchableDropdown from '../components/SearchableDropdown';
import { useInventoryCache } from '../hooks/useInventoryCache';
import { 
  Wrench, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Package, 
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  X
} from 'lucide-react';

export default function StockAdjustment({ token, user }) {
  const [adjustments, setAdjustments] = useState([]);
  const [inventory, setInventory] = useState([]);
  const { data: partsInventory } = useInventoryCache(token, 'parts');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [fetchError, setFetchError] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState({
    partId: '',
    type: 'Stock Increase',
    qty: '1',
    reason: 'Manual Stock Correction',
    comments: '',
    reference: ''
  });

  const isWritable = user?.role === 'Admin' || user?.role === 'Accounts' || user?.role === 'Spares';

  // Debounce search term to avoid hitting the API too frequently
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showModal]);

  const fetchData = async (pageToFetch = 1) => {
    setLoading(true);
    setFetchError('');
    try {
      let url = `${API_BASE_URL}/adjustments?page=${pageToFetch}&limit=20`;
      if (typeFilter) url += `&type=${encodeURIComponent(typeFilter)}`;
      if (debouncedSearchTerm) url += `&search=${encodeURIComponent(debouncedSearchTerm)}`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setAdjustments(data);
          setTotalPages(1);
          setCurrentPage(1);
        } else {
          setAdjustments(data.adjustments || []);
          setTotalPages(data.totalPages || 1);
          setCurrentPage(data.currentPage || 1);
        }
      } else {
        setFetchError('Unable to load stock adjustments. Please try again.');
      }
    } catch (err) {
      console.error('Failed to fetch adjustments:', err);
      setFetchError('Unable to load stock adjustments. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchInventory = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/inventory`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setInventory(data);
      }
    } catch (err) {
      console.error('Failed to fetch inventory:', err);
    }
  };

  useEffect(() => {
    fetchData(1);
  }, [token, typeFilter, debouncedSearchTerm]);

  useEffect(() => {
    if (showModal && inventory.length === 0) {
      fetchInventory();
    }
  }, [showModal, inventory.length]);

  const handleOpenCreate = () => {
    setFormData({
      partId: inventory.length > 0 ? inventory[0]._id : '',
      type: 'Stock Increase',
      qty: '1',
      reason: 'Manual Stock Correction',
      comments: '',
      reference: ''
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.partId || !formData.qty || !formData.reason) {
      alert('Part, Quantity, and Reason are required.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/adjustments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setShowModal(false);
        fetchData();
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.error || 'Failed to submit stock adjustment'}`);
      }
    } catch (err) {
      alert('Failed to connect to server.');
    }
  };

  const handleApprove = async (id) => {
    if (!window.confirm('Approve this stock adjustment and update inventory quantities immediately?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/adjustments/${id}/approve`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to approve adjustment.');
      }
    } catch (err) {
      alert('Failed to approve adjustment.');
    }
  };

  const filteredAdjustments = adjustments;

  return (
    <div className="space-y-6 animate-fade-in p-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Wrench className="w-7 h-7 text-indigo-500" /> Stock Adjustments
          </h1>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Log damaged parts, inventory audits, stock increases/decreases & manual corrections
          </p>
        </div>

        {isWritable && (
          <button
            onClick={handleOpenCreate}
            className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Stock Adjustment
          </button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search adjustment number, part name, part number, reason..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none md:w-56"
        >
          <option value="">All Adjustment Types</option>
          <option value="Stock Increase">Stock Increase</option>
          <option value="Stock Decrease">Stock Decrease</option>
          <option value="Damaged Items">Damaged Items</option>
          <option value="Missing Items">Missing Items</option>
          <option value="Returned Items">Returned Items</option>
          <option value="Manual Correction">Manual Correction</option>
        </select>
      </div>

      {/* Adjustments Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs font-semibold animate-pulse">Loading stock adjustments...</div>
        ) : fetchError ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm font-bold text-rose-500">{fetchError}</p>
            <button
              onClick={() => fetchData(currentPage)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-bold transition-all"
            >
              Retry
            </button>
          </div>
        ) : filteredAdjustments.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No stock adjustments found.</p>
            <p className="text-xs text-slate-400">Click "New Stock Adjustment" to record an audit entry.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  <th className="p-4">Adjustment No & Date</th>
                  <th className="p-4">Spare Part</th>
                  <th className="p-4">Adjustment Type</th>
                  <th className="p-4 text-center">Qty Change</th>
                  <th className="p-4 text-center">Previous ➔ New Stock</th>
                  <th className="p-4">Reason & Created By</th>
                  <th className="p-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-medium">
                {filteredAdjustments.map(adj => {
                  const isAdd = adj.type === 'Stock Increase' || adj.type === 'Returned Items';
                  return (
                    <tr key={adj._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-4">
                        <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{adj.adjustmentNo}</div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(adj.createdAt || adj.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="font-bold text-slate-900 dark:text-white">{adj.partName}</div>
                        <div className="text-[10px] font-mono text-slate-400">{adj.partNumber}</div>
                      </td>

                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          isAdd 
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' 
                            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                        }`}>
                          {isAdd ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {adj.type}
                        </span>
                      </td>

                      <td className="p-4 text-center font-mono font-bold text-sm">
                        <span className={isAdd ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {isAdd ? `+${adj.qty}` : `-${adj.qty}`}
                        </span>
                      </td>

                      <td className="p-4 text-center font-mono font-semibold text-slate-600 dark:text-slate-300">
                        {adj.previousStock} ➔ <span className="font-bold text-slate-900 dark:text-white">{adj.newStock}</span>
                      </td>

                      <td className="p-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{adj.reason}</div>
                        <div className="text-[10px] text-slate-400">By: {adj.createdBy}</div>
                        {adj.comments && <div className="text-[10px] text-slate-400 italic mt-0.5">"{adj.comments}"</div>}
                      </td>

                      <td className="p-4 text-center">
                        {adj.status === 'Pending' ? (
                          user?.role === 'Admin' ? (
                            <button
                              onClick={() => handleApprove(adj._id)}
                              className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-lg shadow-sm"
                            >
                              Approve Adjustment
                            </button>
                          ) : (
                            <span className="px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 text-[10px] font-bold rounded-full">
                              Pending Approval
                            </span>
                          )
                        ) : (
                          <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-full">
                            Approved
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {!loading && !fetchError && totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
            <div className="text-xs text-slate-500 font-semibold">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => {
                  const nextPage = currentPage - 1;
                  setCurrentPage(nextPage);
                  fetchData(nextPage);
                }}
                className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => {
                  const nextPage = currentPage + 1;
                  setCurrentPage(nextPage);
                  fetchData(nextPage);
                }}
                className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>      {/* New Adjustment Modal */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-[99999]">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-lg w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-955/40 shrink-0">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-indigo-500" /> New Stock Adjustment Entry
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col min-h-0 flex-1">
              <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Select Spare Part *</label>
                  <SearchableDropdown
                    items={inventory.length > 0 ? inventory : partsInventory}
                    value={formData.partId}
                    onSelect={(partId) => setFormData({ ...formData, partId })}
                    placeholder="Search part name, number, OEM, HSN..."
                    emptyOptionLabel="-- Select Part --"
                    token={token}
                    type="parts"
                    className="w-full"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Adjustment Type *</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
                    >
                      <option value="Stock Increase">Stock Increase (+)</option>
                      <option value="Returned Items">Returned Items (+)</option>
                      <option value="Stock Decrease">Stock Decrease (-)</option>
                      <option value="Damaged Items">Damaged Items (-)</option>
                      <option value="Missing Items">Missing Items (-)</option>
                      <option value="Manual Correction">Manual Correction (-)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quantity *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={formData.qty}
                      onChange={(e) => setFormData({ ...formData, qty: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Reason for Adjustment *</label>
                  <input
                    type="text"
                    required
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="e.g. Physical inventory audit discrepancy, damaged in warehouse..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Comments / Notes</label>
                  <textarea
                    rows="2"
                    value={formData.comments}
                    onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                    placeholder="Additional audit details or verification comments..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 bg-slate-50/50 dark:bg-slate-955/40 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-350 rounded-xl text-xs font-bold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  Record Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
