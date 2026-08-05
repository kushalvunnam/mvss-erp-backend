import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../config';
import { 
  Users, 
  Plus, 
  Search, 
  Filter, 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  FileSpreadsheet, 
  IndianRupee, 
  Clock, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  XCircle,
  X,
  CreditCard
} from 'lucide-react';

export default function Vendors({ token, user }) {
  const [vendors, setVendors] = useState([]);
  const [stats, setStats] = useState({ totalVendors: 0, totalPurchaseValue: 0, totalOutstanding: 0, totalPaid: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);

  const [formData, setFormData] = useState({
    vendorCode: '',
    name: '',
    category: 'Spares',
    type: 'Wholesaler',
    gstNumber: '',
    contactPerson: '',
    mobile: '',
    email: '',
    address: '',
    city: 'Hyderabad',
    state: 'Telangana',
    paymentTerms: 'Net 30',
    status: 'Active',
    notes: '',
    bankDetails: {
      bankName: '',
      accountNumber: '',
      ifscCode: '',
      upiId: ''
    }
  });

  const isWritable = user?.role === 'Admin' || user?.role === 'Accounts' || user?.role === 'Spares';

  // Close modal on Esc keypress
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [token, categoryFilter, typeFilter]);

  const parseJsonResponse = async (res) => {
    try {
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await res.json();
      }
      const text = await res.text();
      return { error: `Server error (${res.status}): ${text.slice(0, 150)}` };
    } catch (err) {
      return { error: `Failed to parse response: ${err.message}` };
    }
  };

  const fetchVendors = async () => {
    setLoading(true);
    try {
      let url = `${API_BASE_URL}/vendors?`;
      if (categoryFilter) url += `category=${encodeURIComponent(categoryFilter)}&`;
      if (typeFilter) url += `type=${encodeURIComponent(typeFilter)}&`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await parseJsonResponse(res);
        if (data.vendors) {
          setVendors(Array.isArray(data.vendors) ? data.vendors : []);
        } else if (Array.isArray(data)) {
          setVendors(data);
        }
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch vendors:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingVendor(null);
    setFormData({
      vendorCode: '',
      name: '',
      category: 'Spares',
      type: 'Wholesaler',
      gstNumber: '',
      contactPerson: '',
      mobile: '',
      email: '',
      address: '',
      city: 'Hyderabad',
      state: 'Telangana',
      paymentTerms: 'Net 30',
      status: 'Active',
      notes: '',
      bankDetails: { bankName: '', accountNumber: '', ifscCode: '', upiId: '' }
    });
    setShowModal(true);
  };

  const handleOpenEdit = (v) => {
    setEditingVendor(v);
    setFormData({
      vendorCode: v.vendorCode || '',
      name: v.name || '',
      category: v.category || 'Spares',
      type: v.type || 'Wholesaler',
      gstNumber: v.gstNumber || '',
      contactPerson: v.contactPerson || '',
      mobile: v.mobile || '',
      email: v.email || '',
      address: v.address || '',
      city: v.city || 'Hyderabad',
      state: v.state || 'Telangana',
      paymentTerms: v.paymentTerms || 'Net 30',
      status: v.status || 'Active',
      notes: v.notes || '',
      bankDetails: {
        bankName: v.bankDetails?.bankName || '',
        accountNumber: v.bankDetails?.accountNumber || '',
        ifscCode: v.bankDetails?.ifscCode || '',
        upiId: v.bankDetails?.upiId || ''
      }
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.mobile) {
      alert('Vendor Name and Mobile Number are required.');
      return;
    }

    try {
      const url = editingVendor 
        ? `${API_BASE_URL}/vendors/${editingVendor._id}`
        : `${API_BASE_URL}/vendors`;
      const method = editingVendor ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await parseJsonResponse(res);

      if (res.ok && (data.success || data._id || data.vendor)) {
        setShowModal(false);
        fetchVendors();
      } else {
        alert(`Error: ${data.error || data.message || 'Failed to save vendor'}`);
      }
    } catch (err) {
      console.error('Save Vendor failed:', err);
      alert(`Failed to save vendor: ${err.message || 'Network error'}`);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete vendor "${name}"?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/vendors/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await parseJsonResponse(res);
      if (res.ok && (data.success || data.message)) {
        fetchVendors();
      } else {
        alert(data.error || data.message || 'Failed to delete vendor.');
      }
    } catch (err) {
      alert('Failed to delete vendor.');
    }
  };

  const exportToCSV = () => {
    const headers = ['Vendor Code', 'Name', 'Category', 'Type', 'GSTIN', 'Contact Person', 'Mobile', 'Email', 'Payment Terms', 'Total Purchase', 'Outstanding', 'Status'];
    const rows = filteredVendors.map(v => [
      v.vendorCode,
      `"${v.name}"`,
      v.category,
      v.type,
      v.gstNumber || 'N/A',
      `"${v.contactPerson || 'N/A'}"`,
      v.mobile,
      v.email || 'N/A',
      v.paymentTerms,
      v.totalPurchaseValue || 0,
      v.outstandingBalance || 0,
      v.status
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `vendors_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredVendors = vendors.filter(v => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      v.name?.toLowerCase().includes(term) ||
      v.vendorCode?.toLowerCase().includes(term) ||
      v.contactPerson?.toLowerCase().includes(term) ||
      v.mobile?.includes(term) ||
      v.gstNumber?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in p-1">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Building2 className="w-7 h-7 text-indigo-500" /> Vendor Management
          </h1>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Manage parts suppliers, distributor ledgers, GST details & purchase balances
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={exportToCSV}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Export CSV
          </button>

          {isWritable && (
            <button
              onClick={handleOpenCreate}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Vendor
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-lg">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Vendors</span>
            <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.totalVendors}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-lg">
            <IndianRupee className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Purchases</span>
            <span className="text-xl font-black text-slate-900 dark:text-white font-mono">
              ₹{stats.totalPurchaseValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-lg">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Paid Amount</span>
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              ₹{stats.totalPaid.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-lg">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Outstanding Balance</span>
            <span className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono">
              ₹{stats.totalOutstanding.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search vendor name, code, GSTIN, contact person or phone..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
          >
            <option value="">All Categories</option>
            <option value="Spares">Spares</option>
            <option value="Lubricants">Lubricants</option>
            <option value="Batteries & Tyres">Batteries & Tyres</option>
            <option value="Accessories">Accessories</option>
            <option value="Tools & Equipment">Tools & Equipment</option>
            <option value="Sublet Service">Sublet Service</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
          >
            <option value="">All Vendor Types</option>
            <option value="Manufacturer">Manufacturer</option>
            <option value="Authorized Distributor">Authorized Distributor</option>
            <option value="Wholesaler">Wholesaler</option>
            <option value="Local Dealer">Local Dealer</option>
          </select>
        </div>
      </div>

      {/* Vendors Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs font-semibold">Loading vendor ledgers...</div>
        ) : filteredVendors.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No vendors found</p>
            <p className="text-xs text-slate-400">Add a vendor or clear your search filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  <th className="p-4">Vendor Code & Name</th>
                  <th className="p-4">Category & Type</th>
                  <th className="p-4">Contact Info</th>
                  <th className="p-4">GSTIN & Payment Terms</th>
                  <th className="p-4 text-right">Total Purchase</th>
                  <th className="p-4 text-right">Outstanding</th>
                  <th className="p-4 text-center">Status</th>
                  {isWritable && <th className="p-4 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-medium">
                {filteredVendors.map(v => (
                  <tr key={v._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-slate-900 dark:text-white">{v.name}</div>
                      <div className="text-[10px] font-mono font-semibold text-indigo-600 dark:text-indigo-400">{v.vendorCode}</div>
                    </td>

                    <td className="p-4">
                      <span className="inline-block px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded text-[10px] font-bold">
                        {v.category}
                      </span>
                      <div className="text-[10px] text-slate-400 font-semibold mt-1">{v.type}</div>
                    </td>

                    <td className="p-4 space-y-0.5">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" /> {v.mobile}
                      </div>
                      {v.contactPerson && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Attn: {v.contactPerson}
                        </div>
                      )}
                      {v.email && (
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-400" /> {v.email}
                        </div>
                      )}
                    </td>

                    <td className="p-4">
                      <div className="font-mono text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                        {v.gstNumber || 'N/A'}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 font-semibold">
                        Terms: {v.paymentTerms}
                      </div>
                    </td>

                    <td className="p-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                      ₹{(v.totalPurchaseValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    <td className="p-4 text-right font-mono font-bold">
                      <span className={(v.outstandingBalance || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}>
                        ₹{(v.outstandingBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>

                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        v.status === 'Active' 
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' 
                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                      }`}>
                        {v.status}
                      </span>
                    </td>

                    {isWritable && (
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOpenEdit(v)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-indigo-600 transition-colors"
                            title="Edit Vendor"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {user?.role === 'Admin' && (
                            <button
                              onClick={() => handleDelete(v._id, v.name)}
                              className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                              title="Delete Vendor"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Vendor Modal */}
      {showModal && createPortal(
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex justify-center items-center p-3 sm:p-6 z-[99999] select-none overflow-hidden animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[90vw] max-w-[850px] h-[80vh] max-h-[80vh] shadow-2xl flex flex-col relative overflow-hidden my-auto animate-scale-in">
            <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/40 shrink-0">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-500" />
                {editingVendor ? 'Edit Vendor Details' : 'Add New Vendor'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Vendor Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Bosch Automotive India"
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Vendor Code (Auto-generated if empty)</label>
                  <input
                    type="text"
                    value={formData.vendorCode}
                    onChange={(e) => setFormData({ ...formData, vendorCode: e.target.value })}
                    placeholder="e.g. VND-001"
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
                  >
                    <option value="Spares">Spares</option>
                    <option value="Lubricants">Lubricants</option>
                    <option value="Batteries & Tyres">Batteries & Tyres</option>
                    <option value="Accessories">Accessories</option>
                    <option value="Tools & Equipment">Tools & Equipment</option>
                    <option value="Sublet Service">Sublet Service</option>
                    <option value="General">General</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Vendor Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
                  >
                    <option value="Manufacturer">Manufacturer</option>
                    <option value="Authorized Distributor">Authorized Distributor</option>
                    <option value="Wholesaler">Wholesaler</option>
                    <option value="Local Dealer">Local Dealer</option>
                    <option value="Service Provider">Service Provider</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mobile Number *</label>
                  <input
                    type="text"
                    required
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    placeholder="e.g. 9876543210"
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="sales@vendor.com"
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">GSTIN Number</label>
                  <input
                    type="text"
                    value={formData.gstNumber}
                    onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value.toUpperCase() })}
                    placeholder="36AAJCM4778P1Z0"
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Payment Terms</label>
                  <select
                    value={formData.paymentTerms}
                    onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
                  >
                    <option value="Immediate">Immediate</option>
                    <option value="Net 15">Net 15 Days</option>
                    <option value="Net 30">Net 30 Days</option>
                    <option value="Net 45">Net 45 Days</option>
                    <option value="Net 60">Net 60 Days</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Address</label>
                <textarea
                  rows="2"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Street address, city, pin code..."
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
                />
              </div>

              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex justify-end gap-3 shrink-0 rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-150 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
                >
                  Save Vendor
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
