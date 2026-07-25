import React, { useEffect, useState } from 'react';
import { API_BASE_URL, OWNER_SUPPORT_NUMBER } from '../config';
import { 
  FileText, 
  Printer, 
  Download, 
  Clock, 
  User, 
  Car, 
  CheckCircle2, 
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  FileCheck,
  Users,
  Receipt,
  Trash2,
  CreditCard
} from 'lucide-react';

const getStatusBadgeClass = (status) => {
  switch (status) {
    case 'Waiting for Customer Approval':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-205/40';
    case 'Parts Procuring':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-205/40';
    case 'Work In Progress':
    case 'Work in Progress':
      return 'bg-pink-100 text-pink-850 dark:bg-pink-950/60 dark:text-pink-300 border-pink-205/40';
    case 'Quality Check':
    case 'Quality Test':
      return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-205/40';
    case 'Ready for Delivery':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-350 border-yellow-250/40';
    case 'Delivered':
    case 'Closed':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-255/40';
    default:
      return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200';
  }
};

export default function JobCardDetails({ jcId, token, user, onBack, onCreateEstimate, onViewEstimate, onConvertInvoice }) {
  const [jc, setJc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [qtyInputs, setQtyInputs] = useState({});
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [modalData, setModalData] = useState({
    technicianRemarks: '',
    estimatedCompletionDate: '',
    jobProgress: 0,
    qcRemarks: '',
    qcStatus: ''
  });

  const [invoice, setInvoice] = useState(null);
  const [finalAmount, setFinalAmount] = useState('');
  const [finalPaymentType, setFinalPaymentType] = useState('Cash');
  const [finalTransactionId, setFinalTransactionId] = useState('');
  const [finalReferenceNumber, setFinalReferenceNumber] = useState('');
  const [finalRemarks, setFinalRemarks] = useState('');
  const [addingFinal, setAddingFinal] = useState(false);

  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceType, setAdvanceType] = useState('Cash');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [transactionId, setTransactionId] = useState('');
  const [advanceRemarks, setAdvanceRemarks] = useState('');
  const [addingAdvance, setAddingAdvance] = useState(false);

  const handleAddAdvance = async (e) => {
    e.preventDefault();
    if (!advanceAmount || parseFloat(advanceAmount) <= 0) {
      alert('Please enter a valid advance amount.');
      return;
    }
    setAddingAdvance(true);
    try {
      const res = await fetch(`${API_BASE_URL}/jobcards/${jcId}/advance-payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parseFloat(advanceAmount),
          type: advanceType,
          paymentMode,
          transactionId,
          remarks: advanceRemarks
        })
      });
      if (res.ok) {
        setAdvanceAmount('');
        setTransactionId('');
        setAdvanceRemarks('');
        refreshPaymentData();
      } else {
        const errObj = await res.json().catch(() => ({}));
        alert(errObj.error || 'Failed to record advance payment.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to the server.');
    } finally {
      setAddingAdvance(false);
    }
  };

  const refreshPaymentData = () => {
    fetchDetails();
    fetchInvoice();
  };

  const fetchInvoice = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/invoices?jobCardId=${jcId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const matching = data.find(inv => inv.jobCardId?._id === jcId || inv.jobCardId === jcId);
          setInvoice(matching || null);
        } else {
          setInvoice(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAdvance = async (paymentId) => {
    if (!window.confirm('Are you sure you want to delete this advance payment record?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/jobcards/${jcId}/advance-payments/${paymentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        refreshPaymentData();
      } else {
        const errObj = await res.json().catch(() => ({}));
        alert(errObj.error || 'Failed to delete advance payment.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to the server.');
    }
  };

  const handleAddFinalPayment = async (e) => {
    e.preventDefault();
    if (!finalAmount || parseFloat(finalAmount) <= 0) {
      alert('Please enter a valid amount.');
      return;
    }
    setAddingFinal(true);
    try {
      const res = await fetch(`${API_BASE_URL}/jobcards/${jcId}/final-payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parseFloat(finalAmount),
          paymentType: finalPaymentType,
          transactionId: finalTransactionId,
          referenceNumber: finalReferenceNumber,
          remarks: finalRemarks
        })
      });
      if (res.ok) {
        setFinalAmount('');
        setFinalTransactionId('');
        setFinalReferenceNumber('');
        setFinalRemarks('');
        refreshPaymentData();
      } else {
        const errObj = await res.json().catch(() => ({}));
        alert(errObj.error || 'Failed to record payment.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to the server.');
    } finally {
      setAddingFinal(false);
    }
  };

  const handleDeleteFinalPayment = async (paymentId) => {
    if (!window.confirm('Are you sure you want to delete this final payment record?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/jobcards/${jcId}/final-payments/${paymentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        refreshPaymentData();
      } else {
        const errObj = await res.json().catch(() => ({}));
        alert(errObj.error || 'Failed to delete final payment.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to the server.');
    }
  };

  const getFinalBillAmount = () => {
    return invoice ? (invoice.totals?.roundedGrandTotal || invoice.totals?.grandTotal || 0) : (jc?.billingSummary?.grandTotal || 0);
  };

  const getTotalAdvanceReceived = () => {
    const total = jc?.advancePayments ? jc.advancePayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) : 0;
    return isNaN(total) ? 0 : total;
  };

  const getEstimatedBalanceDue = () => {
    const totalAdvance = getTotalAdvanceReceived();
    let targetTotal = getFinalBillAmount();
    const balance = targetTotal - totalAdvance;
    return isNaN(balance) ? 0 : Math.max(0, balance);
  };

  const getBalancePayable = () => {
    return Math.max(0, getFinalBillAmount() - getTotalAdvanceReceived());
  };

  const getTotalFinalPayments = () => {
    return jc?.finalPayments ? jc.finalPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) : 0;
  };

  const getPendingAmount = () => {
    return Math.max(0, getBalancePayable() - getTotalFinalPayments());
  };

  const getTotalReceived = () => {
    return getTotalAdvanceReceived() + getTotalFinalPayments();
  };

  const getCombinedPaymentHistory = () => {
    const history = [];
    if (jc?.advancePayments) {
      jc.advancePayments.forEach(p => {
        history.push({
          id: p._id,
          type: 'Advance Deposit',
          date: p.paymentDate,
          mode: p.paymentMode || p.type,
          amount: p.amount,
          txnId: p.transactionId,
          recordedBy: p.recordedBy || 'System',
          remarks: p.remarks,
          isAdvance: true
        });
      });
    }
    if (jc?.finalPayments) {
      jc.finalPayments.forEach(p => {
        history.push({
          id: p._id,
          type: 'Final Settlement',
          date: p.paymentDate,
          mode: p.paymentType,
          amount: p.amount,
          txnId: p.transactionId || p.referenceNumber,
          recordedBy: p.recordedBy || 'System',
          remarks: p.remarks,
          isAdvance: false
        });
      });
    }
    return history.sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const handleQtyChange = (partId, val) => {
    setQtyInputs({ ...qtyInputs, [partId]: val });
  };

  const handleIssuePart = async (partId) => {
    const qty = Number(qtyInputs[partId]) || 0;
    if (qty <= 0) {
      alert('Please enter a quantity greater than zero to issue.');
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/estimates/${estimate._id}/parts/issue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ partId, qtyToIssue: qty })
      });
      if (res.ok) {
        alert('Stock deducted and parts issued successfully!');
        setQtyInputs({ ...qtyInputs, [partId]: '' });
        fetchEstimate();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to issue parts.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReturnPart = async (partId) => {
    const qty = Number(qtyInputs[partId]) || 0;
    if (qty <= 0) {
      alert('Please enter a quantity greater than zero to return.');
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/estimates/${estimate._id}/parts/return`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ partId, qtyToReturn: qty })
      });
      if (res.ok) {
        alert('Parts returned and inventory restocked successfully!');
        setQtyInputs({ ...qtyInputs, [partId]: '' });
        fetchEstimate();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to return parts.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (jc) {
      setModalData({
        technicianRemarks: jc.technicianRemarks || '',
        estimatedCompletionDate: jc.estimatedCompletionDate ? jc.estimatedCompletionDate.split('T')[0] : '',
        jobProgress: jc.jobProgress || 0,
        qcRemarks: jc.qcRemarks || '',
        qcStatus: jc.qcStatus || ''
      });
    }
  }, [jc, showUpdateModal]);

  const fetchEstimate = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/estimates?jobCardId=${jcId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const approved = data.find(e => e.status === 'Approved') || data[0];
          setEstimate(approved);
        } else {
          setEstimate(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDetails = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/jobcards/${jcId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setJc(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
    fetchEstimate();
    fetchInvoice();
  }, [jcId]);

  const updateFields = async (updates) => {
    setUpdating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/jobcards/${jcId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        fetchDetails();
      } else {
        const errObj = await res.json().catch(() => ({}));
        alert(errObj.error || 'Failed to update job card.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to the server.');
    } finally {
      setUpdating(false);
    }
  };

  const updateStatus = async (nextStatus) => {
    await updateFields({ status: nextStatus });
  };

  const handleModalSave = async (e) => {
    e.preventDefault();
    const updates = { ...modalData };
    if (jc.status === 'Quality Check') {
      if (modalData.qcStatus === 'Fail' || modalData.qcStatus === 'Rework Required') {
        updates.status = 'Work In Progress';
      } else if (modalData.qcStatus === 'Pass') {
        updates.status = 'Ready for Delivery';
      }
    }
    await updateFields(updates);
    setShowUpdateModal(false);
  };

  const printGatePass = () => {
    if (!jc) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/jobcards/${jc._id}/gatepass/pdf`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to retrieve Gate Pass PDF from server');
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
      } catch (err) {
        console.error(err);
        alert('Error viewing Gate Pass PDF: ' + err.message);
      }
    })();
  };

  if (loading) {
    return <div className="p-8 text-center text-sm font-semibold text-slate-400">Loading details...</div>;
  }

  if (!jc) {
    return <div className="p-8 text-center text-red-500 font-semibold text-sm">Failed to load Job Card.</div>;
  }

  const formatKey = (str) => str.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());

  return (
    <div className="space-y-6 animate-fade-in p-1">
      {/* Action Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl print:hidden">
        <button
          onClick={onBack}
          className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 dark:bg-slate-800/80 px-3.5 py-2 rounded-xl transition-all"
        >
          &larr; Back to List
        </button>

        <div className="flex gap-2">
          {/* Status Update Buttons */}
          {jc.status === 'Created' && (
            <button
              onClick={() => updateStatus('Inspect Stage')}
              disabled={updating}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              Allot to Inspect Stage
            </button>
          )}
          {jc.status === 'Inspect Stage' && (
            <button
              onClick={onCreateEstimate}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <FileCheck className="w-4 h-4" /> Prepare Estimate
            </button>
          )}
          {jc.status === 'Estimation' && (
            <button
              onClick={() => updateStatus('Customer Approval')}
              disabled={updating}
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              Send for Customer Approval
            </button>
          )}
          {jc.status === 'Customer Approval' && (
            <button
              onClick={() => updateStatus('Work In Progress')}
              disabled={updating}
              className="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              Approve & Start Work
            </button>
          )}
          {jc.status === 'Work In Progress' && (
            <button
              onClick={() => {
                if (jc.workCategory === 'B/P' || jc.workCategory === 'Insurance Jobs') {
                  updateStatus('Body Shop');
                } else {
                  updateStatus('Quality Check');
                }
              }}
              disabled={updating}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              {(jc.workCategory === 'B/P' || jc.workCategory === 'Insurance Jobs') ? 'Submit to Body Shop' : 'Submit to Quality Check'}
            </button>
          )}
          {jc.status === 'Body Shop' && (
            <button
              onClick={() => {
                if (jc.workCategory === 'Insurance Jobs') {
                  updateStatus('Surveyor Approval');
                } else {
                  updateStatus('Quality Check');
                }
              }}
              disabled={updating}
              className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              {jc.workCategory === 'Insurance Jobs' ? 'Forward to Surveyor Approval' : 'Forward to Quality Check'}
            </button>
          )}
          {jc.status === 'Surveyor Approval' && (
            <button
              onClick={() => updateStatus('Repair')}
              disabled={updating}
              className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              Approve Surveyor Claim & Start Repair
            </button>
          )}
          {jc.status === 'Repair' && (
            <button
              onClick={() => updateStatus('Quality Check')}
              disabled={updating}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              Submit Repair to Quality Check
            </button>
          )}
          {jc.status === 'Quality Check' && (
            <button
              onClick={() => updateStatus('Ready for Delivery')}
              disabled={updating}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              Pass Quality Check
            </button>
          )}
          {jc.status === 'Ready for Delivery' && (
            <button
              onClick={onConvertInvoice}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all"
            >
              Generate Tax Invoice
            </button>
          )}

          {jc.status === 'Delivered' && (
            <button
              onClick={printGatePass}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all"
            >
              <Printer className="w-4 h-4" /> Print Gate Pass
            </button>
          )}

          {/* PDF & print operations */}
          <button
            onClick={(e) => {
              if (token === 'mock_jwt_token_for_offline_demo') {
                window.print();
              } else {
                (async () => {
                  try {
                    const res = await fetch(`${API_BASE_URL}/jobcards/${jc._id}/pdf`, {
                      headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (!res.ok) throw new Error('Failed to retrieve PDF from server');
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `jobcard-${jc.jobCardNo || 'latest'}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error(err);
                    alert('Error downloading PDF: ' + err.message);
                  }
                })();
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 text-slate-700 dark:text-slate-350 rounded-xl text-xs font-bold transition-all border border-slate-205/20"
          >
            <Download className="w-4 h-4" /> Download PDF
          </button>
          {['Work In Progress', 'Body Shop', 'Quality Check'].includes(jc.status) && (
            <button
              onClick={() => setShowUpdateModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10"
            >
              Update Work Log / QC
            </button>
          )}

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-350 rounded-xl text-xs font-bold transition-all border border-slate-205/20"
          >
            <Printer className="w-4 h-4" /> Print Card
          </button>
        </div>
      </div>

      {/* Main Print Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm print:shadow-none print:border-none print:p-0 space-y-8">
        
        {/* Brand Header */}
        <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-6">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-wider">MVSS AUTOMOBILES PRIVATE LIMITED</h2>
            <p className="text-xs text-slate-450 dark:text-slate-500 font-semibold mt-1">
              Sy. No. 25/1, Opp. Cine Planet, Beside PSR Convention, Kompally, Hyderabad - 500014. <br />
              PH. No. {OWNER_SUPPORT_NUMBER} | Email: accounts@auto4m.in
            </p>
          </div>
          <div className="text-right">
            <span className="inline-block bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100/50 text-indigo-700 dark:text-indigo-400 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider mb-2">
              Job Card: {jc.jobCardNo}
            </span>
            <p className="text-xs text-slate-400 font-semibold">Date: {new Date(jc.date).toLocaleDateString('en-IN')}</p>
            <p className="text-xs text-slate-400 font-semibold">Time: {jc.time}</p>
            <div className="text-xs text-slate-400 font-semibold mt-1.5 flex items-center justify-end gap-1.5 select-none">
              <span>Status:</span>
              {['Super Admin', 'Admin', 'Branch Manager', 'Service Advisor', 'Workshop Manager'].includes(user?.role) ? (
                <select
                  value={jc.status}
                  onChange={(e) => {
                    const nextStatus = e.target.value;
                    const confirmChange = window.confirm(`Are you sure you want to update the job card status to "${nextStatus}"?`);
                    if (confirmChange) {
                      updateStatus(nextStatus);
                    }
                  }}
                  className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-805 dark:text-white font-bold text-xs uppercase tracking-wider focus:outline-none"
                >
                  {[
                    'Waiting for Customer Approval',
                    'Parts Procuring',
                    'Work in Progress',
                    'Quality Test',
                    'Ready for Delivery',
                    'Delivered',
                    'Created',
                    'Inspect Stage',
                    'Estimation',
                    'Customer Approval',
                    'Work In Progress',
                    'Body Shop',
                    'Surveyor Approval',
                    'Repair',
                    'Quality Check',
                    'Closed'
                  ].map(statusOpt => (
                    <option key={statusOpt} value={statusOpt}>{statusOpt}</option>
                  ))}
                </select>
              ) : (
                <span className={`px-2 py-0.5 rounded font-extrabold text-[10px] uppercase border ${getStatusBadgeClass(jc.status)}`}>
                  {jc.status}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Customer, Vehicle & Staff Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 dark:bg-slate-950/10 p-5 rounded-2xl border border-slate-100 dark:border-slate-850">
          <div className="space-y-2">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <User className="w-4 h-4" /> Customer Information
            </h4>
            <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
              <p className="font-bold text-slate-900 dark:text-white text-sm">{jc.customerId?.name}</p>
              <p className="font-semibold">Mobile: {jc.customerId?.mobile}</p>
              <p className="font-semibold text-slate-500">Address: {jc.customerId?.address || 'N/A'}</p>
              {jc.contactPerson && <p className="font-semibold text-slate-500">Contact Person: {jc.contactPerson}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <Car className="w-4 h-4" /> Vehicle Details
            </h4>
            <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
              <p className="font-bold text-indigo-650 dark:text-indigo-400 text-sm font-mono tracking-wider">{jc.vehicleId?.vehicleNumber}</p>
              <p className="font-semibold">{jc.vehicleId?.make} {jc.vehicleId?.model} {jc.vehicleId?.variant}</p>
              <p className="font-semibold">Chassis No: <span className="font-mono">{jc.vehicleId?.chassisNumber || 'N/A'}</span></p>
              <p className="font-semibold">Engine No: <span className="font-mono">{jc.vehicleId?.engineNumber || 'N/A'}</span></p>
              <p className="font-bold text-slate-900 dark:text-white mb-2">Odometer: {jc.odometerReading.toLocaleString()} km</p>
              <p className="font-semibold">Service Type: {jc.serviceType || 'General Servicing'}</p>
              {jc.workCategory && (
                <p className="font-semibold">
                  Customer Type: <span className="font-bold text-slate-900 dark:text-white">
                    {jc.workCategory === 'RR' ? 'RR(Running repair)' :
                     jc.workCategory === 'PMS' ? 'pMS(periodical maintainence service)' :
                     jc.workCategory === 'B/P' ? 'body shop(bshop)' :
                     jc.workCategory === 'Corporate' ? 'corporate' :
                     jc.workCategory === 'General Service' ? 'General Service' :
                     jc.workCategory === 'Insurance Jobs' ? 'insurance' : jc.workCategory}
                  </span>
                </p>
              )}
              {jc.jobType && <p className="font-semibold">Job Type: <span className="font-bold text-slate-900 dark:text-white">{jc.jobType}</span></p>}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <Users className="w-4 h-4" /> Staff Assignment
            </h4>
            <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
              <p className="font-semibold text-slate-550">Service Advisor: <span className="font-bold text-slate-900 dark:text-white">{jc.serviceAdvisorName || 'N/A'}</span></p>
              <p className="font-semibold text-slate-550">Technician: <span className="font-bold text-slate-900 dark:text-white">{jc.technicianName || 'N/A'}</span></p>
              <p className="font-semibold text-slate-550">Quality Checker (QC): <span className="font-bold text-slate-900 dark:text-white">{jc.qcName || 'N/A'}</span></p>
              <p className="font-semibold text-slate-550">Floor Incharge: <span className="font-bold text-slate-900 dark:text-white">{jc.floorInchargeName || 'N/A'}</span></p>
              {jc.jobProgress !== undefined && jc.jobProgress > 0 && (
                <p className="font-semibold text-slate-550">
                  Progress: <span className="font-extrabold text-indigo-650 dark:text-indigo-400">{jc.jobProgress}%</span>
                </p>
              )}
              {jc.estimatedCompletionDate && (
                <p className="font-semibold text-slate-550">
                  Est. Completion: <span className="font-bold text-slate-900 dark:text-white">{new Date(jc.estimatedCompletionDate).toLocaleDateString('en-IN')}</span>
                </p>
              )}
              {jc.qcStatus && (
                <p className="font-semibold text-slate-550">
                  QC Status: <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] uppercase ${
                    jc.qcStatus === 'Pass' 
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400' 
                      : 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400'
                  }`}>{jc.qcStatus}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 32 Inspection items Grid */}
        <div className="space-y-4">
          <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 border-b pb-2 uppercase tracking-wide">
            32 Servicing and Maintenance Checklist
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-xs">
            {Object.entries(jc.inspectionChecklist || {})
              .filter(([_, val]) => {
                if (!val) return false;
                if (typeof val === 'string') return val !== '';
                return val.status && val.status !== '';
              })
              .map(([key, val]) => {
                const status = typeof val === 'string' ? (val === 'OK' ? 'Yes' : val === 'Not OK' ? 'No' : val) : (val.status || '');
                const remarks = typeof val === 'string' ? '' : (val.remarks || '');
                const isPositive = status === 'Yes' || status === 'OK';
                
                return (
                  <div key={key} className="flex flex-col py-1.5 border-b border-slate-100 dark:border-slate-800/50 gap-0.5">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-700 dark:text-slate-350">{formatKey(key)}</span>
                      <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase ${
                        isPositive 
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400' 
                          : 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400'
                      }`}>
                        {status}
                      </span>
                    </div>
                    {remarks && (
                      <span className="text-[10px] text-slate-400 italic font-medium">
                        Remark: {remarks}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Accessories & Fuel Position */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 border-b pb-2 uppercase tracking-wide">Accessories Inventory</h4>
            <div className="flex flex-wrap gap-2 text-xs font-medium">
              {Object.entries(jc.accessories || {})
                .filter(([_, val]) => val === 'Yes' || (val && val !== 'No' && val !== '0'))
                .map(([key, val]) => (
                  <span key={key} className="bg-slate-100 dark:bg-slate-800 text-slate-655 dark:text-slate-400 px-2.5 py-1 rounded-lg">
                    {formatKey(key)}: <strong className="font-extrabold">{val}</strong>
                  </span>
                ))}
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 border-b pb-2 uppercase tracking-wide">Fuel needle & promised delivery</h4>
            <div className="grid grid-cols-2 gap-4 text-xs font-medium">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Fuel Level</span>
                <span className="text-sm font-black text-indigo-650 dark:text-indigo-400">
                  {jc.fuelLevel === 'E' ? 'Empty' : jc.fuelLevel === '1/2' ? 'Half' : jc.fuelLevel === 'F' ? 'Full' : jc.fuelLevel}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Estimated Repairs</span>
                <span className="text-sm font-black text-slate-800 dark:text-slate-200">₹{jc.estAmt?.toLocaleString()}</span>
              </div>
              <div className="col-span-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Promised Delivery</span>
                <span className="font-bold text-slate-750 dark:text-slate-300">
                  {jc.promDate ? new Date(jc.promDate).toLocaleDateString('en-IN') : 'TBD'} @ {jc.promTime || 'TBD'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Spares Allocation & Dispatch Section */}
        {estimate && estimate.parts && estimate.parts.length > 0 && (
          <div className="space-y-4 border-t border-slate-100 dark:border-slate-800 pt-6">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-850 pb-2">
              <h4 className="text-xs font-black text-slate-855 dark:text-slate-200 uppercase tracking-wide">
                Spares Dispatch & Inventory Allocation
              </h4>
              <span className="text-[10px] font-bold text-slate-400 font-mono">Estimate Ref: {estimate.estimateNo} ({estimate.status})</span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
                      <th className="p-4">Spare Part Name</th>
                      <th className="p-4 font-mono">Part Number</th>
                      <th className="p-4 text-center">Parts Required</th>
                      <th className="p-4 text-center text-indigo-650 dark:text-indigo-400 font-bold">Parts Issued</th>
                      <th className="p-4 text-center text-rose-650 dark:text-rose-455 font-bold">Parts Returned</th>
                      <th className="p-4 text-center font-bold">Stock Deduction</th>
                      <th className="p-4 text-right">Spares Allocation Dispatch Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {estimate.parts.map(part => {
                      const deduction = part.qtyIssued - part.qtyReturned;
                      const canIssueCount = part.qty - deduction;
                      const canReturnCount = deduction;

                      return (
                        <tr key={part._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all font-semibold">
                          <td className="p-4 font-bold text-slate-800 dark:text-slate-200">{part.name}</td>
                          <td className="p-4 font-mono text-slate-500">{part.partNo || '—'}</td>
                          <td className="p-4 text-center font-bold text-slate-700 dark:text-slate-300">{part.qty} units</td>
                          <td className="p-4 text-center font-bold text-indigo-600 dark:text-indigo-400">{part.qtyIssued} units</td>
                          <td className="p-4 text-center font-bold text-rose-600 dark:text-rose-450">{part.qtyReturned} units</td>
                          <td className="p-4 text-center">
                            <span className={`px-2 py-0.5 rounded font-extrabold text-[10px] ${
                              deduction > 0 ? 'bg-amber-50 text-amber-700 dark:bg-amber-955/20 dark:text-amber-400' : 'bg-slate-50 text-slate-400 dark:bg-slate-800'
                            }`}>
                              {deduction} units
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex gap-2 justify-end items-center">
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="Qty"
                                value={qtyInputs[part.partId] || ''}
                                onChange={(e) => handleQtyChange(part.partId, e.target.value.replace(/[^0-9]/g, ''))}
                                className="w-12 px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-center text-xs font-mono focus:outline-none"
                              />
                              <button
                                onClick={() => handleIssuePart(part.partId)}
                                disabled={canIssueCount <= 0}
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-600 dark:bg-emerald-950/20 dark:hover:bg-emerald-600 text-emerald-600 dark:text-emerald-450 hover:text-white dark:hover:text-white border border-emerald-100 dark:border-emerald-950/80 rounded text-[10px] font-bold transition-all disabled:opacity-40"
                              >
                                Issue
                              </button>
                              <button
                                onClick={() => handleReturnPart(part.partId)}
                                disabled={canReturnCount <= 0}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-600 dark:bg-rose-950/20 dark:hover:bg-rose-600 text-rose-600 dark:text-rose-450 hover:text-white dark:hover:text-white border border-rose-100 dark:border-rose-950/80 rounded text-[10px] font-bold transition-all disabled:opacity-40"
                              >
                                Return
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Notes & Remarks Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 border-t border-slate-100 dark:border-slate-800 pt-6">
          <div className="space-y-1 bg-slate-50 dark:bg-slate-950/20 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-850">
            <h4 className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Advisor Notes</h4>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold whitespace-pre-line min-h-[40px]">
              {jc.advisorNotes || 'No advisor notes.'}
            </p>
          </div>
          <div className="space-y-1 bg-slate-50 dark:bg-slate-950/20 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-850">
            <h4 className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Technician Notes</h4>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold whitespace-pre-line min-h-[40px]">
              {jc.technicianNotes || 'No technician notes.'}
            </p>
          </div>
          <div className="space-y-1 bg-slate-50 dark:bg-slate-950/20 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-850">
            <h4 className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Internal Remarks</h4>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold whitespace-pre-line min-h-[40px]">
              {jc.internalRemarks || 'No internal remarks.'}
            </p>
          </div>
          <div className="space-y-1 bg-slate-50 dark:bg-slate-950/20 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-850">
            <h4 className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Technician Remarks</h4>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold whitespace-pre-line min-h-[40px]">
              {jc.technicianRemarks || 'No technician remarks.'}
            </p>
          </div>
          <div className="space-y-1 bg-slate-50 dark:bg-slate-950/20 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-850">
            <h4 className="text-[10px] font-black text-slate-450 uppercase tracking-wider">QC Remarks</h4>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold whitespace-pre-line min-h-[40px]">
              {jc.qcRemarks || 'No QC remarks.'}
            </p>
          </div>
        </div>

        {/* Attached Photos / Documents Gallery */}
        {jc.photos && jc.photos.length > 0 && (
          <div className="space-y-4 border-t border-slate-100 dark:border-slate-800 pt-6 print:hidden animate-fade-in">
            <h4 className="text-xs font-black text-slate-800 dark:text-slate-205 uppercase tracking-wide">
              Attached Photos & Supporting Documents
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {jc.photos.map((photo, index) => {
                if (!photo || !photo.url) return null;
                const isAbsolute = photo.url.startsWith('http') || photo.url.startsWith('blob:') || photo.url.startsWith('data:');
                const hostname = window.location.hostname;
                const isCloud = hostname.includes('vercel.app') || hostname.includes('surge.sh') || hostname.includes('github.io') || hostname.includes('loca.lt') || hostname.includes('pinggy') || hostname.includes('lhr.life') || hostname.includes('ngrok');
                // const base = '';
                const src = isAbsolute ? photo.url : `${API_BASE_URL.replace('/api', '')}${photo.url}`;
                
                return (
                  <div key={index} className="relative group border border-slate-200 dark:border-slate-850 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-950 shadow-sm transition-all hover:shadow-md">
                    <div className="aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
                      {(photo.url.toLowerCase().endsWith('.pdf') || photo.photoType === 'Document') ? (
                        <div className="flex flex-col items-center justify-center p-4">
                          <FileText className="w-8 h-8 text-indigo-500" />
                          <span className="text-[10px] font-bold text-slate-500 mt-2">Document Copy</span>
                        </div>
                      ) : (
                        <img 
                          src={src} 
                          alt={`Attachment ${index + 1}`} 
                          className="w-full h-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-105"
                          onClick={() => window.open(src, '_blank')}
                        />
                      )}
                    </div>
                    <div className="p-2.5 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/80 flex justify-between items-center">
                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">
                        {photo.photoType || 'Photo'}
                      </span>
                      <a 
                        href={src} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-[9px] font-bold text-indigo-650 hover:text-indigo-700 uppercase"
                      >
                        View Full
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Damage markings & Complaints list */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 border-b pb-2 uppercase tracking-wide">Customer Complaints</h4>
            <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-350">
              {jc.complaints && jc.complaints.length > 0 ? (
                jc.complaints.map((c, i) => (
                  <p key={i} className="font-medium flex gap-2">
                    <span className="text-indigo-500 font-bold">{i+1}.</span> {c}
                  </p>
                ))
              ) : (
                <p className="text-slate-450 italic">No complaints registered.</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 border-b pb-2 uppercase tracking-wide">Damage Layout Markings</h4>
            <div className="space-y-1.5 text-xs">
              {jc.damageMarkings && jc.damageMarkings.length > 0 ? (
                jc.damageMarkings.map((m, i) => (
                  <p key={i} className="font-medium">
                    <span className="font-bold text-red-500">[{m.type}]</span> {m.description || 'No description notes'}
                  </p>
                ))
              ) : (
                <p className="text-slate-450 italic">No body damage marked.</p>
              )}
            </div>
          </div>
        </div>

        {/* Advance Payments Section */}
        <div className="border-t border-slate-150 dark:border-slate-800 pt-6 space-y-4 select-none">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h4 className="text-sm font-black text-slate-850 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-indigo-500" /> Advance Payments
              </h4>
              <p className="text-[11px] text-slate-450 font-semibold mt-0.5">Record and track deposit payments before final invoice generation</p>
            </div>
            
            {/* Summary Cards */}
            <div className="flex gap-4">
              <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850 px-3.5 py-2 rounded-xl text-right">
                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Advance Received</span>
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-450 font-mono">
                  ₹{getTotalAdvanceReceived().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850 px-3.5 py-2 rounded-xl text-right">
                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Estimated Balance Due</span>
                <span className="text-sm font-black text-slate-700 dark:text-white font-mono">
                  ₹{getEstimatedBalanceDue().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* List of Payments */}
            <div className="lg:col-span-2 space-y-2 max-h-60 overflow-y-auto pr-1">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wide mb-1">Advance Deposits History</span>
              {jc.advancePayments && jc.advancePayments.length > 0 ? (
                jc.advancePayments.map((payment, idx) => (
                  <div key={payment._id || idx} className="flex justify-between items-center bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-850 p-3 rounded-xl shadow-xs group">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-800 dark:text-white font-mono">₹{payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-100/50">
                          {payment.paymentMode}
                        </span>
                        {payment.transactionId && (
                          <span className="text-[10px] text-slate-450 dark:text-slate-500 font-mono">
                            Ref: {payment.transactionId}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 text-[10px] font-semibold text-slate-400">
                        <span>Date: {new Date(payment.paymentDate).toLocaleDateString('en-IN')}</span>
                        {payment.recordedBy && (
                          <>
                            <span>•</span>
                            <span>Recorded by: {payment.recordedBy}</span>
                          </>
                        )}
                        {payment.remarks && (
                          <>
                            <span>•</span>
                            <span className="italic text-slate-550">"{payment.remarks}"</span>
                          </>
                        )}
                      </div>
                    </div>
                    {['Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts'].includes(user?.role) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAdvance(payment._id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-550/10 p-1.5 rounded-lg transition-colors lg:opacity-0 lg:group-hover:opacity-100"
                        title="Delete advance record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-450 italic py-4">No advance payment transactions recorded for this Job Card.</p>
              )}
            </div>

            {/* Record Form */}
            {['Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts'].includes(user?.role) && (
              <form onSubmit={handleAddAdvance} className="bg-slate-50 dark:bg-slate-950/10 border border-slate-100 dark:border-slate-850 p-4 rounded-2xl space-y-3">
                <span className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b pb-1.5">Record New Deposit</span>
                
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Amount (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Amount"
                      value={advanceAmount}
                      onChange={(e) => setAdvanceAmount(e.target.value)}
                      required
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono font-black focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Advance Type</label>
                    <select
                      value={advanceType}
                      onChange={(e) => setAdvanceType(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-200"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Online">Online</option>
                      <option value="Card Swipe">Card Swipe</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Payment Mode</label>
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-205"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Online">Online</option>
                      <option value="Card Swipe">Card Swipe</option>
                      <option value="Scanner Payment (QR)">Scanner Payment (QR)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Transaction ID</label>
                    <input
                      type="text"
                      placeholder="Txn ID"
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Remarks</label>
                  <input
                    type="text"
                    placeholder="Reference remarks..."
                    value={advanceRemarks}
                    onChange={(e) => setAdvanceRemarks(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                  />
                </div>

                <button
                  type="submit"
                  disabled={addingAdvance}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
                >
                  {addingAdvance ? 'Saving...' : 'Add Advance Payment'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Final Payment / Balance Settlement Section */}
        <div className="border-t border-slate-150 dark:border-slate-800 pt-6 space-y-4 select-none">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h4 className="text-sm font-black text-slate-850 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-indigo-500" /> Final Payment / Balance Settlement
              </h4>
              <p className="text-[11px] text-slate-450 font-semibold mt-0.5">Process and settle the remaining balance for the job card</p>
            </div>
            
            {/* Live calculations */}
            <div className="flex gap-4">
              <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850 px-3.5 py-2 rounded-xl text-right">
                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Balance Payable</span>
                <span className="text-sm font-black text-amber-600 dark:text-amber-450 font-mono">
                  ₹{getBalancePayable().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850 px-3.5 py-2 rounded-xl text-right">
                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Pending Amount</span>
                <span className="text-sm font-black text-rose-600 dark:text-rose-450 font-mono">
                  ₹{getPendingAmount().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Form to Receive Payment */}
            <div className="lg:col-span-2">
              {['Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts'].includes(user?.role) && (
                <form onSubmit={handleAddFinalPayment} className="bg-slate-50 dark:bg-slate-950/10 border border-slate-100 dark:border-slate-850 p-4 rounded-2xl space-y-3">
                  <span className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b pb-1.5">Receive Final / Balance Payment</span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Final Bill Amount (Auto)</label>
                      <div className="w-full px-2.5 py-1.5 bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono font-black text-slate-650 dark:text-slate-350">
                        ₹{getFinalBillAmount().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Total Advance (Read-Only)</label>
                      <div className="w-full px-2.5 py-1.5 bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono font-black text-slate-650 dark:text-slate-350">
                        ₹{getTotalAdvanceReceived().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Balance Payable (Auto)</label>
                      <div className="w-full px-2.5 py-1.5 bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono font-black text-slate-750 dark:text-slate-250">
                        ₹{getBalancePayable().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Amount Received (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Amount"
                        value={finalAmount}
                        onChange={(e) => setFinalAmount(e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono font-black focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Payment Type</label>
                      <select
                        value={finalPaymentType}
                        onChange={(e) => setFinalPaymentType(e.target.value)}
                        className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-200"
                      >
                        <option value="Cash">Cash</option>
                        <option value="Online">Online</option>
                        <option value="Card Swipe">Card Swipe</option>
                        <option value="Scanner Payment">Scanner Payment</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Transaction ID</label>
                      <input
                        type="text"
                        placeholder="Txn ID"
                        value={finalTransactionId}
                        onChange={(e) => setFinalTransactionId(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Reference Number</label>
                      <input
                        type="text"
                        placeholder="Ref No / Auth Code"
                        value={finalReferenceNumber}
                        onChange={(e) => setFinalReferenceNumber(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Remarks</label>
                      <input
                        type="text"
                        placeholder="Remarks..."
                        value={finalRemarks}
                        onChange={(e) => setFinalRemarks(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={addingFinal}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" /> {addingFinal ? 'Processing...' : 'Receive Payment'}
                  </button>
                </form>
              )}
            </div>

            {/* Payment Summary */}
            <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-150 dark:border-slate-850 p-4 rounded-2xl space-y-3">
              <span className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b pb-1.5">Payment Summary</span>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-dashed border-slate-100 dark:border-slate-800">
                  <span className="font-semibold text-slate-400">Final Invoice Amount</span>
                  <span className="font-bold font-mono text-slate-800 dark:text-white">₹{getFinalBillAmount().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-dashed border-slate-100 dark:border-slate-800">
                  <span className="font-semibold text-slate-400">Advance Received</span>
                  <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">₹{getTotalAdvanceReceived().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-dashed border-slate-100 dark:border-slate-800">
                  <span className="font-semibold text-slate-400">Balance Received</span>
                  <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">₹{getTotalFinalPayments().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-dashed border-slate-100 dark:border-slate-800">
                  <span className="font-semibold text-slate-400">Total Received</span>
                  <span className="font-extrabold font-mono text-emerald-600 dark:text-emerald-400">₹{getTotalReceived().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-dashed border-slate-100 dark:border-slate-800">
                  <span className="font-semibold text-slate-400">Pending Amount</span>
                  <span className="font-extrabold font-mono text-rose-600 dark:text-rose-450">₹{getPendingAmount().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="font-semibold text-slate-400">Payment Status</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                    jc?.paymentStatus === 'Fully Paid' 
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-450 border-emerald-200/50' 
                      : jc?.paymentStatus === 'Partially Paid'
                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-450 border-amber-200/50'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-450 border-rose-200/50'
                  }`}>
                    {jc?.paymentStatus || 'Pending'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Transaction History */}
          <div className="space-y-2 select-none border-t border-slate-150 dark:border-slate-800 pt-4">
            <h5 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wide">Complete Payment History Log</h5>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-455">
                    <th className="py-2.5 px-3">Date & Time</th>
                    <th className="py-2.5 px-3">Payment Class</th>
                    <th className="py-2.5 px-3">Payment Mode</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3">Transaction / Ref ID</th>
                    <th className="py-2.5 px-3">Received By</th>
                    <th className="py-2.5 px-3">Remarks</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {getCombinedPaymentHistory().length > 0 ? (
                    getCombinedPaymentHistory().map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                        <td className="py-3 px-3 font-medium text-slate-500 whitespace-nowrap">
                          {new Date(p.date).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                            p.isAdvance 
                              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-100/50' 
                              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-450 border border-emerald-100/50'
                          }`}>
                            {p.type}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-350">
                          {p.mode}
                        </td>
                        <td className="py-3 px-3 text-right font-bold font-mono text-slate-800 dark:text-white whitespace-nowrap">
                          ₹{p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-500">
                          {p.txnId || 'N/A'}
                        </td>
                        <td className="py-3 px-3 text-slate-500 font-medium">
                          {p.recordedBy}
                        </td>
                        <td className="py-3 px-3 text-slate-450 italic max-w-xs truncate" title={p.remarks}>
                          {p.remarks || '-'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {['Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts'].includes(user?.role) && (
                            <button
                              type="button"
                              onClick={() => p.isAdvance ? handleDeleteAdvance(p.id) : handleDeleteFinalPayment(p.id)}
                              className="text-red-500 hover:text-red-700 p-1 rounded-lg transition-colors hover:bg-red-500/10"
                              title={`Delete ${p.type.toLowerCase()}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="8" className="py-4 text-center text-slate-450 italic">
                        No payment transactions (advance or final) recorded for this Job Card.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Signatures Block */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 border-t border-slate-100 dark:border-slate-800 pt-6">
          
          {/* Customer Signature box */}
          <div className="flex flex-col items-center justify-between border border-slate-100 dark:border-slate-800 p-4 rounded-2xl h-36">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Customer Signature</span>
            {jc.signatures?.customer ? (
              <img src={jc.signatures.customer} alt="Customer Sig" className="max-h-16 w-auto object-contain" />
            ) : (
              <span className="text-[10px] text-slate-400 italic">No signature logged</span>
            )}
            <span className="w-32 border-b border-slate-200 dark:border-slate-700" />
          </div>

          {/* Technician Signature box */}
          <div className="flex flex-col items-center justify-between border border-slate-100 dark:border-slate-800 p-4 rounded-2xl h-36">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Technician Signature</span>
            {jc.signatures?.technician ? (
              <img src={jc.signatures.technician} alt="Technician Sig" className="max-h-16 w-auto object-contain" />
            ) : (
              <span className="text-[10px] text-slate-400 italic">No signature logged</span>
            )}
            <span className="w-32 border-b border-slate-200 dark:border-slate-700" />
          </div>

          {/* Advisor Signature box */}
          <div className="flex flex-col items-center justify-between border border-slate-100 dark:border-slate-800 p-4 rounded-2xl h-36">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Service Advisor Signature</span>
            {jc.signatures?.advisor ? (
              <img src={jc.signatures.advisor} alt="Advisor Sig" className="max-h-16 w-auto object-contain" />
            ) : (
              <span className="text-[10px] text-slate-400 italic">No signature logged</span>
            )}
            <span className="w-32 border-b border-slate-200 dark:border-slate-700" />
          </div>

        </div>

      </div>

      {showUpdateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in print:hidden">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 overflow-y-auto max-h-[90vh]">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider border-b pb-2">
              Update Job Card Work Log / QC
            </h3>
            
            <form onSubmit={handleModalSave} className="space-y-4 text-xs font-semibold text-slate-600 dark:text-slate-400">
              
              {/* If WIP or Body Shop stage */}
              {['Work In Progress', 'Body Shop'].includes(jc.status) && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">Technician Remarks</label>
                    <textarea
                      rows="3"
                      value={modalData.technicianRemarks}
                      onChange={(e) => setModalData({ ...modalData, technicianRemarks: e.target.value })}
                      placeholder="e.g. Completed engine tuning, currently inspecting brake pads..."
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 resize-none font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">Job Progress (0-100%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={modalData.jobProgress}
                        onChange={(e) => setModalData({ ...modalData, jobProgress: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">Est. Completion Date</label>
                      <input
                        type="date"
                        value={modalData.estimatedCompletionDate}
                        onChange={(e) => setModalData({ ...modalData, estimatedCompletionDate: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 font-bold"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* If Quality Check stage */}
              {jc.status === 'Quality Check' && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">QC Remarks / Comments</label>
                    <textarea
                      rows="3"
                      value={modalData.qcRemarks}
                      onChange={(e) => setModalData({ ...modalData, qcRemarks: e.target.value })}
                      placeholder="Log quality checking notes or details of rework required..."
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 resize-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">QC Status Check</label>
                    <select
                      value={modalData.qcStatus}
                      onChange={(e) => setModalData({ ...modalData, qcStatus: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 font-bold text-slate-800 dark:text-slate-250"
                      required
                    >
                      <option value="">-- Select QC Verification --</option>
                      <option value="Pass">Pass (Ready for Delivery)</option>
                      <option value="Fail">Fail (Revert to Work In Progress)</option>
                      <option value="Rework Required">Rework Required (Revert to WIP)</option>
                    </select>
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowUpdateModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md shadow-indigo-600/10 disabled:opacity-50"
                >
                  Save Log Updates
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
      {/* Job Card Status History Timeline */}
      {jc && jc.statusHistory && jc.statusHistory.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs mt-6 select-none">
          <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-indigo-500" /> Job Card Workflow Status History
          </h4>
          <div className="relative pl-6 border-l-2 border-indigo-100 dark:border-indigo-950 space-y-5">
            {jc.statusHistory.map((history, idx) => (
              <div key={idx} className="relative">
                {/* Timeline Dot */}
                <div className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white dark:border-slate-900 shadow-sm" />
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] uppercase border ${getStatusBadgeClass(history.status)}`}>
                      {history.status}
                    </span>
                    {history.changedBy && (
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        by {history.changedBy}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 font-mono">
                    {new Date(history.changedAt).toLocaleString('en-IN')}
                  </span>
                </div>
                {history.remarks && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1 pl-1 bg-slate-50 dark:bg-slate-850 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    Remarks: {history.remarks}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
