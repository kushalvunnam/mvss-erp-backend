import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../config';
import { 
  Wallet, 
  Search, 
  Calendar, 
  FileSpreadsheet, 
  Printer, 
  ArrowUpDown, 
  IndianRupee, 
  Clock, 
  TrendingUp, 
  CreditCard, 
  CheckCircle, 
  AlertTriangle, 
  RotateCcw, 
  Plus, 
  X, 
  Eye, 
  Edit3, 
  Trash2, 
  Tag, 
  User, 
  FileText, 
  Receipt 
} from 'lucide-react';

const EXPENSE_CATEGORIES = [
  'Tea & Coffee',
  'Breakfast',
  'Lunch',
  'Dinner',
  'Drinking Water',
  'Office Supplies',
  'Stationery',
  'Fuel',
  'Transport',
  'Courier',
  'Cleaning Materials',
  'Electricity',
  'Internet',
  'Staff Welfare',
  'Vehicle Maintenance',
  'Repairs',
  'Miscellaneous',
  'Other'
];

const PAYMENT_MODES = ['Cash', 'Online', 'UPI', 'Bank Transfer', 'Card'];

export default function Expenses({ token, user }) {
  // Filter states
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expenseTypeFilter, setExpenseTypeFilter] = useState('');
  const [paymentModeFilter, setPaymentModeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Data states
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({
    todayExpense: 0,
    weekExpense: 0,
    monthExpense: 0,
    totalExpenses: 0,
    pendingPayments: 0,
    pendingCount: 0,
    totalCashExpense: 0,
    totalOnlineExpense: 0,
    grandTotalExpense: 0,
    count: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sorting state
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [viewingExpense, setViewingExpense] = useState(null);
  const [deletingExpense, setDeletingExpense] = useState(null);

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Form Fields
  const [formData, setFormData] = useState({
    date: new Date().toISOString().slice(0, 10),
    expenseType: '',
    description: '',
    amount: '',
    paymentMode: 'Cash',
    paidTo: '',
    referenceNo: '',
    remarks: '',
    status: 'Paid'
  });

  // Load initial dataset on mount
  // Close modals on Esc keypress
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
        setViewingExpense(null);
        setDeletingExpense(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [token]);

  const fetchExpenses = async () => {
    setLoading(true);
    setError('');
    try {
      const queryParams = new URLSearchParams();
      if (fromDate) queryParams.append('fromDate', fromDate);
      if (toDate) queryParams.append('toDate', toDate);
      if (expenseTypeFilter) queryParams.append('expenseType', expenseTypeFilter);
      if (paymentModeFilter) queryParams.append('paymentMode', paymentModeFilter);
      if (statusFilter) queryParams.append('status', statusFilter);
      if (searchQuery) queryParams.append('search', searchQuery);

      const res = await fetch(`${API_BASE_URL}/expenses?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.expenses) ? data.expenses : (Array.isArray(data.data) ? data.data : []);
        setExpenses(list);
        if (data.summary) {
          setSummary(data.summary);
        }
      } else {
        const errObj = await res.json().catch(() => ({}));
        setError(errObj.error || 'Failed to fetch expenses data.');
        setExpenses([]);
      }
    } catch (err) {
      console.error('Failed to fetch expenses:', err);
      setError('Failed to connect to server.');
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setExpenseTypeFilter('');
    setPaymentModeFilter('');
    setStatusFilter('');
    setSearchQuery('');
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Open Add Modal
  const handleOpenAddModal = () => {
    setEditingExpense(null);
    setFormData({
      date: new Date().toISOString().slice(0, 10),
      expenseType: '',
      description: '',
      amount: '',
      paymentMode: 'Cash',
      paidTo: '',
      referenceNo: '',
      remarks: '',
      status: 'Paid'
    });
    setFormError('');
    setFormSuccess('');
    setShowAddModal(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (expense) => {
    setEditingExpense(expense);
    setFormData({
      date: expense.date ? new Date(expense.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      expenseType: expense.expenseType || '',
      description: expense.description || '',
      amount: expense.amount ? expense.amount.toString() : '',
      paymentMode: expense.paymentMode || 'Cash',
      paidTo: expense.paidTo || '',
      referenceNo: expense.referenceNo || '',
      remarks: expense.remarks || '',
      status: expense.status || 'Paid'
    });
    setFormError('');
    setFormSuccess('');
    setShowAddModal(true);
  };

  // Submit Add / Edit Form
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!formData.date) {
      setFormError('Date is mandatory.');
      return;
    }
    if (!formData.expenseType) {
      setFormError('Expense Type is mandatory.');
      return;
    }
    if (!formData.description || !formData.description.trim()) {
      setFormError('Description is mandatory.');
      return;
    }
    const amt = Number(formData.amount);
    if (isNaN(amt) || amt <= 0) {
      setFormError('Amount must be greater than zero.');
      return;
    }
    if (!formData.paymentMode) {
      setFormError('Payment Mode is mandatory.');
      return;
    }

    setFormSubmitting(true);

    try {
      const url = editingExpense 
        ? `${API_BASE_URL}/expenses/${editingExpense._id}`
        : `${API_BASE_URL}/expenses`;

      const method = editingExpense ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setFormSuccess(editingExpense ? 'Expense updated successfully!' : 'Expense saved successfully!');
        setTimeout(() => {
          setShowAddModal(false);
          setFormSuccess('');
          fetchExpenses();
        }, 1000);
      } else {
        const errObj = await res.json();
        setFormError(errObj.error || 'Failed to save expense record.');
      }
    } catch (err) {
      console.error(err);
      setFormError('Network error while saving expense.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Delete Expense
  const handleDeleteConfirm = async () => {
    if (!deletingExpense) return;
    try {
      const res = await fetch(`${API_BASE_URL}/expenses/${deletingExpense._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        setDeletingExpense(null);
        fetchExpenses();
      } else {
        const errObj = await res.json();
        alert(errObj.error || 'Failed to delete expense.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while deleting expense.');
    }
  };

  // Client-side filtering and sorting for datatable
  const safeExpenses = Array.isArray(expenses) ? expenses : [];

  const filteredAndSortedExpenses = safeExpenses
    .filter(item => {
      if (!searchQuery) return true;
      const s = searchQuery.toLowerCase();
      return (
        (item.expenseId && item.expenseId.toLowerCase().includes(s)) ||
        (item.expenseType && item.expenseType.toLowerCase().includes(s)) ||
        (item.description && item.description.toLowerCase().includes(s)) ||
        (item.paidTo && item.paidTo.toLowerCase().includes(s)) ||
        (item.referenceNo && item.referenceNo.toLowerCase().includes(s)) ||
        (item.enteredBy && item.enteredBy.toLowerCase().includes(s))
      );
    })
    .sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (sortField === 'date') {
        aVal = new Date(aVal || 0).getTime();
        bVal = new Date(bVal || 0).getTime();
      } else if (sortField === 'amount') {
        aVal = Number(aVal || 0);
        bVal = Number(bVal || 0);
      } else if (typeof aVal === 'string') {
        aVal = (aVal || '').toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  // Calculate filtered totals
  const totalFilteredCash = filteredAndSortedExpenses.filter(e => e.paymentMode === 'Cash').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalFilteredOnline = filteredAndSortedExpenses.filter(e => e.paymentMode !== 'Cash').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalFilteredGrand = filteredAndSortedExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  // Export to Excel / CSV
  const handleExportExcel = () => {
    const headers = [
      'Expense ID',
      'Date',
      'Expense Type',
      'Description',
      'Amount (INR)',
      'Payment Mode',
      'Paid To / Vendor',
      'Reference No / UPI ID',
      'Remarks',
      'Entered By',
      'Status'
    ];

    const rows = filteredAndSortedExpenses.map(item => [
      `"${item.expenseId || ''}"`,
      `"${new Date(item.date || Date.now()).toLocaleDateString('en-IN')}"`,
      `"${(item.expenseType || '').replace(/"/g, '""')}"`,
      `"${(item.description || '').replace(/"/g, '""')}"`,
      (item.amount || 0).toFixed(2),
      `"${item.paymentMode || 'Cash'}"`,
      `"${(item.paidTo || '').replace(/"/g, '""')}"`,
      `"${item.referenceNo || ''}"`,
      `"${(item.remarks || '').replace(/"/g, '""')}"`,
      `"${(item.enteredBy || '').replace(/"/g, '""')}"`,
      `"${item.status || 'Paid'}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Miscellaneous_Expenses_Report_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fade-in p-1 print:p-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Wallet className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            Miscellaneous Expenses
          </h1>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Record and report workshop daily operational expenses (tea/coffee, meals, stationery, fuel, transport, utilities, maintenance, etc.)
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Expense
          </button>

          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 cursor-pointer"
            title="Export expenses to Excel / CSV"
          >
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </button>

          <button
            onClick={handlePrint}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="Print or Save as PDF"
          >
            <Printer className="w-4 h-4" /> Print / PDF
          </button>
        </div>
      </div>

      {/* Dashboard Summary Cards (5 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Today's Expense */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-500/20 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">Today's Expense</span>
            <div className="text-lg font-black text-slate-900 dark:text-white font-mono mt-0.5">
              ₹{(summary.todayExpense || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* This Week Expense */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-500/20 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">This Week Expense</span>
            <div className="text-lg font-black text-slate-900 dark:text-white font-mono mt-0.5">
              ₹{(summary.weekExpense || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* This Month Expense */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-2xl border border-purple-500/20 shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">This Month Expense</span>
            <div className="text-lg font-black text-slate-900 dark:text-white font-mono mt-0.5">
              ₹{(summary.monthExpense || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Total Expenses */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-500/20 shrink-0">
            <IndianRupee className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">Total Expenses</span>
            <div className="text-lg font-black text-slate-900 dark:text-white font-mono mt-0.5">
              ₹{(summary.totalExpenses || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Pending Payments */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-500/20 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">Pending Payments</span>
            <div className="text-lg font-black text-amber-600 dark:text-amber-400 font-mono mt-0.5">
              ₹{(summary.pendingPayments || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 print:hidden">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Filter Expenses
            </h3>
          </div>
          <button
            onClick={handleResetFilters}
            className="text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 text-xs font-semibold">
          {/* From Date */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 font-medium focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 font-medium focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Expense Type */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Expense Type</label>
            <select
              value={expenseTypeFilter}
              onChange={(e) => setExpenseTypeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 font-bold focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="">All Categories</option>
              {EXPENSE_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Payment Mode */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Payment Mode</label>
            <select
              value={paymentModeFilter}
              onChange={(e) => setPaymentModeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 font-bold focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="">All Payment Modes</option>
              {PAYMENT_MODES.map(mode => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 font-bold focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="Paid">Paid</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={fetchExpenses}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
          >
            Generate Report
          </button>
        </div>
      </div>

      {/* Report Summary Totals Bar */}
      <div className="p-4 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl flex flex-wrap items-center justify-between gap-4 text-xs font-mono font-semibold">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-[11px] font-black uppercase text-indigo-950 dark:text-indigo-200">Filtered Report Summary</span>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Cash Expense</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">₹{totalFilteredCash.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Online / Digital</span>
            <span className="font-bold text-purple-600 dark:text-purple-400">₹{totalFilteredOnline.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Grand Total Expense</span>
            <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">₹{totalFilteredGrand.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Main Datatable Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* In-table Search Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 print:hidden">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search expenses by ID, description, vendor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="text-xs text-slate-400 font-semibold">
            Showing <span className="font-bold text-slate-700 dark:text-slate-200">{filteredAndSortedExpenses.length}</span> records
          </div>
        </div>

        {/* Datatable */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-xs font-semibold">
              Loading miscellaneous expenses...
            </div>
          ) : error ? (
            <div className="p-8 text-center text-rose-500 font-semibold text-xs flex items-center justify-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          ) : Array.isArray(filteredAndSortedExpenses) && filteredAndSortedExpenses.length > 0 ? (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th 
                    onClick={() => handleSort('expenseId')} 
                    className="p-3.5 cursor-pointer hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Expense ID
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('date')} 
                    className="p-3.5 cursor-pointer hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Date
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('expenseType')} 
                    className="p-3.5 cursor-pointer hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Expense Type
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="p-3.5">Description</th>
                  <th 
                    onClick={() => handleSort('amount')} 
                    className="p-3.5 text-right cursor-pointer hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      Amount (₹)
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="p-3.5">Payment Mode</th>
                  <th className="p-3.5">Paid To / Vendor</th>
                  <th className="p-3.5">Entered By</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-center print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-semibold text-slate-700 dark:text-slate-300">
                {filteredAndSortedExpenses.map((item, idx) => (
                  <tr key={item._id || idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-indigo-650 dark:text-indigo-400">
                      {item.expenseId || 'EXP-0000'}
                    </td>
                    <td className="p-3.5 font-mono text-[11px]">
                      {new Date(item.date || Date.now()).toLocaleDateString('en-IN')}
                    </td>
                    <td className="p-3.5">
                      <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        {item.expenseType || 'General'}
                      </span>
                    </td>
                    <td className="p-3.5 max-w-xs">
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate">{item.description}</div>
                      {item.remarks && <div className="text-[10px] text-slate-400 truncate">{item.remarks}</div>}
                    </td>
                    <td className="p-3.5 text-right font-mono font-black text-slate-900 dark:text-white text-sm">
                      ₹{(Number(item.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-3.5 font-mono text-[11px]">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{item.paymentMode || 'Cash'}</span>
                      {item.referenceNo && <div className="text-[9px] text-slate-400 font-mono">Ref: {item.referenceNo}</div>}
                    </td>
                    <td className="p-3.5 font-bold text-slate-800 dark:text-white">
                      {item.paidTo || '—'}
                    </td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-400 text-[11px]">
                      {item.enteredBy || 'Staff'}
                    </td>
                    <td className="p-3.5">
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-black rounded-lg uppercase tracking-wider ${
                        item.status === 'Paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' :
                        'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                      }`}>
                        {item.status || 'Paid'}
                      </span>
                    </td>
                    <td className="p-3.5 text-center print:hidden">
                      <div className="flex items-center justify-center gap-1">
                        {/* View Button */}
                        <button
                          onClick={() => setViewingExpense(item)}
                          className="px-2 py-1 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-600 dark:text-blue-400 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" /> 👁 View
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="px-2 py-1 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-600 dark:text-amber-400 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                          title="Edit Expense"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> ✏️ Edit
                        </button>

                        {/* Delete Button */}
                        {['Admin', 'Accounts'].includes(user?.role) && (
                          <button
                            onClick={() => setDeletingExpense(item)}
                            className="px-2 py-1 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-600 dark:text-rose-400 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                            title="Delete Expense"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> 🗑 Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-slate-400 font-semibold text-xs">
              No expense records found.
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Expense Desktop-Optimized Modal */}
      {showAddModal && createPortal(
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex justify-center items-center p-3 sm:p-6 z-[99999] select-none overflow-hidden animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[90vw] max-w-[1100px] h-[85vh] max-h-[85vh] shadow-2xl flex flex-col relative overflow-hidden my-auto animate-scale-in">
            
            {/* Header (Fixed) */}
            <div className="flex-none p-4 px-6 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Wallet className="w-5 h-5 text-indigo-400" />
                <h3 className="font-black text-sm uppercase tracking-wider">
                  {editingExpense ? `Edit Expense (${editingExpense.expenseId})` : 'New Expense Entry'}
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Content */}
            <form id="expense-form" onSubmit={handleSubmitForm} className="flex-1 overflow-y-auto p-5 px-6 space-y-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
              {formError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/80 text-rose-600 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {formSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{formSuccess}</span>
                </div>
              )}

              {/* Row 1: Date, Expense Type, Payment Mode, Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Date *</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-medium focus:outline-none focus:border-indigo-500 text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Expense Type *</label>
                  <select
                    value={formData.expenseType}
                    onChange={(e) => setFormData(prev => ({ ...prev, expenseType: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold focus:outline-none focus:border-indigo-500 cursor-pointer text-xs"
                    required
                  >
                    <option value="">Select Expense Type</option>
                    {EXPENSE_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Payment Mode *</label>
                  <select
                    value={formData.paymentMode}
                    onChange={(e) => setFormData(prev => ({ ...prev, paymentMode: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold focus:outline-none focus:border-indigo-500 cursor-pointer text-xs"
                    required
                  >
                    {PAYMENT_MODES.map(mode => (
                      <option key={mode} value={mode}>{mode}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold focus:outline-none focus:border-indigo-500 cursor-pointer text-xs"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Description, Amount, Paid To */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
                <div className="lg:col-span-6">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Description *</label>
                  <input
                    type="text"
                    placeholder="e.g. Tea & Snacks for Workshop Staff"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-medium focus:outline-none focus:border-indigo-500 text-xs"
                    required
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono font-bold focus:outline-none focus:border-indigo-500 text-xs"
                    required
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Paid To / Vendor</label>
                  <input
                    type="text"
                    placeholder="e.g. Laxmi Tea Stall"
                    value={formData.paidTo}
                    onChange={(e) => setFormData(prev => ({ ...prev, paidTo: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-medium focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
              </div>

              {/* Row 3: Reference Number, Remarks */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Reference No / UPI Transaction ID (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. UPI/3940293402/GooglePay"
                    value={formData.referenceNo}
                    onChange={(e) => setFormData(prev => ({ ...prev, referenceNo: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Remarks (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Cash paid from petty cash drawer"
                    value={formData.remarks}
                    onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-medium focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
              </div>

              {/* Auto-filled Entered By Info */}
              <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-bold uppercase">Entered By:</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">{user?.name || user?.email || 'Staff User'}</span>
              </div>
            </form>

            {/* Action Footer (Fixed) */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex justify-end gap-3 shrink-0 rounded-b-3xl">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-slate-150 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-750 dark:text-slate-350 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="expense-form"
                disabled={formSubmitting}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
              >
                {formSubmitting ? 'Saving Expense...' : 'Save Expense'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* View Expense Detail Modal */}
      {viewingExpense && createPortal(
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex justify-center items-center p-3 sm:p-6 z-[99999] select-none overflow-hidden animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setViewingExpense(null); }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[90vw] max-w-[800px] h-[75vh] max-h-[75vh] shadow-2xl flex flex-col relative overflow-hidden my-auto animate-scale-in">
            <div className="p-5 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <Wallet className="w-5 h-5 text-indigo-400" />
                <h3 className="font-black text-sm uppercase tracking-wider">Expense Details ({viewingExpense.expenseId})</h3>
              </div>
              <button
                onClick={() => setViewingExpense(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Expense ID</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm">{viewingExpense.expenseId}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Date</span>
                  <span className="font-mono">{new Date(viewingExpense.date).toLocaleDateString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Expense Type</span>
                  <span className="font-bold text-slate-900 dark:text-white">{viewingExpense.expenseType}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Amount</span>
                  <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-base">₹{(Number(viewingExpense.amount) || 0).toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Payment Mode</span>
                  <span className="font-bold">{viewingExpense.paymentMode}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Status</span>
                  <span className={`inline-block px-2 py-0.5 text-[10px] font-black rounded uppercase ${viewingExpense.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {viewingExpense.status}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Description</span>
                  <span className="font-bold text-slate-900 dark:text-white text-sm">{viewingExpense.description}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Paid To / Vendor</span>
                  <span>{viewingExpense.paidTo || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Reference No / UPI ID</span>
                  <span className="font-mono">{viewingExpense.referenceNo || '—'}</span>
                </div>
                {viewingExpense.remarks && (
                  <div className="col-span-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Remarks</span>
                    <span>{viewingExpense.remarks}</span>
                  </div>
                )}
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Entered By</span>
                  <span>{viewingExpense.enteredBy || 'Staff'}</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex justify-end gap-3 shrink-0 rounded-b-3xl">
              <button
                onClick={() => setViewingExpense(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {deletingExpense && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex justify-center items-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-black text-sm uppercase tracking-wider">Confirm Delete Expense</h3>
            </div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Are you sure you want to delete expense <strong className="text-slate-900 dark:text-white font-mono">{deletingExpense.expenseId}</strong> ({deletingExpense.description} — ₹{deletingExpense.amount})? This action cannot be undone.
            </p>
            <div className="flex justify-end items-center gap-3 pt-2">
              <button
                onClick={() => setDeletingExpense(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-600/20 cursor-pointer"
              >
                Delete Expense
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
