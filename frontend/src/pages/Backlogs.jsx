import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import StatsCard from '../components/StatsCard';
import { API_BASE_URL } from '../config';
import { 
  Plus, 
  Search, 
  Filter, 
  Clock, 
  Package, 
  AlertCircle, 
  CheckCircle2, 
  AlertTriangle,
  Edit3, 
  Trash2, 
  Eye, 
  X, 
  Calendar, 
  ClipboardList, 
  User, 
  Car, 
  Phone,
  ArrowRightLeft,
  ChevronDown
} from 'lucide-react';

export default function Backlogs({ token, user }) {
  const [backlogs, setBacklogs] = useState([]);
  const [jobCards, setJobCards] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const [vendorList, setVendorList] = useState([]);
  const [estimateParts, setEstimateParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [partNumberFilter, setPartNumberFilter] = useState('');
  const [jobCardFilter, setJobCardFilter] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [orderedFromDate, setOrderedFromDate] = useState('');
  const [orderedToDate, setOrderedToDate] = useState('');
  const [expectedFromDate, setExpectedFromDate] = useState('');
  const [expectedToDate, setExpectedToDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedBacklog, setSelectedBacklog] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    vehicleNo: '',
    customerName: '',
    jobCardNo: '',
    vehicleModel: '',
    partNumber: '',
    partName: '',
    brand: '',
    qty: 1,
    vendorName: '',
    vendorContact: '',
    poNumber: '',
    orderedDate: new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: '',
    priority: 'Medium',
    remarks: '',
    status: 'Pending Order'
  });

  // Role Permissions
  const role = user?.role || 'Guest';
  const canCreate = ['Admin', 'Accounts', 'Service', 'Body Shop', 'Spares'].includes(role);
  const canEdit = ['Admin', 'Accounts', 'Body Shop', 'Spares'].includes(role);
  const canReceive = ['Admin', 'Accounts', 'Body Shop', 'Spares'].includes(role);
  const canDelete = role === 'Admin';

  useEffect(() => {
    fetchBacklogs();
    fetchJobCards();
    fetchInventoryList();
    fetchVendors();
  }, [token, statusFilter, priorityFilter, orderedFromDate, orderedToDate, expectedFromDate, expectedToDate]);

  // Handle URL query parameters to auto-fill backlog request
  useEffect(() => {
    if (jobCards.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const jcNo = params.get('jobCardNo');
    const pNo = params.get('partNumber');
    const pName = params.get('partName');
    const q = params.get('qty');
    const vNo = params.get('vehicleNo');
    const vModel = params.get('vehicleModel');
    const cName = params.get('customerName');

    if (jcNo || pNo || pName || q) {
      setFormData(prev => ({
        ...prev,
        jobCardNo: jcNo || '',
        partNumber: pNo || '',
        partName: pName || '',
        qty: parseInt(q) || 1,
        vehicleNo: vNo || '',
        vehicleModel: vModel || '',
        customerName: cName || ''
      }));
      setShowAddModal(true);
      
      if (jcNo) {
        handleJobCardSelectChange(jcNo);
      }
    }
  }, [jobCards]);

  // Close modals on Esc keypress
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
        setShowEditModal(false);
        setShowViewModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  const fetchBacklogs = async () => {
    setLoading(true);
    setError('');
    try {
      const queryParams = new URLSearchParams();
      if (statusFilter) queryParams.append('status', statusFilter);
      if (priorityFilter) queryParams.append('priority', priorityFilter);
      if (vendorFilter) queryParams.append('vendorName', vendorFilter);
      if (partNumberFilter) queryParams.append('partNumber', partNumberFilter);
      if (jobCardFilter) queryParams.append('jobCardNo', jobCardFilter);
      if (vehicleFilter) queryParams.append('vehicleNo', vehicleFilter);
      if (orderedFromDate) queryParams.append('orderedFromDate', orderedFromDate);
      if (orderedToDate) queryParams.append('orderedToDate', orderedToDate);
      if (expectedFromDate) queryParams.append('expectedFromDate', expectedFromDate);
      if (expectedToDate) queryParams.append('expectedToDate', expectedToDate);
      if (searchTerm) queryParams.append('search', searchTerm);

      const res = await fetch(`${API_BASE_URL}/backlogs?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await parseJsonResponse(res);
        setBacklogs(Array.isArray(data) ? data : []);
      } else {
        const err = await parseJsonResponse(res);
        setError(err.error || 'Failed to fetch backlog list.');
      }
    } catch (err) {
      console.error(err);
      setError('Connection failure while loading backlogs.');
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
      console.error('Failed to load job cards:', err);
    }
  };

  const fetchInventoryList = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/inventory`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInventoryList(Array.isArray(data) ? data.filter(i => i.type === 'Part') : []);
      }
    } catch (err) {
      console.error('Failed to load inventory parts:', err);
    }
  };

  const fetchVendors = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/vendors`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setVendorList(Array.isArray(data.vendors) ? data.vendors : []);
      }
    } catch (err) {
      console.error('Failed to load vendors:', err);
    }
  };

  // Auto-fill form when selection of Job Card changes
  const handleJobCardSelectChange = async (jcNo) => {
    setFormData(prev => {
      const updated = { ...prev, jobCardNo: jcNo };
      if (!jcNo) return updated;
      
      const matched = jobCards.find(j => j.jobCardNo === jcNo);
      if (matched) {
        updated.vehicleNo = matched.vehicleNo || matched.vehicleId?.regNo || '';
        updated.vehicleModel = matched.vehicleModel || matched.vehicleId?.model || '';
        updated.customerName = matched.customerName || matched.customerId?.name || '';
      }
      return updated;
    });

    setEstimateParts([]);
    if (!jcNo) return;

    const matched = jobCards.find(j => j.jobCardNo === jcNo);
    if (matched && matched._id) {
      try {
        const res = await fetch(`${API_BASE_URL}/estimates?jobCardId=${matched._id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const estimatesList = await res.json();
          const latestEstimate = estimatesList[0];
          if (latestEstimate && latestEstimate.parts) {
            setEstimateParts(latestEstimate.parts);
          }
        }
      } catch (err) {
        console.error('Failed to fetch estimate parts:', err);
      }
    }
  };

  const handleEstimatePartSelectChange = (indexVal) => {
    if (indexVal === "") return;
    const part = estimateParts[parseInt(indexVal)];
    if (part) {
      setFormData(prev => ({
        ...prev,
        partNumber: part.partNo || '',
        partName: part.name || '',
        qty: part.qty || 1
      }));
    }
  };

  // Auto-fill form when selection of inventory part changes
  const handlePartSelectChange = (partId) => {
    if (!partId) {
      setFormData(prev => ({ ...prev, partNumber: '', partName: '', brand: '' }));
      return;
    }
    const matched = inventoryList.find(p => p._id === partId);
    if (matched) {
      setFormData(prev => ({
        ...prev,
        partNumber: matched.partNumber || '',
        partName: matched.partName || '',
        brand: matched.brand || ''
      }));
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API_BASE_URL}/backlogs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setSuccess('Backlog request recorded successfully.');
        setShowAddModal(false);
        fetchBacklogs();
        resetFormData();
      } else {
        const err = await parseJsonResponse(res);
        setError(err.error || 'Failed to record backlog request.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error while saving backlog request.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedBacklog) return;
    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API_BASE_URL}/backlogs/${selectedBacklog._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setSuccess('Backlog details updated.');
        setShowEditModal(false);
        fetchBacklogs();
        resetFormData();
      } else {
        const err = await parseJsonResponse(res);
        setError(err.error || 'Failed to update backlog.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error while updating backlog.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkReceived = async (backlog) => {
    if (!window.confirm(`Mark ${backlog.partName} (${backlog.qty} pcs) as Received? This will restock the Parts Master and create a Purchase history log.`)) {
      return;
    }
    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API_BASE_URL}/backlogs/${backlog._id}/receive`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (res.ok) {
        setSuccess(`Backlog ${backlog.backlogId} marked as Received. Inventory updated successfully.`);
        fetchBacklogs();
      } else {
        const err = await parseJsonResponse(res);
        setError(err.error || 'Failed to mark as received.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error while completing receipt.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id, backlogId) => {
    if (!window.confirm(`Are you sure you want to permanently delete backlog entry ${backlogId}? This action cannot be undone.`)) {
      return;
    }
    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API_BASE_URL}/backlogs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        setSuccess(`Deleted backlog ${backlogId}.`);
        fetchBacklogs();
      } else {
        const err = await parseJsonResponse(res);
        setError(err.error || 'Failed to delete backlog.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error while deleting backlog.');
    } finally {
      setActionLoading(false);
    }
  };

  const resetFormData = () => {
    setFormData({
      vehicleNo: '',
      customerName: '',
      jobCardNo: '',
      vehicleModel: '',
      partNumber: '',
      partName: '',
      brand: '',
      qty: 1,
      vendorName: '',
      vendorContact: '',
      poNumber: '',
      orderedDate: new Date().toISOString().slice(0, 10),
      expectedDeliveryDate: '',
      priority: 'Medium',
      remarks: '',
      status: 'Pending Order'
    });
    setSelectedBacklog(null);
  };

  const openAddModal = () => {
    resetFormData();
    setError('');
    setSuccess('');
    setShowAddModal(true);
  };

  const openEditModal = (backlog) => {
    setError('');
    setSuccess('');
    setSelectedBacklog(backlog);
    setFormData({
      vehicleNo: backlog.vehicleNo || '',
      customerName: backlog.customerName || '',
      jobCardNo: backlog.jobCardNo || '',
      vehicleModel: backlog.vehicleModel || '',
      partNumber: backlog.partNumber || '',
      partName: backlog.partName || '',
      brand: backlog.brand || '',
      qty: backlog.qty || 1,
      vendorName: backlog.vendorName || '',
      vendorContact: backlog.vendorContact || '',
      poNumber: backlog.poNumber || '',
      orderedDate: backlog.orderedDate ? new Date(backlog.orderedDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      expectedDeliveryDate: backlog.expectedDeliveryDate ? new Date(backlog.expectedDeliveryDate).toISOString().slice(0, 10) : '',
      priority: backlog.priority || 'Medium',
      remarks: backlog.remarks || '',
      status: backlog.status || 'Pending Order'
    });
    setShowEditModal(true);
  };

  const openViewModal = (backlog) => {
    setSelectedBacklog(backlog);
    setShowViewModal(true);
  };

  // Dashboard Stats Calculations
  const totalBacklogParts = backlogs
    .filter(b => ['Pending Order', 'Ordered', 'Partially Received'].includes(b.status))
    .reduce((sum, item) => sum + (item.qty || 0), 0);

  const pendingCount = backlogs.filter(b => b.status === 'Pending Order').length;
  const orderedCount = backlogs.filter(b => b.status === 'Ordered').length;
  const partiallyReceivedCount = backlogs.filter(b => b.status === 'Partially Received').length;

  const todayStr = new Date().toISOString().slice(0, 10);
  const receivedTodayCount = backlogs.filter(b => 
    b.status === 'Received' && 
    b.receivedDate && 
    new Date(b.receivedDate).toISOString().slice(0, 10) === todayStr
  ).length;

  const overdueCount = backlogs.filter(b => {
    const isReceived = b.status === 'Received';
    const isCancelled = b.status === 'Cancelled';
    const isPast = new Date(b.expectedDeliveryDate) < new Date(todayStr);
    return !isReceived && !isCancelled && isPast;
  }).length;

  // Render Status Badge
  const getStatusBadge = (status, expectedDate) => {
    const isOverdue = expectedDate && new Date(expectedDate) < new Date(todayStr) && status !== 'Received' && status !== 'Cancelled';
    
    if (isOverdue) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/40">
          <AlertTriangle className="w-3 h-3" /> Overdue
        </span>
      );
    }

    let classes = '';
    switch (status) {
      case 'Pending Order':
        classes = 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/40';
        break;
      case 'Ordered':
        classes = 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/40';
        break;
      case 'Partially Received':
        classes = 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/40';
        break;
      case 'Received':
        classes = 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40';
        break;
      case 'Cancelled':
        classes = 'bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700/60';
        break;
      default:
        classes = 'bg-slate-50 text-slate-600';
    }

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${classes}`}>
        {status}
      </span>
    );
  };

  // Render Priority Badge
  const getPriorityBadge = (priority) => {
    let classes = '';
    switch (priority) {
      case 'Urgent':
        classes = 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/40';
        break;
      case 'High':
        classes = 'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-900/40';
        break;
      case 'Medium':
        classes = 'bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-950/20 dark:text-yellow-400 dark:border-yellow-900/40';
        break;
      case 'Low':
        classes = 'bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700/60';
        break;
      default:
        classes = 'bg-slate-50 text-slate-600';
    }
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase ${classes}`}>
        {priority}
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in p-1">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2.5">
            <ClipboardList className="w-6 h-6 text-indigo-500" />
            Backlog Procurement Tracking
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track ordered parts from vendor dispatch to workshop stock receipt.
          </p>
        </div>

        {canCreate && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-4.5 py-2.5 bg-indigo-600 text-white font-extrabold text-xs rounded-xl shadow-md hover:bg-indigo-700 hover:scale-[1.02] transition-all"
          >
            <Plus className="w-4 h-4" />
            Create Backlog Request
          </button>
        )}
      </div>

      {/* Action Status Banners */}
      {error && (
        <div className="p-4 bg-rose-50 border-l-4 border-rose-500 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400 rounded-r-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 rounded-r-xl text-xs font-semibold flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Summary KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 print:hidden">
        <StatsCard 
          title="Total Backlog Parts" 
          value={totalBacklogParts || 0} 
          icon={Package} 
          description="Procurement backlog" 
        />
        <StatsCard 
          title="Pending Orders" 
          value={pendingCount || 0} 
          icon={Clock} 
          description="Awaiting dispatch" 
        />
        <StatsCard 
          title="Ordered" 
          value={orderedCount || 0} 
          icon={ArrowRightLeft} 
          description="Shipped / In-transit" 
        />
        <StatsCard 
          title="Partially Rcvd" 
          value={partiallyReceivedCount || 0} 
          icon={AlertTriangle} 
          description="Incomplete deliveries" 
        />
        <StatsCard 
          title="Received Today" 
          value={receivedTodayCount || 0} 
          icon={CheckCircle2} 
          description="Restocked today" 
        />
        <StatsCard 
          title="Overdue Deliveries" 
          value={overdueCount || 0} 
          icon={AlertCircle} 
          description="Past expected date"
          trend={overdueCount > 0 ? "Alert" : null}
          trendType={overdueCount > 0 ? "down" : "up"}
        />
      </div>

      {/* Filter and Search Panel */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 print:hidden">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Main search */}
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by vehicle, JC, part, vendor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors"
            >
              <Filter className="w-3.5 h-3.5" />
              Advanced Filters
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
            </button>
            
            <button
              onClick={fetchBacklogs}
              className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors"
            >
              Apply Search
            </button>

            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('');
                setPriorityFilter('');
                setVendorFilter('');
                setPartNumberFilter('');
                setJobCardFilter('');
                setVehicleFilter('');
                setOrderedFromDate('');
                setOrderedToDate('');
                setExpectedFromDate('');
                setExpectedToDate('');
                setTimeout(() => fetchBacklogs(), 50);
              }}
              className="px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 rounded-xl text-xs font-bold transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Detailed filters */}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 animate-slide-down">
            {/* Status */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold text-slate-700 dark:text-slate-350 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- All Statuses --</option>
                <option value="Pending Order">Pending Order</option>
                <option value="Ordered">Ordered</option>
                <option value="Partially Received">Partially Received</option>
                <option value="Received">Received</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold text-slate-700 dark:text-slate-350 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- All Priorities --</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>

            {/* Part Number */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Part Number</label>
              <input
                type="text"
                placeholder="e.g. SP-ENG-OIL"
                value={partNumberFilter}
                onChange={(e) => setPartNumberFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold text-slate-700 dark:text-slate-350 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Job Card */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Job Card No</label>
              <input
                type="text"
                placeholder="e.g. JC-202607-0005"
                value={jobCardFilter}
                onChange={(e) => setJobCardFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold text-slate-700 dark:text-slate-350 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Vehicle No */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Vehicle No</label>
              <input
                type="text"
                placeholder="e.g. AP09XX9999"
                value={vehicleFilter}
                onChange={(e) => setVehicleFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold text-slate-700 dark:text-slate-350 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Vendor Name */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Vendor Name</label>
              <input
                type="text"
                placeholder="e.g. Bosch Distributor"
                value={vendorFilter}
                onChange={(e) => setVendorFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold text-slate-700 dark:text-slate-350 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Ordered Date Range */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ordered Date Range</label>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={orderedFromDate}
                  onChange={(e) => setOrderedFromDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-1.5 text-xs text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-slate-400 text-xs">to</span>
                <input
                  type="date"
                  value={orderedToDate}
                  onChange={(e) => setOrderedToDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-1.5 text-xs text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Expected Delivery Date Range */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Expected Delivery Date Range</label>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={expectedFromDate}
                  onChange={(e) => setExpectedFromDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-1.5 text-xs text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-slate-400 text-xs">to</span>
                <input
                  type="date"
                  value={expectedToDate}
                  onChange={(e) => setExpectedToDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-1.5 text-xs text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Backlogs List Datatable */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                <th className="p-3 w-28">Backlog ID</th>
                <th className="p-3">Vehicle Details</th>
                <th className="p-3">Job Card No</th>
                <th className="p-3">Part Details</th>
                <th className="p-3">Vendor Name</th>
                <th className="p-3 text-center">Qty</th>
                <th className="p-3">Ordered Date</th>
                <th className="p-3">Expected Date</th>
                <th className="p-3">Received Date</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Priority</th>
                <th className="p-3 text-center w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="12" className="p-8 text-center text-slate-400">
                    <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    Loading backlog tracking data...
                  </td>
                </tr>
              ) : backlogs.length === 0 ? (
                <tr>
                  <td colSpan="12" className="p-8 text-center text-slate-400 font-semibold">
                    No parts procurement backlogs found.
                  </td>
                </tr>
              ) : (
                backlogs.map(b => {
                  const isOverdue = new Date(b.expectedDeliveryDate) < new Date(todayStr) && b.status !== 'Received' && b.status !== 'Cancelled';
                  const rowClass = isOverdue 
                    ? 'bg-rose-50/30 hover:bg-rose-50/60 dark:bg-rose-950/5 dark:hover:bg-rose-950/10 border-l-2 border-l-rose-500' 
                    : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30';
                  
                  return (
                    <tr key={b._id} className={`transition-colors ${rowClass}`}>
                      {/* Backlog ID */}
                      <td className="p-3 font-bold text-slate-900 dark:text-white font-mono">
                        {b.backlogId}
                      </td>

                      {/* Vehicle */}
                      <td className="p-3">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{b.vehicleNo}</div>
                        {b.vehicleModel && (
                          <div className="text-[10px] text-slate-400 font-medium mt-0.5">{b.vehicleModel}</div>
                        )}
                        {b.customerName && (
                          <div className="text-[10px] text-indigo-500 font-bold uppercase mt-0.5">Cust: {b.customerName}</div>
                        )}
                      </td>

                      {/* Job Card No */}
                      <td className="p-3 font-semibold text-slate-700 dark:text-slate-350 font-mono">
                        {b.jobCardNo || '—'}
                      </td>

                      {/* Part info */}
                      <td className="p-3">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{b.partName}</div>
                        <div className="text-[10px] text-slate-400 font-medium font-mono mt-0.5">PN: {b.partNumber}</div>
                        {b.brand && (
                          <div className="text-[10px] text-slate-400 font-medium">Brand: {b.brand}</div>
                        )}
                      </td>

                      {/* Vendor */}
                      <td className="p-3">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{b.vendorName}</div>
                        {b.poNumber && (
                          <div className="text-[10px] text-slate-400 font-medium mt-0.5">PO: {b.poNumber}</div>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="p-3 text-center font-black text-slate-800 dark:text-slate-250">
                        {b.qty}
                      </td>

                      {/* Ordered Date */}
                      <td className="p-3 text-slate-650 dark:text-slate-350 font-mono">
                        {new Date(b.orderedDate).toLocaleDateString('en-IN')}
                      </td>

                      {/* Expected Date */}
                      <td className="p-3 font-semibold font-mono">
                        <span className={isOverdue ? 'text-rose-600 dark:text-rose-450 font-black' : 'text-slate-750 dark:text-slate-300'}>
                          {new Date(b.expectedDeliveryDate).toLocaleDateString('en-IN')}
                        </span>
                      </td>

                      {/* Received Date */}
                      <td className="p-3 text-slate-500 font-mono">
                        {b.receivedDate ? new Date(b.receivedDate).toLocaleDateString('en-IN') : '—'}
                      </td>

                      {/* Status */}
                      <td className="p-3 text-center">
                        {getStatusBadge(b.status, b.expectedDeliveryDate)}
                      </td>

                      {/* Priority */}
                      <td className="p-3 text-center">
                        {getPriorityBadge(b.priority)}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openViewModal(b)}
                            className="p-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="View request details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {canEdit && b.status !== 'Received' && (
                            <button
                              onClick={() => openEditModal(b)}
                              className="p-1 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors"
                              title="Edit request details"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canReceive && b.status !== 'Received' && b.status !== 'Cancelled' && (
                            <button
                              onClick={() => handleMarkReceived(b)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors"
                              title="Mark parts as Received"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canDelete && (
                            <button
                              onClick={() => handleDelete(b._id, b.backlogId)}
                              className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                              title="Delete backlog entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================== */}
      {/* MODAL 1: ADD BACKLOG REQUEST                                */}
      {/* ========================================================== */}
      {showAddModal && createPortal(
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex justify-center items-center p-3 sm:p-6 z-[99999] select-none overflow-hidden animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}
        >
          <form 
            onSubmit={handleAddSubmit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[90vw] max-w-[1200px] h-[85vh] max-h-[85vh] shadow-2xl flex flex-col relative overflow-hidden my-auto animate-scale-in"
          >
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-indigo-500" />
                Create Procurement Backlog Request
              </h2>
              <button type="button" onClick={() => setShowAddModal(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-650 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              
              {/* Job Card Selection autocomplete */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">
                    Link Job Card (Auto-fills Vehicle/Customer)
                  </label>
                  <select
                    value={formData.jobCardNo}
                    onChange={(e) => handleJobCardSelectChange(e.target.value)}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold text-slate-850 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Manual Entry / No Job Card --</option>
                    {jobCards.map(j => (
                      <option key={j._id} value={j.jobCardNo}>
                        {j.jobCardNo} ({j.vehicleId?.regNo || j.vehicleNo})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">
                    Select Part Master (Auto-fills Part Details)
                  </label>
                  <select
                    onChange={(e) => handlePartSelectChange(e.target.value)}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold text-slate-850 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Type Custom / New Part --</option>
                    {inventoryList.map(p => (
                      <option key={p._id} value={p._id}>
                        {p.partName} ({p.partNumber})
                      </option>
                    ))}
                  </select>
                </div>

                {estimateParts.length > 0 && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-1.5">
                      Select Part from Estimate (Auto-fills Part Details & Qty)
                    </label>
                    <select
                      onChange={(e) => handleEstimatePartSelectChange(e.target.value)}
                      className="w-full text-xs bg-indigo-50 dark:bg-slate-800 border border-indigo-200 dark:border-slate-700 rounded-lg p-2 font-semibold text-indigo-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Select a Part --</option>
                      {estimateParts.map((p, idx) => (
                        <option key={idx} value={idx}>
                          {p.name} ({p.partNo || 'No Part No'}) - Qty: {p.qty}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>              {/* Vehicle Info */}
              <div>
                <h3 className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest border-b border-indigo-100 dark:border-indigo-950 pb-1 mb-3">Vehicle Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Vehicle Registration No *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. AP09XX9999"
                      value={formData.vehicleNo}
                      onChange={(e) => setFormData({ ...formData, vehicleNo: e.target.value.toUpperCase() })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Vehicle Model *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Swift Dzire"
                      value={formData.vehicleModel}
                      onChange={(e) => setFormData({ ...formData, vehicleModel: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Customer Name (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Suresh Kumar"
                      value={formData.customerName}
                      onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Part Info */}
              <div>
                <h3 className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest border-b border-indigo-100 dark:border-indigo-950 pb-1 mb-3">Part Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Part Name / Description *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Front Shock Absorber"
                      value={formData.partName}
                      onChange={(e) => setFormData({ ...formData, partName: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Part Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. SA-8899"
                      value={formData.partNumber}
                      onChange={(e) => setFormData({ ...formData, partNumber: e.target.value.toUpperCase() })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-bold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">OEM / Brand</label>
                    <input
                      type="text"
                      placeholder="e.g. Monroe"
                      value={formData.brand}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Vendor & procurement Details */}
              <div>
                <h3 className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest border-b border-indigo-100 dark:border-indigo-950 pb-1 mb-3">Vendor & Purchase Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Vendor Name *</label>
                    <select
                      required
                      value={formData.vendorName}
                      onChange={(e) => {
                        const vName = e.target.value;
                        const matchedVendor = vendorList.find(v => v.name === vName);
                        setFormData({
                          ...formData,
                          vendorName: vName,
                          vendorContact: matchedVendor?.mobile || formData.vendorContact || ''
                        });
                      }}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
                    >
                      <option value="">-- Select Vendor --</option>
                      {vendorList.map(v => (
                        <option key={v._id} value={v.name}>
                          {v.name} {v.city ? `(${v.city})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Vendor Contact (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 9848022338"
                      value={formData.vendorContact}
                      onChange={(e) => setFormData({ ...formData, vendorContact: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">PO / Invoice Number</label>
                    <input
                      type="text"
                      placeholder="e.g. PO-998822"
                      value={formData.poNumber}
                      onChange={(e) => setFormData({ ...formData, poNumber: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Quantities & Dates */}
              <div>
                <h3 className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest border-b border-indigo-100 dark:border-indigo-950 pb-1 mb-3">Quantity, Schedule & Priority</h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Qty Required *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.qty}
                      onChange={(e) => setFormData({ ...formData, qty: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-bold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Ordered Date</label>
                    <input
                      type="date"
                      value={formData.orderedDate}
                      onChange={(e) => setFormData({ ...formData, orderedDate: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Expected Delivery *</label>
                    <input
                      type="date"
                      required
                      value={formData.expectedDeliveryDate}
                      onChange={(e) => setFormData({ ...formData, expectedDeliveryDate: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Priority</label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Remarks / Procurement Notes</label>
                <textarea
                  placeholder="Notes for vendor, tracking reference, or workshop requirements..."
                  rows="3"
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                />
              </div>

            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-md hover:bg-indigo-750 disabled:bg-indigo-400 transition-all flex items-center gap-1.5"
              >
                {actionLoading && <Clock className="w-3.5 h-3.5 animate-spin" />}
                Save Backlog Request
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* ========================================================== */}
      {/* MODAL 2: EDIT BACKLOG REQUEST                               */}
      {/* ========================================================== */}
      {showEditModal && selectedBacklog && createPortal(
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex justify-center items-center p-3 sm:p-6 z-[99999] select-none overflow-hidden animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setShowEditModal(false); }}
        >
          <form 
            onSubmit={handleEditSubmit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[90vw] max-w-[1200px] h-[85vh] max-h-[85vh] shadow-2xl flex flex-col relative overflow-hidden my-auto animate-scale-in"
          >
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-500" />
                Edit Backlog Request Details ({formData.status})
              </h2>
              <button type="button" onClick={() => setShowEditModal(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-650 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              
              {/* Status and Priority Block */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">
                    Backlog Status *
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-bold text-slate-850 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Pending Order">Pending Order</option>
                    <option value="Ordered">Ordered</option>
                    <option value="Partially Received">Partially Received</option>
                    <option value="Received">Received</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-bold text-slate-850 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Vehicle Info */}
              <div>
                <h3 className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest border-b border-indigo-100 dark:border-indigo-950 pb-1 mb-3">Vehicle Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Vehicle Registration No *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. AP09XX9999"
                      value={formData.vehicleNo}
                      onChange={(e) => setFormData({ ...formData, vehicleNo: e.target.value.toUpperCase() })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Vehicle Model *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Swift Dzire"
                      value={formData.vehicleModel}
                      onChange={(e) => setFormData({ ...formData, vehicleModel: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Customer Name (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Suresh Kumar"
                      value={formData.customerName}
                      onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Part Info */}
              <div>
                <h3 className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest border-b border-indigo-100 dark:border-indigo-950 pb-1 mb-3">Part Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Part Name / Description *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Front Shock Absorber"
                      value={formData.partName}
                      onChange={(e) => setFormData({ ...formData, partName: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Part Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. SA-8899"
                      value={formData.partNumber}
                      onChange={(e) => setFormData({ ...formData, partNumber: e.target.value.toUpperCase() })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-bold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">OEM / Brand</label>
                    <input
                      type="text"
                      placeholder="e.g. Monroe"
                      value={formData.brand}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Vendor & procurement Details */}
              <div>
                <h3 className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest border-b border-indigo-100 dark:border-indigo-950 pb-1 mb-3">Vendor & Purchase Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Vendor Name *</label>
                    <select
                      required
                      value={formData.vendorName}
                      onChange={(e) => {
                        const vName = e.target.value;
                        const matchedVendor = vendorList.find(v => v.name === vName);
                        setFormData({
                          ...formData,
                          vendorName: vName,
                          vendorContact: matchedVendor?.mobile || formData.vendorContact || ''
                        });
                      }}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
                    >
                      <option value="">-- Select Vendor --</option>
                      {vendorList.map(v => (
                        <option key={v._id} value={v.name}>
                          {v.name} {v.city ? `(${v.city})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Vendor Contact (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 9848022338"
                      value={formData.vendorContact}
                      onChange={(e) => setFormData({ ...formData, vendorContact: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">PO / Invoice Number</label>
                    <input
                      type="text"
                      placeholder="e.g. PO-998822"
                      value={formData.poNumber}
                      onChange={(e) => setFormData({ ...formData, poNumber: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Quantities & Dates */}
              <div>
                <h3 className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest border-b border-indigo-100 dark:border-indigo-950 pb-1 mb-3">Quantity, Schedule & Priority</h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Qty Required *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.qty}
                      onChange={(e) => setFormData({ ...formData, qty: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-bold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Ordered Date</label>
                    <input
                      type="date"
                      value={formData.orderedDate}
                      onChange={(e) => setFormData({ ...formData, orderedDate: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Expected Delivery *</label>
                    <input
                      type="date"
                      required
                      value={formData.expectedDeliveryDate}
                      onChange={(e) => setFormData({ ...formData, expectedDeliveryDate: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Job Card Link</label>
                    <input
                      type="text"
                      disabled
                      value={formData.jobCardNo || 'Not Linked'}
                      className="w-full text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500 cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Remarks / Procurement Notes</label>
                <textarea
                  placeholder="Notes for vendor, tracking reference, or workshop requirements..."
                  rows="3"
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full text-xs bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                />
              </div>

            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-md hover:bg-indigo-750 disabled:bg-indigo-400 transition-all flex items-center gap-1.5"
              >
                {actionLoading && <Clock className="w-3.5 h-3.5 animate-spin" />}
                Save Changes
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* ========================================================== */}
      {/* MODAL 3: VIEW BACKLOG REQUEST DETAILS                      */}
      {/* ========================================================== */}
      {showViewModal && selectedBacklog && createPortal(
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex justify-center items-center p-3 sm:p-6 z-[99999] select-none overflow-hidden animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setShowViewModal(false); }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[90vw] max-w-[1000px] h-[85vh] max-h-[85vh] shadow-2xl flex flex-col relative overflow-hidden my-auto animate-scale-in">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">PROCUREMENT BACKLOG VOUCHER</span>
                <h2 className="text-sm font-black text-slate-800 dark:text-white font-mono mt-0.5">{selectedBacklog.backlogId}</h2>
              </div>
              <button onClick={() => setShowViewModal(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-650 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4.5 text-xs">
              
              {/* Status and dates block */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">STATUS</span>
                  {getStatusBadge(selectedBacklog.status, selectedBacklog.expectedDeliveryDate)}
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">PRIORITY</span>
                  {getPriorityBadge(selectedBacklog.priority)}
                </div>
              </div>

              {/* Grid 1: Vehicle details */}
              <div className="space-y-2">
                <span className="text-[10px] font-extrabold uppercase text-indigo-600 dark:text-indigo-400 tracking-wider block border-b pb-1">Vehicle Information</span>
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <span className="text-slate-400 block font-medium">Registration Number:</span>
                    <span className="font-bold text-slate-850 dark:text-white flex items-center gap-1.5 mt-0.5"><Car className="w-4 h-4 text-slate-400" /> {selectedBacklog.vehicleNo}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Model Compatibility:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block mt-0.5">{selectedBacklog.vehicleModel}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Customer Name:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block mt-0.5">{selectedBacklog.customerName || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Linked Job Card No:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono block mt-0.5">{selectedBacklog.jobCardNo || 'None'}</span>
                  </div>
                </div>
              </div>

              {/* Grid 2: Part details */}
              <div className="space-y-2">
                <span className="text-[10px] font-extrabold uppercase text-indigo-600 dark:text-indigo-400 tracking-wider block border-b pb-1">Part Description</span>
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <span className="text-slate-400 block font-medium">Part Name:</span>
                    <span className="font-bold text-slate-850 dark:text-white block mt-0.5">{selectedBacklog.partName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Part Number:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono block mt-0.5">{selectedBacklog.partNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Brand / OEM:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block mt-0.5">{selectedBacklog.brand || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Quantity Required:</span>
                    <span className="font-black text-slate-900 dark:text-white text-sm block mt-0.5">{selectedBacklog.qty} pcs</span>
                  </div>
                </div>
              </div>

              {/* Grid 3: Vendor details */}
              <div className="space-y-2">
                <span className="text-[10px] font-extrabold uppercase text-indigo-600 dark:text-indigo-400 tracking-wider block border-b pb-1">Vendor & Delivery</span>
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <span className="text-slate-400 block font-medium">Vendor Name:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block mt-0.5">{selectedBacklog.vendorName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Vendor Contact:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mt-0.5"><Phone className="w-3.5 h-3.5 text-slate-400" /> {selectedBacklog.vendorContact || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">PO Number:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono block mt-0.5">{selectedBacklog.poNumber || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Expected Arrival:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block mt-0.5 font-mono"><Calendar className="w-3.5 h-3.5 text-slate-400 inline mr-1" />{new Date(selectedBacklog.expectedDeliveryDate).toLocaleDateString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* System Audit Details */}
              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Created By:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{selectedBacklog.createdBy}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Created On:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{new Date(selectedBacklog.createdAt).toLocaleString('en-IN')}</span>
                </div>
                {selectedBacklog.serviceAdvisorName && (
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Service Advisor:</span>
                    <span className="font-bold text-indigo-500">{selectedBacklog.serviceAdvisorName}</span>
                  </div>
                )}
                {selectedBacklog.receivedDate && (
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Received On:</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-450 font-bold">{new Date(selectedBacklog.receivedDate).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {selectedBacklog.lastUpdatedBy && (
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Last Updated By:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{selectedBacklog.lastUpdatedBy}</span>
                  </div>
                )}
              </div>

              {/* Remarks */}
              {selectedBacklog.remarks && (
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-indigo-600 dark:text-indigo-400 tracking-wider block border-b pb-1 mb-1.5">Remarks / Remarks</span>
                  <p className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-350">{selectedBacklog.remarks}</p>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="flex justify-end p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setShowViewModal(false)}
                className="px-5 py-2.5 bg-slate-950 text-white rounded-xl text-xs font-black shadow-md hover:bg-slate-800 transition-colors"
              >
                Close Voucher
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
