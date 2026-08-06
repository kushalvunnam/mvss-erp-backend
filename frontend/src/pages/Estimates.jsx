import React, { useState, useEffect } from 'react';
import { API_BASE_URL, OWNER_SUPPORT_NUMBER } from '../config';
import { Search, Plus, Edit2, FileCheck, Check, X, Download, FileText, Trash2 } from 'lucide-react';
import EstimateForm from './EstimateForm';

export default function Estimates({ token, user, setActiveTab }) {
  const [estimates, setEstimates] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list', 'create', 'edit'
  const [selectedEstId, setSelectedEstId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [pdfType, setPdfType] = useState('gst');

  const fetchEstimates = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/estimates?status=${statusFilter}`, {
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
  }, [statusFilter, viewMode]);

  const updateStatus = async (id, newStatus, e) => {
    e.stopPropagation(); // prevent row click
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
              CGST: ₹${cgst.toFixed(2)} (${(p.gstPercent/2)}%)<br/>
              SGST: ₹${sgst.toFixed(2)} (${(p.gstPercent/2)}%)
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
              CGST: ₹${cgst.toFixed(2)} (${(l.gstPercent/2)}%)<br/>
              SGST: ₹${sgst.toFixed(2)} (${(l.gstPercent/2)}%)
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

    if (est.parts && est.parts.length > 0) {
      est.parts.forEach(p => {
        const discount = p.discount || 0;
        const taxable = (p.qty || 1) * (p.rate || 0) - discount;
        const gstPercent = (p.gstPercent !== undefined && p.gstPercent !== null && p.gstPercent !== '') ? Number(p.gstPercent) : 18;
        const taxAmt = taxable * (gstPercent / 100);
        partsTotal += taxable;
        gstTotal += taxAmt;
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
              border: 1px solid #e5e7eb;
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
              border: 1px solid #4f46e5;
              text-align: center;
            }
            .items-table td {
              padding: 8px;
              border: 1px solid #e5e7eb;
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
              border: 1px solid #e5e7eb;
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
              margin-top: 40px;
              display: flex;
              justify-content: space-between;
            }
            .signature-box {
              text-align: center;
              border-top: 1px solid #ccc;
              width: 200px;
              padding-top: 8px;
              margin-top: 30px;
              font-weight: bold;
            }
            @media print {
              body { padding: 0; }
              .invoice-box { border: none; box-shadow: none; padding: 0; }
              button { display: none; }
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
              <tr>
                <td>Estimated GST Total:</td>
                <td style="text-align: right;">₹${gstTotal.toFixed(2)}</td>
              </tr>
              <tr class="grand-total">
                <td>Grand Total:</td>
                <td style="text-align: right;">₹${grandTotal.toFixed(2)}</td>
              </tr>
            </table>

            <div style="margin-top: 20px; font-size: 9px; color: #666; font-style: italic;">
              <strong>Note:</strong> This is a proforma quote detailing estimated charges for parts and labour. Actual repair invoices may vary upon disassembly and discovery of additional faults. Authorized approval will be requested prior to undertaking extra repairs.
            </div>

            <div class="footer-section">
              <div>
                <div style="font-weight: bold; text-decoration: underline; margin-bottom: 5px;">Customer Approval Sign</div>
                <div style="height: 40px;"></div>
              </div>
              <div>
                <div style="font-weight: bold; text-align: center;">For MVSS AUTOMOBILES PRIVATE LIMITED</div>
                <div class="signature-box">Service Advisor</div>
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

  const isAdvisorOrAdmin = user?.role === 'Admin' || user?.role === 'Service' || user?.role === 'Spares' || user?.role === 'Accounts Executive';

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

      {/* Filters */}
      <div className="flex flex-wrap gap-3 justify-between items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-855 p-3 rounded-2xl">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-350 text-xs font-bold focus:outline-none"
        >
          <option value="">All Estimate Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Sent">Sent</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
          <option value="Revised">Revised</option>
        </select>
        
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-extrabold uppercase text-slate-400 dark:text-slate-500 tracking-wider">PDF Type:</span>
          <select
            value={pdfType}
            onChange={(e) => setPdfType(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-350 text-xs font-bold focus:outline-none"
          >
            <option value="gst">GST Estimate</option>
            <option value="customer">Customer Estimate</option>
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
                  let statusBg = 'bg-slate-50 text-slate-600 dark:bg-slate-800';
                  if (est.status === 'Sent') statusBg = 'bg-sky-50 text-sky-700 dark:bg-sky-950/20 dark:text-sky-400';
                  if (est.status === 'Approved') statusBg = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400';
                  if (est.status === 'Rejected') statusBg = 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400';
                  if (est.status === 'Revised') statusBg = 'bg-purple-50 text-purple-750 dark:bg-purple-950/20 dark:text-purple-400';

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
                        <td className="p-4 font-bold text-slate-900 dark:text-white">₹{est.totals.grandTotal.toLocaleString('en-IN')}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] uppercase ${statusBg}`}>
                            {est.status}
                          </span>
                        </td>
                        <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-2 justify-end">
                            {isAdvisorOrAdmin && est.status === 'Draft' && (
                              <button
                                onClick={(e) => updateStatus(est._id, 'Sent', e)}
                                className="text-slate-400 hover:text-sky-600 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Mark as Sent"
                              >
                                Sent
                              </button>
                            )}
                            {isAdvisorOrAdmin && est.status === 'Sent' && (
                              <>
                                <button
                                  onClick={(e) => updateStatus(est._id, 'Approved', e)}
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
                            {['Admin', 'Accounts Executive'].includes(user?.role) && (
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
                                <h5 className="font-extrabold uppercase text-[9px] text-slate-400 tracking-wider">Estimate Revision Logs ({est.revisionHistory?.length || 0})</h5>
                                <div className="flex gap-2">
                                  <button
                                    onClick={(e) => {
                                      if (pdfType === 'customer') {
                                        handleDownloadCustomerPDF(est, e);
                                      } else {
                                        handleDownload(est, e);
                                      }
                                    }}
                                    className="text-[9px] font-black uppercase text-indigo-650 dark:text-indigo-400 flex items-center gap-1 border border-indigo-200/40 bg-indigo-50/20 px-2 py-0.5 rounded"
                                  >
                                    <Download className="w-3 h-3" /> Get {pdfType === 'customer' ? 'Customer' : 'GST'} PDF
                                  </button>
                                </div>
                              </div>
                              
                              {est.revisionHistory && est.revisionHistory.length > 0 ? (
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {est.revisionHistory.map((rev, rIdx) => (
                                    <div key={rIdx} className="py-2.5 flex justify-between items-center text-[10px] font-semibold text-slate-500">
                                      <div>
                                        <span className="font-bold text-slate-800 dark:text-slate-200">Revision v{rev.version}</span> - {new Date(rev.date).toLocaleString('en-IN')} | Final Status: <span className="font-black uppercase text-[8px]">{rev.status}</span>
                                      </div>
                                      <div className="font-mono text-slate-700 dark:text-slate-300 font-bold">
                                        Parts: ₹{rev.totals?.partsTotal?.toLocaleString('en-IN')} | Labour: ₹{rev.totals?.labourTotal?.toLocaleString('en-IN')} | Grand Total: <strong className="text-indigo-650 dark:text-indigo-400">₹{rev.totals?.grandTotal?.toLocaleString('en-IN')}</strong>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">No historical revisions logged. Revision snapshots are archived automatically when modifying estimates that have left Draft stage.</p>
                              )}
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
    </div>
  );
}
