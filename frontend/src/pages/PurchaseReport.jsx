import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../config';
import SearchableDropdown from '../components/SearchableDropdown';
import { useInventoryCache } from '../hooks/useInventoryCache';
import { 
  ShoppingBag, 
  Search, 
  Calendar, 
  Building2, 
  Tag, 
  Layers, 
  FileSpreadsheet, 
  Printer, 
  FileText, 
  ArrowUpDown, 
  IndianRupee, 
  Package, 
  Receipt,
  RotateCcw,
  AlertTriangle,
  Plus,
  X,
  Check,
  CheckCircle,
  Trash2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Eye,
  Percent,
  Pencil
} from 'lucide-react';

// Helpers to extract brand information and multi-brand lists from Vendor records
export const getVendorBrandsList = (vendor) => {
  if (!vendor) return [];
  const list = [];
  if (Array.isArray(vendor.brands) && vendor.brands.length > 0) {
    vendor.brands.forEach(b => {
      const trimmed = (b || '').trim();
      if (trimmed && !list.includes(trimmed)) list.push(trimmed);
    });
  }
  if (vendor.supplierBrand && vendor.supplierBrand.trim()) {
    const trimmed = vendor.supplierBrand.trim();
    if (!list.includes(trimmed)) list.unshift(trimmed);
  }
  // Heuristic fallback for established vendors if not explicitly set
  if (list.length === 0 && vendor.name) {
    const lower = vendor.name.toLowerCase();
    if (lower.includes('bosch')) list.push('Bosch');
    else if (lower.includes('castrol')) list.push('Castrol');
    else if (lower.includes('gates')) list.push('Gates');
    else if (lower.includes('philips')) list.push('Philips');
    else if (lower.includes('exide')) list.push('Exide');
    else if (lower.includes('minda')) list.push('Minda');
    else if (lower.includes('lumax')) list.push('Lumax');
  }
  return list;
};

export const getVendorSupplierBrand = (vendor) => {
  if (!vendor) return '';
  if (vendor.supplierBrand && vendor.supplierBrand.trim()) return vendor.supplierBrand.trim();
  const brands = getVendorBrandsList(vendor);
  if (brands.length > 0) return brands[0];
  return '';
};

export default function PurchaseReport({ token, user }) {
  // Active Module Sub-Tab: 'entry' | 'history' | 'reports'
  const [activeTab, setActiveTab] = useState('entry');
  const [editPurchaseId, setEditPurchaseId] = useState(null);

  // Datasets
  const [vendorsList, setVendorsList] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const { data: partsInventory } = useInventoryCache(token, 'parts');
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [reportsData, setReportsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [brokenAttachments, setBrokenAttachments] = useState({});
  const [error, setError] = useState('');
  const [uploadingPurchaseId, setUploadingPurchaseId] = useState(null);
  const directFileInputRef = useRef(null);
  const [targetPurchaseForUpload, setTargetPurchaseForUpload] = useState(null);

  const hasValidAttachment = (p) => {
    if (!p) return false;
    if (p.attachments && Array.isArray(p.attachments) && p.attachments.length > 0) {
      return p.attachments.some(a => a && a.key && !['undefined', 'null'].includes(a.key));
    }
    if (p.attachmentUrl) {
      const raw = p.attachmentUrl.trim();
      return raw !== '' && !['undefined', '/api/purchases/attachment/undefined', 'null'].includes(raw);
    }
    return false;
  };

  const getAttachmentSrc = (urlOrKey) => {
    if (!urlOrKey) return '';
    if (urlOrKey.startsWith('blob:') || urlOrKey.startsWith('data:')) {
      return urlOrKey;
    }
    let path = urlOrKey;
    if (path.match(/^[a-f\d]{24}$/i)) {
      path = `/api/purchases/attachment/${path}`;
    } else if (!path.startsWith('/') && !path.startsWith('http')) {
      if (path.startsWith('uploads/')) {
        path = `/${path}`;
      } else if (!path.startsWith('api/')) {
        path = `/uploads/${path}`;
      }
    }
    let src = path.startsWith('http') ? path : `${API_BASE_URL.replace('/api', '')}${path}`;
    if (src.includes('/api/purchases/attachment/')) {
      const separator = src.includes('?') ? '&' : '?';
      return `${src}${separator}token=${token}`;
    }
    return src;
  };

  const handleViewAttachment = async (e, purchaseOrUrl, index = 0) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!purchaseOrUrl) return;

    let src = '';
    let purchaseId = null;

    if (purchaseOrUrl && typeof purchaseOrUrl === 'object') {
      purchaseId = purchaseOrUrl._id;
      src = `${API_BASE_URL}/purchases/${purchaseId}/attachment?index=${index}&token=${token}`;
    } else if (typeof purchaseOrUrl === 'string' && purchaseOrUrl.match(/^[a-f\d]{24}$/i)) {
      src = `${API_BASE_URL}/purchases/attachment/${purchaseOrUrl}?token=${token}`;
    } else {
      src = getAttachmentSrc(purchaseOrUrl);
    }

    try {
      const res = await fetch(src, { method: 'HEAD' });
      if (res.status === 404 || res.status === 400) {
        const errorKey = purchaseId || purchaseOrUrl;
        setBrokenAttachments(prev => ({ ...prev, [errorKey]: true }));
        alert('Attachment unavailable — file is missing from persistent storage. Please use the "Upload Invoice" button to re-attach the vendor invoice.');
        return;
      }
    } catch (err) {
      console.warn('Failed to verify attachment status:', err);
    }
    window.open(src, '_blank');
  };

  const triggerReupload = (purchase) => {
    setTargetPurchaseForUpload(purchase);
    if (directFileInputRef.current) {
      directFileInputRef.current.value = '';
      directFileInputRef.current.click();
    }
  };

  const handleDirectInvoiceUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !targetPurchaseForUpload) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file format. Please upload JPG, PNG, WEBP, or PDF.');
      return;
    }

    const purchaseId = targetPurchaseForUpload._id;
    setUploadingPurchaseId(purchaseId);

    try {
      const formData = new FormData();
      formData.append('attachment', file);

      const res = await fetch(`${API_BASE_URL}/purchases/${purchaseId}/reupload-attachment`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setPurchaseHistory(prev => prev.map(p => p._id === purchaseId ? data.purchase : p));
        if (selectedVoucher && selectedVoucher._id === purchaseId) {
          setSelectedVoucher(data.purchase);
        }
        setBrokenAttachments(prev => {
          const next = { ...prev };
          delete next[purchaseId];
          if (data.purchase.attachmentUrl) delete next[data.purchase.attachmentUrl];
          return next;
        });
        alert(`Invoice "${file.name}" uploaded and attached successfully!`);
        const errData = await res.json().catch(() => ({}));
        const errorDetail = errData.error || errData.message || (res.status === 404 ? 'Backend upload endpoint not found. Please ensure Render deployment is live.' : res.statusText) || `Server error (${res.status})`;
        alert(`Failed to upload invoice: ${errorDetail}`);
      }
    } catch (err) {
      console.error('Error uploading invoice attachment:', err);
      alert('Failed to upload invoice attachment due to network error.');
    } finally {
      setUploadingPurchaseId(null);
      setTargetPurchaseForUpload(null);
    }
  };

  // Filtering & Search for History & Reports
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [partNameFilter, setPartNameFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Sorting State
  const [sortField, setSortField] = useState('purchaseDate');
  const [sortDirection, setSortDirection] = useState('desc');

  // Expanded Row IDs in Purchase History
  const [expandedPurchaseIds, setExpandedPurchaseIds] = useState(new Set());

  // View Voucher Modal State
  const [selectedVoucher, setSelectedVoucher] = useState(null);

  // Payment Status Update Modal State
  const [paymentModalPurchase, setPaymentModalPurchase] = useState(null);
  const [paymentModalAmount, setPaymentModalAmount] = useState('');
  const [paymentModalStatus, setPaymentModalStatus] = useState('Credit');
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // ==========================================
  // PURCHASE ENTRY FORM STATE (Multi-Part)
  // ==========================================
  const createEmptyRow = (defaultBrand = '') => ({
    id: `row_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    selectedPartId: '',
    partName: '',
    partNumber: '',
    hsnCode: '8708',
    qty: 1,
    purchasePrice: '',
    sellingPrice: '',
    mrp: '',
    discountType: 'Percent',
    discountPercent: 0,
    discountAmount: 0,
    taxable: '',
    discountValue: 0,
    gstPercent: 18,
    warehouse: 'Main Store',
    rackLocation: '',
    // New fields for Parts Master integration
    brand: defaultBrand || '',
    supplierBrand: defaultBrand || '',
    vehicleMake: '',
    vehicleModel: '',
    compatibility: '',
    oemBrand: '',
    warranty: '',
    isManualBrand: false
  });

  const [purchaseHeader, setPurchaseHeader] = useState({
    vendorId: '',
    invoiceNo: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    paymentStatus: 'Credit', // Options: Paid, Credit, Partially Paid
    amountPaid: '',
    notes: '',
    updatePurchasePrice: true,
    updateMRP: true
  });

  const [purchaseItems, setPurchaseItems] = useState([createEmptyRow()]);
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState('');
  const [purchaseFormError, setPurchaseFormError] = useState('');
  const [invoiceNoDuplicate, setInvoiceNoDuplicate] = useState(false);

  const invoiceNoRef = useRef(null);

  const [attachments, setAttachments] = useState([]);

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleFilesUpload = async (filesList) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    const validFiles = Array.from(filesList).filter(file => {
      if (!allowedTypes.includes(file.type)) {
        alert(`File "${file.name}" ignored. Only JPG, JPEG, PNG, WEBP, and PDF files are allowed.`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    const newAttachments = validFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'uploading',
      url: ''
    }));

    setAttachments(prev => [...prev, ...newAttachments]);

    for (const att of newAttachments) {
      try {
        if (token === 'mock_jwt_token_for_offline_demo') {
          const reader = new FileReader();
          reader.onload = () => {
            setAttachments(prev => prev.map(item => 
              item.id === att.id 
                ? { ...item, status: 'uploaded', url: reader.result }
                : item
            ));
          };
          reader.readAsDataURL(att.file);
        } else {
          const formData = new FormData();
          formData.append('attachment', att.file);

          const res = await fetch(`${API_BASE_URL}/purchases/upload-attachment`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`
            },
            body: formData
          });

          if (res.ok) {
            const data = await res.json();
            setAttachments(prev => prev.map(item => 
              item.id === att.id 
                ? { 
                    ...item, 
                    status: 'uploaded', 
                    url: `/api/purchases/attachment/${data.key}`, 
                    name: data.originalName || item.name, 
                    type: data.mimeType || item.type,
                    size: data.size || item.size,
                    key: data.key
                  }
                : item
            ));
          } else {
            setAttachments(prev => prev.map(item => 
              item.id === att.id ? { ...item, status: 'error' } : item
            ));
          }
        }
      } catch (err) {
        console.error(err);
        setAttachments(prev => prev.map(item => 
          item.id === att.id ? { ...item, status: 'error' } : item
        ));
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      handleFilesUpload(e.target.files);
    }
  };

  const handleRemoveAttachment = (indexToRemove) => {
    setAttachments(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Auto-focus Invoice No. field on tab change or duplicate error detection
  useEffect(() => {
    if (activeTab === 'entry') {
      const timer = setTimeout(() => {
        invoiceNoRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  useEffect(() => {
    if (invoiceNoDuplicate) {
      invoiceNoRef.current?.focus();
    }
  }, [invoiceNoDuplicate]);

  // Reactive background check for duplicate Invoice No.
  useEffect(() => {
    const checkDuplicate = async () => {
      if (!purchaseHeader.vendorId || !purchaseHeader.invoiceNo || !String(purchaseHeader.invoiceNo).trim()) {
        setInvoiceNoDuplicate(false);
        if (purchaseFormError === 'Invoice No. already exists for this vendor.') {
          setPurchaseFormError('');
        }
        return;
      }
      
      try {
        const cleanInv = String(purchaseHeader.invoiceNo).trim().replace(/\s+/g, ' ');
        const url = `${API_BASE_URL}/purchases/check-duplicate?vendorId=${purchaseHeader.vendorId}&invoiceNo=${encodeURIComponent(cleanInv)}` + (editPurchaseId ? `&excludeId=${editPurchaseId}` : '');
        
        const checkRes = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (checkRes.status === 409) {
          setInvoiceNoDuplicate(true);
          setPurchaseFormError('Invoice No. already exists for this vendor.');
        } else {
          setInvoiceNoDuplicate(false);
          if (purchaseFormError === 'Invoice No. already exists for this vendor.') {
            setPurchaseFormError('');
          }
        }
      } catch (err) {
        console.warn('Reactive duplicate check failed:', err);
      }
    };

    const timeoutId = setTimeout(() => {
      checkDuplicate();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [purchaseHeader.invoiceNo, purchaseHeader.vendorId, token, editPurchaseId]);

  // Helper for 2-decimal rounding
  const round2 = (num) => Math.round(((Number(num) || 0) + Number.EPSILON) * 100) / 100;

  // Load initial datasets
  useEffect(() => {
    fetchVendors();
    fetchInventoryList();
    fetchPurchases();
    fetchPurchaseReports();
  }, [token]);

  // Sync vendor ID from vendorName if vendorsList loads later
  useEffect(() => {
    if (editPurchaseId && !purchaseHeader.vendorId && purchaseHeader.vendorName && vendorsList.length > 0) {
      const match = vendorsList.find(v => v.name.trim().toLowerCase() === purchaseHeader.vendorName.trim().toLowerCase());
      if (match) {
        setPurchaseHeader(prev => ({ ...prev, vendorId: match._id }));
      }
    }
  }, [vendorsList, editPurchaseId, purchaseHeader.vendorName, purchaseHeader.vendorId]);

  const fetchVendors = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/vendors`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.vendors || data.data || []);
        setVendorsList(Array.isArray(list) ? list : []);
      }
    } catch (err) {
      console.error('Failed to fetch vendors:', err);
      setVendorsList([]);
    }
  };

  const fetchInventoryList = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/inventory`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInventoryList(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch inventory:', err);
    }
  };

  const fetchPurchases = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/purchases`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPurchaseHistory(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch purchases:', err);
    }
  };

  const fetchPurchaseReports = async () => {
    setLoading(true);
    setError('');
    try {
      const queryParams = new URLSearchParams();
      if (fromDate) queryParams.append('fromDate', fromDate);
      if (toDate) queryParams.append('toDate', toDate);
      if (vendorId) queryParams.append('vendorId', vendorId);
      if (partNameFilter) queryParams.append('partName', partNameFilter);
      if (categoryFilter) queryParams.append('category', categoryFilter);
      if (paymentStatusFilter) queryParams.append('paymentStatus', paymentStatusFilter);
      if (warehouseFilter) queryParams.append('warehouse', warehouseFilter);

      const res = await fetch(`${API_BASE_URL}/reports/purchase-history?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        let extracted = [];
        if (Array.isArray(data)) {
          extracted = data;
        } else if (data && Array.isArray(data.reports)) {
          extracted = data.reports;
        } else if (data && Array.isArray(data.data)) {
          extracted = data.data;
        }
        setReportsData(Array.isArray(extracted) ? extracted : []);
      } else {
        const errObj = await res.json().catch(() => ({}));
        setError(errObj.error || 'Failed to fetch purchase report data.');
        setReportsData([]);
      }
    } catch (err) {
      console.error('Failed to fetch purchase reports:', err);
      setError('Failed to connect to server.');
      setReportsData([]);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch reports when filters change
  useEffect(() => {
    fetchPurchaseReports();
  }, [fromDate, toDate, vendorId, partNameFilter, categoryFilter, paymentStatusFilter, warehouseFilter]);

  // ==========================================
  // MULTI-PART ROW LOGIC & DUAL DISCOUNT SYNC
  // ==========================================
  const handleAddRow = () => {
    const selectedV = vendorsList.find(v => v._id === purchaseHeader.vendorId);
    const defaultBrand = getVendorSupplierBrand(selectedV);
    setPurchaseItems(prev => [...prev, createEmptyRow(defaultBrand)]);
  };

  const handleRemoveRow = (id) => {
    const selectedV = vendorsList.find(v => v._id === purchaseHeader.vendorId);
    const defaultBrand = getVendorSupplierBrand(selectedV);
    if (purchaseItems.length === 1) {
      // Clear values instead of removing single row
      setPurchaseItems([createEmptyRow(defaultBrand)]);
      return;
    }
    setPurchaseItems(prev => prev.filter(row => row.id !== id));
  };

  const handleSelectSKU = (rowId, partId) => {
    const selected = inventoryList.find(p => p._id === partId);
    const selectedV = vendorsList.find(v => v._id === purchaseHeader.vendorId);
    const vendorBrand = getVendorSupplierBrand(selectedV);
    setPurchaseItems(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      if (!selected) {
        return { ...row, selectedPartId: '' };
      }
      const rawRow = {
        ...row,
        selectedPartId: selected._id,
        partName: selected.partName || '',
        partNumber: selected.partNumber || '',
        hsnCode: selected.hsnCode || '8708',
        purchasePrice: selected.purchasePrice !== undefined ? selected.purchasePrice.toString() : '',
        sellingPrice: selected.sellingPrice !== undefined ? selected.sellingPrice.toString() : '',
        mrp: selected.mrp !== undefined ? selected.mrp.toString() : '',
        gstPercent: selected.gstPercent !== undefined ? selected.gstPercent : 18,
        warehouse: selected.warehouse || 'Main Store',
        currentStock: selected.stockQuantity || 0,
        // Populate new fields from Inventory or preserve vendor autofill
        brand: row.brand || selected.brand || vendorBrand || '',
        supplierBrand: row.supplierBrand || vendorBrand || selected.supplier || '',
        compatibility: selected.vehicleCompatibility || '',
        oemBrand: selected.oemBrand || '',
        warranty: selected.warranty || '',
        rackLocation: selected.locationRack || ''
      };
      return recalculateRowDiscounts(rawRow, null, null);
    }));
  };

  const recalculateRowDiscounts = (row, changedField, newValue) => {
    let updatedRow = { ...row };
    if (changedField) {
      updatedRow[changedField] = newValue;
    }

    const qty = Number(updatedRow.qty) || 0;
    const gstP = Number(updatedRow.gstPercent) || 0;
    let mrpVal = Number(updatedRow.mrp) || 0;

    // If MRP is 0 but we have purchasePrice, initialize MRP
    if (mrpVal === 0 && Number(updatedRow.purchasePrice) > 0) {
      mrpVal = Number(updatedRow.purchasePrice) * (1 + gstP / 100);
      updatedRow.mrp = mrpVal.toFixed(2);
    }

    // Calculate Unit Basic Value (purchasePrice/sellingPrice) from MRP
    let unitBasic = mrpVal / (1 + gstP / 100);
    if (changedField !== 'purchasePrice') {
      updatedRow.purchasePrice = unitBasic.toFixed(2);
    }
    updatedRow.sellingPrice = unitBasic.toFixed(2);

    const gross = qty * unitBasic;
    const type = updatedRow.discountType || 'Percent';

    let discPercent = parseFloat(updatedRow.discountPercent) || 0;
    let discAmt = parseFloat(updatedRow.discountAmount) || 0;
    let taxVal = updatedRow.taxable !== undefined && updatedRow.taxable !== '' ? parseFloat(updatedRow.taxable) : null;

    if (changedField === 'taxable') {
      taxVal = Math.max(0, Math.min(gross, parseFloat(newValue) || 0));
      discAmt = gross - taxVal;
      discPercent = gross > 0 ? (discAmt / gross) * 100 : 0;
      updatedRow.taxable = newValue;
      updatedRow.discountAmount = discAmt.toFixed(2);
      updatedRow.discountPercent = discPercent.toFixed(2);
    } else if (changedField === 'discountPercent') {
      discPercent = Math.max(0, Math.min(100, parseFloat(newValue) || 0));
      discAmt = gross * (discPercent / 100);
      taxVal = gross - discAmt;
      updatedRow.discountPercent = newValue;
      updatedRow.discountAmount = discAmt.toFixed(2);
      updatedRow.taxable = taxVal.toFixed(2);
    } else if (changedField === 'discountAmount') {
      discAmt = Math.max(0, Math.min(gross, parseFloat(newValue) || 0));
      discPercent = gross > 0 ? (discAmt / gross) * 100 : 0;
      taxVal = gross - discAmt;
      updatedRow.discountAmount = newValue;
      updatedRow.discountPercent = discPercent.toFixed(2);
      updatedRow.taxable = taxVal.toFixed(2);
    } else if (changedField === 'gstPercent') {
      unitBasic = mrpVal / (1 + gstP / 100);
      updatedRow.purchasePrice = unitBasic.toFixed(2);
      const newGross = qty * unitBasic;
      if (type === 'Percent') {
        discAmt = newGross * (discPercent / 100);
      } else {
        discAmt = Math.max(0, Math.min(newGross, discAmt));
        discPercent = newGross > 0 ? (discAmt / newGross) * 100 : 0;
      }
      taxVal = newGross - discAmt;
      updatedRow.discountAmount = discAmt.toFixed(2);
      updatedRow.discountPercent = discPercent.toFixed(2);
      updatedRow.taxable = taxVal.toFixed(2);
    } else if (changedField === 'purchasePrice') {
      const newBasic = parseFloat(newValue) || 0;
      mrpVal = newBasic * (1 + gstP / 100);
      updatedRow.mrp = mrpVal.toFixed(2);
      const newGross = qty * newBasic;
      if (type === 'Percent') {
        discAmt = newGross * (discPercent / 100);
      } else {
        discAmt = Math.max(0, Math.min(newGross, discAmt));
        discPercent = newGross > 0 ? (discAmt / newGross) * 100 : 0;
      }
      taxVal = newGross - discAmt;
      updatedRow.discountAmount = discAmt.toFixed(2);
      updatedRow.discountPercent = discPercent.toFixed(2);
      updatedRow.taxable = taxVal.toFixed(2);
    } else {
      if (type === 'Percent') {
        discAmt = gross * (discPercent / 100);
      } else {
        discAmt = Math.max(0, Math.min(gross, discAmt));
        discPercent = gross > 0 ? (discAmt / gross) * 100 : 0;
      }
      taxVal = gross - discAmt;
      updatedRow.discountAmount = discAmt.toFixed(2);
      updatedRow.discountPercent = discPercent.toFixed(2);
      updatedRow.taxable = taxVal.toFixed(2);
    }

    updatedRow.discountValue = type === 'Percent' ? updatedRow.discountPercent : updatedRow.discountAmount;
    return updatedRow;
  };

  const handleRowChange = (rowId, field, value) => {
    setPurchaseItems(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      const updated = recalculateRowDiscounts(row, field, value);
      if (field === 'supplierBrand') {
        updated.isManualBrand = true;
      }
      return updated;
    }));
  };

  const handleDiscountPercentChange = (rowId, value) => {
    setPurchaseItems(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      return recalculateRowDiscounts(row, 'discountPercent', value);
    }));
  };

  const handleDiscountAmountChange = (rowId, value) => {
    setPurchaseItems(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      return recalculateRowDiscounts(row, 'discountAmount', value);
    }));
  };

  const handleTaxableChange = (rowId, value) => {
    setPurchaseItems(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      return recalculateRowDiscounts(row, 'taxable', value);
    }));
  };

  const handleIgstPercentChange = (rowId, value) => {
    setPurchaseItems(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      return { ...row, igstPercent: value };
    }));
  };

  // Auto-generate compatibility from vehicleMake and vehicleModel
  const handleVehicleMakeModelChange = (rowId, field, value) => {
    setPurchaseItems(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      const updatedRow = { ...row, [field]: value };
      // Auto-generate compatibility when both make and model are present
      if (updatedRow.vehicleMake && updatedRow.vehicleModel) {
        updatedRow.compatibility = `${updatedRow.vehicleMake}, ${updatedRow.vehicleModel}`;
      } else if (field === 'vehicleMake' && !value) {
        updatedRow.compatibility = '';
      } else if (field === 'vehicleModel' && !value) {
        updatedRow.compatibility = updatedRow.vehicleMake || '';
      }
      return updatedRow;
    }));
  };

  const handleRateBlur = (rowId, val) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setPurchaseItems(prev => prev.map(row => {
        if (row.id !== rowId) return row;
        return { ...row, purchasePrice: num.toFixed(2) };
      }));
    }
  };

  // Helper row totals calculation
  const calculateRowTotals = (row) => {
    const qty = Number(row.qty) || 0;
    const gstP = Number(row.gstPercent) || 0;
    const mrpVal = Number(row.mrp) || 0;
    const unitBasic = mrpVal / (1 + gstP / 100);
    const gross = qty * unitBasic;

    let discountPercent = Number(row.discountPercent) || 0;
    let discountAmount = Number(row.discountAmount) || 0;

    const taxable = Math.max(0, gross - discountAmount);

    const selectedVendor = vendorsList.find(v => v._id === purchaseHeader.vendorId);
    const isInterstate = purchaseHeader.billingType 
      ? purchaseHeader.billingType === 'Inter-State'
      : (selectedVendor && selectedVendor.gstNumber 
          ? !selectedVendor.gstNumber.trim().startsWith('36') 
          : false);

    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let gstAmt = 0;

    if (isInterstate) {
      const igstP = row.igstPercent !== undefined && row.igstPercent !== '' ? Number(row.igstPercent) : gstP;
      igst = taxable * (igstP / 100);
      gstAmt = igst;
    } else {
      cgst = taxable * (gstP / 200);
      sgst = taxable * (gstP / 200);
      gstAmt = cgst + sgst;
    }

    const total = taxable + gstAmt;

    return {
      gross: round2(gross),
      discountPercent: round2(discountPercent),
      discountAmount: round2(discountAmount),
      taxable: round2(taxable),
      gstAmt: round2(gstAmt),
      cgst: round2(cgst),
      sgst: round2(sgst),
      igst: round2(igst),
      total: round2(total)
    };
  };

  // Overall Purchase Summary Calculation (Live Footer)
  const getSummaryTotals = () => {
    const selectedVendor = vendorsList.find(v => v._id === purchaseHeader.vendorId);
    const isInterstate = purchaseHeader.billingType 
      ? purchaseHeader.billingType === 'Inter-State'
      : (selectedVendor && selectedVendor.gstNumber 
          ? !selectedVendor.gstNumber.trim().startsWith('36') 
          : false);

    return purchaseItems.reduce((acc, row) => {
      const qty = Number(row.qty) || 0;
      const { gross, discountAmount, taxable, gstAmt, cgst, sgst, igst, total } = calculateRowTotals(row);

      acc.totalQty += qty;
      acc.subtotal += gross;
      acc.totalDiscount += discountAmount;
      acc.taxableAmount += taxable;
      acc.gstTotal += gstAmt;
      acc.cgstTotal += cgst;
      acc.sgstTotal += sgst;
      acc.igstTotal += igst;
      
      const targetGrandTotal = acc.taxableAmount + acc.gstTotal;
      acc.grandTotal = Math.round(targetGrandTotal);
      acc.roundOff = round2(acc.grandTotal - targetGrandTotal);

      return acc;
    }, {
      totalQty: 0,
      subtotal: 0,
      totalDiscount: 0,
      taxableAmount: 0,
      gstTotal: 0,
      cgstTotal: 0,
      sgstTotal: 0,
      igstTotal: 0,
      roundOff: 0,
      grandTotal: 0
    });
  };

  const summaryTotals = getSummaryTotals();

  const handleStartEdit = async (p) => {
    // 1. Check if the purchase items are already in use
    try {
      const res = await fetch(`${API_BASE_URL}/purchases/${p._id}/check-in-use`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const check = await res.json();
        if (check.isInUse) {
          const partList = check.warnings.map(w => `• ${w.partName} (${w.partNumber}) used in: ${w.usages.join(', ')}`).join('\n');
          const confirm = window.confirm(
            `WARNING: The following parts in this purchase entry are already used in active transactions:\n\n${partList}\n\nEditing this purchase will recalculate inventory stock levels and totals. Do you want to proceed?`
          );
          if (!confirm) return;
        }
      }
    } catch (err) {
      console.error("Failed to check in-use status:", err);
    }

    // 2. Prefill form state
    setEditPurchaseId(p._id);
    if (p.attachments && p.attachments.length > 0) {
      setAttachments(p.attachments.map(att => {
        const fileKey = att.key || '';
        const downloadUrl = fileKey 
          ? (fileKey.startsWith('http') || fileKey.startsWith('/api/') || fileKey.startsWith('/uploads/') ? fileKey : `/api/purchases/attachment/${fileKey}`)
          : (typeof att === 'string' ? att : (att.url || ''));
        return {
          id: att._id || Math.random().toString(36).substring(7),
          url: downloadUrl,
          name: att.originalName || att.name || 'Attached Document',
          type: att.mimeType || att.type || (downloadUrl.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
          size: att.size || 0,
          status: 'uploaded',
          key: fileKey
        };
      }));
    } else if (p.attachmentUrl) {
      setAttachments([{
        id: Math.random().toString(36).substring(7),
        url: p.attachmentUrl,
        name: p.attachmentName || 'Attached Document',
        type: p.attachmentType || 'image/jpeg',
        size: 0,
        status: 'uploaded',
        key: p.attachmentUrl.split('/').pop()
      }]);
    } else {
      setAttachments([]);
    }
    const hasIgst = p.totals?.igstTotal > 0 || p.items.some(item => (item.igst || 0) > 0);
    setPurchaseHeader({
      vendorId: (() => {
        let vId = '';
        if (p.vendorId) {
          vId = typeof p.vendorId === 'object' ? (p.vendorId._id || '') : p.vendorId;
        }
        if (!vId && p.vendorName && vendorsList.length > 0) {
          const match = vendorsList.find(v => v.name.trim().toLowerCase() === p.vendorName.trim().toLowerCase());
          if (match) vId = match._id;
        }
        return vId;
      })(),
      vendorName: p.vendorName || (p.vendorId && typeof p.vendorId === 'object' ? p.vendorId.name : '') || '',
      invoiceNo: p.invoiceNo || '',
      invoiceDate: p.invoiceDate ? p.invoiceDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
      paymentStatus: p.paymentStatus || 'Credit',
      amountPaid: p.amountPaid !== undefined ? p.amountPaid.toString() : '',
      notes: p.notes || '',
      updatePurchasePrice: true,
      updateMRP: true,
      billingType: hasIgst ? 'Inter-State' : 'Intra-State'
    });

    const prefilledItems = p.items.map(item => {
      let itemIgstPercent = '';
      if (item.igst > 0) {
        itemIgstPercent = item.taxableAmount > 0 
          ? Math.round((item.igst / item.taxableAmount) * 100).toString() 
          : (item.gstPercent || 18).toString();
      }
      return {
        id: `row_${Date.now()}_${Math.random().toString(36).substr(2, 4)}_${item._id || Math.random()}`,
        selectedPartId: item.partId || '',
        partName: item.partName || '',
        partNumber: item.partNumber || '',
        hsnCode: item.hsnCode || '8708',
        qty: item.qty || 1,
        purchasePrice: item.purchasePrice !== undefined ? item.purchasePrice.toString() : '',
        sellingPrice: item.sellingPrice !== undefined ? item.sellingPrice.toString() : '',
        mrp: item.mrp !== undefined ? item.mrp.toString() : '',
        discountType: item.discountType || 'Percent',
        discountValue: item.discountValue !== undefined ? item.discountValue : (item.discountPercent !== undefined ? item.discountPercent : 0),
        discountPercent: item.discountPercent !== undefined ? item.discountPercent : 0,
        discountAmount: item.discountAmount !== undefined ? item.discountAmount : 0,
        taxable: item.taxableAmount !== undefined ? item.taxableAmount.toString() : '',
        gstPercent: item.gstPercent !== undefined ? item.gstPercent : 18,
        igstPercent: itemIgstPercent,
        warehouse: item.warehouse || 'Main Store',
        rackLocation: item.rackLocation || '',
        // New fields for Parts Master integration
        brand: item.brand || '',
        supplierBrand: item.supplierBrand || '',
        vehicleMake: item.vehicleMake || '',
        vehicleModel: item.vehicleModel || '',
        compatibility: item.compatibility || '',
        oemBrand: item.oemBrand || '',
        warranty: item.warranty || '',
        isManualBrand: Boolean(item.supplierBrand)
      };
    });

    setPurchaseItems(prefilledItems);
    setActiveTab('entry');
  };

  const handleCancelEdit = () => {
    setEditPurchaseId(null);
    setPurchaseHeader({
      vendorId: '',
      invoiceNo: '',
      invoiceDate: new Date().toISOString().slice(0, 10),
      paymentStatus: 'Credit',
      amountPaid: '',
      notes: '',
      updatePurchasePrice: true,
      updateMRP: true,
      billingType: 'Intra-State'
    });
    setPurchaseItems([createEmptyRow()]);
    setPurchaseFormError('');
    setPurchaseSuccess('');
    setAttachment(null);
    setActiveTab('history');
  };

  const handleClearForm = () => {
    setPurchaseHeader({
      vendorId: '',
      invoiceNo: '',
      invoiceDate: new Date().toISOString().slice(0, 10),
      paymentStatus: 'Credit',
      amountPaid: '',
      notes: '',
      updatePurchasePrice: true,
      updateMRP: true,
      billingType: 'Intra-State'
    });
    setPurchaseItems([createEmptyRow()]);
    setInvoiceNoDuplicate(false);
    setPurchaseFormError('');
    setPurchaseSuccess('');
    setAttachment(null);
  };

  const handleCancel = () => {
    if (window.confirm("Discard this purchase entry?")) {
      handleClearForm();
      setEditPurchaseId(null);
      setAttachment(null);
      setActiveTab('history');
    }
  };

  // Handle Form Submit
  const handlePurchaseSubmit = async (e) => {
    e.preventDefault();
    setPurchaseFormError('');
    setPurchaseSuccess('');

    if (!purchaseHeader.vendorId) {
      setPurchaseFormError('Please select a Supplier / Vendor.');
      return;
    }

    if (purchaseItems.length === 0) {
      setPurchaseFormError('At least one purchase item is required.');
      return;
    }

    for (let i = 0; i < purchaseItems.length; i++) {
      const item = purchaseItems[i];
      if (!item.partName || !item.partNumber) {
        setPurchaseFormError(`Row #${i + 1}: Part Name and Part Number are required.`);
        return;
      }
      if (!item.qty || Number(item.qty) <= 0) {
        setPurchaseFormError(`Row #${i + 1}: Quantity must be at least 1.`);
        return;
      }
      if (item.mrp === undefined || item.mrp === '' || Number(item.mrp) < 0) {
        setPurchaseFormError(`Row #${i + 1}: MRP must be 0 or greater.`);
        return;
      }
    }

    const rateExceedsMrpItems = purchaseItems.filter(item => Number(item.purchasePrice) > Number(item.mrp));
    if (rateExceedsMrpItems.length > 0) {
      const confirmSave = window.confirm(
        `Warning: Purchase Rate exceeds MRP for the following items:\n` +
        rateExceedsMrpItems.map(item => `- ${item.partName} (Purchase Rate: ₹${item.purchasePrice}, MRP: ₹${item.mrp})`).join('\n') +
        `\n\nDo you want to proceed and save this purchase entry?`
      );
      if (!confirmSave) return;
    }

    const grandTotal = summaryTotals.grandTotal;
    const amountPaidNum = Number(purchaseHeader.amountPaid) || 0;
    
    let finalStatus = purchaseHeader.paymentStatus;
    if (finalStatus === 'Unpaid') finalStatus = 'Credit';

    const payloadItems = purchaseItems.map(row => {
      const rowCalc = calculateRowTotals(row);
      return {
        partId: row.selectedPartId || undefined,
        partName: row.partName,
        partNumber: row.partNumber,
        hsnCode: row.hsnCode || '8708',
        qty: Number(row.qty) || 1,
        purchasePrice: Number(row.purchasePrice) || 0,
        sellingPrice: Number(row.sellingPrice) || Number(row.purchasePrice) || 0,
        mrp: Number(row.mrp) || 0,
        discountType: row.discountType || 'Percent',
        discountValue: Number(row.discountValue) || 0,
        discountPercent: Number(row.discountPercent) || 0,
        discountAmount: Number(row.discountAmount) || 0,
        gstPercent: Number(row.gstPercent) !== undefined ? Number(row.gstPercent) : 18,
        igstPercent: row.igstPercent !== undefined && row.igstPercent !== '' ? Number(row.igstPercent) : undefined,
        warehouse: row.warehouse || 'Main Store',
        rackLocation: row.rackLocation || '',
        taxableAmount: rowCalc.taxable,
        gstAmount: rowCalc.gstAmt,
        cgst: rowCalc.cgst,
        sgst: rowCalc.sgst,
        igst: rowCalc.igst,
        total: rowCalc.total,
        // New fields for Parts Master integration
        brand: row.brand || '',
        supplierBrand: row.supplierBrand || '',
        vehicleMake: row.vehicleMake || '',
        vehicleModel: row.vehicleModel || '',
        compatibility: row.compatibility || '',
        oemBrand: row.oemBrand || '',
        warranty: row.warranty || ''
      };
    });

    const isEdit = editPurchaseId !== null;
    let reason = '';
    if (isEdit) {
      reason = window.prompt("Please enter the reason for this edit (optional):") || 'No reason provided';
    }

    setInvoiceNoDuplicate(false);

    // Frontend validation: Check duplicate using Vendor + Invoice No (ignoring case and extra spaces)
    if (purchaseHeader.invoiceNo && String(purchaseHeader.invoiceNo).trim()) {
      try {
        const cleanInv = String(purchaseHeader.invoiceNo).trim().replace(/\s+/g, ' ');
        const url = `${API_BASE_URL}/purchases/check-duplicate?vendorId=${purchaseHeader.vendorId}&invoiceNo=${encodeURIComponent(cleanInv)}` + (isEdit ? `&excludeId=${editPurchaseId}` : '');
        
        setPurchaseSubmitting(true);
        const checkRes = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        setPurchaseSubmitting(false);

        if (checkRes.status === 409) {
          setInvoiceNoDuplicate(true);
          setPurchaseFormError('Invoice No. already exists for this vendor.');
          return;
        }
      } catch (err) {
        console.warn('Duplicate check failed, relying on backend save validation:', err);
        setPurchaseSubmitting(false);
      }
    }

    const payload = {
      vendorId: purchaseHeader.vendorId,
      invoiceNo: purchaseHeader.invoiceNo || `PUR-${Date.now().toString().slice(-6)}`,
      invoiceDate: purchaseHeader.invoiceDate || new Date().toISOString(),
      paymentStatus: finalStatus,
      amountPaid: finalStatus === 'Paid' ? grandTotal : amountPaidNum,
      notes: purchaseHeader.notes,
      items: payloadItems,
      updatePurchasePrice: purchaseHeader.updatePurchasePrice,
      updateMRP: purchaseHeader.updateMRP,
      billingType: purchaseHeader.billingType || 'Intra-State',
      reason,
      attachments: attachments.filter(att => att.status === 'uploaded').map(att => {
        let keyVal = att.key;
        if (!keyVal && att.url) {
          if (att.url.includes('/api/purchases/attachment/')) {
            keyVal = att.url.split('/api/purchases/attachment/')[1].split('?')[0];
          } else {
            keyVal = att.url.split('/').pop();
          }
        }
        return {
          key: keyVal || att.url,
          originalName: att.name || 'Attached Document',
          mimeType: att.type || 'image/jpeg',
          size: att.size || 0
        };
      }),
      attachmentUrl: attachments.length > 0 && attachments[0].status === 'uploaded' ? attachments[0].url : '',
      attachmentName: attachments.length > 0 && attachments[0].status === 'uploaded' ? attachments[0].name : '',
      attachmentType: attachments.length > 0 && attachments[0].status === 'uploaded' ? attachments[0].type : ''
    };

    setPurchaseSubmitting(true);
    try {
      const url = isEdit ? `${API_BASE_URL}/purchases/${editPurchaseId}` : `${API_BASE_URL}/purchases`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setPurchaseSuccess(isEdit ? 'Purchase Entry updated successfully! Inventory stock levels updated.' : 'Purchase Entry saved successfully! Inventory stock automatically updated.');
        setInvoiceNoDuplicate(false);
        setTimeout(() => {
          setPurchaseSuccess('');
          setEditPurchaseId(null);
          // Reset Header & Items
          setPurchaseHeader({
            vendorId: '',
            invoiceNo: '',
            invoiceDate: new Date().toISOString().slice(0, 10),
            paymentStatus: 'Credit',
            amountPaid: '',
            notes: '',
            updatePurchasePrice: true,
            updateMRP: true,
            billingType: 'Intra-State'
          });
          setPurchaseItems([createEmptyRow()]);
          setAttachments([]);
          fetchPurchases();
          fetchPurchaseReports();
          fetchInventoryList();
          setActiveTab('history');
        }, 1500);
      } else {
        const err = await res.json();
        if (res.status === 409 || (err.error && err.error.includes('already exists'))) {
          setInvoiceNoDuplicate(true);
        }
        setPurchaseFormError(err.error || 'Failed to save purchase entry.');
      }
    } catch (err) {
      console.error(err);
      setPurchaseFormError('Network error while saving purchase entry.');
    } finally {
      setPurchaseSubmitting(false);
    }
  };

  // Toggle Row Expansion in History
  const toggleRowExpand = (id) => {
    setExpandedPurchaseIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Handle Update Payment Status Submit
  const handleUpdatePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!paymentModalPurchase) return;

    setPaymentSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/purchases/${paymentModalPurchase._id}/payment`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amountPaid: Number(paymentModalAmount) || 0,
          paymentStatus: paymentModalStatus === 'Unpaid' ? 'Credit' : paymentModalStatus
        })
      });

      if (res.ok) {
        setPaymentModalPurchase(null);
        fetchPurchases();
        fetchPurchaseReports();
        fetchVendors();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update payment status');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating payment status');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // Filtering for History & Reports
  const safeReports = Array.isArray(reportsData) ? reportsData : [];

  const filteredReports = safeReports
    .filter(item => {
      if (paymentStatusFilter) {
        const itemStatus = (item.paymentStatus || 'Credit').toLowerCase();
        const filterStatus = paymentStatusFilter.toLowerCase();
        if (filterStatus === 'credit' && itemStatus === 'unpaid') {
          // Match
        } else if (itemStatus !== filterStatus) {
          return false;
        }
      }
      if (!searchQuery) return true;
      const s = searchQuery.toLowerCase();
      return (
        (item.partName && item.partName.toLowerCase().includes(s)) ||
        (item.partNumber && item.partNumber.toLowerCase().includes(s)) ||
        (item.vendorName && item.vendorName.toLowerCase().includes(s)) ||
        (item.invoiceNo && item.invoiceNo.toLowerCase().includes(s)) ||
        (item.hsnCode && item.hsnCode.toLowerCase().includes(s)) ||
        (item.warehouse && item.warehouse.toLowerCase().includes(s))
      );
    })
    .sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (sortField === 'purchaseDate') {
        aVal = new Date(aVal || 0).getTime();
        bVal = new Date(bVal || 0).getTime();
      } else if (typeof aVal === 'string') {
        aVal = (aVal || '').toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  // Calculate Report KPI Totals
  const reportTotalAmount = filteredReports.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  const reportTotalQty = filteredReports.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const reportTxCount = new Set(filteredReports.map(item => item.purchaseId || item.purchaseNo || item.invoiceNo || item._id)).size;
  const reportCreditTotal = filteredReports
    .filter(item => (item.paymentStatus || 'Credit') !== 'Paid')
    .reduce((sum, item) => sum + (Number(item.total) || 0), 0);

  // CSV Export
  const handleExportExcel = () => {
    const headers = [
      'Purchase Date',
      'Invoice/Bill No',
      'Vendor Name',
      'Part Name',
      'Part Number',
      'HSN Code',
      'Qty Purchased',
      'Purchase Price (INR)',
      'MRP (INR)',
      'Discount (INR)',
      'GST Amount (INR)',
      'Total Amount (INR)',
      'Payment Status',
      'Warehouse'
    ];

    const rows = filteredReports.map(item => [
      `"${new Date(item.purchaseDate || Date.now()).toLocaleDateString('en-IN')}"`,
      `"${item.invoiceNo || ''}"`,
      `"${(item.vendorName || '').replace(/"/g, '""')}"`,
      `"${(item.partName || '').replace(/"/g, '""')}"`,
      `"${item.partNumber || ''}"`,
      `"${item.hsnCode || '8708'}"`,
      item.qty || 0,
      (item.purchasePrice || 0).toFixed(2),
      (item.mrp || 0).toFixed(2),
      (item.discountAmount || 0).toFixed(2),
      (item.gstAmount || 0).toFixed(2),
      (item.total || 0).toFixed(2),
      `"${item.paymentStatus === 'Unpaid' ? 'Credit' : (item.paymentStatus || 'Credit')}"`,
      `"${(item.warehouse || 'Main Store').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `Purchases_Report_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print reports.');
      return;
    }

    const title = 'Purchases Reports Data';
    
    let tableHeadersHtml = `
      <th>Purchase Date</th>
      <th>Invoice/Bill No</th>
      <th>Vendor Name</th>
      <th>Part Name</th>
      <th>Part Number</th>
      <th>HSN Code</th>
      <th>Qty</th>
      <th>Price</th>
      <th>MRP</th>
      <th>Discount</th>
      <th>GST</th>
      <th>Total</th>
      <th>Payment Status</th>
      <th>Warehouse</th>
    `;
    
    let tableRowsHtml = '';
    filteredReports.forEach(item => {
      tableRowsHtml += `
        <tr>
          <td>${new Date(item.purchaseDate || Date.now()).toLocaleDateString('en-IN')}</td>
          <td style="font-family: monospace; font-weight: bold;">${item.invoiceNo || 'N/A'}</td>
          <td>${item.vendorName || ''}</td>
          <td>${item.partName || ''}</td>
          <td style="font-family: monospace;">${item.partNumber || ''}</td>
          <td>${item.hsnCode || '8708'}</td>
          <td>${item.qty || 0}</td>
          <td>₹${(item.purchasePrice || 0).toFixed(2)}</td>
          <td>₹${(item.mrp || 0).toFixed(2)}</td>
          <td>₹${(item.discountAmount || 0).toFixed(2)}</td>
          <td>₹${(item.gstAmount || 0).toFixed(2)}</td>
          <td style="font-weight: bold; color: #1e3a8a;">₹${(item.total || 0).toFixed(2)}</td>
          <td>${item.paymentStatus === 'Unpaid' ? 'Credit' : (item.paymentStatus || 'Credit')}</td>
          <td>${item.warehouse || 'Main Store'}</td>
        </tr>
      `;
    });

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; font-size: 10px; padding: 20px; color: #333; }
            h2 { text-align: center; color: #1e3a8a; margin-bottom: 2px; }
            h4 { text-align: center; color: #555; margin-top: 2px; text-transform: uppercase; font-size: 9px; letter-spacing: 1px; }
            .meta { margin-bottom: 25px; font-size: 9px; color: #666; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background: #1e3a8a; color: white; padding: 6px; font-size: 9px; border: 1px solid #111111; text-transform: uppercase; }
            td { padding: 6px; border: 1px solid #111111; text-align: center; }
            tr:nth-child(even) { background: #f9fafb; }
            @media print {
              button { display: none; }
              tr { page-break-inside: avoid; }
              thead { display: table-header-group; }
            }
          </style>
        </head>
        <body>
          <h2>MVSS Automobiles Private Limited</h2>
          <h4>${title}</h4>
          <div class="meta">
            <strong>Generated On:</strong> ${new Date().toLocaleString('en-IN')} | 
            <strong>Total Records:</strong> ${filteredReports.length}
            ${fromDate ? ` | <strong>From:</strong> ${fromDate}` : ''}
            ${toDate ? ` | <strong>To:</strong> ${toDate}` : ''}
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
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 animate-fade-in p-1 print:p-0">
      {/* Hidden file input for direct invoice attachment & re-upload */}
      <input
        type="file"
        ref={directFileInputRef}
        onChange={handleDirectInvoiceUpload}
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        style={{ display: 'none' }}
      />

      {/* Module Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <ShoppingBag className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            Purchases Module
          </h1>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Record multi-part vendor bills, auto-restock inventory, manage credit payments, and generate purchase reports.
          </p>
        </div>

        {/* Tab Selector Buttons */}
        <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <button
            onClick={() => setActiveTab('entry')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'entry'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400'
            }`}
          >
            <Plus className="w-4 h-4" />
            {editPurchaseId ? '✏️ Edit Purchase' : 'Purchase Entry'}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400'
            }`}
          >
            <FileText className="w-4 h-4" />
            Purchase History ({purchaseHistory.length})
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'reports'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Purchase Reports
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PURCHASE ENTRY FORM (Multi-Part Procurement Billing)               */}
      {/* ========================================================================= */}
      {activeTab === 'entry' && (
        <form onSubmit={handlePurchaseSubmit} className="space-y-6">
          {/* Live Auto Calculation Header Banner */}
          <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-lg shrink-0 print:hidden grid grid-cols-2 md:grid-cols-6 gap-4 text-center md:text-left animate-fade-in">
            <div className="border-b md:border-b-0 md:border-r border-slate-800 pb-3 md:pb-0 pr-2">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">Total Cost Price</span>
              <span className="text-sm font-black font-mono text-slate-200">₹{summaryTotals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="border-b md:border-b-0 md:border-r border-slate-800 pb-3 md:pb-0 pr-2">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">Total Quantity</span>
              <span className="text-sm font-black font-mono text-blue-400">{summaryTotals.totalQty} Pcs</span>
            </div>
            <div className="border-b md:border-b-0 md:border-r border-slate-800 pb-3 md:pb-0 pr-2">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">Total Discount</span>
              <span className="text-sm font-black font-mono text-amber-400">₹{summaryTotals.totalDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="border-b md:border-b-0 md:border-r border-slate-800 pb-3 md:pb-0 pr-2">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">Total Purchase Value</span>
              <span className="text-sm font-black font-mono text-indigo-300 font-bold">₹{summaryTotals.taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="border-b md:border-b-0 md:border-r border-slate-800 pb-3 md:pb-0 pr-2">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">GST Amount</span>
              <span className="text-sm font-black font-mono text-purple-400">₹{summaryTotals.gstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div>
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">Grand Total</span>
              <span className="text-base font-black font-mono text-emerald-300">₹{summaryTotals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Header Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-500" />
                Vendor & Invoice Header Details
              </h2>
              <span className="text-xs font-bold text-slate-400">Step 1 of 2</span>
            </div>

            {purchaseSuccess && (
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2.5">
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                {purchaseSuccess}
              </div>
            )}

            {purchaseFormError && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                {purchaseFormError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Supplier / Vendor Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Supplier / Vendor <span className="text-rose-500">*</span>
                </label>
                <SearchableDropdown
                  items={vendorsList}
                  value={purchaseHeader.vendorId}
                  onSelect={(vId) => {
                    setInvoiceNoDuplicate(false);
                    const selectedV = vendorsList.find(v => v._id === vId);
                    const isInter = selectedV && selectedV.gstNumber 
                      ? !selectedV.gstNumber.trim().startsWith('36') 
                      : false;
                    const newBrand = getVendorSupplierBrand(selectedV);
                    const oldVendor = vendorsList.find(v => v._id === purchaseHeader.vendorId);
                    const oldBrand = getVendorSupplierBrand(oldVendor);

                    setPurchaseHeader({
                      ...purchaseHeader,
                      vendorId: vId,
                      vendorName: selectedV ? selectedV.name : '',
                      billingType: isInter ? 'Inter-State' : 'Intra-State',
                      supplierBrand: newBrand
                    });

                    // Automatically populate Supplier Brand in all existing spare-part rows
                    setPurchaseItems(prev => prev.map(row => {
                      if (!row.isManualBrand || !row.supplierBrand || (oldBrand && row.supplierBrand === oldBrand)) {
                        return {
                          ...row,
                          supplierBrand: newBrand,
                          brand: (!row.brand || (oldBrand && row.brand === oldBrand)) ? newBrand : row.brand,
                          isManualBrand: false
                        };
                      }
                      return row;
                    }));
                  }}
                  placeholder="Search supplier name, code, contact..."
                  emptyOptionLabel="-- Select Vendor --"
                  type="vendors"
                  className="w-full"
                />
                {purchaseHeader.vendorId && (() => {
                  const vendor = vendorsList.find(v => v._id === purchaseHeader.vendorId);
                  if (!vendor) return null;
                  const vendorBrand = getVendorSupplierBrand(vendor);
                  const brandsList = getVendorBrandsList(vendor);
                  return (
                    <div className="mt-2.5 p-3 bg-indigo-50/50 dark:bg-indigo-955/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl text-[11px] space-y-1 text-slate-655 dark:text-slate-350">
                      <p className="font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest text-[9px] mb-1">Selected Vendor Details</p>
                      <p><strong>Name:</strong> {vendor.name}</p>
                      {vendor.vendorCode && <p><strong>Code:</strong> {vendor.vendorCode}</p>}
                      {vendorBrand && (
                        <p><strong>Supplier Brand:</strong> <span className="font-bold text-indigo-600 dark:text-indigo-400">{vendorBrand}</span></p>
                      )}
                      {brandsList.length > 1 && (
                        <p><strong>Configured Brands:</strong> <span className="font-semibold text-slate-700 dark:text-slate-300">{brandsList.join(', ')}</span></p>
                      )}
                      {vendor.mobile && <p><strong>Phone:</strong> {vendor.mobile}</p>}
                      {vendor.email && <p><strong>Email:</strong> {vendor.email}</p>}
                      {vendor.gstNumber && <p><strong>GSTIN:</strong> {vendor.gstNumber}</p>}
                      {vendor.address && <p><strong>Address:</strong> {vendor.address}</p>}
                    </div>
                  );
                })()}
              </div>

              {/* Invoice Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Purchase Invoice / Bill No.
                </label>
                <input
                  ref={invoiceNoRef}
                  type="text"
                  placeholder="e.g. INV-99824"
                  value={purchaseHeader.invoiceNo}
                  onChange={(e) => {
                    setInvoiceNoDuplicate(false);
                    setPurchaseHeader({ ...purchaseHeader, invoiceNo: e.target.value });
                  }}
                  className={`w-full text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl p-2.5 font-semibold text-slate-800 dark:text-white focus:ring-2 focus:outline-none transition-colors ${
                    invoiceNoDuplicate 
                      ? 'border-rose-500 focus:ring-rose-500 focus:border-rose-500 dark:border-rose-500/80 dark:focus:ring-rose-500/50' 
                      : 'border-slate-300 dark:border-slate-700 focus:ring-indigo-500'
                  }`}
                />
              </div>

              {/* Invoice Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Purchase Date
                </label>
                <input
                  type="date"
                  value={purchaseHeader.invoiceDate}
                  onChange={(e) => setPurchaseHeader({ ...purchaseHeader, invoiceDate: e.target.value })}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-semibold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Payment Status (Paid / Credit / Partially Paid) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Payment Status
                </label>
                <select
                  value={purchaseHeader.paymentStatus}
                  onChange={(e) => setPurchaseHeader({ ...purchaseHeader, paymentStatus: e.target.value })}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Credit">Credit</option>
                  <option value="Paid">Paid</option>
                  <option value="Partially Paid">Partially Paid</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-1">
              {/* Billing Type Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-355 mb-1.5">
                  Billing Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={purchaseHeader.billingType || 'Intra-State'}
                  onChange={(e) => setPurchaseHeader({ ...purchaseHeader, billingType: e.target.value })}
                  required
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Intra-State">Intra-State (CGST + SGST)</option>
                  <option value="Inter-State">Inter-State (IGST)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-355 mb-1.5">
                  Amount Paid (₹)
                </label>
                <input
                  type="number"
                  placeholder={purchaseHeader.paymentStatus === 'Paid' ? 'Full Amount' : '0'}
                  disabled={purchaseHeader.paymentStatus === 'Paid'}
                  value={purchaseHeader.paymentStatus === 'Paid' ? summaryTotals.grandTotal.toFixed(2) : purchaseHeader.amountPaid}
                  onChange={(e) => setPurchaseHeader({ ...purchaseHeader, amountPaid: e.target.value })}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-semibold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-355 mb-1.5">
                  Purchase Notes / Remarks
                </label>
                <input
                  type="text"
                  placeholder="Optional notes or supplier references"
                  value={purchaseHeader.notes}
                  onChange={(e) => setPurchaseHeader({ ...purchaseHeader, notes: e.target.value })}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-semibold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>


            </div>

            <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Inventory Master Updates:
              </span>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-350 cursor-pointer">
                <input
                  type="checkbox"
                  checked={purchaseHeader.updatePurchasePrice}
                  onChange={(e) => setPurchaseHeader({ ...purchaseHeader, updatePurchasePrice: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                Update Purchase Rate (Cost) in Parts Master
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-350 cursor-pointer">
                <input
                  type="checkbox"
                  checked={purchaseHeader.updateMRP}
                  onChange={(e) => setPurchaseHeader({ ...purchaseHeader, updateMRP: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                Update MRP in Parts Master
              </label>
            </div>
          </div>

          {/* Multiple Line Items Table Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-indigo-500" />
                  Spare Parts Line Items ({purchaseItems.length})
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Add multiple parts under this purchase invoice. Select existing SKU to auto-fill details or type new part.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddRow}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors shadow-2xs"
              >
                <Plus className="w-4 h-4" />
                + Add Another Part
              </button>
            </div>

            {/* Line Items Table */}
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse" style={{ minWidth: '3300px', tableLayout: 'fixed' }}>
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/80 text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2.5 px-3" style={{ width: '50px', minWidth: '50px', verticalAlign: 'middle', textAlign: 'left' }}>#</th>
                    <th className="py-2.5 px-3" style={{ width: '220px', minWidth: '220px', verticalAlign: 'middle', textAlign: 'left' }}>SKU / Search Inventory</th>
                    <th className="py-2.5 px-3" style={{ width: '220px', minWidth: '220px', verticalAlign: 'middle', textAlign: 'left' }}>Part Name *</th>
                    <th className="py-2.5 px-3" style={{ width: '140px', minWidth: '140px', verticalAlign: 'middle', textAlign: 'left' }}>Part Number *</th>
                    <th className="py-2.5 px-3" style={{ width: '100px', minWidth: '100px', verticalAlign: 'middle', textAlign: 'left' }}>HSN</th>
                    <th className="py-2.5 px-3" style={{ width: '90px', minWidth: '90px', verticalAlign: 'middle', textAlign: 'left' }}>Qty *</th>
                    <th className="py-2.5 px-3" style={{ width: '120px', minWidth: '120px', verticalAlign: 'middle', textAlign: 'left' }}>Rate (₹) *</th>
                    <th className="py-2.5 px-3" style={{ width: '120px', minWidth: '120px', verticalAlign: 'middle', textAlign: 'left' }}>MRP (₹) *</th>
                    <th className="py-2.5 px-3" style={{ width: '110px', minWidth: '110px', verticalAlign: 'middle', textAlign: 'left' }}>Discount Type</th>
                    <th className="py-2.5 px-3" style={{ width: '110px', minWidth: '110px', verticalAlign: 'middle', textAlign: 'left' }}>Discount %</th>
                    <th className="py-2.5 px-3" style={{ width: '110px', minWidth: '110px', verticalAlign: 'middle', textAlign: 'left' }}>Discount (₹)</th>
                    <th className="py-2.5 px-3" style={{ width: '100px', minWidth: '100px', verticalAlign: 'middle', textAlign: 'left' }}>GST %</th>
                    <th className="py-2.5 px-3" style={{ width: '140px', minWidth: '140px', verticalAlign: 'middle', textAlign: 'left' }}>Taxable (₹)</th>
                    <th className="py-2.5 px-3" style={{ width: '110px', minWidth: '110px', verticalAlign: 'middle', textAlign: 'left' }}>CGST (₹)</th>
                    <th className="py-2.5 px-3" style={{ width: '110px', minWidth: '110px', verticalAlign: 'middle', textAlign: 'left' }}>SGST (₹)</th>
                    <th className="py-2.5 px-3" style={{ width: '110px', minWidth: '110px', verticalAlign: 'middle', textAlign: 'left' }}>IGST % / (₹)</th>
                    <th className="py-2.5 px-3" style={{ width: '160px', minWidth: '160px', verticalAlign: 'middle', textAlign: 'left' }}>Total (₹)</th>
                    <th className="py-2.5 px-3" style={{ width: '180px', minWidth: '180px', verticalAlign: 'middle', textAlign: 'left' }}>Warehouse</th>
                    <th className="py-2.5 px-3" style={{ width: '140px', minWidth: '140px', verticalAlign: 'middle', textAlign: 'left' }}>Rack Location</th>
                    <th className="py-2.5 px-3" style={{ width: '120px', minWidth: '120px', verticalAlign: 'middle', textAlign: 'left' }}>Brand</th>
                    <th className="py-2.5 px-3" style={{ width: '120px', minWidth: '120px', verticalAlign: 'middle', textAlign: 'left' }}>Supplier Brand</th>
                    <th className="py-2.5 px-3" style={{ width: '120px', minWidth: '120px', verticalAlign: 'middle', textAlign: 'left' }}>Vehicle Make</th>
                    <th className="py-2.5 px-3" style={{ width: '120px', minWidth: '120px', verticalAlign: 'middle', textAlign: 'left' }}>Vehicle Model</th>
                    <th className="py-2.5 px-3" style={{ width: '150px', minWidth: '150px', verticalAlign: 'middle', textAlign: 'left' }}>Compatibility</th>
                    <th className="py-2.5 px-3" style={{ width: '120px', minWidth: '120px', verticalAlign: 'middle', textAlign: 'left' }}>OEM Brand</th>
                    <th className="py-2.5 px-3" style={{ width: '120px', minWidth: '120px', verticalAlign: 'middle', textAlign: 'left' }}>Warranty</th>
                    <th className="py-2.5 px-3" style={{ width: '80px', minWidth: '80px', verticalAlign: 'middle', textAlign: 'left' }}>Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {purchaseItems.map((row, idx) => {
                    const rowCalc = calculateRowTotals(row);
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        {/* Index */}
                        <td className="py-2.5 px-3 font-bold text-slate-400" style={{ width: '50px', minWidth: '50px', verticalAlign: 'middle', textAlign: 'left' }}>
                          {idx + 1}
                        </td>

                        {/* Existing SKU Select */}
                        <td className="py-2.5 px-3" style={{ width: '220px', minWidth: '220px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <SearchableDropdown
                            items={inventoryList.length > 0 ? inventoryList : partsInventory}
                            value={row.selectedPartId}
                            onSelect={(partId) => handleSelectSKU(row.id, partId)}
                            placeholder="Search part name, number, OEM, HSN..."
                            emptyOptionLabel="-- New / Select Part --"
                            token={token}
                            type="parts"
                            className="w-full"
                          />
                        </td>

                        {/* Part Name */}
                        <td className="py-2.5 px-3" style={{ width: '220px', minWidth: '220px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="text"
                            placeholder="e.g. Front Brake Pads"
                            value={row.partName}
                            onChange={(e) => handleRowChange(row.id, 'partName', e.target.value)}
                            required
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>

                        {/* Part Number */}
                        <td className="py-2.5 px-3" style={{ width: '140px', minWidth: '140px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="text"
                            placeholder="e.g. BP-8821"
                            value={row.partNumber}
                            onChange={(e) => handleRowChange(row.id, 'partNumber', e.target.value)}
                            required
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>

                        {/* HSN Code */}
                        <td className="py-2.5 px-3" style={{ width: '100px', minWidth: '100px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="text"
                            placeholder="8708"
                            value={row.hsnCode}
                            onChange={(e) => handleRowChange(row.id, 'hsnCode', e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>

                        {/* Qty */}
                        <td className="py-2.5 px-3" style={{ width: '90px', minWidth: '90px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="number"
                            min="1"
                            value={row.qty}
                            onChange={(e) => handleRowChange(row.id, 'qty', e.target.value)}
                            required
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-bold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>

                        {/* Purchase Rate */}
                        <td className="py-2.5 px-3" style={{ width: '120px', minWidth: '120px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={row.purchasePrice}
                            onChange={(e) => handleRowChange(row.id, 'purchasePrice', e.target.value)}
                            onBlur={(e) => handleRateBlur(row.id, e.target.value)}
                            required
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-bold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>

                        {/* MRP (GST Inclusive) */}
                        <td className="py-2.5 px-3" style={{ width: '120px', minWidth: '120px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={row.mrp}
                            onChange={(e) => handleRowChange(row.id, 'mrp', e.target.value)}
                            required
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-bold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>

                        {/* Discount Type */}
                        <td className="py-2.5 px-3" style={{ width: '110px', minWidth: '110px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <select
                            value={row.discountType || 'Percent'}
                            onChange={(e) => handleRowChange(row.id, 'discountType', e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-2 py-2.5 font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          >
                            <option value="Percent">Percentage</option>
                            <option value="Flat">Flat Amount</option>
                          </select>
                        </td>

                        {/* Discount % */}
                        <td className="py-2.5 px-3" style={{ width: '110px', minWidth: '110px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            placeholder="0"
                            value={row.discountPercent !== undefined && row.discountPercent !== null ? row.discountPercent : ''}
                            onChange={(e) => handleDiscountPercentChange(row.id, e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>

                        {/* Discount Amount (₹) */}
                        <td className="py-2.5 px-3" style={{ width: '110px', minWidth: '110px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={row.discountAmount !== undefined && row.discountAmount !== null ? row.discountAmount : ''}
                            onChange={(e) => handleDiscountAmountChange(row.id, e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>

                        {/* GST % */}
                        <td className="py-2.5 px-3" style={{ width: '100px', minWidth: '100px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <div className="flex gap-1 items-center">
                            <select
                              value={[0, 3, 5, 12, 18, 28].includes(Number(row.gstPercent)) ? Number(row.gstPercent) : 'custom'}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'custom') {
                                  handleRowChange(row.id, 'gstPercent', 'custom');
                                } else {
                                  handleRowChange(row.id, 'gstPercent', Number(val));
                                }
                              }}
                              disabled={!['Admin', 'Accounts', 'Spares', 'Store', 'Store User', 'Store Manager', 'Accounts Executive'].includes(user?.role)}
                              className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-2 py-2.5 font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none flex-1"
                            >
                              <option value={0}>0%</option>
                              <option value={3}>3%</option>
                              <option value={5}>5%</option>
                              <option value={12}>12%</option>
                              <option value={18}>18%</option>
                              <option value={28}>28%</option>
                              <option value="custom">Custom...</option>
                            </select>
                            {![0, 3, 5, 12, 18, 28].includes(Number(row.gstPercent)) && (
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                placeholder="0.00"
                                value={row.gstPercent === 'custom' ? '' : row.gstPercent}
                                onChange={(e) => handleRowChange(row.id, 'gstPercent', e.target.value)}
                                disabled={!['Admin', 'Accounts', 'Spares', 'Store', 'Store User', 'Store Manager', 'Accounts Executive'].includes(user?.role)}
                                className="w-16 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-2 py-2.5 font-mono font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              />
                            )}
                          </div>
                        </td>

                        {/* Taxable Amount (Calculated / Editable) */}
                        <td className="py-2.5 px-3" style={{ width: '140px', minWidth: '140px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={row.taxable !== undefined && row.taxable !== null ? row.taxable : rowCalc.taxable.toFixed(2)}
                            onChange={(e) => handleTaxableChange(row.id, e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>

                        {/* CGST Amount (Calculated) */}
                        <td className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-400" style={{ width: '110px', minWidth: '110px', verticalAlign: 'middle', textAlign: 'left' }}>
                          {purchaseHeader.billingType === 'Inter-State' ? '₹0.00' : `₹${rowCalc.cgst.toFixed(2)}`}
                        </td>

                        {/* SGST Amount (Calculated) */}
                        <td className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-400" style={{ width: '110px', minWidth: '110px', verticalAlign: 'middle', textAlign: 'left' }}>
                          {purchaseHeader.billingType === 'Inter-State' ? '₹0.00' : `₹${rowCalc.sgst.toFixed(2)}`}
                        </td>

                        {/* IGST Amount (Calculated / Editable) */}
                        <td className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-400" style={{ width: '110px', minWidth: '110px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <div className="flex flex-col gap-1">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              placeholder="0.00"
                              disabled={purchaseHeader.billingType === 'Intra-State'}
                              value={purchaseHeader.billingType === 'Intra-State' ? '0' : (row.igstPercent !== undefined ? row.igstPercent : row.gstPercent)}
                              onChange={(e) => handleIgstPercentChange(row.id, e.target.value)}
                              className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-9 px-2 py-1 font-mono font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100 dark:disabled:bg-slate-900/60 disabled:text-slate-400 cursor-not-allowed"
                            />
                            <div className="text-[10px] text-slate-500 dark:text-slate-450 text-center font-bold">
                              ₹{purchaseHeader.billingType === 'Intra-State' ? '0.00' : rowCalc.igst.toFixed(2)}
                            </div>
                          </div>
                        </td>

                        {/* Total Amount (Calculated) */}
                        <td className="py-2.5 px-3 font-black text-indigo-600 dark:text-indigo-400" style={{ width: '160px', minWidth: '160px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <div>₹{rowCalc.total.toFixed(2)}</div>
                          {row.qty > 1 && (
                            <div className="text-[9px] text-slate-400 font-semibold mt-0.5" title="Net Cost Per Unit (Final Amount / Quantity)">
                              Net: ₹{(rowCalc.total / row.qty).toFixed(2)}/u
                            </div>
                          )}
                        </td>

                        {/* Warehouse Location */}
                        <td className="py-2.5 px-3" style={{ width: '180px', minWidth: '180px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <select
                            value={row.warehouse || 'Main Store'}
                            onChange={(e) => handleRowChange(row.id, 'warehouse', e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          >
                            <option value="Main Store">Main Store</option>
                            <option value="Spares Warehouse">Spares Warehouse</option>
                            <option value="Body Shop Store">Body Shop Store</option>
                            <option value="Accessories Store">Accessories Store</option>
                          </select>
                        </td>

                        {/* Rack Location */}
                        <td className="py-2.5 px-3" style={{ width: '140px', minWidth: '140px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="text"
                            placeholder="A-1, B-3..."
                            value={row.rackLocation || ''}
                            onChange={(e) => handleRowChange(row.id, 'rackLocation', e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>

                        {/* Brand */}
                        <td className="py-2.5 px-3" style={{ width: '120px', minWidth: '120px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="text"
                            placeholder="Brand"
                            value={row.brand || ''}
                            onChange={(e) => handleRowChange(row.id, 'brand', e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>

                        {/* Supplier Brand */}
                        <td className="py-2.5 px-3" style={{ width: '130px', minWidth: '130px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="text"
                            list={`vendor-brands-${row.id}`}
                            placeholder={getVendorSupplierBrand(vendorsList.find(v => v._id === purchaseHeader.vendorId)) || "Supplier Brand"}
                            value={row.supplierBrand || ''}
                            onChange={(e) => handleRowChange(row.id, 'supplierBrand', e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                          {(() => {
                            const selectedVendor = vendorsList.find(v => v._id === purchaseHeader.vendorId);
                            const brandsList = getVendorBrandsList(selectedVendor);
                            if (brandsList.length === 0) return null;
                            return (
                              <datalist id={`vendor-brands-${row.id}`}>
                                {brandsList.map((b, bIdx) => (
                                  <option key={`${b}-${bIdx}`} value={b} />
                                ))}
                              </datalist>
                            );
                          })()}
                        </td>

                        {/* Vehicle Make */}
                        <td className="py-2.5 px-3" style={{ width: '120px', minWidth: '120px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="text"
                            placeholder="Make"
                            value={row.vehicleMake || ''}
                            onChange={(e) => handleVehicleMakeModelChange(row.id, 'vehicleMake', e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>

                        {/* Vehicle Model */}
                        <td className="py-2.5 px-3" style={{ width: '120px', minWidth: '120px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="text"
                            placeholder="Model"
                            value={row.vehicleModel || ''}
                            onChange={(e) => handleVehicleMakeModelChange(row.id, 'vehicleModel', e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>

                        {/* Compatibility (Auto-generated) */}
                        <td className="py-2.5 px-3" style={{ width: '150px', minWidth: '150px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="text"
                            placeholder="Auto-generated"
                            value={row.compatibility || ''}
                            onChange={(e) => handleRowChange(row.id, 'compatibility', e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-400 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            readOnly
                            title="Auto-generated from Vehicle Make + Vehicle Model"
                          />
                        </td>

                        {/* OEM Brand */}
                        <td className="py-2.5 px-3" style={{ width: '120px', minWidth: '120px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="text"
                            placeholder="OEM Brand"
                            value={row.oemBrand || ''}
                            onChange={(e) => handleRowChange(row.id, 'oemBrand', e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>

                        {/* Warranty */}
                        <td className="py-2.5 px-3" style={{ width: '120px', minWidth: '120px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <input
                            type="text"
                            placeholder="Warranty"
                            value={row.warranty || ''}
                            onChange={(e) => handleRowChange(row.id, 'warranty', e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg h-11 px-3 py-2.5 font-semibold text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>

                        {/* Remove Row Button */}
                        <td className="py-2.5 px-3 text-left" style={{ width: '80px', minWidth: '80px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                            title="Remove row"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Add Row Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleAddRow}
                className="w-full py-2.5 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Another Spare Part Row
              </button>
            </div>
          </div>

          {/* Live Purchase Summary Footer Card */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex flex-col items-center gap-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-6 text-left w-full border-b border-slate-800 pb-5">
              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 block">Gross Purchase Value</span>
                <span className="text-xs font-black text-slate-200">₹{summaryTotals.subtotal.toFixed(2)}</span>
              </div>

              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 block">Total Discount</span>
                <span className="text-xs font-black text-emerald-400">₹{summaryTotals.totalDiscount.toFixed(2)}</span>
              </div>

              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 block">Net Taxable Amount</span>
                <span className="text-xs font-black text-slate-200">₹{summaryTotals.taxableAmount.toFixed(2)}</span>
              </div>

              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 block">CGST Total</span>
                <span className="text-xs font-black text-slate-300">₹{summaryTotals.cgstTotal.toFixed(2)}</span>
              </div>

              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 block">SGST Total</span>
                <span className="text-xs font-black text-slate-300">₹{summaryTotals.sgstTotal.toFixed(2)}</span>
              </div>

              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 block">IGST Total</span>
                <span className="text-xs font-black text-slate-300">₹{summaryTotals.igstTotal.toFixed(2)}</span>
              </div>

              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 block">Round Off</span>
                <span className="text-xs font-black text-slate-400">₹{summaryTotals.roundOff.toFixed(2)}</span>
              </div>

              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-indigo-400 block">Grand Total</span>
                <span className="text-sm font-black text-emerald-400">₹{summaryTotals.grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Attach Invoice / Bill (Multiple Files Allowed) Upload Zone */}
            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Attach Invoice / Bill (Multiple Files Allowed)
              </span>
              <div 
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files) handleFilesUpload(e.dataTransfer.files); }}
                className="border-2 border-dashed border-slate-350 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-2xl p-8 text-center bg-slate-50 dark:bg-slate-800/40 cursor-pointer transition-colors relative"
              >
                <input 
                  type="file" 
                  multiple 
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-955/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                    Drag & drop files here, or <span className="text-indigo-600 dark:text-indigo-400">browse</span>
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Supports JPEG, PNG, WEBP, and PDF files.
                  </p>
                </div>
              </div>

              {/* List of uploaded files / chips */}
              {attachments.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                  {attachments.map((att, idx) => (
                    <div 
                      key={att.id || idx} 
                      className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-lg shrink-0">
                          {att.type?.includes('pdf') ? '📄' : '🖼️'}
                        </span>
                        <div className="flex flex-col text-left min-w-0">
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[120px]" title={att.name}>
                            {att.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase">
                            {att.status === 'uploading' ? (
                              <span className="text-indigo-500 animate-pulse">Uploading...</span>
                            ) : att.status === 'error' ? (
                              <span className="text-red-500">Failed</span>
                            ) : (
                              formatFileSize(att.size || 0)
                            )}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(idx)}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                        title="Remove file"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="text-left">
                <span className="text-[10px] font-bold text-slate-400">Items: {purchaseItems.length} | Qty: {summaryTotals.totalQty} Pcs</span>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleClearForm}
                  className="w-full sm:w-auto px-5 py-3.5 bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                >
                  Clear Form
                </button>
                
                <button
                  type="button"
                  onClick={handleCancel}
                  className="w-full sm:w-auto px-5 py-3.5 bg-slate-750 hover:bg-slate-650 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={purchaseSubmitting || invoiceNoDuplicate}
                  className="w-full sm:w-auto px-7 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg hover:shadow-indigo-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {purchaseSubmitting ? 'Saving Purchase...' : (editPurchaseId ? 'Update Purchase' : 'Save Purchase Entry')}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PURCHASE HISTORY (All Transactions & Payment Updates)              */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-4 p-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-black text-slate-800 dark:text-white">
                Purchase Entry History Log
              </h2>
              <p className="text-xs text-slate-500">
                View all vendor invoices, multi-part procurement breakdowns, and payment status updates.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search history..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-800 dark:text-white"
              />
            </div>
          </div>

          {/* History Datatable */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/80 text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <th className="py-3 px-4">Date & Purchase No</th>
                  <th className="py-3 px-4">Supplier / Vendor</th>
                  <th className="py-3 px-4">Invoice Bill #</th>
                  <th className="py-3 px-4">Parts Count</th>
                  <th className="py-3 px-4">Total Qty</th>
                  <th className="py-3 px-4">Taxable (₹)</th>
                  <th className="py-3 px-4">GST (₹)</th>
                  <th className="py-3 px-4">Grand Total (₹)</th>
                  <th className="py-3 px-4">Payment Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {purchaseHistory.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="py-8 text-center text-slate-400 text-xs font-semibold">
                      No purchase entries recorded yet. Click "Purchase Entry" tab to record your first vendor purchase.
                    </td>
                  </tr>
                ) : (
                  purchaseHistory
                    .filter(p => {
                      if (!searchQuery) return true;
                      const s = searchQuery.toLowerCase();
                      return (
                        (p.purchaseNo && p.purchaseNo.toLowerCase().includes(s)) ||
                        (p.invoiceNo && p.invoiceNo.toLowerCase().includes(s)) ||
                        (p.vendorName && p.vendorName.toLowerCase().includes(s))
                      );
                    })
                    .map((p) => {
                      const isExpanded = expandedPurchaseIds.has(p._id);
                      const displayStatus = p.paymentStatus === 'Unpaid' ? 'Credit' : (p.paymentStatus || 'Credit');
                      const itemsCount = (p.items && Array.isArray(p.items)) ? p.items.length : 1;
                      const totalQty = p.totals?.totalQty || (p.items ? p.items.reduce((s, i) => s + (i.qty || 1), 0) : 1);

                      return (
                        <React.Fragment key={p._id}>
                          <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                              <div>{new Date(p.date || p.createdAt).toLocaleDateString('en-IN')}</div>
                              <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400">{p.purchaseNo}</span>
                            </td>

                            <td className="py-3 px-4 font-bold text-slate-800 dark:text-white">
                              {p.vendorName || 'General Vendor'}
                            </td>

                            <td className="py-3 px-4 text-slate-800 dark:text-slate-300">
                              <div className="font-mono font-bold">{p.invoiceNo || 'N/A'}</div>
                              <div className="flex flex-col items-start gap-1 mt-1">
                                {hasValidAttachment(p) && !brokenAttachments[p._id] && !brokenAttachments[p.attachmentUrl] ? (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={(e) => handleViewAttachment(e, p)}
                                      className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-955/20 text-indigo-650 dark:text-indigo-400 rounded-lg text-[10px] font-black transition-all"
                                      title={`View/Download Document: ${p.attachmentName || 'Invoice'}`}
                                    >
                                      📎 View Invoice {p.attachments && p.attachments.length > 1 ? `(${p.attachments.length})` : ''}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => triggerReupload(p)}
                                      disabled={uploadingPurchaseId === p._id}
                                      className="text-[10px] text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 underline font-semibold transition-colors"
                                      title="Replace invoice file"
                                    >
                                      {uploadingPurchaseId === p._id ? 'Uploading...' : 'Replace'}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-start gap-1">
                                    {(p.attachmentUrl && p.attachmentUrl.startsWith('/uploads/')) || brokenAttachments[p._id] || brokenAttachments[p.attachmentUrl] ? (
                                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                                        ⚠️ Attachment unavailable
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 italic font-semibold">
                                        No Invoice Attached
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => triggerReupload(p)}
                                      disabled={uploadingPurchaseId === p._id}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-955/30 text-indigo-650 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50 rounded text-[10px] font-bold transition-all"
                                    >
                                      📤 {uploadingPurchaseId === p._id ? 'Uploading...' : ((p.attachmentUrl && p.attachmentUrl.startsWith('/uploads/')) || brokenAttachments[p._id] ? 'Re-upload Invoice' : 'Upload Invoice')}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <button
                                type="button"
                                onClick={() => toggleRowExpand(p._id)}
                                className="flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                              >
                                {itemsCount} Part{itemsCount > 1 ? 's' : ''}
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </td>

                            <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                              {totalQty} Pcs
                            </td>

                            <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                              ₹{(p.totals?.taxableAmount || 0).toFixed(2)}
                            </td>

                            <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                              ₹{(p.totals?.gstTotal || 0).toFixed(2)}
                            </td>

                            <td className="py-3 px-4 font-black text-emerald-600 dark:text-emerald-400">
                              ₹{(p.totals?.grandTotal || 0).toFixed(2)}
                            </td>

                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                                displayStatus === 'Paid'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : displayStatus === 'Partially Paid'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                              }`}>
                                {displayStatus}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedVoucher(p)}
                                  className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors"
                                  title="View Purchase Voucher"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>

                                {['Super Admin', 'Admin', 'Purchase Manager', 'Accounts Manager', 'Accounts', 'Accounts Executive', 'Spares', 'Store', 'Store User', 'Store Manager', 'Purchase Executive'].includes(user?.role) && (
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(p)}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors"
                                    title="Edit Purchase Entry"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                )}

                                {['Super Admin', 'Admin', 'Accounts', 'Accounts Executive', 'Accounts Manager'].includes(user?.role) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPaymentModalPurchase(p);
                                      setPaymentModalAmount(p.amountPaid ? p.amountPaid.toString() : '');
                                      setPaymentModalStatus(displayStatus);
                                    }}
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors"
                                    title="Update Payment Status"
                                  >
                                    <CreditCard className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Expandable Line Items Drawer */}
                          {isExpanded && (
                            <tr className="bg-slate-50/90 dark:bg-slate-850">
                              <td colSpan="10" className="p-4 border-b border-slate-200 dark:border-slate-700">
                                <div className="space-y-2">
                                  <span className="text-[11px] font-black uppercase text-indigo-600 dark:text-indigo-400">
                                    Itemized Spare Parts Line Items for Invoice #{p.invoiceNo}
                                  </span>

                                  <table className="w-full text-left border-collapse text-xs bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                                    <thead>
                                      <tr className="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 uppercase">
                                        <th className="py-2 px-3">Part Name</th>
                                        <th className="py-2 px-3">Part Number</th>
                                        <th className="py-2 px-3">HSN</th>
                                        <th className="py-2 px-3">Qty</th>
                                        <th className="py-2 px-3">Rate</th>
                                        <th className="py-2 px-3">MRP</th>
                                        <th className="py-2 px-3">Discount</th>
                                        <th className="py-2 px-3">Taxable</th>
                                        <th className="py-2 px-3">GST %</th>
                                        <th className="py-2 px-3">GST Amt</th>
                                        <th className="py-2 px-3">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                      {(p.items || []).map((item, idx) => (
                                        <tr key={idx}>
                                          <td className="py-2 px-3 font-semibold text-slate-800 dark:text-white">{item.partName}</td>
                                          <td className="py-2 px-3 text-slate-600 dark:text-slate-300 font-mono">{item.partNumber}</td>
                                          <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{item.hsnCode || '8708'}</td>
                                          <td className="py-2 px-3 font-bold">{item.qty}</td>
                                          <td className="py-2 px-3">₹{(item.purchasePrice || 0).toFixed(2)}</td>
                                          <td className="py-2 px-3">₹{(item.mrp || 0).toFixed(2)}</td>
                                          <td className="py-2 px-3 text-emerald-600">₹{(item.discountAmount || 0).toFixed(2)}</td>
                                          <td className="py-2 px-3">₹{(item.taxableAmount || 0).toFixed(2)}</td>
                                          <td className="py-2 px-3">{item.gstPercent || 18}%</td>
                                          <td className="py-2 px-3">₹{(item.gstAmount || 0).toFixed(2)}</td>
                                          <td className="py-2 px-3 font-bold text-indigo-600">₹{(item.total || 0).toFixed(2)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PURCHASE REPORTS & ANALYTICS                                        */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Filter Bar Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 print:hidden">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                <Tag className="w-4 h-4 text-indigo-500" />
                Filter Purchase Reports Data
              </h2>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Excel CSV
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Print
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
              {/* From Date */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 font-semibold text-slate-800 dark:text-white"
                />
              </div>

              {/* To Date */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 font-semibold text-slate-800 dark:text-white"
                />
              </div>

              {/* Supplier / Vendor */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Supplier</label>
                <SearchableDropdown
                  items={vendorsList}
                  value={vendorId}
                  onSelect={setVendorId}
                  placeholder="Search supplier..."
                  emptyOptionLabel="All Suppliers"
                  type="vendors"
                  className="w-full"
                />
              </div>

              {/* Part Name / Number */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Part Name</label>
                <input
                  type="text"
                  placeholder="Filter part..."
                  value={partNameFilter}
                  onChange={(e) => setPartNameFilter(e.target.value)}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 font-semibold text-slate-800 dark:text-white"
                />
              </div>

              {/* Payment Status */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Payment Status</label>
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 font-bold text-slate-800 dark:text-white"
                >
                  <option value="">All Statuses</option>
                  <option value="Paid">Paid</option>
                  <option value="Credit">Credit</option>
                  <option value="Partially Paid">Partially Paid</option>
                </select>
              </div>

              {/* Warehouse */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Warehouse</label>
                <select
                  value={warehouseFilter}
                  onChange={(e) => setWarehouseFilter(e.target.value)}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 font-semibold text-slate-800 dark:text-white"
                >
                  <option value="">All Warehouses</option>
                  <option value="Main Store">Main Store</option>
                  <option value="Spares Rack">Spares Rack</option>
                  <option value="Body Shop Depot">Body Shop Depot</option>
                </select>
              </div>
            </div>
          </div>

          {/* Top 4 KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">Total Purchase Value</span>
                <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">₹{reportTotalAmount.toFixed(2)}</span>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-xl">
                <IndianRupee className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">Total Qty Purchased</span>
                <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block">{reportTotalQty} Pcs</span>
              </div>
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 rounded-xl">
                <Package className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">Purchase Transactions</span>
                <span className="text-xl font-black text-slate-800 dark:text-white mt-1 block">{reportTxCount} Invoices</span>
              </div>
              <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-600 rounded-xl">
                <Receipt className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">Outstanding Credit</span>
                <span className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1 block">₹{reportCreditTotal.toFixed(2)}</span>
              </div>
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 rounded-xl">
                <CreditCard className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Report Data Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/80 text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Invoice Bill #</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Part Name</th>
                    <th className="py-3 px-4">Part Number</th>
                    <th className="py-3 px-4">HSN</th>
                    <th className="py-3 px-4">Qty</th>
                    <th className="py-3 px-4">Rate (₹)</th>
                    <th className="py-3 px-4">GST (₹)</th>
                    <th className="py-3 px-4">Total (₹)</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredReports.length === 0 ? (
                    <tr>
                      <td colSpan="11" className="py-8 text-center text-slate-400 text-xs font-semibold">
                        No purchase records match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredReports.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-slate-800 dark:text-white">
                          {new Date(item.purchaseDate || item.createdAt || Date.now()).toLocaleDateString('en-IN')}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                          {item.invoiceNo || item.purchaseNo}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-slate-800 dark:text-white">
                          {item.vendorName || 'Supplier'}
                        </td>
                        <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-white">
                          {item.partName}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                          {item.partNumber}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                          {item.hsnCode || '8708'}
                        </td>
                        <td className="py-2.5 px-4 font-bold text-slate-800 dark:text-white">
                          {item.qty}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-slate-800 dark:text-white">
                          ₹{(item.purchasePrice || 0).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-slate-700 dark:text-slate-300">
                          ₹{(item.gstAmount || 0).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 font-black text-emerald-600 dark:text-emerald-400">
                          ₹{(item.total || 0).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 font-bold">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] ${
                            (item.paymentStatus === 'Unpaid' ? 'Credit' : (item.paymentStatus || 'Credit')) === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}>
                            {item.paymentStatus === 'Unpaid' ? 'Credit' : (item.paymentStatus || 'Credit')}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: VIEW PURCHASE VOUCHER                                            */}
      {/* ========================================================================= */}
      {selectedVoucher && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[99999] print:p-0 print:bg-white print:static">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl overflow-hidden shadow-2xl p-6 print:shadow-none print:border-none flex flex-col max-h-[90vh]">
            {/* Voucher Actions Bar */}
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4 print:hidden shrink-0">
              <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                <Receipt className="w-5 h-5 text-indigo-500" />
                Purchase Voucher: {selectedVoucher.purchaseNo}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-500 transition-colors"
                >
                  <Printer className="w-4 h-4" /> Print Voucher
                </button>
                <button
                  onClick={() => setSelectedVoucher(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Voucher Document Printable Section */}
            <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-6 text-slate-800 dark:text-slate-200 text-xs mt-5">
              <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-700 pb-4">
                <div>
                  <h2 className="text-lg font-black text-indigo-600 dark:text-indigo-400 uppercase">MVSS AUTOMOBILES</h2>
                  <p className="text-[11px] text-slate-500">Multi-Brand Workshop & Spares Depot</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">PURCHASE VOUCHER</span>
                  <span className="text-sm font-mono font-black text-slate-900 dark:text-white">{selectedVoucher.purchaseNo}</span>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Date: {new Date(selectedVoucher.date || selectedVoucher.createdAt).toLocaleDateString('en-IN')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-1">SUPPLIER DETAILS</span>
                  <p className="font-bold text-sm text-slate-900 dark:text-white">{selectedVoucher.vendorName}</p>
                  {(() => {
                    const vendor = vendorsList.find(v => v._id === selectedVoucher.vendorId || v.name === selectedVoucher.vendorName);
                    if (!vendor) return null;
                    return (
                      <div className="text-[11px] text-slate-500 space-y-0.5 mt-1">
                        {vendor.vendorCode && <p><strong>Code:</strong> {vendor.vendorCode}</p>}
                        {vendor.mobile && <p><strong>Phone:</strong> {vendor.mobile}</p>}
                        {vendor.email && <p><strong>Email:</strong> {vendor.email}</p>}
                        {vendor.gstNumber && <p><strong>GSTIN:</strong> {vendor.gstNumber}</p>}
                        {vendor.address && <p><strong>Address:</strong> {vendor.address}</p>}
                      </div>
                    );
                  })()}
                  <p className="text-slate-500 mt-2">Invoice Ref: {selectedVoucher.invoiceNo || 'N/A'}</p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-1">PAYMENT STATUS</span>
                  <span className="inline-block px-3 py-1 bg-slate-900 text-emerald-400 font-extrabold rounded-lg text-xs">
                    {selectedVoucher.paymentStatus === 'Unpaid' ? 'Credit' : selectedVoucher.paymentStatus}
                  </span>
                  <p className="text-slate-500 mt-1">Amount Paid: ₹{(selectedVoucher.amountPaid || 0).toFixed(2)}</p>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-left border-collapse border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300">
                    <th className="p-2 border-b">Part Name</th>
                    <th className="p-2 border-b">Part #</th>
                    <th className="p-2 border-b">HSN</th>
                    <th className="p-2 border-b">Qty</th>
                    <th className="p-2 border-b">Rate</th>
                    <th className="p-2 border-b">MRP</th>
                    <th className="p-2 border-b">Discount</th>
                    <th className="p-2 border-b">Taxable</th>
                    {!(vendorsList.find(v => v._id === selectedVoucher.vendorId || v.name === selectedVoucher.vendorName)?.gstNumber?.trim().startsWith('36') === false) && <th className="p-2 border-b">CGST</th>}
                    {!(vendorsList.find(v => v._id === selectedVoucher.vendorId || v.name === selectedVoucher.vendorName)?.gstNumber?.trim().startsWith('36') === false) && <th className="p-2 border-b">SGST</th>}
                    {(vendorsList.find(v => v._id === selectedVoucher.vendorId || v.name === selectedVoucher.vendorName)?.gstNumber?.trim().startsWith('36') === false) && <th className="p-2 border-b">IGST</th>}
                    <th className="p-2 border-b">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedVoucher.items || []).map((item, idx) => {
                    const selectedVoucherVendor = vendorsList.find(v => v._id === selectedVoucher.vendorId || v.name === selectedVoucher.vendorName);
                    const isVoucherInterstate = selectedVoucherVendor && selectedVoucherVendor.gstNumber 
                      ? !selectedVoucherVendor.gstNumber.trim().startsWith('36') 
                      : false;
                    
                    const discountTypeStr = item.discountType === 'Flat' ? '₹' : '%';
                    const discountValStr = item.discountValue !== undefined ? item.discountValue : (item.discountPercent || 0);
                    
                    const gstVal = item.gstAmount || 0;
                    const cgstItem = item.cgst !== undefined ? item.cgst : (isVoucherInterstate ? 0 : gstVal / 2);
                    const sgstItem = item.sgst !== undefined ? item.sgst : (isVoucherInterstate ? 0 : gstVal / 2);
                    const igstItem = item.igst !== undefined ? item.igst : (isVoucherInterstate ? gstVal : 0);

                    return (
                      <tr key={idx} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="p-2 font-bold">{item.partName}</td>
                        <td className="p-2 font-mono text-slate-500">{item.partNumber}</td>
                        <td className="p-2">{item.hsnCode || '8708'}</td>
                        <td className="p-2 font-bold">{item.qty}</td>
                        <td className="p-2">₹{(item.purchasePrice || 0).toFixed(2)}</td>
                        <td className="p-2">₹{(item.mrp || 0).toFixed(2)}</td>
                        <td className="p-2 text-emerald-600">
                          {discountValStr > 0 ? `${discountValStr}${discountTypeStr} (₹${(item.discountAmount || 0).toFixed(2)})` : '0'}
                        </td>
                        <td className="p-2">₹{(item.taxableAmount || 0).toFixed(2)}</td>
                        {!isVoucherInterstate && <td className="p-2">₹{cgstItem.toFixed(2)} ({((item.gstPercent || 18)/2)}%)</td>}
                        {!isVoucherInterstate && <td className="p-2">₹{sgstItem.toFixed(2)} ({((item.gstPercent || 18)/2)}%)</td>}
                        {isVoucherInterstate && <td className="p-2">₹{igstItem.toFixed(2)} ({(item.gstPercent || 18)}%)</td>}
                        <td className="p-2 font-black text-indigo-600">₹{(item.total || 0).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Voucher Totals Summary */}
              <div className="flex justify-end pt-2">
                <div className="w-80 space-y-1 text-right">
                  <div className="flex justify-between text-slate-500">
                    <span>Gross Purchase Value:</span>
                    <span>₹{(selectedVoucher.totals?.subtotal || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Total Discount:</span>
                    <span>₹{(selectedVoucher.totals?.totalDiscount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Net Taxable Amount:</span>
                    <span>₹{(selectedVoucher.totals?.taxableAmount || 0).toFixed(2)}</span>
                  </div>
                  {!(vendorsList.find(v => v._id === selectedVoucher.vendorId || v.name === selectedVoucher.vendorName)?.gstNumber?.trim().startsWith('36') === false) && (
                    <>
                      <div className="flex justify-between text-slate-500">
                        <span>CGST Total:</span>
                        <span>₹{(selectedVoucher.totals?.cgstTotal !== undefined ? selectedVoucher.totals.cgstTotal : (selectedVoucher.totals?.gstTotal || 0) / 2).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>SGST Total:</span>
                        <span>₹{(selectedVoucher.totals?.sgstTotal !== undefined ? selectedVoucher.totals.sgstTotal : (selectedVoucher.totals?.gstTotal || 0) / 2).toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  {(vendorsList.find(v => v._id === selectedVoucher.vendorId || v.name === selectedVoucher.vendorName)?.gstNumber?.trim().startsWith('36') === false) && (
                    <div className="flex justify-between text-slate-500">
                      <span>IGST Total:</span>
                      <span>₹{(selectedVoucher.totals?.igstTotal !== undefined ? selectedVoucher.totals.igstTotal : (selectedVoucher.totals?.gstTotal || 0)).toFixed(2)}</span>
                    </div>
                  )}
                  {selectedVoucher.totals?.roundOff !== undefined && selectedVoucher.totals.roundOff !== 0 && (
                    <div className="flex justify-between text-slate-500">
                      <span>Round Off:</span>
                      <span>₹{selectedVoucher.totals.roundOff.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
                    <span>Grand Total:</span>
                    <span className="text-emerald-600 dark:text-emerald-400">₹{(selectedVoucher.totals?.grandTotal || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Document Attachment Display in Voucher */}
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 print:hidden text-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                    Attached Document(s)
                  </span>
                  <button
                    type="button"
                    onClick={() => triggerReupload(selectedVoucher)}
                    disabled={uploadingPurchaseId === selectedVoucher._id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-955/30 text-indigo-650 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50 rounded-lg text-xs font-bold transition-all"
                  >
                    📤 {uploadingPurchaseId === selectedVoucher._id ? 'Uploading...' : (hasValidAttachment(selectedVoucher) ? 'Re-upload / Replace Invoice' : 'Upload Invoice')}
                  </button>
                </div>
                {hasValidAttachment(selectedVoucher) && !brokenAttachments[selectedVoucher._id] ? (
                  <div className="grid grid-cols-1 gap-4">
                    {(selectedVoucher.attachments && selectedVoucher.attachments.length > 0
                      ? selectedVoucher.attachments.map(att => ({ url: att.key, name: att.originalName, type: att.mimeType }))
                      : [{ url: selectedVoucher.attachmentUrl, name: selectedVoucher.attachmentName || 'purchase_document', type: selectedVoucher.attachmentType || 'image/jpeg' }]
                    ).map((att, idx) => (
                      <div key={idx} className="flex flex-col gap-2 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={(e) => handleViewAttachment(e, selectedVoucher, idx)}
                            className="font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1.5 break-all text-xs text-left"
                          >
                            📎 {att.name || `Attachment ${idx + 1}`} (Click to View / Download)
                          </button>
                        </div>
                        {brokenAttachments[selectedVoucher._id] || brokenAttachments[att.url] ? (
                          <div className="text-amber-600 dark:text-amber-400 text-[10px] font-bold p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-center">
                            Attachment unavailable — file is missing from persistent storage. Click "Re-upload / Replace Invoice" above to attach the document.
                          </div>
                        ) : (
                          <>
                            {!att.type?.includes('pdf') && (
                              <img 
                                src={getAttachmentSrc(att.url)} 
                                alt={att.name || "Attachment"} 
                                className="max-h-60 rounded-lg object-contain bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750" 
                                onError={() => setBrokenAttachments(prev => ({ ...prev, [selectedVoucher._id]: true, [att.url]: true }))}
                              />
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 bg-slate-50 dark:bg-slate-800/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-400 italic">No invoice file attached to this purchase voucher.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: UPDATE PAYMENT STATUS                                             */}
      {/* ========================================================================= */}
      {paymentModalPurchase && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[99999]">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-500" />
                Update Payment Status
              </h3>
              <button onClick={() => setPaymentModalPurchase(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdatePaymentSubmit} className="space-y-4 text-xs">
              <div>
                <span className="text-[10px] font-extrabold text-slate-400 block uppercase">Purchase Reference</span>
                <p className="font-bold text-slate-800 dark:text-white">{paymentModalPurchase.purchaseNo} ({paymentModalPurchase.vendorName})</p>
                <p className="text-indigo-600 font-extrabold mt-0.5">Grand Total: ₹{(paymentModalPurchase.totals?.grandTotal || 0).toFixed(2)}</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Amount Paid (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentModalAmount}
                  onChange={(e) => setPaymentModalAmount(e.target.value)}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-bold text-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Payment Status
                </label>
                <select
                  value={paymentModalStatus}
                  onChange={(e) => setPaymentModalStatus(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-bold text-slate-800 dark:text-white"
                >
                  <option value="Credit">Credit</option>
                  <option value="Paid">Paid</option>
                  <option value="Partially Paid">Partially Paid</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setPaymentModalPurchase(null)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-slate-600 dark:text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paymentSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold"
                >
                  {paymentSubmitting ? 'Saving...' : 'Save Payment Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
