import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { History, ShieldCheck, Search, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AuditLogs({ token }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [userFilter, setUserFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (userFilter) params.append('userName', userFilter);
      if (roleFilter) params.append('role', roleFilter);
      if (moduleFilter) params.append('moduleName', moduleFilter);
      if (actionFilter) params.append('action', actionFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (search) params.append('search', search);
      params.append('page', page);
      params.append('limit', 20);

      const res = await fetch(`${API_BASE_URL}/dashboard/auditlogs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setLogs(data);
          setTotalPages(1);
          setTotalCount(data.length);
        } else {
          setLogs(data.logs || []);
          setTotalPages(data.totalPages || 1);
          setTotalCount(data.totalCount || 0);
        }
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setUserFilter('');
    setRoleFilter('');
    setModuleFilter('');
    setActionFilter('');
    setStartDate('');
    setEndDate('');
    setSearch('');
    setPage(1);
  };

  const handleDatePreset = (days) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    setEndDate(todayStr);

    if (days === 0) {
      setStartDate(todayStr);
    } else {
      const pastDate = new Date();
      pastDate.setDate(today.getDate() - days);
      setStartDate(pastDate.toISOString().split('T')[0]);
    }
  };

  const handleExportCSV = () => {
    if (!logs.length) return alert('No logs available to export.');
    const headers = ['Date & Time', 'User Name', 'Role', 'Module', 'Action', 'Details', 'IP Address'];
    const rows = logs.map(log => [
      `"${new Date(log.createdAt || log.timestamp).toLocaleString('en-IN')}"`,
      `"${log.userName}"`,
      `"${log.role || log.userRole}"`,
      `"${log.module || 'System'}"`,
      `"${log.action}"`,
      `"${(log.details || '').replace(/"/g, '""')}"`,
      `"${log.ipAddress || '127.0.0.1'}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `audit_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    if (!logs.length) return alert('No logs available to export.');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('Please allow popups to export PDF.');
    
    let tableRows = '';
    logs.forEach(log => {
      tableRows += `
        <tr>
          <td>${new Date(log.createdAt || log.timestamp).toLocaleString('en-IN')}</td>
          <td>${log.userName}</td>
          <td>${log.role || log.userRole}</td>
          <td>${log.module || 'System'}</td>
          <td>${log.action}</td>
          <td>${log.details}</td>
          <td>${log.ipAddress || '127.0.0.1'}</td>
        </tr>
      `;
    });

    printWindow.document.write(`
      <html>
        <head>
          <title>Security Audit Logs Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 10px; color: #333; padding: 20px; }
            h2 { text-transform: uppercase; font-size: 14px; margin-bottom: 2px; }
            p { font-size: 9px; color: #666; margin-top: 0; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #111111; padding: 6px 8px; text-align: left; }
            th { background-color: #f5f5f5; font-weight: bold; }
            @media print {
              tr { page-break-inside: avoid; }
              thead { display: table-header-group; }
            }
          </style>
        </head>
        <body>
          <h2>Security Audit Logs Report</h2>
          <p>Generated on ${new Date().toLocaleString('en-IN')} | Total Records: ${logs.length}</p>
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>User Name</th>
                <th>Role</th>
                <th>Module</th>
                <th>Action</th>
                <th>Details</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleResetDatabase = async () => {
    if (!window.confirm('WARNING: This will permanently delete all Customers, Vehicles, Job Cards, Estimates, Claims, and Bookings. Inventory and Billing settings will remain intact. Proceed?')) {
      return;
    }
    
    // Clear localStorage mock DB if in Demo Mode
    if (token === 'mock_jwt_token_for_offline_demo') {
      localStorage.setItem('mock_customers', JSON.stringify([]));
      localStorage.setItem('mock_vehicles', JSON.stringify([]));
      localStorage.setItem('mock_jobcards', JSON.stringify([]));
      localStorage.setItem('mock_estimates', JSON.stringify([]));
      localStorage.setItem('mock_invoices', JSON.stringify([]));
      localStorage.setItem('mock_claims', JSON.stringify([]));
      localStorage.setItem('mock_bookings', JSON.stringify([]));
      localStorage.setItem('mock_gatepasses', JSON.stringify([]));
      localStorage.setItem('mock_messages', JSON.stringify([]));
      localStorage.setItem('mock_notifications', JSON.stringify([]));
      const mockLogs = JSON.parse(localStorage.getItem('mock_auditlogs') || '[]');
      const filteredLogs = mockLogs.filter(l => ['USER_LOGIN', 'USER_LOGOUT'].includes(l.action));
      localStorage.setItem('mock_auditlogs', JSON.stringify(filteredLogs));
      window.dispatchEvent(new Event('storage'));
      alert('Local Demo Database reset completed successfully!');
      fetchLogs();
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/reset-database`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Database Reset Successful!\n\nDeleted records:\n- Customers: ${data.counts.customers}\n- Vehicles: ${data.counts.vehicles}\n- Job Cards: ${data.counts.jobCards}\n- Service Bookings: ${data.counts.bookings}\n- Estimates: ${data.counts.estimates}\n- Claims: ${data.counts.claims}\n- Logs: ${data.counts.logs}`);
        fetchLogs();
      } else {
        const errData = await res.json();
        alert('Reset failed: ' + (errData.error || res.statusText));
      }
    } catch (err) {
      alert('Error during reset: ' + err.message);
    }
  };

  // Trigger search reset to page 1
  useEffect(() => {
    setPage(1);
  }, [userFilter, roleFilter, moduleFilter, actionFilter, startDate, endDate, search]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 30000); // Polling every 30 seconds

    const handleStorageUpdate = () => {
      fetchLogs();
    };

    window.addEventListener('storage', handleStorageUpdate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageUpdate);
    };
  }, [token, page, userFilter, roleFilter, moduleFilter, actionFilter, startDate, endDate, search]);

  return (
    <div className="space-y-4 animate-fade-in p-1 select-none text-xs font-semibold">
      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
        <div>
          <h2 className="text-xl font-black text-slate-855 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-500" /> Security Audit Logs
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
            Immutable log of database mutations and role log-ins (Auto-refreshes every 5s)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={handleExportPDF}
            className="px-3 py-1.5 bg-rose-650 hover:bg-rose-700 text-white rounded-xl font-bold shadow-xs transition-colors"
          >
            Export PDF
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl grid grid-cols-2 md:grid-cols-7 gap-3 items-end shadow-sm">
        <div>
          <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Search Keywords</label>
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description..."
              className="w-full pl-10 pr-3 py-2 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
            />
          </div>
        </div>
        <div>
          <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">User Name</label>
          <input 
            type="text"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            placeholder="Search user..."
            className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
          />
        </div>
        <div>
          <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Role</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
          >
            <option value="">All Roles</option>
            <option value="Admin">Admin</option>
            <option value="Accounts">Accounts</option>
            <option value="Service">Service</option>
            <option value="Spares">Spares</option>
            <option value="Body Shop">Body Shop</option>
          </select>
        </div>
        <div>
          <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Module</label>
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
          >
            <option value="">All Modules</option>
            <option value="Auth">Auth</option>
            <option value="Customer">Customer</option>
            <option value="Vehicle">Vehicle</option>
            <option value="JobCard">JobCard</option>
            <option value="Estimate">Estimate</option>
            <option value="Invoice">Invoice</option>
            <option value="Inventory">Inventory</option>
            <option value="Employee">Employee</option>
            <option value="Claim">Claim</option>
            <option value="Report">Report</option>
            <option value="GatePass">GatePass</option>
          </select>
        </div>
        <div>
          <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Action Type</label>
          <input 
            type="text"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="e.g. CREATE, DELETE"
            className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
          />
        </div>
        <div>
          <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Start Date</label>
          <input 
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
          />
        </div>
        <div>
          <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">End Date</label>
          <input 
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
          />
        </div>
        <div className="md:col-span-7 flex flex-wrap justify-between items-center gap-2.5 pt-2">
          <div className="flex gap-2">
            <button
              onClick={() => handleDatePreset(0)}
              className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-[10px] font-bold"
            >
              Today
            </button>
            <button
              onClick={() => handleDatePreset(7)}
              className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-[10px] font-bold"
            >
              Last 7 Days
            </button>
            <button
              onClick={() => handleDatePreset(30)}
              className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-[10px] font-bold"
            >
              Last 30 Days
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-650 dark:text-slate-200 rounded-xl transition-all font-bold"
            >
              Reset Filters
            </button>
            <button
              onClick={fetchLogs}
              className="px-4 py-2 bg-indigo-655 hover:bg-indigo-700 text-white rounded-xl transition-all font-bold"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-400 font-semibold">Loading audit logs...</div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
                  <th className="p-4">Date & Time</th>
                  <th className="p-4">User Name</th>
                  <th className="p-4">Role</th>
                  <th className="p-4">Module</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">Details</th>
                  <th className="p-4">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {logs.length > 0 ? (
                  logs.map(log => {
                    let actionColor = 'bg-slate-50 text-slate-655';
                    if (log.action?.includes('CREATE') || log.action?.includes('ADD')) actionColor = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400';
                    if (log.action?.includes('DELETE') || log.action?.includes('REJECT') || log.action?.includes('REDUCE')) actionColor = 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400';
                    if (log.action?.includes('LOGIN') || log.action?.includes('LOGOUT')) actionColor = 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400';
                    if (log.action?.includes('UPDATE') || log.action?.includes('RESTOCK') || log.action?.includes('RETURN')) actionColor = 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400';

                    return (
                      <tr key={log._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all">
                        <td className="p-4 font-mono font-medium text-slate-400">
                          {new Date(log.createdAt || log.timestamp).toLocaleString('en-IN')}
                        </td>
                        <td className="p-4 font-bold text-slate-800 dark:text-slate-200">{log.userName}</td>
                        <td className="p-4 uppercase text-[9px] font-bold text-indigo-600 dark:text-indigo-400">{log.role || log.userRole}</td>
                        <td className="p-4 uppercase text-[9px] font-bold text-slate-500 dark:text-slate-400">{log.module || 'System'}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded font-extrabold text-[8px] uppercase ${actionColor}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="p-4 text-slate-600 dark:text-slate-350 font-medium">{log.details}</td>
                        <td className="p-4 font-mono text-slate-400">{log.ipAddress || '127.0.0.1'}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-slate-400 dark:text-slate-500 font-semibold">
                      No security audits logs registered.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-105 dark:border-slate-805 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
              <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">
                Showing Page {page} of {totalPages} ({totalCount} Total Logs)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-350 disabled:opacity-50 transition-colors flex items-center gap-1 font-bold"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-350 disabled:opacity-50 transition-colors flex items-center gap-1 font-bold"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-red-50/50 dark:bg-red-955/10 border border-red-200/40 dark:border-red-900/30 p-4 rounded-2xl flex justify-between items-center mt-6">
        <div>
          <h4 className="text-red-700 dark:text-red-400 font-bold uppercase tracking-wider">ERP Testing Reset</h4>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">Purges all test customers, vehicles, job cards, estimates, claims, and bookings to start real testing from scratch.</p>
        </div>
        <button
          onClick={handleResetDatabase}
          className="px-4 py-2 bg-red-650 hover:bg-red-700 text-white rounded-xl font-bold transition-colors shrink-0"
        >
          Reset Database
        </button>
      </div>
    </div>
  );
}
