import React, { useState, useEffect } from 'react';
import { API_BASE_URL, OWNER_SUPPORT_NUMBER } from '../config';
import { Search, Plus, Edit2, FileCheck, Check, X, Download, FileText, Trash2, Send, Loader2, MessageSquare, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import EstimateForm from './EstimateForm';

export default function Estimates({ token, user, setActiveTab }) {
  const [estimates, setEstimates] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list', 'create', 'edit'
  const [selectedEstId, setSelectedEstId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [pdfType, setPdfType] = useState('customer');
  const [approvalModalEst, setApprovalModalEst] = useState(null);
  const [isApproving, setIsApproving] = useState(false);
  const [sendingMap, setSendingMap] = useState({});
  const [notification, setNotification] = useState(null);

  // Auto-dismiss notifications after 7 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const canApproveEstimate = ['Admin', 'Service', 'Accounts', 'Body Shop', 'Accounts Executive'].includes(user?.role);

  // Debounce search state
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchEstimates = async () => {
    try {
      let url = `${API_BASE_URL}/estimates?status=${statusFilter}`;
      if (debouncedSearch.trim() !== '') {
        url += `&search=${encodeURIComponent(debouncedSearch.trim())}`;
      }
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEstimates(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (viewMode === 'list') {
      fetchEstimates();
    }
  }, [statusFilter, viewMode, debouncedSearch]);

  const openApproveModal = (est, e) => {
    if (e) e.stopPropagation();
    setApprovalModalEst(est);
  };

  const handleConfirmApproval = async () => {
    if (!approvalModalEst) return;
    setIsApproving(true);
    try {
      const finalAmount = (approvalModalEst.manualOverride && approvalModalEst.manualGrandTotal)
        ? Number(approvalModalEst.manualGrandTotal)
        : (approvalModalEst.totals?.grandTotal || 0);

      const res = await fetch(`${API_BASE_URL}/estimates/${approvalModalEst._id}/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ finalAmount })
      });
      if (res.ok) {
        setApprovalModalEst(null);
        await fetchEstimates();
      } else {
        const err = await res.json();
        alert('Failed to approve estimate: ' + (err.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Error approving estimate: ' + err.message);
    } finally {
      setIsApproving(false);
    }
  };

  const handleRetryApprovalNotification = async (est, e) => {
    if (e) e.stopPropagation();
    if (!est || !est._id) return;
    if (sendingMap[est._id]) return;

    setSendingMap(prev => ({ ...prev, [est._id]: true }));
    setNotification(null);

    try {
      const res = await fetch(`${API_BASE_URL}/estimates/${est._id}/retry-approval-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setNotification({
          type: 'success',
          title: 'WhatsApp Sequence Dispatched',
          message: data.message || `Customer Estimate notifications for ${est.estimateNo} processed successfully.`
        });
        await fetchEstimates();
      } else {
        setNotification({
          type: 'error',
          title: 'Delivery Failed',
          message: data.error || 'Failed to dispatch WhatsApp notification sequence.'
        });
      }
    } catch (err) {
      console.error('Error retrying WhatsApp sequence:', err);
      setNotification({
        type: 'error',
        title: 'Communication Error',
        message: err.message || 'Network error while attempting to retry WhatsApp sequence.'
      });
    } finally {
      setSendingMap(prev => ({ ...prev, [est._id]: false }));
    }
  };

  const handleRetryApprovedNotification = async (est, e) => {
    if (e) e.stopPropagation();
    if (!est || !est._id) return;
    if (sendingMap[est._id]) return;

    setSendingMap(prev => ({ ...prev, [est._id]: true }));
    setNotification(null);

    try {
      const res = await fetch(`${API_BASE_URL}/estimates/${est._id}/retry-approved-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setNotification({
          type: 'success',
          title: 'Approved Notification Dispatched',
          message: data.message || `Stage 3 Approved notification for ${est.estimateNo} was dispatched via WhatsApp.`
        });
        await fetchEstimates();
      } else {
        setNotification({
          type: 'error',
          title: 'Retry Failed',
          message: data.error || 'Failed to dispatch Stage 3 WhatsApp notification.'
        });
      }
    } catch (err) {
      console.error('Error retrying Stage 3:', err);
      setNotification({
        type: 'error',
        title: 'Communication Error',
        message: err.message || 'Network error while attempting to retry Stage 3.'
      });
    } finally {
      setSendingMap(prev => ({ ...prev, [est._id]: false }));
    }
  };

  const handleSendCustomerEstimate = async (est, e) => {
    if (e) e.stopPropagation();
    if (!est || !est._id) return;
    if (sendingMap[est._id]) return; // Button locked / in-flight protection

    const jc = est.jobCardId || {};
    const cust = jc.customerId || {};
    const custName = cust.name || 'Valued Customer';
    const custPhone = cust.mobile || cust.phone || cust.contactNumber || '';

    setSendingMap(prev => ({ ...prev, [est._id]: true }));
    setNotification(null);

    try {
      const res = await fetch(`${API_BASE_URL}/estimates/${est._id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();

      if (res.ok) {
        setNotification({
          type: 'success',
          title: 'Customer Estimate Dispatched Successfully',
          message: data.message || `Customer Estimate PDF for ${est.estimateNo} was sent via WhatsApp to ${custName} (${custPhone || 'registered number'}).`
        });
        await fetchEstimates();
      } else {
        setNotification({
          type: 'error',
          title: 'WhatsApp Delivery Failed',
          message: data.error || 'Failed to dispatch Customer Estimate PDF. Status remains Draft.'
        });
        await fetchEstimates();
      }
    } catch (err) {
      console.error('Error sending estimate PDF via WhatsApp:', err);
      setNotification({
        type: 'error',
        title: 'Communication Error',
        message: err.message || 'Network error while attempting to send estimate via WhatsApp.'
      });
    } finally {
      setSendingMap(prev => ({ ...prev, [est._id]: false }));
    }
  };

  const updateStatus = async (id, newStatus, e) => {
    if (e) e.stopPropagation(); // prevent row click
    if (newStatus === 'Approved') {
      const est = estimates.find(item => item._id === id);
      if (est) {
        openApproveModal(est, e);
        return;
      }
    }
    if (newStatus === 'Sent' || newStatus === 'Waiting for Approval') {
      const est = estimates.find(item => item._id === id);
      if (est) {
        handleSendCustomerEstimate(est, e);
        return;
      }
    }
    try {
      const res = await fetch(`${API_BASE_URL}/estimates/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        fetchEstimates();
      } else {
        const err = await res.json();
        alert('Failed to update status: ' + (err.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteEstimate = async (id, e) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to delete this estimate permanently?')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/estimates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchEstimates();
      } else {
        const err = await res.json();
        alert('Failed to delete estimate: ' + (err.error || err.message || res.statusText || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenEdit = (id, e) => {
    e.stopPropagation();
    setSelectedEstId(id);
    setViewMode('edit');
  };

  const handleSaved = () => {
    setViewMode('list');
    setSelectedEstId(null);
  };

  const handleCancel = () => {
    setViewMode('list');
    setSelectedEstId(null);
  };

  const handleConvertInvoice = (est, e) => {
    e.stopPropagation();
    // Navigate to invoices tab and flag to load this estimate details
    localStorage.setItem('convert_estimate_id', est._id);
    localStorage.setItem('create_invoice_jc_id', est.jobCardId._id);
    setActiveTab('invoices');
  };

  if (viewMode === 'create') {
    return <EstimateForm token={token} user={user} onSaved={handleSaved} onCancel={handleCancel} />;
  }

  if (viewMode === 'edit') {
    return <EstimateForm token={token} user={user} editId={selectedEstId} onSaved={handleSaved} onCancel={handleCancel} />;
  }

  const printEstimate = (est) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print estimates.');
      return;
    }

    const jc = est.jobCardId || {};
    const cust = jc.customerId || {};
    const veh = jc.vehicleId || {};

    const convertNumberToWords = (num) => {
      const roundedNum = Math.round(num * 100) / 100;
      if (roundedNum === 0) return 'Rupees Zero Only';
      const a = [
        '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
      ];
      const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
      
      function convert(n) {
        if (n < 20) return a[n];
        if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
        if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convert(n % 100) : '');
        if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + convert(n % 1000) : '');
        if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + convert(n % 100000) : '');
        return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + convert(n % 10000000) : '');
      }

      const parts = roundedNum.toString().split('.');
      const rupees = parseInt(parts[0], 10);
      const paise = parts[1] ? parseInt(parts[1].padEnd(2, '0').slice(0, 2), 10) : 0;
      
      let result = 'Rupees ';
      if (rupees > 0) {
        result += convert(rupees);
      } else {
        result += 'Zero';
      }
      
      if (paise > 0) {
        result += ' and ' + convert(paise) + ' Paise';
      }
      result += ' Only';
      return result.replace(/\s+/g, ' ').trim();
    };

    const isInterstate = cust.gstNumber 
      ? !cust.gstNumber.startsWith('36') 
      : (cust.address ? (
          !(cust.address.toLowerCase().includes('telangana') || 
            cust.address.toLowerCase().includes('hyderabad') || 
            cust.address.toLowerCase().includes('secunderabad')) &&
          ['andhra', 'karnataka', 'maharashtra', 'bangalore', 'mumbai', 'pune', 'delhi', 
           'tamil nadu', 'chennai', 'kerala', 'goa', 'gujarat', 'rajasthan', 'madhya pradesh',
           'ap', 'ka', 'mh', 'dl', 'tn'].some(state => cust.address.toLowerCase().includes(state))
        ) : false);

    let partsRowsHtml = '';
    if (est.parts && est.parts.length > 0) {
      est.parts.forEach((p, idx) => {
        const discount = p.discount || 0;
        const taxable = (p.qty || 1) * (p.rate || 0) - discount;
        const cgst = taxable * (p.gstPercent / 200);
        const sgst = taxable * (p.gstPercent / 200);
        const taxAmt = cgst + sgst;
        const net = taxable + taxAmt;
        const netRate = taxable / (p.qty || 1);
        
        let gstSplitStr = '';
        if (isInterstate) {
          gstSplitStr = `IGST: ₹${taxAmt.toFixed(2)} (${p.gstPercent}%)`;
        } else {
          gstSplitStr = `CGST: ₹${cgst.toFixed(2)} (${(p.gstPercent/2)}%)<br/>SGST: ₹${sgst.toFixed(2)} (${(p.gstPercent/2)}%)`;
        }

        partsRowsHtml += `
          <tr>
            <td>${idx + 1}</td>
            <td style="text-align: left;"><strong>${p.name || 'Spare Part'}</strong><br/><span style="font-size: 10px; color: #555;">No: ${p.partNo || 'N/A'}</span></td>
            <td>${p.hsnCode || '8708'}</td>
            <td>${p.qty} ${p.unit || 'Pcs'}</td>
            <td>₹${netRate.toFixed(2)}</td>
            <td>₹${taxable.toFixed(2)}</td>
            <td>₹${taxable.toFixed(2)}</td>
            <td style="font-size: 9px; line-height: 1.2;">
              ${gstSplitStr}
            </td>
            <td><strong>₹${net.toFixed(2)}</strong></td>
          </tr>
        `;
      });
    } else {
      partsRowsHtml = `<tr><td colspan="9" style="text-align: center; color: #888;">No spare parts items.</td></tr>`;
    }

    let labourRowsHtml = '';
    if (est.labour && est.labour.length > 0) {
      est.labour.forEach((l, idx) => {
        const discount = l.discount || 0;
        const taxable = (l.rate || 0) - discount;
        const cgst = taxable * (l.gstPercent / 200);
        const sgst = taxable * (l.gstPercent / 200);
        const taxAmt = cgst + sgst;
        const net = taxable + taxAmt;
        const qty = l.qty || 1;
        const netRate = taxable / qty;
        
        let gstSplitStr = '';
        if (isInterstate) {
          gstSplitStr = `IGST: ₹${taxAmt.toFixed(2)} (${l.gstPercent}%)`;
        } else {
          gstSplitStr = `CGST: ₹${cgst.toFixed(2)} (${(l.gstPercent/2)}%)<br/>SGST: ₹${sgst.toFixed(2)} (${(l.gstPercent/2)}%)`;
        }

        labourRowsHtml += `
          <tr>
            <td>${idx + 1}</td>
            <td style="text-align: left;"><strong>${l.description || 'Labour Service'}</strong></td>
            <td>9987</td>
            <td>1 Pcs</td>
            <td>₹${netRate.toFixed(2)}</td>
            <td>₹${taxable.toFixed(2)}</td>
            <td>₹${taxable.toFixed(2)}</td>
            <td style="font-size: 9px; line-height: 1.2;">
              ${gstSplitStr}
            </td>
            <td><strong>₹${net.toFixed(2)}</strong></td>
          </tr>
        `;
      });
    } else {
      labourRowsHtml = `<tr><td colspan="9" style="text-align: center; color: #888;">No labour charges items.</td></tr>`;
    }

    const dateStr = new Date(est.date).toLocaleDateString('en-IN', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    let partsTotal = 0;
    let labourTotal = 0;
    let gstTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;

    if (est.parts && est.parts.length > 0) {
      est.parts.forEach(p => {
        const discount = p.discount || 0;
        const taxable = (p.qty || 1) * (p.rate || 0) - discount;
        const gstPercent = (p.gstPercent !== undefined && p.gstPercent !== null && p.gstPercent !== '') ? Number(p.gstPercent) : 18;
        const taxAmt = taxable * (gstPercent / 100);
        partsTotal += taxable;
        gstTotal += taxAmt;
        if (isInterstate) {
          igstTotal += taxAmt;
        } else {
          cgstTotal += taxAmt / 2;
          sgstTotal += taxAmt / 2;
        }
      });
    }

    if (est.labour && est.labour.length > 0) {
      est.labour.forEach(l => {
        const discount = l.discount || 0;
        const taxable = (l.rate || 0) - discount;
        const gstPercent = (l.gstPercent !== undefined && l.gstPercent !== null && l.gstPercent !== '') ? Number(l.gstPercent) : 18;
        const taxAmt = taxable * (gstPercent / 100);
        labourTotal += taxable;
        gstTotal += taxAmt;
        if (isInterstate) {
          igstTotal += taxAmt;
        } else {
          cgstTotal += taxAmt / 2;
          sgstTotal += taxAmt / 2;
        }
      });
    }

    const grandTotal = Math.round((partsTotal + labourTotal + gstTotal) * 100) / 100;

    printWindow.document.write(`
      <html>
        <head>
          <title>Proforma Estimate - ${est.estimateNo}</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              color: #333;
              margin: 0;
              padding: 20px;
              font-size: 11px;
              line-height: 1.4;
            }
            .invoice-box {
              max-width: 800px;
              margin: auto;
              border: 1px solid #eee;
              padding: 25px;
              box-shadow: 0 0 10px rgba(0, 0, 0, 0.05);
              background: #fff;
            }
            .header-table, .meta-table, .items-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            .header-table td {
              vertical-align: top;
            }
            .title {
              font-size: 24px;
              font-weight: 900;
              color: #4f46e5;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin: 0;
            }
            .subtitle {
              font-size: 10px;
              font-weight: bold;
              color: #666;
              margin: 2px 0 0 0;
              text-transform: uppercase;
              letter-spacing: 2px;
            }
            .company-details {
              text-align: right;
              font-size: 10px;
            }
            .company-name {
              font-size: 14px;
              font-weight: 900;
              color: #111;
              margin-bottom: 4px;
            }
            .meta-table td {
              border: 1px solid #111111;
              padding: 10px;
              width: 50%;
              vertical-align: top;
            }
            .section-title {
              font-size: 10px;
              font-weight: 800;
              color: #4f46e5;
              text-transform: uppercase;
              border-bottom: 1px solid #4f46e5;
              padding-bottom: 4px;
              margin-bottom: 8px;
            }
            .items-table th {
              background: #4f46e5;
              color: #fff;
              font-weight: bold;
              text-transform: uppercase;
              font-size: 9px;
              padding: 8px;
              border: 2px solid #000000;
              text-align: center;
            }
            .items-table td {
              padding: 8px;
              border: 2px solid #000000;
              text-align: center;
              vertical-align: middle;
            }
            .totals-table {
              width: 40%;
              margin-left: auto;
              border-collapse: collapse;
              margin-top: 10px;
            }
            .totals-table td {
              padding: 6px;
              border: 2px solid #000000;
            }
            .totals-table tr.grand-total td {
              background: #f3f4f6;
              font-weight: 900;
              font-size: 12px;
              color: #4f46e5;
              border-top: 2px solid #4f46e5;
            }
            .words {
              margin: 15px 0;
              padding: 10px;
              background: #f9fafb;
              border: 1px dashed #d1d5db;
              font-style: italic;
              font-weight: bold;
            }
            .footer-section {
              margin-top: 50px;
              display: flex;
              justify-content: space-between;
              page-break-inside: avoid;
            }
            .signature-box {
              text-align: center;
              border-top: 1px solid #111111;
              width: 200px;
              padding-top: 8px;
              margin-top: 30px;
              font-weight: bold;
              page-break-inside: avoid;
            }
            @media print {
              body { padding: 0; margin: 0; }
              .invoice-box { border: none; box-shadow: none; padding: 0; max-width: 100%; }
              button { display: none; }
              tr { page-break-inside: avoid; }
              thead { display: table-header-group; }
              .totals-table, .words, .footer-section, .signature-box { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="invoice-box">
            <table class="header-table">
              <tr>
                <td>
                  <div class="title">Proforma Estimate</div>
                  <div class="subtitle">MVSS AUTOMOBILES</div>
                </td>
                <td class="company-details">
                  <div class="company-name">MVSS AUTOMOBILES PRIVATE LIMITED</div>
                  <div>Sy. No. 25/1, Opp. Cine Planet, Beside PSR Convention</div>
                  <div>Kompally, Hyderabad, Telangana - 500014</div>
                  <div>GSTIN: <strong>36AAJCM4778P1ZI</strong> (State Code: 36)</div>
                  <div>Email: accounts@auto4m.in | Cell: {OWNER_SUPPORT_NUMBER}</div>
                </td>
              </tr>
            </table>

            <table class="meta-table">
              <tr>
                <td>
                  <div class="section-title">Estimate Details</div>
                  <table style="width:100%; border:none;">
                    <tr style="border:none;"><td style="border:none; padding:2px; font-weight:bold; width:35%;">Estimate No:</td><td style="border:none; padding:2px; font-family: monospace; font-size:12px; font-weight:bold;">${est.estimateNo}</td></tr>
                    <tr style="border:none;"><td style="border:none; padding:2px; font-weight:bold;">Date:</td><td style="border:none; padding:2px;">${dateStr}</td></tr>
                    <tr style="border:none;"><td style="border:none; padding:2px; font-weight:bold;">Job Card:</td><td style="border:none; padding:2px; font-family: monospace;">${jc.jobCardNo || 'N/A'}</td></tr>
                    <tr style="border:none;"><td style="border:none; padding:2px; font-weight:bold;">Status:</td><td style="border:none; padding:2px; text-transform:uppercase; font-weight:bold; color: #4f46e5">${est.status}</td></tr>
                  </table>
                </td>
                <td>
                  <div class="section-title">Customer & Vehicle Details</div>
                  <table style="width:100%; border:none;">
                    <tr style="border:none;"><td style="border:none; padding:2px; font-weight:bold; width:35%;">Customer Name:</td><td style="border:none; padding:2px;">${cust.name || 'N/A'}</td></tr>
                    <tr style="border:none;"><td style="border:none; padding:2px; font-weight:bold;">Address:</td><td style="border:none; padding:2px;">${cust.address || 'N/A'}</td></tr>
                    <tr style="border:none;"><td style="border:none; padding:2px; font-weight:bold;">Mobile:</td><td style="border:none; padding:2px;">${cust.mobile || 'N/A'}</td></tr>
                    <tr style="border:none;"><td style="border:none; padding:2px; font-weight:bold;">Vehicle Reg No:</td><td style="border:none; padding:2px; font-family: monospace; font-weight:bold; font-size:11px;">${veh.vehicleNumber || 'N/A'}</td></tr>
                    <tr style="border:none;"><td style="border:none; padding:2px; font-weight:bold;">Make/Model:</td><td style="border:none; padding:2px;">${veh.make || ''} ${veh.model || ''}</td></tr>
                  </table>
                </td>
              </tr>
            </table>

            <div class="section-title" style="margin-top: 15px;">A. Spare Parts Estimate</div>
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 5%;">Sl</th>
                  <th style="width: 30%; text-align: left;">Item Description</th>
                  <th style="width: 8%;">HSN</th>
                  <th style="width: 8%;">Qty</th>
                  <th style="width: 10%;">Rate</th>
                  <th style="width: 12%;">Gross Amt</th>
                  <th style="width: 12%;">Taxable Value</th>
                  <th style="width: 12%;">GST Split</th>
                  <th style="width: 13%;">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                ${partsRowsHtml}
              </tbody>
            </table>

            <div class="section-title" style="margin-top: 15px;">B. Labour / Services Estimate</div>
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 5%;">Sl</th>
                  <th style="width: 30%; text-align: left;">Labour / Service Description</th>
                  <th style="width: 8%;">SAC</th>
                  <th style="width: 8%;">Qty</th>
                  <th style="width: 10%;">Rate</th>
                  <th style="width: 12%;">Gross Amt</th>
                  <th style="width: 12%;">Taxable Value</th>
                  <th style="width: 12%;">GST Split</th>
                  <th style="width: 13%;">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                ${labourRowsHtml}
              </tbody>
            </table>

            <div class="words">
              Estimated Amount in Words: <strong>${convertNumberToWords(grandTotal)}</strong>
            </div>

            <table class="totals-table">
              <tr>
                <td>Estimated Parts Total:</td>
                <td style="text-align: right;">₹${partsTotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Estimated Labour Total:</td>
                <td style="text-align: right;">₹${labourTotal.toFixed(2)}</td>
              </tr>
              <tr style="font-weight: bold; border-top: 1px solid #eee; border-bottom: 1px solid #eee;">
                <td>Net Total (Taxable Amount):</td>
                <td style="text-align: right;">₹${(partsTotal + labourTotal).toFixed(2)}</td>
              </tr>
              ${isInterstate ? `
                <tr>
                  <td>Estimated IGST Total:</td>
                  <td style="text-align: right;">₹${igstTotal.toFixed(2)}</td>
                </tr>
              ` : `
                <tr>
                  <td>Estimated CGST Total:</td>
                  <td style="text-align: right;">₹${cgstTotal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Estimated SGST Total:</td>
                  <td style="text-align: right;">₹${sgstTotal.toFixed(2)}</td>
                </tr>
              `}
              <tr>
                <td>Total GST Amount:</td>
                <td style="text-align: right;">₹${gstTotal.toFixed(2)}</td>
              </tr>
              <tr class="grand-total">
                <td>Grand Total:</td>
                <td style="text-align: right;">₹${grandTotal.toFixed(2)}</td>
              </tr>
            </table>

            <div style="margin-top: 45px; display: flex; justify-content: space-between; gap: 20px; page-break-inside: avoid;">
              <div style="flex: 1; max-width: 340px; border: 2px solid #000; padding: 12px; border-radius: 8px; font-size: 8.5px; line-height: 1.5; text-align: left; box-sizing: border-box;">
                <strong style="display: block; font-size: 9px; margin-bottom: 6px; font-weight: bold; text-transform: uppercase;">Instructions / Terms & Conditions</strong>
                1. Goods once sold will not be taken back or exchanged.<br/>
                2. Payment should be made within the due date mentioned above.<br/>
                3. Please quote this invoice number for any communication.<br/>
                4. Subject to Hyderabad Jurisdiction only.
              </div>
              <div style="flex: 1; font-size: 8.5px; color: #666; font-style: italic; text-align: left; align-self: center;">
                <strong>Note:</strong> This is a proforma quote detailing estimated charges for parts and labour. Actual repair invoices may vary upon disassembly and discovery of additional faults. Authorized approval will be requested prior to undertaking extra repairs.
              </div>
            </div>

            <div class="footer-section" style="margin-top: 50px;">
              <div>
                <div style="font-weight: bold; font-size: 9px; margin-bottom: 8px;">Customer Signature</div>
                <div style="height: 45px; width: 180px; border-bottom: 1.5px dashed #000;"></div>
                <div style="font-size: 8px; color: #555; margin-top: 5px; font-weight: bold;">Customer Approval Sign</div>
              </div>
              <div>
                <div style="font-weight: bold; text-align: center;">For MVSS AUTOMOBILES PRIVATE LIMITED</div>
                <div class="signature-box" style="margin-top: 45px;">Authorized Signatory / Service Advisor</div>
              </div>
            </div>
          </div>
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

  const handleDownload = (est, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (token === 'mock_jwt_token_for_offline_demo') {
      printEstimate(est);
    } else {
      (async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/estimates/${est._id}/pdf`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!res.ok) throw new Error('Failed to retrieve PDF from server');
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `estimate-${est.estimateNo || 'latest'}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        } catch (err) {
          console.error('PDF download failed:', err);
          alert('Error downloading PDF: ' + err.message);
        }
      })();
    }
  };

  const handleDownloadCustomerPDF = (est, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (token === 'mock_jwt_token_for_offline_demo') {
      printEstimate(est);
    } else {
      (async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/estimates/${est._id}/customer-pdf`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!res.ok) throw new Error('Failed to retrieve Customer PDF from server');
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `customer-estimate-${est.estimateNo || 'latest'}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        } catch (err) {
          console.error('Customer PDF download failed:', err);
          alert('Error downloading Customer PDF: ' + err.message);
}
      })();
    }
  };

  const isAdvisorOrAdmin = ['Admin', 'Service', 'Spares', 'Accounts', 'Accounts Executive', 'Body Shop'].includes(user?.role);

  return (
    <div className="space-y-4 animate-fade-in p-1">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white">Proforma Estimates</h2>
          <p className="text-xs text-slate-400 font-semibold dark:text-slate-500">Track quotes, adjust itemizations, and capture customer approvals</p>
        </div>
        {isAdvisorOrAdmin && (
          <button
            onClick={() => setViewMode('create')}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10"
          >
            <Plus className="w-4 h-4" /> Create Estimate
          </button>
        )}
      </div>

      {/* Notifications Banner */}
      {notification && (
        <div className={`p-4 rounded-2xl border flex items-start justify-between gap-3 shadow-sm transition-all ${
          notification.type === 'success' 
            ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900 dark:bg-emerald-950/50 dark:border-emerald-800/80 dark:text-emerald-200' 
            : 'bg-rose-50/90 border-rose-200 text-rose-900 dark:bg-rose-950/50 dark:border-rose-800/80 dark:text-rose-200'
        }`}>
          <div className="flex items-start gap-3">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0" />
            )}
            <div>
              <h4 className="font-extrabold text-xs">{notification.title}</h4>
              <p className="text-xs mt-0.5 font-medium leading-relaxed">{notification.message}</p>
            </div>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 justify-between items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-855 p-3 rounded-2xl">
        <div className="flex flex-wrap gap-3 items-center flex-1">
          <div className="relative min-w-[250px] flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by estimate number, customer, vehicle registration..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 text-xs font-semibold focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-350 text-xs font-bold focus:outline-none"
          >
            <option value="">All Estimate Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Waiting for Approval">Waiting for Approval</option>
            <option value="Sent">Sent</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Revised">Revised</option>
          </select>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-extrabold uppercase text-slate-400 dark:text-slate-500 tracking-wider">PDF Type:</span>
          <select
            value={pdfType}
            onChange={(e) => setPdfType(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 text-xs font-bold focus:outline-none"
          >
            <option value="customer">Customer Estimate</option>
            <option value="gst">GST Estimate</option>
          </select>
        </div>
      </div>

      {/* Datatable */}
      <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
                <th className="p-4">Estimate Number</th>
                <th className="p-4">Job Card</th>
                <th className="p-4">Reg Number</th>
                <th className="p-4">Customer Name</th>
                <th className="p-4">Grand Total</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {estimates.length > 0 ? (
                estimates.map(est => {
                  let statusBg = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                  if (est.status === 'Waiting for Approval') statusBg = 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-300 dark:border-purple-800';
                  if (est.status === 'Sent') statusBg = 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400 border border-sky-300 dark:border-sky-800';
                  if (est.status === 'Approved') statusBg = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800';
                  if (est.status === 'Rejected') statusBg = 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400 border border-red-300 dark:border-red-800';
                  if (est.status === 'Revised') statusBg = 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-300 dark:border-amber-800';

                  const jc = est.jobCardId || {};
                  const cust = jc.customerId || {};
                  const veh = jc.vehicleId || {};

                  return (
                    <React.Fragment key={est._id}>
                      <tr
                        onClick={(e) => {
                          if (e.target.closest('button') || e.target.closest('a')) return;
                          setExpandedId(expandedId === est._id ? null : est._id);
                        }}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 cursor-pointer transition-all"
                      >
                        <td className="p-4 font-bold text-slate-800 dark:text-slate-200 font-mono">{est.estimateNo}</td>
                        <td className="p-4 font-semibold text-slate-650 dark:text-slate-350">{jc.jobCardNo || 'N/A'}</td>
                        <td className="p-4 font-bold text-slate-550 dark:text-slate-400 font-mono">{veh.vehicleNumber || 'N/A'}</td>
                        <td className="p-4 font-medium text-slate-550 dark:text-slate-400">{cust.name || 'Unknown'}</td>
                        <td className="p-4 font-bold text-slate-900 dark:text-white">
                          <div>
                            ₹{((est.manualOverride && est.manualGrandTotal !== undefined && est.manualGrandTotal !== null)
                              ? Number(est.manualGrandTotal)
                              : (est.status === 'Approved' && est.approvalMetadata?.finalAmount
                                ? Number(est.approvalMetadata.finalAmount)
                                : (est.totals?.grandTotal || 0))).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {est.manualOverride && (
                              <span className="block text-[8px] font-black uppercase text-amber-600 dark:text-amber-400">Manual Override</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] uppercase ${statusBg}`}>
                            {est.status}
                          </span>
                        </td>
                        <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-2 justify-end items-center">
                            {isAdvisorOrAdmin && ['Draft', 'Revised'].includes(est.status) && (
                              <button
                                onClick={(e) => handleSendCustomerEstimate(est, e)}
                                disabled={Boolean(sendingMap[est._id])}
                                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-sm transition-all"
                                title="Send Customer Estimate PDF to WhatsApp"
                              >
                                {sendingMap[est._id] ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>Sending...</span>
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-3 h-3" />
                                    <span>{est.status === 'Draft' ? 'Send' : 'Send Revised'}</span>
                                  </>
                                )}
                              </button>
                            )}
                            {isAdvisorOrAdmin && ['Sent', 'Waiting for Approval'].includes(est.status) && (() => {
                              const stage1History = est.whatsappHistory?.filter(h => h.stage === 'STAGE_1_ESTIMATION_READY') || [];
                              const stage1Sent = stage1History.some(h => ['sent', 'delivered', 'read'].includes(h.status));
                              const stage1Failed = stage1History.length > 0 && !stage1Sent;
                              const isRetryDelivery = stage1Failed || !stage1Sent;

                              return (
                                <button
                                  onClick={(e) => handleRetryApprovalNotification(est, e)}
                                  disabled={Boolean(sendingMap[est._id])}
                                  className={`px-2 py-1 ${isRetryDelivery ? 'bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400' : 'bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400'} text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm transition-all`}
                                  title={isRetryDelivery ? "Retry Stage 1 with PDF and Stage 2 Approval" : "Retry Stage 2 Approval Notification"}
                                >
                                  {sendingMap[est._id] ? <Loader2 className="w-3 h-3 animate-spin" /> : (isRetryDelivery ? <Send className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />)}
                                  <span>{isRetryDelivery ? 'Retry Delivery' : 'Retry Approval'}</span>
                                </button>
                              );
                            })()}
                            {isAdvisorOrAdmin && est.status === 'Approved' && (
                              <button
                                onClick={(e) => handleRetryApprovedNotification(est, e)}
                                disabled={Boolean(sendingMap[est._id])}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm transition-all"
                                title="Resend Stage 3 Approved WhatsApp Notification"
                              >
                                {sendingMap[est._id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                <span>Resend WhatsApp</span>
                              </button>
                            )}
                            {canApproveEstimate && ['Sent', 'Waiting for Approval'].includes(est.status) && (
                              <>
                                <button
                                  onClick={(e) => openApproveModal(est, e)}
                                  className="text-emerald-500 hover:text-emerald-700 p-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                                  title="Approve Estimate"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => updateStatus(est._id, 'Rejected', e)}
                                  className="text-red-500 hover:text-red-700 p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20"
                                  title="Reject Estimate"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {canApproveEstimate && est.status === 'Revised' && (
                              <>
                                <button
                                  onClick={(e) => openApproveModal(est, e)}
                                  disabled={isApproving}
                                  className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-750 px-2 py-1 rounded text-[10px] font-extrabold flex items-center gap-1 shadow-sm transition-all"
                                  title="Approve Revised Estimate"
                                >
                                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                  Approve Revised
                                </button>
                                <button
                                  onClick={(e) => updateStatus(est._id, 'Rejected', e)}
                                  className="text-red-500 hover:text-red-700 p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20"
                                  title="Reject Estimate"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {est.status === 'Approved' && (
                              <button
                                onClick={(e) => handleConvertInvoice(est, e)}
                                className="text-indigo-650 hover:text-indigo-700 font-bold px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-950/20"
                              >
                                Create Invoice
                              </button>
                            )}
                            {isAdvisorOrAdmin && est.status !== 'Approved' && (
                              <button
                                onClick={(e) => handleOpenEdit(est._id, e)}
                                className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850"
                                title="Edit Estimate"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                if (pdfType === 'customer') {
                                  handleDownloadCustomerPDF(est, e);
                                } else {
                                  handleDownload(est, e);
                                }
                              }}
                              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850"
                              title={`Download ${pdfType === 'customer' ? 'Customer' : 'GST'} Estimate`}
                            >
                              <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            </button>
                            {['Admin', 'Accounts', 'Accounts Executive'].includes(user?.role) && (
                              <button
                                onClick={(e) => handleDeleteEstimate(est._id, e)}
                                className="text-slate-400 hover:text-red-650 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850"
                                title="Delete Estimate"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {expandedId === est._id && (
                        <tr className="bg-slate-50/40 dark:bg-slate-900/10">
                          <td colSpan="7" className="p-4 border-b border-slate-200 dark:border-slate-800">
                            <div className="space-y-3 pl-4">
                              <div className="flex justify-between items-center">
                                <h5 className="font-extrabold uppercase text-[9px] text-slate-400 tracking-wider">
                                  Estimate Revision Logs ({est.revisionHistory?.length || 0})
                                </h5>
                                <div className="flex gap-2">
                                  <button
                                    onClick={(e) => handleDownloadCustomerPDF(est, e)}
                                    className="text-[9px] font-black uppercase text-sky-700 dark:text-sky-300 flex items-center gap-1 border border-sky-300/60 bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 rounded hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-all shadow-sm"
                                    title="Download Customer Estimate PDF"
                                  >
                                    <Download className="w-3 h-3 text-sky-600 dark:text-sky-400" /> Customer PDF
                                  </button>
                                  <button
                                    onClick={(e) => handleDownload(est, e)}
                                    className="text-[9px] font-black uppercase text-indigo-700 dark:text-indigo-300 flex items-center gap-1 border border-indigo-300/60 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all shadow-sm"
                                    title="Download GST Estimate PDF"
                                  >
                                    <Download className="w-3 h-3 text-indigo-600 dark:text-indigo-400" /> GST PDF
                                  </button>
                                </div>
                              </div>

                              {est.approvalMetadata && est.approvalMetadata.approvedByName && (
                                <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 p-2.5 rounded-xl text-[10px] text-emerald-800 dark:text-emerald-300 font-semibold flex items-center justify-between">
                                  <span>
                                    ✓ Approved by <strong>{est.approvalMetadata.approvedByName}</strong> on {new Date(est.approvalMetadata.approvedAt).toLocaleString('en-IN')}
                                  </span>
                                  <span className="font-mono font-bold">Final Amount: ₹{(est.approvalMetadata.finalAmount || est.totals?.grandTotal || 0).toLocaleString('en-IN')}</span>
                                </div>
                              )}
                              
                              {est.revisionHistory && est.revisionHistory.length > 0 ? (
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {est.revisionHistory.map((rev, rIdx) => (
                                    <div key={rIdx} className="py-2.5 flex justify-between items-center text-[10px] font-semibold text-slate-500">
                                      <div>
                                        <span className="font-bold text-slate-800 dark:text-slate-200">Revision v{rev.version}</span> - {new Date(rev.date).toLocaleString('en-IN')} | Status: <span className="font-black uppercase text-[8px]">{rev.status}</span>
                                        {rev.userName && <span className="text-slate-400"> (by {rev.userName})</span>}
                                        {rev.reason && <span className="text-slate-400 block text-[9px] italic mt-0.5">Note: {rev.reason}</span>}
                                      </div>
                                      <div className="font-mono text-slate-700 dark:text-slate-300 font-bold text-right">
                                        {rev.previousAmount ? <span className="text-slate-400 line-through mr-1">₹{rev.previousAmount.toLocaleString('en-IN')}</span> : null}
                                        <span>₹{(rev.newAmount || rev.totals?.grandTotal || 0).toLocaleString('en-IN')}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">No historical revisions logged. Revision snapshots are archived automatically when modifying estimates that have left Draft stage.</p>
                              )}

                              {/* WhatsApp Customer Estimate Delivery Audit */}
                              <div className="bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 space-y-2 mt-3">
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-1.5">
                                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                    <h5 className="font-extrabold uppercase text-[10px] text-slate-700 dark:text-slate-300 tracking-wider">
                                      WhatsApp Estimate Delivery History ({est.whatsappHistory?.length || 0})
                                    </h5>
                                  </div>
                                  {isAdvisorOrAdmin && (
                                    <button
                                      onClick={(e) => handleSendCustomerEstimate(est, e)}
                                      disabled={Boolean(sendingMap[est._id])}
                                      className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm transition-all"
                                      title="Dispatch Customer Estimate PDF to WhatsApp"
                                    >
                                      {sendingMap[est._id] ? (
                                        <>
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          <span>Sending...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Send className="w-3 h-3" />
                                          <span>{est.status === 'Draft' ? 'Send Customer PDF via WhatsApp' : 'Resend Customer PDF via WhatsApp'}</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>

                                {est.whatsappHistory && est.whatsappHistory.length > 0 ? (
                                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                    {est.whatsappHistory.map((hist, hIdx) => {
                                      const isSuccess = hist.status === 'sent' || hist.status === 'delivered' || hist.status === 'read';
                                      let stageLabel = 'Stage 1: Ready';
                                      let stageBadgeBg = 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-300 dark:border-sky-800';
                                      if (hist.stage === 'STAGE_1_ESTIMATION_READY') {
                                        stageLabel = 'Stage 1: Ready';
                                        stageBadgeBg = 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-300 dark:border-sky-800';
                                      } else if (hist.stage === 'STAGE_2_ESTIMATION_AWAITING_APPROVAL') {
                                        stageLabel = 'Stage 2: Awaiting Approval';
                                        stageBadgeBg = 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-800';
                                      } else if (hist.stage === 'STAGE_3_ESTIMATION_APPROVED') {
                                        stageLabel = 'Stage 3: Approved';
                                        stageBadgeBg = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
                                      } else if (hist.stage === 'DOCUMENT_ESTIMATE_PDF') {
                                        stageLabel = 'Customer PDF Document';
                                        stageBadgeBg = 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';
                                      }

                                      let statusBadgeStyle = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800';
                                      let statusLabel = (hist.status || 'unknown').toUpperCase();
                                      if (hist.status === 'read') {
                                        statusBadgeStyle = 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800';
                                        statusLabel = 'READ';
                                      } else if (hist.status === 'delivered') {
                                        statusBadgeStyle = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
                                        statusLabel = 'DELIVERED';
                                      } else if (hist.status === 'sent') {
                                        statusBadgeStyle = 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-300 dark:border-sky-800';
                                        statusLabel = 'SENT';
                                      } else if (hist.status === 'pending_session') {
                                        statusBadgeStyle = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800';
                                        statusLabel = 'PENDING 24H WINDOW';
                                      } else if (hist.status === 'pending') {
                                        statusBadgeStyle = 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';
                                        statusLabel = 'PENDING';
                                      }

                                      return (
                                        <div key={hIdx} className="py-2.5 flex flex-wrap justify-between items-center gap-2 text-[10px]">
                                          <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ${stageBadgeBg}`}>
                                                {stageLabel}
                                              </span>
                                              <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase border ${statusBadgeStyle}`}>
                                                {statusLabel}
                                              </span>
                                              <span className="font-semibold text-slate-700 dark:text-slate-200">
                                                To: {hist.recipientPhone || 'Customer'}
                                              </span>
                                              {hist.templateName && (
                                                <span className="font-mono text-slate-500 dark:text-slate-400">
                                                  [{hist.templateName}]
                                                </span>
                                              )}
                                              {hist.messageId && (
                                                <span className="font-mono text-[8.5px] text-slate-400 dark:text-slate-500" title={`Message ID: ${hist.messageId}`}>
                                                  wamid: ...{hist.messageId.slice(-8)}
                                                </span>
                                              )}
                                              {hist.finalAmount ? (
                                                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                                                  ₹{Number(hist.finalAmount).toLocaleString('en-IN')}
                                                </span>
                                              ) : null}
                                              {hist.sentByName && (
                                                <span className="text-slate-400">by {hist.sentByName}</span>
                                              )}
                                              <span className="text-slate-400">
                                                • Sent: {new Date(hist.sentAt).toLocaleString('en-IN')}
                                              </span>
                                              {hist.readAt ? (
                                                <span className="text-cyan-600 dark:text-cyan-400 font-bold">
                                                  • Read: {new Date(hist.readAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                              ) : hist.deliveredAt ? (
                                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                                  • Delivered: {new Date(hist.deliveredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                              ) : null}
                                            </div>
                                            {hist.error && (
                                              <p className="text-rose-600 dark:text-rose-400 font-medium text-[9.5px]">
                                                Error: {hist.error}
                                              </p>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            {!isSuccess && hist.stage === 'STAGE_1_ESTIMATION_READY' && isAdvisorOrAdmin && (
                                              <button
                                                onClick={(e) => handleRetryApprovalNotification(est, e)}
                                                disabled={Boolean(sendingMap[est._id])}
                                                className="px-2 py-0.5 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white rounded text-[9px] font-bold shadow-sm"
                                                title="Retry Stage 1 with PDF and Stage 2 Approval"
                                              >
                                                Retry Stage 1 & 2
                                              </button>
                                            )}
                                            {!isSuccess && hist.stage === 'STAGE_2_ESTIMATION_AWAITING_APPROVAL' && isAdvisorOrAdmin && (
                                              <button
                                                onClick={(e) => handleRetryApprovalNotification(est, e)}
                                                disabled={Boolean(sendingMap[est._id])}
                                                className="px-2 py-0.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded text-[9px] font-bold shadow-sm"
                                                title="Retry Stage 2 Approval Notification"
                                              >
                                                Retry Stage 2
                                              </button>
                                            )}
                                            {!isSuccess && hist.stage === 'STAGE_3_ESTIMATION_APPROVED' && isAdvisorOrAdmin && (
                                              <button
                                                onClick={(e) => handleRetryApprovedNotification(est, e)}
                                                disabled={Boolean(sendingMap[est._id])}
                                                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded text-[9px] font-bold shadow-sm"
                                              >
                                                Retry Stage 3
                                              </button>
                                            )}
                                            {(hist.pdfUrl || hist.stage === 'DOCUMENT_ESTIMATE_PDF' || hist.stage === 'STAGE_1_ESTIMATION_READY') && (
                                              <a
                                                href={hist.pdfUrl || `${API_BASE_URL}/estimates/public/customer-pdf/${est._id}.pdf`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-[9.5px] text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 font-semibold"
                                                title="View Customer Estimate PDF"
                                              >
                                                <ExternalLink className="w-3 h-3" />
                                                View Sent PDF
                                              </a>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500 italic py-1">
                                    No WhatsApp delivery attempts recorded yet for this estimate.
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-slate-400 dark:text-slate-500 font-semibold">
                    No proforma estimates found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal for Estimate Approval */}
      {approvalModalEst && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in" onClick={() => !isApproving && setApprovalModalEst(null)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Check className="w-5 h-5 text-emerald-500" />
                  {approvalModalEst.status === 'Revised' ? 'Approve Revised Estimate' : 'Approve Estimate'}
                </h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  Confirm final negotiated amounts before releasing to workshop & customer
                </p>
              </div>
              <button
                onClick={() => !isApproving && setApprovalModalEst(null)}
                disabled={isApproving}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-100 dark:border-slate-850">
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Estimate No</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{approvalModalEst.estimateNo}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Vehicle</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{approvalModalEst.jobCardId?.vehicleId?.vehicleNumber || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Customer</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{approvalModalEst.jobCardId?.customerId?.name || 'Walk-in'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Status</span>
                  <span className="font-black uppercase text-[10px] text-amber-600 dark:text-amber-400">{approvalModalEst.status}</span>
                </div>
              </div>

              <div className="border border-slate-150 dark:border-slate-800 rounded-xl p-3 space-y-2 bg-white dark:bg-slate-900">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Parts Subtotal:</span>
                  <span className="font-mono font-semibold">₹{(approvalModalEst.totals?.partsTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Labour Subtotal:</span>
                  <span className="font-mono font-semibold">₹{(approvalModalEst.totals?.labourTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>GST Total:</span>
                  <span className="font-mono font-semibold">₹{(approvalModalEst.totals?.gstTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-800 pt-2 text-sm font-black text-slate-900 dark:text-white">
                  <span>Final Approved Amount:</span>
                  <span className="text-base text-emerald-600 dark:text-emerald-400 font-mono">
                    ₹{((approvalModalEst.manualOverride && approvalModalEst.manualGrandTotal !== undefined && approvalModalEst.manualGrandTotal !== null)
                      ? Number(approvalModalEst.manualGrandTotal)
                      : (approvalModalEst.totals?.grandTotal || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {approvalModalEst.revisionHistory?.length > 0 && (
                <div className="text-[11px] text-slate-400 italic bg-amber-50/50 dark:bg-amber-950/20 p-2.5 rounded-lg border border-amber-200/40">
                  ℹ️ This estimate has <strong>{approvalModalEst.revisionHistory.length} previous revision(s)</strong>. Approving will register approval for the latest revision and dispatch the customer WhatsApp notification once.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setApprovalModalEst(null)}
                disabled={isApproving}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApproval}
                disabled={isApproving}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all"
              >
                {isApproving ? (
                  <>Approving...</>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Confirm & Approve
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
