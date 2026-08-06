import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { API_BASE_URL } from './config';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Customers = lazy(() => import('./pages/Customers'));
const Vehicles = lazy(() => import('./pages/Vehicles'));
const JobCards = lazy(() => import('./pages/JobCards'));
const Estimates = lazy(() => import('./pages/Estimates'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Claims = lazy(() => import('./pages/Claims'));
import ErrorBoundary from './components/ErrorBoundary';
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const Employees = lazy(() => import('./pages/Employees'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const BodyShop = lazy(() => import('./pages/BodyShop'));
const Reports = lazy(() => import('./pages/Reports'));
const GatePasses = lazy(() => import('./pages/GatePasses'));
const Vendors = lazy(() => import('./pages/Vendors'));
const StockAdjustment = lazy(() => import('./pages/StockAdjustment'));
const StockStatement = lazy(() => import('./pages/StockStatement'));
const InventoryReports = lazy(() => import('./pages/InventoryReports'));
const PurchaseReport = lazy(() => import('./pages/PurchaseReport'));
const Backlogs = lazy(() => import('./pages/Backlogs'));
const Expenses = lazy(() => import('./pages/Expenses'));
const ExternalRepairs = lazy(() => import('./pages/ExternalRepairs'));
const ServiceHistory = lazy(() => import('./pages/ServiceHistory'));
const Insurance = lazy(() => import('./pages/Insurance'));

const PageSkeletonLoader = () => (
  <div className="p-6 space-y-4 animate-pulse select-none">
    <div className="h-7 bg-slate-200 dark:bg-slate-800 rounded-xl w-1/4"></div>
    <div className="h-28 bg-slate-100 dark:bg-slate-900 rounded-2xl w-full"></div>
    <div className="h-64 bg-slate-100 dark:bg-slate-900 rounded-2xl w-full"></div>
  </div>
);
import { 
  ShieldAlert, 
  LayoutDashboard, 
  Users, 
  Car, 
  FileText, 
  FileCheck, 
  Receipt, 
  Package, 
  ShieldCheck, 
  History,
  MoreHorizontal,
  Wrench,
  TrendingUp,
  ShoppingBag,
  Wallet,
  Key
} from 'lucide-react';

import * as mockData from './utils/mockData';

const tabPermissions = {
  dashboard: ['Admin', 'Service', 'Reception', 'Accounts', 'Accounts Executive'],
  bodyshop: ['Admin'],
  customers: ['Admin', 'Accounts', 'Service', 'Body Shop', 'Reception'],
  vehicles: ['Admin', 'Service', 'Body Shop', 'Reception'],
  jobcards: ['Admin', 'Service', 'Body Shop', 'Reception'],
  estimates: ['Admin', 'Service', 'Body Shop', 'Accounts Executive'],
  invoices: ['Admin', 'Accounts', 'Accounts Executive'],
  inventory: ['Admin', 'Spares'],
  vendors: ['Admin', 'Spares'],
  adjustments: ['Admin', 'Spares'],
  stockstatement: ['Admin', 'Spares'],
  inventoryreports: ['Admin', 'Spares'],
  purchases: ['Admin', 'Spares'],
  purchasereport: ['Admin', 'Spares'],
  backlogs: ['Admin', 'Service', 'Body Shop', 'Spares', 'Accounts Executive'],
  expenses: ['Admin', 'Accounts', 'Service', 'Spares'],
  externalrepairs: ['Admin', 'Service', 'Body Shop', 'Reception'],
  employees: ['Admin'],
  claims: ['Admin', 'Service', 'Body Shop', 'Accounts Executive'],
  reports: ['Admin', 'Service', 'Body Shop', 'Accounts', 'Accounts Executive'],
  auditlogs: ['Admin'],
  gatepass: ['Admin', 'Service', 'Body Shop', 'Accounts Executive']
};

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);

  // If a global view jobcard state is needed
  const [viewJcId, setViewJcId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');

  // Intercept fetch calls for Offline Demo Mode
  useEffect(() => {
    if (token === 'mock_jwt_token_for_offline_demo') {
      const originalFetch = window.fetch.bind(window);
      const sessionStorage = localStorage; // Shadow to persist offline demo data across browser sessions

      const readFileAsDataURL = (file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(file);
        });
      };

      const recalculateMockTotals = (parts = [], labour = [], isInvoice = false, isInterstate = false) => {
        let partsTotal = 0;
        let labourTotal = 0;
        let cgstTotal = 0;
        let sgstTotal = 0;
        let igstTotal = 0;
        let gstTotal = 0;

        const processedParts = (parts || []).map(part => {
          const qty = Number(part.qty) || 0;
          const rate = Number(part.rate) || 0;
          const gstPercent = (part.gstPercent !== undefined && part.gstPercent !== null && part.gstPercent !== '') ? Number(part.gstPercent) : 18;
          const amount = qty * rate;
          const gstAmount = amount * (gstPercent / 100);
          const total = amount + gstAmount;

          partsTotal += amount;
          gstTotal += gstAmount;

          if (isInvoice) {
            if (isInterstate) {
              igstTotal += gstAmount;
            } else {
              cgstTotal += gstAmount / 2;
              sgstTotal += gstAmount / 2;
            }
          }

          return { ...part, qty, rate, gstPercent, amount, gstAmount, total };
        });

        const processedLabour = (labour || []).map(lab => {
          const rate = Number(lab.rate) || 0;
          const gstPercent = (lab.gstPercent !== undefined && lab.gstPercent !== null && lab.gstPercent !== '') ? Number(lab.gstPercent) : 18;
          const amount = rate;
          const gstAmount = amount * (gstPercent / 100);
          const total = amount + gstAmount;

          labourTotal += amount;
          gstTotal += gstAmount;

          if (isInvoice) {
            if (isInterstate) {
              igstTotal += gstAmount;
            } else {
              cgstTotal += gstAmount / 2;
              sgstTotal += gstAmount / 2;
            }
          }

          return { ...lab, rate, gstPercent, amount, gstAmount, total };
        });

        const grandTotal = Math.round((partsTotal + labourTotal + gstTotal) * 100) / 100;

        const totals = {
          partsTotal: Math.round(partsTotal * 100) / 100,
          labourTotal: Math.round(labourTotal * 100) / 100,
          gstTotal: Math.round(gstTotal * 100) / 100,
          grandTotal
        };

        if (isInvoice) {
          totals.cgstTotal = Math.round(cgstTotal * 100) / 100;
          totals.sgstTotal = Math.round(sgstTotal * 100) / 100;
          totals.igstTotal = Math.round(igstTotal * 100) / 100;
        }

        return {
          parts: processedParts,
          labour: processedLabour,
          totals
        };
      };

      // Load mock databases in session storage if empty
      if (!sessionStorage.getItem('mock_db_initialized_v3')) {
        sessionStorage.setItem('mock_customers', JSON.stringify(mockData.initialCustomers));
        sessionStorage.setItem('mock_vehicles', JSON.stringify(mockData.initialVehicles));
        sessionStorage.setItem('mock_inventory', JSON.stringify(mockData.initialInventory));
        sessionStorage.setItem('mock_jobcards', JSON.stringify(mockData.initialJobCards));
        sessionStorage.setItem('mock_estimates', JSON.stringify(mockData.initialEstimates));
        sessionStorage.setItem('mock_invoices', JSON.stringify(mockData.initialInvoices));
        sessionStorage.setItem('mock_claims', JSON.stringify(mockData.initialClaims));
        sessionStorage.setItem('mock_gatepasses', JSON.stringify([]));
        sessionStorage.setItem('mock_backlogs', JSON.stringify([]));
        localStorage.setItem('mock_auditlogs', JSON.stringify(mockData.initialAuditLogs));
        sessionStorage.setItem('mock_employees', JSON.stringify([
          {
            _id: 'emp_1',
            name: 'Ravi Kumar',
            email: 'ravi@autoworkshop.com',
            phone: '9988776655',
            dateOfJoining: '2025-01-15',
            aadharNumber: '1122-3344-5566',
            basicDetails: 'Senior mechanic, Hyderabad',
            resumeUrl: '',
            attendance: [
              { date: '2026-06-01', status: 'Present' },
              { date: '2026-06-02', status: 'Present' },
              { date: '2026-06-03', status: 'Absent' },
              { date: '2026-06-04', status: 'Present' }
            ],
            salaries: []
          },
          {
            _id: 'emp_2',
            name: 'Karan Singh',
            email: 'karan@autoworkshop.com',
            phone: '8877665544',
            dateOfJoining: '2025-03-10',
            aadharNumber: '5566-7788-9900',
            basicDetails: 'Store assistant',
            resumeUrl: '',
            attendance: [],
            salaries: []
          }
        ]));
        sessionStorage.setItem('mock_db_initialized_v3', 'true');
      }

      window.fetch = async (url, options) => {
        const urlStr = url.toString();
        const method = options?.method || 'GET';
        
        let body = null;
        if (options?.body) {
          if (typeof options.body === 'string') {
            try {
              body = JSON.parse(options.body);
            } catch (e) {
              body = options.body;
            }
          } else {
            body = options.body;
          }
        }

        const responseJson = (data, status = 200) => {
          return Promise.resolve({
            ok: status >= 200 && status < 300,
            status,
            json: () => Promise.resolve(data),
            text: () => Promise.resolve(JSON.stringify(data))
          });
        };

        if (urlStr.includes('/api/auth/profile')) {
          return responseJson(user || { id: 'demo_user_id', name: 'System Admin', email: 'admin@mvssautomobiles.com', role: 'Admin' });
        }

        if (urlStr.includes('/api/dashboard/stats')) {
          const customers = JSON.parse(sessionStorage.getItem('mock_customers') || '[]');
          const vehicles = JSON.parse(sessionStorage.getItem('mock_vehicles') || '[]');
          const jobcards = JSON.parse(sessionStorage.getItem('mock_jobcards') || '[]');
          const invoices = JSON.parse(sessionStorage.getItem('mock_invoices') || '[]');
          const inventory = JSON.parse(sessionStorage.getItem('mock_inventory') || '[]');
          const claims = JSON.parse(sessionStorage.getItem('mock_claims') || '[]');

          const activeJobCards = jobcards.filter(jc => jc.status !== 'Delivered').length;
          const completedJobCards = jobcards.filter(jc => jc.status === 'Delivered').length;
          const pendingJobCards = jobcards.filter(jc => ['Created', 'Inspect Stage', 'Estimation', 'Customer Approval'].includes(jc.status)).length;

          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const startOfYear = new Date(now.getFullYear(), 0, 1);

          const monthlyInvoices = invoices.filter(inv => 
            inv.status === 'Finalized' && 
            new Date(inv.date || inv.createdAt) >= startOfMonth
          );
          const revenueThisMonth = monthlyInvoices.reduce((sum, inv) => sum + (inv.totals?.grandTotal || 0), 0);

          const yearlyInvoices = invoices.filter(inv => 
            inv.status === 'Finalized' && 
            new Date(inv.date || inv.createdAt) >= startOfYear
          );
          const revenueThisYear = yearlyInvoices.reduce((sum, inv) => sum + (inv.totals?.grandTotal || 0), 0);

          const pendingPayments = invoices.filter(inv => 
            inv.status === 'Finalized' && 
            inv.paymentStatus !== 'Paid'
          ).reduce((sum, inv) => sum + (inv.totals?.grandTotal || 0), 0);

          const inventoryValue = inventory.reduce((sum, item) => sum + ((item.stockQuantity || 0) * (item.purchasePrice || 0)), 0);
          const lowStockItems = inventory.filter(item => (item.stockQuantity || 0) <= (item.lowStockThreshold || 5)).length;

          // Process mock low stock alerts
          const mockNotifs = JSON.parse(localStorage.getItem('mock_notifications') || '[]');
          let changedNotifs = false;
          inventory.filter(item => (item.stockQuantity || 0) <= (item.lowStockThreshold || 5)).forEach(item => {
            const alertMsg = `Low Stock Warning: ${item.partName} inventory below threshold.`;
            const exists = mockNotifs.find(n => n.type === 'low_stock' && n.message === alertMsg && n.status === 'unread');
            if (!exists) {
              mockNotifs.unshift({
                _id: 'mock_notif_' + Date.now() + Math.random(),
                type: 'low_stock',
                title: 'Low Stock Warning',
                message: alertMsg,
                status: 'unread',
                createdAt: new Date().toISOString()
              });
              changedNotifs = true;
            }
          });
          if (changedNotifs) {
            localStorage.setItem('mock_notifications', JSON.stringify(mockNotifs));
            window.dispatchEvent(new Event('storage'));
          }

          const activeClaims = claims.filter(c => c.status !== 'Approved' && c.status !== 'Rejected').length;

          const gatepasses = JSON.parse(sessionStorage.getItem('mock_gatepasses') || '[]');
          const totalGatePasses = gatepasses.length;
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);
          const issuedToday = gatepasses.filter(gp => new Date(gp.date || gp.createdAt) >= startOfToday).length;
          const pendingReturns = gatepasses.filter(gp => gp.status === 'Pending').length;
          const returnedMaterials = gatepasses.filter(gp => gp.status === 'Returned').length;

          return responseJson({
            totalCustomers: customers.length,
            totalVehicles: vehicles.length,
            activeJobCards,
            completedJobCards,
            pendingJobCards,
            revenueThisMonth,
            revenueThisYear,
            pendingPayments,
            inventoryValue,
            lowStockItems,
            activeClaims,
            monthlyRevenue: revenueThisMonth,
            totalGatePasses,
            issuedToday,
            pendingReturns,
            returnedMaterials
          });
        }

        if (urlStr.includes('/api/dashboard/charts')) {
          const invoices = JSON.parse(sessionStorage.getItem('mock_invoices') || '[]');
          const finalizedInvs = invoices.filter(inv => inv.status === 'Finalized');
          
          let spareParts = 0;
          let labour = 0;
          let gst = 0;
          
          finalizedInvs.forEach(inv => {
            spareParts += inv.totals?.partsTotal || 0;
            labour += inv.totals?.labourTotal || 0;
            gst += inv.totals?.gstTotal || 0;
          });

          // Fallbacks for seeding demo metrics if empty
          if (finalizedInvs.length === 0) {
            spareParts = 12450;
            labour = 8500;
            gst = 3770;
          }

          return responseJson({
            revenueChart: [
              { month: 'Jan', amount: 5000 },
              { month: 'Feb', amount: 8000 },
              { month: 'Mar', amount: 15000 },
              { month: 'Apr', amount: 12000 },
              { month: 'May', amount: 22000 },
              { month: 'Jun', amount: spareParts + labour + gst }
            ],
            serviceTypeChart: [
              { name: 'General Servicing', value: 8 },
              { name: 'Paid Service', value: 12 },
              { name: 'Accident Repair', value: 3 }
            ],
            topPartsChart: [
              { name: 'Engine Oil (10W-40)', qty: 15 },
              { name: 'Brake Pads (Front)', qty: 8 },
              { name: 'Air Filter', qty: 12 }
            ],
            billingBreakdown: {
              spareParts,
              labour,
              gst
            }
          });
        }

        if (urlStr.includes('/api/customers')) {
          const db = JSON.parse(sessionStorage.getItem('mock_customers') || '[]');
          if (method === 'GET') {
            if (urlStr.includes('/timeline')) {
              return responseJson([
                { id: '1', type: 'Job Card', number: 'JC-20260619-001', date: new Date().toISOString(), status: 'Ready for Delivery', details: 'Vehicle: TS09EP1234, Complaints: 2' }
              ]);
            }
            if (urlStr.match(/\/customers\/[a-zA-Z0-9_-]+$/)) {
              const id = urlStr.split('/').pop();
              return responseJson(db.find(c => c._id === id) || db[0]);
            }
            
            // Search query parsing
            const urlObj = new URL(urlStr, window.location.origin);
            const searchVal = urlObj.searchParams.get('search') || '';
            const typeVal = urlObj.searchParams.get('type') || '';
            
            let result = [...db];
            
            if (searchVal) {
              const lowerSearch = searchVal.toLowerCase();
              
              // Load mock vehicles & jobcards for cross-referencing
              const mockVehicles = JSON.parse(sessionStorage.getItem('mock_vehicles') || '[]');
              const mockJobCards = JSON.parse(sessionStorage.getItem('mock_jobcards') || '[]');
              
              const matchingVehicleCustomerIds = mockVehicles
                .filter(v => 
                  (v.vehicleNumber && v.vehicleNumber.toLowerCase().includes(lowerSearch)) ||
                  (v.make && v.make.toLowerCase().includes(lowerSearch)) ||
                  (v.model && v.model.toLowerCase().includes(lowerSearch))
                )
                .map(v => v.customerId?._id || v.customerId);
                
              const matchingJobCardCustomerIds = mockJobCards
                .filter(jc => jc.jobCardNo && jc.jobCardNo.toLowerCase().includes(lowerSearch))
                .map(jc => jc.customerId?._id || jc.customerId);
                
              const matchingCustomerIds = new Set([...matchingVehicleCustomerIds, ...matchingJobCardCustomerIds]);
              
              result = result.filter(c => 
                (c.name && c.name.toLowerCase().includes(lowerSearch)) ||
                (c.mobile && c.mobile.toLowerCase().includes(lowerSearch)) ||
                (c.gstNumber && c.gstNumber.toLowerCase().includes(lowerSearch)) ||
                matchingCustomerIds.has(c._id)
              );
            }
            
            if (typeVal) {
              result = result.filter(c => c.type === typeVal);
            }
            
            return responseJson(result);
          }
          if (method === 'POST') {
            const mobileRegex = /^[6-9]\d{9}$/;
            if (!mobileRegex.test(body?.mobile || '')) {
              return responseJson({ error: 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.' }, 400);
            }
            const newItem = { _id: 'cust_' + Date.now(), ...body };
            db.push(newItem);
            sessionStorage.setItem('mock_customers', JSON.stringify(db));
            return responseJson(newItem, 201);
          }
          if (method === 'PUT') {
            const id = urlStr.split('/').pop();
            const idx = db.findIndex(c => c._id === id);
            if (idx !== -1) {
              const mobileRegex = /^[6-9]\d{9}$/;
              if (body?.mobile && !mobileRegex.test(body.mobile)) {
                return responseJson({ error: 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.' }, 400);
              }
              db[idx] = { ...db[idx], ...body };
              sessionStorage.setItem('mock_customers', JSON.stringify(db));
              return responseJson(db[idx]);
            }
          }
          if (method === 'DELETE') {
            const id = urlStr.split('/').pop();
            const idx = db.findIndex(c => c._id === id);
            if (idx !== -1) {
              const deleted = db[idx];
              db.splice(idx, 1);
              sessionStorage.setItem('mock_customers', JSON.stringify(db));
              return responseJson({ message: 'Customer deleted successfully.', customer: deleted });
            }
            return responseJson({ error: 'Customer not found.' }, 404);
          }
        }

        if (urlStr.includes('/api/vehicles')) {
          const db = JSON.parse(sessionStorage.getItem('mock_vehicles') || '[]');
          const customers = JSON.parse(sessionStorage.getItem('mock_customers') || '[]');
          if (method === 'GET') {
            if (urlStr.includes('/history')) {
              const jobcards = JSON.parse(sessionStorage.getItem('mock_jobcards') || '[]');
              return responseJson(jobcards);
            }
            return responseJson(db.map(v => ({
              ...v,
              customerId: customers.find(c => c._id === (v.customerId?._id || v.customerId)) || v.customerId
            })));
          }
          if (method === 'POST') {
            const newItem = { _id: 'veh_' + Date.now(), ...body };
            db.push(newItem);
            sessionStorage.setItem('mock_vehicles', JSON.stringify(db));
            return responseJson(newItem, 201);
          }
          if (method === 'PUT') {
            const id = urlStr.split('/').pop();
            const idx = db.findIndex(v => v._id === id);
            if (idx !== -1) {
              db[idx] = { ...db[idx], ...body };
              sessionStorage.setItem('mock_vehicles', JSON.stringify(db));
              return responseJson(db[idx]);
            }
          }
        }

        if (urlStr.includes('/api/jobcards')) {
          const db = JSON.parse(sessionStorage.getItem('mock_jobcards') || '[]');
          const customers = JSON.parse(sessionStorage.getItem('mock_customers') || '[]');
          const vehicles = JSON.parse(sessionStorage.getItem('mock_vehicles') || '[]');
          if (method === 'GET') {
            const populated = db.map(jc => ({
              ...jc,
              customerId: customers.find(c => c._id === (jc.customerId?._id || jc.customerId)) || jc.customerId,
              vehicleId: vehicles.find(v => v._id === (jc.vehicleId?._id || jc.vehicleId)) || jc.vehicleId,
              serviceAdvisorId: { name: 'Demo Advisor' }
            }));
            if (urlStr.match(/\/jobcards\/[a-zA-Z0-9_-]+$/)) {
              const id = urlStr.split('/').pop();
              return responseJson(populated.find(j => j._id === id) || populated[0]);
            }
            return responseJson(populated);
          }
          if (method === 'POST') {
            if (urlStr.includes('/photo')) {
              const parts = urlStr.split('/');
              const id = parts[parts.length - 2];
              
              const idx = db.findIndex(j => j._id === id);
              if (idx !== -1) {
                const file = body ? body.get('photo') : null;
                const photoType = body ? body.get('photoType') : 'Vehicle';
                
                let fileUrl = 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?q=80&w=600';
                
                if (file && file instanceof File) {
                  fileUrl = URL.createObjectURL(file);
                } else if (file && typeof file === 'string') {
                  fileUrl = file;
                }
                
                if (!db[idx].photos) {
                  db[idx].photos = [];
                }
                db[idx].photos.push({
                  url: fileUrl,
                  photoType
                });
                
                sessionStorage.setItem('mock_jobcards', JSON.stringify(db));
                return responseJson({ message: 'Photo uploaded successfully.', photos: db[idx].photos });
              }
              return responseJson({ error: 'Job Card not found.' }, 404);
            }

            const newItem = {
              _id: 'jc_' + Date.now(),
              jobCardNo: 'JC-20260619-' + Math.round(Math.random() * 1000).toString().padStart(3, '0'),
              date: new Date().toISOString(),
              photos: [],
              ...body
            };
            db.push(newItem);
            sessionStorage.setItem('mock_jobcards', JSON.stringify(db));
            return responseJson(newItem, 201);
          }
          if (method === 'PUT') {
            const id = urlStr.split('/').pop();
            const idx = db.findIndex(j => j._id === id);
            if (idx !== -1) {
              db[idx] = { ...db[idx], ...body };
              sessionStorage.setItem('mock_jobcards', JSON.stringify(db));
              return responseJson(db[idx]);
            }
          }
        }

        if (urlStr.includes('/api/estimates')) {
          const db = JSON.parse(sessionStorage.getItem('mock_estimates') || '[]');
          const jobcards = JSON.parse(sessionStorage.getItem('mock_jobcards') || '[]');
          if (method === 'GET') {
            let changed = false;
            const populated = db.map((est, idx) => {
              const calculations = recalculateMockTotals(est.parts, est.labour, false, false);
              if (!est.totals || est.totals.grandTotal !== calculations.totals.grandTotal) {
                db[idx].totals = calculations.totals;
                db[idx].parts = calculations.parts;
                db[idx].labour = calculations.labour;
                changed = true;
              }
              return {
                ...est,
                parts: calculations.parts,
                labour: calculations.labour,
                totals: calculations.totals,
                jobCardId: jobcards.find(j => j._id === (est.jobCardId?._id || est.jobCardId)) || est.jobCardId
              };
            });

            if (changed) {
              sessionStorage.setItem('mock_estimates', JSON.stringify(db));
            }

            if (urlStr.match(/\/estimates\/[a-zA-Z0-9_-]+$/)) {
              const id = urlStr.split('/').pop();
              return responseJson(populated.find(e => e._id === id) || populated[0]);
            }
            return responseJson(populated);
          }
          if (method === 'POST') {
            const calculations = recalculateMockTotals(body.parts, body.labour, false, false);
            const newItem = {
              _id: 'est_' + Date.now(),
              estimateNo: 'EST-20260619-' + Math.round(Math.random() * 1000).toString().padStart(3, '0'),
              date: new Date().toISOString(),
              ...body,
              parts: calculations.parts,
              labour: calculations.labour,
              totals: calculations.totals
            };
            db.push(newItem);
            sessionStorage.setItem('mock_estimates', JSON.stringify(db));
            return responseJson(newItem, 201);
          }
          if (method === 'PUT') {
            const id = urlStr.split('/').pop();
            const idx = db.findIndex(e => e._id === id);
            if (idx !== -1) {
              const merged = { ...db[idx], ...body };
              const calculations = recalculateMockTotals(merged.parts, merged.labour, false, false);
              db[idx] = {
                ...merged,
                parts: calculations.parts,
                labour: calculations.labour,
                totals: calculations.totals
              };
              sessionStorage.setItem('mock_estimates', JSON.stringify(db));
              return responseJson(db[idx]);
            }
          }
        }

        if (urlStr.includes('/api/invoices')) {
          const db = JSON.parse(sessionStorage.getItem('mock_invoices') || '[]');
          const customers = JSON.parse(sessionStorage.getItem('mock_customers') || '[]');
          const vehicles = JSON.parse(sessionStorage.getItem('mock_vehicles') || '[]');
          if (method === 'GET') {
            let changed = false;
            const populated = db.map((inv, idx) => {
              const isInterstate = inv.gstDetails?.isInterstate || false;
              const calculations = recalculateMockTotals(inv.parts, inv.labour, true, isInterstate);
              
              if (!inv.totals || inv.totals.grandTotal !== calculations.totals.grandTotal) {
                db[idx].totals = calculations.totals;
                db[idx].parts = calculations.parts;
                db[idx].labour = calculations.labour;
                changed = true;
              }

              return {
                ...inv,
                parts: calculations.parts,
                labour: calculations.labour,
                totals: calculations.totals,
                customerId: customers.find(c => c._id === (inv.customerId?._id || inv.customerId)) || inv.customerId,
                vehicleId: vehicles.find(v => v._id === (inv.vehicleId?._id || inv.vehicleId)) || inv.vehicleId,
              };
            });

            if (changed) {
              sessionStorage.setItem('mock_invoices', JSON.stringify(db));
            }

            return responseJson(populated);
          }
          if (method === 'POST') {
            const isInterstate = body.gstDetails?.isInterstate || false;
            const calculations = recalculateMockTotals(body.parts, body.labour, true, isInterstate);
            const newItem = {
              _id: 'inv_' + Date.now(),
              invoiceNo: 'INV-20260619-' + Math.round(Math.random() * 1000).toString().padStart(3, '0'),
              date: new Date().toISOString(),
              ...body,
              parts: calculations.parts,
              labour: calculations.labour,
              totals: calculations.totals,
              status: 'Draft'
            };
            db.push(newItem);
            sessionStorage.setItem('mock_invoices', JSON.stringify(db));
            return responseJson(newItem, 201);
          }
          if (method === 'PUT') {
            const id = urlStr.split('/').pop();
            const idx = db.findIndex(inv => inv._id === id);
            if (idx !== -1) {
              const merged = { ...db[idx], ...body };
              const isInterstate = merged.gstDetails?.isInterstate || false;
              const calculations = recalculateMockTotals(merged.parts, merged.labour, true, isInterstate);
              const updatedInvoice = {
                ...merged,
                parts: calculations.parts,
                labour: calculations.labour,
                totals: calculations.totals
              };

              if (body.status === 'Finalized' && db[idx].status !== 'Finalized') {
                updatedInvoice.date = new Date().toISOString();
                const inventoryDb = JSON.parse(sessionStorage.getItem('mock_inventory') || '[]');
                updatedInvoice.parts.forEach(part => {
                  if (part.partId) {
                    const itemIdx = inventoryDb.findIndex(item => item._id === part.partId);
                    if (itemIdx !== -1) {
                      inventoryDb[itemIdx].stockQuantity = Math.max(0, (inventoryDb[itemIdx].stockQuantity || 0) - (part.qty || 1));
                    }
                  }
                });
                sessionStorage.setItem('mock_inventory', JSON.stringify(inventoryDb));
                const jobcardDb = JSON.parse(sessionStorage.getItem('mock_jobcards') || '[]');
                const jcIdx = jobcardDb.findIndex(j => j._id === updatedInvoice.jobCardId);
                if (jcIdx !== -1) {
                  jobcardDb[jcIdx].status = 'Delivered';
                  sessionStorage.setItem('mock_jobcards', JSON.stringify(jobcardDb));
                }
              }
              db[idx] = updatedInvoice;
              sessionStorage.setItem('mock_invoices', JSON.stringify(db));
              return responseJson(updatedInvoice);
            }
          }
        }

        if (urlStr.includes('/api/gatepasses')) {
          const db = JSON.parse(sessionStorage.getItem('mock_gatepasses') || '[]');
          
          if (method === 'GET') {
            const parsedUrl = new URL(urlStr, window.location.origin);
            const searchQuery = parsedUrl.searchParams.get('searchQuery') || '';
            const status = parsedUrl.searchParams.get('status') || '';
            
            let filtered = [...db];
            if (status) {
              filtered = filtered.filter(gp => gp.status === status);
            }
            if (searchQuery) {
              const query = searchQuery.toLowerCase();
              filtered = filtered.filter(gp => 
                gp.gatePassNo?.toLowerCase().includes(query) ||
                gp.customerName?.toLowerCase().includes(query) ||
                gp.customerMobile?.toLowerCase().includes(query) ||
                gp.vehicleNumber?.toLowerCase().includes(query) ||
                gp.jobCardNumber?.toLowerCase().includes(query) ||
                gp.materialName?.toLowerCase().includes(query) ||
                gp.sentTo?.toLowerCase().includes(query)
              );
            }
            filtered.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
            return responseJson(filtered);
          }

          if (method === 'POST') {
            if (urlStr.includes('/print-log')) {
              const mockAudit = JSON.parse(localStorage.getItem('mock_auditlogs') || '[]');
              const id = urlStr.split('/').filter(Boolean).slice(-2, -1)[0];
              const gp = db.find(g => g._id === id);
              if (gp) {
                mockAudit.unshift({
                  _id: 'mock_log_' + Date.now(),
                  timestamp: new Date().toISOString(),
                  createdAt: new Date().toISOString(),
                  userId: user?.id || 'demo_user',
                  userName: user?.name || 'Guest/System',
                  role: user?.role || 'Guest',
                  userRole: user?.role || 'Guest',
                  module: 'GatePass',
                  action: 'GATEPASS_PRINT',
                  details: `Printed Gate Pass ${gp.gatePassNo} PDF`,
                  ipAddress: '127.0.0.1'
                });
                localStorage.setItem('mock_auditlogs', JSON.stringify(mockAudit));
                window.dispatchEvent(new Event('storage'));
              }
              return responseJson({ message: 'Print logged.' });
            }

            const today = new Date();
            const year = today.getFullYear().toString().slice(-2);
            const month = (today.getMonth() + 1).toString().padStart(2, '0');
            const day = today.getDate().toString().padStart(2, '0');
            const dateStr = `${year}${month}${day}`;
            
            const todayGps = db.filter(gp => gp.gatePassNo?.startsWith(`GP-${dateStr}-`));
            const sequence = (todayGps.length + 1).toString().padStart(3, '0');
            const gatePassNo = `GP-${dateStr}-${sequence}`;

            const newItem = {
              _id: 'gp_' + Date.now(),
              gatePassNo,
              date: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              issuedBy: user?.name || 'Staff Member',
              authorizedBy: user?.role === 'Admin' ? user.name : '',
              ...body
            };

            db.push(newItem);
            sessionStorage.setItem('mock_gatepasses', JSON.stringify(db));

            // Create notification
            const mockNotifs = JSON.parse(localStorage.getItem('mock_notifications') || '[]');
            mockNotifs.unshift({
              _id: 'mock_notif_' + Date.now(),
              type: 'gatepass',
              title: 'Gate Pass Created',
              message: `Gate Pass ${newItem.gatePassNo} has been issued for ${newItem.materialName} (${newItem.quantity} ${newItem.unit}) to ${newItem.sentTo}.`,
              vehicleNumber: newItem.vehicleNumber,
              customerName: newItem.customerName,
              status: 'unread',
              createdAt: new Date().toISOString()
            });
            localStorage.setItem('mock_notifications', JSON.stringify(mockNotifs));

            // Create audit log
            const mockAudit = JSON.parse(localStorage.getItem('mock_auditlogs') || '[]');
            mockAudit.unshift({
              _id: 'mock_log_' + Date.now(),
              timestamp: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              userId: user?.id || 'demo_user',
              userName: user?.name || 'Guest/System',
              role: user?.role || 'Guest',
              userRole: user?.role || 'Guest',
              module: 'GatePass',
              action: 'GATEPASS_CREATE',
              details: `Created Gate Pass ${newItem.gatePassNo} for vehicle ${newItem.vehicleNumber}`,
              ipAddress: '127.0.0.1'
            });
            localStorage.setItem('mock_auditlogs', JSON.stringify(mockAudit));
            window.dispatchEvent(new Event('storage'));

            return responseJson(newItem, 201);
          }

          if (method === 'PUT') {
            const id = urlStr.split('/').pop();
            const idx = db.findIndex(gp => gp._id === id);
            if (idx !== -1) {
              const oldStatus = db[idx].status;
              const updated = {
                ...db[idx],
                ...body
              };

              if (body.status === 'Returned' && oldStatus !== 'Returned') {
                updated.returnDate = body.returnDate || new Date().toISOString();
                
                // Create returned notification
                const mockNotifs = JSON.parse(localStorage.getItem('mock_notifications') || '[]');
                mockNotifs.unshift({
                  _id: 'mock_notif_' + Date.now(),
                  type: 'gatepass',
                  title: 'Material Returned',
                  message: `Materials on Gate Pass ${updated.gatePassNo} (${updated.materialName}) have been returned.`,
                  vehicleNumber: updated.vehicleNumber,
                  customerName: updated.customerName,
                  status: 'unread',
                  createdAt: new Date().toISOString()
                });
                localStorage.setItem('mock_notifications', JSON.stringify(mockNotifs));

                // Log audit action
                const mockAudit = JSON.parse(localStorage.getItem('mock_auditlogs') || '[]');
                mockAudit.unshift({
                  _id: 'mock_log_' + Date.now(),
                  timestamp: new Date().toISOString(),
                  createdAt: new Date().toISOString(),
                  userId: user?.id || 'demo_user',
                  userName: user?.name || 'Guest/System',
                  role: user?.role || 'Guest',
                  userRole: user?.role || 'Guest',
                  module: 'GatePass',
                  action: 'GATEPASS_RETURN',
                  details: `Logged material return for Gate Pass ${updated.gatePassNo}`,
                  ipAddress: '127.0.0.1'
                });
                localStorage.setItem('mock_auditlogs', JSON.stringify(mockAudit));
                window.dispatchEvent(new Event('storage'));
              } else {
                // Log standard update action
                const mockAudit = JSON.parse(localStorage.getItem('mock_auditlogs') || '[]');
                mockAudit.unshift({
                  _id: 'mock_log_' + Date.now(),
                  timestamp: new Date().toISOString(),
                  createdAt: new Date().toISOString(),
                  userId: user?.id || 'demo_user',
                  userName: user?.name || 'Guest/System',
                  role: user?.role || 'Guest',
                  userRole: user?.role || 'Guest',
                  module: 'GatePass',
                  action: 'GATEPASS_UPDATE',
                  details: `Updated Gate Pass ${updated.gatePassNo} status to ${body.status}`,
                  ipAddress: '127.0.0.1'
                });
                localStorage.setItem('mock_auditlogs', JSON.stringify(mockAudit));
                window.dispatchEvent(new Event('storage'));
              }

              db[idx] = updated;
              sessionStorage.setItem('mock_gatepasses', JSON.stringify(db));
              return responseJson(updated);
            }
          }

          if (method === 'DELETE') {
            const id = urlStr.split('/').pop();
            const gp = db.find(g => g._id === id);
            const filtered = db.filter(g => g._id !== id);
            sessionStorage.setItem('mock_gatepasses', JSON.stringify(filtered));

            if (gp) {
              const mockAudit = JSON.parse(localStorage.getItem('mock_auditlogs') || '[]');
              mockAudit.unshift({
                _id: 'mock_log_' + Date.now(),
                timestamp: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                userId: user?.id || 'demo_user',
                userName: user?.name || 'Guest/System',
                role: user?.role || 'Guest',
                userRole: user?.role || 'Guest',
                module: 'GatePass',
                action: 'GATEPASS_DELETE',
                details: `Deleted Gate Pass ${gp.gatePassNo}`,
                ipAddress: '127.0.0.1'
              });
              localStorage.setItem('mock_auditlogs', JSON.stringify(mockAudit));
              window.dispatchEvent(new Event('storage'));
            }

            return responseJson({ message: 'Gate pass deleted.' });
          }
        }

        if (urlStr.includes('/api/backlogs')) {
          const db = JSON.parse(sessionStorage.getItem('mock_backlogs') || '[]');
          
          if (method === 'GET') {
            const cleanUrl = urlStr.includes('?') ? urlStr.split('?')[0] : urlStr;
            if (cleanUrl.match(/\/backlogs\/[a-zA-Z0-9_-]+$/)) {
              const id = cleanUrl.split('/').pop();
              return responseJson(db.find(item => item._id === id) || db[0]);
            }
            
            let filteredDb = [...db];
            if (user?.role === 'Service') {
              filteredDb = filteredDb.filter(b => b.serviceAdvisorId === user?.id || b.createdBy === user?.name);
            }
            
            const searchMatch = urlStr.match(/[?&]search=([^&]*)/);
            if (searchMatch) {
              const term = decodeURIComponent(searchMatch[1]).toLowerCase();
              if (term) {
                filteredDb = filteredDb.filter(b => 
                  (b.vehicleNo && b.vehicleNo.toLowerCase().includes(term)) ||
                  (b.jobCardNo && b.jobCardNo.toLowerCase().includes(term)) ||
                  (b.partNumber && b.partNumber.toLowerCase().includes(term)) ||
                  (b.partName && b.partName.toLowerCase().includes(term)) ||
                  (b.vendorName && b.vendorName.toLowerCase().includes(term)) ||
                  (b.customerName && b.customerName.toLowerCase().includes(term))
                );
              }
            }
            
            return responseJson(filteredDb);
          }
          
          if (method === 'POST') {
            const prefix = `BL-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-`;
            const count = db.filter(b => b.backlogId?.startsWith(prefix)).length;
            const sequence = String(count + 1).padStart(4, '0');
            const backlogId = `${prefix}${sequence}`;
            
            const newItem = {
              _id: 'bl_' + Date.now(),
              backlogId,
              status: 'Pending Order',
              createdBy: user?.name || 'Staff Member',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              ...body
            };
            
            db.unshift(newItem);
            sessionStorage.setItem('mock_backlogs', JSON.stringify(db));
            
            const mockAudit = JSON.parse(localStorage.getItem('mock_auditlogs') || '[]');
            mockAudit.unshift({
              _id: 'mock_log_' + Date.now(),
              timestamp: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              userId: user?.id || 'demo_user',
              userName: user?.name || 'Guest/System',
              role: user?.role || 'Guest',
              userRole: user?.role || 'Guest',
              module: 'Backlog',
              action: 'BACKLOG_CREATE',
              details: `Created backlog request ${newItem.backlogId} for Part ${newItem.partName}`,
              ipAddress: '127.0.0.1'
            });
            localStorage.setItem('mock_auditlogs', JSON.stringify(mockAudit));
            window.dispatchEvent(new Event('storage'));
            
            return responseJson(newItem, 201);
          }
          
          if (method === 'PUT') {
            const cleanUrl = urlStr.includes('?') ? urlStr.split('?')[0] : urlStr;
            const id = cleanUrl.split('/').pop();
            
            if (urlStr.includes('/receive')) {
              const backlogIdFromUrl = cleanUrl.split('/receive')[0].split('/').pop();
              const idx = db.findIndex(b => b._id === backlogIdFromUrl);
              if (idx !== -1) {
                db[idx].status = 'Received';
                db[idx].receivedDate = new Date().toISOString();
                db[idx].lastUpdatedBy = user?.name || 'Staff';
                
                const invDb = JSON.parse(sessionStorage.getItem('mock_inventory') || '[]');
                const pIdx = invDb.findIndex(p => p.partNumber === db[idx].partNumber);
                if (pIdx !== -1) {
                  invDb[pIdx].stockQuantity = (invDb[pIdx].stockQuantity || 0) + Number(db[idx].qty);
                } else {
                  invDb.push({
                    _id: 'inv_' + Date.now(),
                    partName: db[idx].partName,
                    partNumber: db[idx].partNumber,
                    hsnCode: '8708',
                    stockQuantity: Number(db[idx].qty),
                    purchasePrice: 0,
                    sellingPrice: 0,
                    gstPercent: 18,
                    brand: db[idx].brand || '',
                    warehouse: 'Main Store'
                  });
                }
                sessionStorage.setItem('mock_inventory', JSON.stringify(invDb));
                
                const purchasesDb = JSON.parse(sessionStorage.getItem('mock_purchases') || '[]');
                const mockPurNo = `PUR-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${purchasesDb.length + 1}`;
                purchasesDb.unshift({
                  _id: 'pur_' + Date.now(),
                  purchaseNo: mockPurNo,
                  vendorName: db[idx].vendorName,
                  date: new Date().toISOString(),
                  invoiceNo: db[idx].poNumber || `RCV-${db[idx].backlogId}`,
                  invoiceDate: new Date().toISOString(),
                  items: [{
                    partNumber: db[idx].partNumber,
                    partName: db[idx].partName,
                    qty: db[idx].qty,
                    purchasePrice: 0,
                    sellingPrice: 0,
                    gstPercent: 18,
                    total: 0
                  }],
                  totals: {
                    totalQty: db[idx].qty,
                    grandTotal: 0
                  },
                  paymentStatus: 'Paid',
                  amountPaid: 0,
                  notes: db[idx].remarks || `Received from Backlog ${db[idx].backlogId}`,
                  createdBy: user?.name || 'Staff'
                });
                sessionStorage.setItem('mock_purchases', JSON.stringify(purchasesDb));
                
                sessionStorage.setItem('mock_backlogs', JSON.stringify(db));
                
                const mockAudit = JSON.parse(localStorage.getItem('mock_auditlogs') || '[]');
                mockAudit.unshift({
                  _id: 'mock_log_' + Date.now(),
                  timestamp: new Date().toISOString(),
                  createdAt: new Date().toISOString(),
                  userId: user?.id || 'demo_user',
                  userName: user?.name || 'Guest/System',
                  role: user?.role || 'Guest',
                  userRole: user?.role || 'Guest',
                  module: 'Backlog',
                  action: 'BACKLOG_RECEIVE',
                  details: `Received backlog parts for request ${db[idx].backlogId}. Restocked ${db[idx].qty} units of ${db[idx].partName}`,
                  ipAddress: '127.0.0.1'
                });
                localStorage.setItem('mock_auditlogs', JSON.stringify(mockAudit));
                window.dispatchEvent(new Event('storage'));
                
                return responseJson(db[idx]);
              }
              return responseJson({ error: 'Backlog not found' }, 404);
            }
            
            const idx = db.findIndex(b => b._id === id);
            if (idx !== -1) {
              db[idx] = { ...db[idx], ...body, lastUpdatedBy: user?.name || 'Staff' };
              sessionStorage.setItem('mock_backlogs', JSON.stringify(db));
              return responseJson(db[idx]);
            }
            return responseJson({ error: 'Backlog not found' }, 404);
          }
          
          if (method === 'DELETE') {
            const id = urlStr.split('/').pop();
            const backlog = db.find(b => b._id === id);
            const filtered = db.filter(b => b._id !== id);
            sessionStorage.setItem('mock_backlogs', JSON.stringify(filtered));
            
            if (backlog) {
              const mockAudit = JSON.parse(localStorage.getItem('mock_auditlogs') || '[]');
              mockAudit.unshift({
                _id: 'mock_log_' + Date.now(),
                timestamp: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                userId: user?.id || 'demo_user',
                userName: user?.name || 'Guest/System',
                role: user?.role || 'Guest',
                userRole: user?.role || 'Guest',
                module: 'Backlog',
                action: 'BACKLOG_DELETE',
                details: `Deleted backlog entry ${backlog.backlogId}`,
                ipAddress: '127.0.0.1'
              });
              localStorage.setItem('mock_auditlogs', JSON.stringify(mockAudit));
              window.dispatchEvent(new Event('storage'));
            }
            return responseJson({ message: 'Backlog entry deleted.' });
          }
        }

        if (urlStr.includes('/api/inventory')) {
          const db = JSON.parse(sessionStorage.getItem('mock_inventory') || '[]');
          
          if (urlStr.includes('/purchase')) {
            if (method === 'POST') {
              const { partNumber, quantityToAdd, purchasePrice, sellingPrice } = body;
              const idx = db.findIndex(item => item.partNumber === partNumber);
              if (idx !== -1) {
                db[idx].stockQuantity = (db[idx].stockQuantity || 0) + Number(quantityToAdd || 0);
                if (purchasePrice) db[idx].purchasePrice = Number(purchasePrice);
                if (sellingPrice) db[idx].sellingPrice = Number(sellingPrice);
                sessionStorage.setItem('mock_inventory', JSON.stringify(db));
                return responseJson(db[idx]);
              }
              return responseJson({ error: 'Part not found' }, 404);
            }
          }
          
          if (method === 'GET') {
            const hasParams = urlStr.includes('?');
            const cleanUrl = hasParams ? urlStr.split('?')[0] : urlStr;
            
            if (cleanUrl.match(/\/inventory\/[a-zA-Z0-9_-]+$/)) {
              const id = cleanUrl.split('/').pop();
              return responseJson(db.find(item => item._id === id) || db[0]);
            }
            
            let filteredDb = [...db];
            const searchMatch = urlStr.match(/[?&]search=([^&]*)/);
            const lowStockMatch = urlStr.match(/[?&]lowStock=([^&]*)/);
            
            if (searchMatch) {
              const term = decodeURIComponent(searchMatch[1]).toLowerCase();
              if (term) {
                filteredDb = filteredDb.filter(item => 
                  (item.partName && item.partName.toLowerCase().includes(term)) ||
                  (item.partNumber && item.partNumber.toLowerCase().includes(term)) ||
                  (item.hsnCode && item.hsnCode.toLowerCase().includes(term)) ||
                  (item.brand && item.brand.toLowerCase().includes(term)) ||
                  (item.model && item.model.toLowerCase().includes(term)) ||
                  (item.variant && item.variant.toLowerCase().includes(term))
                );
              }
            }
            
            if (lowStockMatch && lowStockMatch[1] === 'true') {
              filteredDb = filteredDb.filter(item => 
                item.stockQuantity <= item.lowStockThreshold
              );
            }
            
            return responseJson(filteredDb);
          }
          
          if (method === 'POST') {
            const newItem = {
              _id: 'inv_' + Date.now(),
              partName: body.partName,
              partNumber: body.partNumber,
              hsnCode: body.hsnCode,
              brand: body.brand || '',
              model: body.model || '',
              variant: body.variant || '',
              stockQuantity: Number(body.stockQuantity || 0),
              lowStockThreshold: Number(body.lowStockThreshold || 5),
              purchasePrice: Number(body.purchasePrice || 0),
              sellingPrice: Number(body.sellingPrice || 0),
              gstPercent: Number(body.gstPercent || 18)
            };
            db.push(newItem);
            sessionStorage.setItem('mock_inventory', JSON.stringify(db));
            return responseJson(newItem, 201);
          }

          if (method === 'PUT') {
            const id = urlStr.split('/').pop();
            const idx = db.findIndex(item => item._id === id);
            if (idx !== -1) {
              db[idx] = { ...db[idx], ...body };
              sessionStorage.setItem('mock_inventory', JSON.stringify(db));
              return responseJson(db[idx]);
            }
          }
        }

        if (urlStr.includes('/api/employees')) {
          const db = JSON.parse(sessionStorage.getItem('mock_employees') || '[]');
          
          if (method === 'GET') {
            return responseJson(db);
          }

          if (method === 'POST') {
            // Check if attendance request
            if (urlStr.includes('/attendance')) {
              const parts = urlStr.split('/');
              const id = parts[parts.length - 2];
              const idx = db.findIndex(emp => emp._id === id);
              if (idx !== -1) {
                const { date, status } = body;
                const attendanceDate = new Date(date).toISOString().substring(0, 10);
                if (!db[idx].attendance) db[idx].attendance = [];
                db[idx].attendance = db[idx].attendance.filter(a => {
                  const d = new Date(a.date).toISOString().substring(0, 10);
                  return d !== attendanceDate;
                });
                db[idx].attendance.push({ date: new Date(date).toISOString(), status });
                sessionStorage.setItem('mock_employees', JSON.stringify(db));
                return responseJson(db[idx]);
              }
              return responseJson({ error: 'Employee not found' }, 404);
            }

            // Check if salary request
            if (urlStr.includes('/salary')) {
              const parts = urlStr.split('/');
              const id = parts[parts.length - 2];
              const idx = db.findIndex(emp => emp._id === id);
              if (idx !== -1) {
                const { monthYear, basicSalary, advances, deductions, specialAllowance, otherAllowance, otherAllowanceDescription, deductionsDescription } = body;
                
                let leavesCount = 0;
                db[idx].attendance?.forEach(a => {
                  const dateStr = new Date(a.date).toISOString().substring(0, 7);
                  if (dateStr === monthYear) {
                    if (a.status === 'Absent' || a.status === 'Leave') {
                      leavesCount += 1;
                    } else if (a.status === 'Half Day') {
                      leavesCount += 0.5;
                    }
                  }
                });

                const basic = Number(basicSalary) || 0;
                const adv = Number(advances) || 0;
                const extraDeduct = Number(deductions) || 0;
                const special = Number(specialAllowance) || 0;
                const other = Number(otherAllowance) || 0;

                const leaveDeduction = (basic / 30) * leavesCount;
                const netSalary = Math.round(Math.max(0, basic + special + other - adv - extraDeduct - leaveDeduction));

                if (!db[idx].salaries) db[idx].salaries = [];
                db[idx].salaries = db[idx].salaries.filter(s => s.monthYear !== monthYear);
                db[idx].salaries.push({
                  monthYear,
                  basicSalary: basic,
                  leaves: leavesCount,
                  advances: adv,
                  deductions: extraDeduct,
                  deductionsDescription: deductionsDescription || '',
                  specialAllowance: special,
                  otherAllowance: other,
                  otherAllowanceDescription: otherAllowanceDescription || '',
                  netSalary,
                  generatedAt: new Date().toISOString()
                });
                sessionStorage.setItem('mock_employees', JSON.stringify(db));
                return responseJson(db[idx]);
              }
              return responseJson({ error: 'Employee not found' }, 404);
            }

            // Otherwise, add a new employee
            const phoneVal = body && typeof body.get === 'function' ? body.get('phone') : body?.phone;
            const phoneRegex = /^[6-9]\d{9}$/;
            if (phoneVal && !phoneRegex.test(phoneVal)) {
              return responseJson({ error: 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.' }, 400);
            }
            let newEmp = {};
            if (body && typeof body.get === 'function') {
              const file = body.get('resume');
              let fileUrl = '';
              if (file && file instanceof File) {
                fileUrl = await readFileAsDataURL(file);
              }
              newEmp = {
                _id: 'emp_' + Date.now(),
                name: body.get('name'),
                email: body.get('email'),
                phone: body.get('phone'),
                dateOfJoining: body.get('dateOfJoining'),
                basicDetails: body.get('basicDetails'),
                aadharNumber: body.get('aadharNumber'),
                resumeUrl: fileUrl,
                status: body.get('status') || 'Active',
                attendance: [],
                salaries: []
              };
            } else {
              newEmp = {
                _id: 'emp_' + Date.now(),
                name: body?.name || '',
                email: body?.email || '',
                phone: body?.phone || '',
                dateOfJoining: body?.dateOfJoining || new Date().toISOString(),
                basicDetails: body?.basicDetails || '',
                aadharNumber: body?.aadharNumber || '',
                resumeUrl: '',
                status: body?.status || 'Active',
                attendance: [],
                salaries: []
              };
            }
            db.push(newEmp);
            sessionStorage.setItem('mock_employees', JSON.stringify(db));
            return responseJson(newEmp, 201);
          }

          if (method === 'PUT') {
            const id = urlStr.split('/').pop();
            const idx = db.findIndex(emp => emp._id === id);
            if (idx !== -1) {
              const phoneVal = body && typeof body.get === 'function' ? body.get('phone') : body?.phone;
              const phoneRegex = /^[6-9]\d{9}$/;
              if (phoneVal && !phoneRegex.test(phoneVal)) {
                return responseJson({ error: 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.' }, 400);
              }
              let updatedFields = {};
              if (body && typeof body.get === 'function') {
                const file = body.get('resume');
                let fileUrl = db[idx].resumeUrl || '';
                if (file && file instanceof File) {
                  fileUrl = await readFileAsDataURL(file);
                }
                updatedFields = {
                  name: body.get('name'),
                  email: body.get('email'),
                  phone: body.get('phone'),
                  dateOfJoining: body.get('dateOfJoining'),
                  basicDetails: body.get('basicDetails'),
                  aadharNumber: body.get('aadharNumber'),
                  status: body.get('status'),
                  resumeUrl: fileUrl
                };
                Object.keys(updatedFields).forEach(key => {
                  if (updatedFields[key] === undefined || updatedFields[key] === null) {
                    delete updatedFields[key];
                  }
                });
              } else {
                updatedFields = body;
              }
              db[idx] = { ...db[idx], ...updatedFields };
              sessionStorage.setItem('mock_employees', JSON.stringify(db));
              return responseJson(db[idx]);
            }
            return responseJson({ error: 'Employee not found' }, 404);
          }
        }

        if (urlStr.includes('/api/customers/search')) {
          const urlObj = new URL(urlStr, window.location.origin);
          const q = (urlObj.searchParams.get('q') || '').trim();
          if (!q || q.length < 2) {
            return responseJson([]);
          }

          const customers = JSON.parse(sessionStorage.getItem('mock_customers') || '[]');
          const vehicles = JSON.parse(sessionStorage.getItem('mock_vehicles') || '[]');

          const resultsMap = new Map();

          // Search customers by name or mobile
          const matchedCustomers = customers.filter(c => 
            (c.name && c.name.toLowerCase().includes(q.toLowerCase())) ||
            (c.mobile && c.mobile.toLowerCase().includes(q.toLowerCase()))
          );

          // Helper to add unique entry
          const addResult = (cust, veh) => {
            if (!cust) return;
            const key = `${cust._id}_${veh ? veh._id : 'no_vehicle'}`;
            if (!resultsMap.has(key)) {
              resultsMap.set(key, {
                customerId: cust._id,
                customerName: cust.name,
                mobile: cust.mobile,
                vehicleId: veh ? veh._id : null,
                vehicleNumber: veh ? veh.vehicleNumber : '',
                vehicleModel: veh ? `${veh.make} ${veh.model}` : ''
              });
            }
          };

          // Add direct customer matches
          matchedCustomers.forEach(cust => {
            const custId = cust._id;
            const custVehs = vehicles.filter(v => {
              const vCustId = typeof v.customerId === 'object' ? v.customerId?._id : v.customerId;
              return vCustId === custId;
            });
            if (custVehs.length > 0) {
              custVehs.forEach(veh => addResult(cust, veh));
            } else {
              addResult(cust, null);
            }
          });

          // Search directly by Vehicle Number
          const matchedVehiclesByNo = vehicles.filter(v => 
            v.vehicleNumber && v.vehicleNumber.toLowerCase().includes(q.toLowerCase())
          );
          matchedVehiclesByNo.forEach(veh => {
            const custId = typeof veh.customerId === 'object' ? veh.customerId?._id : veh.customerId;
            const cust = customers.find(c => c._id === custId) || veh.customerId;
            addResult(cust, veh);
          });

          return responseJson(Array.from(resultsMap.values()));
        }

        if (urlStr.includes('/api/claims')) {
          const db = JSON.parse(sessionStorage.getItem('mock_claims') || '[]');
          const customers = JSON.parse(sessionStorage.getItem('mock_customers') || '[]');
          const vehicles = JSON.parse(sessionStorage.getItem('mock_vehicles') || '[]');
          const invoices = JSON.parse(sessionStorage.getItem('mock_invoices') || '[]');

          if (method === 'GET') {
            if (urlStr.match(/\/claims\/[a-zA-Z0-9_-]+$/)) {
              const id = urlStr.split('/').pop();
              const claim = db.find(c => c._id === id);
              if (claim) {
                return responseJson({
                  ...claim,
                  customerId: customers.find(c => c._id === (claim.customerId?._id || claim.customerId)) || claim.customerId,
                  vehicleId: vehicles.find(v => v._id === (claim.vehicleId?._id || claim.vehicleId)) || claim.vehicleId,
                  invoiceId: invoices.find(i => i._id === (claim.invoiceId?._id || claim.invoiceId)) || claim.invoiceId,
                });
              }
              return responseJson({ error: 'Claim not found' }, 404);
            }

            // List claims (filter by status)
            const urlObj = new URL(urlStr, window.location.origin);
            const statusVal = urlObj.searchParams.get('status') || '';
            let filteredClaims = db.map(claim => ({
              ...claim,
              customerId: customers.find(c => c._id === (claim.customerId?._id || claim.customerId)) || claim.customerId,
              vehicleId: vehicles.find(v => v._id === (claim.vehicleId?._id || claim.vehicleId)) || claim.vehicleId,
              invoiceId: invoices.find(i => i._id === (claim.invoiceId?._id || claim.invoiceId)) || claim.invoiceId,
            }));
            if (statusVal) {
              filteredClaims = filteredClaims.filter(c => c.status === statusVal);
            }
            return responseJson(filteredClaims);
          }

          if (method === 'POST') {
            if (urlStr.includes('/upload')) {
              const parts = urlStr.split('/');
              const id = parts[parts.length - 2];
              const idx = db.findIndex(c => c._id === id);
              if (idx !== -1) {
                const file = body ? body.get('document') : null;
                const name = body ? body.get('name') : 'Document';
                const fileUrl = file && file instanceof File ? URL.createObjectURL(file) : 'https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?q=80&w=400';
                
                if (!db[idx].documents) db[idx].documents = [];
                db[idx].documents.push({
                  name,
                  url: fileUrl,
                  uploadedAt: new Date().toISOString()
                });
                sessionStorage.setItem('mock_claims', JSON.stringify(db));
                return responseJson({ message: 'Document uploaded.', documents: db[idx].documents });
              }
              return responseJson({ error: 'Claim not found.' }, 404);
            }

            const newClaim = {
              _id: 'claim_' + Date.now(),
              claimNo: body.claimNo || 'CLM-' + Date.now(),
              documents: [],
              status: body.status || 'Claim Submitted',
              createdAt: new Date().toISOString(),
              ...body
            };
            db.push(newClaim);
            sessionStorage.setItem('mock_claims', JSON.stringify(db));
            
            const populatedClaim = {
              ...newClaim,
              customerId: customers.find(c => c._id === (newClaim.customerId?._id || newClaim.customerId)) || newClaim.customerId,
              vehicleId: vehicles.find(v => v._id === (newClaim.vehicleId?._id || newClaim.vehicleId)) || newClaim.vehicleId,
              invoiceId: invoices.find(i => i._id === (newClaim.invoiceId?._id || newClaim.invoiceId)) || newClaim.invoiceId,
            };
            return responseJson(populatedClaim, 201);
          }

          if (method === 'PUT') {
            const id = urlStr.split('/').pop();
            const idx = db.findIndex(c => c._id === id);
            if (idx !== -1) {
              db[idx] = { ...db[idx], ...body };
              sessionStorage.setItem('mock_claims', JSON.stringify(db));
              
              const updated = db[idx];
              const populatedClaim = {
                ...updated,
                customerId: customers.find(c => c._id === (updated.customerId?._id || updated.customerId)) || updated.customerId,
                vehicleId: vehicles.find(v => v._id === (updated.vehicleId?._id || updated.vehicleId)) || updated.vehicleId,
                invoiceId: invoices.find(i => i._id === (updated.invoiceId?._id || updated.invoiceId)) || updated.invoiceId,
              };
              return responseJson(populatedClaim);
            }
            return responseJson({ error: 'Claim not found.' }, 404);
          }
        }

        if (urlStr.includes('/api/dashboard/auditlogs')) {
          if (options?.method === 'POST') {
            const body = JSON.parse(options.body || '{}');
            const db = JSON.parse(localStorage.getItem('mock_auditlogs') || '[]');
            const newLog = {
              _id: 'mock_log_' + Date.now(),
              timestamp: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              userId: user?.id || 'demo_user',
              userName: user?.name || 'Guest/System',
              role: user?.role || 'Guest',
              userRole: user?.role || 'Guest',
              module: body.action?.includes('LOGIN') || body.action?.includes('LOGOUT') ? 'Auth' : (body.action?.split('_')[0]?.charAt(0) + body.action?.split('_')[0]?.slice(1)?.toLowerCase() || 'System'),
              action: body.action,
              details: body.details,
              ipAddress: '127.0.0.1'
            };
            db.unshift(newLog);
            localStorage.setItem('mock_auditlogs', JSON.stringify(db));
            window.dispatchEvent(new Event('storage'));
            return responseJson({ message: 'Audit log created.' });
          }

          const db = JSON.parse(localStorage.getItem('mock_auditlogs') || '[]');
          const parsedUrl = new URL(urlStr, window.location.origin);
          const userName = parsedUrl.searchParams.get('userName');
          const role = parsedUrl.searchParams.get('role');
          const moduleName = parsedUrl.searchParams.get('moduleName');
          const action = parsedUrl.searchParams.get('action');
          const startDate = parsedUrl.searchParams.get('startDate');
          const endDate = parsedUrl.searchParams.get('endDate');
          const search = parsedUrl.searchParams.get('search');
          const page = parseInt(parsedUrl.searchParams.get('page'), 10) || 1;
          const limit = parseInt(parsedUrl.searchParams.get('limit'), 10) || 25;

          let filtered = [...db];
          if (userName) {
            filtered = filtered.filter(l => l.userName?.toLowerCase().includes(userName.toLowerCase()));
          }
          if (role) {
            filtered = filtered.filter(l => (l.role || l.userRole)?.toLowerCase() === role.toLowerCase());
          }
          if (moduleName) {
            filtered = filtered.filter(l => l.module?.toLowerCase() === moduleName.toLowerCase());
          }
          if (action) {
            filtered = filtered.filter(l => l.action?.toLowerCase().includes(action.toLowerCase()));
          }
          if (startDate) {
            filtered = filtered.filter(l => new Date(l.createdAt) >= new Date(startDate));
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            filtered = filtered.filter(l => new Date(l.createdAt) <= end);
          }
          if (search) {
            const query = search.toLowerCase();
            filtered = filtered.filter(l => 
              l.userName?.toLowerCase().includes(query) ||
              l.action?.toLowerCase().includes(query) ||
              l.module?.toLowerCase().includes(query) ||
              l.details?.toLowerCase().includes(query) ||
              l.ipAddress?.toLowerCase().includes(query)
            );
          }

          const skip = (page - 1) * limit;
          const paginated = filtered.slice(skip, skip + limit);

          return responseJson({
            logs: paginated,
            totalPages: Math.ceil(filtered.length / limit),
            currentPage: page,
            totalCount: filtered.length
          });
        }

        return originalFetch(url, options);
      };

      return () => {
        window.fetch = originalFetch;
      };
    }
  }, [token, user]);

  // Load user profile if token is available
  const loadProfile = async (sessionToken) => {
    if (sessionToken === 'mock_jwt_token_for_offline_demo') {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/auth/profile`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        localStorage.setItem('user', JSON.stringify(data));
      } else {
        // Token expired/invalid, clear session
        console.warn('Session token invalid, logging out.');
        await handleLogout('/login');
      }
    } catch (err) {
      console.error('Failed to authenticate session:', err);
      // Clear session on connection/authentication failure for safety
      await handleLogout('/login');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    // Default to light theme if no theme has been saved yet
    const savedTheme = localStorage.getItem('theme');
    if (!savedTheme) {
      localStorage.setItem('theme', 'light');
    }
    
    // Apply the active theme on boot
    const activeTheme = localStorage.getItem('theme') || 'light';
    if (activeTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }

    if (token) {
      loadProfile(token);
    } else {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (user && !loading) {
      const userRole = user.role || 'Guest';
      const permitted = tabPermissions[activeTab]?.includes(userRole) ?? true;
      if (!permitted) {
        let defaultTab = 'dashboard';
        if (user.role === 'Service') {
          defaultTab = 'jobcards';
        } else if (user.role === 'Spares') {
          defaultTab = 'inventory';
        } else if (user.role === 'Body Shop') {
          defaultTab = 'jobcards';
        }
        setActiveTab(defaultTab);
      }
    }
  }, [user, activeTab, loading]);

  const handleLoginSuccess = (loginUser, loginToken) => {
    localStorage.setItem('token', loginToken);
    localStorage.setItem('user', JSON.stringify(loginUser));
    setToken(loginToken);
    setUser(loginUser);
    
    let defaultTab = 'dashboard';
    if (loginUser?.role === 'Service') {
      defaultTab = 'jobcards';
    } else if (loginUser?.role === 'Spares') {
      defaultTab = 'inventory';
    } else if (loginUser?.role === 'Body Shop') {
      defaultTab = 'jobcards';
    }
    setActiveTab(defaultTab);
  };

  const handleLogout = async (redirectTo = '/', useReplace = true) => {
    try {
      if (token && token !== 'mock_jwt_token_for_offline_demo') {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (e) {
      console.warn('API logout failed:', e);
    }
    
    // Log local mock activity for demo mode
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
        module: 'Auth',
        action: 'USER_LOGOUT',
        details: `User ${user.email} logged out successfully`,
        ipAddress: '127.0.0.1'
      });
      localStorage.setItem('mock_auditlogs', JSON.stringify(mockLogs));
      window.dispatchEvent(new Event('storage'));
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    navigate(redirectTo, { replace: useReplace });
  };

  const handleNavigateToJobCard = (jcId) => {
    setViewJcId(jcId);
    setActiveTab('jobcards');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 font-semibold text-sm">
        Loading AutoWorkshop Pro shell...
      </div>
    );
  }

  return (
    <Routes>
      <Route 
        path="/" 
        element={
          <LandingPageWrapper 
            onLoginSuccess={handleLoginSuccess} 
            onStaffLoginClick={() => handleLogout('/login', false)} 
          />
        } 
      />
      <Route path="/login" element={<LoginWrapper token={token} user={user} onLoginSuccess={handleLoginSuccess} />} />
      <Route 
        path="/*" 
        element={
          <ProtectedRoute token={token} user={user}>
            <ERPShell 
              user={user}
              token={token}
              handleLogout={handleLogout}
              sidebarOpen={sidebarOpen}
              setSidebarOpen={setSidebarOpen}
              isCollapsed={isCollapsed}
              setIsCollapsed={setIsCollapsed}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              viewJcId={viewJcId}
              setViewJcId={setViewJcId}
              handleNavigateToJobCard={handleNavigateToJobCard}
              tabPermissions={tabPermissions}
            />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
}

// Helper Routing Components
function ProtectedRoute({ children, token, user }) {
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function getRedirectPath(role) {
  if (role === 'Spares') return '/inventory';
  if (role === 'Accounts') return '/customers';
  if (role === 'Body Shop') return '/job-cards';
  return '/dashboard'; // Default to dashboard for Admin, Service, Reception
}

function LoginWrapper({ token, user, onLoginSuccess }) {
  if (token && user) {
    return <Navigate to={getRedirectPath(user.role)} replace />;
  }
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-[1250px] bg-white rounded-[24px] shadow-2xl overflow-hidden flex flex-col border border-slate-200/50 animate-scale-up">
        <Login onLoginSuccess={onLoginSuccess} />
      </div>
    </div>
  );
}

function LandingPageWrapper({ onLoginSuccess, onStaffLoginClick }) {
  const navigate = useNavigate();

  const handleLandingLoginSuccess = (loginUser, loginToken) => {
    onLoginSuccess(loginUser, loginToken);
    navigate(getRedirectPath(loginUser.role));
  };

  return (
    <LandingPage 
      onLoginSuccess={handleLandingLoginSuccess} 
      onStaffLoginClick={onStaffLoginClick} 
    />
  );
}

function ERPShell({ 
  user, 
  token, 
  handleLogout, 
  sidebarOpen, 
  setSidebarOpen, 
  isCollapsed, 
  setIsCollapsed, 
  activeTab, 
  setActiveTab, 
  viewJcId, 
  setViewJcId, 
  handleNavigateToJobCard, 
  tabPermissions 
}) {
  const navigate = useNavigate();
  const location = useLocation();

  // Sync activeTab state based on current URL path
  useEffect(() => {
    const path = location.pathname;
    if (path === '/dashboard') setActiveTab('dashboard');
    else if (path === '/customers') setActiveTab('customers');
    else if (path === '/vehicles') setActiveTab('vehicles');
    else if (path === '/body-shop') setActiveTab('bodyshop');
    else if (path === '/job-cards') setActiveTab('jobcards');
    else if (path === '/estimates') setActiveTab('estimates');
    else if (path === '/invoices') setActiveTab('invoices');
    else if (path === '/inventory') setActiveTab('inventory');
    else if (path === '/stockstatement' || path === '/inventory/statement') setActiveTab('stockstatement');
    else if (path === '/vendors' || path === '/inventory/vendors') setActiveTab('vendors');
    else if (path === '/adjustments' || path === '/inventory/adjustments') setActiveTab('adjustments');
    else if (path === '/inventoryreports' || path === '/inventory/reports') setActiveTab('inventoryreports');
    else if (path === '/purchasereport' || path === '/inventory/purchase-report' || path === '/purchases' || path === '/inventory/purchases') setActiveTab('purchases');
    else if (path === '/backlogs' || path === '/inventory/backlogs') setActiveTab('backlogs');
    else if (path === '/expenses' || path === '/inventory/expenses') setActiveTab('expenses');
    else if (path === '/external-repairs') setActiveTab('externalrepairs');
    else if (path === '/employees') setActiveTab('employees');
    else if (path === '/claims') setActiveTab('claims');
    else if (path === '/reports') setActiveTab('reports');
    else if (path === '/audit-logs') setActiveTab('auditlogs');
    else if (path === '/gate-pass') setActiveTab('gatepass');
    else if (path === '/servicehistory') setActiveTab('servicehistory');
    else if (path === '/insurance') setActiveTab('insurance');
  }, [location, setActiveTab]);

  const userRole = user?.role || 'Guest';

  const getPathTab = (pathname) => {
    const cleanPath = pathname.toLowerCase();
    if (cleanPath === '/dashboard') return 'dashboard';
    if (cleanPath === '/customers') return 'customers';
    if (cleanPath === '/vehicles') return 'vehicles';
    if (cleanPath === '/body-shop') return 'bodyshop';
    if (cleanPath === '/job-cards') return 'jobcards';
    if (cleanPath === '/estimates') return 'estimates';
    if (cleanPath === '/invoices') return 'invoices';
    if (cleanPath === '/inventory') return 'inventory';
    if (cleanPath === '/stockstatement' || cleanPath === '/inventory/statement') return 'stockstatement';
    if (cleanPath === '/vendors' || cleanPath === '/inventory/vendors') return 'vendors';
    if (cleanPath === '/adjustments' || cleanPath === '/inventory/adjustments') return 'adjustments';
    if (cleanPath === '/inventoryreports' || cleanPath === '/inventory/reports') return 'inventoryreports';
    if (cleanPath === '/purchasereport' || cleanPath === '/inventory/purchase-report' || cleanPath === '/purchases' || cleanPath === '/inventory/purchases') return 'purchases';
    if (cleanPath === '/backlogs' || cleanPath === '/inventory/backlogs') return 'backlogs';
    if (cleanPath === '/expenses' || cleanPath === '/inventory/expenses') return 'expenses';
    if (cleanPath === '/external-repairs') return 'externalrepairs';
    if (cleanPath === '/employees') return 'employees';
    if (cleanPath === '/claims') return 'claims';
    if (cleanPath === '/reports') return 'reports';
    if (cleanPath === '/audit-logs') return 'auditlogs';
    if (cleanPath === '/gate-pass') return 'gatepass';
    if (cleanPath === '/servicehistory') return 'servicehistory';
    if (cleanPath === '/insurance') return 'insurance';
    return '';
  };

  const pathTab = getPathTab(location.pathname);
  const isPathBlocked = pathTab ? !(tabPermissions[pathTab]?.includes(userRole) ?? true) : false;

  const navigationItems = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, roles: ['Admin', 'Service', 'Reception', 'Accounts', 'Accounts Executive'] },
    { id: 'bodyshop', name: 'Body Shop', icon: Wrench, roles: ['Admin'] },
    { id: 'customers', name: 'Customers', icon: Users, roles: ['Admin', 'Accounts', 'Service', 'Body Shop', 'Reception'] },
    { id: 'vehicles', name: 'Vehicles', icon: Car, roles: ['Admin', 'Service', 'Body Shop', 'Reception'] },
    { id: 'jobcards', name: 'Job Cards', icon: FileText, roles: ['Admin', 'Service', 'Body Shop', 'Reception'] },
    { id: 'estimates', name: 'Estimates', icon: FileCheck, roles: ['Admin', 'Service', 'Body Shop', 'Accounts Executive'] },
    { id: 'invoices', name: 'Invoices', icon: Receipt, roles: ['Admin', 'Accounts', 'Accounts Executive'] },
    { id: 'inventory', name: 'Inventory', icon: Package, roles: ['Admin', 'Spares'] },
    { id: 'purchases', name: 'Purchases', icon: ShoppingBag, roles: ['Admin', 'Spares'] },
    { id: 'expenses', name: 'Expenses', icon: Wallet, roles: ['Admin', 'Accounts', 'Service', 'Spares'] },
    { id: 'externalrepairs', name: 'External Repairs', icon: Wrench, roles: ['Admin', 'Service', 'Body Shop'] },
    { id: 'employees', name: 'Employees', icon: Users, roles: ['Admin'] },
    { id: 'claims', name: 'Claims', icon: ShieldCheck, roles: ['Admin', 'Service', 'Body Shop', 'Accounts Executive'] },
    { id: 'reports', name: 'Reports', icon: TrendingUp, roles: ['Admin', 'Service', 'Body Shop', 'Accounts', 'Accounts Executive'] },
    { id: 'auditlogs', name: 'Audit Logs', icon: History, roles: ['Admin'] },
    { id: 'gatepass', name: 'Gate Pass', icon: Key, roles: ['Admin', 'Service', 'Body Shop', 'Accounts Executive'] }
  ];

  const filteredNavItems = navigationItems.filter(item => item.roles.includes(userRole));
  const showMoreButton = filteredNavItems.length > 4;
  const primaryMobileItems = showMoreButton ? filteredNavItems.slice(0, 4) : filteredNavItems;
  const isMoreActive = showMoreButton && !primaryMobileItems.some(item => item.id === activeTab);

  return (
    <div className="flex bg-[#F8FAFC] dark:bg-slate-950 min-h-screen font-sans">
      <Sidebar 
        currentTab={activeTab} 
        setCurrentTab={(tab) => {
          setActiveTab(tab);
          setViewJcId(null);
          if (tab === 'jobcards') navigate('/job-cards');
          else if (tab === 'bodyshop') navigate('/body-shop');
          else if (tab === 'gatepass') navigate('/gate-pass');
          else if (tab === 'auditlogs') navigate('/audit-logs');
          else if (tab === 'externalrepairs') navigate('/external-repairs');
          else navigate(`/${tab}`);
        }} 
        user={user} 
        onLogout={handleLogout} 
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        isCollapsed={isCollapsed}
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <Header 
          user={user} 
          token={token} 
          currentTab={activeTab} 
          onMenuClick={() => {
            if (window.innerWidth >= 768) {
              setIsCollapsed(prev => {
                const next = !prev;
                localStorage.setItem('sidebar_collapsed', next.toString());
                return next;
              });
            } else {
              setSidebarOpen(prev => !prev);
            }
          }} 
          onLogout={handleLogout} 
          onNavigate={(tab) => {
            setActiveTab(tab);
            setViewJcId(null);
            if (tab === 'jobcards') navigate('/job-cards');
            else if (tab === 'bodyshop') navigate('/body-shop');
            else if (tab === 'gatepass') navigate('/gate-pass');
            else if (tab === 'auditlogs') navigate('/audit-logs');
            else if (tab === 'externalrepairs') navigate('/external-repairs');
            else navigate(`/${tab}`);
          }}
          onNavigateToJobCard={handleNavigateToJobCard}
          tabPermissions={tabPermissions}
        />
        
        <main className="flex-1 overflow-y-auto p-6 pb-24 md:pb-6 bg-[#F8FAFC] dark:bg-slate-950 transition-colors">
          {isPathBlocked ? (
            <div className="min-h-[70vh] flex items-center justify-center p-6 animate-fade-in">
              <div className="glassmorphism max-w-md w-full p-8 rounded-3xl border border-red-500/20 text-center relative overflow-hidden space-y-6 shadow-[0_0_50px_rgba(239,68,68,0.05)]">
                <div className="absolute -top-24 -left-24 w-48 h-48 bg-red-500/10 rounded-full blur-[60px]" />
                <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-[60px]" />

                <div className="mx-auto w-16 h-16 bg-red-950/40 border border-red-900/40 rounded-2xl flex items-center justify-center text-red-400 shadow-lg shadow-red-950/30">
                  <ShieldAlert className="w-8 h-8 animate-pulse" />
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-400 font-bold block mb-1">Access Denied</span>
                  <h2 className="text-xl font-black text-red-500 uppercase tracking-tight">Access Denied</h2>
                  <p className="text-xs font-semibold text-slate-400 leading-relaxed">
                    Access Denied. You do not have permission to access this module.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => navigate(getRedirectPath(userRole))}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-500/10"
                  >
                    Return to Allowed Workspace
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <Suspense fallback={<PageSkeletonLoader />}>
              <Routes>
                <Route path="/dashboard" element={<Dashboard token={token} user={user} setActiveTab={(tab) => {
                  setActiveTab(tab);
                  setViewJcId(null);
                  if (tab === 'jobcards') navigate('/job-cards');
                  else if (tab === 'bodyshop') navigate('/body-shop');
                  else if (tab === 'gatepass') navigate('/gate-pass');
                  else if (tab === 'auditlogs') navigate('/audit-logs');
                  else navigate(`/${tab}`);
                }} />} />
                <Route path="/customers" element={<Customers token={token} user={user} />} />
                <Route path="/vehicles" element={<Vehicles token={token} user={user} />} />
                <Route path="/body-shop" element={<BodyShop token={token} user={user} onNavigateToJobCard={handleNavigateToJobCard} />} />
                <Route path="/job-cards" element={<JobCards token={token} user={user} setActiveTab={setActiveTab} viewJcId={viewJcId} setViewJcId={setViewJcId} />} />
                <Route path="/estimates" element={<Estimates token={token} user={user} setActiveTab={setActiveTab} />} />
                <Route path="/invoices" element={<Invoices token={token} user={user} setActiveTab={setActiveTab} />} />
                <Route path="/inventory" element={<Inventory token={token} user={user} />} />
                <Route path="/inventory/statement" element={<StockStatement token={token} user={user} />} />
                <Route path="/inventory/vendors" element={<Vendors token={token} user={user} />} />
                <Route path="/inventory/adjustments" element={<StockAdjustment token={token} user={user} />} />
                <Route path="/inventory/reports" element={<InventoryReports token={token} user={user} />} />
                <Route path="/inventory/purchase-report" element={<PurchaseReport token={token} user={user} />} />
                <Route path="/inventory/purchases" element={<PurchaseReport token={token} user={user} />} />
                <Route path="/stockstatement" element={<StockStatement token={token} user={user} />} />
                <Route path="/vendors" element={<Vendors token={token} user={user} />} />
                <Route path="/adjustments" element={<StockAdjustment token={token} user={user} />} />
                <Route path="/inventoryreports" element={<InventoryReports token={token} user={user} />} />
                <Route path="/purchasereport" element={<PurchaseReport token={token} user={user} />} />
                <Route path="/purchases" element={<PurchaseReport token={token} user={user} />} />
                <Route path="/inventory/backlogs" element={<Backlogs token={token} user={user} />} />
                <Route path="/backlogs" element={<Backlogs token={token} user={user} />} />
                <Route path="/inventory/expenses" element={<Expenses token={token} user={user} />} />
                <Route path="/expenses" element={<Expenses token={token} user={user} />} />
                <Route path="/external-repairs" element={<ExternalRepairs token={token} user={user} />} />
                <Route path="/employees" element={<Employees token={token} user={user} />} />
                <Route path="/claims" element={<ErrorBoundary><Claims token={token} user={user} /></ErrorBoundary>} />
                <Route path="/reports" element={<Reports token={token} user={user} />} />
                <Route path="/audit-logs" element={<AuditLogs token={token} />} />
                <Route path="/gate-pass" element={<GatePasses token={token} user={user} />} />
                <Route path="/servicehistory" element={<ServiceHistory token={token} />} />
                <Route path="/insurance" element={<Insurance token={token} />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          )}
        </main>

        {/* Bottom Navigation Bar for Mobile */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 md:hidden flex justify-around items-center h-16 px-2 z-40 pb-safe shadow-[0_-4px_12px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.3)]">
          {primaryMobileItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setViewJcId(null);
                  if (item.id === 'jobcards') navigate('/job-cards');
                  else if (item.id === 'bodyshop') navigate('/body-shop');
                  else if (item.id === 'gatepass') navigate('/gate-pass');
                  else if (item.id === 'auditlogs') navigate('/audit-logs');
                  else navigate(`/${item.id}`);
                }}
                className="flex flex-col items-center justify-center flex-1 h-full py-1 text-center relative transition-all duration-150"
              >
                <div className={`p-1.5 rounded-xl transition-all duration-200 ${isActive ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 scale-110' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`text-[10px] font-semibold mt-0.5 tracking-tight ${isActive ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
                  {item.name}
                </span>
                {isActive && (
                  <span className="absolute bottom-1.5 w-1 h-1 bg-indigo-600 dark:bg-indigo-400 rounded-full" />
                )}
              </button>
            );
          })}
          
          {showMoreButton && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex flex-col items-center justify-center flex-1 h-full py-1 text-center relative transition-all duration-150"
            >
              <div className={`p-1.5 rounded-xl transition-all duration-200 ${isMoreActive ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 scale-110' : 'text-slate-550 dark:text-slate-450 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                <MoreHorizontal className="w-5 h-5" />
              </div>
              <span className={`text-[10px] font-semibold mt-0.5 tracking-tight ${isMoreActive ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-550 dark:text-slate-400'}`}>
                More
              </span>
              {isMoreActive && (
                <span className="absolute bottom-1.5 w-1 h-1 bg-indigo-600 dark:bg-indigo-400 rounded-full" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
