import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../config';
import { 
  Plus, 
  Search, 
  Filter, 
  Wrench, 
  Trash2, 
  Edit3, 
  Eye, 
  X, 
  Calendar, 
  IndianRupee, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  ClipboardList,
  User,
  Car,
  AlertCircle
} from 'lucide-react';

export default function ExternalRepairs({ token, user }) {
  const [repairs, setRepairs] = useState([]);
  const [jobCards, setJobCards] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRepair, setEditingRepair] = useState(null);
  const [viewingRepair, setViewingRepair] = useState(null);
  const [deletingRepair, setDeletingRepair] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    jobCardId: '',
    jobCardNo: '',
    vendorId: '',
    vendorName: '',
    vehicleId: '',
    vehicleNo: '',
    repairDescription: '',
    cost: '',
    status: 'Pending',
    date: new Date().toISOString().slice(0, 10),
    remarks: ''
  });

  const role = user?.role || 'Guest';
  const canModify = ['Admin', 'Accounts', 'Service', 'Body Shop'].includes(role);
  const canDelete = role === 'Admin';

  useEffect(() => {
    fetchRepairs();
    fetchJobCards();
    fetchVendors();
  }, [token]);

  // Close modals on Esc
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
        setEditingRepair(null);
        setViewingRepair(null);
        setDeletingRepair(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchRepairs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/external-repairs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRepairs(Array.isArray(data) ? data : []);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to load external repairs.');
      }
    } catch (err) {
      console.error(err);
      setError('Connection error while fetching repairs.');
    } finally {
      setLoading(false);
    }
  };

  const fetchJobCards = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/jobcards`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setJobCards(Array.isArray(data) ? data : (data.jobcards || []));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchVendors = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/vendors`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setVendors(Array.isArray(data) ? data : (data.vendors || []));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleJobCardChange = (jcNo) => {
    if (!jcNo) {
      setFormData(prev => ({
        ...prev,
        jobCardId: '',
        jobCardNo: '',
        vehicleId: '',
        vehicleNo: ''
      }));
      return;
    }
    const matched = jobCards.find(j => j.jobCardNo === jcNo);
    if (matched) {
      setFormData(prev => ({
        ...prev,
        jobCardId: matched._id,
        jobCardNo: matched.jobCardNo,
        vehicleId: matched.vehicleId?._id || matched.vehicleId || '',
        vehicleNo: matched.vehicleId?.vehicleNumber || matched.vehicleNo || ''
      }));
    }
  };

  const handleVendorChange = (vName) => {
    if (!vName) {
      setFormData(prev => ({
        ...prev,
        vendorId: '',
        vendorName: ''
      }));
      return;
    }
    const matched = vendors.find(v => v.name === vName);
    if (matched) {
      setFormData(prev => ({
        ...prev,
        vendorId: matched._id,
        vendorName: matched.name
      }));
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API_BASE_URL}/external-repairs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setSuccess('External repair request registered successfully.');
        setShowAddModal(false);
        resetForm();
        fetchRepairs();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to register external repair.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error while saving external repair.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingRepair) return;
    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API_BASE_URL}/external-repairs/${editingRepair._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setSuccess('External repair request updated successfully.');
        setEditingRepair(null);
        resetForm();
        fetchRepairs();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to update external repair.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error while saving external repair.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!deletingRepair) return;
    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API_BASE_URL}/external-repairs/${deletingRepair._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        setSuccess('External repair deleted successfully.');
        setDeletingRepair(null);
        fetchRepairs();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to delete external repair.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error while deleting external repair.');
    } finally {
      setActionLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      jobCardId: '',
      jobCardNo: '',
      vendorId: '',
      vendorName: '',
      vehicleId: '',
      vehicleNo: '',
      repairDescription: '',
      cost: '',
      status: 'Pending',
      date: new Date().toISOString().slice(0, 10),
      remarks: ''
    });
  };

  const openAddModal = () => {
    resetForm();
    setError('');
    setSuccess('');
    setShowAddModal(true);
  };

  const openEditModal = (repair) => {
    setError('');
    setSuccess('');
    setEditingRepair(repair);
    setFormData({
      jobCardId: repair.jobCardId?._id || repair.jobCardId || '',
      jobCardNo: repair.jobCardNo || '',
      vendorId: repair.vendorId?._id || repair.vendorId || '',
      vendorName: repair.vendorName || '',
      vehicleId: repair.vehicleId?._id || repair.vehicleId || '',
      vehicleNo: repair.vehicleNo || '',
      repairDescription: repair.repairDescription || '',
      cost: repair.cost || '',
      status: repair.status || 'Pending',
      date: repair.date ? new Date(repair.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      remarks: repair.remarks || ''
    });
  };

  // Filter repairs locally based on state
  const filteredRepairs = repairs.filter(r => {
    const matchesSearch = 
      (r.repairNo && r.repairNo.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.vehicleNo && r.vehicleNo.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.jobCardNo && r.jobCardNo.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.vendorName && r.vendorName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.repairDescription && r.repairDescription.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = !statusFilter || r.status === statusFilter;

    let matchesDates = true;
    if (fromDate) {
      matchesDates = matchesDates && new Date(r.date) >= new Date(fromDate);
    }
    if (toDate) {
      matchesDates = matchesDates && new Date(r.date) <= new Date(toDate + 'T23:59:59');
    }

    return matchesSearch && matchesStatus && matchesDates;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Completed':
        return (
          <span className="px-2.5 py-1 bg-emerald-950/20 border border-emerald-900/30 rounded-lg text-[10px] font-bold text-emerald-450 flex items-center gap-1 w-max">
            <CheckCircle2 className="w-3 h-3" /> Completed
          </span>
        );
      case 'Sent':
        return (
          <span className="px-2.5 py-1 bg-indigo-950/20 border border-indigo-900/30 rounded-lg text-[10px] font-bold text-indigo-400 flex items-center gap-1 w-max">
            <Clock className="w-3 h-3" /> Sent to Workshop
          </span>
        );
      case 'Cancelled':
        return (
          <span className="px-2.5 py-1 bg-rose-955/20 border border-rose-900/30 rounded-lg text-[10px] font-bold text-rose-400 flex items-center gap-1 w-max">
            <AlertCircle className="w-3 h-3" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 bg-amber-950/20 border border-amber-900/30 rounded-lg text-[10px] font-bold text-amber-450 flex items-center gap-1 w-max">
            <AlertTriangle className="w-3 h-3 animate-pulse" /> Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Title & Add Button */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2 uppercase tracking-tight">
            <Wrench className="w-6 h-6 text-indigo-500" />
            External Repairs
          </h1>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">Manage work outsourced to specialized external workshops</p>
        </div>
        
        {canModify && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-500/10 active:scale-95"
          >
            <Plus className="w-4 h-4" /> Create External Repair
          </button>
        )}
      </div>

      {/* Action Logs Alert Messages */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 dark:bg-rose-950/10 dark:border-rose-900/30 rounded-2xl flex items-center gap-3 text-rose-600 dark:text-rose-400 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-250 dark:bg-emerald-950/10 dark:border-emerald-900/30 rounded-2xl flex items-center gap-3 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          {success}
        </div>
      )}

      {/* Search & Filters */}
      <div className="glassmorphism p-5 rounded-3xl border border-slate-100 dark:border-slate-800 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search repair no, vehicle, job card..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-semibold text-slate-850 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-semibold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            >
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Sent">Sent to Workshop</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              placeholder="From Date"
              className="w-full px-4 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-semibold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            />
          </div>

          <div>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              placeholder="To Date"
              className="w-full px-4 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-semibold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Repairs Table */}
      <div className="glassmorphism rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-extrabold text-[10px]">
                <th className="p-4">Repair No.</th>
                <th className="p-4">Date</th>
                <th className="p-4">Job Card</th>
                <th className="p-4">Vehicle</th>
                <th className="p-4">Vendor</th>
                <th className="p-4">Description</th>
                <th className="p-4">Cost</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-slate-400 font-semibold select-none animate-pulse">
                    Loading external repairs list...
                  </td>
                </tr>
              ) : filteredRepairs.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-slate-400 font-semibold">
                    No external repairs found.
                  </td>
                </tr>
              ) : (
                filteredRepairs.map(r => (
                  <tr key={r._id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                    
                    <td className="p-4 font-bold text-slate-900 dark:text-white font-mono">{r.repairNo}</td>
                    
                    <td className="p-4 font-semibold text-slate-600 dark:text-slate-400">
                      {new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    
                    <td className="p-4 font-semibold text-indigo-500 font-mono">
                      {r.jobCardNo || 'Not Linked'}
                    </td>
                    
                    <td className="p-4 font-bold text-slate-800 dark:text-slate-200 font-mono">
                      {r.vehicleNo}
                    </td>
                    
                    <td className="p-4 font-semibold text-slate-700 dark:text-slate-350">
                      {r.vendorName}
                    </td>
                    
                    <td className="p-4 max-w-xs truncate font-semibold text-slate-650 dark:text-slate-400" title={r.repairDescription}>
                      {r.repairDescription}
                    </td>
                    
                    <td className="p-4 font-extrabold text-slate-900 dark:text-white flex items-center gap-0.5">
                      <IndianRupee className="w-3 h-3 text-indigo-400" />
                      {r.cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    
                    <td className="p-4">
                      {getStatusBadge(r.status)}
                    </td>

                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setViewingRepair(r)}
                          className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg text-indigo-500 hover:text-indigo-600 transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        
                        {canModify && (
                          <button
                            onClick={() => openEditModal(r)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:hover:text-white transition-colors"
                            title="Edit Repair"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}

                        {canDelete && (
                          <button
                            onClick={() => setDeletingRepair(r)}
                            className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-955/40 rounded-lg text-rose-500 hover:text-rose-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================== */}
      {/* MODAL 1: CREATE / ADD EXTERNAL REPAIR                     */}
      {/* ========================================================== */}
      {showAddModal && createPortal(
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex justify-center items-center p-4 z-[9999] overflow-y-auto animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}
        >
          <form 
            onSubmit={handleAddSubmit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col my-auto animate-scale-in"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-indigo-500 animate-spin" />
                Add External Repair Request
              </h2>
              <button type="button" onClick={() => setShowAddModal(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Job Card linkage */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1">Link Job Card</label>
                  <select
                    value={formData.jobCardNo}
                    onChange={(e) => handleJobCardChange(e.target.value)}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Manual Entry / No Job Card --</option>
                    {jobCards.map(j => (
                      <option key={j._id} value={j.jobCardNo}>
                        {j.jobCardNo} ({j.vehicleId?.vehicleNumber || j.vehicleNo})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Vehicle reg */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1">Vehicle Registration No. *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AP09XX9999"
                    value={formData.vehicleNo}
                    onChange={(e) => setFormData({ ...formData, vehicleNo: e.target.value.toUpperCase() })}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Vendor selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1">Vendor *</label>
                  <select
                    required
                    value={formData.vendorName}
                    onChange={(e) => handleVendorChange(e.target.value)}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Select Vendor --</option>
                    {vendors.map(v => (
                      <option key={v._id} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cost */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1">Repair Cost *</label>
                  <div className="relative">
                    <IndianRupee className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      placeholder="0.00"
                      value={formData.cost}
                      onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                      className="w-full pl-7 pr-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-355 mb-1">Outsourced Date</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Sent">Sent to Workshop</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              {/* Repair Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-305 mb-1">Repair Description *</label>
                <textarea
                  required
                  placeholder="e.g. Engine Block boring and sleeve insertion"
                  rows="3"
                  value={formData.repairDescription}
                  onChange={(e) => setFormData({ ...formData, repairDescription: e.target.value })}
                  className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-305 mb-1">Remarks</label>
                <textarea
                  placeholder="Add payment notes, transport details, workshop reference, etc."
                  rows="2"
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/60 rounded-b-3xl">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-500/10"
              >
                {actionLoading ? 'Saving...' : 'Register Repair'}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* ========================================================== */}
      {/* MODAL 2: EDIT EXTERNAL REPAIR                             */}
      {/* ========================================================== */}
      {editingRepair && createPortal(
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex justify-center items-center p-4 z-[9999] overflow-y-auto animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setEditingRepair(null); }}
        >
          <form 
            onSubmit={handleEditSubmit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col my-auto animate-scale-in"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-500" />
                Edit External Repair Details
              </h2>
              <button type="button" onClick={() => setEditingRepair(null)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-650 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Job Card linkage */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1">Link Job Card</label>
                  <select
                    value={formData.jobCardNo}
                    onChange={(e) => handleJobCardChange(e.target.value)}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Manual Entry / No Job Card --</option>
                    {jobCards.map(j => (
                      <option key={j._id} value={j.jobCardNo}>
                        {j.jobCardNo} ({j.vehicleId?.vehicleNumber || j.vehicleNo})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Vehicle reg */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-355 mb-1">Vehicle Registration No. *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AP09XX9999"
                    value={formData.vehicleNo}
                    onChange={(e) => setFormData({ ...formData, vehicleNo: e.target.value.toUpperCase() })}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-bold text-slate-850 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Vendor selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-355 mb-1">Vendor *</label>
                  <select
                    required
                    value={formData.vendorName}
                    onChange={(e) => handleVendorChange(e.target.value)}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Select Vendor --</option>
                    {vendors.map(v => (
                      <option key={v._id} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cost */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-355 mb-1">Repair Cost *</label>
                  <div className="relative">
                    <IndianRupee className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      placeholder="0.00"
                      value={formData.cost}
                      onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                      className="w-full pl-7 pr-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-355 mb-1">Outsourced Date</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-355 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Sent">Sent to Workshop</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              {/* Repair Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-355 mb-1">Repair Description *</label>
                <textarea
                  required
                  placeholder="e.g. Engine Block boring and sleeve insertion"
                  rows="3"
                  value={formData.repairDescription}
                  onChange={(e) => setFormData({ ...formData, repairDescription: e.target.value })}
                  className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold text-slate-905 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-355 mb-1">Remarks</label>
                <textarea
                  placeholder="Add payment notes, transport details, workshop reference, etc."
                  rows="2"
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold text-slate-905 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/60 rounded-b-3xl">
              <button
                type="button"
                onClick={() => setEditingRepair(null)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-500/10"
              >
                {actionLoading ? 'Saving...' : 'Update Details'}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* ========================================================== */}
      {/* MODAL 3: VIEW EXTERNAL REPAIR DETAILS                     */}
      {/* ========================================================== */}
      {viewingRepair && createPortal(
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex justify-center items-center p-4 z-[9999] overflow-y-auto animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setViewingRepair(null); }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl flex flex-col my-auto animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-indigo-500" />
                External Repair Details
              </h2>
              <button type="button" onClick={() => setViewingRepair(null)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-650 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              
              {/* Header section with Repair ID and Status */}
              <div className="flex justify-between items-start bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-250/50 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">Repair Log Identity</span>
                  <h3 className="text-lg font-black text-slate-800 dark:text-white font-mono mt-0.5">{viewingRepair.repairNo}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-slate-450 mt-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>Outsourced: {new Date(viewingRepair.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">State</span>
                  {getStatusBadge(viewingRepair.status)}
                </div>
              </div>

              {/* Linking Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-400">Associated Job Card</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono block mt-0.5">
                    {viewingRepair.jobCardNo || 'Not Linked / Walk-in'}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-400">Vehicle Number</span>
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 font-mono block mt-0.5">
                    {viewingRepair.vehicleNo}
                  </span>
                </div>
                <div className="col-span-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <span className="block text-[10px] font-bold uppercase text-slate-400">Assigned Vendor</span>
                  <span className="text-xs font-bold text-indigo-550 dark:text-indigo-400 block mt-0.5">
                    {viewingRepair.vendorName}
                  </span>
                </div>
              </div>

              {/* Repair description */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Outsourced Repairs Description</span>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-semibold">
                  {viewingRepair.repairDescription}
                </p>
              </div>

              {/* Cost & Remarks */}
              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800 pt-3">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-400">Repair Cost Charged</span>
                  <div className="flex items-center gap-0.5 text-base font-extrabold text-slate-900 dark:text-white mt-1">
                    <IndianRupee className="w-4 h-4 text-indigo-500" />
                    <span>{viewingRepair.cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-400">Log Created By</span>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mt-1">
                    {viewingRepair.createdBy}
                  </span>
                </div>
              </div>

              {viewingRepair.remarks && (
                <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1">
                  <span className="block text-[10px] font-bold uppercase text-slate-400">Procurement / Workshop Notes</span>
                  <p className="text-xs text-slate-550 dark:text-slate-400 italic">
                    {viewingRepair.remarks}
                  </p>
                </div>
              )}

            </div>

            <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-900/60 rounded-b-3xl">
              <button
                type="button"
                onClick={() => setViewingRepair(null)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                Close View
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================== */}
      {/* MODAL 4: DELETE EXTERNAL REPAIR                           */}
      {/* ========================================================== */}
      {deletingRepair && createPortal(
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex justify-center items-center p-4 z-[9999] animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setDeletingRepair(null); }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 text-center space-y-5 animate-scale-in">
            <div className="mx-auto w-12 h-12 bg-rose-50 dark:bg-rose-955/35 border border-rose-100 dark:border-rose-900/40 rounded-full flex items-center justify-center text-rose-550">
              <Trash2 className="w-5 h-5 animate-bounce" />
            </div>
            
            <div className="space-y-1.5">
              <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">Delete External Repair Log</h3>
              <p className="text-xs text-slate-450 leading-relaxed font-semibold">
                Are you absolutely sure you want to delete external repair <span className="text-rose-500 font-bold font-mono">{deletingRepair.repairNo}</span>? This action is permanent and cannot be undone.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingRepair(null)}
                className="flex-1 py-2.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl text-xs font-bold transition-all"
              >
                Keep Log
              </button>
              <button
                type="button"
                onClick={handleDeleteSubmit}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-500/10"
              >
                {actionLoading ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
