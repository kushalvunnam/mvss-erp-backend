import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { Search, ChevronDown, ChevronUp, Calendar, Hash, Milestone, Shield, DollarSign, User, AlertCircle, Wrench, CheckCircle } from 'lucide-react';

export default function ServiceHistory({ token }) {
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedRows, setExpandedRows] = useState({});

  const fetchServiceHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/jobcards/service-history?search=${encodeURIComponent(search)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to fetch service history.');
      }
    } catch (err) {
      console.error(err);
      setError('Connection failure while loading service history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchServiceHistory();
    }, 400); // Debounce search
    return () => clearTimeout(handler);
  }, [search]);

  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-wider">
            General Service History
          </h1>
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mt-1">
            Search complete vehicle service and invoice records
          </p>
        </div>
      </div>

      {/* Search Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Registration Number, Customer Name, Mobile Number, or Chassis Number..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 placeholder-slate-400 text-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-955/20 border border-rose-200 dark:border-rose-900/40 p-3.5 rounded-xl text-rose-700 dark:text-rose-400 text-xs font-bold animate-fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Results Content */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">
            Searching service records...
          </div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
            {search ? 'No matching service records found.' : 'Enter a search term to view vehicle history.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="p-4 w-8"></th>
                  <th className="p-4">Visit Date</th>
                  <th className="p-4">Job Card No</th>
                  <th className="p-4">Vehicle Details</th>
                  <th className="p-4">Customer Details</th>
                  <th className="p-4">Odometer</th>
                  <th className="p-4">Technician</th>
                  <th className="p-4">Invoice Amount</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {history.map((record) => {
                  const isExpanded = !!expandedRows[record._id];
                  return (
                    <React.Fragment key={record._id}>
                      <tr 
                        onClick={() => toggleRow(record._id)}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 cursor-pointer transition-colors"
                      >
                        <td className="p-4 text-center">
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </td>
                        <td className="p-4 font-semibold text-slate-650 dark:text-slate-350">
                          {new Date(record.visitDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="p-4 font-bold text-indigo-650 dark:text-indigo-400 font-mono tracking-wider">
                          {record.jobCardNo}
                        </td>
                        <td className="p-4">
                          <div className="font-extrabold text-slate-800 dark:text-white font-mono tracking-wide">{record.vehicleNumber}</div>
                          <div className="text-[10px] text-slate-450 dark:text-slate-400 font-semibold">{record.model}</div>
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-slate-850 dark:text-slate-200">{record.customerName}</div>
                          <div className="text-[10px] text-slate-450 dark:text-slate-400 font-mono">{record.customerMobile}</div>
                        </td>
                        <td className="p-4 font-bold text-slate-700 dark:text-slate-300 font-mono">
                          {record.odometer.toLocaleString()} km
                        </td>
                        <td className="p-4 font-semibold text-slate-755 dark:text-slate-300">
                          {record.technician}
                        </td>
                        <td className="p-4 font-extrabold text-slate-850 dark:text-white font-mono">
                          ₹{record.invoiceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            record.status === 'Delivered'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/40'
                          }`}>
                            {record.status}
                          </span>
                        </td>
                      </tr>
                      {/* Expanded Section */}
                      {isExpanded && (
                        <tr className="bg-slate-50/30 dark:bg-slate-800/10">
                          <td colSpan="9" className="p-5 border-t border-slate-100 dark:border-slate-800">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Services Performed */}
                              <div className="space-y-2">
                                <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                  <Wrench className="w-3.5 h-3.5" /> Services & Labour Performed
                                </h4>
                                {record.servicesPerformed && record.servicesPerformed.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5 pt-1">
                                    {record.servicesPerformed.map((serv, idx) => (
                                      <span 
                                        key={idx}
                                        className="px-2.5 py-1 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold text-slate-700 dark:text-slate-350 shadow-xs"
                                      >
                                        {serv}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs italic text-slate-400">No specific services logged.</p>
                                )}
                              </div>

                              {/* Parts Replaced */}
                              <div className="space-y-2">
                                <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                  <CheckCircle className="w-3.5 h-3.5" /> Parts Replaced
                                </h4>
                                {record.partsReplaced && record.partsReplaced.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5 pt-1">
                                    {record.partsReplaced.map((part, idx) => (
                                      <span 
                                        key={idx}
                                        className="px-2.5 py-1 bg-indigo-50/40 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30 rounded-lg text-[10px] font-bold shadow-xs"
                                      >
                                        {part}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs italic text-slate-400">No parts replacements recorded in estimate/invoice.</p>
                                )}
                              </div>
                            </div>

                            {/* Additional metadata info footer */}
                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex flex-wrap gap-4 font-mono">
                              <div>Chassis: {record.chassisNumber || 'N/A'}</div>
                              <div>Model: {record.model || 'N/A'}</div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
