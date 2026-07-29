import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../config';
import InternationalPhoneInput from '../components/InternationalPhoneInput';
import { Search, Plus, Calendar, Receipt, Download, FileText, CheckCircle2, XCircle, AlertCircle, Save, Edit2, Trash2, Eye, X, UserPlus } from 'lucide-react';

export default function Employees({ token, user }) {
  const [employees, setEmployees] = useState([]);
  const [activeTab, setActiveTab] = useState('registry'); // 'registry', 'attendance', 'salary'
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All'); // 'All', 'Active', 'Inactive'

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Forms
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    phone: '',
    dateOfJoining: '',
    basicDetails: '',
    aadharNumber: '',
    status: 'Active',
    department: 'Service',
    role: '',
    address: '',
    panNumber: '',
    dateOfBirth: '',
    designation: '',
  });
  const [editForm, setEditForm] = useState({
    _id: '',
    employeeId: '',
    name: '',
    email: '',
    phone: '',
    dateOfJoining: '',
    basicDetails: '',
    aadharNumber: '',
    status: 'Active',
    department: 'Service',
    role: '',
    address: '',
    panNumber: '',
    dateOfBirth: '',
    designation: '',
  });
  const [resumeFile, setResumeFile] = useState(null);
  const [editResumeFile, setEditResumeFile] = useState(null);
  const [aadharFile, setAadharFile] = useState(null);
  const [editAadharFile, setEditAadharFile] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [editPhotoFile, setEditPhotoFile] = useState(null);
  const [selectedProfileEmployee, setSelectedProfileEmployee] = useState(null);

  const addNameInputRef = useRef(null);
  const editNameInputRef = useRef(null);

  // Keyboard shortcut listener (ESC closes modals) & Body scroll lock
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showAddModal) setShowAddModal(false);
        if (showEditModal) setShowEditModal(false);
        if (selectedProfileEmployee) setSelectedProfileEmployee(null);
      }
    };
    if (showAddModal || showEditModal || selectedProfileEmployee) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showAddModal, showEditModal, selectedProfileEmployee]);

  // Auto-focus first input field when modal opens
  useEffect(() => {
    if (showAddModal) {
      setTimeout(() => addNameInputRef.current?.focus(), 100);
    }
  }, [showAddModal]);

  useEffect(() => {
    if (showEditModal) {
      setTimeout(() => editNameInputRef.current?.focus(), 100);
    }
  }, [showEditModal]);

  // Comprehensive Form Validation Helper
  const validateEmployeeForm = (form) => {
    // 1. Phone validation
    const rawPhone = form.phone || '';
    const digitsOnly = rawPhone.replace(/[^\d]/g, '');
    
    if (!rawPhone || digitsOnly.length === 0) {
      return 'Please enter a valid phone number.';
    }
    
    // For Indian numbers (+91 default or 10-digit number)
    const isIndian = rawPhone.startsWith('+91') || rawPhone.startsWith('91') || (digitsOnly.length <= 10 && !rawPhone.startsWith('+'));
    if (isIndian) {
      let nationalDigits = rawPhone;
      if (rawPhone.startsWith('+91')) {
        nationalDigits = rawPhone.slice(3).replace(/[^\d]/g, '');
      } else if (rawPhone.startsWith('91') && digitsOnly.length === 12) {
        nationalDigits = rawPhone.slice(2).replace(/[^\d]/g, '');
      } else {
        nationalDigits = digitsOnly;
      }
      
      if (nationalDigits.length !== 10) {
        return 'Mobile number must contain exactly 10 digits.';
      }
    } else if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      return 'Mobile number must contain valid digits.';
    }

    // 2. Email validation (OPTIONAL)
    if (form.email && form.email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.email.trim())) {
        return 'Invalid email address format.';
      }
    }

    // 3. Aadhaar validation (Exactly 12 numeric digits)
    const cleanAadhaar = (form.aadharNumber || '').replace(/[^\d]/g, '');
    if (!cleanAadhaar || cleanAadhaar.length !== 12) {
      return 'Aadhaar number must contain exactly 12 digits.';
    }

    // 4. PAN validation (Optional)
    if (form.panNumber && form.panNumber.trim() !== '') {
      const cleanPan = form.panNumber.trim().toUpperCase();
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
      if (!panRegex.test(cleanPan)) {
        return 'Invalid PAN number format (e.g. ABCDE1234F).';
      }
    }

    // 5. Date validation
    if (form.dateOfBirth) {
      const dob = new Date(form.dateOfBirth);
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      if (dob > today) {
        return 'Date of Birth cannot be in the future.';
      }

      // Age >= 18 check
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
      }

      if (age < 18) {
        return 'Employee must be at least 18 years old.';
      }

      if (form.dateOfJoining) {
        const doj = new Date(form.dateOfJoining);
        if (doj < dob) {
          return 'Date of Joining cannot be earlier than Date of Birth.';
        }
      }
    }

    return null;
  };


  // Attendance states
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().substring(0, 10));
  const [attendanceMap, setAttendanceMap] = useState({}); // { employeeId: status }
  const [checkedEmployees, setCheckedEmployees] = useState({}); // { employeeId: boolean }
  const [attendanceRemarksMap, setAttendanceRemarksMap] = useState({}); // { employeeId: remarks }
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('');
  const [selectedMonthFilter, setSelectedMonthFilter] = useState(new Date().getMonth() + 1); // 1-12
  const [selectedYearFilter, setSelectedYearFilter] = useState(new Date().getFullYear());
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [activeHistoryEmployee, setActiveHistoryEmployee] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('logger'); // 'logger' or 'analytics'

  // Salary states
  const [salaryForm, setSalaryForm] = useState({
    employeeId: '',
    monthYear: new Date().toISOString().substring(0, 7), // YYYY-MM
    basicSalary: '',
    advances: '',
    deductions: '',
    deductionsDescription: '',
    epfPercent: '',
    specialAllowance: '',
    otherAllowance: '',
    otherAllowanceDescription: '',
    leavesCount: 0,
    exemptedLeaves: 1,
    calculatedNetSalary: 0,
  });
  const [selectedSalaryEmployee, setSelectedSalaryEmployee] = useState(null);

  const cleanNumberInput = (val, allowDecimal = true, maxVal = null) => {
    if (val === undefined || val === null) return '';
    let cleaned = val.toString().replace(/[^0-9.]/g, '');
    if (!allowDecimal) {
      cleaned = cleaned.replace(/\./g, '');
    }
    if (cleaned === '.') return '0.';
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    if (cleaned.startsWith('0') && cleaned.length > 1 && cleaned[1] !== '.') {
      cleaned = cleaned.replace(/^0+/, '');
      if (cleaned === '') cleaned = '';
    }
    if (maxVal !== null && cleaned !== '') {
      const num = parseFloat(cleaned);
      if (!isNaN(num) && num > maxVal) {
        cleaned = maxVal.toString();
      }
    }
    return cleaned;
  };

  const handlePhoneChange = (val, form, setter) => {
    setter({ ...form, phone: val });
  };

  const handleAadharChange = (e, form, setter) => {
    const input = e.target;
    const originalValue = input.value;
    let processedValue = originalValue.replace(/[^0-9]/g, '');
    if (processedValue.startsWith('0')) {
      processedValue = processedValue.replace(/^0+/, '');
    }
    processedValue = processedValue.slice(0, 12);
    
    const selectionStart = input.selectionStart;
    setter({ ...form, aadharNumber: processedValue });

    requestAnimationFrame(() => {
      if (input && input.setSelectionRange) {
        const beforeCursor = originalValue.slice(0, selectionStart);
        let cleanBeforeCursor = beforeCursor.replace(/[^0-9]/g, '');
        if (cleanBeforeCursor.startsWith('0')) {
          cleanBeforeCursor = cleanBeforeCursor.replace(/^0+/, '');
        }
        const newCursorPos = cleanBeforeCursor.length;
        input.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  };

  const handleSalaryNumericChange = (e, key, allowDecimal = true, maxVal = null) => {
    const input = e.target;
    const originalValue = input.value;
    const processedValue = cleanNumberInput(originalValue, allowDecimal, maxVal);
    
    const selectionStart = input.selectionStart;
    
    setSalaryForm(prev => {
      const updated = { ...prev, [key]: processedValue };
      if (key === 'basicSalary' || key === 'epfPercent') {
        const basicVal = parseFloat(updated.basicSalary) || 0;
        const percent = parseFloat(updated.epfPercent) || 0;
        const epfVal = Math.round(basicVal * (percent / 100));
        updated.deductions = percent > 0 ? epfVal.toString() : '';
        updated.deductionsDescription = percent > 0 ? `EPF (${percent}%)` : '';
      }
      return updated;
    });

    requestAnimationFrame(() => {
      if (input && input.setSelectionRange) {
        const beforeCursor = originalValue.slice(0, selectionStart);
        const cleanBeforeCursor = cleanNumberInput(beforeCursor, allowDecimal, maxVal);
        const newCursorPos = cleanBeforeCursor.length;
        input.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/employees`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [token]);

  useEffect(() => {
    const globalFilter = localStorage.getItem('global_search_filter');
    if (globalFilter) {
      setSearch(globalFilter);
      localStorage.removeItem('global_search_filter');
    }
  }, []);

  // Sync attendance map and remarks when date changes
  useEffect(() => {
    const map = {};
    const remMap = {};
    employees.forEach(emp => {
      const record = emp.attendance?.find(a => {
        const d = new Date(a.date).toISOString().substring(0, 10);
        return d === attendanceDate;
      });
      const defaultStatus = new Date(attendanceDate).getDay() === 0 ? 'Weekly Off' : 'Present';
      map[emp._id] = record ? record.status : defaultStatus;
      remMap[emp._id] = record ? (record.remarks || '') : '';
    });
    setAttendanceMap(map);
    setAttendanceRemarksMap(remMap);
  }, [attendanceDate, employees]);

  // Recalculate leaves and net salary when salary inputs change
  useEffect(() => {
    if (!salaryForm.employeeId) {
      setSelectedSalaryEmployee(null);
      setSalaryForm(prev => ({
        ...prev,
        leavesCount: 0,
        exemptedLeaves: 1,
        calculatedNetSalary: 0
      }));
      return;
    }

    const emp = employees.find(e => e._id === salaryForm.employeeId);
    setSelectedSalaryEmployee(emp);
    if (!emp) return;

    // Count leaves (Absent = 1, Half Day = 0.5, Leave = 1) for specified monthYear with Sunday as default Weekly Off
    const [year, month] = salaryForm.monthYear.split('-').map(Number);
    const endDate = new Date(year, month, 0); // last day of month
    
    let absentCount = 0;
    let halfDayCount = 0;
    let leaveCount = 0;
    
    const attendanceMap = {};
    emp.attendance?.forEach(a => {
      const d = new Date(a.date);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      attendanceMap[`${yyyy}-${mm}-${dd}`] = a.status;
    });

    for (let day = 1; day <= endDate.getDate(); day++) {
      const currentDate = new Date(year, month - 1, day);
      const yyyy = currentDate.getFullYear();
      const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dd = String(currentDate.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;
      
      const status = attendanceMap[key];
      if (status) {
        if (status === 'Absent') {
          absentCount += 1;
        } else if (status === 'Half Day') {
          halfDayCount += 1;
        } else if (status === 'Leave') {
          leaveCount += 1;
        }
      }
    }
    
    const leaves = absentCount + leaveCount + 0.5 * halfDayCount;

    // Calculate service duration in months from dateOfJoining
    const doj = new Date(emp.dateOfJoining || Date.now());
    const targetDate = new Date(year, month - 1, 1);
    const diffYears = targetDate.getFullYear() - doj.getFullYear();
    const diffMonths = targetDate.getMonth() - doj.getMonth() + (diffYears * 12);
    const exempted = diffMonths >= 6 ? 2 : 1;

    const excessLeaves = Math.max(0, leaves - exempted);

    const basic = Number(salaryForm.basicSalary) || 0;
    const adv = Number(salaryForm.advances) || 0;
    const extraDeduct = Number(salaryForm.deductions) || 0;
    const special = Number(salaryForm.specialAllowance) || 0;
    const other = Number(salaryForm.otherAllowance) || 0;
    
    // Per day leave deduction (assumes 30 days)
    const leaveDeduction = excessLeaves > 0 ? (basic / 30) * excessLeaves : 0;
    const net = Math.round(Math.max(0, basic + special + other - adv - extraDeduct - leaveDeduction));

    setSalaryForm(prev => ({
      ...prev,
      leavesCount: leaves,
      exemptedLeaves: exempted,
      calculatedNetSalary: net
    }));
  }, [salaryForm.employeeId, salaryForm.monthYear, salaryForm.basicSalary, salaryForm.advances, salaryForm.deductions, salaryForm.specialAllowance, salaryForm.otherAllowance, employees]);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const validationError = validateEmployeeForm(addForm);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    const formData = new FormData();
    formData.append('name', addForm.name.trim());
    formData.append('email', addForm.email.trim());
    formData.append('phone', addForm.phone);
    formData.append('dateOfJoining', addForm.dateOfJoining);
    formData.append('basicDetails', addForm.basicDetails);
    formData.append('aadharNumber', addForm.aadharNumber);
    formData.append('status', addForm.status || 'Active');
    formData.append('department', addForm.department || 'Service');
    formData.append('role', addForm.role || '');
    formData.append('address', addForm.address || '');
    formData.append('panNumber', addForm.panNumber ? addForm.panNumber.toUpperCase().trim() : '');
    if (addForm.dateOfBirth) {
      formData.append('dateOfBirth', addForm.dateOfBirth);
    }
    formData.append('designation', addForm.designation || '');

    if (resumeFile) formData.append('resume', resumeFile);
    if (aadharFile) formData.append('aadharDoc', aadharFile);
    if (photoFile) formData.append('photoDoc', photoFile);

    try {
      const res = await fetch(`${API_BASE_URL}/employees`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Employee registered successfully.');
        setShowAddModal(false);
        setAddForm({
          name: '',
          email: '',
          phone: '',
          dateOfJoining: '',
          basicDetails: '',
          aadharNumber: '',
          status: 'Active',
          department: 'Service',
          role: '',
          address: '',
          panNumber: '',
          dateOfBirth: '',
          designation: '',
        });
        setResumeFile(null);
        setAadharFile(null);
        setPhotoFile(null);
        fetchEmployees();
      } else {
        setErrorMsg(data.error || 'Failed to register employee.');
      }
    } catch (err) {
      setErrorMsg('Server connection failed.');
    }
  };


  const handleOpenEdit = (emp) => {
    setEditForm({
      _id: emp._id,
      employeeId: emp.employeeId || '',
      name: emp.name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      dateOfJoining: emp.dateOfJoining ? emp.dateOfJoining.split('T')[0] : '',
      basicDetails: emp.basicDetails || '',
      aadharNumber: emp.aadharNumber || '',
      status: emp.status || 'Active',
      department: emp.department || 'Service',
      role: emp.role || '',
      address: emp.address || '',
      panNumber: emp.panNumber || '',
      dateOfBirth: emp.dateOfBirth ? emp.dateOfBirth.split('T')[0] : '',
      designation: emp.designation || '',
    });
    setErrorMsg('');
    setSuccessMsg('');
    setEditResumeFile(null);
    setEditAadharFile(null);
    setEditPhotoFile(null);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const validationError = validateEmployeeForm(editForm);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    const formData = new FormData();
    formData.append('name', editForm.name.trim());
    formData.append('email', editForm.email.trim());
    formData.append('phone', editForm.phone);
    formData.append('dateOfJoining', editForm.dateOfJoining);
    formData.append('basicDetails', editForm.basicDetails);
    formData.append('aadharNumber', editForm.aadharNumber);
    formData.append('status', editForm.status);
    formData.append('department', editForm.department || 'Service');
    formData.append('role', editForm.role || '');
    formData.append('address', editForm.address || '');
    formData.append('panNumber', editForm.panNumber || '');
    formData.append('dateOfBirth', editForm.dateOfBirth || '');
    formData.append('designation', editForm.designation || '');

    if (editResumeFile) formData.append('resume', editResumeFile);
    if (editAadharFile) formData.append('aadharDoc', editAadharFile);
    if (editPhotoFile) formData.append('photoDoc', editPhotoFile);

    try {
      const res = await fetch(`${API_BASE_URL}/employees/${editForm._id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Employee details updated successfully.');
        setShowEditModal(false);
        setEditResumeFile(null);
        setEditAadharFile(null);
        setEditPhotoFile(null);
        fetchEmployees();
      } else {
        setErrorMsg(data.error || 'Failed to update employee details.');
      }
    } catch (err) {
      setErrorMsg('Server connection failed.');
    }
  };

  const handleDeleteEmployee = async (id) => {
    if (!confirm('Are you sure you want to delete this employee? This action cannot be undone.')) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE_URL}/employees/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Employee deleted successfully.');
        fetchEmployees();
      } else {
        setErrorMsg(data.error || 'Failed to delete employee.');
      }
    } catch (err) {
      setErrorMsg('Server connection failed.');
    }
  };


  const handleToggleStatus = async (emp) => {
    const newStatus = emp.status === 'Inactive' ? 'Active' : 'Inactive';
    try {
      const res = await fetch(`${API_BASE_URL}/employees/${emp._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        fetchEmployees();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveAttendance = async (empId) => {
    const status = attendanceMap[empId] || 'Present';
    const remarks = attendanceRemarksMap[empId] || '';
    try {
      const res = await fetch(`${API_BASE_URL}/employees/${empId}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ date: attendanceDate, status, remarks })
      });
      if (res.ok) {
        fetchEmployees();
        alert('Attendance updated successfully for employee.');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.error || 'Failed to save attendance'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save attendance.');
    }
  };

  const handleMarkAllStatus = (status) => {
    const newMap = { ...attendanceMap };
    employees.forEach(emp => {
      newMap[emp._id] = status;
    });
    setAttendanceMap(newMap);
  };

  const handleSaveAllAttendance = async () => {
    const selectedIds = Object.keys(checkedEmployees).filter(id => checkedEmployees[id]);
    if (selectedIds.length === 0) {
      alert('Please select at least one employee.');
      return;
    }

    const records = selectedIds.map(id => ({
      employeeId: id,
      status: attendanceMap[id] || 'Present',
      remarks: attendanceRemarksMap[id] || ''
    }));

    try {
      const res = await fetch(`${API_BASE_URL}/employees/attendance/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ date: attendanceDate, records })
      });

      if (res.ok) {
        fetchEmployees();
        alert(`Attendance marked for ${records.length} employees.`);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.error || 'Failed to save attendance'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server.');
    }
  };

  const handleDropdownStatusChange = async (empId, dateStr, newStatus) => {
    if (!newStatus) return;
    let finalStatus = newStatus;
    const dayOfWeek = new Date(dateStr).getDay();
    if (dayOfWeek === 0 && newStatus === 'Present') {
      finalStatus = 'Present (Worked on Weekly Off)';
    }

    try {
      const res = await fetch(`${API_BASE_URL}/employees/${empId}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ date: dateStr, status: finalStatus, remarks: 'Status updated via calendar dropdown' })
      });
      if (res.ok) {
        fetchEmployees();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.error || 'Failed to update attendance'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update attendance.');
    }
  };

  const handleOverrideDay = async (empId, dateStr, currentStatus) => {
    const newStatus = window.prompt(`Override attendance for ${dateStr}.\nEnter status (Present, Absent, Half Day, Leave, Weekly Off):`, currentStatus);
    if (!newStatus) return;
    if (!['Present', 'Absent', 'Half Day', 'Leave', 'Weekly Off'].includes(newStatus)) {
      alert('Invalid status. Enter: Present, Absent, Half Day, Leave, or Weekly Off.');
      return;
    }
    const remarks = window.prompt(`Enter optional remarks for override:`, "");
    if (remarks === null) return;
    
    let finalStatus = newStatus;
    const dayOfWeek = new Date(dateStr).getDay();
    if (dayOfWeek === 0 && newStatus === 'Present') {
      finalStatus = 'Present (Worked on Weekly Off)';
    }

    try {
      const res = await fetch(`${API_BASE_URL}/employees/${empId}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ date: dateStr, status: finalStatus, remarks })
      });
      if (res.ok) {
        fetchEmployees();
        alert('Attendance overridden successfully.');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.error || 'Failed to override'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to override attendance.');
    }
  };

  const handleSaveSalarySlip = async (e) => {
    e.preventDefault();
    if (!salaryForm.employeeId) return;

    try {
      const res = await fetch(`${API_BASE_URL}/employees/${salaryForm.employeeId}/salary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          monthYear: salaryForm.monthYear,
          basicSalary: Number(salaryForm.basicSalary) || 0,
          advances: Number(salaryForm.advances) || 0,
          deductions: Number(salaryForm.deductions) || 0,
          deductionsDescription: salaryForm.deductionsDescription,
          specialAllowance: Number(salaryForm.specialAllowance) || 0,
          otherAllowance: Number(salaryForm.otherAllowance) || 0,
          otherAllowanceDescription: salaryForm.otherAllowanceDescription
        })
      });
      if (res.ok) {
        fetchEmployees();
        alert('Salary statement saved successfully.');
        printSalarySlip();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const printSalarySlip = () => {
    if (!selectedSalaryEmployee) return;

    const printWindow = window.open('', '_blank');
    const [year, month] = salaryForm.monthYear.split('-');
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });

    const excessLeaves = Math.max(0, salaryForm.leavesCount - salaryForm.exemptedLeaves);
    const leaveDeduct = (salaryForm.basicSalary / 30) * excessLeaves;
    const special = Number(salaryForm.specialAllowance) || 0;
    const other = Number(salaryForm.otherAllowance) || 0;
    const otherDesc = salaryForm.otherAllowanceDescription || '';
    const deductionsDesc = salaryForm.deductionsDescription || '';

    printWindow.document.write(`
      <html>
        <head>
          <title>Salary Statement - ${selectedSalaryEmployee.name}</title>
          <style>
            body { font-family: sans-serif; color: #333; padding: 40px; line-height: 1.5; font-size: 13px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
            .title { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
            .subtitle { font-size: 12px; color: #666; font-weight: bold; letter-spacing: 1px; }
            .slip-title { text-align: center; font-size: 15px; font-weight: bold; margin: 20px 0; text-transform: uppercase; }
            .info-table, .statement-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            .info-table td { padding: 6px; border: none; }
            .info-table td.label { font-weight: bold; width: 20%; }
            .statement-table th, .statement-table td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            .statement-table th { bg-color: #f5f5f5; font-weight: bold; }
            .right { text-align: right; }
            .total-row { font-weight: bold; font-size: 14px; background-color: #f9f9f9; }
            .footer { margin-top: 60px; display: flex; justify-content: space-between; }
            .sig-box { width: 200px; border-top: 1px solid #333; text-align: center; padding-top: 8px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">MVSS AUTOMOBILES PVT. LTD.</div>
            <div class="subtitle">AUTOMOBILE REPAIRS & SERVICES | SECUNDERABAD</div>
          </div>
          
          <div class="slip-title">Salary Slip for ${monthName} ${year}</div>

          <table class="info-table">
            <tr>
              <td class="label">Employee Name:</td><td>${selectedSalaryEmployee.name}</td>
              <td class="label">Date of Joining:</td><td>${new Date(selectedSalaryEmployee.dateOfJoining).toLocaleDateString()}</td>
            </tr>
            <tr>
              <td class="label">Email:</td><td>${selectedSalaryEmployee.email}</td>
              <td class="label">Phone:</td><td>${selectedSalaryEmployee.phone}</td>
            </tr>
            <tr>
              <td class="label">Aadhar Number:</td><td>${selectedSalaryEmployee.aadharNumber}</td>
              <td class="label">Statement Date:</td><td>${new Date().toLocaleDateString()}</td>
            </tr>
          </table>

          <table class="statement-table">
            <thead>
              <tr>
                <th>Description</th>
                <th class="right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Basic Monthly Wage</td>
                <td class="right">₹${Number(salaryForm.basicSalary).toFixed(2)}</td>
              </tr>
              ${special > 0 ? `
              <tr>
                <td>Special Allowance</td>
                <td class="right">₹${special.toFixed(2)}</td>
              </tr>
              ` : ''}
              ${other > 0 ? `
              <tr>
                <td>Other Allowance ${otherDesc ? `(${otherDesc})` : ''}</td>
                <td class="right">₹${other.toFixed(2)}</td>
              </tr>
              ` : ''}
              <tr>
                <td>Leaves Taken (${salaryForm.leavesCount} days absent, ${salaryForm.exemptedLeaves} days exempted)</td>
                <td class="right">- ₹${leaveDeduct.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Advances Received</td>
                <td class="right">- ₹${Number(salaryForm.advances).toFixed(2)}</td>
              </tr>
              <tr>
                <td>Other Known Deductions ${deductionsDesc ? `(${deductionsDesc})` : ''}</td>
                <td class="right">- ₹${Number(salaryForm.deductions).toFixed(2)}</td>
              </tr>
              <tr class="total-row">
                <td>Net Payable Salary</td>
                <td class="right">₹${Number(salaryForm.calculatedNetSalary).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top: 30px; font-size: 11px; color: #555;">
            * This statement is generated electronically based on active attendance registers and logged salary statements.
          </div>

          <div class="footer">
            <div class="sig-box">Employee Signature</div>
            <div class="sig-box">Authorized Signatory</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handlePrintHistoricalSalarySlip = (emp, slip) => {
    const printWindow = window.open('', '_blank');
    const [year, month] = slip.monthYear.split('-');
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });

    const leaveDeduct = (slip.basicSalary / 30) * slip.leaves;
    const special = Number(slip.specialAllowance) || 0;
    const other = Number(slip.otherAllowance) || 0;
    const otherDesc = slip.otherAllowanceDescription || '';
    const deductionsDesc = slip.deductionsDescription || '';

    printWindow.document.write(`
      <html>
        <head>
          <title>Salary Statement - ${emp.name}</title>
          <style>
            body { font-family: sans-serif; color: #333; padding: 40px; line-height: 1.5; font-size: 13px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
            .title { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
            .subtitle { font-size: 12px; color: #666; font-weight: bold; letter-spacing: 1px; }
            .slip-title { text-align: center; font-size: 15px; font-weight: bold; margin: 20px 0; text-transform: uppercase; }
            .info-table, .statement-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            .info-table td { padding: 6px; border: none; }
            .info-table td.label { font-weight: bold; width: 20%; }
            .statement-table th, .statement-table td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            .statement-table th { bg-color: #f5f5f5; font-weight: bold; }
            .right { text-align: right; }
            .total-row { font-weight: bold; font-size: 14px; background-color: #f9f9f9; }
            .footer { margin-top: 60px; display: flex; justify-content: space-between; }
            .sig-box { width: 200px; border-top: 1px solid #333; text-align: center; padding-top: 8px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">MVSS AUTOMOBILES PVT. LTD.</div>
            <div class="subtitle">AUTOMOBILE REPAIRS & SERVICES | SECUNDERABAD</div>
          </div>
          
          <div class="slip-title">Salary Slip for ${monthName} ${year}</div>

          <table class="info-table">
            <tr>
              <td class="label">Employee Name:</td><td>${emp.name}</td>
              <td class="label">Date of Joining:</td><td>${new Date(emp.dateOfJoining).toLocaleDateString()}</td>
            </tr>
            <tr>
              <td class="label">Email:</td><td>${emp.email}</td>
              <td class="label">Phone:</td><td>${emp.phone}</td>
            </tr>
            <tr>
              <td class="label">Aadhar Number:</td><td>${emp.aadharNumber}</td>
              <td class="label">Statement Date:</td><td>${new Date(slip.generatedAt || Date.now()).toLocaleDateString()}</td>
            </tr>
          </table>

          <table class="statement-table">
            <thead>
              <tr>
                <th>Description</th>
                <th class="right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Basic Monthly Wage</td>
                <td class="right">₹${Number(slip.basicSalary).toFixed(2)}</td>
              </tr>
              ${special > 0 ? `
              <tr>
                <td>Special Allowance</td>
                <td class="right">₹${special.toFixed(2)}</td>
              </tr>
              ` : ''}
              ${other > 0 ? `
              <tr>
                <td>Other Allowance ${otherDesc ? `(${otherDesc})` : ''}</td>
                <td class="right">₹${other.toFixed(2)}</td>
              </tr>
              ` : ''}
              <tr>
                <td>Leaves Taken (${slip.leaves} days absent)</td>
                <td class="right">- ₹${leaveDeduct.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Advances Received</td>
                <td class="right">- ₹${Number(slip.advances).toFixed(2)}</td>
              </tr>
              <tr>
                <td>Other Known Deductions ${deductionsDesc ? `(${deductionsDesc})` : ''}</td>
                <td class="right">- ₹${Number(slip.deductions).toFixed(2)}</td>
              </tr>
              <tr class="total-row">
                <td>Net Payable Salary</td>
                <td class="right">₹${Number(slip.netSalary).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top: 30px; font-size: 11px; color: #555;">
            * This statement is generated electronically based on active attendance registers and logged salary statements.
          </div>

          <div class="footer">
            <div class="sig-box">Employee Signature</div>
            <div class="sig-box">Authorized Signatory</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getResumeDownloadUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    const hostname = window.location.hostname;
    const isCloud = hostname.includes('vercel.app') || 
                    hostname.includes('surge.sh') || 
                    hostname.includes('github.io') || 
                    hostname.includes('loca.lt') || 
                    hostname.includes('pinggy') || 
                    hostname.includes('lhr.life') || 
                    hostname.includes('ngrok');
    if (isCloud) {
      return `${API_BASE_URL.replace('/api', '')}${url}`;
    }
    return `${API_BASE_URL.replace('/api', '')}${url}`;
  };

  const handleDownloadResume = async (e, resumeUrl) => {
    e.preventDefault();
    if (!resumeUrl) return;
    const downloadUrl = getResumeDownloadUrl(resumeUrl);
    
    if (resumeUrl.startsWith('blob:') || resumeUrl.startsWith('data:')) {
      const link = document.createElement('a');
      link.href = resumeUrl;
      link.target = '_blank';
      link.download = 'resume';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const localUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = localUrl;
      const filename = resumeUrl.split('/').pop() || 'resume';
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(localUrl), 100);
    } catch (err) {
      console.error(err);
      window.open(downloadUrl, '_blank');
    }
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(search.toLowerCase()) ||
                          emp.email.toLowerCase().includes(search.toLowerCase()) ||
                          emp.phone.includes(search) ||
                          (emp.employeeId && emp.employeeId.toLowerCase().includes(search.toLowerCase())) ||
                          (emp.department && emp.department.toLowerCase().includes(search.toLowerCase())) ||
                          (emp.role && emp.role.toLowerCase().includes(search.toLowerCase()));
    const empStatus = emp.status || 'Active';
    const matchesStatus = statusFilter === 'All' || empStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getMonthlyDetails = (emp) => {
    if (!emp) return [];
    const year = selectedYearFilter;
    const month = selectedMonthFilter;
    const endDate = new Date(year, month, 0); // last day of month
    
    const list = [];
    const map = {};
    emp.attendance?.forEach(a => {
      const d = new Date(a.date);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      map[`${yyyy}-${mm}-${dd}`] = a;
    });

    for (let day = 1; day <= endDate.getDate(); day++) {
      const currentDate = new Date(year, month - 1, day);
      const yyyy = currentDate.getFullYear();
      const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dd = String(currentDate.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;
      
      const record = map[key];
      if (record) {
        list.push({
          day,
          dateStr: key,
          status: record.status,
          isDefault: false,
          updatedBy: record.updatedBy || 'Admin',
          updatedTime: record.updatedTime,
          remarks: record.remarks || ''
        });
      } else {
        if (currentDate.getDay() === 0) {
          list.push({
            day,
            dateStr: key,
            status: 'Weekly Off',
            isDefault: true,
            updatedBy: 'System',
            updatedTime: null,
            remarks: 'Weekly Off (Holiday)'
          });
        } else {
          list.push({
            day,
            dateStr: key,
            status: 'Not Recorded',
            isDefault: true,
            updatedBy: '',
            updatedTime: null,
            remarks: ''
          });
        }
      }
    }
    return list;
  };

  const getEmpCurrentMonthSummary = (emp) => {
    if (!emp) return { present: 0, absent: 0, halfDay: 0, leave: 0, weeklyOff: 0 };
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const endDate = new Date(year, month, 0);
    
    let present = 0;
    let absent = 0;
    let halfDay = 0;
    let leave = 0;
    let weeklyOff = 0;

    const map = {};
    emp.attendance?.forEach(a => {
      const d = new Date(a.date);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      map[`${yyyy}-${mm}-${dd}`] = a.status;
    });

    for (let day = 1; day <= endDate.getDate(); day++) {
      const currentDate = new Date(year, month - 1, day);
      const yyyy = currentDate.getFullYear();
      const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dd = String(currentDate.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;
      
      const status = map[key];
      if (status) {
        if (status === 'Present' || status === 'Present (Worked on Weekly Off)') present++;
        else if (status === 'Absent') absent++;
        else if (status === 'Half Day') halfDay++;
        else if (status === 'Leave') leave++;
        else if (status === 'Weekly Off') weeklyOff++;
      } else {
        if (currentDate.getDay() === 0) {
          weeklyOff++; // Default Sunday to Weekly Off
        }
      }
    }

    return { present, absent, halfDay, leave, weeklyOff };
  };

  return (
    <div className="space-y-4 animate-fade-in p-1 select-none">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white">Employee Management</h2>
          <p className="text-xs text-slate-400 font-semibold dark:text-slate-500">Add staff records, track daily attendance, and calculate salary statement slips</p>
        </div>
        {activeTab === 'registry' && user?.role === 'Admin' && (
          <button
            onClick={() => {
              setErrorMsg('');
              setSuccessMsg('');
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10"
          >
            <Plus className="w-4 h-4" />
            Add Employee
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1.5 p-1 bg-slate-100/50 dark:bg-slate-900/50 rounded-xl max-w-md">
        <button
          onClick={() => setActiveTab('registry')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'registry' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Staff Registry
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'attendance' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          Attendance Tracker
        </button>
        <button
          onClick={() => setActiveTab('salary')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'salary' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          Salary Generator
        </button>
      </div>

      {/* Registry Tab */}
      {activeTab === 'registry' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          {/* Search bar & Filters */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-4 items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              <input
                type="text"
                placeholder="Search staff registry by name, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3.5 py-2 rounded-xl">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="All">All Staff</option>
                <option value="Active">Active Only</option>
                <option value="Inactive">Inactive Only</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-6 py-4">Employee ID</th>
                  <th className="px-6 py-4">Employee Name</th>
                  <th className="px-6 py-4">Contact Info</th>
                  <th className="px-6 py-4">Date of Joining</th>
                  <th className="px-6 py-4">Aadhar Number</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Details</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs font-semibold text-slate-700 dark:text-slate-350">
                {filteredEmployees.length > 0 ? (
                  filteredEmployees.map(emp => (
                    <tr key={emp._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                      <td className="px-6 py-4 font-mono font-bold text-indigo-650 dark:text-indigo-400">
                        {emp.employeeId || 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="block font-bold text-slate-800 dark:text-white">{emp.name}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">{emp.department || 'Service'} • {emp.role || 'Staff'}</span>
                      </td>
                      <td className="px-6 py-4 font-mono">
                        <span className="block">{emp.email}</span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">{emp.phone}</span>
                      </td>
                      <td className="px-6 py-4">
                        {emp.dateOfJoining ? new Date(emp.dateOfJoining).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-6 py-4 font-mono">{emp.aadharNumber || 'N/A'}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleStatus(emp)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border transition-all ${
                            emp.status === 'Inactive'
                              ? 'bg-red-50 dark:bg-red-950/20 text-red-600 border-red-200 dark:border-red-900/40 hover:bg-red-100/50'
                              : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border-emerald-200 dark:border-emerald-900/40 hover:bg-emerald-100/50'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${emp.status === 'Inactive' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                          {emp.status || 'Active'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-slate-500 max-w-xs">
                        <div className="space-y-1">
                          {emp.address && (
                            <div className="flex items-start gap-1">
                              <span className="font-extrabold uppercase text-[8px] text-slate-400 mt-0.5 shrink-0">Address:</span>
                              <span className="truncate block max-w-[150px]">{emp.address}</span>
                            </div>
                          )}
                          {emp.basicDetails && (
                            <div className="flex items-start gap-1 text-[10px] text-slate-400 font-medium">
                              <span>{emp.basicDetails}</span>
                            </div>
                          )}
                          {!emp.address && !emp.basicDetails && <span>-</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            onClick={() => setSelectedProfileEmployee(emp)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-600 dark:bg-blue-955/30 dark:hover:bg-blue-600 text-blue-600 dark:text-blue-400 hover:text-white dark:hover:text-white rounded-lg text-[11px] font-bold transition-all border border-blue-100 dark:border-blue-900/40 shadow-xs shrink-0"
                            title="View Profile & History"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>
                          {user?.role === 'Admin' && (
                            <>
                              <button
                                onClick={() => handleOpenEdit(emp)}
                                className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-600 dark:bg-amber-955/30 dark:hover:bg-amber-600 text-amber-600 dark:text-amber-400 hover:text-white dark:hover:text-white rounded-lg text-[11px] font-bold transition-all border border-amber-100 dark:border-amber-900/40 shadow-xs shrink-0"
                                title="Edit Employee"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteEmployee(emp._id)}
                                className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-600 dark:bg-rose-955/30 dark:hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white dark:hover:text-white rounded-lg text-[11px] font-bold transition-all border border-rose-100 dark:border-rose-900/40 shadow-xs shrink-0"
                                title="Delete Employee"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            </>
                          )}
                          {emp.resumeUrl ? (
                            <button
                              onClick={(e) => handleDownloadResume(e, emp.resumeUrl)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 dark:bg-indigo-955/30 dark:hover:bg-indigo-600 text-indigo-600 dark:text-indigo-400 hover:text-white dark:hover:text-white rounded-lg text-[11px] font-bold transition-all border border-indigo-100 dark:border-indigo-900/40 shadow-xs shrink-0"
                              title="Download Resume"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Resume
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-slate-400 italic">
                      No employees registered in catalog yet.
                    </td>

                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attendance Tracker Tab */}
      {activeTab === 'attendance' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide">Attendance Sheet & Analytics</h3>
              <p className="text-[10px] text-slate-400 font-semibold">Record daily attendance, view summaries and track employee attendance histories</p>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSubTab('logger')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeSubTab === 'logger' ? 'bg-indigo-655 text-white' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-850'}`}
              >
                📝 Logger
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('analytics')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeSubTab === 'analytics' ? 'bg-indigo-655 text-white' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-850'}`}
              >
                📊 Analytics & Calendar
              </button>
            </div>
          </div>

          {activeSubTab === 'logger' ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-955 p-4 rounded-xl border border-slate-150 dark:border-slate-800/30">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Select Logger Date:</span>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <input
                    type="date"
                    value={attendanceDate}
                    onChange={(e) => setAttendanceDate(e.target.value)}
                    className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
                  />
                </div>
              </div>

              {employees.length > 0 && (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/80">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id="select-all-attendance"
                      checked={employees.length > 0 && employees.every(emp => !!checkedEmployees[emp._id])}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const newChecked = {};
                        const newMap = { ...attendanceMap };
                        const isSunday = new Date(attendanceDate).getDay() === 0;
                        const defaultStatus = isSunday ? 'Weekly Off' : 'Present';
                        employees.forEach(emp => {
                          newChecked[emp._id] = checked;
                          if (checked) {
                            newMap[emp._id] = defaultStatus;
                          }
                        });
                        setCheckedEmployees(newChecked);
                        if (checked) setAttendanceMap(newMap);
                      }}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-800 text-emerald-600 focus:ring-emerald-500 bg-white dark:bg-slate-900"
                    />
                    <label htmlFor="select-all-attendance" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                      Select All Employees
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleMarkAllStatus('Present')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-955/20 dark:text-emerald-400 rounded-lg text-[11px] font-bold transition-all"
                    >
                      ✓ Mark All Present
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMarkAllStatus('Absent')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-955/20 dark:text-red-400 rounded-lg text-[11px] font-bold transition-all"
                    >
                      ✗ Mark All Absent
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMarkAllStatus('Half Day')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-955/20 dark:text-amber-400 rounded-lg text-[11px] font-bold transition-all"
                    >
                      ◐ Mark All Half Day
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMarkAllStatus('Leave')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-955/20 dark:text-blue-400 rounded-lg text-[11px] font-bold transition-all"
                    >
                      🏖 Mark All Leave
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMarkAllStatus('Weekly Off')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-350 rounded-lg text-[11px] font-bold transition-all"
                    >
                      ⚪ Mark All Weekly Off
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {employees.length > 0 ? (
                  employees.map(emp => {
                    const currentStatus = attendanceMap[emp._id] || 'Present';
                    const currentRemarks = attendanceRemarksMap[emp._id] || '';
                    const summary = getEmpCurrentMonthSummary(emp);
                    return (
                      <div key={emp._id} className="flex flex-col lg:flex-row lg:items-center justify-between p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-150 dark:border-slate-800/30 gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <input
                            type="checkbox"
                            checked={!!checkedEmployees[emp._id]}
                            onChange={(e) => {
                              setCheckedEmployees({
                                ...checkedEmployees,
                                [emp._id]: e.target.checked
                              });
                            }}
                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-800 text-emerald-600 focus:ring-emerald-500 bg-white dark:bg-slate-900 mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 dark:text-white block">{emp.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono">({emp.employeeId || 'N/A'})</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">{emp.email}</span>
                            <div className="flex flex-wrap gap-2 text-[9px] font-extrabold uppercase tracking-wider text-slate-500 mt-2 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 w-fit px-2.5 py-1 rounded-lg">
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">Present: {summary.present}d</span>
                              <span className="text-red-500 font-bold">Absent: {summary.absent}d</span>
                              <span className="text-amber-500 font-bold">Half Day: {summary.halfDay}d</span>
                              <span className="text-blue-500 font-bold">Leave: {summary.leave}d</span>
                              <span className="text-slate-500 font-bold">Weekly Off: {summary.weeklyOff}d</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 self-end lg:self-auto">
                          <input
                            type="text"
                            placeholder="Add remarks..."
                            value={currentRemarks}
                            onChange={(e) => setAttendanceRemarksMap({ ...attendanceRemarksMap, [emp._id]: e.target.value })}
                            className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold focus:outline-none w-36 sm:w-48 text-slate-800 dark:text-slate-100"
                          />
                          
                          <select
                            value={currentStatus}
                            onChange={(e) => setAttendanceMap({ ...attendanceMap, [emp._id]: e.target.value })}
                            className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold focus:outline-none text-slate-800 dark:text-slate-100"
                          >
                            <option value="Present">Present</option>
                            <option value="Absent">Absent</option>
                            <option value="Half Day">Half Day</option>
                            <option value="Leave">Leave</option>
                            <option value="Weekly Off">Weekly Off</option>
                            <option value="Present (Worked on Weekly Off)">Present (Worked on Weekly Off)</option>
                          </select>

                          <button
                            onClick={() => handleSaveAttendance(emp._id)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 dark:bg-emerald-955/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100/50 rounded-lg text-xs font-bold transition-all border border-emerald-200/30"
                          >
                            <Save className="w-3.5 h-3.5" />
                            Save
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedEmployeeFilter(emp._id);
                              setActiveSubTab('analytics');
                            }}
                            className="p-1.5 bg-indigo-50 dark:bg-indigo-955/20 text-indigo-650 dark:text-indigo-400 hover:bg-indigo-100/50 rounded-lg border border-indigo-200/30"
                            title="View History Details"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-center text-slate-400 italic py-10">Add employees first to track attendance.</p>
                )}
              </div>

              {employees.length > 0 && (
                <div className="flex justify-end pt-4 border-t border-slate-150 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={handleSaveAllAttendance}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                  >
                    <Save className="w-4 h-4" />
                    Save Checked Attendance
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Analytics Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-150 dark:border-slate-800/30">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-wider mb-1">Employee Filter</label>
                  <select
                    value={selectedEmployeeFilter}
                    onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:outline-none text-slate-800 dark:text-slate-100"
                  >
                    <option value="">All Employees</option>
                    {employees.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-wider mb-1">Month</label>
                  <select
                    value={selectedMonthFilter}
                    onChange={(e) => setSelectedMonthFilter(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:outline-none text-slate-800 dark:text-slate-100"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(2026, i, 1).toLocaleString('en-US', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-wider mb-1">Year</label>
                  <select
                    value={selectedYearFilter}
                    onChange={(e) => setSelectedYearFilter(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:outline-none text-slate-800 dark:text-slate-100"
                  >
                    <option value={2026}>2026</option>
                    <option value={2025}>2025</option>
                    <option value={2024}>2024</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-wider mb-1">Status Filter</label>
                  <select
                    value={selectedStatusFilter}
                    onChange={(e) => setSelectedStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:outline-none text-slate-800 dark:text-slate-100"
                  >
                    <option value="">All Statuses</option>
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                    <option value="Half Day">Half Day</option>
                    <option value="Leave">Leave</option>
                    <option value="Weekly Off">Weekly Off</option>
                    <option value="Present (Worked on Weekly Off)">Present (Worked on Weekly Off)</option>
                  </select>
                </div>
              </div>

              {selectedEmployeeFilter ? (() => {
                const emp = employees.find(e => e._id === selectedEmployeeFilter);
                if (!emp) return <p className="text-center text-slate-400 italic">Select a valid employee.</p>;
                
                const list = getMonthlyDetails(emp);
                const presentDays = list.filter(d => d.status === 'Present' || d.status === 'Present (Worked on Weekly Off)').length;
                const absentDays = list.filter(d => d.status === 'Absent').length;
                const halfDays = list.filter(d => d.status === 'Half Day').length;
                const leaveDays = list.filter(d => d.status === 'Leave').length;
                const weeklyOffDays = list.filter(d => d.status === 'Weekly Off').length;

                const startDayOfWeek = new Date(selectedYearFilter, selectedMonthFilter - 1, 1).getDay();

                return (
                  <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="p-4 bg-emerald-50/40 dark:bg-emerald-955/20 border border-emerald-150/40 rounded-2xl flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Present Days</span>
                        <h4 className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-2">{presentDays} Days</h4>
                        <span className="text-[8px] text-slate-400 font-medium block mt-1">(Includes Sunday worked)</span>
                      </div>
                      <div className="p-4 bg-rose-50/40 dark:bg-rose-955/20 border border-rose-150/40 rounded-2xl flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Absent Days</span>
                        <h4 className="text-2xl font-black text-rose-600 dark:text-rose-455 mt-2">{absentDays} Days</h4>
                        <span className="text-[8px] text-slate-400 font-medium block mt-1">(Loss of pay deduction)</span>
                      </div>
                      <div className="p-4 bg-amber-50/40 dark:bg-amber-955/20 border border-amber-150/40 rounded-2xl flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Half Days</span>
                        <h4 className="text-2xl font-black text-amber-600 dark:text-amber-455 mt-2">{halfDays} Days</h4>
                        <span className="text-[8px] text-slate-400 font-medium block mt-1">(0.5 salary deduction)</span>
                      </div>
                      <div className="p-4 bg-blue-50/40 dark:bg-blue-955/20 border border-blue-150/40 rounded-2xl flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Leave Days</span>
                        <h4 className="text-2xl font-black text-blue-600 dark:text-blue-455 mt-2">{leaveDays} Days</h4>
                        <span className="text-[8px] text-slate-400 font-medium block mt-1">(Paid leave policy)</span>
                      </div>
                      <div className="p-4 bg-slate-50/40 dark:bg-slate-800/20 border border-slate-200/40 rounded-2xl flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Weekly Off</span>
                        <h4 className="text-2xl font-black text-slate-605 dark:text-slate-300 mt-2">{weeklyOffDays} Days</h4>
                        <span className="text-[8px] text-slate-400 font-medium block mt-1">(Sundays / weekly offs)</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">
                        Calendar View - {new Date(selectedYearFilter, selectedMonthFilter - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                      </h4>
                      <button
                        onClick={() => {
                          setActiveHistoryEmployee(emp);
                          setShowHistoryModal(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-650 dark:bg-indigo-955/20 dark:text-indigo-400 rounded-lg text-xs font-bold transition-all border border-indigo-200/30"
                      >
                        📂 View History Lists
                      </button>
                    </div>

                    {/* Monthly Calendar View */}
                    <div className="bg-slate-50 dark:bg-slate-955 p-6 rounded-2xl border border-slate-150 dark:border-slate-800/30">
                      <div className="grid grid-cols-7 gap-2 mb-2 text-center text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                        <div>Sun</div>
                        <div>Mon</div>
                        <div>Tue</div>
                        <div>Wed</div>
                        <div>Thu</div>
                        <div>Fri</div>
                        <div>Sat</div>
                      </div>
                      <div className="grid grid-cols-7 gap-2">
                        {Array.from({ length: startDayOfWeek }).map((_, i) => (
                          <div key={`empty-${i}`} className="h-16 bg-slate-100/30 dark:bg-slate-900/10 rounded-xl" />
                        ))}
                        {list.map(day => {
                          let colorClass = 'border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 text-slate-400';
                          if (day.status === 'Present') colorClass = 'border-emerald-500 bg-emerald-50/25 text-emerald-800 dark:text-emerald-300';
                          else if (day.status === 'Present (Worked on Weekly Off)') colorClass = 'border-emerald-555 bg-emerald-100/20 text-emerald-800 dark:text-emerald-300';
                          else if (day.status === 'Absent') colorClass = 'border-rose-500 bg-rose-50/25 text-rose-800 dark:text-rose-300';
                          else if (day.status === 'Half Day') colorClass = 'border-amber-500 bg-amber-50/25 text-amber-800 dark:text-amber-300';
                          else if (day.status === 'Leave') colorClass = 'border-blue-500 bg-blue-50/25 text-blue-800 dark:text-blue-300';
                          else if (day.status === 'Weekly Off') colorClass = 'border-slate-350 bg-slate-100/60 dark:border-slate-800 dark:bg-slate-950 text-slate-500 dark:text-slate-400';

                          const matchesStatusFilter = !selectedStatusFilter || 
                            (selectedStatusFilter === 'Present' && (day.status === 'Present' || day.status === 'Present (Worked on Weekly Off)')) ||
                            day.status === selectedStatusFilter;
                          const opacityClass = matchesStatusFilter ? 'opacity-100' : 'opacity-30';

                          return (
                            <div
                              key={day.dateStr}
                              className={`h-16 border rounded-xl p-1.5 flex flex-col justify-between items-start text-left transition-all ${colorClass} ${opacityClass} relative hover:shadow-xs`}
                              title={`Status: ${day.status}\nBy: ${day.updatedBy || 'N/A'}\nRemarks: ${day.remarks || 'None'}`}
                            >
                              <span className="text-[10px] font-bold">{day.day}</span>
                              <select
                                value={day.status === 'Present (Worked on Weekly Off)' ? 'Present' : (day.status === 'Not Recorded' ? '' : day.status)}
                                onChange={(e) => handleDropdownStatusChange(emp._id, day.dateStr, e.target.value)}
                                className="w-full bg-transparent border-none text-[9px] font-extrabold uppercase focus:outline-none cursor-pointer mt-1 text-slate-800 dark:text-slate-200"
                              >
                                <option value="" className="bg-white dark:bg-slate-900 text-slate-500 font-bold">Empty</option>
                                <option value="Present" className="bg-white dark:bg-slate-900 text-emerald-600 font-bold">🟢 Present</option>
                                <option value="Absent" className="bg-white dark:bg-slate-900 text-rose-600 font-bold">🔴 Absent</option>
                                <option value="Half Day" className="bg-white dark:bg-slate-900 text-amber-600 font-bold">🟡 Half Day</option>
                                <option value="Leave" className="bg-white dark:bg-slate-900 text-blue-600 font-bold">🔵 Leave</option>
                                <option value="Weekly Off" className="bg-white dark:bg-slate-900 text-slate-500 font-bold">⚪ Weekly Off</option>
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">All Registered Employees Summaries</h4>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                    {employees.map(emp => {
                      const details = getMonthlyDetails(emp);
                      const presentDays = details.filter(d => d.status === 'Present' || d.status === 'Present (Worked on Weekly Off)').length;
                      const absentDays = details.filter(d => d.status === 'Absent').length;
                      const halfDays = details.filter(d => d.status === 'Half Day').length;
                      const leaveDays = details.filter(d => d.status === 'Leave').length;
                      const weeklyOffDays = details.filter(d => d.status === 'Weekly Off').length;

                      const matchesStatusFilter = !selectedStatusFilter || 
                        (selectedStatusFilter === 'Present' && presentDays > 0) ||
                        (selectedStatusFilter === 'Absent' && absentDays > 0) ||
                        (selectedStatusFilter === 'Half Day' && halfDays > 0) ||
                        (selectedStatusFilter === 'Leave' && leaveDays > 0) ||
                        (selectedStatusFilter === 'Weekly Off' && weeklyOffDays > 0);

                      if (!matchesStatusFilter) return null;

                      return (
                        <div key={emp._id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <span className="font-bold text-slate-800 dark:text-white block">{emp.name} ({emp.employeeId || 'N/A'})</span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">{emp.department} • {emp.role}</span>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex gap-2 text-[9px] font-extrabold uppercase bg-slate-50 dark:bg-slate-955 border border-slate-200/50 dark:border-slate-800/80 px-2.5 py-1.5 rounded-lg text-slate-550">
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">Present: {presentDays}d</span>
                              <span className="text-red-500 font-bold">Absent: {absentDays}d</span>
                              <span className="text-amber-500 font-bold">Half Day: {halfDays}d</span>
                              <span className="text-blue-500 font-bold">Leave: {leaveDays}d</span>
                              <span className="text-slate-500 font-bold">Weekly Off: {weeklyOffDays}d</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedEmployeeFilter(emp._id);
                              }}
                              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-650 dark:bg-indigo-955/20 dark:text-indigo-400 rounded-lg text-xs font-bold transition-all border border-indigo-200/30"
                            >
                              📅 Calendar View
                            </button>
                            
                            <button
                              type="button"
                              onClick={() => {
                                setActiveHistoryEmployee(emp);
                                setShowHistoryModal(true);
                              }}
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-650 dark:bg-emerald-955/20 dark:text-emerald-400 rounded-lg text-xs font-bold transition-all border border-emerald-200/30"
                            >
                              📂 View History List
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Salary Slip Generator Tab */}
      {activeTab === 'salary' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Inputs Column */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 space-y-6">
            <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide border-b border-slate-100 dark:border-slate-800 pb-4">Calculate Salary Statement</h3>
            
            <form onSubmit={handleSaveSalarySlip} className="space-y-6">
              {/* Section 1: General Details */}
              <div className="space-y-3">
                <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest block">1. Staff & Period</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Select Employee</label>
                    <select
                      required
                      value={salaryForm.employeeId}
                      onChange={(e) => setSalaryForm({ ...salaryForm, employeeId: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
                    >
                      <option value="">-- Select Staff Member --</option>
                      {employees.map(e => (
                        <option key={e._id} value={e._id}>{e.name} ({e.status || 'Active'})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Select Month & Year</label>
                    <input
                      type="month"
                      required
                      value={salaryForm.monthYear}
                      onChange={(e) => setSalaryForm({ ...salaryForm, monthYear: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Earnings & Allowances */}
              <div className="space-y-3 border-t border-slate-100 dark:border-slate-800/60 pt-4">
                <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest block">2. Earnings & Allowances</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Basic Monthly Salary (₹)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      value={salaryForm.basicSalary}
                      onChange={(e) => handleSalaryNumericChange(e, 'basicSalary', true)}
                      placeholder="Enter amount"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Special Allowance (₹)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={salaryForm.specialAllowance}
                      onChange={(e) => handleSalaryNumericChange(e, 'specialAllowance', true)}
                      placeholder="Enter amount"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Other Allowance (₹)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={salaryForm.otherAllowance}
                      onChange={(e) => handleSalaryNumericChange(e, 'otherAllowance', true)}
                      placeholder="Enter amount"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Other Allowance Description</label>
                  <input
                    type="text"
                    value={salaryForm.otherAllowanceDescription}
                    onChange={(e) => setSalaryForm({ ...salaryForm, otherAllowanceDescription: e.target.value })}
                    placeholder="e.g. Festival Bonus, Petrol allowance, Travel reimbursement"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
                  />
                </div>
              </div>

              {/* Section 3: Deductions */}
              <div className="space-y-3 border-t border-slate-100 dark:border-slate-800/60 pt-4">
                <span className="text-[11px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest block">3. Deductions</span>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Advances Disbursed (₹)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={salaryForm.advances}
                      onChange={(e) => handleSalaryNumericChange(e, 'advances', true)}
                      placeholder="Enter amount"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">EPF (%)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={salaryForm.epfPercent}
                      onChange={(e) => handleSalaryNumericChange(e, 'epfPercent', true, 100)}
                      placeholder="Enter EPF %"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Other Deductions (₹)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={salaryForm.deductions}
                      onChange={(e) => handleSalaryNumericChange(e, 'deductions', true)}
                      placeholder="Enter amount"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Deductions Description</label>
                    <input
                      type="text"
                      value={salaryForm.deductionsDescription}
                      onChange={(e) => setSalaryForm({ ...salaryForm, deductionsDescription: e.target.value })}
                      placeholder="e.g. EPF, Professional Tax, ESI"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-900 grid grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="font-semibold text-slate-500 block">Leaves/Absents Count:</span>
                  <span className="font-bold text-slate-800 dark:text-white block mt-1">{salaryForm.leavesCount} days</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 block">Exempted Leaves:</span>
                  <span className="font-bold text-indigo-650 dark:text-indigo-400 block mt-1">{salaryForm.exemptedLeaves} days</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-slate-500 block">Auto Leave Deduction:</span>
                  <span className="font-bold text-red-500 block mt-1">
                    - ₹{Math.round((salaryForm.basicSalary / 30) * Math.max(0, salaryForm.leavesCount - salaryForm.exemptedLeaves)).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="submit"
                  disabled={!salaryForm.employeeId}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10 disabled:opacity-50"
                >
                  Generate & Print Slip
                </button>
              </div>
            </form>
          </div>

          {/* Calculator Output View */}
          <div className="bg-slate-900 text-slate-100 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between h-full min-h-[450px]">
            <div className="space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <Receipt className="w-4 h-4 text-indigo-400" />
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Salary Preview Statement</h4>
              </div>
              
              {selectedSalaryEmployee ? (
                <div className="space-y-4">
                  {/* Staff Info block */}
                  <div className="bg-slate-950/40 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] text-slate-400 block font-black uppercase tracking-wider">Employee Name</span>
                      <span className="text-sm font-black text-white">{selectedSalaryEmployee.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] text-slate-400 block font-black uppercase tracking-wider">Period</span>
                      <span className="text-[11px] font-mono text-indigo-300 font-bold uppercase">{
                        (() => {
                          const [year, month] = salaryForm.monthYear.split('-');
                          if (!year || !month) return salaryForm.monthYear;
                          return new Date(year, month - 1).toLocaleString('default', { month: 'short', year: 'numeric' });
                        })()
                      }</span>
                    </div>
                  </div>

                  {/* Earnings & Allowances */}
                  <div className="space-y-2.5 border-t border-dashed border-slate-800 pt-3">
                    <span className="text-[10px] text-slate-400 block font-extrabold uppercase tracking-wider">Earnings & Allowances</span>
                    
                    <div className="flex justify-between text-xs font-medium text-slate-300">
                      <span>Base Salary:</span>
                      <span className="font-mono text-white">₹{salaryForm.basicSalary.toLocaleString()}</span>
                    </div>

                    {Number(salaryForm.specialAllowance) > 0 && (
                      <div className="flex justify-between text-xs font-medium text-emerald-400">
                        <span>Special Allowance:</span>
                        <span className="font-mono">+ ₹{Number(salaryForm.specialAllowance).toLocaleString()}</span>
                      </div>
                    )}

                    {Number(salaryForm.otherAllowance) > 0 && (
                      <div className="flex justify-between text-xs font-medium text-emerald-400">
                        <span className="truncate max-w-[170px]">Other {salaryForm.otherAllowanceDescription ? `(${salaryForm.otherAllowanceDescription})` : ''}:</span>
                        <span className="font-mono">+ ₹{Number(salaryForm.otherAllowance).toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  {/* Deductions */}
                  <div className="space-y-2.5 border-t border-dashed border-slate-800 pt-3">
                    <span className="text-[10px] text-slate-400 block font-extrabold uppercase tracking-wider">Deductions & Offsets</span>

                    {Number(salaryForm.leavesCount) > 0 && (
                      <div className="flex justify-between text-xs font-medium text-slate-400">
                        <span>Total Leaves / Absents:</span>
                        <span className="font-mono">{salaryForm.leavesCount} days</span>
                      </div>
                    )}
                    {Number(salaryForm.exemptedLeaves) > 0 && Number(salaryForm.leavesCount) > 0 && (
                      <div className="flex justify-between text-xs font-medium text-indigo-400">
                        <span>Exempted Leaves:</span>
                        <span className="font-mono">- {Math.min(salaryForm.leavesCount, salaryForm.exemptedLeaves)} days</span>
                      </div>
                    )}
                    {Math.max(0, salaryForm.leavesCount - salaryForm.exemptedLeaves) > 0 && (
                      <div className="flex justify-between text-xs font-medium text-rose-400">
                        <span>Absent Deductions ({Math.max(0, salaryForm.leavesCount - salaryForm.exemptedLeaves)}d excess):</span>
                        <span className="font-mono">- ₹{Math.round((salaryForm.basicSalary / 30) * Math.max(0, salaryForm.leavesCount - salaryForm.exemptedLeaves)).toLocaleString()}</span>
                      </div>
                    )}

                    {Number(salaryForm.advances) > 0 && (
                      <div className="flex justify-between text-xs font-medium text-rose-400">
                        <span>Advances Repayment:</span>
                        <span className="font-mono">- ₹{Number(salaryForm.advances).toLocaleString()}</span>
                      </div>
                    )}

                    {Number(salaryForm.deductions) > 0 && (
                      <div className="flex justify-between text-xs font-medium text-rose-400">
                        <span>Deduction {salaryForm.deductionsDescription ? `(${salaryForm.deductionsDescription})` : ''}:</span>
                        <span className="font-mono">- ₹{Number(salaryForm.deductions).toLocaleString()}</span>
                      </div>
                    )}

                    {Number(salaryForm.leavesCount) === 0 && Number(salaryForm.advances) === 0 && Number(salaryForm.deductions) === 0 && (
                      <div className="text-xs text-slate-500 italic py-0.5">No deductions applied for this period</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-slate-800/40 border border-slate-700/60 flex items-center justify-center animate-float">
                      <Receipt className="w-7 h-7 text-indigo-400" />
                    </div>
                    <div className="absolute inset-0 rounded-full bg-indigo-500/10 animate-ping opacity-25 animate-pulse-glow"></div>
                  </div>
                  <div className="space-y-1 max-w-[200px]">
                    <span className="text-xs font-black text-white block uppercase tracking-wider">Awaiting Staff Selection</span>
                    <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                      Select an employee and set period details on the left to calculate pay summary.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 pt-4 mt-6 bg-slate-950/40 p-4 rounded-2xl border border-slate-800/40">
              <span className="text-[10px] text-slate-400 block font-black uppercase tracking-wider">Final Net Pay</span>
              <span className="text-3xl font-black text-indigo-400 block mt-1.5 font-mono">
                ₹{salaryForm.calculatedNetSalary.toLocaleString()}
              </span>
              {selectedSalaryEmployee && (
                <span className="text-[9px] text-slate-500 block mt-1">
                  * Rounded to nearest rupee. Subject to print generation logs.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Employee Modal (React Portal to document.body) */}
      {showAddModal && createPortal(
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 z-[99999] animate-fade-in select-none overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-[min(1100px,95vw)] h-[90vh] max-h-[90vh] flex flex-col relative overflow-hidden my-auto">
            {/* Header - Fixed Sticky */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/50 dark:border-indigo-800/40 flex items-center justify-center shrink-0">
                  <UserPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-white uppercase tracking-wide">Register New Employee</h3>
                  <p className="text-[10px] sm:text-xs text-slate-400 font-semibold">Enter staff personal, contact, and employment details</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center text-slate-400 transition-all duration-200 shadow-xs hover:scale-105 cursor-pointer shrink-0"
                title="Close Modal (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Form Body - Scrollable Inside Modal Only */}
              <div className="p-5 sm:p-7 space-y-6 overflow-y-auto flex-1 min-h-0">
                {errorMsg && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-2xl p-3.5 flex gap-2.5 text-xs text-red-650 dark:text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="font-semibold leading-relaxed">{errorMsg}</span>
                  </div>
                )}

                {/* Section 1: Basic Information */}
                <div className="bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 p-5 rounded-2xl space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 border-b border-slate-200/60 dark:border-slate-800/60 pb-2.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 block" />
                    1. Personal & Contact Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Full Name *</label>
                      <input
                        ref={addNameInputRef}
                        type="text"
                        required
                        value={addForm.name}
                        onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                        placeholder="e.g. John Doe"
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Phone Number *</label>
                      <InternationalPhoneInput
                        value={addForm.phone}
                        onChange={(val) => handlePhoneChange(val, addForm, setAddForm)}
                        country="IN"
                        variant="compact"
                        name="phone"
                        required={true}
                        ariaLabel="Phone number"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Email Address <span className="text-slate-400 font-normal lowercase">(optional)</span></label>
                      <input
                        type="email"
                        value={addForm.email}
                        onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                        placeholder="john@autoworkshop.com"
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Aadhaar Number (12 Digits) *</label>
                      <input
                        type="text"
                        required
                        value={addForm.aadharNumber}
                        onChange={(e) => handleAadharChange(e, addForm, setAddForm)}
                        placeholder="e.g. 1234 5678 9012"
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none font-mono focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">PAN Number <span className="text-slate-400 font-normal lowercase">(optional)</span></label>
                      <input
                        type="text"
                        value={addForm.panNumber}
                        onChange={(e) => setAddForm({ ...addForm, panNumber: e.target.value.toUpperCase().slice(0, 10) })}
                        placeholder="e.g. ABCDE1234F"
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none font-mono focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date of Birth</label>
                      <input
                        type="date"
                        value={addForm.dateOfBirth}
                        onChange={(e) => setAddForm({ ...addForm, dateOfBirth: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Employment Details */}
                <div className="bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 p-5 rounded-2xl space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 border-b border-slate-200/60 dark:border-slate-800/60 pb-2.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 block" />
                    2. Employment & Role Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date of Joining *</label>
                      <input
                        type="date"
                        required
                        value={addForm.dateOfJoining}
                        onChange={(e) => setAddForm({ ...addForm, dateOfJoining: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Department *</label>
                      <select
                        value={addForm.department}
                        onChange={(e) => setAddForm({ ...addForm, department: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      >
                        <option value="Service">Service</option>
                        <option value="Spares">Spares</option>
                        <option value="Accounts">Accounts</option>
                        <option value="Body Shop">Body Shop</option>
                        <option value="Administration">Administration</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Role / Job Position *</label>
                      <input
                        type="text"
                        required
                        value={addForm.role}
                        onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                        placeholder="e.g. Advisor, Mechanic, Painter"
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Designation</label>
                      <input
                        type="text"
                        value={addForm.designation}
                        onChange={(e) => setAddForm({ ...addForm, designation: e.target.value })}
                        placeholder="e.g. Senior Technician"
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Employment Status</label>
                      <select
                        value={addForm.status}
                        onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 3: Address & Emergency Contacts */}
                <div className="bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 p-5 rounded-2xl space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5 border-b border-slate-200/60 dark:border-slate-800/60 pb-2.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 block" />
                    3. Address & Emergency Contacts
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Residential Address *</label>
                      <input
                        type="text"
                        required
                        value={addForm.address}
                        onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                        placeholder="House No, Street, Landmark, City, Pincode"
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Notes / Emergency Contacts</label>
                      <input
                        type="text"
                        value={addForm.basicDetails}
                        onChange={(e) => setAddForm({ ...addForm, basicDetails: e.target.value })}
                        placeholder="Emergency contact info, references..."
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 4: Identity & Profile Documents */}
                <div className="bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 p-5 rounded-2xl space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5 border-b border-slate-200/60 dark:border-slate-800/60 pb-2.5">
                    <span className="w-2 h-2 rounded-full bg-purple-500 block" />
                    4. Profile & Identity Documents
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Profile Photo (Image)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file && file.size > 1.5 * 1024 * 1024 && token === 'mock_jwt_token_for_offline_demo') {
                            alert('File size exceeds 1.5MB. Please choose a smaller photo file.');
                            e.target.value = null;
                            return;
                          }
                          setPhotoFile(file);
                        }}
                        className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-200 transition-colors cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Aadhaar Doc (PDF/Img)</label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,image/*"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file && file.size > 1.5 * 1024 * 1024 && token === 'mock_jwt_token_for_offline_demo') {
                            alert('File size exceeds 1.5MB. Please choose a smaller file.');
                            e.target.value = null;
                            return;
                          }
                          setAadharFile(file);
                        }}
                        className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-200 transition-colors cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Resume Doc (PDF/Img)</label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,image/*"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file && file.size > 1.5 * 1024 * 1024 && token === 'mock_jwt_token_for_offline_demo') {
                            alert('File size exceeds 1.5MB. Please choose a smaller resume file.');
                            e.target.value = null;
                            return;
                          }
                          setResumeFile(file);
                        }}
                        className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-200 transition-colors cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sticky Footer - Always Fixed at Bottom */}
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end items-center gap-3 shrink-0 rounded-b-2xl z-10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save Employee Profile
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Employee Modal (React Portal to document.body) */}
      {showEditModal && createPortal(
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 z-[99999] animate-fade-in select-none overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setShowEditModal(false); }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-[min(1100px,95vw)] h-[90vh] max-h-[90vh] flex flex-col relative overflow-hidden my-auto">
            {/* Header - Fixed Sticky */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/50 dark:border-indigo-800/40 flex items-center justify-center shrink-0">
                  <Edit2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-white uppercase tracking-wide flex items-center gap-2">
                    Edit Employee Profile
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/50 text-indigo-650 dark:text-indigo-400 font-bold border border-indigo-200 dark:border-indigo-800/60">
                      {editForm.employeeId || 'N/A'}
                    </span>
                  </h3>
                  <p className="text-[10px] sm:text-xs text-slate-400 font-semibold">Update employee details, contact info, and documents</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center text-slate-400 transition-all duration-200 shadow-xs hover:scale-105 cursor-pointer shrink-0"
                title="Close Modal (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Form Body - Scrollable Inside Modal Only */}
              <div className="p-5 sm:p-7 space-y-6 overflow-y-auto flex-1 min-h-0">
                {errorMsg && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-2xl p-3.5 flex gap-2.5 text-xs text-red-650 dark:text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="font-semibold leading-relaxed">{errorMsg}</span>
                  </div>
                )}

                {/* Section 1: Personal Details */}
                <div className="bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 p-5 rounded-2xl space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 border-b border-slate-200/60 dark:border-slate-800/60 pb-2.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 block" />
                    1. Personal & Contact Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Full Name *</label>
                      <input
                        ref={editNameInputRef}
                        type="text"
                        required
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Phone Number *</label>
                      <InternationalPhoneInput
                        value={editForm.phone}
                        onChange={(val) => handlePhoneChange(val, editForm, setEditForm)}
                        country="IN"
                        variant="compact"
                        name="phone"
                        required={true}
                        ariaLabel="Phone number"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Email Address <span className="text-slate-400 font-normal lowercase">(optional)</span></label>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        placeholder="john@autoworkshop.com"
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Aadhaar Number (12 Digits) *</label>
                      <input
                        type="text"
                        required
                        value={editForm.aadharNumber}
                        onChange={(e) => handleAadharChange(e, editForm, setEditForm)}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none font-mono focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">PAN Number <span className="text-slate-400 font-normal lowercase">(optional)</span></label>
                      <input
                        type="text"
                        value={editForm.panNumber}
                        onChange={(e) => setEditForm({ ...editForm, panNumber: e.target.value.toUpperCase().slice(0, 10) })}
                        placeholder="e.g. ABCDE1234F"
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none font-mono focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date of Birth</label>
                      <input
                        type="date"
                        value={editForm.dateOfBirth}
                        onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Employment Details */}
                <div className="bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 p-5 rounded-2xl space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 border-b border-slate-200/60 dark:border-slate-800/60 pb-2.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 block" />
                    2. Employment & Role Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date of Joining *</label>
                      <input
                        type="date"
                        required
                        value={editForm.dateOfJoining}
                        onChange={(e) => setEditForm({ ...editForm, dateOfJoining: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Department *</label>
                      <select
                        value={editForm.department}
                        onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      >
                        <option value="Service">Service</option>
                        <option value="Spares">Spares</option>
                        <option value="Accounts">Accounts</option>
                        <option value="Body Shop">Body Shop</option>
                        <option value="Administration">Administration</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Role / Job Position *</label>
                      <input
                        type="text"
                        required
                        value={editForm.role}
                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                        placeholder="e.g. Advisor, Mechanic, Painter"
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Designation</label>
                      <input
                        type="text"
                        value={editForm.designation}
                        onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                        placeholder="e.g. Senior Technician"
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Employment Status</label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 3: Address & Emergency Contacts */}
                <div className="bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 p-5 rounded-2xl space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5 border-b border-slate-200/60 dark:border-slate-800/60 pb-2.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 block" />
                    3. Address & Emergency Contacts
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Residential Address *</label>
                      <input
                        type="text"
                        required
                        value={editForm.address}
                        onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Notes / Emergency Contacts</label>
                      <input
                        type="text"
                        value={editForm.basicDetails}
                        onChange={(e) => setEditForm({ ...editForm, basicDetails: e.target.value })}
                        placeholder="Emergency contact info, references..."
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 4: Identity & Profile Documents */}
                <div className="bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 p-5 rounded-2xl space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5 border-b border-slate-200/60 dark:border-slate-800/60 pb-2.5">
                    <span className="w-2 h-2 rounded-full bg-purple-500 block" />
                    4. Profile & Identity Documents
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Profile Photo (Image) <span className="text-slate-400 font-normal lowercase">(optional update)</span></label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file && file.size > 1.5 * 1024 * 1024 && token === 'mock_jwt_token_for_offline_demo') {
                            alert('File size exceeds 1.5MB. Please choose a smaller photo file.');
                            e.target.value = null;
                            return;
                          }
                          setEditPhotoFile(file);
                        }}
                        className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-200 transition-colors cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Aadhaar Doc (PDF/Img) <span className="text-slate-400 font-normal lowercase">(optional update)</span></label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,image/*"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file && file.size > 1.5 * 1024 * 1024 && token === 'mock_jwt_token_for_offline_demo') {
                            alert('File size exceeds 1.5MB. Please choose a smaller file.');
                            e.target.value = null;
                            return;
                          }
                          setEditAadharFile(file);
                        }}
                        className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-200 transition-colors cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Resume Doc (PDF/Img) <span className="text-slate-400 font-normal lowercase">(optional update)</span></label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,image/*"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file && file.size > 1.5 * 1024 * 1024 && token === 'mock_jwt_token_for_offline_demo') {
                            alert('File size exceeds 1.5MB. Please choose a smaller resume file.');
                            e.target.value = null;
                            return;
                          }
                          setEditResumeFile(file);
                        }}
                        className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-200 transition-colors cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sticky Footer - Always Fixed at Bottom */}
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end items-center gap-3 shrink-0 rounded-b-2xl z-10">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Employee History & Profile Modal (React Portal to document.body) */}
      {selectedProfileEmployee && createPortal(
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 z-[99999] animate-fade-in select-none">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-[min(800px,95vw)] max-h-[90vh] overflow-hidden flex flex-col my-auto">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
              <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide">Employee Details & History</h3>
              <button
                onClick={() => setSelectedProfileEmployee(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center text-slate-400 transition-all duration-200 shadow-xs hover:scale-105 cursor-pointer shrink-0"
                title="Close Modal (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!selectedProfileEmployee._id && !selectedProfileEmployee.name ? (
              <div className="p-8 text-center space-y-4">
                <AlertCircle className="w-12 h-12 text-amber-500 mx-auto animate-bounce" />
                <h4 className="text-base font-bold text-slate-800 dark:text-white">Employee details could not be loaded</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">Please try again or select a valid employee record from the registry table.</p>
                <button
                  type="button"
                  onClick={() => setSelectedProfileEmployee(null)}
                  className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="p-6 overflow-y-auto space-y-6 flex-1 min-h-0">
                {/* Header profile summary card */}
                <div className="flex flex-col sm:flex-row items-center gap-6 bg-slate-50 dark:bg-slate-950 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
                  {selectedProfileEmployee.photoUrl ? (
                    <img
                      src={getResumeDownloadUrl(selectedProfileEmployee.photoUrl)}
                      alt={selectedProfileEmployee.name || 'Employee Photo'}
                      className="w-20 h-20 rounded-full object-cover border-2 border-indigo-500 shadow-sm shrink-0"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'https://via.placeholder.com/150';
                      }}
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-indigo-500 text-white flex items-center justify-center text-2xl font-black shrink-0 shadow-sm">
                      {(selectedProfileEmployee.name || 'Staff').split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                  )}
                  
                  <div className="text-center sm:text-left space-y-1">
                    <h4 className="text-base font-black text-slate-800 dark:text-white">{selectedProfileEmployee.name || 'Not Available'}</h4>
                    <span className="text-xs font-mono font-bold text-indigo-650 dark:text-indigo-400 block">
                      {selectedProfileEmployee.employeeId || 'Not Available'}
                    </span>
                    <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 mt-2">
                      <span className="px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-400 rounded-full text-[10px] font-bold">
                        {selectedProfileEmployee.department || 'Service'}
                      </span>
                      <span className="px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-400 rounded-full text-[10px] font-bold">
                        {selectedProfileEmployee.designation || selectedProfileEmployee.role || 'Staff'}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        selectedProfileEmployee.status === 'Inactive' 
                          ? 'bg-red-50 dark:bg-red-950/30 text-red-650 dark:text-red-400 border border-red-200' 
                          : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-605 dark:text-emerald-400 border border-emerald-200'
                      }`}>
                        {selectedProfileEmployee.status || 'Active'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Personal & Professional Info Grid */}
                <div className="space-y-3">
                  <h5 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Personal & Professional Information</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/50 dark:bg-slate-950/30 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Employee ID</span>
                      <span className="font-mono font-bold text-slate-850 dark:text-slate-200">{selectedProfileEmployee.employeeId || 'Not Available'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Full Name</span>
                      <span className="font-bold text-slate-850 dark:text-slate-200">{selectedProfileEmployee.name || 'Not Available'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Designation</span>
                      <span className="font-semibold text-slate-850 dark:text-slate-200">{selectedProfileEmployee.designation || selectedProfileEmployee.role || 'Not Available'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Department</span>
                      <span className="font-semibold text-slate-850 dark:text-slate-200">{selectedProfileEmployee.department || 'Not Available'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Role / Access</span>
                      <span className="font-semibold text-slate-850 dark:text-slate-200">{selectedProfileEmployee.role || 'Staff'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Status</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{selectedProfileEmployee.status || 'Active'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Mobile Number</span>
                      <span className="font-mono text-slate-850 dark:text-slate-200">{selectedProfileEmployee.phone || 'Not Available'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Email Address</span>
                      <span className="text-slate-850 dark:text-slate-200 font-mono">{selectedProfileEmployee.email || 'Not Available'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Date of Joining</span>
                      <span className="text-slate-850 dark:text-slate-200">
                        {selectedProfileEmployee.dateOfJoining ? new Date(selectedProfileEmployee.dateOfJoining).toLocaleDateString('en-IN') : 'Not Available'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Date of Birth</span>
                      <span className="text-slate-850 dark:text-slate-200">
                        {selectedProfileEmployee.dateOfBirth ? new Date(selectedProfileEmployee.dateOfBirth).toLocaleDateString('en-IN') : 'Not Available'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Base Salary</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {selectedProfileEmployee.salaries?.[0]?.basicSalary ? `₹ ${selectedProfileEmployee.salaries[0].basicSalary.toLocaleString('en-IN')}` : (selectedProfileEmployee.salary ? `₹ ${Number(selectedProfileEmployee.salary).toLocaleString('en-IN')}` : 'Not Available')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">PAN Number</span>
                      <span className="font-mono uppercase text-slate-850 dark:text-slate-200">{selectedProfileEmployee.panNumber || 'Not Available'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Aadhaar Number</span>
                      <span className="font-mono text-slate-850 dark:text-slate-200">{selectedProfileEmployee.aadharNumber || 'Not Available'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Emergency Contact</span>
                      <span className="text-slate-850 dark:text-slate-200">{selectedProfileEmployee.emergencyContact || selectedProfileEmployee.basicDetails || 'Not Available'}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-[10px] text-slate-400 font-bold block">Address</span>
                      <span className="text-slate-850 dark:text-slate-200">{selectedProfileEmployee.address || 'Not Available'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Created Date</span>
                      <span className="text-slate-500 font-mono text-[11px]">
                        {selectedProfileEmployee.createdAt ? new Date(selectedProfileEmployee.createdAt).toLocaleString('en-IN') : 'Not Available'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Last Updated</span>
                      <span className="text-slate-500 font-mono text-[11px]">
                        {selectedProfileEmployee.updatedAt ? new Date(selectedProfileEmployee.updatedAt).toLocaleString('en-IN') : 'Not Available'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Document Downloads */}
                <div className="space-y-3">
                  <h5 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Verification Documents</h5>
                  <div className="flex flex-wrap gap-3">
                    {selectedProfileEmployee.resumeUrl ? (
                      <button
                        type="button"
                        onClick={(e) => handleDownloadResume(e, selectedProfileEmployee.resumeUrl)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-650 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30 rounded-xl hover:bg-indigo-100/50 text-xs font-bold"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Resume
                      </button>
                    ) : (
                      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950 text-slate-400 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs font-semibold">
                        No Resume Uploaded
                      </div>
                    )}

                    {selectedProfileEmployee.aadharDocUrl ? (
                      <button
                        type="button"
                        onClick={(e) => handleDownloadResume(e, selectedProfileEmployee.aadharDocUrl)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-650 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 rounded-xl hover:bg-emerald-100/50 text-xs font-bold"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Aadhaar Doc
                      </button>
                    ) : (
                      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950 text-slate-400 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs font-semibold">
                        No Aadhaar Doc Uploaded
                      </div>
                    )}

                    {selectedProfileEmployee.photoUrl ? (
                      <button
                        type="button"
                        onClick={(e) => handleDownloadResume(e, selectedProfileEmployee.photoUrl)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-650 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30 rounded-xl hover:bg-indigo-100/50 text-xs font-bold"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Profile Photo
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* History & Logs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Attendance Summary */}
                  <div className="space-y-3">
                    <h5 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Attendance Breakdown</h5>
                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2 text-xs font-bold">
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Present Days</span>
                        <span>{Array.isArray(selectedProfileEmployee.attendance) ? selectedProfileEmployee.attendance.filter(a => a?.status === 'Present').length : 0} days</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Absent Days</span>
                        <span>{Array.isArray(selectedProfileEmployee.attendance) ? selectedProfileEmployee.attendance.filter(a => a?.status === 'Absent').length : 0} days</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Half Days</span>
                        <span>{Array.isArray(selectedProfileEmployee.attendance) ? selectedProfileEmployee.attendance.filter(a => a?.status === 'Half Day').length : 0} days</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> Leave Days</span>
                        <span>{Array.isArray(selectedProfileEmployee.attendance) ? selectedProfileEmployee.attendance.filter(a => a?.status === 'Leave').length : 0} days</span>
                      </div>
                    </div>
                  </div>

                  {/* Salary slip Timeline archives */}
                  <div className="space-y-3">
                    <h5 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Salary Statement Logs</h5>
                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2.5 max-h-[160px] overflow-y-auto text-xs font-semibold">
                      {Array.isArray(selectedProfileEmployee.salaries) && selectedProfileEmployee.salaries.length > 0 ? (
                        selectedProfileEmployee.salaries.slice().sort((a,b) => (b?.monthYear || '').localeCompare(a?.monthYear || '')).map((slip, index) => {
                          if (!slip || !slip.monthYear || !slip.monthYear.includes('-')) return null;
                          const [year, month] = slip.monthYear.split('-');
                          const monthName = new Date(Number(year), Number(month) - 1).toLocaleString('default', { month: 'short', year: 'numeric' });
                          return (
                            <div key={index} className="flex justify-between items-center border-b border-slate-100 dark:border-slate-900 pb-2 last:border-b-0 last:pb-0">
                              <div>
                                <span className="block font-bold text-slate-850 dark:text-slate-200">{monthName}</span>
                                <span className="block text-[10px] text-emerald-600 font-bold">₹{(slip.netSalary || 0).toLocaleString('en-IN')}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handlePrintHistoricalSalarySlip(selectedProfileEmployee, slip)}
                                className="px-2.5 py-1 bg-white dark:bg-slate-900 text-[10px] border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 font-bold dark:hover:bg-slate-800"
                              >
                                Print
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <span className="text-slate-400 italic block py-4 text-center">No statements generated.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Read-Only Modal Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedProfileEmployee(null)}
                className="px-5 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {showHistoryModal && activeHistoryEmployee && createPortal(
        (() => {
          const details = getMonthlyDetails(activeHistoryEmployee);
          const presentDates = details.filter(d => d.status === 'Present' || d.status === 'Present (Worked on Weekly Off)');
          const absentDates = details.filter(d => d.status === 'Absent');
          const halfDayDates = details.filter(d => d.status === 'Half Day');
          const leaveDates = details.filter(d => d.status === 'Leave');
          const weeklyOffDates = details.filter(d => d.status === 'Weekly Off');

          return (
            <div className="fixed inset-0 bg-slate-905/75 backdrop-blur-xs flex items-center justify-center p-4 z-55">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-2xl shadow-xl max-h-[85vh] overflow-y-auto flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                    <div>
                      <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide">
                        Attendance History Details
                      </h3>
                      <p className="text-[10px] text-slate-400 font-semibold">{activeHistoryEmployee.name} - {new Date(selectedYearFilter, selectedMonthFilter - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}</p>
                    </div>
                    <button
                      onClick={() => { setShowHistoryModal(false); setActiveHistoryEmployee(null); }}
                      className="p-1 text-slate-400 hover:text-slate-650 bg-slate-50 dark:bg-slate-850 rounded-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Present Dates */}
                    <div>
                      <span className="text-[10px] font-black text-emerald-650 dark:text-emerald-400 uppercase tracking-wider block mb-1">🟢 Present ({presentDays.length} Days)</span>
                      {presentDays.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          {presentDates.map(d => (
                            <div key={d.dateStr} className="p-2 bg-emerald-50/30 dark:bg-emerald-955/10 rounded-lg border border-emerald-150/40" title={`By: ${d.updatedBy || 'N/A'}\nTime: ${d.updatedTime ? new Date(d.updatedTime).toLocaleString('en-IN') : 'N/A'}\nRemarks: ${d.remarks || 'None'}`}>
                              {new Date(d.dateStr).toLocaleDateString('en-IN')}
                              <span className="block text-[8px] text-slate-500 font-bold">{d.status}</span>
                              {d.remarks && <span className="block text-[8px] text-slate-455 truncate">{d.remarks}</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic block pl-2">No present days recorded.</span>
                      )}
                    </div>

                    {/* Absent Dates */}
                    <div>
                      <span className="text-[10px] font-black text-rose-500 uppercase tracking-wider block mb-1">🔴 Absent ({absentDates.length} Days)</span>
                      {absentDates.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-semibold text-slate-655 dark:text-slate-400">
                          {absentDates.map(d => (
                            <div key={d.dateStr} className="p-2 bg-rose-50/30 dark:bg-rose-955/10 rounded-lg border border-rose-150/40" title={`By: ${d.updatedBy || 'N/A'}\nTime: ${d.updatedTime ? new Date(d.updatedTime).toLocaleString('en-IN') : 'N/A'}\nRemarks: ${d.remarks || 'None'}`}>
                              {new Date(d.dateStr).toLocaleDateString('en-IN')}
                              {d.remarks && <span className="block text-[8px] text-slate-455 truncate">{d.remarks}</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic block pl-2">No absent days recorded.</span>
                      )}
                    </div>

                    {/* Half Day Dates */}
                    <div>
                      <span className="text-[10px] font-black text-amber-500 uppercase tracking-wider block mb-1">🟡 Half Day ({halfDayDates.length} Days)</span>
                      {halfDayDates.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-semibold text-slate-655 dark:text-slate-400">
                          {halfDayDates.map(d => (
                            <div key={d.dateStr} className="p-2 bg-amber-50/30 dark:bg-amber-955/10 rounded-lg border border-amber-150/40" title={`By: ${d.updatedBy || 'N/A'}\nTime: ${d.updatedTime ? new Date(d.updatedTime).toLocaleString('en-IN') : 'N/A'}\nRemarks: ${d.remarks || 'None'}`}>
                              {new Date(d.dateStr).toLocaleDateString('en-IN')}
                              {d.remarks && <span className="block text-[8px] text-slate-455 truncate">{d.remarks}</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic block pl-2">No half days recorded.</span>
                      )}
                    </div>

                    {/* Leave Dates */}
                    <div>
                      <span className="text-[10px] font-black text-blue-500 uppercase tracking-wider block mb-1">🔵 Leave ({leaveDates.length} Days)</span>
                      {leaveDates.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-semibold text-slate-655 dark:text-slate-400">
                          {leaveDates.map(d => (
                            <div key={d.dateStr} className="p-2 bg-blue-50/30 dark:bg-blue-955/10 rounded-lg border border-blue-150/40" title={`By: ${d.updatedBy || 'N/A'}\nTime: ${d.updatedTime ? new Date(d.updatedTime).toLocaleString('en-IN') : 'N/A'}\nRemarks: ${d.remarks || 'None'}`}>
                              {new Date(d.dateStr).toLocaleDateString('en-IN')}
                              {d.remarks && <span className="block text-[8px] text-slate-455 truncate">{d.remarks}</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic block pl-2">No leave days recorded.</span>
                      )}
                    </div>

                    {/* Weekly Off Dates */}
                    <div>
                      <span className="text-[10px] font-black text-slate-550 dark:text-slate-400 uppercase tracking-wider block mb-1">⚪ Weekly Off ({weeklyOffDates.length} Days)</span>
                      {weeklyOffDates.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-semibold text-slate-655 dark:text-slate-400">
                          {weeklyOffDates.map(d => (
                            <div key={d.dateStr} className="p-2 bg-slate-50/30 dark:bg-slate-800/10 rounded-lg border border-slate-200/40" title={`By: ${d.updatedBy || 'N/A'}\nRemarks: ${d.remarks || 'None'}`}>
                              {new Date(d.dateStr).toLocaleDateString('en-IN')}
                              <span className="block text-[8px] text-slate-500 font-bold">Weekly Off</span>
                              {d.remarks && <span className="block text-[8px] text-slate-455 truncate">{d.remarks}</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic block pl-2">No weekly off days recorded.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4 mt-6 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => { setShowHistoryModal(false); setActiveHistoryEmployee(null); }}
                    className="px-6 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-750 dark:text-slate-300 font-bold rounded-xl text-xs"
                  >
                    Close History
                  </button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
}
