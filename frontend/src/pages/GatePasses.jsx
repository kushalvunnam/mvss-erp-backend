import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../config';
import { 
  Plus, 
  Search, 
  Printer, 
  Trash2, 
  RotateCcw, 
  Key, 
  CheckCircle, 
  AlertCircle, 
  FileText, 
  User, 
  Phone, 
  Navigation, 
  Upload, 
  X,
  FileCheck
} from 'lucide-react';

export default function GatePasses({ token, user }) {
  const [gatepasses, setGatepasses] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    totalGatePasses: 0,
    issuedToday: 0,
    pendingReturns: 0,
    returnedMaterials: 0
  });

  // Form Fields
  const [formData, setFormData] = useState({
    jobCardNumber: '',
    vehicleNumber: '',
    customerName: '',
    customerMobile: '',
    materialName: '',
    quantity: 1,
    unit: 'Nos',
    reasonForIssue: '',
    sentTo: '',
    receiverName: '',
    receiverMobile: '',
    status: 'Pending', // Pending = returnable gate pass initially
    attachments: []
  });

  // Signatures State (base64 strings from canvas)
  const [receiverSignData, setReceiverSignData] = useState('');
  const [authorizedSignData, setAuthorizedSignData] = useState('');

  // Signature Canvas Refs
  const receiverCanvasRef = useRef(null);
  const authorizedCanvasRef = useRef(null);
  const [isDrawingReceiver, setIsDrawingReceiver] = useState(false);
  const [isDrawingAuth, setIsDrawingAuth] = useState(false);

  const fetchGatePasses = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/gatepasses?searchQuery=${encodeURIComponent(debouncedSearchQuery)}&status=${statusFilter}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGatepasses(data);
      }
    } catch (err) {
      console.error('Failed to load gate passes:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats({
          totalGatePasses: data.totalGatePasses || 0,
          issuedToday: data.issuedToday || 0,
          pendingReturns: data.pendingReturns || 0,
          returnedMaterials: data.returnedMaterials || 0
        });
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 120);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    fetchGatePasses();
    fetchStats();
  }, [debouncedSearchQuery, statusFilter]);

  // Canvas drawing handlers
  const startDrawing = (canvasRef, setDrawingState, e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b'; // dark slate slate-800
    
    // Support mobile touch events
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDrawingState(true);
  };

  const draw = (canvasRef, isDrawing, e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = (canvasRef, setDrawingState, setSignData) => {
    setDrawingState(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignData(canvas.toDataURL());
    }
  };

  const clearCanvas = (canvasRef, setSignData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignData('');
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          attachments: [...prev.attachments, reader.result]
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveAttachment = (idx) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== idx)
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (!formData.vehicleNumber || !formData.customerName || !formData.customerMobile || !formData.materialName || !formData.quantity || !formData.reasonForIssue || !formData.sentTo || !formData.receiverName || !formData.receiverMobile) {
      alert('Please fill out all required gate pass fields.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        receiverSignature: receiverSignData,
        authorizedSignature: authorizedSignData
      };

      const res = await fetch(`${API_BASE_URL}/gatepasses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowForm(false);
        setFormData({
          jobCardNumber: '',
          vehicleNumber: '',
          customerName: '',
          customerMobile: '',
          materialName: '',
          quantity: 1,
          unit: 'Nos',
          reasonForIssue: '',
          sentTo: '',
          receiverName: '',
          receiverMobile: '',
          status: 'Pending',
          attachments: []
        });
        setReceiverSignData('');
        setAuthorizedSignData('');
        fetchGatePasses();
        fetchStats();
      } else {
        const err = await res.json();
        alert('Error creating gate pass: ' + (err.error || res.statusText));
      }
    } catch (err) {
      alert('Failed to connect to backend: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReturnMaterial = async (id) => {
    if (!confirm('Mark materials on this Gate Pass as Returned?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/gatepasses/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'Returned', returnDate: new Date().toISOString() })
      });
      if (res.ok) {
        fetchGatePasses();
        fetchStats();
      }
    } catch (err) {
      console.error('Failed to update gate pass:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this Gate Pass record permanently?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/gatepasses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchGatePasses();
        fetchStats();
      }
    } catch (err) {
      console.error('Failed to delete gate pass:', err);
    }
  };

  const printGatePass = async (gp) => {
    // Log print action to backend audit logs
    fetch(`${API_BASE_URL}/gatepasses/${gp._id}/print-log`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {});

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup blocker active. Please allow popups to print.');
      return;
    }

    const formattedDate = new Date(gp.date || gp.createdAt).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const returnDateStr = gp.returnDate 
      ? new Date(gp.returnDate).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) 
      : 'N/A';

    printWindow.document.write(`
      <html>
        <head>
          <title>Gate Pass - ${gp.gatePassNo}</title>
          <style>
            @media print {
              body { margin: 0; padding: 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #1e293b; }
              @page { size: A4; margin: 15mm; }
            }
            body { padding: 40px; font-family: Arial, sans-serif; color: #333; max-width: 800px; margin: 0 auto; line-height: 1.4; }
            .header-container { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px; }
            .company-name { font-size: 20px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin: 0; }
            .company-sub { font-size: 9px; color: #64748b; margin-top: 2px; text-transform: uppercase; font-weight: 700; }
            .document-title { font-size: 14px; font-weight: 900; background: #000; color: #fff; padding: 4px 12px; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 4px; display: inline-block; margin-top: 5px; }
            
            .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 25px; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; }
            .meta-item { display: flex; justify-content: space-between; border-bottom: 1px dashed #e2e8f0; padding: 4px 0; }
            .meta-item:last-child { border-bottom: none; }
            .meta-label { font-weight: bold; color: #475569; text-transform: uppercase; font-size: 9px; }
            .meta-val { font-weight: 700; color: #0f172a; text-transform: uppercase; }

            .materials-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .materials-table th { background: #f1f5f9; text-align: left; padding: 8px; font-size: 9px; text-transform: uppercase; border: 1px solid #cbd5e1; font-weight: 900; }
            .materials-table td { padding: 10px 8px; border: 1px solid #cbd5e1; font-weight: bold; }

            .sign-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 50px; }
            .sign-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; text-align: center; height: 110px; display: flex; flex-direction: column; justify-content: space-between; }
            .sign-box img { max-height: 50px; object-fit: contain; margin: auto; }
            .sign-title { font-size: 9px; font-weight: 900; text-transform: uppercase; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 6px; }

            .tc-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; margin-top: 25px; background: #fafafa; }
            .tc-title { font-size: 9px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; }
            .tc-text { font-size: 8px; color: #64748b; line-height: 1.3; margin: 0; }
          </style>
        </head>
        <body onload="window.print()">
          <div class="header-container">
            <div>
              <div class="company-name">MVSS Automobiles Pvt Ltd</div>
              <div class="company-sub">Authorized Workshop Operations Center & Body Paint Specialist</div>
              <div style="font-size: 9px; font-weight: bold; color: #475569; margin-top: 2px;">GSTIN: 36AAJCM4778P1ZI | Hyderabad, TS</div>
            </div>
            <div style="text-align: right;">
              <span class="document-title">${gp.status === 'Issued' ? 'Non-Returnable' : 'Returnable'} Gate Pass</span>
            </div>
          </div>

          <div class="meta-grid">
            <div>
              <div class="meta-item">
                <span class="meta-label">Gate Pass No</span>
                <span class="meta-val">${gp.gatePassNo}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Issue Date</span>
                <span class="meta-val">${formattedDate}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Job Card Number</span>
                <span class="meta-val">${gp.jobCardNumber || 'N/A'}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Vehicle Registration</span>
                <span class="meta-val">${gp.vehicleNumber}</span>
              </div>
            </div>
            <div>
              <div class="meta-item">
                <span class="meta-label">Customer Name</span>
                <span class="meta-val">${gp.customerName}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Customer Mobile</span>
                <span class="meta-val">${gp.customerMobile}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Sent To (Destination)</span>
                <span class="meta-val">${gp.sentTo}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">GP Status / Returns</span>
                <span class="meta-val" style="color: ${gp.status === 'Returned' ? 'green' : 'red'}">${gp.status} (${returnDateStr})</span>
              </div>
            </div>
          </div>

          <table class="materials-table">
            <thead>
              <tr>
                <th style="width: 50%;">Material / Item Description</th>
                <th style="width: 15%;">Quantity</th>
                <th style="width: 15%;">Unit</th>
                <th style="width: 20%;">Reason For Issue</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${gp.materialName}</td>
                <td>${gp.quantity}</td>
                <td>${gp.unit}</td>
                <td>${gp.reasonForIssue}</td>
              </tr>
            </tbody>
          </table>

          <div class="sign-grid">
            <div class="sign-box">
              <div style="font-size: 10px; font-weight: 700; color: #1e293b; padding-top: 10px;">
                ${gp.issuedBy}
              </div>
              <div class="sign-title">Issued By</div>
            </div>
            <div class="sign-box">
              ${gp.authorizedSignature ? `<img src="${gp.authorizedSignature}" />` : '<div style="margin: auto; color: #cbd5e1; font-style: italic; font-size: 8px;">No Signature</div>'}
              <div class="sign-title">Authorized Signature</div>
            </div>
            <div class="sign-box">
              ${gp.receiverSignature ? `<img src="${gp.receiverSignature}" />` : '<div style="margin: auto; color: #cbd5e1; font-style: italic; font-size: 8px;">No Signature</div>'}
              <div class="sign-title">Receiver Signature (${gp.receiverName})</div>
            </div>
          </div>

          <div class="tc-box">
            <div class="tc-title">Terms & Workshop Instructions:</div>
            <p class="tc-text">
              1. This is an official material clearance pass. All returnable items must be received back by the return date logged in ERP.<br/>
              2. Transporter / Receiver must verify the materials quantity and specifications before leaving workshop floor.<br/>
              3. Any deviations must be reported immediately to the Authorized Service Advisor or Center Floor Manager.
            </p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 animate-fade-in p-1 select-none text-xs font-semibold">
      
      {/* Header Area */}
      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
        <div>
          <h2 className="text-xl font-black text-slate-850 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-500" /> Gate Pass Registry
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Workshop Material Control & Return Tracking</p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setReceiverSignData('');
            setAuthorizedSignData('');
          }}
          className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Gate Pass
        </button>
      </div>

      {/* KPI Stats Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glassmorphism p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[9px] font-extrabold uppercase text-slate-400">Total Issued</span>
            <span className="block text-lg font-black text-slate-800 dark:text-white mt-0.5">{stats.totalGatePasses || 0}</span>
          </div>
        </div>
        <div className="glassmorphism p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[9px] font-extrabold uppercase text-slate-400">Issued Today</span>
            <span className="block text-lg font-black text-slate-800 dark:text-white mt-0.5">{stats.issuedToday || 0}</span>
          </div>
        </div>
        <div className="glassmorphism p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[9px] font-extrabold uppercase text-slate-400">Pending Return</span>
            <span className="block text-lg font-black text-slate-800 dark:text-white mt-0.5">{stats.pendingReturns || 0}</span>
          </div>
        </div>
        <div className="glassmorphism p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400 rounded-xl flex items-center justify-center">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[9px] font-extrabold uppercase text-slate-400">Returned Stock</span>
            <span className="block text-lg font-black text-slate-800 dark:text-white mt-0.5">{stats.returnedMaterials || 0}</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="glassmorphism p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex-1 max-w-md flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden focus-within:border-indigo-650 transition-colors px-3 py-2">
          <Search className="w-4 h-4 text-slate-400 shrink-0 mr-2" />
          <input
            type="text"
            placeholder="Search by Gate Pass No, Customer, Plate, JC, Item..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs font-semibold focus:outline-none dark:text-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[9px] font-extrabold uppercase text-slate-400">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-650 text-slate-700 dark:text-slate-200 font-semibold"
          >
            <option value="">All Statuses</option>
            <option value="Issued">Issued</option>
            <option value="Pending">Pending Return</option>
            <option value="Returned">Returned</option>
          </select>
        </div>
      </div>

      {/* Grid List Table */}
      <div className="glassmorphism rounded-2xl border border-slate-200/50 dark:border-slate-800/50 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800/80 text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">
                <th className="p-4">GP Number</th>
                <th className="p-4">Date</th>
                <th className="p-4">Vehicle / JC</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Material Details</th>
                <th className="p-4">Sent To</th>
                <th className="p-4">Receiver</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {gatepasses.length > 0 ? (
                gatepasses.map((gp) => {
                  let statusColor = 'bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-400';
                  if (gp.status === 'Returned') statusColor = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400';
                  if (gp.status === 'Pending') statusColor = 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400';

                  return (
                    <tr key={gp._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800/50 transition-all font-semibold">
                      <td className="p-4 text-slate-800 dark:text-slate-200 font-bold">{gp.gatePassNo}</td>
                      <td className="p-4 font-mono text-slate-400">
                        {new Date(gp.date || gp.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric'
                        })}
                      </td>
                      <td className="p-4">
                        <span className="block text-slate-850 dark:text-slate-200 font-bold uppercase">{gp.vehicleNumber}</span>
                        <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">JC: {gp.jobCardNumber || 'N/A'}</span>
                      </td>
                      <td className="p-4">
                        <span className="block text-slate-850 dark:text-slate-200 font-bold">{gp.customerName}</span>
                        <span className="block text-[8px] text-slate-400 font-mono mt-0.5">{gp.customerMobile}</span>
                      </td>
                      <td className="p-4">
                        <span className="block text-slate-850 dark:text-slate-200 font-bold">{gp.materialName}</span>
                        <span className="block text-[8px] text-indigo-500 font-bold uppercase tracking-wider mt-0.5">Qty: {gp.quantity} {gp.unit}</span>
                      </td>
                      <td className="p-4 text-slate-600 dark:text-slate-350">{gp.sentTo}</td>
                      <td className="p-4">
                        <span className="block text-slate-850 dark:text-slate-200 font-bold">{gp.receiverName}</span>
                        <span className="block text-[8px] text-slate-400 font-mono mt-0.5">{gp.receiverMobile}</span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded font-extrabold text-[8px] uppercase tracking-wider ${statusColor}`}>
                          {gp.status}
                        </span>
                      </td>
                      <td className="p-4 text-right flex justify-end gap-1.5 items-center">
                        {gp.status === 'Pending' && (
                          <button
                            onClick={() => handleReturnMaterial(gp._id)}
                            className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/20 dark:hover:bg-amber-955/30 rounded-lg transition-colors"
                            title="Mark Returned"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => printGatePass(gp)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
                          title="Print Gate Pass"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        {user?.role === 'Admin' && (
                          <button
                            onClick={() => handleDelete(gp._id)}
                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/20 dark:hover:bg-red-955/30 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-slate-400 dark:text-slate-500 font-bold">
                    No gate passes currently issued.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Creation Drawer Overlay Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-[99999] p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-fade-in">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
              <div>
                <h3 className="text-sm font-black text-slate-850 dark:text-white uppercase tracking-wider">Issue New Material Gate Pass</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Workshop floor material clearance document</p>
              </div>
              <button 
                onClick={() => setShowForm(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Form Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                
                {/* Section 1: Customer & Vehicle Info */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase text-indigo-500 tracking-wider flex items-center gap-1">
                    <User className="w-3.5 h-3.5" /> Client / Vehicle Details
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[9px] font-extrabold uppercase text-slate-450 mb-1">Vehicle Plate Number *</label>
                      <input
                        type="text"
                        placeholder="TS09EA1234"
                        value={formData.vehicleNumber}
                        onChange={(e) => setFormData(prev => ({ ...prev, vehicleNumber: e.target.value.toUpperCase() }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-650 dark:text-white uppercase font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-extrabold uppercase text-slate-450 mb-1">Job Card Number (Optional)</label>
                      <input
                        type="text"
                        placeholder="JC-20260702-001"
                        value={formData.jobCardNumber}
                        onChange={(e) => setFormData(prev => ({ ...prev, jobCardNumber: e.target.value.toUpperCase() }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-650 dark:text-white uppercase font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-extrabold uppercase text-slate-450 mb-1">Customer Full Name *</label>
                      <input
                        type="text"
                        placeholder="Kushal Vunnam"
                        value={formData.customerName}
                        onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-650 dark:text-white font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-extrabold uppercase text-slate-450 mb-1">Customer Mobile *</label>
                      <input
                        type="text"
                        placeholder="9988776655"
                        value={formData.customerMobile}
                        onChange={(e) => setFormData(prev => ({ ...prev, customerMobile: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-650 dark:text-white font-bold"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Material Info */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase text-indigo-500 tracking-wider flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> Material Specifications
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[9px] font-extrabold uppercase text-slate-450 mb-1">Material Name *</label>
                      <input
                        type="text"
                        placeholder="Bosch Alternator Assembly / Engine Oil Can"
                        value={formData.materialName}
                        onChange={(e) => setFormData(prev => ({ ...prev, materialName: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-650 dark:text-white font-bold"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-extrabold uppercase text-slate-450 mb-1">Quantity *</label>
                        <input
                          type="number"
                          value={formData.quantity}
                          min="1"
                          onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value, 10) || 1 }))}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-650 dark:text-white font-bold"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-extrabold uppercase text-slate-450 mb-1">Unit *</label>
                        <input
                          type="text"
                          placeholder="Nos / Liters"
                          value={formData.unit}
                          onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-650 dark:text-white font-bold"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-extrabold uppercase text-slate-450 mb-1">Reason For Issue *</label>
                      <input
                        type="text"
                        placeholder="Sent for structural lathe turning / Warranty claim return"
                        value={formData.reasonForIssue}
                        onChange={(e) => setFormData(prev => ({ ...prev, reasonForIssue: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-650 dark:text-white font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-extrabold uppercase text-slate-450 mb-1">Gate Pass Type *</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-650 text-slate-700 dark:text-slate-200 font-semibold"
                        required
                      >
                        <option value="Pending">Returnable (Pending Return)</option>
                        <option value="Issued">Non-Returnable (Issued Only)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 3: Destination & Logistics */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase text-indigo-500 tracking-wider flex items-center gap-1">
                    <Navigation className="w-3.5 h-3.5" /> Logistics & Consignee
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[9px] font-extrabold uppercase text-slate-450 mb-1">Sent To (Vendor/Destination) *</label>
                      <input
                        type="text"
                        placeholder="Jai Lathe Specialists Workshop / Ford Inventory Warehouse"
                        value={formData.sentTo}
                        onChange={(e) => setFormData(prev => ({ ...prev, sentTo: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-650 dark:text-white font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-extrabold uppercase text-slate-450 mb-1">Receiver Person Name *</label>
                      <input
                        type="text"
                        placeholder="Ramesh Yadav"
                        value={formData.receiverName}
                        onChange={(e) => setFormData(prev => ({ ...prev, receiverName: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-650 dark:text-white font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-extrabold uppercase text-slate-450 mb-1">Receiver Mobile *</label>
                      <input
                        type="text"
                        placeholder="9900112233"
                        value={formData.receiverMobile}
                        onChange={(e) => setFormData(prev => ({ ...prev, receiverMobile: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-650 dark:text-white font-bold"
                        required
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Attachments Section */}
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-[10px] font-black uppercase text-indigo-500 tracking-wider flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" /> Upload Material/Vehicle Attachments
                </h4>
                <div className="flex items-center gap-4">
                  <label className="px-4 py-2 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2">
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-350 uppercase">Select Files</span>
                    <input
                      type="file"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                      accept="image/*,application/pdf"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {formData.attachments.map((attach, idx) => (
                      <div key={idx} className="relative group w-12 h-12 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-slate-50">
                        <img src={attach} className="w-full h-full object-cover" alt="Attachment" />
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(idx)}
                          className="absolute -top-1 -right-1 p-0.5 bg-red-650 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Signature Pads Drawing Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-slate-100 dark:border-slate-800">
                
                {/* Receiver Signature Pad */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-extrabold uppercase text-slate-450">Receiver Signature (Draw Below)</label>
                    <button
                      type="button"
                      onClick={() => clearCanvas(receiverCanvasRef, setReceiverSignData)}
                      className="text-[9px] font-black uppercase text-indigo-500 hover:text-indigo-700"
                    >
                      Clear
                    </button>
                  </div>
                  <canvas
                    ref={receiverCanvasRef}
                    width={400}
                    height={120}
                    onMouseDown={(e) => startDrawing(receiverCanvasRef, setIsDrawingReceiver, e)}
                    onMouseMove={(e) => draw(receiverCanvasRef, isDrawingReceiver, e)}
                    onMouseUp={() => stopDrawing(receiverCanvasRef, setIsDrawingReceiver, setReceiverSignData)}
                    onMouseLeave={() => stopDrawing(receiverCanvasRef, setIsDrawingReceiver, setReceiverSignData)}
                    onTouchStart={(e) => startDrawing(receiverCanvasRef, setIsDrawingReceiver, e)}
                    onTouchMove={(e) => draw(receiverCanvasRef, isDrawingReceiver, e)}
                    onTouchEnd={() => stopDrawing(receiverCanvasRef, setIsDrawingReceiver, setReceiverSignData)}
                    className="w-full h-[120px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl cursor-crosshair"
                  />
                </div>

                {/* Authorized Signature Pad */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-extrabold uppercase text-slate-450">Authorized Signature (Draw Below)</label>
                    <button
                      type="button"
                      onClick={() => clearCanvas(authorizedCanvasRef, setAuthorizedSignData)}
                      className="text-[9px] font-black uppercase text-indigo-500 hover:text-indigo-700"
                    >
                      Clear
                    </button>
                  </div>
                  <canvas
                    ref={authorizedCanvasRef}
                    width={400}
                    height={120}
                    onMouseDown={(e) => startDrawing(authorizedCanvasRef, setIsDrawingAuth, e)}
                    onMouseMove={(e) => draw(authorizedCanvasRef, isDrawingAuth, e)}
                    onMouseUp={() => stopDrawing(authorizedCanvasRef, setIsDrawingAuth, setAuthorizedSignData)}
                    onMouseLeave={() => stopDrawing(authorizedCanvasRef, setIsDrawingAuth, setAuthorizedSignData)}
                    onTouchStart={(e) => startDrawing(authorizedCanvasRef, setIsDrawingAuth, e)}
                    onTouchMove={(e) => draw(authorizedCanvasRef, isDrawingAuth, e)}
                    onTouchEnd={() => stopDrawing(authorizedCanvasRef, setIsDrawingAuth, setAuthorizedSignData)}
                    className="w-full h-[120px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl cursor-crosshair"
                  />
                </div>

              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-350 font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                >
                  {loading ? 'Issuing Gate Pass...' : 'Issue Gate Pass'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
