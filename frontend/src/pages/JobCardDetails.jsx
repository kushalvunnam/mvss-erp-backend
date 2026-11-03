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
  CreditCard,
  Wrench,
  PenTool,
  X
} from 'lucide-react';
import BodyShopStatusModal, { BODY_SHOP_STAGES } from '../components/BodyShopStatusModal';
import SignaturePad from '../components/SignaturePad';

const formatStatusLabel = (status, jc) => {
  if (['Quality Test', 'Quality Check', 'Final Quality Inspection', 'Pre-Delivery Inspection'].includes(status)) {
    return 'Pre-Delivery Inspection (PDI)';
  }
  if (status === 'Body Shop') {
    const stage = jc?.bodyShopStatus || jc?.bodyShopStage;
    return stage ? `Body Shop (${stage})` : 'Body Shop';
  }
  return status;
};

const getStatusBadgeClass = (status) => {
  if (status && (status.startsWith('Body Shop') || status.startsWith('🚗 Body Shop'))) {
    return 'bg-fuchsia-50 dark:bg-fuchsia-950/30 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-300/50';
  }
  switch (status) {
    case 'Created':
      return 'bg-slate-50 dark:bg-slate-950/20 text-slate-700 dark:text-slate-400 border-slate-200/50';
    case 'Inspect Stage':
      return 'bg-sky-50 dark:bg-sky-950/20 text-sky-700 dark:text-sky-400 border-sky-200/50';
    case 'Estimation':
      return 'bg-teal-50 dark:bg-teal-950/20 text-teal-700 dark:text-teal-400 border-teal-200/50';
    case 'Waiting for Customer Approval':
    case 'Customer Approval':
      return 'bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-400 border-purple-200/50';
    case 'Waiting for Allotment':
      return 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200/50';
    case 'Allotted':
      return 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 border-indigo-200/50';
    case 'Parts Procuring':
      return 'bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-400 border-orange-200/50';
    case 'Work In Progress':
    case 'Work in Progress':
      return 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-200/50';
    case 'Body Shop':
      return 'bg-fuchsia-50 dark:bg-fuchsia-950/30 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-300/50';
    case 'Quality Check':
    case 'Quality Test':
    case 'Final Quality Inspection':
    case 'Pre-Delivery Inspection':
      return 'bg-yellow-50 dark:bg-yellow-950/20 text-yellow-750 dark:text-yellow-450 border border-yellow-200/50';
    case 'Ready for Delivery':
    case 'Vehicle Ready':
      return 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border-green-200/50';
    case 'Delivered – Payment Pending':
    case 'Delivered - Payment Pending':
      return 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border border-amber-300/50';
    case 'Delivered':
    case 'Closed':
      return 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50';
    default:
      return 'bg-slate-50 dark:bg-slate-950/20 text-slate-700 dark:text-slate-400 border-slate-200/50';
  }
};

export default function JobCardDetails({ jcId, token, user, onBack, onCreateEstimate, onViewEstimate, onConvertInvoice }) {
  const [jc, setJc] = useState(null);
  const [brokenImages, setBrokenImages] = useState({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [qtyInputs, setQtyInputs] = useState({});
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showBodyShopModal, setShowBodyShopModal] = useState(false);
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

  const [showWaiverModal, setShowWaiverModal] = useState(false);
  const [waiverAmount, setWaiverAmount] = useState('');
  const [waiverReason, setWaiverReason] = useState('');
  const [waiverCategory, setWaiverCategory] = useState('Customer Negotiation');
  const [waiverApprovedBy, setWaiverApprovedBy] = useState('');
  const [waiverRemarks, setWaiverRemarks] = useState('');
  const [waiving, setWaiving] = useState(false);
  const [reversing, setReversing] = useState(false);

  // Delivery with Pending Payment Modal state
  const [showDeliveryPendingModal, setShowDeliveryPendingModal] = useState(false);
  const [deliveryStaffName, setDeliveryStaffName] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [deliveryCreditDueDate, setDeliveryCreditDueDate] = useState('');
  const [deliveryRemarks, setDeliveryRemarks] = useState('');
  const [submittingDelivery, setSubmittingDelivery] = useState(false);

  // UPI Configuration State
  const [upiConfig, setUpiConfig] = useState({
    businessVpa: 'auto4m@icici',
    businessName: 'MVSS Automobiles',
    isConfigured: true
  });
  const [copiedVpa, setCopiedVpa] = useState(false);
  const [signatureModal, setSignatureModal] = useState({
    isOpen: false,
    type: 'customer',
    label: 'Customer Signature',
    dataUrl: ''
  });
  const [savingSignature, setSavingSignature] = useState(false);

  const handleOpenSignatureModal = (type, label) => {
    setSignatureModal({
      isOpen: true,
      type,
      label,
      dataUrl: jc?.signatures?.[type] || ''
    });
  };

  const handleSaveSignature = async (dataUrl) => {
    if (!dataUrl) return;
    setSavingSignature(true);
    try {
      const res = await fetch(`${API_BASE_URL}/jobcards/${jcId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          signatures: {
            ...(jc?.signatures || {}),
            [signatureModal.type]: dataUrl
          }
        })
      });
      if (res.ok) {
        setJc(prev => ({
          ...prev,
          signatures: {
            ...(prev?.signatures || {}),
            [signatureModal.type]: dataUrl
          }
        }));
        setSignatureModal({ isOpen: false, type: '', label: '', dataUrl: '' });
      } else {
        const err = await res.json();
        alert('Failed to save signature: ' + (err.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Network error saving signature: ' + err.message);
    } finally {
      setSavingSignature(false);
    }
  };

  useEffect(() => {
    fetch(`${API_BASE_URL}/jobcards/upi-config`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.businessVpa) {
          setUpiConfig(data);
        }
      })
      .catch(() => {});
  }, [token]);

  const getUpiUri = (amt) => {
    if (!upiConfig?.businessVpa) return '';
    const vpa = upiConfig.businessVpa.trim();
    const name = encodeURIComponent(upiConfig.businessName || 'MVSS Automobiles');
    const validAmt = Number(amt) > 0 ? Number(amt).toFixed(2) : '';
    const jcNo = encodeURIComponent(jc?.jobCardNo || 'Service Payment');
    return `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${name}${validAmt ? `&am=${validAmt}` : ''}&cu=INR&tn=${jcNo}`;
  };

  const handleCopyVpa = (vpa) => {
    if (!vpa) return;
    try {
      navigator.clipboard?.writeText(vpa);
      setCopiedVpa(true);
      setTimeout(() => setCopiedVpa(false), 2000);
    } catch (_) {}
  };

  const getEffectivePaymentMode = (payment) => {
    if (!payment) return 'Cash';
    const remarks = payment.remarks || '';
    const match = remarks.match(/\[Mode:\s*([^\]]+)\]/);
    if (match && match[1]) {
      return match[1].trim();
    }
    const rawMode = payment.paymentMode || payment.paymentType || payment.type;
    if (!rawMode) return 'Cash';
    if (rawMode === 'Scanner Payment (QR)' || rawMode === 'Scanner Payment') return 'QR / Scanner Payment';
    if (rawMode === 'Card Swipe') return 'Card';
    return rawMode;
  };

  const getCleanPaymentRemarks = (remarks) => {
    if (!remarks) return '';
    return remarks.replace(/\[Mode:\s*[^\]]+\]\s*/g, '').trim();
  };

  const handleAddAdvance = async (e) => {
    e.preventDefault();
    if (!advanceAmount || parseFloat(advanceAmount) <= 0) {
      alert('Please enter a valid advance amount.');
      return;
    }
    setAddingAdvance(true);
    try {
      const selectedMode = paymentMode || advanceType || 'Cash';
      const cleanRemarks = (advanceRemarks || '').trim();
      const cleanTxnId = (transactionId || '').trim();

      // First attempt with primary modern payment modes
      let res = await fetch(`${API_BASE_URL}/jobcards/${jcId}/advance-payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parseFloat(advanceAmount),
          type: selectedMode,
          paymentMode: selectedMode,
          transactionId: cleanTxnId,
          remarks: cleanRemarks
        })
      });

      // If server returned 400 (e.g. running legacy backend schema enum constraints),
      // seamlessly retry using legacy-compatible schema values so workshop operations never stall
      if (!res.ok && res.status === 400 && selectedMode !== 'Cash') {
        const legacyType = (selectedMode === 'Card') ? 'Card Swipe' : 'Online';
        const legacyMode = (selectedMode === 'Card')
          ? 'Card Swipe'
          : (selectedMode === 'QR / Scanner Payment' ? 'Scanner Payment (QR)' : 'Online');

        const fallbackRemarks = cleanRemarks 
          ? `[Mode: ${selectedMode}] ${cleanRemarks}`
          : `[Mode: ${selectedMode}]`;

        res = await fetch(`${API_BASE_URL}/jobcards/${jcId}/advance-payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            amount: parseFloat(advanceAmount),
            type: legacyType,
            paymentMode: legacyMode,
            transactionId: cleanTxnId,
            remarks: fallbackRemarks
          })
        });
      }

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
      const selectedType = finalPaymentType || 'Cash';
      const cleanRemarks = (finalRemarks || '').trim();
      const cleanTxnId = (finalTransactionId || '').trim();
      const cleanRef = (finalReferenceNumber || '').trim();

      let res = await fetch(`${API_BASE_URL}/jobcards/${jcId}/final-payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parseFloat(finalAmount),
          paymentType: selectedType,
          transactionId: cleanTxnId,
          referenceNumber: cleanRef,
          remarks: cleanRemarks
        })
      });

      // If backend returns HTTP 400 (e.g. running legacy backend schema enum constraints),
      // seamlessly retry using legacy-compatible schema values so workshop operations never stall
      if (!res.ok && res.status === 400 && selectedType !== 'Cash') {
        const legacyType = (selectedType === 'Card') 
          ? 'Card Swipe' 
          : (['UPI', 'QR / Scanner Payment'].includes(selectedType) ? 'Scanner Payment' : 'Online');

        const fallbackRemarks = cleanRemarks 
          ? `[Mode: ${selectedType}] ${cleanRemarks}`
          : `[Mode: ${selectedType}]`;

        res = await fetch(`${API_BASE_URL}/jobcards/${jcId}/final-payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            amount: parseFloat(finalAmount),
            paymentType: legacyType,
            transactionId: cleanTxnId,
            referenceNumber: cleanRef,
            remarks: fallbackRemarks
          })
        });
      }

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

  const handleRecordWaiver = async (e) => {
    if (e) e.preventDefault();
    if (!waiverAmount || parseFloat(waiverAmount) <= 0) {
      alert('Please enter a valid positive waiver amount.');
      return;
    }
    if (!waiverReason || !waiverReason.trim()) {
      alert('Please enter a valid waiver reason.');
      return;
    }
    const maxAllowed = getFinalBillAmount() > 0 ? getOutstandingBalance() : getEstimatedBalanceDue();
    if (parseFloat(waiverAmount) > (maxAllowed + 0.05)) {
      alert(`Waiver amount (₹${parseFloat(waiverAmount).toFixed(2)}) cannot exceed the remaining balance of ₹${maxAllowed.toFixed(2)}.`);
      return;
    }
    setWaiving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/jobcards/${jcId}/waive-off`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parseFloat(waiverAmount),
          waivedAmount: parseFloat(waiverAmount),
          reason: waiverReason.trim(),
          category: waiverCategory || 'Customer Negotiation',
          approvedBy: (waiverApprovedBy && waiverApprovedBy.trim()) || user?.name || 'Authorized Staff',
          remarks: (waiverRemarks || '').trim()
        })
      });
      if (res.ok) {
        setShowWaiverModal(false);
        setWaiverAmount('');
        setWaiverReason('');
        setWaiverCategory('Customer Negotiation');
        setWaiverApprovedBy('');
        setWaiverRemarks('');
        refreshPaymentData();
      } else {
        const errObj = await res.json().catch(() => ({}));
        alert(errObj.error || 'Failed to record balance waiver.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to the server.');
    } finally {
      setWaiving(false);
    }
  };

  const handleReverseWaiver = async (waiverId) => {
    const reason = window.prompt('Please enter mandatory reason for reversing this approved waiver:');
    if (reason === null) return; // user cancelled
    if (!reason || !reason.trim()) {
      alert('Reversal reason is required to cancel an approved waiver.');
      return;
    }
    setReversing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/jobcards/${jcId}/waivers/${waiverId}/reverse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          reversalReason: reason.trim()
        })
      });
      if (res.ok) {
        alert('Waiver reversed successfully. Outstanding balance restored.');
        refreshPaymentData();
      } else {
        const errObj = await res.json().catch(() => ({}));
        alert(errObj.error || 'Failed to reverse waiver.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to the server.');
    } finally {
      setReversing(false);
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

  const getEstimatedRepairAmount = () => {
    const amt = jc?.financialSummary?.estimatedRepairAmount !== undefined && jc.financialSummary.estimatedRepairAmount > 0
      ? jc.financialSummary.estimatedRepairAmount
      : (jc?.estAmt || (estimate ? (estimate.totals?.roundedGrandTotal || estimate.totals?.grandTotal || 0) : 0));
    return Math.round((Number(amt || 0) + Number.EPSILON) * 100) / 100;
  };

  const getFinalBillAmount = () => {
    const amt = invoice ? (invoice.totals?.roundedGrandTotal || invoice.totals?.grandTotal || 0) : (jc?.financialSummary?.finalBillAmount !== undefined ? jc.financialSummary.finalBillAmount : (jc?.billingSummary?.grandTotal || 0));
    return Math.round((Number(amt || 0) + Number.EPSILON) * 100) / 100;
  };

  const getTotalAdvanceReceived = () => {
    const total = jc?.advancePayments ? jc.advancePayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) : 0;
    return Math.round((Number(total || 0) + Number.EPSILON) * 100) / 100;
  };

  const getEstimatedBalanceDue = () => {
    const estAmt = getEstimatedRepairAmount();
    const totalAdvance = getTotalAdvanceReceived();
    const totalWaived = getTotalActiveWaived();
    const balance = estAmt - totalWaived - totalAdvance;
    return balance > 0 ? Math.round((balance + Number.EPSILON) * 100) / 100 : 0;
  };

  const getEstimatedAdvanceExcess = () => {
    const estAmt = getEstimatedRepairAmount();
    const totalAdvance = getTotalAdvanceReceived();
    const totalWaived = getTotalActiveWaived();
    const netEst = Math.max(0, estAmt - totalWaived);
    if (totalAdvance > (netEst + 0.05)) {
      return Math.round((totalAdvance - netEst + Number.EPSILON) * 100) / 100;
    }
    return 0;
  };

  const getTotalFinalPayments = () => {
    const total = jc?.finalPayments ? jc.finalPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) : 0;
    return Math.round((Number(total || 0) + Number.EPSILON) * 100) / 100;
  };

  const getTotalReceived = () => {
    return Math.round((getTotalAdvanceReceived() + getTotalFinalPayments() + Number.EPSILON) * 100) / 100;
  };

  const getTotalActiveWaived = () => {
    if (Array.isArray(jc?.waivers) && jc.waivers.length > 0) {
      const sum = jc.waivers
        .filter(w => w.status !== 'Reversed')
        .reduce((acc, w) => acc + (Number(w.amount) || 0), 0);
      return Math.round((Number(sum || 0) + Number.EPSILON) * 100) / 100;
    }
    return (jc?.waiver && Number(jc.waiver.waivedAmount) > 0) ? Math.round((Number(jc.waiver.waivedAmount) + Number.EPSILON) * 100) / 100 : 0;
  };

  const getWaivedAmount = () => getTotalActiveWaived();

  const getNetAmountPayable = () => {
    const base = getFinalBillAmount() > 0 ? getFinalBillAmount() : getEstimatedRepairAmount();
    const net = Math.max(0, base - getTotalActiveWaived());
    return Math.round((net + Number.EPSILON) * 100) / 100;
  };

  const getOutstandingBalance = () => {
    if (getFinalBillAmount() > 0) {
      const bal = Math.max(0, getNetAmountPayable() - getTotalReceived());
      return bal <= 0.05 ? 0 : Math.round((bal + Number.EPSILON) * 100) / 100;
    }
    return getEstimatedBalanceDue();
  };

  const getBalancePayable = () => {
    if (getFinalBillAmount() > 0) {
      const bp = Math.max(0, getNetAmountPayable() - getTotalAdvanceReceived());
      return Math.round((bp + Number.EPSILON) * 100) / 100;
    }
    return getEstimatedBalanceDue();
  };

  const getPendingAmount = () => {
    return getOutstandingBalance();
  };

  const getCustomerCredit = () => {
    const bill = getFinalBillAmount();
    const received = getTotalReceived();
    if (bill > 0) {
      const netPayable = getNetAmountPayable();
      if (received > (netPayable + 0.05)) {
        return Math.round((received - netPayable + Number.EPSILON) * 100) / 100;
      }
    } else {
      return getEstimatedAdvanceExcess();
    }
    return 0;
  };

  const handleDownloadReceipt = async (paymentId) => {
    try {
      const url = `${API_BASE_URL}/jobcards/${jcId}/payment-receipt${paymentId ? `/${paymentId}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to download receipt');
        return;
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `receipt-${paymentId ? paymentId.slice(-6) : 'payment'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error(err);
      alert('Failed to download receipt.');
    }
  };

  const getCombinedPaymentHistory = () => {
    const history = [];
    if (jc?.advancePayments) {
      jc.advancePayments.forEach(p => {
        history.push({
          id: p._id,
          type: 'Advance Deposit',
          date: p.paymentDate,
          mode: getEffectivePaymentMode(p),
          amount: p.amount,
          txnId: p.transactionId,
          recordedBy: p.recordedBy || 'System',
          remarks: getCleanPaymentRemarks(p.remarks),
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
          mode: getEffectivePaymentMode(p),
          amount: p.amount,
          txnId: p.transactionId || p.referenceNumber,
          recordedBy: p.recordedBy || 'System',
          remarks: getCleanPaymentRemarks(p.remarks),
          isAdvance: false
        });
      });
    }
    if (Array.isArray(jc?.waivers) && jc.waivers.length > 0) {
      jc.waivers.forEach((w, idx) => {
        history.push({
          id: w._id || `waiver-${idx}`,
          waiverId: w._id,
          type: w.status === 'Reversed' ? 'Waiver (Reversed)' : 'Balance Waiver',
          date: w.createdAt || new Date(),
          mode: w.category || 'Waived Off',
          amount: w.amount,
          txnId: w.status === 'Reversed' ? 'REVERSED' : 'WAIVER',
          recordedBy: w.approvedBy || 'System',
          remarks: w.status === 'Reversed'
            ? `${w.reason} (Reversed by ${w.reversedBy || 'Staff'}: ${w.reversalReason || ''})`
            : (w.remarks ? `${w.reason} - ${w.remarks}` : w.reason),
          isAdvance: false,
          isWaiver: true,
          waiverStatus: w.status
        });
      });
    } else if (jc?.waiver && jc.waiver.waivedAmount > 0) {
      history.push({
        id: 'waiver-' + jc._id,
        type: 'Balance Waiver',
        date: jc.waiver.waivedAt || new Date(),
        mode: jc.waiver.category || 'Waived Off',
        amount: jc.waiver.waivedAmount,
        txnId: 'WAIVER',
        recordedBy: jc.waiver.approvedBy || 'System',
        remarks: jc.waiver.reason,
        isAdvance: false,
        isWaiver: true,
        waiverStatus: 'Active'
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
        const updated = await res.json().catch(() => null);
        if (updated && updated._id) {
          setJc(updated);
        }
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

  const handlePassPDI = async () => {
    setUpdating(true);
    try {
      // Step 1: Persist QC Pass to database first
      const qcRes = await fetch(`${API_BASE_URL}/jobcards/${jcId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          qcStatus: 'Pass',
          qcRemarks: jc.qcRemarks || 'Pre-Delivery Inspection Passed'
        })
      });

      if (!qcRes.ok) {
        const errObj = await qcRes.json().catch(() => ({}));
        alert(errObj.error || 'Failed to record inspection pass.');
        return;
      }

      // Step 2: Now transition status to Ready for Delivery
      const statusRes = await fetch(`${API_BASE_URL}/jobcards/${jcId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status: 'Ready for Delivery',
          qcStatus: 'Pass'
        })
      });

      if (statusRes.ok) {
        const updated = await statusRes.json().catch(() => null);
        if (updated && updated._id) setJc(updated);
        fetchDetails();
      } else {
        const errObj = await statusRes.json().catch(() => ({}));
        alert(errObj.error || 'Failed to update job card status.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to the server.');
    } finally {
      setUpdating(false);
    }
  };

  const handlePassFQI = handlePassPDI;

  const openDeliveryPendingModal = () => {
    setDeliveryStaffName(jc?.deliveredBy?.name || user?.name || '');
    setDeliveryDate(new Date().toISOString().split('T')[0]);
    setDeliveryTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    const isCorp = jc?.customerId?.type === 'Corporate' || Boolean(jc?.customerId?.companyName);
    if (isCorp) {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setDeliveryCreditDueDate(d.toISOString().split('T')[0]);
    } else {
      setDeliveryCreditDueDate('');
    }
    setDeliveryRemarks('');
    setShowDeliveryPendingModal(true);
  };

  const handleConfirmDeliveryPending = async (e) => {
    e.preventDefault();
    setSubmittingDelivery(true);
    try {
      const res = await fetch(`${API_BASE_URL}/jobcards/${jcId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status: 'Delivered – Payment Pending',
          deliveredBy: {
            name: deliveryStaffName || user?.name || 'Workshop Staff',
            date: deliveryDate ? new Date(deliveryDate) : new Date(),
            time: deliveryTime || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          },
          creditDueDate: deliveryCreditDueDate ? new Date(deliveryCreditDueDate) : undefined,
          statusRemarks: deliveryRemarks || 'Delivered with pending payment'
        })
      });
      if (res.ok) {
        setShowDeliveryPendingModal(false);
        fetchDetails();
      } else {
        const errObj = await res.json().catch(() => ({}));
        alert(errObj.error || 'Failed to update delivery status.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error connecting to the server.');
    } finally {
      setSubmittingDelivery(false);
    }
  };

  const handleModalSave = async (e) => {
    e.preventDefault();
    if (['Quality Test', 'Quality Check', 'Final Quality Inspection', 'Pre-Delivery Inspection'].includes(jc.status)) {
      if (!modalData.qcStatus) {
        alert('Please select a Pre-Delivery Inspection result (Pass, Fail, or Rework Required).');
        return;
      }

      setUpdating(true);
      try {
        // Step 1: Save QC inspection result and remarks first
        const qcRes = await fetch(`${API_BASE_URL}/jobcards/${jcId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            qcStatus: modalData.qcStatus,
            qcRemarks: modalData.qcRemarks
          })
        });

        if (!qcRes.ok) {
          const errObj = await qcRes.json().catch(() => ({}));
          alert(errObj.error || 'Failed to save inspection result.');
          return;
        }

        // Step 2: Transition status based on inspection outcome
        let nextStatus = jc.status;
        if (modalData.qcStatus === 'Pass') {
          nextStatus = 'Ready for Delivery';
        } else if (modalData.qcStatus === 'Fail' || modalData.qcStatus === 'Rework Required') {
          nextStatus = 'Work in Progress';
        }

        if (nextStatus !== jc.status) {
          const statusRes = await fetch(`${API_BASE_URL}/jobcards/${jcId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              status: nextStatus,
              qcStatus: modalData.qcStatus
            })
          });

          if (statusRes.ok) {
            const updated = await statusRes.json().catch(() => null);
            if (updated && updated._id) setJc(updated);
          } else {
            const errObj = await statusRes.json().catch(() => ({}));
            alert(errObj.error || 'Failed to advance job card status.');
          }
        } else {
          const updated = await qcRes.json().catch(() => null);
          if (updated && updated._id) setJc(updated);
        }

        fetchDetails();
        setShowUpdateModal(false);
      } catch (err) {
        console.error(err);
        alert('Failed to connect to the server.');
      } finally {
        setUpdating(false);
      }
      return;
    }

    await updateFields(modalData);
    setShowUpdateModal(false);
  };

  const printGatePass = () => {
    if (!jc) return;
    const url = `${API_BASE_URL}/jobcards/${jc._id}/gatepass/pdf?token=${encodeURIComponent(token)}`;
    window.open(url, '_blank');
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
          {['Customer Approval', 'Waiting for Customer Approval'].includes(jc.status) && (
            <button
              onClick={() => updateStatus('Waiting for Allotment')}
              disabled={updating}
              className="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              Customer Approved &rarr; Move to Waiting for Allotment
            </button>
          )}
          {jc.status === 'Waiting for Allotment' && (
            <button
              onClick={() => updateStatus('Allotted')}
              disabled={updating}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              Allot Job Card
            </button>
          )}
          {jc.status === 'Allotted' && (
            <div className="flex gap-2">
              <button
                onClick={() => updateStatus('Parts Procuring')}
                disabled={updating}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              >
                Procure Parts
              </button>
              <button
                onClick={() => updateStatus('Work In Progress')}
                disabled={updating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              >
                Start Work (WIP)
              </button>
            </div>
          )}
          {jc.status === 'Parts Procuring' && (
            <button
              onClick={() => updateStatus('Work In Progress')}
              disabled={updating}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              Parts Received &rarr; Start Work
            </button>
          )}
          {['Work In Progress', 'Work in Progress'].includes(jc.status) && (
            <button
              onClick={() => updateStatus('Quality Test')}
              disabled={updating}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              Submit to Pre-Delivery Inspection (PDI)
            </button>
          )}
          {(jc.status === 'Body Shop' || jc.workCategory === 'B/P') && (
            <button
              onClick={() => setShowBodyShopModal(true)}
              disabled={updating}
              className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-fuchsia-600/15"
              title="Manage Body Shop Stage"
            >
              🚗 Body Shop Stage: {jc.bodyShopStatus || jc.bodyShopStage || 'Vehicle Reported'} ▾
            </button>
          )}
          {jc.status === 'Body Shop' && (
            <button
              onClick={() => updateStatus('Quality Test')}
              disabled={updating}
              className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              Forward to Pre-Delivery Inspection (PDI)
            </button>
          )}
          {jc.status === 'Surveyor Approval' && (
            <button
              onClick={() => updateStatus('Quality Test')}
              disabled={updating}
              className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              Forward to Pre-Delivery Inspection (PDI)
            </button>
          )}
          {jc.status === 'Repair' && (
            <button
              onClick={() => updateStatus('Quality Test')}
              disabled={updating}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              Submit Repair to Pre-Delivery Inspection (PDI)
            </button>
          )}
          {['Quality Test', 'Quality Check', 'Final Quality Inspection', 'Pre-Delivery Inspection'].includes(jc.status) && (
            <>
              <button
                onClick={() => setShowUpdateModal(true)}
                disabled={updating}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              >
                Record Inspection Result
              </button>
              <button
                onClick={handlePassPDI}
                disabled={updating}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              >
                Pass Pre-Delivery Inspection (PDI)
              </button>
            </>
          )}
          {(jc.status === 'Ready for Delivery' || jc.status === 'Vehicle Ready') && (
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
                    setTimeout(() => {
                      document.body.removeChild(a);
                      window.URL.revokeObjectURL(url);
                    }, 200);
                  } catch (err) {
                    console.error(err);
                    window.open(`${API_BASE_URL}/jobcards/${jc._id}/pdf?token=${encodeURIComponent(token)}`, '_blank');
                  }
                })();
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 text-slate-700 dark:text-slate-350 rounded-xl text-xs font-bold transition-all border border-slate-205/20"
          >
            <Download className="w-4 h-4" /> Download PDF
          </button>
          {['Work In Progress', 'Work in Progress', 'Body Shop', 'Allotted'].includes(jc.status) && (
            <button
              onClick={() => setShowUpdateModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10"
            >
              Update Work Log
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
            <p className="text-xs text-slate-455 dark:text-slate-500 font-semibold mt-1">
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
              {['Super Admin', 'Admin', 'Branch Manager', 'Service Advisor', 'Workshop Manager', 'Body Shop'].includes(user?.role) ? (
                jc.status === 'Body Shop' ? (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={`BS:${jc.bodyShopStatus || jc.bodyShopStage || 'Vehicle Reported'}`}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val.startsWith('BS:')) {
                          const stage = val.replace('BS:', '');
                          updateFields({
                            status: 'Body Shop',
                            bodyShopStatus: stage,
                            bodyShopStage: stage,
                            statusRemarks: `Body Shop stage changed to ${stage}`
                          });
                        } else {
                          const confirmChange = window.confirm(`Are you sure you want to change status to "${formatStatusLabel(val)}"?`);
                          if (confirmChange) {
                            updateStatus(val);
                          }
                        }
                      }}
                      className="bg-fuchsia-50 dark:bg-fuchsia-950/40 border border-fuchsia-300 dark:border-fuchsia-700 text-fuchsia-800 dark:text-fuchsia-200 rounded-lg px-2 py-1 font-bold text-xs uppercase tracking-wider focus:outline-none"
                    >
                      <optgroup label="Body Shop Stages (13 Stages)">
                        {BODY_SHOP_STAGES.map((stg, idx) => (
                          <option key={stg} value={`BS:${stg}`}>
                            🚗 {idx + 1}. {stg}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Switch to General Service">
                        <option value="Created">Created</option>
                        <option value="Inspect Stage">Inspect Stage</option>
                        <option value="Estimation">Estimation</option>
                        <option value="Waiting for Customer Approval">Waiting for Customer Approval</option>
                        <option value="Waiting for Allotment">Waiting for Allotment</option>
                        <option value="Allotted">Allotted</option>
                        <option value="Parts Procuring">Parts Procuring</option>
                        <option value="Work in Progress">Work in Progress</option>
                        <option value="Quality Test">Pre-Delivery Inspection (PDI)</option>
                        <option value="Ready for Delivery">Ready for Delivery</option>
                        <option value="Delivered – Payment Pending">Delivered – Payment Pending</option>
                        <option value="Delivered">Delivered</option>
                        <option value="Closed">Closed</option>
                      </optgroup>
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowBodyShopModal(true)}
                      className="p-1 px-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs font-bold shadow-sm"
                      title="Manage Body Shop Stage & Remarks"
                    >
                      Manage ⚙️
                    </button>
                  </div>
                ) : (
                  <select
                    value={jc.status}
                    onChange={(e) => {
                      const nextStatus = e.target.value;
                      if (nextStatus === 'Body Shop') {
                        setShowBodyShopModal(true);
                        return;
                      }
                      if (['Ready for Delivery', 'Vehicle Ready'].includes(nextStatus) && jc.qcStatus !== 'Pass') {
                        alert('Pre-Delivery Inspection must be marked as Passed before this vehicle can be moved to Ready for Delivery. Please complete and save the inspection result.');
                        setShowUpdateModal(true);
                        return;
                      }
                      if (['Delivered – Payment Pending', 'Delivered - Payment Pending'].includes(nextStatus)) {
                        if (jc.qcStatus !== 'Pass') {
                          alert('Pre-Delivery Inspection (PDI) must be marked as Passed before vehicle delivery. Please complete inspection first.');
                          setShowUpdateModal(true);
                          return;
                        }
                        if (estimate && estimate.status !== 'Approved') {
                          alert('Customer Estimate must be approved before vehicle delivery. Please ensure the estimate is approved first.');
                          return;
                        }
                        openDeliveryPendingModal();
                        return;
                      }
                      if (nextStatus === 'Delivered') {
                        if (jc.qcStatus !== 'Pass') {
                          alert('Pre-Delivery Inspection (PDI) must be marked as Passed before vehicle delivery. Please complete inspection first.');
                          setShowUpdateModal(true);
                          return;
                        }
                        if (!invoice) {
                          alert('An Invoice must be generated before vehicle delivery. Please generate an invoice first.');
                          return;
                        }
                        const pendingBal = jc?.financialSummary?.pendingAmount ?? (invoice?.balanceDue || 0);
                        const isPaid = ['Fully Paid', 'Paid', 'Settled (Waived Off)', 'Overpaid'].includes(jc.paymentStatus) || (pendingBal <= 0.05);
                        if (!isPaid) {
                          alert(`Delivered status is allowed only when payment status is Fully Paid. Current outstanding balance is ₹${pendingBal.toFixed(2)}. For delivery with outstanding payment, please select "Delivered – Payment Pending".`);
                          return;
                        }
                      }
                      const confirmChange = window.confirm(`Are you sure you want to update the job card status to "${formatStatusLabel(nextStatus)}"?`);
                      if (confirmChange) {
                        updateStatus(nextStatus);
                      }
                    }}
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-805 dark:text-white font-bold text-xs uppercase tracking-wider focus:outline-none"
                  >
                    {(() => {
                      const activeWorkflowStages = [
                        'Created',
                        'Inspect Stage',
                        'Estimation',
                        'Waiting for Customer Approval',
                        'Waiting for Allotment',
                        'Allotted',
                        'Parts Procuring',
                        'Work in Progress',
                        'Quality Test',
                        'Ready for Delivery',
                        'Delivered – Payment Pending',
                        'Delivered',
                        'Closed',
                        'Body Shop'
                      ];
                      const statusList = activeWorkflowStages.includes(jc.status)
                        ? activeWorkflowStages
                        : [jc.status, ...activeWorkflowStages];

                      return statusList.map(statusOpt => (
                        <option key={statusOpt} value={statusOpt}>
                          {statusOpt === 'Body Shop' ? '🚗 Body Shop (13 Stages)...' : formatStatusLabel(statusOpt, jc)}
                        </option>
                      ));
                    })()}
                  </select>
                )
              ) : (
                <span className={`px-2 py-0.5 rounded font-extrabold text-[10px] uppercase border ${getStatusBadgeClass(jc.status)}`}>
                  {jc.status === 'Body Shop'
                    ? `🚗 Body Shop: ${jc.bodyShopStatus || jc.bodyShopStage || 'Vehicle Reported'}`
                    : formatStatusLabel(jc.status, jc)}
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
              <p className="font-semibold">Service Type(s): {jc.serviceTypes && jc.serviceTypes.length > 0 ? jc.serviceTypes.join(', ') : (jc.serviceType || 'General Servicing')}</p>
              {jc.workCategory && (
                <p className="font-semibold">
                  Customer Type: <span className="font-bold text-slate-900 dark:text-white">
                    {jc.workCategory === 'RR' ? 'RR(Running repair)' :
                     jc.workCategory === 'PMS' ? 'PMS(Periodical Maintenance Service)' :
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
              <p className="font-semibold text-slate-550">Pre-Delivery Inspector (PDI): <span className="font-bold text-slate-900 dark:text-white">{jc.qcName || 'N/A'}</span></p>
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
                  PDI Status: <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] uppercase ${
                    jc.qcStatus === 'Pass' 
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400' 
                      : 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400'
                  }`}>{jc.qcStatus === 'Pass' ? 'Passed' : jc.qcStatus}</span>
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
                
                let relativePath = photo.url;
                if (!isAbsolute) {
                  if (!relativePath.startsWith('/uploads/') && !relativePath.startsWith('uploads/')) {
                    relativePath = `/uploads/${relativePath}`;
                  } else if (relativePath.startsWith('uploads/')) {
                    relativePath = `/${relativePath}`;
                  }
                }
                const src = isAbsolute ? photo.url : `${API_BASE_URL.replace('/api', '')}${relativePath}`;
                const isBroken = brokenImages[photo.url];
                
                return (
                  <div key={index} className="relative group border border-slate-200 dark:border-slate-850 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-950 shadow-sm transition-all hover:shadow-md">
                    <div className="aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
                      {isBroken ? (
                        <div className="flex flex-col items-center justify-center p-4 text-center">
                          <span className="text-[10px] font-bold text-red-500">Attachment is no longer available.</span>
                        </div>
                      ) : (photo.url.toLowerCase().endsWith('.pdf') || photo.photoType === 'Document') ? (
                        <div className="flex flex-col items-center justify-center p-4">
                          <FileText className="w-8 h-8 text-indigo-500" />
                          <span className="text-[10px] font-bold text-slate-500 mt-2">Document Copy</span>
                        </div>
                      ) : (
                        <img 
                          src={src} 
                          alt={`Attachment ${index + 1}`} 
                          className="w-full h-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-105"
                          onError={() => setBrokenImages(prev => ({ ...prev, [photo.url]: true }))}
                          onClick={() => window.open(src, '_blank')}
                        />
                      )}
                    </div>
                    <div className="p-2.5 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/80 flex justify-between items-center">
                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">
                        {photo.photoType || 'Photo'}
                      </span>
                      {isBroken ? (
                        <span className="text-[9px] font-bold text-slate-400 cursor-not-allowed uppercase">
                          Unavailable
                        </span>
                      ) : (
                        <a 
                          href={src} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[9px] font-bold text-indigo-650 hover:text-indigo-700 uppercase"
                          onClick={(e) => {
                            if (isBroken) {
                              e.preventDefault();
                              alert('Attachment is no longer available.');
                            }
                          }}
                        >
                          View Full
                        </a>
                      )}
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
            <div className="flex flex-wrap gap-3">
              <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850 px-3.5 py-2 rounded-xl text-right">
                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Estimated Repair Amount</span>
                <span className="text-sm font-black text-slate-800 dark:text-white font-mono">
                  ₹{getEstimatedRepairAmount().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850 px-3.5 py-2 rounded-xl text-right">
                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Advance Received</span>
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-450 font-mono">
                  ₹{getTotalAdvanceReceived().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850 px-3.5 py-2 rounded-xl text-right">
                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Estimated Balance Due</span>
                <span className="text-sm font-black text-amber-600 dark:text-amber-450 font-mono">
                  ₹{getEstimatedBalanceDue().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {getEstimatedAdvanceExcess() > 0 && (
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-3.5 py-2 rounded-xl text-right">
                  <span className="block text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Advance Excess Credit</span>
                  <span className="text-sm font-black text-blue-700 dark:text-blue-300 font-mono">
                    +₹{getEstimatedAdvanceExcess().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
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
                          {getEffectivePaymentMode(payment)}
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
                        {getCleanPaymentRemarks(payment.remarks) && (
                          <>
                            <span>•</span>
                            <span className="italic text-slate-550">"{getCleanPaymentRemarks(payment.remarks)}"</span>
                          </>
                        )}
                      </div>
                    </div>
                    {['Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts', 'Accounts Executive'].includes(user?.role) && (
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
            {['Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts', 'Accounts Executive'].includes(user?.role) && (
              <form onSubmit={handleAddAdvance} className="bg-slate-50 dark:bg-slate-950/10 border border-slate-100 dark:border-slate-850 p-4 rounded-2xl space-y-3">
                <span className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b pb-1.5">Record New Deposit</span>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Amount (₹) *</label>
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
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Payment Mode *</label>
                    <select
                      value={paymentMode}
                      onChange={(e) => {
                        setPaymentMode(e.target.value);
                        setAdvanceType(e.target.value);
                      }}
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-200"
                    >
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Card">Card</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cheque">Cheque</option>
                      <option value="QR / Scanner Payment">QR / Scanner Payment</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">
                      {['UPI', 'QR / Scanner Payment', 'Bank Transfer'].includes(paymentMode)
                        ? 'Transaction ID / UTR'
                        : paymentMode === 'Cheque'
                          ? 'Cheque Number'
                          : paymentMode === 'Card'
                            ? 'Card Reference / Auth Code'
                            : paymentMode === 'Cash'
                              ? 'Receipt / Voucher No (Optional)'
                              : 'Transaction / Reference ID'}
                    </label>
                    <input
                      type="text"
                      placeholder={
                        paymentMode === 'Cash'
                          ? 'Receipt No (Optional)'
                          : paymentMode === 'Cheque'
                            ? 'Cheque No (Optional)'
                            : paymentMode === 'Card'
                              ? 'Card Auth / Ref No (Optional)'
                              : paymentMode === 'UPI' || paymentMode === 'QR / Scanner Payment'
                                ? 'UPI Txn ID / UTR'
                                : paymentMode === 'Bank Transfer'
                                  ? 'NEFT / RTGS / IMPS Ref'
                                  : 'Reference ID (Optional)'
                      }
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
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
                </div>

                <button
                  type="submit"
                  disabled={addingAdvance}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
                >
                  {addingAdvance ? 'Saving...' : 'Confirm Payment Received'}
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
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Prominent Waive Off / Discount Action in Header */}
              {['Super Admin', 'Admin', 'Accounts Executive', 'Accounts'].includes(user?.role) && (
                <button
                  type="button"
                  onClick={() => {
                    const maxWaiver = getFinalBillAmount() > 0 ? getOutstandingBalance() : getEstimatedBalanceDue();
                    setWaiverAmount(maxWaiver > 0 ? maxWaiver.toFixed(2) : '');
                    setWaiverReason('');
                    setWaiverCategory('Customer Negotiation');
                    setWaiverApprovedBy(user?.name || '');
                    setWaiverRemarks('');
                    setShowWaiverModal(true);
                  }}
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0"
                >
                  <AlertTriangle className="w-4 h-4" /> Waive Off / Discount
                </button>
              )}

              {/* Live calculations */}
              <div className="flex gap-2 sm:gap-4">
                <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-right">
                  <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                    {getFinalBillAmount() > 0 ? 'Balance Payable' : 'Est. Balance Due'}
                  </span>
                  <span className="text-sm font-black text-amber-600 dark:text-amber-450 font-mono">
                    ₹{(getFinalBillAmount() > 0 ? getBalancePayable() : getEstimatedBalanceDue()).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-right">
                  <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                    {getFinalBillAmount() > 0 ? 'Pending Amount' : 'Invoice Status'}
                  </span>
                  {getFinalBillAmount() > 0 ? (
                    <span className="text-sm font-black text-rose-600 dark:text-rose-450 font-mono">
                      ₹{getPendingAmount().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  ) : (
                    <span className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase">
                      Pending
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Form to Receive Payment */}
            <div className="lg:col-span-2">
              {['Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts', 'Accounts Executive'].includes(user?.role) && (
                getFinalBillAmount() === 0 ? (
                  /* Case 1: Final Invoice Not Yet Generated */
                  <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 p-4 rounded-2xl space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-xl shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <h5 className="text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wide">
                          Final Invoice Not Yet Generated
                        </h5>
                        <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                          This Job Card is currently in progress. The current estimated balance due is{' '}
                          <span className="font-bold font-mono text-amber-950 dark:text-white">
                            ₹{getEstimatedBalanceDue().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>{' '}
                          (Estimated Repair: ₹{getEstimatedRepairAmount().toLocaleString('en-IN', { minimumFractionDigits: 2 })}, Advance: ₹{getTotalAdvanceReceived().toLocaleString('en-IN', { minimumFractionDigits: 2 })}).
                        </p>
                        <p className="text-[10px] text-amber-700 dark:text-amber-400">
                          Advance payments can be added in the Advance Payment section above. You can also apply an authorized discount/waiver on the estimated balance below.
                        </p>
                      </div>
                    </div>

                    {['Super Admin', 'Admin', 'Accounts Executive', 'Accounts'].includes(user?.role) && (
                      <div className="pt-2 border-t border-amber-200/60 dark:border-amber-900/50 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase">
                          Authorized Actions:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const maxWaiver = getEstimatedBalanceDue();
                            setWaiverAmount(maxWaiver > 0 ? maxWaiver.toFixed(2) : '');
                            setWaiverReason('');
                            setWaiverCategory('Customer Negotiation');
                            setWaiverApprovedBy(user?.name || '');
                            setWaiverRemarks('');
                            setShowWaiverModal(true);
                          }}
                          className="py-2 px-3.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                        >
                          <AlertTriangle className="w-4 h-4" /> Waive Off / Discount Adjustment
                        </button>
                      </div>
                    )}
                  </div>
                ) : getPendingAmount() <= 0.05 ? (
                  /* Case 2: Final Invoice exists and is fully settled / paid */
                  <div className="bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-200 dark:border-emerald-800 p-4 rounded-2xl text-center space-y-2">
                    <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
                    <h5 className="text-xs font-bold text-emerald-800 dark:text-emerald-450 uppercase tracking-wide">Balance Settled</h5>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-500 font-medium">This Job Card's balance has been fully settled/paid or waived off.</p>
                    {['Super Admin', 'Admin', 'Accounts Executive', 'Accounts'].includes(user?.role) && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setWaiverAmount('');
                            setWaiverReason('');
                            setWaiverCategory('Customer Negotiation');
                            setWaiverApprovedBy(user?.name || '');
                            setWaiverRemarks('');
                            setShowWaiverModal(true);
                          }}
                          className="py-1.5 px-3 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" /> View / Manage Waivers
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
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
                          required={getPendingAmount() > 0}
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
                          <option value="UPI">UPI</option>
                          <option value="Card">Card</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                          <option value="Cheque">Cheque</option>
                          <option value="QR / Scanner Payment">QR / Scanner Payment</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">
                          {['UPI', 'QR / Scanner Payment', 'Bank Transfer'].includes(finalPaymentType) ? 'Transaction ID / UTR' : 'Transaction ID'}
                        </label>
                        <input
                          type="text"
                          placeholder="Txn ID / UTR"
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

                    <div className="flex flex-col sm:flex-row gap-3 pt-1.5">
                      <button
                        type="submit"
                        disabled={addingFinal}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle className="w-4 h-4" /> {addingFinal ? 'Processing...' : 'Receive Payment'}
                      </button>

                      {['Super Admin', 'Admin', 'Accounts Executive', 'Accounts'].includes(user?.role) && (
                        <button
                          type="button"
                          onClick={() => {
                            const pending = getOutstandingBalance();
                            setWaiverAmount(pending > 0 ? pending.toFixed(2) : '');
                            setWaiverReason('');
                            setWaiverCategory('Customer Negotiation');
                            setWaiverApprovedBy(user?.name || '');
                            setWaiverRemarks('');
                            setShowWaiverModal(true);
                          }}
                          className="py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
                        >
                          <AlertTriangle className="w-4 h-4" /> Waive Off / Discount Adjustment
                        </button>
                      )}
                    </div>
                  </form>
                )
              )}
            </div>

            {/* Payment Summary */}
            <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-150 dark:border-slate-850 p-4 rounded-2xl space-y-3">
              <span className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b pb-1.5">Payment Summary</span>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-dashed border-slate-100 dark:border-slate-800">
                  <span className="font-semibold text-slate-400">Estimated Repair Amount</span>
                  <span className="font-bold font-mono text-slate-800 dark:text-white">₹{getEstimatedRepairAmount().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-dashed border-slate-100 dark:border-slate-800">
                  <span className="font-semibold text-slate-400">Final Invoice Amount</span>
                  <span className="font-bold font-mono text-slate-800 dark:text-white">
                    ₹{getFinalBillAmount().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    {getFinalBillAmount() === 0 && (
                      <span className="text-[10px] font-normal text-amber-500 ml-1.5">(Pending)</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-dashed border-slate-100 dark:border-slate-800">
                  <span className="font-semibold text-slate-400">Total Advance Received</span>
                  <span className="font-bold font-mono text-emerald-600 dark:text-emerald-450">₹{getTotalAdvanceReceived().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-dashed border-slate-100 dark:border-slate-800">
                  <span className="font-semibold text-slate-400">Additional Payments Received</span>
                  <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">₹{getTotalFinalPayments().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-dashed border-slate-100 dark:border-slate-800">
                  <span className="font-semibold text-slate-400">Total Waive-Off / Discount</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold font-mono text-purple-600 dark:text-purple-400">
                      ₹{getTotalActiveWaived().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    {['Super Admin', 'Admin', 'Accounts Executive', 'Accounts'].includes(user?.role) && (
                      <button
                        type="button"
                        onClick={() => {
                          const maxWaiver = getFinalBillAmount() > 0 ? getOutstandingBalance() : getEstimatedBalanceDue();
                          setWaiverAmount(maxWaiver > 0 ? maxWaiver.toFixed(2) : '');
                          setWaiverReason('');
                          setWaiverCategory('Customer Negotiation');
                          setWaiverApprovedBy(user?.name || '');
                          setWaiverRemarks('');
                          setShowWaiverModal(true);
                        }}
                        className="px-2 py-0.5 rounded bg-purple-100 hover:bg-purple-200 dark:bg-purple-950/70 dark:hover:bg-purple-900/70 text-[10px] font-extrabold text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition-colors"
                        title="Click to apply or manage waivers / discounts"
                      >
                        {getTotalActiveWaived() > 0 ? 'Manage' : '+ Waive Off'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-dashed border-slate-100 dark:border-slate-800">
                  <span className="font-semibold text-slate-400">Net Amount Payable</span>
                  <span className="font-black font-mono text-slate-900 dark:text-slate-100">₹{getNetAmountPayable().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                {getCustomerCredit() > 0 && (
                  <div className="flex justify-between items-center py-1.5 px-2 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200/50">
                    <span className="font-bold text-blue-700 dark:text-blue-400">Customer Excess Credit</span>
                    <span className="font-black font-mono text-blue-700 dark:text-blue-400">+₹{getCustomerCredit().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-1 border-b border-dashed border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-slate-600 dark:text-slate-300">Outstanding Balance</span>
                  <span className="font-extrabold font-mono text-rose-600 dark:text-rose-450 text-sm">₹{getOutstandingBalance().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="font-semibold text-slate-400">Payment Status</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                    jc?.paymentStatus === 'Overpaid'
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200/50'
                      : jc?.paymentStatus === 'Fully Paid' || jc?.paymentStatus === 'Paid'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-450 border-emerald-200/50' 
                      : jc?.paymentStatus === 'Partially Paid'
                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-450 border-amber-200/50'
                      : jc?.paymentStatus === 'Settled (Waived Off)' || jc?.paymentStatus === 'Waived' || jc?.paymentStatus === 'Waived / Fully Settled'
                      ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-450 border-purple-200/50'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-450 border-rose-200/50'
                  }`}>
                    {jc?.paymentStatus || 'Pending'}
                  </span>
                </div>
                {getTotalReceived() > 0 && (
                  <button
                    type="button"
                    onClick={() => handleDownloadReceipt()}
                    className="w-full mt-2 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors border border-slate-200 dark:border-slate-700"
                    title="Download Official Payment Receipt PDF"
                  >
                    <Receipt className="w-3.5 h-3.5 text-indigo-500" /> Download Payment Receipt PDF
                  </button>
                )}
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
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                            p.isWaiver
                              ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-purple-100/50'
                              : p.isAdvance 
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
                          <div className="flex items-center justify-center gap-1">
                            {!p.isWaiver && (
                              <button
                                type="button"
                                onClick={() => handleDownloadReceipt(p.id)}
                                className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 p-1 rounded-lg transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                                title="Download payment receipt PDF"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {p.isWaiver ? (
                              p.waiverStatus !== 'Reversed' && ['Super Admin', 'Admin', 'Accounts Executive', 'Accounts'].includes(user?.role) ? (
                                <button
                                  type="button"
                                  onClick={() => handleReverseWaiver(p.waiverId)}
                                  className="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300 text-[10px] font-bold border border-rose-200 transition-colors"
                                  title="Reverse this approved waiver"
                                >
                                  Reverse
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">
                                  {p.waiverStatus === 'Reversed' ? 'Reversed' : 'Locked'}
                                </span>
                              )
                            ) : (
                              ['Super Admin', 'Admin', 'Billing', 'Billing Executive', 'Accounts', 'Accounts Executive'].includes(user?.role) && (
                                <button
                                  type="button"
                                  onClick={() => p.isAdvance ? handleDeleteAdvance(p.id) : handleDeleteFinalPayment(p.id)}
                                  className="text-red-500 hover:text-red-700 p-1 rounded-lg transition-colors hover:bg-red-500/10"
                                  title={`Delete ${p.type.toLowerCase()}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )
                            )}
                          </div>
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

          {/* Approved Waivers & Discounts Audit History Table */}
          {jc?.waivers && jc.waivers.length > 0 && (
            <div className="space-y-2 select-none border-t border-slate-150 dark:border-slate-800 pt-4">
              <div className="flex justify-between items-center">
                <h5 className="text-xs font-black text-purple-850 dark:text-purple-300 uppercase tracking-wide flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-purple-500" /> Approved Waivers & Discounts Audit Log
                </h5>
                <span className="text-[10px] font-bold text-slate-400">
                  Total Active Waived: <span className="font-mono text-purple-600 dark:text-purple-400 font-black">₹{getTotalActiveWaived().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-purple-100 dark:border-purple-950/60 text-[10px] uppercase font-bold text-slate-455 bg-purple-50/30 dark:bg-purple-950/20">
                      <th className="py-2.5 px-3">Date & Time</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3 text-right">Waived Amount</th>
                      <th className="py-2.5 px-3">Reason / Justification</th>
                      <th className="py-2.5 px-3">Approved By</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {jc.waivers.map((w, idx) => (
                      <tr key={w._id || idx} className="hover:bg-purple-50/20 dark:hover:bg-purple-950/10 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-slate-500 whitespace-nowrap">
                          {w.createdAt ? new Date(w.createdAt).toLocaleString('en-IN') : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            {w.category || 'Customer Negotiation'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold font-mono text-purple-700 dark:text-purple-300 whitespace-nowrap">
                          ₹{(w.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-350 font-medium max-w-xs">
                          <div>"{w.reason}"</div>
                          {w.remarks && <div className="text-[10px] text-slate-400 italic">Notes: {w.remarks}</div>}
                          {w.status === 'Reversed' && w.reversalReason && (
                            <div className="text-[10px] text-rose-600 dark:text-rose-450 font-bold mt-0.5">
                              Reversal reason: "{w.reversalReason}"
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 font-medium">
                          {w.approvedBy || 'Staff'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase border ${
                            w.status === 'Reversed'
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200'
                          }`}>
                            {w.status || 'Active'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {w.status !== 'Reversed' && ['Super Admin', 'Admin', 'Accounts Executive', 'Accounts'].includes(user?.role) ? (
                            <button
                              type="button"
                              disabled={reversing}
                              onClick={() => handleReverseWaiver(w._id)}
                              className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300 text-[10px] font-bold border border-rose-200 transition-colors disabled:opacity-50"
                            >
                              Reverse
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">
                              {w.status === 'Reversed' ? `Reversed by ${w.reversedBy || 'Staff'}` : 'Locked'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Signatures Block with Interactive Mobile Signing */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 border-t border-slate-100 dark:border-slate-800 pt-6">
          
          {/* Customer Signature box */}
          <div className="flex flex-col items-center justify-between border border-slate-200 dark:border-slate-800 p-4 rounded-2xl h-40 bg-white dark:bg-slate-900/50 shadow-xs relative group">
            <div className="w-full flex justify-between items-center">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Customer Signature</span>
              <button
                type="button"
                onClick={() => handleOpenSignatureModal('customer', 'Customer Signature')}
                className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
              >
                <PenTool className="w-2.5 h-2.5" />
                {jc.signatures?.customer ? 'Update' : 'Sign'}
              </button>
            </div>

            {jc.signatures?.customer ? (
              <img src={jc.signatures.customer} alt="Customer Sig" className="max-h-20 w-auto object-contain py-1" />
            ) : (
              <span className="text-[10px] text-slate-400 italic my-auto">No signature logged</span>
            )}
            <span className="w-32 border-b border-slate-200 dark:border-slate-700" />
          </div>

          {/* Technician Signature box */}
          <div className="flex flex-col items-center justify-between border border-slate-200 dark:border-slate-800 p-4 rounded-2xl h-40 bg-white dark:bg-slate-900/50 shadow-xs relative group">
            <div className="w-full flex justify-between items-center">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Technician Signature</span>
              <button
                type="button"
                onClick={() => handleOpenSignatureModal('technician', 'Technician Signature')}
                className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
              >
                <PenTool className="w-2.5 h-2.5" />
                {jc.signatures?.technician ? 'Update' : 'Sign'}
              </button>
            </div>

            {jc.signatures?.technician ? (
              <img src={jc.signatures.technician} alt="Technician Sig" className="max-h-20 w-auto object-contain py-1" />
            ) : (
              <span className="text-[10px] text-slate-400 italic my-auto">No signature logged</span>
            )}
            <span className="w-32 border-b border-slate-200 dark:border-slate-700" />
          </div>

          {/* Advisor Signature box */}
          <div className="flex flex-col items-center justify-between border border-slate-200 dark:border-slate-800 p-4 rounded-2xl h-40 bg-white dark:bg-slate-900/50 shadow-xs relative group">
            <div className="w-full flex justify-between items-center">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Service Advisor Signature</span>
              <button
                type="button"
                onClick={() => handleOpenSignatureModal('advisor', 'Service Advisor Signature')}
                className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
              >
                <PenTool className="w-2.5 h-2.5" />
                {jc.signatures?.advisor ? 'Update' : 'Sign'}
              </button>
            </div>

            {jc.signatures?.advisor ? (
              <img src={jc.signatures.advisor} alt="Advisor Sig" className="max-h-20 w-auto object-contain py-1" />
            ) : (
              <span className="text-[10px] text-slate-400 italic my-auto">No signature logged</span>
            )}
            <span className="w-32 border-b border-slate-200 dark:border-slate-700" />
          </div>

        </div>

      </div>

      {/* Signature Capture Modal with Non-Scrolling Touch Drawing */}
      {signatureModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in print:hidden">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/40">
              <div className="flex items-center gap-2">
                <PenTool className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Record {signatureModal.label}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSignatureModal({ isOpen: false, type: '', label: '', dataUrl: '' })}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <SignaturePad
                label={signatureModal.label}
                value={signatureModal.dataUrl}
                onChange={(sig) => setSignatureModal(prev => ({ ...prev, dataUrl: sig }))}
              />

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSignatureModal({ isOpen: false, type: '', label: '', dataUrl: '' })}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingSignature || !signatureModal.dataUrl}
                  onClick={() => handleSaveSignature(signatureModal.dataUrl)}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all"
                >
                  {savingSignature ? 'Saving Signature...' : 'Save to Job Card'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUpdateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in print:hidden">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/40 shrink-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                {['Quality Test', 'Quality Check', 'Final Quality Inspection', 'Pre-Delivery Inspection'].includes(jc.status)
                  ? 'Record Pre-Delivery Inspection (PDI)'
                  : 'Update Job Card Work Log / Inspection'}
              </h3>
              <button
                type="button"
                onClick={() => setShowUpdateModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-205 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleModalSave} className="flex flex-col min-h-0 flex-1">
              <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 text-xs font-semibold text-slate-600 dark:text-slate-400">
              
              {/* If WIP, Allotted, or Body Shop stage */}
              {['Work In Progress', 'Work in Progress', 'Body Shop', 'Allotted'].includes(jc.status) && (
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

              {/* If Pre-Delivery Inspection stage */}
              {['Quality Test', 'Quality Check', 'Final Quality Inspection', 'Pre-Delivery Inspection'].includes(jc.status) && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">
                      Pre-Delivery Inspection (PDI) Remarks / Notes
                    </label>
                    <textarea
                      rows="3"
                      value={modalData.qcRemarks}
                      onChange={(e) => setModalData({ ...modalData, qcRemarks: e.target.value })}
                      placeholder="Log pre-delivery inspection notes, checklist verification, or rework required..."
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 resize-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">
                      Pre-Delivery Inspection (PDI) Result
                    </label>
                    <select
                      value={modalData.qcStatus}
                      onChange={(e) => setModalData({ ...modalData, qcStatus: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 font-bold text-slate-800 dark:text-slate-250"
                      required
                    >
                      <option value="">-- Select Inspection Result --</option>
                      <option value="Pass">Pass (Ready for Delivery)</option>
                      <option value="Fail">Fail (Revert to Work in Progress)</option>
                      <option value="Rework Required">Rework Required (Revert to Work in Progress)</option>
                    </select>
                  </div>
                </>
              )}
              </div>

              {/* Action Buttons */}
              <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2.5 bg-slate-50/50 dark:bg-slate-955/40 shrink-0">
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

      {showWaiverModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in print:hidden">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/40 shrink-0">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-purple-500" /> Waive Off / Discount Adjustment
                </h3>
                <p className="text-[10px] text-slate-450 font-medium">Record authorized customer waiver or corporate discount with audit tracking</p>
              </div>
              <button
                type="button"
                onClick={() => setShowWaiverModal(false)}
                className="text-slate-400 hover:text-slate-655 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleRecordWaiver} className="flex flex-col min-h-0 flex-1">
              <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 text-xs font-semibold text-slate-600 dark:text-slate-400">
                <div className="bg-slate-50 dark:bg-slate-950/20 p-3 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">
                      {getFinalBillAmount() > 0 ? 'Final Invoice Amount:' : 'Estimated Repair Amount:'}
                    </span>
                    <span className="font-bold font-mono text-slate-800 dark:text-white">
                      ₹{(getFinalBillAmount() > 0 ? getFinalBillAmount() : getEstimatedRepairAmount()).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Total Received So Far:</span>
                    <span className="font-bold font-mono text-emerald-600 dark:text-emerald-450">₹{getTotalReceived().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {getTotalActiveWaived() > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-semibold">Existing Active Waivers:</span>
                      <span className="font-bold font-mono text-purple-600 dark:text-purple-400">₹{getTotalActiveWaived().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-dashed border-slate-250 dark:border-slate-700 pt-1.5">
                    <span className="text-slate-500 font-bold">
                      {getFinalBillAmount() > 0 ? 'Outstanding Invoice Balance:' : 'Estimated Balance Due:'}
                    </span>
                    <span className="font-bold font-mono text-rose-600 dark:text-rose-450">
                      ₹{(getFinalBillAmount() > 0 ? getOutstandingBalance() : getEstimatedBalanceDue()).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">Waiver Amount (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={(getFinalBillAmount() > 0 ? getOutstandingBalance() : getEstimatedBalanceDue()).toFixed(2)}
                      value={waiverAmount}
                      onChange={(e) => setWaiverAmount(e.target.value)}
                      placeholder="Enter amount to waive"
                      required
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 font-mono font-bold text-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">Waive-Off Category</label>
                    <select
                      value={waiverCategory}
                      onChange={(e) => setWaiverCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 font-bold text-slate-800 dark:text-slate-200"
                    >
                      <option value="Customer Negotiation">Customer Negotiation</option>
                      <option value="Goodwill Gesture">Goodwill Gesture</option>
                      <option value="Management Approval">Management Approval</option>
                      <option value="Service Delay Compensation">Service Delay Compensation</option>
                      <option value="Disputed Amount">Disputed Amount</option>
                      <option value="Round-off / Minor Adjustment">Round-off / Minor Adjustment</option>
                      <option value="Corporate Discount">Corporate Discount</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">Approved By</label>
                    <input
                      type="text"
                      value={waiverApprovedBy}
                      onChange={(e) => setWaiverApprovedBy(e.target.value)}
                      placeholder={user?.name || "Authorizer's name"}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 font-medium text-slate-800 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">Remarks (Optional)</label>
                    <input
                      type="text"
                      value={waiverRemarks}
                      onChange={(e) => setWaiverRemarks(e.target.value)}
                      placeholder="Optional notes..."
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 font-medium text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">Reason for Waiver (Mandatory)</label>
                  <textarea
                    rows="2.5"
                    value={waiverReason}
                    onChange={(e) => setWaiverReason(e.target.value)}
                    placeholder="State justification / reason for discount or waiver..."
                    required
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 resize-none font-medium text-slate-800 dark:text-slate-250"
                  />
                </div>

                {/* Audit History of Waivers */}
                {jc?.waivers && jc.waivers.length > 0 && (
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">Previously Approved Waivers</span>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {jc.waivers.map((w, idx) => (
                        <div
                          key={w._id || idx}
                          className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                            w.status === 'Reversed'
                              ? 'bg-slate-100/50 dark:bg-slate-850/30 border-slate-200 dark:border-slate-800 opacity-60'
                              : 'bg-purple-50/40 dark:bg-purple-950/20 border-purple-200/60 dark:border-purple-900/40'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-purple-700 dark:text-purple-300">₹{(w.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                                {w.category || 'Customer Negotiation'}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                w.status === 'Reversed'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              }`}>
                                {w.status || 'Active'}
                              </span>
                            </div>
                            {w.status !== 'Reversed' && ['Super Admin', 'Admin', 'Accounts Executive', 'Accounts'].includes(user?.role) && (
                              <button
                                type="button"
                                disabled={reversing}
                                onClick={() => handleReverseWaiver(w._id)}
                                className="text-[10px] font-bold text-rose-600 hover:text-rose-700 hover:underline disabled:opacity-50"
                              >
                                Reverse
                              </button>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            <span>Reason: "{w.reason}"</span>
                            {w.remarks && <span> • Remarks: {w.remarks}</span>}
                          </div>
                          <div className="text-[9px] text-slate-400 flex flex-wrap gap-x-2">
                            <span>Approved by: {w.approvedBy || 'Staff'}</span>
                            <span>•</span>
                            <span>Date: {w.createdAt ? new Date(w.createdAt).toLocaleString('en-IN') : 'N/A'}</span>
                          </div>
                          {w.status === 'Reversed' && (
                            <div className="text-[9px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 p-1.5 rounded-lg border border-rose-200/50">
                              <span>Reversed by {w.reversedBy || 'Staff'} on {w.reversedAt ? new Date(w.reversedAt).toLocaleDateString('en-IN') : 'N/A'}: "{w.reversalReason || 'No reason provided'}"</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2.5 bg-slate-50/50 dark:bg-slate-955/40 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowWaiverModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={waiving || (getFinalBillAmount() > 0 ? getOutstandingBalance() : getEstimatedBalanceDue()) <= 0.05}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-all shadow-md shadow-purple-600/10 disabled:opacity-50"
                >
                  {waiving ? 'Processing...' : 'Confirm Waiver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delivery Confirmation Modal (Delivered – Payment Pending) */}
      {showDeliveryPendingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl w-full max-w-lg">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600 rounded-xl">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 dark:text-white">
                    Confirm Vehicle Delivery (Payment Pending)
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Job Card: <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{jc?.jobCardNo}</span> | Vehicle: <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{jc?.vehicleId?.vehicleNumber}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowDeliveryPendingModal(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 rounded-2xl p-4 mb-5">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-500 font-medium">Customer:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{jc?.customerId?.name} ({jc?.customerId?.type || 'Individual'})</span>
              </div>
              {invoice ? (
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-500 font-medium">Final Invoice ({invoice.invoiceNo}):</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    ₹{Number(invoice?.totals?.roundedGrandTotal || invoice?.totals?.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-500 font-medium">Estimated Repair (Invoice Pending):</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    ₹{Number(jc?.financialSummary?.estimatedRepairAmount || jc?.estAmt || estimate?.totals?.roundedGrandTotal || estimate?.totals?.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-500 font-medium">Payments / Advances Received:</span>
                <span className="font-bold text-emerald-600">
                  ₹{Number(invoice?.amountPaid || jc?.financialSummary?.totalReceived || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-sm font-black pt-2 border-t border-amber-200/60 dark:border-amber-900/40">
                <span className="text-amber-800 dark:text-amber-400">Outstanding Balance:</span>
                <span className="text-red-600 font-mono">
                  ₹{Number(invoice ? (invoice?.balanceDue || jc?.financialSummary?.outstandingBalance || 0) : (jc?.financialSummary?.outstandingBalance ?? jc?.financialSummary?.estimatedBalanceDue ?? 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmDeliveryPending} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                    Delivered By (Staff Name) *
                  </label>
                  <input
                    type="text"
                    required
                    value={deliveryStaffName}
                    onChange={(e) => setDeliveryStaffName(e.target.value)}
                    placeholder="Staff member completing delivery"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                    Delivery Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                    Delivery Time
                  </label>
                  <input
                    type="text"
                    value={deliveryTime}
                    onChange={(e) => setDeliveryTime(e.target.value)}
                    placeholder="e.g. 04:30 PM"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                    Credit / Payment Due Date
                  </label>
                  <input
                    type="date"
                    value={deliveryCreditDueDate}
                    onChange={(e) => setDeliveryCreditDueDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                  Delivery Notes / Payment Terms Remarks
                </label>
                <textarea
                  rows="2"
                  value={deliveryRemarks}
                  onChange={(e) => setDeliveryRemarks(e.target.value)}
                  placeholder="e.g. Corporate 30-day payment / Customer promised to transfer pending balance via NEFT"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDeliveryPendingModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDelivery}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-600/10 disabled:opacity-50"
                >
                  {submittingDelivery ? 'Confirming...' : 'Confirm Delivery (Payment Pending)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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

      {/* Body Shop Status Workflow Modal */}
      <BodyShopStatusModal
        jobCard={jc}
        token={token}
        user={user}
        isOpen={showBodyShopModal}
        onClose={() => setShowBodyShopModal(false)}
        onSuccess={() => {
          setShowBodyShopModal(false);
          fetchDetails();
        }}
      />
    </div>
  );
}
