import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { 
  Users, 
  Car, 
  FileText, 
  TrendingUp, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  IndianRupee, 
  Wrench,
  Plus,
  Package,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ShoppingBag
} from 'lucide-react';
import StatsCard from '../components/StatsCard';

import { getCachedData, setCachedData } from '../utils/apiCache';

export default function Dashboard({ token, user, setActiveTab }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const formatDateLabel = (date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const handlePrevDay = () => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d;
    });
  };

  const handleNextDay = () => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      const today = new Date();
      today.setHours(23,59,59,999);
      d.setDate(d.getDate() + 1);
      if (d > today && user?.role !== 'Admin') {
        return prev;
      }
      return d;
    });
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  const isNextDayDisabled = (() => {
    const today = new Date();
    today.setHours(23,59,59,999);
    const tomorrow = new Date(selectedDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow > today && user?.role !== 'Admin';
  })();
  // 1. Restore the original stats cards state fields with cached fallback
  const [stats, setStats] = useState(() => getCachedData(`${API_BASE_URL}/dashboard/stats`) || {
    totalCustomers: 0,
    totalVehicles: 0,
    activeJobCards: 0,
    completedJobCards: 0,
    pendingJobCards: 0,
    revenueThisMonth: 0,
    revenueThisYear: 0,
    pendingPayments: 0,
    inventoryValue: 0,
    lowStockItems: 0,
    insuranceClaims: 0,
    bodyShopJobs: 0
  });

  // 2. Restore the original charts state bindings with cached fallback
  const [charts, setCharts] = useState(() => getCachedData(`${API_BASE_URL}/dashboard/charts`) || {
    revenueChart: [],
    serviceTypeChart: [],
    topPartsChart: [],
    billingBreakdown: { spareParts: 0, labour: 0, gst: 0 }
  });

  const [loading, setLoading] = useState(() => {
    return !getCachedData(`${API_BASE_URL}/dashboard/stats`);
  });

  const [summaryFilter, setSummaryFilter] = useState('This Month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const [summaryData, setSummaryData] = useState({
    periodStats: {
      closedJobCardsCount: 0,
      salePartsValue: 0,
      purchasePartsValue: 0,
      labourRevenue: 0,
      grossProfit: 0,
      netProfit: 0,
      gstCollected: 0,
      discounts: 0,
      totalBilling: 0,
      totalExpenses: 0
    },
    todayStats: {
      closedJobCardsCount: 0,
      salePartsValue: 0,
      purchasePartsValue: 0,
      labourRevenue: 0,
      grossProfit: 0,
      netProfit: 0,
      gstCollected: 0,
      discounts: 0,
      totalBilling: 0,
      totalExpenses: 0
    },
    monthlyStats: {
      closedJobCardsCount: 0,
      salePartsValue: 0,
      purchasePartsValue: 0,
      labourRevenue: 0,
      grossProfit: 0,
      netProfit: 0,
      gstCollected: 0,
      discounts: 0,
      totalBilling: 0,
      totalExpenses: 0
    }
  });

  const [reportType, setReportType] = useState('monthly');
  const [reportsData, setReportsData] = useState([]);

  const fetchSummaryData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const dateStr = selectedDate.toISOString().split('T')[0];
      let url = `${API_BASE_URL}/dashboard/summary?filter=${summaryFilter}&date=${dateStr}`;
      if (summaryFilter === 'Custom' && customStartDate && customEndDate) {
        url += `&startDate=${customStartDate}&endDate=${customEndDate}`;
      }
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard summary:', err);
    }
  };

  const fetchReportsData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const dateStr = selectedDate.toISOString().split('T')[0];
      const res = await fetch(`${API_BASE_URL}/dashboard/reports?type=${reportType}&date=${dateStr}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setReportsData(data.reports || []);
      }
    } catch (err) {
      console.error('Failed to fetch reports summary:', err);
    }
  };

  // 3. Restore the original Promise.all backend data fetch logic with SWR caching
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const dateStr = selectedDate.toISOString().split('T')[0];
        const statsUrl = `${API_BASE_URL}/dashboard/stats?date=${dateStr}`;
        const chartsUrl = `${API_BASE_URL}/dashboard/charts?date=${dateStr}`;
        let summaryUrl = `${API_BASE_URL}/dashboard/summary?filter=${summaryFilter}&date=${dateStr}`;
        if (summaryFilter === 'Custom' && customStartDate && customEndDate) {
          summaryUrl += `&startDate=${customStartDate}&endDate=${customEndDate}`;
        }
        const reportsUrl = `${API_BASE_URL}/dashboard/reports?type=${reportType}&date=${dateStr}`;

        // Pre-load from SWR cache
        const cachedStats = getCachedData(statsUrl);
        const cachedCharts = getCachedData(chartsUrl);
        const cachedSummary = getCachedData(summaryUrl);
        const cachedReports = getCachedData(reportsUrl);

        if (cachedStats) setStats(cachedStats);
        if (cachedCharts) setCharts(cachedCharts);
        if (cachedSummary) setSummaryData(cachedSummary);
        if (cachedReports) setReportsData(cachedReports.reports || []);

        if (cachedStats && cachedCharts && cachedSummary && cachedReports) {
          setLoading(false);
        } else {
          setLoading(true);
        }

        // Parallelize all 4 independent requests!
        await Promise.all([
          (async () => {
            const res = await fetch(statsUrl, { headers });
            if (res.ok) {
              const data = await res.json();
              setCachedData(statsUrl, data);
              setStats(data);
            }
          })(),
          (async () => {
            const res = await fetch(chartsUrl, { headers });
            if (res.ok) {
              const data = await res.json();
              setCachedData(chartsUrl, data);
              setCharts(data);
            }
          })(),
          fetchSummaryData(),
          fetchReportsData()
        ]);
      } catch (err) {
        console.error('Failed to fetch dashboard metrics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 60000);
    return () => clearInterval(interval);
  }, [token, selectedDate, summaryFilter, customStartDate, customEndDate, reportType]);



  // 4. Restore original SVG Line Chart coordinates calculations
  const revenuePoints = charts.revenueChart || [];
  const maxRevenue = Math.max(...revenuePoints.map(p => p.amount), 1000);
  const chartHeight = 120;
  const chartWidth = 500;
  const linePointsString = revenuePoints.map((p, idx) => {
    const x = (idx / (revenuePoints.length - 1)) * (chartWidth - 40) + 20;
    const y = chartHeight - (p.amount / maxRevenue) * (chartHeight - 30) - 15;
    return `${x},${y}`;
  }).join(' ');

  // Mini calendar widget with dynamic navigation and today highlighting
  const CalendarWidget = () => {
    const [currentDate, setCurrentDate] = useState(selectedDate);

    useEffect(() => {
      setCurrentDate(selectedDate);
    }, [selectedDate]);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth(); // 0-indexed

    const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
    const getFirstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();

    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const dates = [];
    for (let i = 0; i < firstDay; i++) {
      dates.push('');
    }
    for (let d = 1; d <= daysInMonth; d++) {
      dates.push(d);
    }

    const prevMonth = () => {
      setCurrentDate(new Date(year, month - 1, 1));
    };

    const nextMonth = () => {
      setCurrentDate(new Date(year, month + 1, 1));
    };

    const today = new Date();
    const isToday = (d) => {
      return d !== '' &&
             today.getDate() === d &&
             today.getMonth() === month &&
             today.getFullYear() === year;
    };

    const isSelected = (d) => {
      return d !== '' &&
             selectedDate.getDate() === d &&
             selectedDate.getMonth() === month &&
             selectedDate.getFullYear() === year;
    };

    const isFutureDate = (d) => {
      if (d === '') return false;
      const dateToCheck = new Date(year, month, d, 23, 59, 59, 999);
      const todayVal = new Date();
      return dateToCheck > todayVal;
    };

    const handleDateClick = (d) => {
      if (d === '') return;
      const clickDate = new Date(year, month, d);
      const todayVal = new Date();
      todayVal.setHours(23, 59, 59, 999);
      if (clickDate > todayVal && user?.role !== 'Admin') {
        alert("Future dates can only be viewed by Administrators.");
        return;
      }
      setSelectedDate(clickDate);
    };

    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 p-4 rounded-xl shadow-sm flex flex-col justify-between h-full select-none">
        <div>
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-xs font-bold text-slate-955 dark:text-white uppercase tracking-wider">Calendar</h4>
            <div className="flex items-center gap-2">
              <button 
                onClick={prevMonth} 
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors text-slate-500 hover:text-indigo-655 dark:text-slate-400 dark:hover:text-indigo-400 border-none outline-none cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-bold text-indigo-655 dark:text-indigo-400 select-none whitespace-nowrap min-w-[80px] text-center">
                {monthNames[month]} {year}
              </span>
              <button 
                onClick={nextMonth} 
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors text-slate-500 hover:text-indigo-650 dark:text-slate-400 dark:hover:text-indigo-400 border-none outline-none cursor-pointer"
                title="Next Month"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-bold text-slate-455 dark:text-slate-500">
            {days.map(d => <span key={d}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1 mt-2 text-center text-[10px]">
            {dates.map((d, idx) => {
              const selected = isSelected(d);
              const todayVal = isToday(d);
              const future = isFutureDate(d) && user?.role !== 'Admin';
              
              let classNames = "py-1 rounded text-[10px] font-semibold transition-all ";
              if (d === '') {
                classNames += "text-transparent pointer-events-none";
              } else if (future) {
                classNames += "text-slate-200 dark:text-slate-850 cursor-not-allowed opacity-30";
              } else if (selected) {
                classNames += "bg-indigo-600 text-white shadow-sm font-black scale-105 cursor-pointer";
              } else if (todayVal) {
                classNames += "border border-indigo-500 text-indigo-600 dark:text-indigo-400 font-black cursor-pointer bg-indigo-50/40 dark:bg-indigo-950/20";
              } else {
                classNames += "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer";
              }

              return (
                <span 
                  key={idx} 
                  onClick={() => !future && handleDateClick(d)}
                  className={classNames}
                >
                  {d}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Recent job cards list with custom backgrounds
  const recentJobs = [
    { no: 'JC-270625-0012', model: 'Hyundai Creta', plate: 'TS09AB1234', status: 'In Progress', statusColor: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-450', cost: 8450 },
    { no: 'JC-270625-0011', model: 'Maruti Swift', plate: 'TS08CD5678', status: 'Pending', statusColor: 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400', cost: 4200 },
    { no: 'JC-270625-0010', model: 'Honda City', plate: 'TS09EF9876', status: 'Completed', statusColor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400', cost: 12600 },
    { no: 'JC-270625-0009', model: 'Tata Nexon', plate: 'TS07GH4321', status: 'Waiting Parts', statusColor: 'bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400', cost: 6300 },
    { no: 'JC-270625-0008', model: 'Mahindra XUV700', plate: 'TS09IJ1111', status: 'In Progress', statusColor: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-450', cost: 15750 }
  ];

  // Dynamic Donut status calculations
  const totalJobs = (stats.pendingJobCards || 0) + (stats.activeJobCards || 0) + (stats.completedJobCards || 0) + (stats.waitingPartsJobCards || 10) + (stats.deliveredJobCards || 5);
  const pendingPct = totalJobs > 0 ? Math.round(((stats.pendingJobCards || 0) / totalJobs) * 100) : 27;
  const progressPct = totalJobs > 0 ? Math.round(((stats.activeJobCards || 0) / totalJobs) * 100) : 38;
  const completedPct = totalJobs > 0 ? Math.round(((stats.completedJobCards || 0) / totalJobs) * 100) : 23;
  const waitingPct = totalJobs > 0 ? Math.round(((stats.waitingPartsJobCards || 10) / totalJobs) * 100) : 8;
  const deliveredPct = totalJobs > 0 ? Math.round(((stats.deliveredJobCards || 5) / totalJobs) * 100) : 4;

  return (
    <div className="space-y-6 p-1 select-none w-full animate-fade-in">
      
      {/* Historical Navigation Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-850 flex flex-col md:flex-row md:items-center md:justify-between gap-4 select-none">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-450 animate-pulse" />
            <h1 className="text-xs font-black uppercase tracking-wider text-slate-200">
              Viewing Dashboard for: <span className="text-emerald-400 font-mono">{formatDateLabel(selectedDate)}</span>
            </h1>
          </div>
          <p className="text-[10px] font-semibold text-slate-400 mt-1">
            Historical Reporting Mode — Click any calendar date to view the complete snapshot of that day
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrevDay}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-[10px] font-black transition-all flex items-center gap-1 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev Day
          </button>

          <button
            type="button"
            onClick={handleToday}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black transition-all cursor-pointer"
          >
            Today
          </button>

          <button
            type="button"
            onClick={handleNextDay}
            disabled={isNextDayDisabled}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all flex items-center gap-1 ${
              isNextDayDisabled
                ? 'bg-slate-800/40 text-slate-500 border-slate-850 cursor-not-allowed'
                : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700 cursor-pointer'
            }`}
          >
            Next Day <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {/* Date Picker Input */}
          <div className="relative flex items-center ml-1">
            <input
              type="date"
              value={selectedDate.toISOString().split('T')[0]}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => {
                const newDate = new Date(e.target.value);
                if (!isNaN(newDate.getTime())) {
                  const today = new Date();
                  today.setHours(23,59,59,999);
                  if (newDate > today && user?.role !== 'Admin') {
                    alert("Future dates can only be viewed by Administrators.");
                    return;
                  }
                  setSelectedDate(newDate);
                }
              }}
              className="px-3 py-1 bg-slate-800 border border-slate-750 rounded-xl text-[10px] font-black text-white focus:outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {stats.noData ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-sm min-h-[400px]">
            <div className="w-16 h-16 bg-amber-50 dark:bg-amber-955/20 text-amber-500 dark:text-amber-450 border border-amber-300/40 rounded-full flex items-center justify-center shadow-inner">
              <Calendar className="w-8 h-8" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h3 className="text-xs font-black text-slate-850 dark:text-white uppercase tracking-wider">No dashboard data available for this date.</h3>
              <p className="text-[11px] text-slate-450 dark:text-slate-500 font-semibold leading-relaxed">
                No transactions, registrations, bookings, or job cards were created or updated on {formatDateLabel(selectedDate)}.
              </p>
            </div>
          </div>
          <div className="lg:col-span-4">
            <CalendarWidget />
          </div>
        </div>
      ) : (
        <>
          {/* Workshop ERP Billing & Profit Summary Panel */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-wider">Workshop ERP Billing & Profit Summary</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold mt-1">Real-time financial analytics, margins, and automatically updated summaries</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {['Today', 'Yesterday', 'This Week', 'This Month', 'Custom'].map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setSummaryFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  summaryFilter === f
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date range picker */}
        {summaryFilter === 'Custom' && (
          <div className="flex flex-wrap items-center gap-4 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800/80 animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Start Date:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">End Date:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Billing & Profit KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Card 1: Revenue & Billing */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-900/60 p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-400 dark:text-slate-550 uppercase tracking-wide">Revenue & Billing</span>
              <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">{summaryFilter}</span>
            </div>            <div className="space-y-1">
              <span className="text-2xl font-black text-slate-800 dark:text-white block">
                {loading ? <span className="inline-block h-6 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-1" /> : `₹${(summaryData.periodStats?.totalBilling || 0).toLocaleString('en-IN')}`}
              </span>
              <span className="text-[10px] text-slate-450 font-semibold block">Total Grand Billing Amount</span>
            </div>
            <div className="pt-2 border-t border-slate-200/50 dark:border-slate-850 grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500">
              <div>
                <span className="block text-slate-400">GST Collected</span>
                <span className="text-slate-700 dark:text-slate-300">
                  {loading ? <span className="inline-block h-3.5 w-16 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-0.5" /> : `₹${(summaryData.periodStats?.gstCollected || 0).toLocaleString('en-IN')}`}
                </span>
              </div>
              <div>
                <span className="block text-slate-400">Discounts Allowed</span>
                <span className="text-slate-700 dark:text-slate-300">
                  {loading ? <span className="inline-block h-3.5 w-16 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-0.5" /> : `₹${(summaryData.periodStats?.discounts || 0).toLocaleString('en-IN')}`}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Spare Parts Performance */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-900/60 p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-400 dark:text-slate-550 uppercase tracking-wide">Parts Performance</span>
              <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">{summaryFilter}</span>
            </div>
            <div className="space-y-1">
              <span className="text-2xl font-black text-slate-800 dark:text-white block">
                {loading ? <span className="inline-block h-6 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-1" /> : `₹${(summaryData.periodStats?.salePartsValue || 0).toLocaleString('en-IN')}`}
              </span>
              <span className="text-[10px] text-slate-450 font-semibold block">Parts Selling Value</span>
            </div>
            <div className="pt-2 border-t border-slate-200/50 dark:border-slate-850 grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500">
              <div>
                <span className="block text-slate-400">Parts Purchase Value</span>
                <span className="text-slate-700 dark:text-slate-300">
                  {loading ? <span className="inline-block h-3.5 w-16 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-0.5" /> : `₹${(summaryData.periodStats?.purchasePartsValue || 0).toLocaleString('en-IN')}`}
                </span>
              </div>
              <div>
                <span className="block text-slate-400">Net Parts Revenue</span>
                <span className="text-slate-750 dark:text-slate-200">
                  {loading ? <span className="inline-block h-3.5 w-16 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-0.5" /> : `₹${Math.max(0, (summaryData.periodStats?.salePartsValue || 0) - (summaryData.periodStats?.discounts || 0)).toLocaleString('en-IN')}`}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Labour & Workload */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-900/60 p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-400 dark:text-slate-550 uppercase tracking-wide">Labour & Output</span>
              <span className="text-[10px] bg-amber-50 dark:bg-amber-955/30 text-amber-655 dark:text-amber-450 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">{summaryFilter}</span>
            </div>
            <div className="space-y-1">
              <span className="text-2xl font-black text-slate-800 dark:text-white block">
                {loading ? <span className="inline-block h-6 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-1" /> : `₹${(summaryData.periodStats?.labourRevenue || 0).toLocaleString('en-IN')}`}
              </span>
              <span className="text-[10px] text-slate-440 font-semibold block">Total Labour Charges</span>
            </div>
            <div className="pt-2 border-t border-slate-200/50 dark:border-slate-850 grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500">
              <div>
                <span className="block text-slate-400">Closed Job Cards</span>
                <span className="text-slate-700 dark:text-slate-300 font-extrabold text-xs">
                  {loading ? <span className="inline-block h-3.5 w-12 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-0.5" /> : `${summaryData.periodStats?.closedJobCardsCount || 0} Cards`}
                </span>
              </div>
              <div>
                <span className="block text-slate-400">Workforce Revenue</span>
                <span className="text-slate-750 dark:text-slate-200">
                  {loading ? <span className="inline-block h-3.5 w-16 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-0.5" /> : `₹${(summaryData.periodStats?.labourRevenue || 0).toLocaleString('en-IN')}`}
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: ERP Profitability Card */}
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-5 rounded-2xl shadow-md space-y-4 relative overflow-hidden">
            <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 w-32 h-32 bg-white/5 rounded-full pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wide text-emerald-100">Workshop Net Margin</span>
              <span className="text-[9px] bg-white/20 text-white font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">{summaryFilter}</span>
            </div>
            <div className="space-y-1">
              <span className="text-3xl font-black block">
                {loading ? <span className="inline-block h-8 w-40 bg-white/20 animate-pulse rounded mt-1" /> : `₹${(summaryData.periodStats?.netProfit || 0).toLocaleString('en-IN')}`}
              </span>
              <span className="text-[10px] text-emerald-100 font-semibold block">Net Profit (Gross Profit - Expenses)</span>
            </div>
            <div className="pt-2 border-t border-white/25 grid grid-cols-2 gap-2 text-[10px] font-bold text-emerald-100">
              <div>
                <span className="block text-emerald-200">Gross Profit</span>
                <span className="text-white text-xs font-black">
                  {loading ? <span className="inline-block h-3.5 w-16 bg-white/20 animate-pulse rounded mt-0.5" /> : `₹${(summaryData.periodStats?.grossProfit || 0).toLocaleString('en-IN')}`}
                </span>
              </div>
              <div>
                <span className="block text-emerald-200">Profit Margin %</span>
                <span className="text-white text-xs font-black">
                  {loading ? (
                    <span className="inline-block h-3.5 w-12 bg-white/20 animate-pulse rounded mt-0.5" />
                  ) : summaryData.periodStats?.salePartsValue + summaryData.periodStats?.labourRevenue > 0
                    ? `${Math.round((summaryData.periodStats?.grossProfit / (summaryData.periodStats?.salePartsValue + summaryData.periodStats?.labourRevenue)) * 100)}%`
                    : '0%'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Comparisons for Today & This Month */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-slate-100 dark:border-slate-850">
          {/* Today Overview */}
          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-900/60">
            <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wide mb-3 flex items-center justify-between">
              <span>Today's Closed Summary</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-lg">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide block">Closed Cards</span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-white mt-0.5 block">{summaryData.todayStats?.closedJobCardsCount || 0}</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-lg">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide block">Today's Billing</span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-white mt-0.5 block">₹{Math.round(summaryData.todayStats?.totalBilling || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-lg">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide block">Today's Profit</span>
                <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-450 mt-0.5 block">₹{Math.round(summaryData.todayStats?.netProfit || 0).toLocaleString('en-IN')}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-3 text-[10px] font-bold text-slate-500 px-1">
              <div>
                <span className="text-slate-400 block">Today's Parts Sale:</span>
                <span className="text-slate-800 dark:text-slate-200">₹{(summaryData.todayStats?.salePartsValue || 0).toLocaleString('en-IN')} (Purchase: ₹{(summaryData.todayStats?.purchasePartsValue || 0).toLocaleString('en-IN')})</span>
              </div>
              <div>
                <span className="text-slate-400 block">Today's Labour Revenue:</span>
                <span className="text-slate-800 dark:text-slate-200">₹{(summaryData.todayStats?.labourRevenue || 0).toLocaleString('en-IN')} (GST: ₹{(summaryData.todayStats?.gstCollected || 0).toLocaleString('en-IN')})</span>
              </div>
            </div>
          </div>

          {/* Month Overview */}
          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-900/60">
            <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wide mb-3">Monthly Summary Overview</h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-lg">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide block">Monthly Cards</span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-white mt-0.5 block">{summaryData.monthlyStats?.closedJobCardsCount || 0}</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-lg">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide block">Monthly Billing</span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-white mt-0.5 block">₹{Math.round(summaryData.monthlyStats?.totalBilling || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-lg">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide block">Monthly Profit</span>
                <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 block">₹{Math.round(summaryData.monthlyStats?.netProfit || 0).toLocaleString('en-IN')}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-3 text-[10px] font-bold text-slate-500 px-1">
              <div>
                <span className="text-slate-400 block">Monthly Parts Sale:</span>
                <span className="text-slate-800 dark:text-slate-200">₹{(summaryData.monthlyStats?.salePartsValue || 0).toLocaleString('en-IN')} (Purchase: ₹{(summaryData.monthlyStats?.purchasePartsValue || 0).toLocaleString('en-IN')})</span>
              </div>
              <div>
                <span className="text-slate-400 block">Monthly Labour Revenue:</span>
                <span className="text-slate-800 dark:text-slate-200">₹{(summaryData.monthlyStats?.labourRevenue || 0).toLocaleString('en-IN')} (GST: ₹{(summaryData.monthlyStats?.gstCollected || 0).toLocaleString('en-IN')})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Automatic Grouped Summary Reports Section */}
        <div className="pt-6 border-t border-slate-100 dark:border-slate-855 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide">Automatic Financial Period Reports</h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">Aggregated summaries grouped by daily, weekly, monthly, and yearly bounds</p>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
              {['daily', 'weekly', 'monthly', 'yearly'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setReportType(t)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    reportType === t
                      ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200/60 dark:border-slate-800/80">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-left text-[11px] font-bold">
              <thead className="bg-slate-50 dark:bg-slate-955 text-slate-450 uppercase tracking-wider text-[9px] font-extrabold border-b border-slate-200/60 dark:border-slate-800/80">
                <tr>
                  <th className="px-4 py-3">Period Label</th>
                  <th className="px-4 py-3">Closed Job Cards</th>
                  <th className="px-4 py-3">Parts Sale Value</th>
                  <th className="px-4 py-3">Parts Purchase Cost</th>
                  <th className="px-4 py-3">Labour Revenue</th>
                  <th className="px-4 py-3 text-emerald-600 dark:text-emerald-450">Gross Profit</th>
                  <th className="px-4 py-3 text-rose-600 dark:text-rose-450">Expenses</th>
                  <th className="px-4 py-3 text-indigo-600 dark:text-indigo-450">Net Profit</th>
                  <th className="px-4 py-3">Total Billing (Grand Total)</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {reportsData.length > 0 ? (
                  reportsData.map(rep => (
                    <tr key={rep.periodLabel} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-all font-mono">
                      <td className="px-4 py-3.5 font-bold font-sans text-slate-900 dark:text-white">{rep.periodLabel}</td>
                      <td className="px-4 py-3.5 font-sans">{rep.closedJobCardsCount} Cards</td>
                      <td className="px-4 py-3.5">₹{(rep.salePartsValue || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3.5">₹{(rep.purchasePartsValue || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3.5">₹{(rep.labourRevenue || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3.5 text-emerald-600 dark:text-emerald-400 font-bold">₹{(rep.grossProfit || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3.5 text-rose-500 font-bold">₹{(rep.totalExpenses || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3.5 text-indigo-600 dark:text-indigo-450 font-extrabold">₹{(rep.netProfit || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3.5 font-sans font-extrabold text-slate-855 dark:text-slate-200">₹{(rep.totalBilling || 0).toLocaleString('en-IN')}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="9" className="text-center py-6 text-slate-400 italic">No period reports found. Generate invoices and close job cards first.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 12 Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatsCard 
          title="Total Customers" 
          value={loading ? <div className="h-5 w-12 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-1.5" /> : (stats.totalCustomers || 0)} 
          icon={Users} 
          description="Registered Clients" 
          trend="+4%" 
          trendType="up" 
        />
        <StatsCard 
          title="Total Vehicles" 
          value={loading ? <div className="h-5 w-12 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-1.5" /> : (stats.totalVehicles || 0)} 
          icon={Car} 
          description="Automobile Registry" 
          trend="+5%" 
          trendType="up" 
        />
        <StatsCard 
          title="Active Job Cards" 
          value={loading ? <div className="h-5 w-12 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-1.5" /> : (stats.activeJobCards || 0)} 
          icon={FileText} 
          description="Active Shop Floor" 
          trend="In Progress" 
          trendType="up" 
        />
        <StatsCard 
          title="Completed Job Cards" 
          value={loading ? <div className="h-5 w-12 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-1.5" /> : (stats.completedJobCards || 0)} 
          icon={CheckCircle2} 
          description="Delivered Vehicles" 
          trend="Closed" 
          trendType="up" 
        />
        <StatsCard 
          title="Pending Job Cards" 
          value={loading ? <div className="h-5 w-12 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-1.5" /> : (stats.pendingJobCards || 0)} 
          icon={Clock} 
          description="Awaiting Work" 
          trend="Queue" 
          trendType="up" 
        />
        <StatsCard 
          title="Revenue This Month" 
          value={loading ? <div className="h-5 w-24 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-1.5" /> : `₹${Math.round(stats.revenueThisMonth || stats.monthlyRevenue || 0).toLocaleString('en-IN')}`} 
          icon={IndianRupee} 
          description="Current Month" 
          trend="+12%" 
          trendType="up" 
        />
        <StatsCard 
          title="Revenue This Year" 
          value={loading ? <div className="h-5 w-24 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-1.5" /> : `₹${Math.round(stats.revenueThisYear || 0).toLocaleString('en-IN')}`} 
          icon={TrendingUp} 
          description="Current Year" 
          trend="Annual" 
          trendType="up" 
        />
        <StatsCard 
          title="Pending Payments" 
          value={loading ? <div className="h-5 w-24 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-1.5" /> : `₹${Math.round(stats.pendingPayments || 0).toLocaleString('en-IN')}`} 
          icon={IndianRupee} 
          description="Unpaid Invoices" 
          trend="Due" 
          trendType="down" 
        />
        <StatsCard 
          title="Inventory Value" 
          value={loading ? <div className="h-5 w-24 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-1.5" /> : `₹${Math.round(stats.inventoryValue || 0).toLocaleString('en-IN')}`} 
          icon={ShoppingBag} 
          description="Stock Valuation" 
          trend="Asset" 
          trendType="up" 
        />
        <StatsCard 
          title="Low Stock Items" 
          value={loading ? <div className="h-5 w-12 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-1.5" /> : (stats.lowStockItems || 0)} 
          icon={AlertTriangle} 
          description="Needs Reordering" 
          trend={stats.lowStockItems > 0 ? 'Warning' : 'OK'} 
          trendType={stats.lowStockItems > 0 ? 'down' : 'up'} 
        />
        <StatsCard 
          title="Insurance Claims" 
          value={loading ? <div className="h-5 w-12 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-1.5" /> : (stats.insuranceClaims || 0)} 
          icon={ShieldCheck} 
          description="Insurance surveys" 
          trend="Claims" 
          trendType="up" 
        />
        <StatsCard 
          title="Body Shop Jobs" 
          value={loading ? <div className="h-5 w-12 bg-slate-200 dark:bg-slate-800 animate-pulse rounded mt-1.5" /> : (stats.bodyShopJobs || 0)} 
          icon={Wrench} 
          description="Dent/Paint/Align" 
          trend="In Progress" 
          trendType="up" 
        />
      </div>

      {/* Row 1: Job Card Status & Recent Job Cards (Spacious, Enterprise style) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Job Card Status Donut Chart Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 p-5 rounded-xl shadow-sm lg:col-span-6 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-955 dark:text-white uppercase tracking-wider mb-4">Job Card Status</h4>
            <div className="flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-12 mt-2">
              <div 
                className="w-28 h-28 sm:w-32 sm:h-32 rounded-full relative shrink-0 shadow-xs max-w-full max-h-full" 
                style={{
                  background: `conic-gradient(#f59e0b 0% ${pendingPct}%, #2563eb ${pendingPct}% ${pendingPct + progressPct}%, #10b981 ${pendingPct + progressPct}% ${pendingPct + progressPct + completedPct}%, #8b5cf6 ${pendingPct + progressPct + completedPct}% ${pendingPct + progressPct + completedPct + waitingPct}%, #06b6d4 ${pendingPct + progressPct + completedPct + waitingPct}% 100%)`
                }}
              >
                <div className="absolute inset-4 bg-white dark:bg-slate-900 rounded-full flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-slate-900 dark:text-white leading-none">{totalJobs}</span>
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider mt-1 block">Total</span>
                </div>
              </div>
              
              {/* Legend details */}
              <div className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-455 w-full max-w-full lg:max-w-xs">
                <div className="flex justify-between items-center py-0.5 border-b border-slate-55 dark:border-slate-800/30">
                  <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />Pending</span>
                  <span className="font-extrabold text-slate-850 dark:text-slate-200">{stats.pendingJobCards || 0}</span>
                </div>
                <div className="flex justify-between items-center py-0.5 border-b border-slate-55 dark:border-slate-800/30">
                  <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-600" />In Progress</span>
                  <span className="font-extrabold text-slate-850 dark:text-slate-200">{stats.activeJobCards || 0}</span>
                </div>
                <div className="flex justify-between items-center py-0.5 border-b border-slate-55 dark:border-slate-800/30">
                  <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />Completed</span>
                  <span className="font-extrabold text-slate-850 dark:text-slate-200">{stats.completedJobCards || 0}</span>
                </div>
                <div className="flex justify-between items-center py-0.5 border-b border-slate-55 dark:border-slate-800/30">
                  <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" />Waiting Parts</span>
                  <span className="font-extrabold text-slate-850 dark:text-slate-200">{stats.waitingPartsJobCards || 10}</span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />Delivered</span>
                  <span className="font-extrabold text-slate-850 dark:text-slate-200">{stats.deliveredJobCards || 5}</span>
                </div>
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => setActiveTab('jobcards')}
            className="w-full mt-6 py-2.5 border border-slate-200 dark:border-slate-800 hover:border-indigo-650 text-indigo-650 dark:text-indigo-400 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 border-none outline-none"
          >
            View All Job Cards
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Recent Job Cards List */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-sm lg:col-span-6 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-bold text-slate-955 dark:text-white uppercase tracking-wider">Recent Job Cards</h4>
              <button onClick={() => setActiveTab('jobcards')} className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider hover:underline border-none outline-none bg-transparent">
                View All
              </button>
            </div>
            <div className="space-y-3">
              {recentJobs.map((job, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 hover:bg-slate-50 dark:hover:bg-slate-955 rounded-xl transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-800 flex items-center justify-center text-slate-450 shrink-0">
                      <Car className="w-4.5 h-4.5 text-indigo-650" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-855 dark:text-white truncate leading-none">{job.no}</p>
                      <p className="text-[10px] text-slate-455 mt-1 font-semibold truncate">{job.model} ({job.plate})</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`px-2.5 py-1 rounded-md text-[8px] font-black uppercase tracking-wider ${job.statusColor}`}>
                      {job.status}
                    </span>
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200 font-mono">
                      ₹{job.cost.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Row 2: Revenue Overview & Dynamic Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Revenue Overview Line Chart Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 p-5 rounded-xl shadow-sm lg:col-span-8 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-bold text-slate-955 dark:text-white uppercase tracking-wider">Revenue Overview</h4>
              <select className="px-2 py-1 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded text-[10px] font-bold outline-none">
                <option>This Month</option>
              </select>
            </div>
            
            <div className="relative mt-2">
              {loading ? (
                <div className="w-full h-[200px] bg-slate-55/40 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-850 rounded-2xl animate-pulse flex items-center justify-center text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  Loading Chart...
                </div>
              ) : revenuePoints.length > 1 ? (
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto overflow-visible">
                  {[0, 0.5, 1].map((val, idx) => {
                    const y = chartHeight - val * (chartHeight - 30) - 15;
                    return (
                      <g key={idx}>
                        <line x1="20" y1={y} x2={chartWidth - 20} y2={y} stroke="#f1f5f9" strokeDasharray="3 3" className="dark:stroke-slate-800" />
                        <text x="25" y={y - 4} fontSize="8" fill="#94a3b8" fontWeight="bold" className="font-mono">
                          ₹{Math.round(val * maxRevenue).toLocaleString('en-IN')}
                        </text>
                      </g>
                    );
                  })}
                  <path
                    d={`M 20,${chartHeight - 15} L ${linePointsString} L ${chartWidth - 20},${chartHeight - 15} Z`}
                    fill="url(#rev-grad-dynamic)"
                    opacity="0.05"
                  />
                  <polyline
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth="2"
                    points={linePointsString}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {revenuePoints.map((p, idx) => {
                    const x = (idx / (revenuePoints.length - 1)) * (chartWidth - 40) + 20;
                    const y = chartHeight - (p.amount / maxRevenue) * (chartHeight - 30) - 15;
                    return (
                      <circle
                        key={idx}
                        cx={x}
                        cy={y}
                        r="3.5"
                        fill="#4f46e5"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                    );
                  })}
                  <defs>
                    <linearGradient id="rev-grad-dynamic" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              ) : (
                /* Corporate Fallback Chart Layout */
                <svg viewBox="0 0 500 130" className="w-full h-auto overflow-visible">
                  {[0, 0.5, 1].map((val, idx) => {
                    const y = 115 - val * 90;
                    return (
                      <g key={idx}>
                        <line x1="20" y1={y} x2="480" y2={y} stroke="#f1f5f9" strokeDasharray="3 3" className="dark:stroke-slate-800" />
                        <text x="25" y={y - 4} fontSize="8" fill="#94a3b8" fontWeight="bold" className="font-mono">
                          ₹{Math.round(val * 300).toLocaleString('en-IN')}K
                        </text>
                      </g>
                    );
                  })}
                  <path
                    d="M 20,115 L 20,115 L 85,90 L 150,95 L 215,80 L 280,85 L 345,65 L 410,75 L 475,25 L 475,115 Z"
                    fill="url(#rev-grad)"
                    opacity="0.05"
                  />
                  <polyline
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth="2"
                    points="20,115 85,90 150,95 215,80 280,85 345,65 410,75 475,25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {[
                    { x: 20, y: 115 },
                    { x: 85, y: 90 },
                    { x: 150, y: 95 },
                    { x: 215, y: 80 },
                    { x: 280, y: 85 },
                    { x: 345, y: 65 },
                    { x: 410, y: 75 },
                    { x: 475, y: 25 }
                  ].map((pt, idx) => (
                    <circle
                      key={idx}
                      cx={pt.x}
                      cy={pt.y}
                      r="3.5"
                      fill="#4f46e5"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  ))}
                  <defs>
                    <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              )}

              {/* Month Labels */}
              <div className="flex justify-between px-2.5 mt-2 text-[9px] font-semibold text-slate-400 uppercase tracking-widest font-mono">
                {revenuePoints.length > 1 ? (
                  revenuePoints.map((p, idx) => <span key={idx}>{p.month}</span>)
                ) : (
                  <>
                    <span>01 Jun</span>
                    <span>07 Jun</span>
                    <span>13 Jun</span>
                    <span>19 Jun</span>
                    <span>25 Jun</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Calendar Widget Column */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <CalendarWidget />
        </div>

      </div>

      {/* Row 3: Service Streams, Alerts, and Quick Launch */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Service type chart / Service Streams */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-sm lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-bold text-slate-950 dark:text-white uppercase tracking-wider">Service Streams</h4>
              <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Breakdown</span>
            </div>
            
            <div className="space-y-3 mt-2">
              {charts.serviceTypeChart && charts.serviceTypeChart.length > 0 ? (
                charts.serviceTypeChart.map((item, idx) => {
                  const totalVal = charts.serviceTypeChart.reduce((s, i) => s + i.value, 0);
                  const percent = totalVal > 0 ? Math.round((item.value / totalVal) * 100) : 0;
                  const colors = ['bg-indigo-650', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500'];
                  const bg = colors[idx % colors.length];

                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium text-slate-655 dark:text-slate-355">
                        <span>{item.name}</span>
                        <span className="font-mono text-slate-500">{item.value} ({percent}%)</span>
                      </div>
                      <div className="w-full bg-slate-50 dark:bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-100 dark:border-slate-900">
                        <div 
                          className={`h-full rounded-full ${bg}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                /* Fallback to Corporate default list */
                [
                  { name: 'General Service', count: 45, color: 'bg-indigo-650' },
                  { name: 'Engine Repair', count: 28, color: 'bg-emerald-500' },
                  { name: 'Body Painting', count: 18, color: 'bg-amber-500' },
                  { name: 'Clutch Repair', count: 14, color: 'bg-purple-500' },
                  { name: 'AC Service', count: 12, color: 'bg-rose-500' }
                ].map((serv, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium text-slate-655 dark:text-slate-355">
                      <span>{serv.name}</span>
                      <span className="font-mono text-slate-455">{serv.count}</span>
                    </div>
                    <div className="w-full bg-slate-50 dark:bg-slate-955 h-1.5 rounded-full overflow-hidden border border-slate-100 dark:border-slate-900">
                      <div 
                        className={`h-full rounded-full ${serv.color}`}
                        style={{ width: `${(serv.count / 45) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Reminders / Alerts list linked dynamically to DB stats */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 p-5 rounded-xl shadow-sm lg:col-span-3 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-955 dark:text-white uppercase tracking-wider mb-4">Alerts</h4>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {stats.lowStockItemsList && stats.lowStockItemsList.length > 0 ? (
                stats.lowStockItemsList.map((item, idx) => (
                  <div key={idx} className="p-3 bg-red-50 dark:bg-red-955/20 border border-red-200/50 dark:border-red-900/30 rounded-xl space-y-1 text-left">
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-[#C1121F] dark:text-red-400 uppercase text-[8px] tracking-wider">
                        {item.severity === 'CRITICAL' ? '⚠️ OUT OF STOCK' : '⚠️ LOW STOCK ALERT'}
                      </span>
                      <span className={`px-1 rounded text-[7px] font-black ${item.severity === 'CRITICAL' ? 'bg-red-250 text-red-805' : 'bg-amber-250 text-amber-905'}`}>
                        {item.severity}
                      </span>
                    </div>
                    <p className="font-black text-slate-900 dark:text-white text-[11px] leading-tight mt-0.5">{item.partName}</p>
                    <p className="text-slate-400 dark:text-slate-550 font-bold font-mono text-[9px]">Part No: {item.partNumber}</p>
                    <div className="flex gap-3 text-[9px] font-bold text-slate-600 dark:text-slate-400 pt-0.5">
                      <span>Stock: <strong className="text-slate-900 dark:text-white font-mono">{item.currentStock}</strong></span>
                      <span>Min: <strong className="text-slate-900 dark:text-white font-mono">{item.minimumStock}</strong></span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-150 dark:border-slate-800 rounded-lg">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span>Low Stock ({stats.lowStockItems || 0})</span>
                  </div>
                  <button onClick={() => setActiveTab('inventory')} className="px-2.5 py-0.5 bg-white dark:bg-slate-800 hover:bg-slate-55 text-[9px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded transition-colors shadow-2xs border-none outline-none">
                    View
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-150 dark:border-slate-800 rounded-lg">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Active Jobs ({stats.activeJobCards || 0})</span>
                </div>
                <button onClick={() => setActiveTab('jobcards')} className="px-2.5 py-0.5 bg-white dark:bg-slate-800 hover:bg-slate-55 text-[9px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded transition-colors shadow-2xs border-none outline-none">
                  View
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Launch Buttons */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 p-5 rounded-xl shadow-sm lg:col-span-4 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-955 dark:text-white uppercase tracking-wider mb-4">Quick Launch</h4>
            <div className="grid grid-cols-2 gap-2.5 mt-1 text-center">
              
              <button 
                onClick={() => setActiveTab('customers')}
                className="p-2.5 bg-slate-50 dark:bg-slate-955 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors flex flex-col items-center gap-2 group border-none outline-none"
              >
                <div className="p-1.5 bg-indigo-55 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 rounded-md">
                  <Users className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">Add Customer</span>
              </button>

              <button 
                onClick={() => setActiveTab('vehicles')}
                className="p-2.5 bg-slate-50 dark:bg-slate-955 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors flex flex-col items-center gap-2 group border-none outline-none"
              >
                <div className="p-1.5 bg-indigo-55 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 rounded-md">
                  <Car className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">Add Vehicle</span>
              </button>

              <button 
                onClick={() => setActiveTab('invoices')}
                className="p-2.5 bg-slate-50 dark:bg-slate-955 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors flex flex-col items-center gap-2 group border-none outline-none"
              >
                <div className="p-1.5 bg-indigo-55 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 rounded-md">
                  <FileText className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">Create Invoice</span>
              </button>

              <button 
                onClick={() => setActiveTab('inventory')}
                className="p-2.5 bg-slate-50 dark:bg-slate-955 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors flex flex-col items-center gap-2 group border-none outline-none"
              >
                <div className="p-1.5 bg-indigo-55 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 rounded-md">
                  <Package className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">Inventory Entry</span>
              </button>

            </div>
          </div>
        </div>

      </div>

      {/* Row 4: Latest 10 Audit Logs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-sm">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
          <h4 className="text-xs font-bold text-slate-950 dark:text-white uppercase tracking-wider">Latest Security Audit Logs</h4>
          <button 
            onClick={() => setActiveTab('audit')} 
            className="text-[10px] text-indigo-600 hover:underline font-bold uppercase tracking-wider border-none outline-none bg-transparent cursor-pointer"
          >
            View All Logs
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[10px] font-semibold text-slate-700 dark:text-slate-300">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
                <th className="p-2 font-mono">Date & Time</th>
                <th className="p-2">User</th>
                <th className="p-2">Role</th>
                <th className="p-2">Module</th>
                <th className="p-2">Action</th>
                <th className="p-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150/40 dark:divide-slate-800/50">
              {stats.latestAuditLogs && stats.latestAuditLogs.length > 0 ? (
                stats.latestAuditLogs.map(log => {
                  let actionColor = 'bg-slate-50 text-slate-655';
                  if (log.action?.includes('CREATE') || log.action?.includes('ADD')) actionColor = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400';
                  if (log.action?.includes('DELETE') || log.action?.includes('REJECT') || log.action?.includes('REDUCE')) actionColor = 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400';
                  if (log.action?.includes('LOGIN') || log.action?.includes('LOGOUT')) actionColor = 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400';
                  if (log.action?.includes('UPDATE') || log.action?.includes('RESTOCK') || log.action?.includes('RETURN')) actionColor = 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400';

                  return (
                    <tr key={log._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all">
                      <td className="p-2 font-mono font-medium text-slate-400">{new Date(log.createdAt || log.timestamp).toLocaleString('en-IN')}</td>
                      <td className="p-2 font-bold text-slate-850 dark:text-slate-200">{log.userName}</td>
                      <td className="p-2 uppercase text-[8px] font-bold text-indigo-600 dark:text-indigo-400">{log.role || log.userRole}</td>
                      <td className="p-2 uppercase text-[8px] font-bold text-slate-500 dark:text-slate-400">{log.module || 'System'}</td>
                      <td className="p-2">
                        <span className={`px-1.5 py-0.5 rounded font-extrabold text-[8px] uppercase ${actionColor}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="p-2 text-slate-600 dark:text-slate-350 font-medium truncate max-w-xs">{log.details}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" className="p-4 text-center text-slate-400 dark:text-slate-500">No recent logs registered.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      </>
      )}

      {/* Footer */}
      <footer className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center text-[9px] font-semibold text-slate-400 gap-1.5 select-none">
        <span>© 2025 MVSS Automobiles. All Rights Reserved.</span>
        <span>Designed with precision for MVSS Automobiles</span>
      </footer>

    </div>
  );
}