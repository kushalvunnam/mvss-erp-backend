import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { 
  FileText, 
  Search, 
  Calendar, 
  Download, 
  Printer, 
  Users, 
  Wrench, 
  History, 
  Filter, 
  RefreshCw,
  TrendingUp,
  IndianRupee,
  FileCheck,
  Percent,
  Package,
  AlertTriangle,
  ClipboardList
} from 'lucide-react';

export default function Reports({ token, user }) {
  const [jobCards, setJobCards] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Tab groups: 'workshop', 'financial', 'inventory', 'employees'
  const userRole = user?.role || 'Guest';
  const isAdminOrAccounts = userRole === 'Admin' || userRole === 'Accounts';
  const isSpares = userRole === 'Spares';
  const isService = userRole === 'Service';

  const [activeGroup, setActiveGroup] = useState('workshop');
  const [selectedReport, setSelectedReport] = useState('jobcards');
  
  // Date Preset: 'daily', 'weekly', 'monthly', 'custom'
  const [datePreset, setDatePreset] = useState('custom');
  
  // Filters state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };
      
      const promises = [
        fetch(`${API_BASE_URL}/jobcards`, { headers }),
        fetch(`${API_BASE_URL}/invoices`, { headers }),
        fetch(`${API_BASE_URL}/inventory`, { headers })
      ];

      // Only fetch employees if Admin or Accounts (to prevent authorization errors for Service/Spares role)
      if (isAdminOrAccounts) {
        promises.push(fetch(`${API_BASE_URL}/employees`, { headers }));
      }

      const results = await Promise.all(promises);

      if (results[0].ok) {
        const jcData = await results[0].json();
        setJobCards(jcData);
      }
      if (results[1].ok) {
        const invData = await results[1].json();
        setInvoices(invData);
      }
      if (results[2].ok) {
        const invItemsData = await results[2].json();
        setInventory(invItemsData);
      }
      if (isAdminOrAccounts && results[3] && results[3].ok) {
        const empData = await results[3].json();
        setEmployees(empData);
      }
    } catch (err) {
      console.error('Failed to load reports data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  // Set preset dates
  const handleApplyPreset = (preset) => {
    setDatePreset(preset);
    const today = new Date();
    
    if (preset === 'daily') {
      const dateStr = today.toISOString().split('T')[0];
      setStartDate(dateStr);
      setEndDate(dateStr);
    } else if (preset === 'weekly') {
      const past = new Date();
      past.setDate(today.getDate() - 7);
      setStartDate(past.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);
    } else if (preset === 'monthly') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  // Local helper to filter array based on date limits and search query
  const applyGenericFilters = (list, dateField = 'date') => {
    return list.filter(item => {
      // 1. Date Filter (only if custom date field exists)
      if (dateField && item[dateField]) {
        if (startDate) {
          const itemDate = new Date(item[dateField]);
          const sDate = new Date(startDate);
          sDate.setHours(0,0,0,0);
          if (itemDate < sDate) return false;
        }
        if (endDate) {
          const itemDate = new Date(item[dateField]);
          const eDate = new Date(endDate);
          eDate.setHours(23,59,59,999);
          if (itemDate > eDate) return false;
        }
      }

      // 2. Search Query matches
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        
        if (item.partName) {
          // Inventory search
          const name = (item.partName || '').toLowerCase();
          const pNo = (item.partNumber || '').toLowerCase();
          const brand = (item.brand || '').toLowerCase();
          const cat = (item.category || '').toLowerCase();
          if (!name.includes(q) && !pNo.includes(q) && !brand.includes(q) && !cat.includes(q)) {
            return false;
          }
        } else if (item.employeeId) {
          // Employee search
          const name = (item.name || '').toLowerCase();
          const empId = (item.employeeId || '').toLowerCase();
          const dept = (item.department || '').toLowerCase();
          if (!name.includes(q) && !empId.includes(q) && !dept.includes(q)) {
            return false;
          }
        } else if (item.invoiceNo) {
          // Invoice search
          const invNo = (item.invoiceNo || '').toLowerCase();
          const custName = (item.customerId?.name || '').toLowerCase();
          const vehNo = (item.vehicleId?.vehicleNumber || '').toLowerCase();
          if (!invNo.includes(q) && !custName.includes(q) && !vehNo.includes(q)) {
            return false;
          }
        } else {
          // Job Card search
          const jcNo = (item.jobCardNo || '').toLowerCase();
          const custName = (item.customerId?.name || '').toLowerCase();
          const vehNo = (item.vehicleId?.vehicleNumber || '').toLowerCase();
          const techName = (item.technicianName || '').toLowerCase();
          const advName = (item.serviceAdvisorName || item.serviceAdvisorId?.name || '').toLowerCase();
          if (!jcNo.includes(q) && !custName.includes(q) && !vehNo.includes(q) && !techName.includes(q) && !advName.includes(q)) {
            return false;
          }
        }
      }

      // 3. Vehicle selection compatibility
      if (selectedReport === 'vehicle_history' && selectedVehicle) {
        const vNo = (item.vehicleId?.vehicleNumber || '').toLowerCase();
        if (vNo !== selectedVehicle.toLowerCase()) return false;
      }

      return true;
    });
  };

  // Get data list for active report
  const getReportData = () => {
    if (activeGroup === 'workshop') {
      const baseList = applyGenericFilters(jobCards, 'date');
      switch (selectedReport) {
        case 'active':
          return baseList.filter(jc => jc.status !== 'Delivered');
        case 'completed':
          return baseList.filter(jc => jc.status === 'Delivered');
        case 'pending':
          return baseList.filter(jc => ['Created', 'Inspect Stage', 'Estimation', 'Customer Approval', 'Waiting for Customer Approval'].includes(jc.status));
        case 'technician':
          const techGroups = {};
          baseList.forEach(jc => {
            const tech = jc.technicianName || 'Unassigned';
            if (!techGroups[tech]) techGroups[tech] = { name: tech, active: 0, completed: 0, total: 0 };
            techGroups[tech].total += 1;
            if (jc.status === 'Delivered') techGroups[tech].completed += 1;
            else techGroups[tech].active += 1;
          });
          return Object.values(techGroups);
        case 'advisor':
          const advGroups = {};
          baseList.forEach(jc => {
            const adv = jc.serviceAdvisorName || jc.serviceAdvisorId?.name || 'Unassigned';
            if (!advGroups[adv]) advGroups[adv] = { name: adv, active: 0, completed: 0, total: 0 };
            advGroups[adv].total += 1;
            if (jc.status === 'Delivered') advGroups[adv].completed += 1;
            else advGroups[adv].active += 1;
          });
          return Object.values(advGroups);
        case 'jobcards':
        case 'vehicle_history':
        default:
          return baseList;
      }
    } else if (activeGroup === 'financial') {
      const baseList = applyGenericFilters(invoices, 'date');
      switch (selectedReport) {
        case 'revenue':
          return baseList.filter(inv => inv.status === 'Finalized');
        case 'payment_collection':
          return baseList.filter(inv => inv.status === 'Finalized' && inv.amountPaid > 0);
        case 'pending_payment':
          return baseList.filter(inv => inv.status === 'Finalized' && inv.paymentStatus !== 'Paid');
        case 'invoice_report':
          return baseList;
        case 'gst_report':
          return baseList.filter(inv => inv.status === 'Finalized');
        case 'tax_collection':
          const taxBrackets = {
            '18%': { bracket: '18% GST', taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            '28%': { bracket: '28% GST', taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            '12%': { bracket: '12% GST', taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            '5%':  { bracket: '5% GST',  taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            '0%':  { bracket: 'Exempted (0%)', taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
          };
          baseList.filter(inv => inv.status === 'Finalized').forEach(inv => {
            const isInterstate = inv.gstDetails?.isInterstate || false;
            (inv.parts || []).forEach(p => {
              const base = (p.qty || 0) * (p.rate || 0);
              const pct = Number(p.gstPercent) || 0;
              const tax = base * (pct / 100);
              const key = `${pct}%`;
              if (!taxBrackets[key]) {
                taxBrackets[key] = { bracket: `${pct}% GST`, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
              }
              taxBrackets[key].taxable += base;
              if (isInterstate) taxBrackets[key].igst += tax;
              else { taxBrackets[key].cgst += tax / 2; taxBrackets[key].sgst += tax / 2; }
              taxBrackets[key].total += tax;
            });
            (inv.labour || []).forEach(l => {
              const base = l.rate || 0;
              const pct = Number(l.gstPercent) || 0;
              const tax = base * (pct / 100);
              const key = `${pct}%`;
              if (!taxBrackets[key]) {
                taxBrackets[key] = { bracket: `${pct}% GST`, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
              }
              taxBrackets[key].taxable += base;
              if (isInterstate) taxBrackets[key].igst += tax;
              else { taxBrackets[key].cgst += tax / 2; taxBrackets[key].sgst += tax / 2; }
              taxBrackets[key].total += tax;
            });
          });
          return Object.values(taxBrackets).filter(t => t.taxable > 0);
        default:
          return baseList;
      }
    } else if (activeGroup === 'inventory') {
      // Inventory reports filters
      const baseList = applyGenericFilters(inventory, '');
      
      switch (selectedReport) {
        case 'low_stock':
          return baseList.filter(item => (item.stockQuantity || 0) <= (item.lowStockThreshold || 5));
        case 'parts_usage':
          // Scan parts consumption from invoices (invoices can filter by date)
          const filteredInvs = applyGenericFilters(invoices.filter(inv => inv.status === 'Finalized'), 'date');
          const usageMap = {};
          filteredInvs.forEach(inv => {
            (inv.parts || []).forEach(p => {
              const key = p.partNo || p.name;
              if (!usageMap[key]) {
                usageMap[key] = { partNumber: p.partNo || 'N/A', partName: p.name, quantityUsed: 0, totalRevenue: 0 };
              }
              usageMap[key].quantityUsed += p.qty || 0;
              usageMap[key].totalRevenue += (p.qty * p.rate) || 0;
            });
          });
          return Object.values(usageMap);
        case 'inventory_value':
        case 'stock_report':
        default:
          return baseList;
      }
    } else {
      // Employee reports filters
      const baseList = applyGenericFilters(employees, '');
      const filteredJobcards = applyGenericFilters(jobCards, 'date');
      const filteredInvoices = applyGenericFilters(invoices.filter(inv => inv.status === 'Finalized'), 'date');

      switch (selectedReport) {
        case 'attendance':
          // Process attendance array inside date range
          return baseList.map(emp => {
            let present = 0, absent = 0, leave = 0, halfDay = 0;
            (emp.attendance || []).forEach(a => {
              const aDate = new Date(a.date);
              if (startDate && aDate < new Date(startDate)) return;
              if (endDate && aDate > new Date(endDate)) return;
              
              if (a.status === 'Present') present++;
              else if (a.status === 'Absent') absent++;
              else if (a.status === 'Leave') leave++;
              else if (a.status === 'Half Day') halfDay++;
            });
            return { name: emp.name, employeeId: emp.employeeId, department: emp.department, present, absent, leave, halfDay };
          });
        case 'salary_report':
          // List salaries processed
          const salaryList = [];
          baseList.forEach(emp => {
            (emp.salaries || []).forEach(sal => {
              const salDate = new Date(sal.generatedAt);
              if (startDate && salDate < new Date(startDate)) return;
              if (endDate && salDate > new Date(endDate)) return;
              
              salaryList.push({
                name: emp.name,
                employeeId: emp.employeeId,
                department: emp.department,
                monthYear: sal.monthYear,
                basicSalary: sal.basicSalary,
                allowances: (sal.specialAllowance || 0) + (sal.otherAllowance || 0),
                deductions: (sal.deductions || 0) + (sal.advances || 0),
                netSalary: sal.netSalary
              });
            });
          });
          return salaryList;
        case 'technician_performance':
          // Filter technicians and aggregate jobcard stats
          const techPerform = {};
          filteredJobcards.forEach(jc => {
            const tech = jc.technicianName;
            if (!tech) return;
            if (!techPerform[tech]) {
              techPerform[tech] = { name: tech, totalJobs: 0, completedJobs: 0, activeJobs: 0, totalRevenue: 0 };
            }
            techPerform[tech].totalJobs++;
            if (jc.status === 'Delivered') {
              techPerform[tech].completedJobs++;
            } else {
              techPerform[tech].activeJobs++;
            }
          });
          // Calculate labour revenue generated by each technician
          filteredInvoices.forEach(inv => {
            const matchingJc = jobCards.find(jc => jc._id === String(inv.jobCardId?._id || inv.jobCardId));
            const tech = matchingJc?.technicianName;
            if (tech && techPerform[tech]) {
              techPerform[tech].totalRevenue += inv.totals?.labourTotal || 0;
            }
          });
          return Object.values(techPerform);
        case 'bodyshop_performance':
          // Group jobs handled in the body shop
          const bodyPerform = {};
          filteredJobcards.filter(jc => jc.status === 'Body Shop' || jc.workCategory === 'B/P').forEach(jc => {
            const tech = jc.technicianName || 'Body Shop Team';
            if (!bodyPerform[tech]) {
              bodyPerform[tech] = { name: tech, totalJobs: 0, completedJobs: 0, activeJobs: 0, totalRevenue: 0 };
            }
            bodyPerform[tech].totalJobs++;
            if (jc.status === 'Delivered') {
              bodyPerform[tech].completedJobs++;
            } else {
              bodyPerform[tech].activeJobs++;
            }
          });
          // Calculate body shop revenue
          filteredInvoices.forEach(inv => {
            const matchingJc = jobCards.find(jc => jc._id === String(inv.jobCardId?._id || inv.jobCardId));
            if (matchingJc && (matchingJc.status === 'Body Shop' || matchingJc.workCategory === 'B/P')) {
              const tech = matchingJc.technicianName || 'Body Shop Team';
              if (bodyPerform[tech]) {
                bodyPerform[tech].totalRevenue += inv.totals?.labourTotal || 0;
              }
            }
          });
          return Object.values(bodyPerform);
        default:
          return baseList;
      }
    }
  };

  const getReportTitle = () => {
    if (activeGroup === 'workshop') {
      switch (selectedReport) {
        case 'jobcards': return 'Job Card General Report';
        case 'active': return 'Active Job Cards Report';
        case 'completed': return 'Completed Job Cards Report';
        case 'pending': return 'Pending Job Cards Report';
        case 'technician': return 'Technician Wise Job Summary';
        case 'advisor': return 'Service Advisor Wise Job Summary';
        case 'vehicle_history': return 'Vehicle History Report';
        default: return 'Workshop Report';
      }
    } else if (activeGroup === 'financial') {
      switch (selectedReport) {
        case 'revenue': return 'Revenue Collection Report';
        case 'payment_collection': return 'Payment Settlement Log';
        case 'pending_payment': return 'Outstanding Receivables Report';
        case 'invoice_report': return 'General Invoices Audit Report';
        case 'gst_report': return 'GST Taxation Invoice Split Report';
        case 'tax_collection': return 'GST Tax Collection Summary';
        default: return 'Financial Report';
      }
    } else if (activeGroup === 'inventory') {
      switch (selectedReport) {
        case 'stock_report': return 'Current Inventory Stock Report';
        case 'low_stock': return 'Low Stock Reorder Alert Report';
        case 'parts_usage': return 'Spare Parts Usage & Consumption Report';
        case 'inventory_value': return 'Inventory Asset Valuation Report';
        default: return 'Inventory Report';
      }
    } else {
      switch (selectedReport) {
        case 'attendance': return 'Employee Attendance Summary Report';
        case 'salary_report': return 'Processed Salaries Register';
        case 'technician_performance': return 'Technician Performance Analytics';
        case 'bodyshop_performance': return 'Body Shop Servicing Performance';
        default: return 'Employee Report';
      }
    }
  };

  const clearFiltersSelection = () => {
    setDatePreset('custom');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
    setSelectedVehicle('');
  };

  const logReportExport = (format) => {
    fetch(`${API_BASE_URL}/dashboard/auditlogs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        action: 'REPORT_EXPORTED',
        details: `Exported ${selectedReport.toUpperCase()} report in ${format.toUpperCase()} format`
      })
    }).catch(err => console.warn('Failed to log report export:', err));

    // Fallback for offline demo mode
    if (token === 'mock_jwt_token_for_offline_demo' && user) {
      const mockLogs = JSON.parse(localStorage.getItem('mock_auditlogs') || '[]');
      mockLogs.unshift({
        _id: 'mock_log_' + Date.now(),
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        userId: user.id || 'demo_user',
        userName: user.name,
        role: user.role,
        userRole: user.role,
        module: 'Report',
        action: 'REPORT_EXPORTED',
        details: `Exported ${selectedReport.toUpperCase()} report in ${format.toUpperCase()} format`,
        ipAddress: '127.0.0.1'
      });
      localStorage.setItem('mock_auditlogs', JSON.stringify(mockLogs));
      window.dispatchEvent(new Event('storage'));
    }
  };

  // Excel / CSV Exporter
  const handleExportExcel = () => {
    const data = getReportData();
    let headers = [];
    let rows = [];

    if (activeGroup === 'workshop') {
      if (selectedReport === 'technician' || selectedReport === 'advisor') {
        headers = ['Sl No', 'Employee Name', 'Active Jobs', 'Completed Jobs', 'Total Jobs'];
        rows = data.map((item, idx) => [idx + 1, item.name, item.active, item.completed, item.total]);
      } else {
        headers = ['Sl No', 'Job Card No', 'Date', 'Vehicle Reg No', 'Customer Name', 'Advisor', 'Technician', 'Status'];
        rows = data.map((jc, idx) => [
          idx + 1,
          jc.jobCardNo,
          new Date(jc.date).toLocaleDateString('en-IN'),
          jc.vehicleId?.vehicleNumber || 'N/A',
          jc.customerId?.name || 'N/A',
          jc.serviceAdvisorName || jc.serviceAdvisorId?.name || 'N/A',
          jc.technicianName || 'N/A',
          jc.status
        ]);
      }
    } else if (activeGroup === 'financial') {
      if (selectedReport === 'tax_collection') {
        headers = ['GST Slab', 'Taxable Amount', 'CGST Collected', 'SGST Collected', 'IGST Collected', 'Total Tax Collected'];
        rows = data.map(t => [t.bracket, t.taxable.toFixed(2), t.cgst.toFixed(2), t.sgst.toFixed(2), t.igst.toFixed(2), t.total.toFixed(2)]);
      } else if (selectedReport === 'gst_report') {
        headers = ['Invoice No', 'Date', 'Customer Name', 'GSTIN', 'Taxable Billed', 'CGST', 'SGST', 'IGST', 'Grand Total'];
        rows = data.map(inv => [
          inv.invoiceNo,
          new Date(inv.date).toLocaleDateString('en-IN'),
          inv.customerId?.name || 'N/A',
          inv.customerId?.gstNumber || 'N/A',
          ((inv.totals?.partsTotal || 0) + (inv.totals?.labourTotal || 0)).toFixed(2),
          (inv.totals?.cgstTotal || 0).toFixed(2),
          (inv.totals?.sgstTotal || 0).toFixed(2),
          (inv.totals?.igstTotal || 0).toFixed(2),
          (inv.totals?.grandTotal || 0).toFixed(2)
        ]);
      } else if (selectedReport === 'pending_payment') {
        headers = ['Invoice No', 'Date', 'Customer Name', 'Grand Total', 'Paid Amount', 'Due Amount', 'Payment Status'];
        rows = data.map(inv => [
          inv.invoiceNo,
          new Date(inv.date).toLocaleDateString('en-IN'),
          inv.customerId?.name || 'N/A',
          (inv.totals?.grandTotal || 0).toFixed(2),
          (inv.amountPaid || 0).toFixed(2),
          ((inv.totals?.grandTotal || 0) - (inv.amountPaid || 0)).toFixed(2),
          inv.paymentStatus
        ]);
      } else if (selectedReport === 'payment_collection') {
        headers = ['Invoice No', 'Date', 'Customer Name', 'Payment Method', 'Amount Billed', 'Amount Settled'];
        rows = data.map(inv => [
          inv.invoiceNo,
          new Date(inv.date).toLocaleDateString('en-IN'),
          inv.customerId?.name || 'N/A',
          inv.paymentMethod || 'N/A',
          (inv.totals?.grandTotal || 0).toFixed(2),
          (inv.amountPaid || 0).toFixed(2)
        ]);
      } else {
        headers = ['Invoice No', 'Date', 'Customer Name', 'Billed Base Total', 'GST Paid', 'Grand Total', 'Status'];
        rows = data.map(inv => [
          inv.invoiceNo,
          new Date(inv.date).toLocaleDateString('en-IN'),
          inv.customerId?.name || 'N/A',
          ((inv.totals?.partsTotal || 0) + (inv.totals?.labourTotal || 0)).toFixed(2),
          (inv.totals?.gstTotal || 0).toFixed(2),
          (inv.totals?.grandTotal || 0).toFixed(2),
          inv.status
        ]);
      }
    } else if (activeGroup === 'inventory') {
      if (selectedReport === 'parts_usage') {
        headers = ['Sl No', 'Part Number', 'Part Name', 'Quantity Used', 'Total Revenue Generated'];
        rows = data.map((item, idx) => [idx + 1, item.partNumber, item.partName, item.quantityUsed, item.totalRevenue.toFixed(2)]);
      } else if (selectedReport === 'inventory_value') {
        headers = ['Sl No', 'Part Number', 'Part Name', 'Stock Qty', 'Purchase Rate', 'Asset Value'];
        rows = data.map((item, idx) => [idx + 1, item.partNumber, item.partName, item.stockQuantity, item.purchasePrice.toFixed(2), (item.stockQuantity * item.purchasePrice).toFixed(2)]);
      } else {
        headers = ['Sl No', 'Part Number', 'Part Name', 'Brand', 'Category', 'Stock Qty', 'Low Limit', 'Selling Rate'];
        rows = data.map((item, idx) => [idx + 1, item.partNumber, item.partName, item.brand, item.category, item.stockQuantity, item.lowStockThreshold, item.sellingPrice.toFixed(2)]);
      }
    } else {
      // Employees Excel
      if (selectedReport === 'attendance') {
        headers = ['Employee ID', 'Employee Name', 'Department', 'Present Days', 'Absent Days', 'Leave Days', 'Half Days'];
        rows = data.map(item => [item.employeeId, item.name, item.department, item.present, item.absent, item.leave, item.halfDay]);
      } else if (selectedReport === 'salary_report') {
        headers = ['Employee ID', 'Employee Name', 'Department', 'Month-Year', 'Basic Salary', 'Allowances', 'Deductions', 'Net Salary'];
        rows = data.map(item => [item.employeeId, item.name, item.department, item.monthYear, item.basicSalary.toFixed(2), item.allowances.toFixed(2), item.deductions.toFixed(2), item.netSalary.toFixed(2)]);
      } else {
        headers = ['Employee/Team Name', 'Total Jobs Assigned', 'Completed Jobs', 'Active Jobs', 'Labour Revenue Generated'];
        rows = data.map(item => [item.name, item.totalJobs, item.completedJobs, item.activeJobs, item.totalRevenue.toFixed(2)]);
      }
    }

    const csvContent = [
      headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map(row => row.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedReport}_report_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    logReportExport('CSV');
  };

  // PDF print Exporter
  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to export PDF reports.');
      return;
    }

    const data = getReportData();
    const title = getReportTitle();
    
    let tableHeadersHtml = '';
    let tableRowsHtml = '';

    if (activeGroup === 'workshop') {
      if (selectedReport === 'technician' || selectedReport === 'advisor') {
        tableHeadersHtml = `
          <th>Sl No</th><th>Employee Name</th><th>Active Jobs</th><th>Completed Jobs</th><th>Total Jobs</th>
        `;
        data.forEach((item, idx) => {
          tableRowsHtml += `
            <tr>
              <td>${idx + 1}</td><td>${item.name}</td><td>${item.active}</td><td>${item.completed}</td><td>${item.total}</td>
            </tr>
          `;
        });
      } else {
        tableHeadersHtml = `
          <th>Sl No</th><th>Job Card No</th><th>Date</th><th>Vehicle Reg No</th><th>Customer Name</th><th>Advisor</th><th>Technician</th><th>Status</th>
        `;
        data.forEach((jc, idx) => {
          tableRowsHtml += `
            <tr>
              <td>${idx + 1}</td>
              <td style="font-family: monospace; font-weight: bold;">${jc.jobCardNo}</td>
              <td>${new Date(jc.date).toLocaleDateString('en-IN')}</td>
              <td style="font-family: monospace; font-weight: bold;">${jc.vehicleId?.vehicleNumber || 'N/A'}</td>
              <td>${jc.customerId?.name || 'N/A'}</td>
              <td>${jc.serviceAdvisorName || jc.serviceAdvisorId?.name || 'N/A'}</td>
              <td>${jc.technicianName || 'N/A'}</td>
              <td><span style="font-weight: bold; text-transform: uppercase; font-size: 9px;">${jc.status}</span></td>
            </tr>
          `;
        });
      }
    } else if (activeGroup === 'financial') {
      if (selectedReport === 'tax_collection') {
        tableHeadersHtml = `
          <th>GST Slab</th><th>Taxable Amount</th><th>CGST Collected</th><th>SGST Collected</th><th>IGST Collected</th><th>Total GST Collected</th>
        `;
        data.forEach(t => {
          tableRowsHtml += `
            <tr>
              <td style="font-weight:bold;">${t.bracket}</td>
              <td>₹${t.taxable.toFixed(2)}</td>
              <td>₹${t.cgst.toFixed(2)}</td>
              <td>₹${t.sgst.toFixed(2)}</td>
              <td>₹${t.igst.toFixed(2)}</td>
              <td style="font-weight:bold; color: #1e3a8a;">₹${t.total.toFixed(2)}</td>
            </tr>
          `;
        });
      } else if (selectedReport === 'gst_report') {
        tableHeadersHtml = `
          <th>Invoice No</th><th>Date</th><th>Customer Name</th><th>GSTIN</th><th>Taxable Billed</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Grand Total</th>
        `;
        data.forEach(inv => {
          tableRowsHtml += `
            <tr>
              <td style="font-family:monospace; font-weight:bold;">${inv.invoiceNo}</td>
              <td>${new Date(inv.date).toLocaleDateString('en-IN')}</td>
              <td>${inv.customerId?.name || 'N/A'}</td>
              <td style="font-family:monospace;">${inv.customerId?.gstNumber || 'N/A'}</td>
              <td>₹${((inv.totals?.partsTotal || 0) + (inv.totals?.labourTotal || 0)).toFixed(2)}</td>
              <td>₹${(inv.totals?.cgstTotal || 0).toFixed(2)}</td>
              <td>₹${(inv.totals?.sgstTotal || 0).toFixed(2)}</td>
              <td>₹${(inv.totals?.igstTotal || 0).toFixed(2)}</td>
              <td style="font-weight:bold;">₹${(inv.totals?.grandTotal || 0).toFixed(2)}</td>
            </tr>
          `;
        });
      } else if (selectedReport === 'pending_payment') {
        tableHeadersHtml = `
          <th>Invoice No</th><th>Date</th><th>Customer Name</th><th>Grand Total</th><th>Paid Amount</th><th>Due Amount</th><th>Payment Status</th>
        `;
        data.forEach(inv => {
          tableRowsHtml += `
            <tr>
              <td style="font-family:monospace; font-weight:bold;">${inv.invoiceNo}</td>
              <td>${new Date(inv.date).toLocaleDateString('en-IN')}</td>
              <td>${inv.customerId?.name || 'N/A'}</td>
              <td>₹${(inv.totals?.grandTotal || 0).toFixed(2)}</td>
              <td>₹${(inv.amountPaid || 0).toFixed(2)}</td>
              <td style="font-weight:bold; color:#dc2626;">₹${((inv.totals?.grandTotal || 0) - (inv.amountPaid || 0)).toFixed(2)}</td>
              <td style="font-weight:bold; text-transform:uppercase; font-size:9px;">${inv.paymentStatus}</td>
            </tr>
          `;
        });
      } else if (selectedReport === 'payment_collection') {
        tableHeadersHtml = `
          <th>Invoice No</th><th>Date</th><th>Customer Name</th><th>Payment Method</th><th>Amount Billed</th><th>Amount Settled</th>
        `;
        data.forEach(inv => {
          tableRowsHtml += `
            <tr>
              <td style="font-family:monospace; font-weight:bold;">${inv.invoiceNo}</td>
              <td>${new Date(inv.date).toLocaleDateString('en-IN')}</td>
              <td>${inv.customerId?.name || 'N/A'}</td>
              <td style="font-weight:bold;">${inv.paymentMethod || 'N/A'}</td>
              <td>₹${(inv.totals?.grandTotal || 0).toFixed(2)}</td>
              <td style="font-weight:bold; color:#16a34a;">₹${(inv.amountPaid || 0).toFixed(2)}</td>
            </tr>
          `;
        });
      } else {
        tableHeadersHtml = `
          <th>Invoice No</th><th>Date</th><th>Customer Name</th><th>Base Taxable</th><th>GST Collected</th><th>Grand Total</th><th>Status</th>
        `;
        data.forEach(inv => {
          tableRowsHtml += `
            <tr>
              <td style="font-family:monospace; font-weight:bold;">${inv.invoiceNo}</td>
              <td>${new Date(inv.date).toLocaleDateString('en-IN')}</td>
              <td>${inv.customerId?.name || 'N/A'}</td>
              <td>₹${((inv.totals?.partsTotal || 0) + (inv.totals?.labourTotal || 0)).toFixed(2)}</td>
              <td>₹${(inv.totals?.gstTotal || 0).toFixed(2)}</td>
              <td style="font-weight:bold;">₹${(inv.totals?.grandTotal || 0).toFixed(2)}</td>
              <td><span style="font-weight:bold; text-transform:uppercase; font-size:9px;">${inv.status}</span></td>
            </tr>
          `;
        });
      }
    } else if (activeGroup === 'inventory') {
      // Inventory Report PDF
      if (selectedReport === 'parts_usage') {
        tableHeadersHtml = `
          <th>Sl No</th><th>Part Number</th><th>Part Name</th><th>Quantity Used</th><th>Revenue Generated</th>
        `;
        data.forEach((item, idx) => {
          tableRowsHtml += `
            <tr>
              <td>${idx + 1}</td>
              <td style="font-family: monospace; font-weight: bold;">${item.partNumber}</td>
              <td>${item.partName}</td>
              <td>${item.quantityUsed}</td>
              <td style="font-weight: bold;">₹${item.totalRevenue.toFixed(2)}</td>
            </tr>
          `;
        });
      } else if (selectedReport === 'inventory_value') {
        tableHeadersHtml = `
          <th>Sl No</th><th>Part Number</th><th>Part Name</th><th>Stock Qty</th><th>Purchase Rate</th><th>Asset Value</th>
        `;
        data.forEach((item, idx) => {
          tableRowsHtml += `
            <tr>
              <td>${idx + 1}</td>
              <td style="font-family: monospace; font-weight: bold;">${item.partNumber}</td>
              <td>${item.partName}</td>
              <td>${item.stockQuantity}</td>
              <td>₹${item.purchasePrice.toFixed(2)}</td>
              <td style="font-weight: bold; color: #1e3a8a;">₹${(item.stockQuantity * item.purchasePrice).toFixed(2)}</td>
            </tr>
          `;
        });
      } else {
        tableHeadersHtml = `
          <th>Sl No</th><th>Part Number</th><th>Part Name</th><th>Brand</th><th>Category</th><th>Stock Qty</th><th>Low Limit</th><th>Selling Rate</th>
        `;
        data.forEach((item, idx) => {
          tableRowsHtml += `
            <tr>
              <td>${idx + 1}</td>
              <td style="font-family: monospace; font-weight: bold;">${item.partNumber}</td>
              <td>${item.partName}</td>
              <td>${item.brand || 'N/A'}</td>
              <td>${item.category || 'N/A'}</td>
              <td style="font-weight: bold; color: ${item.stockQuantity <= item.lowStockThreshold ? 'red' : 'inherit'};">${item.stockQuantity}</td>
              <td>${item.lowStockThreshold}</td>
              <td>₹${item.sellingPrice.toFixed(2)}</td>
            </tr>
          `;
        });
      }
    } else {
      // Employees Report PDF
      if (selectedReport === 'attendance') {
        tableHeadersHtml = `
          <th>Employee ID</th><th>Employee Name</th><th>Department</th><th>Present</th><th>Absent</th><th>Leave</th><th>Half Day</th>
        `;
        data.forEach(item => {
          tableRowsHtml += `
            <tr>
              <td style="font-family: monospace; font-weight: bold;">${item.employeeId}</td>
              <td>${item.name}</td>
              <td>${item.department}</td>
              <td style="color: green; font-weight: bold;">${item.present}</td>
              <td style="color: red; font-weight: bold;">${item.absent}</td>
              <td style="color: orange;">${item.leave}</td>
              <td style="color: blue;">${item.halfDay}</td>
            </tr>
          `;
        });
      } else if (selectedReport === 'salary_report') {
        tableHeadersHtml = `
          <th>Employee ID</th><th>Employee Name</th><th>Department</th><th>Month-Year</th><th>Basic Salary</th><th>Allowances</th><th>Deductions</th><th>Net Salary</th>
        `;
        data.forEach(item => {
          tableRowsHtml += `
            <tr>
              <td style="font-family: monospace; font-weight: bold;">${item.employeeId}</td>
              <td>${item.name}</td>
              <td>${item.department}</td>
              <td>${item.monthYear}</td>
              <td>₹${item.basicSalary.toFixed(2)}</td>
              <td>₹${item.allowances.toFixed(2)}</td>
              <td>₹${item.deductions.toFixed(2)}</td>
              <td style="font-weight: bold; color: green;">₹${item.netSalary.toFixed(2)}</td>
            </tr>
          `;
        });
      } else {
        tableHeadersHtml = `
          <th>Employee/Team Name</th><th>Total Jobs Assigned</th><th>Completed Jobs</th><th>Active Jobs</th><th>Labour Revenue Generated</th>
        `;
        data.forEach(item => {
          tableRowsHtml += `
            <tr>
              <td style="font-weight: bold;">${item.name}</td>
              <td>${item.totalJobs}</td>
              <td>${item.completedJobs}</td>
              <td>${item.activeJobs}</td>
              <td style="font-weight: bold; color: #1e3a8a;">₹${item.totalRevenue.toFixed(2)}</td>
            </tr>
          `;
        });
      }
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; font-size: 11px; padding: 20px; color: #333; }
            h2 { text-align: center; color: #1e3a8a; margin-bottom: 2px; }
            h4 { text-align: center; color: #555; margin-top: 2px; text-transform: uppercase; font-size: 9px; letter-spacing: 1px; }
            .meta { margin-bottom: 25px; font-size: 10px; color: #666; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background: #1e3a8a; color: white; padding: 8px; font-size: 9px; border: 1px solid #1e3a8a; text-transform: uppercase; }
            td { padding: 8px; border: 1px solid #e5e7eb; text-align: center; }
            tr:nth-child(even) { background: #f9fafb; }
            @media print {
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h2>MVSS Automobiles Private Limited</h2>
          <h4>${title}</h4>
          <div class="meta">
            <strong>Generated On:</strong> ${new Date().toLocaleString('en-IN')} | 
            <strong>Total Records:</strong> ${data.length}
            ${startDate ? ` | <strong>From:</strong> ${startDate}` : ''}
            ${endDate ? ` | <strong>To:</strong> ${endDate}` : ''}
          </div>
          <table>
            <thead>
              <tr>${tableHeadersHtml}</tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();

    logReportExport('PDF');
  };

  const filteredData = getReportData();
  const uniqueVehiclesList = Array.from(new Set(jobCards.map(jc => jc.vehicleId?.vehicleNumber).filter(Boolean)));

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl max-w-6xl mx-auto select-none animate-fade-in space-y-6">
      
      {/* Upper header */}
      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" /> Workshop Reports Console
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
            Export excel sheets and print workshop servicing history logs
          </p>
        </div>
        <button
          onClick={fetchData}
          className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-50 dark:bg-slate-800/80 p-2 rounded-xl border border-slate-250/20"
          title="Refresh Data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Main Group Toggles */}
      <div className="flex flex-wrap border-b border-slate-100 dark:border-slate-800 pb-3 gap-2">
        <button
          onClick={() => {
            setActiveGroup('workshop');
            setSelectedReport('jobcards');
            clearFiltersSelection();
          }}
          className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
            activeGroup === 'workshop' 
              ? 'border-indigo-650 text-indigo-600 font-bold' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Servicing & Workshop Reports
        </button>
        
        {(isAdminOrAccounts || isSpares) && (
          <button
            onClick={() => {
              setActiveGroup('inventory');
              setSelectedReport('stock_report');
              clearFiltersSelection();
            }}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
              activeGroup === 'inventory' 
                ? 'border-indigo-650 text-indigo-600 font-bold' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Inventory & Stock Reports
          </button>
        )}

        {isAdminOrAccounts && (
          <>
            <button
              onClick={() => {
                setActiveGroup('financial');
                setSelectedReport('revenue');
                clearFiltersSelection();
              }}
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                activeGroup === 'financial' 
                  ? 'border-indigo-650 text-indigo-600 font-bold' 
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Financial & Tax Reports
            </button>
            <button
              onClick={() => {
                setActiveGroup('employees');
                setSelectedReport('attendance');
                clearFiltersSelection();
              }}
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                activeGroup === 'employees' 
                  ? 'border-indigo-650 text-indigo-600 font-bold' 
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Employee & Salary Reports
            </button>
          </>
        )}
      </div>

      {/* Report selector tabs */}
      <div className="flex flex-wrap gap-2">
        {activeGroup === 'workshop' && (
          <>
            {[
              { id: 'jobcards', name: 'Job Card Report', icon: FileText },
              { id: 'active', name: 'Active Jobs', icon: RefreshCw },
              { id: 'completed', name: 'Completed Jobs', icon: CheckCircle2 },
              { id: 'pending', name: 'Pending Jobs', icon: Clock },
              { id: 'technician', name: 'Technician Jobs', icon: Wrench },
              { id: 'advisor', name: 'Advisor Jobs', icon: Users },
              { id: 'vehicle_history', name: 'Vehicle History', icon: History }
            ].map(report => {
              const Icon = report.icon || FileText;
              const isSelected = selectedReport === report.id;
              return (
                <button
                  key={report.id}
                  onClick={() => {
                    setSelectedReport(report.id);
                    clearFiltersSelection();
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    isSelected 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' 
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-350 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {report.name}
                </button>
              );
            })}
          </>
        )}

        {activeGroup === 'financial' && (
          <>
            {[
              { id: 'revenue', name: 'Revenue Report', icon: IndianRupee },
              { id: 'payment_collection', name: 'Payment Collection', icon: FileCheck },
              { id: 'pending_payment', name: 'Pending Payments', icon: Clock },
              { id: 'invoice_report', name: 'Invoices Report', icon: FileText },
              { id: 'gst_report', name: 'GST Report', icon: Percent },
              { id: 'tax_collection', name: 'Tax Collection', icon: TrendingUp }
            ].map(report => {
              const Icon = report.icon || IndianRupee;
              const isSelected = selectedReport === report.id;
              return (
                <button
                  key={report.id}
                  onClick={() => {
                    setSelectedReport(report.id);
                    clearFiltersSelection();
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    isSelected 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' 
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-350 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {report.name}
                </button>
              );
            })}
          </>
        )}

        {activeGroup === 'inventory' && (
          <>
            {[
              { id: 'stock_report', name: 'Stock Report', icon: Package },
              { id: 'low_stock', name: 'Low Stock Report', icon: AlertTriangle },
              { id: 'parts_usage', name: 'Parts Usage Report', icon: ClipboardList },
              { id: 'inventory_value', name: 'Inventory Value Report', icon: IndianRupee }
            ].map(report => {
              const Icon = report.icon || Package;
              const isSelected = selectedReport === report.id;
              return (
                <button
                  key={report.id}
                  onClick={() => {
                    setSelectedReport(report.id);
                    clearFiltersSelection();
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    isSelected 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' 
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-350 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {report.name}
                </button>
              );
            })}
          </>
        )}

        {activeGroup === 'employees' && (
          <>
            {[
              { id: 'attendance', name: 'Attendance Report', icon: Users },
              { id: 'salary_report', name: 'Salary Report', icon: IndianRupee },
              { id: 'technician_performance', name: 'Technician Performance', icon: Wrench },
              { id: 'bodyshop_performance', name: 'Body Shop Performance', icon: ClipboardList }
            ].map(report => {
              const Icon = report.icon || Users;
              const isSelected = selectedReport === report.id;
              return (
                <button
                  key={report.id}
                  onClick={() => {
                    setSelectedReport(report.id);
                    clearFiltersSelection();
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    isSelected 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' 
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-350 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {report.name}
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* Date Presets selector */}
      <div className="flex gap-2 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-2xl border border-slate-205/30 w-fit">
        {[
          { id: 'daily', name: 'Daily (Today)' },
          { id: 'weekly', name: 'Weekly (Last 7d)' },
          { id: 'monthly', name: 'Monthly (Calendar)' },
          { id: 'custom', name: 'Custom Range' }
        ].map(preset => (
          <button
            key={preset.id}
            onClick={() => handleApplyPreset(preset.id)}
            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
              datePreset === preset.id 
                ? 'bg-white dark:bg-slate-900 text-indigo-650 shadow-sm border border-slate-200 dark:border-slate-850'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Filter panel inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-950/20 p-5 rounded-2xl border border-slate-205/30">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
            Start Date
          </label>
          <input
            type="date"
            disabled={datePreset !== 'custom'}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3.5 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
            End Date
          </label>
          <input
            type="date"
            disabled={datePreset !== 'custom'}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3.5 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none disabled:opacity-50"
          />
        </div>

        {selectedReport === 'vehicle_history' ? (
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Select Vehicle
            </label>
            <select
              value={selectedVehicle}
              onChange={(e) => setSelectedVehicle(e.target.value)}
              className="w-full px-3.5 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none"
            >
              <option value="">-- Choose Registration No --</option>
              {uniqueVehiclesList.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Search Queries
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search report fields..."
                className="w-full pl-10 pr-3 py-2 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none"
              />
            </div>
          </div>
        )}

        <div className="flex items-end">
          <button
            type="button"
            onClick={clearFiltersSelection}
            className="w-full py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-all"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Export Controls & List */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-xs font-black text-slate-800 dark:text-slate-250 uppercase tracking-wider">
            {getReportTitle()} <strong className="text-indigo-650 ml-1">({filteredData.length} records)</strong>
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-extrabold uppercase tracking-wide"
            >
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-extrabold uppercase tracking-wide"
            >
              <Printer className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400 font-semibold uppercase tracking-wider">
              Loading report details...
            </div>
          ) : filteredData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/85 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
                    {activeGroup === 'workshop' ? (
                      selectedReport === 'technician' || selectedReport === 'advisor' ? (
                        <>
                          <th className="p-4 w-[10%]">Sl</th>
                          <th className="p-4">Employee Name</th>
                          <th className="p-4">Active Jobs</th>
                          <th className="p-4">Completed Jobs</th>
                          <th className="p-4">Total Jobs</th>
                        </>
                      ) : (
                        <>
                          <th className="p-4 w-[8%]">Sl</th>
                          <th className="p-4">Job Card No</th>
                          <th className="p-4">Date</th>
                          <th className="p-4">Reg Number</th>
                          <th className="p-4">Customer Name</th>
                          <th className="p-4">Advisor</th>
                          <th className="p-4">Technician</th>
                          <th className="p-4">Status</th>
                        </>
                      )
                    ) : activeGroup === 'financial' ? (
                      selectedReport === 'tax_collection' ? (
                        <>
                          <th className="p-4">GST Slab</th>
                          <th className="p-4">Taxable Amount</th>
                          <th className="p-4">CGST Collected</th>
                          <th className="p-4">SGST Collected</th>
                          <th className="p-4">IGST Collected</th>
                          <th className="p-4">Total Tax</th>
                        </>
                      ) : selectedReport === 'gst_report' ? (
                        <>
                          <th className="p-4">Invoice No</th>
                          <th className="p-4">Date</th>
                          <th className="p-4">Customer Name</th>
                          <th className="p-4">GSTIN</th>
                          <th className="p-4">Taxable Billed</th>
                          <th className="p-4">CGST</th>
                          <th className="p-4">SGST</th>
                          <th className="p-4">IGST</th>
                          <th className="p-4">Grand Total</th>
                        </>
                      ) : selectedReport === 'pending_payment' ? (
                        <>
                          <th className="p-4">Invoice No</th>
                          <th className="p-4">Date</th>
                          <th className="p-4">Customer Name</th>
                          <th className="p-4">Grand Total</th>
                          <th className="p-4">Paid Amount</th>
                          <th className="p-4">Due Amount</th>
                          <th className="p-4">Payment Status</th>
                        </>
                      ) : selectedReport === 'payment_collection' ? (
                        <>
                          <th className="p-4">Invoice No</th>
                          <th className="p-4">Date</th>
                          <th className="p-4">Customer Name</th>
                          <th className="p-4">Payment Method</th>
                          <th className="p-4">Amount Billed</th>
                          <th className="p-4">Amount Settled</th>
                        </>
                      ) : (
                        <>
                          <th className="p-4">Invoice No</th>
                          <th className="p-4">Date</th>
                          <th className="p-4">Customer Name</th>
                          <th className="p-4">Base Taxable</th>
                          <th className="p-4">GST Collected</th>
                          <th className="p-4">Grand Total</th>
                          <th className="p-4">Status</th>
                        </>
                      )
                    ) : activeGroup === 'inventory' ? (
                      selectedReport === 'parts_usage' ? (
                        <>
                          <th className="p-4">Sl</th>
                          <th className="p-4">Part Number</th>
                          <th className="p-4">Part Name</th>
                          <th className="p-4">Quantity Used</th>
                          <th className="p-4">Revenue Generated</th>
                        </>
                      ) : selectedReport === 'inventory_value' ? (
                        <>
                          <th className="p-4">Sl</th>
                          <th className="p-4">Part Number</th>
                          <th className="p-4">Part Name</th>
                          <th className="p-4">Stock Qty</th>
                          <th className="p-4">Purchase Price</th>
                          <th className="p-4">Asset Valuation</th>
                        </>
                      ) : (
                        <>
                          <th className="p-4">Sl</th>
                          <th className="p-4">Part Number</th>
                          <th className="p-4">Part Name</th>
                          <th className="p-4">Brand</th>
                          <th className="p-4">Category</th>
                          <th className="p-4">Stock Qty</th>
                          <th className="p-4">Low Limit</th>
                          <th className="p-4">Selling Price</th>
                        </>
                      )
                    ) : (
                      // Employees reports
                      selectedReport === 'attendance' ? (
                        <>
                          <th className="p-4">Employee ID</th>
                          <th className="p-4">Employee Name</th>
                          <th className="p-4">Department</th>
                          <th className="p-4">Present</th>
                          <th className="p-4">Absent</th>
                          <th className="p-4">Leave</th>
                          <th className="p-4">Half Day</th>
                        </>
                      ) : selectedReport === 'salary_report' ? (
                        <>
                          <th className="p-4">Employee ID</th>
                          <th className="p-4">Employee Name</th>
                          <th className="p-4">Department</th>
                          <th className="p-4">Month-Year</th>
                          <th className="p-4">Basic Salary</th>
                          <th className="p-4">Allowances</th>
                          <th className="p-4">Deductions</th>
                          <th className="p-4">Net Salary</th>
                        </>
                      ) : (
                        <>
                          <th className="p-4">Employee/Team Name</th>
                          <th className="p-4">Total Jobs Assigned</th>
                          <th className="p-4">Completed Jobs</th>
                          <th className="p-4">Active Jobs</th>
                          <th className="p-4">Labour Revenue</th>
                        </>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-slate-800/50">
                  {activeGroup === 'workshop' ? (
                    selectedReport === 'technician' || selectedReport === 'advisor' ? (
                      filteredData.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all font-semibold">
                          <td className="p-4">{idx + 1}</td>
                          <td className="p-4 font-bold text-slate-800 dark:text-white">{item.name}</td>
                          <td className="p-4 text-amber-600">{item.active}</td>
                          <td className="p-4 text-emerald-600">{item.completed}</td>
                          <td className="p-4 text-indigo-650 font-black">{item.total}</td>
                        </tr>
                      ))
                    ) : (
                      filteredData.map((jc, idx) => (
                        <tr key={jc._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all font-semibold">
                          <td className="p-4 font-semibold text-slate-400">{idx + 1}</td>
                          <td className="p-4 font-bold text-slate-855 dark:text-slate-200 font-mono">{jc.jobCardNo}</td>
                          <td className="p-4 font-semibold text-slate-550 dark:text-slate-400">
                            {new Date(jc.date).toLocaleDateString('en-IN')}
                          </td>
                          <td className="p-4 font-bold text-slate-555 dark:text-slate-400 font-mono tracking-wider">
                            {jc.vehicleId?.vehicleNumber || 'N/A'}
                          </td>
                          <td className="p-4 font-medium text-slate-550 dark:text-slate-400">
                            {jc.customerId?.name || 'N/A'}
                          </td>
                          <td className="p-4 font-semibold text-slate-550 dark:text-slate-400">
                            {jc.serviceAdvisorName || jc.serviceAdvisorId?.name || 'N/A'}
                          </td>
                          <td className="p-4 font-semibold text-slate-550 dark:text-slate-400">
                            {jc.technicianName || 'N/A'}
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] uppercase ${
                              jc.status === 'Delivered'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20'
                            }`}>
                              {jc.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )
                  ) : activeGroup === 'financial' ? (
                    selectedReport === 'tax_collection' ? (
                      filteredData.map((t, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all font-semibold text-center">
                          <td className="p-4 font-black text-slate-800 dark:text-white">{t.bracket}</td>
                          <td className="p-4">₹{t.taxable.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-slate-600">₹{t.cgst.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-slate-600">₹{t.sgst.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-slate-600">₹{t.igst.toLocaleString('en-IN')}</td>
                          <td className="p-4 font-bold text-indigo-650">₹{t.total.toLocaleString('en-IN')}</td>
                        </tr>
                      ))
                    ) : selectedReport === 'gst_report' ? (
                      filteredData.map(inv => (
                        <tr key={inv._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all font-semibold">
                          <td className="p-4 font-bold text-slate-800 dark:text-white font-mono">{inv.invoiceNo}</td>
                          <td className="p-4 text-slate-500">{new Date(inv.date).toLocaleDateString('en-IN')}</td>
                          <td className="p-4 text-slate-700 dark:text-slate-300">{inv.customerId?.name || 'N/A'}</td>
                          <td className="p-4 font-mono text-slate-500">{inv.customerId?.gstNumber || 'N/A'}</td>
                          <td className="p-4">₹{(((inv.totals?.partsTotal || 0) + (inv.totals?.labourTotal || 0))).toLocaleString('en-IN')}</td>
                          <td className="p-4 text-slate-500">₹{(inv.totals?.cgstTotal || 0).toLocaleString('en-IN')}</td>
                          <td className="p-4 text-slate-500">₹{(inv.totals?.sgstTotal || 0).toLocaleString('en-IN')}</td>
                          <td className="p-4 text-slate-500">₹{(inv.totals?.igstTotal || 0).toLocaleString('en-IN')}</td>
                          <td className="p-4 font-bold text-indigo-600">₹{(inv.totals?.grandTotal || 0).toLocaleString('en-IN')}</td>
                        </tr>
                      ))
                    ) : selectedReport === 'pending_payment' ? (
                      filteredData.map(inv => (
                        <tr key={inv._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all font-semibold">
                          <td className="p-4 font-bold text-slate-800 dark:text-white font-mono">{inv.invoiceNo}</td>
                          <td className="p-4 text-slate-500">{new Date(inv.date).toLocaleDateString('en-IN')}</td>
                          <td className="p-4 text-slate-700 dark:text-slate-300">{inv.customerId?.name || 'N/A'}</td>
                          <td className="p-4">₹{(inv.totals?.grandTotal || 0).toLocaleString('en-IN')}</td>
                          <td className="p-4 text-emerald-600">₹{(inv.amountPaid || 0).toLocaleString('en-IN')}</td>
                          <td className="p-4 text-red-600 font-bold">₹{((inv.totals?.grandTotal || 0) - (inv.amountPaid || 0)).toLocaleString('en-IN')}</td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded font-extrabold text-[9px] uppercase bg-red-50 text-red-700 dark:bg-red-950/20">
                              {inv.paymentStatus}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : selectedReport === 'payment_collection' ? (
                      filteredData.map(inv => (
                        <tr key={inv._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all font-semibold">
                          <td className="p-4 font-bold text-slate-800 dark:text-white font-mono">{inv.invoiceNo}</td>
                          <td className="p-4 text-slate-500">{new Date(inv.date).toLocaleDateString('en-IN')}</td>
                          <td className="p-4 text-slate-700 dark:text-slate-300">{inv.customerId?.name || 'N/A'}</td>
                          <td className="p-4 font-bold text-indigo-650">{inv.paymentMethod || 'N/A'}</td>
                          <td className="p-4">₹{(inv.totals?.grandTotal || 0).toLocaleString('en-IN')}</td>
                          <td className="p-4 text-emerald-600 font-bold">₹{(inv.amountPaid || 0).toLocaleString('en-IN')}</td>
                        </tr>
                      ))
                    ) : (
                      // General Invoices Report
                      filteredData.map(inv => (
                        <tr key={inv._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all font-semibold">
                          <td className="p-4 font-bold text-slate-800 dark:text-white font-mono">{inv.invoiceNo}</td>
                          <td className="p-4 text-slate-500">{new Date(inv.date).toLocaleDateString('en-IN')}</td>
                          <td className="p-4 text-slate-700 dark:text-slate-300">{inv.customerId?.name || 'N/A'}</td>
                          <td className="p-4">₹{(((inv.totals?.partsTotal || 0) + (inv.totals?.labourTotal || 0))).toLocaleString('en-IN')}</td>
                          <td className="p-4">₹{(inv.totals?.gstTotal || 0).toLocaleString('en-IN')}</td>
                          <td className="p-4 font-black text-slate-900 dark:text-white">₹{(inv.totals?.grandTotal || 0).toLocaleString('en-IN')}</td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] uppercase ${
                              inv.status === 'Finalized'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20'
                            }`}>
                              {inv.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )
                  ) : activeGroup === 'inventory' ? (
                    selectedReport === 'parts_usage' ? (
                      filteredData.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all font-semibold">
                          <td className="p-4">{idx + 1}</td>
                          <td className="p-4 font-mono font-bold">{item.partNumber}</td>
                          <td className="p-4 text-slate-700 dark:text-slate-300">{item.partName}</td>
                          <td className="p-4 text-indigo-650 font-black">{item.quantityUsed}</td>
                          <td className="p-4 font-bold text-emerald-600">₹{item.totalRevenue.toLocaleString('en-IN')}</td>
                        </tr>
                      ))
                    ) : selectedReport === 'inventory_value' ? (
                      filteredData.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all font-semibold">
                          <td className="p-4">{idx + 1}</td>
                          <td className="p-4 font-mono font-bold">{item.partNumber}</td>
                          <td className="p-4 text-slate-700 dark:text-slate-300">{item.partName}</td>
                          <td className="p-4 font-black text-slate-900 dark:text-white">{item.stockQuantity}</td>
                          <td className="p-4">₹{item.purchasePrice?.toLocaleString('en-IN')}</td>
                          <td className="p-4 font-bold text-indigo-650">₹{(item.stockQuantity * item.purchasePrice).toLocaleString('en-IN')}</td>
                        </tr>
                      ))
                    ) : (
                      // Stock / Low Stock Reports
                      filteredData.map((item, idx) => (
                        <tr key={item._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all font-semibold">
                          <td className="p-4">{idx + 1}</td>
                          <td className="p-4 font-mono font-bold">{item.partNumber}</td>
                          <td className="p-4 text-slate-700 dark:text-slate-300">{item.partName}</td>
                          <td className="p-4 text-slate-500">{item.brand || 'N/A'}</td>
                          <td className="p-4 text-slate-500">{item.category || 'N/A'}</td>
                          <td className={`p-4 font-black ${item.stockQuantity <= item.lowStockThreshold ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>
                            {item.stockQuantity}
                          </td>
                          <td className="p-4 text-slate-400">{item.lowStockThreshold}</td>
                          <td className="p-4 font-bold text-indigo-600">₹{item.sellingPrice?.toLocaleString('en-IN')}</td>
                        </tr>
                      ))
                    )
                  ) : (
                    // Employee Reports
                    selectedReport === 'attendance' ? (
                      filteredData.map(item => (
                        <tr key={item.employeeId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all font-semibold">
                          <td className="p-4 font-bold font-mono">{item.employeeId}</td>
                          <td className="p-4 text-slate-800 dark:text-white">{item.name}</td>
                          <td className="p-4 text-slate-500">{item.department}</td>
                          <td className="p-4 text-emerald-600 font-bold">{item.present}</td>
                          <td className="p-4 text-red-600 font-bold">{item.absent}</td>
                          <td className="p-4 text-amber-600">{item.leave}</td>
                          <td className="p-4 text-blue-600">{item.halfDay}</td>
                        </tr>
                      ))
                    ) : selectedReport === 'salary_report' ? (
                      filteredData.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all font-semibold">
                          <td className="p-4 font-bold font-mono">{item.employeeId}</td>
                          <td className="p-4 text-slate-800 dark:text-white">{item.name}</td>
                          <td className="p-4 text-slate-500">{item.department}</td>
                          <td className="p-4 font-black">{item.monthYear}</td>
                          <td className="p-4">₹{item.basicSalary?.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-emerald-600">₹{item.allowances?.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-red-600">₹{item.deductions?.toLocaleString('en-IN')}</td>
                          <td className="p-4 font-bold text-indigo-650">₹{item.netSalary?.toLocaleString('en-IN')}</td>
                        </tr>
                      ))
                    ) : (
                      // Technician & Body Shop Performance reports
                      filteredData.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all font-semibold">
                          <td className="p-4 font-bold text-slate-800 dark:text-white">{item.name}</td>
                          <td className="p-4 text-center text-slate-600">{item.totalJobs}</td>
                          <td className="p-4 text-center text-emerald-600 font-bold">{item.completedJobs}</td>
                          <td className="p-4 text-center text-amber-600">{item.activeJobs}</td>
                          <td className="p-4 font-bold text-indigo-650">₹{item.totalRevenue?.toLocaleString('en-IN')}</td>
                        </tr>
                      ))
                    )
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 dark:text-slate-500 font-semibold">
              No matching records found in the database.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Fallback Clock/CheckCircle icons definition if missing in App
const Clock = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const CheckCircle2 = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
