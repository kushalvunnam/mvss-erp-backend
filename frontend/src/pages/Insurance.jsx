import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../config';
import { Search, Plus, Edit2, Trash2, Shield, Calendar, Phone, User, Landmark, DollarSign, AlertTriangle, Clock, X, Check, SearchCode } from 'lucide-react';
import { getCachedData, setCachedData } from '../utils/apiCache';

export default function Insurance({ token }) {
  const [policies, setPolicies] = useState(() => getCachedData(`${API_BASE_URL}/insurance?search=&company=&claimStatus=`) || []);
  const [vehicles, setVehicles] = useState(() => getCachedData(`${API_BASE_URL}/vehicles`) || []);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [claimFilter, setClaimFilter] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [editId, setEditId] = useState(null);
  
  const [formData, setFormData] = useState({
    ownerName: '',
    ownerMobile: '',
    insuranceCompany: '',
    policyNumber: '',
    startDate: new Date().toISOString().slice(0, 10),
    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    idv: '',
    claimStatus: 'No Claim',
    remarks: '',
    vehicleId: ''
  });

  const [vehicleSearch, setVehicleSearch] = useState('');
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);

  // Prevent background page scrolling while the modal is open
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

  // Fetch policies and vehicles
  const fetchPolicies = async () => {
    const url = `${API_BASE_URL}/insurance?search=${encodeURIComponent(search)}&company=${companyFilter}&claimStatus=${claimFilter}`;
    const cached = getCachedData(url);
    if (cached) {
      setPolicies(cached);
    } else if (policies.length === 0) {
      setLoading(true);
    }
    setError('');
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCachedData(url, data);
        setPolicies(data);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to fetch insurance policies.');
      }
    } catch (err) {
      console.error(err);
      setError('Connection failure while loading insurance policies.');
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicles = async () => {
    const url = `${API_BASE_URL}/vehicles`;
    const cached = getCachedData(url);
    if (cached) {
      setVehicles(cached);
    }
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCachedData(url, data);
        setVehicles(data);
      }
    } catch (err) {
      console.error('Failed to load vehicles list:', err);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, [search, companyFilter, claimFilter]);

  useEffect(() => {
    fetchVehicles();
  }, []);

  const resetForm = () => {
    setFormData({
      ownerName: '',
      ownerMobile: '',
      insuranceCompany: '',
      policyNumber: '',
      startDate: new Date().toISOString().slice(0, 10),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      idv: '',
      claimStatus: 'No Claim',
      remarks: '',
      vehicleId: ''
    });
    setVehicleSearch('');
    setEditId(null);
    setIsEdit(false);
  };

  const handleOpenAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (policy) => {
    setFormData({
      ownerName: policy.ownerName || '',
      ownerMobile: policy.ownerMobile || '',
      insuranceCompany: policy.insuranceCompany || '',
      policyNumber: policy.policyNumber || '',
      startDate: policy.startDate ? new Date(policy.startDate).toISOString().slice(0, 10) : '',
      expiryDate: policy.expiryDate ? new Date(policy.expiryDate).toISOString().slice(0, 10) : '',
      idv: policy.idv || '',
      claimStatus: policy.claimStatus || 'No Claim',
      remarks: policy.remarks || '',
      vehicleId: policy.vehicleId?._id || policy.vehicleId || ''
    });
    const vehicle = vehicles.find(v => v._id === (policy.vehicleId?._id || policy.vehicleId));
    setVehicleSearch(vehicle ? `${vehicle.vehicleNumber} (${vehicle.make} ${vehicle.model})` : '');
    setEditId(policy._id);
    setIsEdit(true);
    setShowModal(true);
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete insurance policy for ${name}?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/insurance/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSuccess('Policy deleted successfully.');
        fetchPolicies();
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to delete policy.');
      }
    } catch (err) {
      console.error(err);
      setError('Connection failure during delete request.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.vehicleId) {
      setError('Please select a linked vehicle.');
      return;
    }

    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      const url = isEdit ? `${API_BASE_URL}/insurance/${editId}` : `${API_BASE_URL}/insurance`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setSuccess(isEdit ? 'Policy updated successfully.' : 'Policy created successfully.');
        setShowModal(false);
        resetForm();
        fetchPolicies();
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to save policy details.');
      }
    } catch (err) {
      console.error(err);
      setError('Network failure while saving policy.');
    } finally {
      setActionLoading(false);
    }
  };

  // Expiry Alert helpers
  const getDaysToExpiry = (expiryDate) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const exp = new Date(expiryDate);
    exp.setHours(0,0,0,0);
    const diff = exp.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getExpiryBadge = (days) => {
    if (days < 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-955/25 dark:text-rose-400 dark:border-rose-900/40">
          <AlertTriangle className="w-3 h-3" /> Expired
        </span>
      );
    } else if (days <= 60) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-955/25 dark:text-amber-400 dark:border-amber-900/40">
          <Clock className="w-3 h-3" /> Expiring ({days}d)
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-955/25 dark:text-emerald-400 dark:border-emerald-900/40">
          <Shield className="w-3 h-3" /> Active ({days}d)
        </span>
      );
    }
  };

  const expiringCount = policies.filter(p => {
    const d = getDaysToExpiry(p.expiryDate);
    return d >= 0 && d <= 60;
  }).length;

  const expiredCount = policies.filter(p => getDaysToExpiry(p.expiryDate) < 0).length;

  const filteredVehicleOptions = vehicles.filter(v => 
    v.vehicleNumber?.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
    v.make?.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
    v.model?.toLowerCase().includes(vehicleSearch.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-wider">
            Insurance Policy Manager
          </h1>
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mt-1">
            Register and monitor vehicle insurance coverages and expiry statuses
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-4.5 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all"
        >
          <Plus className="w-4 h-4" /> Add Policy
        </button>
      </div>

      {/* Expiry Alerts Summary Box */}
      {(expiringCount > 0 || expiredCount > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {expiringCount > 0 && (
            <div className="bg-amber-50/50 dark:bg-amber-955/10 border border-amber-200 dark:border-amber-900/40 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center text-amber-700 dark:text-amber-450 shrink-0">
                <AlertTriangle className="w-5.5 h-5.5 animate-bounce" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-amber-800 dark:text-amber-450 uppercase tracking-wider">Policies Expiring Soon</h4>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-500/90 mt-0.5">
                  <span className="font-extrabold">{expiringCount}</span> policies will expire within the next 60 days.
                </p>
              </div>
            </div>
          )}

          {expiredCount > 0 && (
            <div className="bg-rose-50/50 dark:bg-rose-955/10 border border-rose-200 dark:border-rose-900/40 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center text-rose-700 dark:text-rose-450 shrink-0">
                <AlertTriangle className="w-5.5 h-5.5" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-rose-800 dark:text-rose-450 uppercase tracking-wider">Expired Policies</h4>
                <p className="text-xs font-medium text-rose-700 dark:text-rose-500/90 mt-0.5">
                  <span className="font-extrabold">{expiredCount}</span> policies have already expired.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter Options */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Name, Phone, Policy No, Reg No..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-855 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 placeholder-slate-400 text-slate-800 dark:text-slate-200"
          />
        </div>

        <div>
          <input
            type="text"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            placeholder="Filter by Insurance Company..."
            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 placeholder-slate-400 text-slate-800 dark:text-slate-200"
          />
        </div>

        <div>
          <select
            value={claimFilter}
            onChange={(e) => setClaimFilter(e.target.value)}
            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-700 dark:text-slate-350"
          >
            <option value="">-- All Claims --</option>
            <option value="No Claim">No Claim</option>
            <option value="Initiated">Initiated</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Settled">Settled</option>
          </select>
        </div>
      </div>

      {/* Error / Success feedback Banners */}
      {error && (
        <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-955/20 border border-rose-200 dark:border-rose-900/40 p-3.5 rounded-xl text-rose-700 dark:text-rose-400 text-xs font-bold animate-fade-in">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-955/20 border border-emerald-200 dark:border-emerald-900/40 p-3.5 rounded-xl text-emerald-700 dark:text-emerald-400 text-xs font-bold animate-fade-in">
          <Check className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Table grid listing policies */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">
            Loading insurance policies...
          </div>
        ) : policies.length === 0 ? (
          <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
            No registered insurance policies found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="p-4">Policy ID</th>
                  <th className="p-4">Owner Info</th>
                  <th className="p-4">Vehicle</th>
                  <th className="p-4">Provider / Policy No</th>
                  <th className="p-4">Coverage Dates</th>
                  <th className="p-4">IDV</th>
                  <th className="p-4">Claim status</th>
                  <th className="p-4">Expiry status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300">
                {policies.map((p) => {
                  const daysLeft = getDaysToExpiry(p.expiryDate);
                  return (
                    <tr key={p._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="p-4 font-bold text-indigo-650 dark:text-indigo-400 font-mono tracking-wider">
                        {p.insuranceId}
                      </td>
                      <td className="p-4">
                        <div className="font-extrabold text-slate-850 dark:text-white">{p.ownerName}</div>
                        <div className="text-[10px] text-slate-450 dark:text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" /> {p.ownerMobile}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-black text-slate-800 dark:text-white font-mono tracking-wide">{p.vehicleNo}</div>
                        <div className="text-[10px] text-slate-450 dark:text-slate-400">
                          {p.vehicleId?.make} {p.vehicleId?.model}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-850 dark:text-slate-200">{p.insuranceCompany}</div>
                        <div className="text-[10px] text-slate-450 dark:text-slate-400 font-mono mt-0.5">{p.policyNumber}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-[10.5px]">From: <span className="font-bold">{new Date(p.startDate).toLocaleDateString('en-IN')}</span></div>
                        <div className="text-[10.5px] mt-0.5">To: <span className="font-bold">{new Date(p.expiryDate).toLocaleDateString('en-IN')}</span></div>
                      </td>
                      <td className="p-4 font-bold text-slate-850 dark:text-white font-mono">
                        ₹{p.idv.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          p.claimStatus === 'No Claim'
                            ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                            : p.claimStatus === 'Settled'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/25 dark:text-emerald-400 dark:border-emerald-900/40'
                            : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-955/25 dark:text-amber-400 dark:border-amber-900/40'
                        }`}>
                          {p.claimStatus}
                        </span>
                      </td>
                      <td className="p-4">
                        {getExpiryBadge(daysLeft)}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-indigo-600 transition-colors"
                            title="Edit Policy"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(p._id, p.ownerName)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-rose-600 transition-colors"
                            title="Delete Policy"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Dialog Form */}
      {showModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh] min-h-0">
            
            {/* Modal Header */}
            <div className="px-6 py-4.5 border-b border-slate-150 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-850">
              <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-650" />
                {isEdit ? 'Edit Insurance Policy' : 'Add New Insurance Policy'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-650">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              
              {/* Scrollable Form Fields Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
              
              {/* Vehicle Link Autocomplete Selection */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                  Link Vehicle *
                </label>
                <div className="relative">
                  <div className="relative">
                    <SearchCode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={vehicleSearch}
                      onChange={(e) => {
                        setVehicleSearch(e.target.value);
                        setShowVehicleDropdown(true);
                      }}
                      onFocus={() => setShowVehicleDropdown(true)}
                      placeholder="Type registration number, brand or model to link vehicle..."
                      className="w-full pl-9.5 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 placeholder-slate-400 text-slate-800 dark:text-slate-200"
                    />
                    {formData.vehicleId && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[8px] font-black">
                        ✓
                      </div>
                    )}
                  </div>

                  {showVehicleDropdown && vehicleSearch && (
                    <div className="absolute left-0 right-0 mt-1.5 max-h-48 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredVehicleOptions.length === 0 ? (
                        <div className="p-3 text-xs text-slate-450 italic text-center">
                          No matching vehicles found.
                        </div>
                      ) : (
                        filteredVehicleOptions.map(veh => (
                          <div
                            key={veh._id}
                            onClick={() => {
                              setFormData({ ...formData, vehicleId: veh._id });
                              setVehicleSearch(`${veh.vehicleNumber} (${veh.make} ${veh.model})`);
                              // Autofill owner name and mobile if empty and customer info exists
                              setFormData(prev => ({
                                ...prev,
                                vehicleId: veh._id,
                                ownerName: prev.ownerName || veh.customerId?.name || '',
                                ownerMobile: prev.ownerMobile || veh.customerId?.mobile || ''
                              }));
                              setShowVehicleDropdown(false);
                            }}
                            className="p-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex justify-between items-center"
                          >
                            <div>
                              <span className="font-extrabold text-indigo-650 dark:text-indigo-400 font-mono tracking-wider mr-2">{veh.vehicleNumber}</span>
                              <span className="text-slate-550 dark:text-slate-350">{veh.make} {veh.model}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold font-mono">
                              Owner: {veh.customerId?.name || 'N/A'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Owner Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                    Owner Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.ownerName}
                    onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-850 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                    Owner Mobile *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.ownerMobile}
                    onChange={(e) => setFormData({ ...formData, ownerMobile: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-850 dark:text-white"
                  />
                </div>
              </div>

              {/* Insurance Provider Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                    Insurance Company *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.insuranceCompany}
                    placeholder="e.g. HDFC Ergo, ICICI Lombard"
                    onChange={(e) => setFormData({ ...formData, insuranceCompany: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-850 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                    Policy Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.policyNumber}
                    onChange={(e) => setFormData({ ...formData, policyNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-850 dark:text-white font-mono"
                  />
                </div>
              </div>

              {/* Dates grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                    Policy Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-850 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                    Policy Expiry Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-850 dark:text-white"
                  />
                </div>
              </div>

              {/* IDV & Claim status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                    Insured Declared Value (IDV) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.idv}
                    placeholder="Enter IDV amount in Rs."
                    onChange={(e) => setFormData({ ...formData, idv: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-850 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                    Claim Status
                  </label>
                  <select
                    value={formData.claimStatus}
                    onChange={(e) => setFormData({ ...formData, claimStatus: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-700 dark:text-slate-350"
                  >
                    <option value="No Claim">No Claim</option>
                    <option value="Initiated">Initiated</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Settled">Settled</option>
                  </select>
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                  Remarks / Notes
                </label>
                <textarea
                  value={formData.remarks}
                  rows="3"
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  placeholder="Enter any policy remarks or custom notes here..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 placeholder-slate-400 text-slate-850 dark:text-white resize-none"
                />
              </div>

              </div>

              {/* Form Footer */}
              <div className="flex justify-end gap-3 p-6 border-t border-slate-150 dark:border-slate-850">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4.5 py-2.5 border border-slate-200 dark:border-slate-800 text-slate-550 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-black uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4.5 py-2.5 bg-indigo-650 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center gap-1.5"
                >
                  {actionLoading ? 'Saving...' : 'Save Policy'}
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
