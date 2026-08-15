import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../config';
import { Search, ShieldAlert, FileText, Upload, Calendar, CheckCircle2, User, Car, X } from 'lucide-react';
import SearchableDropdown from '../components/SearchableDropdown';

export default function Claims({ token, user }) {
  const [claims, setClaims] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [search, setSearch] = useState('');
  
  // Create Claim Form
  const [showAddModal, setShowAddModal] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [jobCards, setJobCards] = useState([]);
  const [statusRemarks, setStatusRemarks] = useState('');
  
  const [addForm, setAddForm] = useState({
    claimNo: '',
    customerId: '',
    vehicleId: '',
    invoiceId: '',
    jobCardId: '',
    insuranceCompany: '',
    policyNumber: '',
    surveyorName: '',
    surveyorMobile: '',
    surveyDate: '',
    claimDate: new Date().toISOString().split('T')[0],
    estimatedAmount: '',
    approvedAmount: '',
    status: 'Pending',
    remarks: '',
  });

  const [addDocumentFile, setAddDocumentFile] = useState(null);
  const [addDocumentName, setAddDocumentName] = useState('RC Copy');

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadDocName, setUploadDocName] = useState('RC Copy');

  const fetchClaims = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/claims?status=${statusFilter}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setClaims(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadResources = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [cRes, vRes, iRes, jRes] = await Promise.all([
        fetch(`${API_BASE_URL}/customers`, { headers }),
        fetch(`${API_BASE_URL}/vehicles`, { headers }),
        fetch(`${API_BASE_URL}/invoices`, { headers }),
        fetch(`${API_BASE_URL}/jobcards`, { headers }),
      ]);
      if (cRes.ok && vRes.ok && iRes.ok && jRes.ok) {
        setCustomers(await cRes.json());
        setVehicles(await vRes.json());
        setInvoices(await iRes.json());
        setJobCards(await jRes.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Close modal on Esc keypress
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    fetchClaims();
    loadResources();
  }, [statusFilter]);

  useEffect(() => {
    const globalFilter = localStorage.getItem('global_search_filter');
    if (globalFilter) {
      setSearch(globalFilter);
      localStorage.removeItem('global_search_filter');
    }
  }, []);

  const handleClaimSelect = async (claim) => {
    try {
      const res = await fetch(`${API_BASE_URL}/claims/${claim._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSelectedClaim(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();

    const serializedNotes = JSON.stringify({
      estimatedAmount: Number(addForm.estimatedAmount) || 0,
      approvedAmount: Number(addForm.approvedAmount) || 0,
      remarks: addForm.remarks || ''
    });

    const payload = {
      claimNo: addForm.claimNo,
      customerId: addForm.customerId,
      vehicleId: addForm.vehicleId,
      invoiceId: addForm.invoiceId || undefined,
      jobCardId: addForm.jobCardId || undefined,
      insuranceCompany: addForm.insuranceCompany,
      policyNumber: addForm.policyNumber || '',
      surveyorName: addForm.surveyorName || '',
      surveyorMobile: addForm.surveyorMobile || '',
      surveyDate: addForm.surveyDate || undefined,
      claimDate: addForm.claimDate || undefined,
      status: addForm.status || 'Pending',
      notes: serializedNotes
    };

    try {
      const res = await fetch(`${API_BASE_URL}/claims`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const createdClaim = await res.json();
        
        // Handle supporting document upload if selected
        if (addDocumentFile) {
          const formData = new FormData();
          formData.append('document', addDocumentFile);
          formData.append('name', addDocumentName);
          
          await fetch(`${API_BASE_URL}/claims/${createdClaim._id}/upload`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData
          });
        }

        alert('Insurance Claim Entry saved successfully.');
        setShowAddModal(false);
        setAddForm({
          claimNo: '',
          customerId: '',
          vehicleId: '',
          invoiceId: '',
          jobCardId: '',
          insuranceCompany: '',
          policyNumber: '',
          surveyorName: '',
          surveyorMobile: '',
          surveyDate: '',
          claimDate: new Date().toISOString().split('T')[0],
          estimatedAmount: '',
          approvedAmount: '',
          status: 'Pending',
          remarks: ''
        });
        setAddDocumentFile(null);
        fetchClaims();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create claim.');
      }
    } catch (err) {
      console.error(err);
      alert('Network or server error.');
    }
  };

  const handleUpdateStatus = async (claimId, nextStatus) => {
    try {
      const res = await fetch(`${API_BASE_URL}/claims/${claimId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: nextStatus, remarks: statusRemarks })
      });
      if (res.ok) {
        setStatusRemarks('');
        fetchClaims();
        const updated = await res.json();
        setSelectedClaim(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDocUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) return;
    
    const formData = new FormData();
    formData.append('document', uploadFile);
    formData.append('name', uploadDocName);

    try {
      const res = await fetch(`${API_BASE_URL}/claims/${selectedClaim._id}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        setUploadFile(null);
        // Refresh claim details
        handleClaimSelect(selectedClaim);
      } else {
        alert('Upload failed');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredClaims = claims.filter(c => {
    const query = search.toLowerCase();
    return c.claimNo?.toLowerCase().includes(query) ||
           c.insuranceCompany?.toLowerCase().includes(query) ||
           c.policyNumber?.toLowerCase().includes(query) ||
           c.customerId?.name?.toLowerCase().includes(query) ||
           c.vehicleId?.vehicleNumber?.toLowerCase().includes(query);
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full animate-fade-in p-1 select-none text-xs font-semibold">
      
      {/* Table grid */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-white">Insurance Claims Portal</h2>
            <p className="text-xs text-slate-400 font-semibold dark:text-slate-500">Track claim validations, surveyor logs, and policy uploads</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
          >
            + File Claim Entry
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search claims by number, policy, surveyor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-350 text-xs font-semibold focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-350 text-xs font-bold focus:outline-none"
          >
            <option value="">All Claim Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Submitted">Submitted</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Settled">Settled</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
                  <th className="p-4">Claim No</th>
                  <th className="p-4">Reg Number</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Insurance Company</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {filteredClaims.length > 0 ? (
                  filteredClaims.map(claim => {
                    let statusBg = 'bg-slate-50 text-slate-700';
                    if (claim.status === 'Pending') statusBg = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
                    if (claim.status === 'Submitted') statusBg = 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400';
                    if (claim.status === 'Approved') statusBg = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400';
                    if (claim.status === 'Rejected') statusBg = 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400';
                    if (claim.status === 'Settled') statusBg = 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400';

                    return (
                      <tr
                        key={claim._id}
                        onClick={() => handleClaimSelect(claim)}
                        className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 cursor-pointer transition-all ${
                          selectedClaim?._id === claim._id ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : ''
                        }`}
                      >
                        <td className="p-4 font-bold text-slate-800 dark:text-slate-200 font-mono">{claim.claimNo}</td>
                        <td className="p-4 font-bold text-slate-550 dark:text-slate-400 font-mono">{claim.vehicleId?.vehicleNumber || 'N/A'}</td>
                        <td className="p-4 font-semibold text-slate-550 dark:text-slate-450">{claim.customerId?.name || 'N/A'}</td>
                        <td className="p-4 font-medium text-slate-550 dark:text-slate-400">{claim.insuranceCompany}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] uppercase ${statusBg}`}>
                            {claim.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-slate-455 dark:text-slate-500 font-semibold">
                      No active insurance claims logged.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Details sidebar & Upload */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col h-fit">
        {selectedClaim ? (() => {
          let policyNoText = selectedClaim.policyNumber || '';
          let remarksText = selectedClaim.notes || '';
          let estimatedAmount = 0;
          let approvedAmount = 0;
          try {
            const parsedNotes = JSON.parse(selectedClaim.notes);
            if (parsedNotes) {
              estimatedAmount = parsedNotes.estimatedAmount || 0;
              approvedAmount = parsedNotes.approvedAmount || 0;
              remarksText = parsedNotes.remarks || remarksText;
            }
          } catch (e) {
            remarksText = selectedClaim.notes || remarksText;
          }
          return (
            <div className="space-y-6">
              <div>
                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Claim Summary</span>
                <h3 className="text-lg font-black text-slate-800 dark:text-white mt-2 font-mono">{selectedClaim.claimNo}</h3>
                <p className="text-xs text-slate-450 dark:text-slate-400 font-semibold mt-1">Provider: {selectedClaim.insuranceCompany}</p>
                
                <div className="mt-3.5 bg-slate-50 dark:bg-slate-950/20 p-3 rounded-xl border border-slate-150/30 text-slate-550 space-y-2">
                  <p>Owner: <strong className="text-slate-800 dark:text-slate-200">{selectedClaim.customerId?.name}</strong></p>
                  <p>Vehicle: <strong className="text-slate-800 dark:text-slate-200 font-mono">{selectedClaim.vehicleId?.vehicleNumber}</strong></p>
                  <p>Policy No: <strong className="text-slate-800 dark:text-slate-200 font-mono">{policyNoText || 'N/A'}</strong></p>
                  <p>Surveyor: <strong className="text-slate-800 dark:text-slate-200">{selectedClaim.surveyorName || 'TBD'}</strong></p>
                  {selectedClaim.surveyorMobile && (
                    <p>Surveyor Mobile: <strong className="text-slate-800 dark:text-slate-200 font-mono">{selectedClaim.surveyorMobile}</strong></p>
                  )}
                  {selectedClaim.claimDate && (
                    <p>Claim Date: <strong className="text-slate-800 dark:text-slate-200">{new Date(selectedClaim.claimDate).toLocaleDateString('en-IN')}</strong></p>
                  )}
                  {selectedClaim.jobCardId && (
                    <p>Linked Job Card: <strong className="text-indigo-600 dark:text-indigo-400 font-mono">{selectedClaim.jobCardId.jobCardNo || selectedClaim.jobCardId}</strong></p>
                  )}
                  <p>Est. Amount: <strong className="text-slate-800 dark:text-slate-200 font-mono">₹{(estimatedAmount || 0).toLocaleString('en-IN')}</strong></p>
                  <p>Appr. Amount: <strong className="text-slate-800 dark:text-slate-200 font-mono">₹{(approvedAmount || 0).toLocaleString('en-IN')}</strong></p>
                  {remarksText && (
                    <p className="mt-2 text-slate-450 italic">Remarks: {remarksText}</p>
                  )}
                </div>
              </div>

              {/* Status updates buttons */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide block">Transition Surveyor Status</span>
                
                <textarea
                  rows="2"
                  placeholder="Type transition remarks (e.g. approved amount details, surveyor query answers)..."
                  value={statusRemarks}
                  onChange={(e) => setStatusRemarks(e.target.value)}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs focus:outline-none"
                />

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => handleUpdateStatus(selectedClaim._id, 'Submitted')}
                    className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all"
                  >
                    Submit
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedClaim._id, 'Approved')}
                    className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedClaim._id, 'Rejected')}
                    className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedClaim._id, 'Settled')}
                    className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all"
                  >
                    Settle
                  </button>
                </div>
              </div>

              {/* Approval History Logs */}
              {selectedClaim.approvalHistory && selectedClaim.approvalHistory.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide block">Approval & Status Log History</span>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {selectedClaim.approvalHistory.map((h, i) => (
                      <div key={i} className="p-2.5 bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850 rounded-2xl flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <span className={`px-2 py-0.5 rounded font-extrabold text-[8px] uppercase ${
                            h.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' :
                            h.status === 'Rejected' ? 'bg-red-50 text-red-700' :
                            h.status === 'Settled' ? 'bg-indigo-50 text-indigo-700' : 'bg-blue-50 text-blue-700'
                          }`}>{h.status}</span>
                          <span className="text-[9px] text-slate-400 font-mono">
                            {new Date(h.updatedAt).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold">{h.remarks || 'No comments'}</p>
                        <p className="text-[9px] text-slate-450 font-medium">Changed by: {h.updatedBy}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents Checklist */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-4">
              <h4 className="text-xs font-extrabold text-slate-850 dark:text-slate-200 uppercase tracking-wide">Document Checklist</h4>
              
              <div className="space-y-2">
                {['RC Copy', 'Driving License', 'Insurance Policy', 'Vehicle Photos'].map(docName => {
                  const uploaded = selectedClaim.documents?.find(d => d.name === docName);
                  return (
                    <div key={docName} className="flex justify-between items-center py-1 border-b border-slate-50 dark:border-slate-800/30">
                      <span className="font-semibold text-slate-700 dark:text-slate-350">{docName}</span>
                       {uploaded ? (
                           <a
                             href={`${API_BASE_URL.replace('/api', '')}${uploaded.url}`}
                             target="_blank"
                             rel="noreferrer"
                             className="text-emerald-650 dark:text-emerald-400 font-bold flex items-center gap-1 hover:underline"
                           >
                             <CheckCircle2 className="w-3.5 h-3.5" /> View
                           </a>
                       ) : (
                        <span className="text-[10px] text-red-500 font-bold">Pending upload</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Upload Form */}
              <form onSubmit={handleDocUpload} className="bg-slate-50 dark:bg-slate-950/20 p-3.5 rounded-xl border border-slate-100 dark:border-slate-850 space-y-3">
                <div className="flex gap-2">
                  <select
                    value={uploadDocName}
                    onChange={(e) => setUploadDocName(e.target.value)}
                    className="flex-1 p-1 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-850 rounded text-[10px] focus:outline-none"
                  >
                    <option value="RC Copy">RC Copy</option>
                    <option value="Driving License">Driving License</option>
                    <option value="Insurance Policy">Insurance Policy</option>
                    <option value="Vehicle Photos">Vehicle Photos</option>
                  </select>
                  
                  <div className="relative">
                    <input
                      type="file"
                      required
                      onChange={(e) => setUploadFile(e.target.files[0])}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-[10px] rounded"
                    >
                      <Upload className="w-3.5 h-3.5" /> File
                    </button>
                  </div>
                </div>
                
                {uploadFile && (
                  <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-2 rounded border border-slate-100">
                    <span className="truncate max-w-[150px] text-[10px] text-slate-500 font-semibold">{uploadFile.name}</span>
                    <button
                      type="submit"
                      className="px-2.5 py-1 bg-indigo-650 hover:bg-indigo-700 text-white rounded text-[10px] font-bold"
                    >
                      Upload
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        );
      })() : (
          <div className="text-center py-20 text-slate-400 dark:text-slate-500 font-semibold text-xs">
            Select a claim to review attachments, Surveyor reports, and approvals.
          </div>
        )}
      </div>

      {/* Add Claim modal */}
      {showAddModal && createPortal(
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex justify-center items-center p-3 sm:p-6 z-[99999] select-none overflow-hidden animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[90vw] max-w-[800px] h-[80vh] max-h-[80vh] shadow-2xl flex flex-col relative overflow-hidden my-auto animate-scale-in">
            <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/40 shrink-0 mb-0">
              <h3 className="text-lg font-black text-slate-850 dark:text-white uppercase tracking-wider">
                File New Claim Entry
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Claim Number</label>
                  <input
                    type="text"
                    required
                    value={addForm.claimNo}
                    onChange={(e) => setAddForm({ ...addForm, claimNo: e.target.value })}
                    placeholder="CLM192837"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 rounded-xl font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Insurance Company</label>
                  <input
                    type="text"
                    required
                    value={addForm.insuranceCompany}
                    onChange={(e) => setAddForm({ ...addForm, insuranceCompany: e.target.value })}
                    placeholder="National Insurance"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 rounded-xl font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Policy Number</label>
                  <input
                    type="text"
                    required
                    value={addForm.policyNumber}
                    onChange={(e) => setAddForm({ ...addForm, policyNumber: e.target.value })}
                    placeholder="POL-998877"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 rounded-xl font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Claim Date</label>
                  <input
                    type="date"
                    required
                    value={addForm.claimDate}
                    onChange={(e) => setAddForm({ ...addForm, claimDate: e.target.value })}
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 rounded-xl font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Customer Owner</label>
                <SearchableDropdown
                  items={customers}
                  value={addForm.customerId}
                  onSelect={(cId) => setAddForm({ ...addForm, customerId: cId, vehicleId: '', invoiceId: '', jobCardId: '' })}
                  placeholder="Search customer name, company, phone..."
                  emptyOptionLabel="-- Choose Owner --"
                  type="customers"
                  className="mt-1 block w-full"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Vehicle Plate</label>
                  <select
                    value={addForm.vehicleId}
                    required
                    onChange={(e) => setAddForm({ ...addForm, vehicleId: e.target.value })}
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 rounded-xl animate-fade-in"
                  >
                    <option value="">-- Choose Vehicle --</option>
                    {vehicles.filter(v => {
                      const cid = v.customerId?._id || v.customerId;
                      return cid === addForm.customerId;
                    }).map(v => (
                      <option key={v._id} value={v._id}>{v.vehicleNumber} ({v.make})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Tax Invoice Ref</label>
                  <select
                    value={addForm.invoiceId}
                    onChange={(e) => setAddForm({ ...addForm, invoiceId: e.target.value })}
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 rounded-xl"
                  >
                    <option value="">-- Choose Invoice (Optional) --</option>
                    {invoices.filter(i => {
                      const cid = i.customerId?._id || i.customerId;
                      return cid === addForm.customerId;
                    }).map(i => (
                      <option key={i._id} value={i._id}>{i.invoiceNo} (₹{i.totals?.grandTotal?.toLocaleString()})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Linked Job Card</label>
                  <select
                    value={addForm.jobCardId}
                    onChange={(e) => setAddForm({ ...addForm, jobCardId: e.target.value })}
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 rounded-xl"
                  >
                    <option value="">-- Choose Job Card (Optional) --</option>
                    {jobCards.filter(jc => {
                      const cid = jc.customerId?._id || jc.customerId;
                      return cid === addForm.customerId;
                    }).map(jc => (
                      <option key={jc._id} value={jc._id}>{jc.jobCardNo} ({jc.vehicleId?.vehicleNumber || 'Plate Info'})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Estimated Amount (₹)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={addForm.estimatedAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      let cleaned = val.replace(/[^0-9.]/g, '');
                      const parts = cleaned.split('.');
                      if (parts.length > 2) {
                        cleaned = parts[0] + '.' + parts.slice(1).join('');
                      }
                      if (cleaned.startsWith('0') && cleaned.length > 1 && cleaned[1] !== '.') {
                        cleaned = cleaned.replace(/^0+/, '');
                      }
                      setAddForm({ ...addForm, estimatedAmount: cleaned });
                    }}
                    placeholder="Enter estimated amount"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 rounded-xl font-semibold font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Approved Amount (₹)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={addForm.approvedAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      let cleaned = val.replace(/[^0-9.]/g, '');
                      const parts = cleaned.split('.');
                      if (parts.length > 2) {
                        cleaned = parts[0] + '.' + parts.slice(1).join('');
                      }
                      if (cleaned.startsWith('0') && cleaned.length > 1 && cleaned[1] !== '.') {
                        cleaned = cleaned.replace(/^0+/, '');
                      }
                      setAddForm({ ...addForm, approvedAmount: cleaned });
                    }}
                    placeholder="Enter approved amount"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 rounded-xl font-semibold font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 border-t border-slate-100 dark:border-slate-800 pt-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Surveyor Name</label>
                  <input
                    type="text"
                    required
                    value={addForm.surveyorName}
                    onChange={(e) => setAddForm({ ...addForm, surveyorName: e.target.value })}
                    placeholder="e.g. Ramesh Kumar"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Surveyor Mobile</label>
                  <input
                    type="text"
                    required
                    value={addForm.surveyorMobile}
                    onChange={(e) => setAddForm({ ...addForm, surveyorMobile: e.target.value })}
                    placeholder="e.g. +91 99887 76655"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Claim Status</label>
                  <select
                    value={addForm.status}
                    required
                    onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 rounded-xl font-bold"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Submitted">Submitted</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Settled">Settled</option>
                  </select>
                </div>
              </div>

              {/* Supporting Document Upload */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide mb-1">Supporting Document</label>
                <div className="flex gap-2">
                  <select
                    value={addDocumentName}
                    onChange={(e) => setAddDocumentName(e.target.value)}
                    className="flex-1 px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 rounded-xl"
                  >
                    <option value="RC Copy">RC Copy</option>
                    <option value="Driving License">Driving License</option>
                    <option value="Insurance Policy">Insurance Policy</option>
                    <option value="Vehicle Photos">Vehicle Photos</option>
                  </select>
                  <div className="relative">
                    <input
                      type="file"
                      onChange={(e) => setAddDocumentFile(e.target.files[0])}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 text-slate-700 dark:text-slate-300 rounded-xl font-bold"
                    >
                      <Upload className="w-4 h-4" /> Select File
                    </button>
                  </div>
                </div>
                {addDocumentFile && (
                  <p className="text-[10px] text-indigo-500 font-bold mt-1">
                    Selected file: {addDocumentFile.name} (will upload on Save)
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Remarks</label>
                <textarea
                  rows="2"
                  value={addForm.remarks}
                  onChange={(e) => setAddForm({ ...addForm, remarks: e.target.value })}
                  placeholder="Additional surveyor details or policy deductions..."
                  className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 rounded-xl resize-none"
                />
              </div>

                            </div>

              {/* Modal Footer */}
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
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all"
                >
                  Save Claim Entry
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
