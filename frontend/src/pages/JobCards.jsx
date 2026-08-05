import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { Search, Plus, Edit2, FileText, ChevronRight, Eye, Trash2 } from 'lucide-react';
import JobCardForm from './JobCardForm';
import JobCardDetails from './JobCardDetails';

import { getCachedData, setCachedData } from '../utils/apiCache';

export default function JobCards({ token, user, setActiveTab, viewJcId = null, setViewJcId = null }) {
  const [jobCards, setJobCards] = useState(() => getCachedData(`${API_BASE_URL}/jobcards?search=&status=`) || []);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list', 'create', 'edit', 'details'
  const [selectedJcId, setSelectedJcId] = useState(null);

  // If a global viewJcId is passed down, open details immediately
  useEffect(() => {
    if (viewJcId) {
      setSelectedJcId(viewJcId);
      setViewMode('details');
    }
  }, [viewJcId]);

  const fetchJobCards = async () => {
    const url = `${API_BASE_URL}/jobcards?search=${encodeURIComponent(search)}&status=${statusFilter}`;
    const cached = getCachedData(url);
    if (cached && jobCards.length === 0) setJobCards(cached);

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCachedData(url, data);
        setJobCards(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (viewMode === 'list') {
      fetchJobCards();
    }
  }, [search, statusFilter, viewMode]);

  useEffect(() => {
    const globalFilter = localStorage.getItem('global_search_filter');
    if (globalFilter) {
      setSearch(globalFilter);
      localStorage.removeItem('global_search_filter');
    }
  }, []);

  const handleOpenDetails = (id) => {
    setSelectedJcId(id);
    setViewMode('details');
  };

  const handleOpenEdit = (id, e) => {
    e.stopPropagation();
    setSelectedJcId(id);
    setViewMode('edit');
  };

  const handleDeleteJobCard = async (id, e) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to delete this job card permanently? This will also affect billing records and estimates linked.')) return;
    
    try {
      if (token === 'mock_jwt_token_for_offline_demo') {
        const db = JSON.parse(sessionStorage.getItem('mock_jobcards') || '[]');
        const filtered = db.filter(jc => jc._id !== id);
        sessionStorage.setItem('mock_jobcards', JSON.stringify(filtered));
        fetchJobCards();
      } else {
        const res = await fetch(`${API_BASE_URL}/jobcards/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          fetchJobCards();
        } else {
          const err = await res.json();
          alert(err.error || 'Failed to delete job card.');
        }
      }
    } catch (err) {
      console.error('Failed to delete job card:', err);
    }
  };

  const handleSaved = () => {
    setViewMode('list');
    setSelectedJcId(null);
    if (setViewJcId) setViewJcId(null);
  };

  const handleCancel = () => {
    setViewMode('list');
    setSelectedJcId(null);
    if (setViewJcId) setViewJcId(null);
  };

  // Quick navigation handlers for details page
  const handleCreateEstimate = () => {
    // Navigate to estimates tab and flag to create for this jobcard
    localStorage.setItem('create_estimate_jc_id', selectedJcId);
    setActiveTab('estimates');
  };

  const handleConvertInvoice = () => {
    // Navigate to invoices tab and flag to create for this jobcard
    localStorage.setItem('create_invoice_jc_id', selectedJcId);
    setActiveTab('invoices');
  };

  if (viewMode === 'create') {
    return <JobCardForm token={token} onSaved={handleSaved} onCancel={handleCancel} />;
  }

  if (viewMode === 'edit') {
    return <JobCardForm token={token} editId={selectedJcId} onSaved={handleSaved} onCancel={handleCancel} />;
  }

  if (viewMode === 'details') {
    return (
      <JobCardDetails
        jcId={selectedJcId}
        token={token}
        user={user}
        onBack={handleCancel}
        onCreateEstimate={handleCreateEstimate}
        onConvertInvoice={handleConvertInvoice}
      />
    );
  }

  const isAdvisorOrAdmin = user?.role === 'Admin' || user?.role === 'Service';
  const isAuthorizedToEdit = ['Super Admin', 'Admin', 'Service', 'Spares', 'Branch Manager', 'Workshop Manager'].includes(user?.role);

  const handleStatusChange = async (jcId, newStatus) => {
    const currentJc = jobCards.find(j => j._id === jcId);
    if (currentJc && currentJc.status === newStatus) return;

    const remarks = window.prompt(`Enter optional remarks for changing status to "${newStatus}":`);
    if (remarks === null) return; // user cancelled

    try {
      const res = await fetch(`${API_BASE_URL}/jobcards/${jcId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus, statusRemarks: remarks })
      });
      if (res.ok) {
        fetchJobCards();
      } else {
        const errObj = await res.json().catch(() => ({}));
        alert(errObj.error || 'Failed to update job card status.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to the server.');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in p-1">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white">Digital Job Cards</h2>
          <p className="text-xs text-slate-400 font-semibold dark:text-slate-500">Track and update active workshop vehicle check sheets</p>
        </div>
        {isAdvisorOrAdmin && (
          <button
            onClick={() => setViewMode('create')}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10"
          >
            <Plus className="w-4 h-4" /> Create Job Card
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Job Card Number, vehicle plate, or owner mobile..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 text-xs font-semibold focus:outline-none focus:border-indigo-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-750 dark:text-slate-300 text-xs font-bold focus:outline-none focus:border-indigo-500"
        >
          <option value="">All Card Statuses</option>
          <option value="Waiting for Customer Approval">Waiting for Customer Approval</option>
          <option value="Parts Procuring">Parts Procuring</option>
          <option value="Work in Progress">Work in Progress</option>
          <option value="Quality Test">Quality Test</option>
          <option value="Ready for Delivery">Ready for Delivery</option>
          <option value="Delivered">Delivered</option>
          <option value="Created">Created</option>
          <option value="Inspect Stage">Inspect Stage</option>
          <option value="Estimation">Estimation</option>
          <option value="Customer Approval">Customer Approval</option>
          <option value="Work In Progress">Work In Progress</option>
          <option value="Body Shop">Body Shop</option>
          <option value="Quality Check">Quality Check</option>
          <option value="Closed">Closed</option>
        </select>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {jobCards.length > 0 ? (
          jobCards.map(jc => {
            let statusColor = 'bg-slate-50 dark:bg-slate-950/20 text-slate-700 dark:text-slate-400 border-slate-200/50';
            if (jc.status === 'Waiting for Customer Approval') statusColor = 'bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-400 border border-purple-200/50';
            else if (jc.status === 'Parts Procuring') statusColor = 'bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-400 border border-orange-200/50';
            else if (['Work in Progress', 'Work In Progress'].includes(jc.status)) statusColor = 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border border-blue-200/50';
            else if (['Quality Test', 'Quality Check', 'Quality Check'].includes(jc.status)) statusColor = 'bg-yellow-50 dark:bg-yellow-950/20 text-yellow-750 dark:text-yellow-450 border border-yellow-200/50';
            else if (jc.status === 'Ready for Delivery') statusColor = 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200/50';
            else if (jc.status === 'Delivered') statusColor = 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50';

            return (
              <div
                key={jc._id}
                onClick={() => handleOpenDetails(jc._id)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-500/20 cursor-pointer transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">{jc.jobCardNo}</span>
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      {isAuthorizedToEdit ? (
                        <select
                          value={jc.status}
                          onChange={(e) => handleStatusChange(jc._id, e.target.value)}
                          className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 border ${statusColor}`}
                        >
                          <option value="Waiting for Customer Approval">🟣 Waiting for Customer Approval</option>
                          <option value="Parts Procuring">🟠 Parts Procuring</option>
                          <option value="Work in Progress">🔵 Work in Progress</option>
                          <option value="Quality Test">🟡 Quality Test</option>
                          <option value="Ready for Delivery">🟢 Ready for Delivery</option>
                          <option value="Delivered">✅ Delivered</option>
                          {!['Waiting for Customer Approval', 'Parts Procuring', 'Work in Progress', 'Quality Test', 'Ready for Delivery', 'Delivered'].includes(jc.status) && (
                            <option value={jc.status}>{jc.status}</option>
                          )}
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase border ${statusColor}`}>
                          {jc.status}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <h3 className="text-sm font-extrabold text-slate-800 dark:text-white font-mono tracking-wide">
                    {jc.vehicleId?.vehicleNumber}
                  </h3>
                  <p className="text-xs text-slate-550 dark:text-slate-350 font-bold mt-0.5">
                    {jc.vehicleId?.make} {jc.vehicleId?.model}
                  </p>
                  
                  <div className="mt-3.5 space-y-1 text-xs text-slate-400 font-medium">
                    <p>Owner: <strong className="text-slate-700 dark:text-slate-300">{jc.customerId?.name}</strong></p>
                    <p>Odo: <strong className="text-slate-700 dark:text-slate-300">{jc.odometerReading.toLocaleString()} km</strong></p>
                    <p>Service(s): <strong className="text-slate-700 dark:text-slate-300">{jc.serviceTypes && jc.serviceTypes.length > 0 ? jc.serviceTypes.join(', ') : jc.serviceType}</strong></p>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex justify-between items-center">
                  <span className="text-[9px] text-slate-400 font-semibold">
                    {new Date(jc.date).toLocaleDateString('en-IN')}
                  </span>
                  
                  <div className="flex gap-2">
                    {isAdvisorOrAdmin && jc.status !== 'Delivered' && (
                      <button
                        onClick={(e) => handleOpenEdit(jc._id, e)}
                        className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {user?.role === 'Admin' && (
                      <button
                        onClick={(e) => handleDeleteJobCard(jc._id, e)}
                        className="text-slate-400 hover:text-red-650 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        title="Delete Job Card"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    )}
                    <span className="text-indigo-600 dark:text-indigo-400 p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/20 group-hover:translate-x-0.5 transition-all">
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full py-16 text-center text-slate-400 dark:text-slate-500 font-semibold text-xs">
            No digital job cards recorded yet.
          </div>
        )}
      </div>
    </div>
  );
}
