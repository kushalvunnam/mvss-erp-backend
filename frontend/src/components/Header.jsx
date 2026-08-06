import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../config';
import { Sun, Moon, Bell, AlertTriangle, Menu, LogOut, Search, Calendar, MessageSquare } from 'lucide-react';

export default function Header({ user, token, currentTab, onMenuClick, onLogout, onNavigate, onNavigateToJobCard, tabPermissions }) {
  const [darkMode, setDarkMode] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [showAlertsMenu, setShowAlertsMenu] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotificationsMenu, setShowNotificationsMenu] = useState(false);
  const unreadCount = notifications.filter(n => n.status === 'unread').length;

  const [messages, setMessages] = useState([]);
  const [showMessagesMenu, setShowMessagesMenu] = useState(false);
  const unreadMessagesCount = messages.filter(m => m.status === 'unread').length;

  // Global ERP Search list and state hooks
  const searchItems = [
    { name: 'Dashboard', keywords: ['dashboard', 'home', 'kpi', 'analytics', 'overview'], tabId: 'dashboard' },
    { name: 'Customers', keywords: ['customers', 'customer profiles', 'customer list', 'clients', 'cust'], tabId: 'customers' },
    { name: 'Vehicles', keywords: ['vehicles', 'vehicle database', 'cars', 'veh', 'plates'], tabId: 'vehicles' },
    { name: 'Job Cards', keywords: ['job cards', 'job card registry', 'work orders', 'jc', 'checklist'], tabId: 'jobcards' },
    { name: 'Estimates', keywords: ['estimates', 'quotation sheet', 'proforma estimates', 'est', 'quotes'], tabId: 'estimates' },
    { name: 'Invoices', keywords: ['invoices', 'tax invoices', 'billing center', 'bills', 'inv', 'payments'], tabId: 'invoices' },
    { name: 'Inventory Parts', keywords: ['inventory parts', 'inventory', 'spare parts stock', 'stock', 'parts', 'low stock'], tabId: 'inventory' },
    { name: 'Employees', keywords: ['employees', 'staff management', 'salaries register', 'salary', 'staff', 'users'], tabId: 'employees' },
    { name: 'Insurance Claims', keywords: ['insurance claims', 'claims management', 'claims', 'insurance'], tabId: 'claims' },
    { name: 'Reports', keywords: ['reports', 'performance analytics', 'attendance summary', 'charts', 'exports'], tabId: 'reports' },
    { name: 'Audit Logs', keywords: ['audit logs', 'security audit logs', 'security', 'logs', 'history'], tabId: 'auditlogs' },
    { name: 'Body Shop', keywords: ['body shop', 'body shop registry', 'paint', 'dent', 'repair'], tabId: 'bodyshop' },
    { name: 'Settings', keywords: ['settings', 'configuration', 'config', 'setup', 'system settings'], tabId: 'dashboard', isMock: true }
  ];

  const [searchQuery, setSearchQuery] = useState('');
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredSuggestions([]);
      return;
    }
    const query = searchQuery.toLowerCase();
    const userRole = user?.role || 'Guest';

    const staticMatches = searchItems.filter(item => {
      const matchesQuery = item.name.toLowerCase().includes(query) || 
                           item.keywords.some(kw => kw.includes(query));
      const hasPermission = tabPermissions && tabPermissions[item.tabId]
        ? tabPermissions[item.tabId].includes(userRole)
        : true;
      return matchesQuery && hasPermission;
    });

    if (token === 'mock_jwt_token_for_offline_demo') {
      setFilteredSuggestions(staticMatches);
      setSelectedIndex(0);
    } else {
      const delayDebounce = setTimeout(async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/dashboard/search?q=${encodeURIComponent(searchQuery)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const dynamicMatches = await res.json();
            const filteredDynamic = dynamicMatches.filter(item => {
              const hasPermission = tabPermissions && tabPermissions[item.tabId]
                ? tabPermissions[item.tabId].includes(userRole)
                : true;
              return hasPermission;
            });
            setFilteredSuggestions([...staticMatches, ...filteredDynamic]);
          } else {
            setFilteredSuggestions(staticMatches);
          }
        } catch (err) {
          console.error(err);
          setFilteredSuggestions(staticMatches);
        }
        setSelectedIndex(0);
      }, 300);

      return () => clearTimeout(delayDebounce);
    }
  }, [searchQuery, token, user, tabPermissions]);

  const handleSelectSuggestion = (item) => {
    if (item.isMock) {
      alert(`${item.name} module is automatically managed by the system based on your Role: ${user?.role || 'Guest'}.`);
    } else {
      if (item.id && item.type === 'JobCard' && onNavigateToJobCard) {
        onNavigateToJobCard(item.id);
      } else {
        if (item.filterVal) {
          localStorage.setItem('global_search_filter', item.filterVal);
        }
        if (onNavigate) {
          onNavigate(item.tabId);
        }
      }
    }
    setSearchQuery('');
    setShowSuggestions(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
    } else if (e.key === 'Enter') {
      if (filteredSuggestions[selectedIndex]) {
        handleSelectSuggestion(filteredSuggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const loadNotifications = async () => {
    if (!token) return;
    if (token === 'mock_jwt_token_for_offline_demo') {
      const localNotifs = JSON.parse(localStorage.getItem('mock_notifications') || '[]');
      setNotifications(localNotifs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } else {
      try {
        const res = await fetch(`${API_BASE_URL}/notifications`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setNotifications(data);
        }
      } catch (err) {
        console.error('Failed to load notifications:', err);
      }
    }
  };

  const handleMarkAsRead = async (id) => {
    if (token === 'mock_jwt_token_for_offline_demo') {
      const localNotifs = JSON.parse(localStorage.getItem('mock_notifications') || '[]');
      const updated = localNotifs.map(n => n._id === id ? { ...n, status: 'read' } : n);
      localStorage.setItem('mock_notifications', JSON.stringify(updated));
      loadNotifications();
    } else {
      try {
        const res = await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          loadNotifications();
        }
      } catch (err) {
        console.error('Failed to mark read:', err);
      }
    }
  };

  const handleNotificationClick = async (item) => {
    await handleMarkAsRead(item._id);
    setShowNotificationsMenu(false);
    
    let tabId = '';
    let filterVal = '';
    
    if (item.type === 'customer') {
      tabId = 'customers';
      filterVal = item.customerName;
    } else if (item.type === 'jobcard') {
      tabId = 'jobcards';
      filterVal = item.vehicleNumber || item.customerName;
    } else if (item.type === 'invoice') {
      tabId = 'invoices';
      filterVal = item.vehicleNumber || item.customerName;
    } else if (item.type === 'low_stock' || item.type === 'out_of_stock') {
      tabId = 'inventory';
      filterVal = item.customerName; // partName
    } else if (item.type === 'claim') {
      tabId = 'claims';
      filterVal = item.customerName;
    } else if (item.type === 'booking') {
      tabId = 'dashboard';
    }

    if (tabId) {
      if (filterVal) {
        localStorage.setItem('global_search_filter', filterVal);
      }
      if (onNavigate) {
        onNavigate(tabId);
      }
    }
  };

  const handleMarkAllAsRead = async () => {
    if (token === 'mock_jwt_token_for_offline_demo') {
      const localNotifs = JSON.parse(localStorage.getItem('mock_notifications') || '[]');
      const updated = localNotifs.map(n => ({ ...n, status: 'read' }));
      localStorage.setItem('mock_notifications', JSON.stringify(updated));
      loadNotifications();
    } else {
      try {
        const res = await fetch(`${API_BASE_URL}/notifications/read-all`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          loadNotifications();
        }
      } catch (err) {
        console.error('Failed to mark all read:', err);
      }
    }
  };

  const loadMessages = async () => {
    if (!token) return;
    if (token === 'mock_jwt_token_for_offline_demo') {
      const localMsgs = JSON.parse(localStorage.getItem('mock_messages') || '[]');
      setMessages(localMsgs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } else {
      try {
        const res = await fetch(`${API_BASE_URL}/messages`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data);
        }
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    }
  };

  const handleMarkMessageAsRead = async (id) => {
    if (token === 'mock_jwt_token_for_offline_demo') {
      const localMsgs = JSON.parse(localStorage.getItem('mock_messages') || '[]');
      const updated = localMsgs.map(m => m._id === id ? { ...m, status: 'read' } : m);
      localStorage.setItem('mock_messages', JSON.stringify(updated));
      loadMessages();
    } else {
      try {
        const res = await fetch(`${API_BASE_URL}/messages/${id}/read`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          loadMessages();
        }
      } catch (err) {
        console.error('Failed to mark message read:', err);
      }
    }
  };

  const handleMarkAllMessagesAsRead = async () => {
    if (token === 'mock_jwt_token_for_offline_demo') {
      const localMsgs = JSON.parse(localStorage.getItem('mock_messages') || '[]');
      const updated = localMsgs.map(m => ({ ...m, status: 'read' }));
      localStorage.setItem('mock_messages', JSON.stringify(updated));
      loadMessages();
    } else {
      try {
        const res = await fetch(`${API_BASE_URL}/messages/read-all`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          loadMessages();
        }
      } catch (err) {
        console.error('Failed to mark all messages read:', err);
      }
    }
  };

  useEffect(() => {
    loadNotifications();
    loadMessages();
    const interval = setInterval(() => {
      loadNotifications();
      loadMessages();
    }, 15000);
    
    const handleStorageUpdate = () => {
      loadNotifications();
      loadMessages();
    };

    window.addEventListener('storage', handleStorageUpdate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageUpdate);
    };
  }, [token]);

  // Sync Dark Mode state
  useEffect(() => {
    const isDark = localStorage.getItem('theme') === 'dark';
    setDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, []);

  // Close dropdowns on page change
  useEffect(() => {
    setShowNotificationsMenu(false);
    setShowMessagesMenu(false);
    setShowAlertsMenu(false);
    setSearchQuery('');
    setShowSuggestions(false);
  }, [currentTab]);

  // Close dropdowns on outside click
  const headerRef = useRef(null);
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setShowNotificationsMenu(false);
        setShowMessagesMenu(false);
        setShowAlertsMenu(false);
        setShowSuggestions(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, []);

  const toggleDarkMode = () => {
    const nextDark = !darkMode;
    setDarkMode(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // Fetch low stock alerts
  useEffect(() => {
    if (!token) return;
    const fetchLowStockAlerts = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/inventory?lowStock=true`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await res.json();
            setAlerts(Array.isArray(data) ? data : []);
          }
        }
      } catch (err) {
        console.error('Failed to load stock alerts:', err);
      }
    };
    fetchLowStockAlerts();
    const interval = setInterval(fetchLowStockAlerts, 120000);
    return () => clearInterval(interval);
  }, [token]);

  // Format date widget
  const getFormattedDay = () => {
    return new Date().toLocaleDateString('en-IN', { weekday: 'long' });
  };
  const getFormattedDate = () => {
    return new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <header ref={headerRef} className="flex flex-col md:flex-row md:h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 sm:px-7 md:px-8 py-3 md:py-0 justify-between items-stretch md:items-center gap-3 select-none relative z-40">
      
      {/* Mobile top-row container */}
      <div className="w-full flex justify-between items-center md:contents">
        
        {/* Left Side: Hamburger, Logo, Company Name (Shifted 24-30px right) */}
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 md:order-1 shrink-0 ml-1 sm:ml-3">
          <button
            onClick={() => {
              setShowNotificationsMenu(false);
              setShowMessagesMenu(false);
              setShowAlertsMenu(false);
              onMenuClick();
            }}
            className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors shrink-0 flex items-center justify-center"
            title="Toggle Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {/* Brand Logo */}
            <div className="shrink-0 flex items-center justify-center overflow-hidden">
              <img 
                src="/logo.png" 
                alt="MVSS Logo" 
                className="h-7 sm:h-8.5 w-auto max-w-[75px] sm:max-w-[100px] object-contain block shrink-0"
                decoding="async"
                fetchPriority="high"
              />
            </div>
            
            <div className="min-w-0 flex flex-col justify-center">
              <h1 className="text-xs sm:text-sm md:text-base font-black text-slate-900 dark:text-white leading-tight tracking-tight whitespace-nowrap">
                MVSS Automobiles
              </h1>
              <span className="text-[8px] sm:text-[9.5px] text-slate-500 dark:text-slate-400 font-bold tracking-wider uppercase leading-none mt-0.5 whitespace-nowrap block">
                WORKSHOP MANAGEMENT SYSTEM
              </span>
            </div>
          </div>
        </div>

        {/* Right Side Widgets */}
        <div className="flex items-center gap-2 md:gap-3.5 shrink-0 md:order-3">
          
          {/* Date Widget (Desktop only) */}
          <div className="hidden md:flex items-center gap-2 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
            <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <div className="text-[9px] leading-tight font-medium">
              <span className="text-slate-700 dark:text-slate-200">{getFormattedDate()}</span>
              <span className="text-slate-400 dark:text-slate-500 ml-1">({getFormattedDay()})</span>
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            {/* Theme switcher */}
            <button
              onClick={toggleDarkMode}
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="Toggle Theme"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Messages dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowMessagesMenu(!showMessagesMenu);
                  setShowNotificationsMenu(false);
                  setShowAlertsMenu(false);
                }}
                className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors relative"
                title="Customer Messages"
              >
                <MessageSquare className="w-4 h-4" />
                {unreadMessagesCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-3.5 h-3.5 px-1 bg-emerald-500 rounded-full text-[8px] font-black text-white flex items-center justify-center">
                    {unreadMessagesCount}
                  </span>
                )}
              </button>

              {showMessagesMenu && (
                <div className="absolute right-0 mt-2.5 w-[calc(100vw-2rem)] sm:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg py-3 text-xs z-50 animate-fade-in">
                  <div className="px-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <span className="font-bold text-slate-500 uppercase tracking-wider">Messages</span>
                    {unreadMessagesCount > 0 && (
                      <button 
                        onClick={handleMarkAllMessagesAsRead}
                        className="text-[9px] text-emerald-600 hover:underline font-bold uppercase tracking-wider"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-60 overflow-y-auto mt-2 px-2 space-y-1">
                    {messages.length > 0 ? (
                      messages.map(item => (
                        <div 
                          key={item._id} 
                          onClick={() => handleMarkMessageAsRead(item._id)}
                          className={`p-2.5 rounded-lg transition-colors cursor-pointer border text-left ${
                            item.status === 'unread' 
                              ? 'bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/35 hover:bg-emerald-50 dark:hover:bg-emerald-950/20' 
                              : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <div className="flex gap-2 items-start">
                            <span className="text-emerald-500 text-xs">💬</span>
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex justify-between items-center w-full">
                                <p className="font-black text-slate-900 dark:text-white text-[11px] leading-tight truncate">{item.senderName}</p>
                                <span className="text-[8px] text-slate-400 font-bold shrink-0">
                                  {new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                </span>
                              </div>
                              <p className="font-bold text-slate-700 dark:text-slate-300 text-[10px] truncate">{item.subject}</p>
                              <p className="text-slate-550 dark:text-slate-400 font-semibold text-[10px] leading-snug line-clamp-2 select-text">{item.body}</p>
                              {item.phone && (
                                <p className="text-[8px] text-slate-400 font-bold mt-1 font-mono">Phone: {item.phone}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 dark:text-slate-500 text-center py-4 font-medium">No messages yet.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Alerts Bell (System Alerts) */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowAlertsMenu(!showAlertsMenu);
                  setShowNotificationsMenu(false);
                  setShowMessagesMenu(false);
                }}
                className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors relative"
                title="System Alerts"
              >
                <AlertTriangle className="w-4 h-4" />
                {alerts.length > 0 && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                )}
              </button>

              {showAlertsMenu && (
                <div className="absolute right-0 mt-2.5 w-[calc(100vw-2rem)] sm:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg py-3 text-xs z-50 animate-fade-in">
                  <div className="px-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <span className="font-bold text-slate-500 uppercase tracking-wider">System Alerts</span>
                    <span className="text-[9px] bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 font-bold px-1.5 py-0.5 rounded-full">
                      {alerts.length} Low Stock
                    </span>
                  </div>
                  <div className="max-h-60 overflow-y-auto mt-2 px-2 space-y-1">
                    {alerts.length > 0 ? (
                      alerts.map(item => (
                        <div key={item._id} className="flex gap-2.5 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors items-start">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-slate-800 dark:text-slate-200">{item.partName}</p>
                            <p className="text-slate-400 dark:text-slate-500 font-medium">
                              Stock: {item.stockQuantity} (Threshold: {item.lowStockThreshold})
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 dark:text-slate-500 text-center py-4 font-medium">All parts stock levels normal.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Service Booking Notifications */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotificationsMenu(!showNotificationsMenu);
                  setShowAlertsMenu(false);
                  setShowMessagesMenu(false);
                }}
                className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors relative"
                title="Service Bookings"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-3.5 h-3.5 px-1 bg-red-500 rounded-full text-[8px] font-black text-white flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotificationsMenu && (
                <div className="absolute right-0 mt-2.5 w-[calc(100vw-2rem)] sm:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg py-3 text-xs z-50 animate-fade-in">
                  <div className="px-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <span className="font-bold text-slate-500 uppercase tracking-wider">Bookings</span>
                    {unreadCount > 0 && (
                      <button 
                        onClick={handleMarkAllAsRead}
                        className="text-[9px] text-[#C1121F] hover:underline font-bold uppercase tracking-wider animate-pulse"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>
                  <div className="max-h-60 overflow-y-auto mt-2 px-2 space-y-1">
                    {notifications.length > 0 ? (
                      notifications.map(item => (
                        <div 
                          key={item._id} 
                          onClick={() => handleNotificationClick(item)}
                          className={`p-2.5 rounded-lg transition-colors cursor-pointer border text-left ${
                            item.status === 'unread' 
                              ? 'bg-[#C1121F]/5 border-[#C1121F]/15 hover:bg-[#C1121F]/10' 
                              : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <div className="flex gap-2.5 items-start">
                            <span className="text-[#C1121F] text-xs shrink-0 select-none">
                              {(() => {
                                switch (item.type) {
                                  case 'booking': return '📅';
                                  case 'customer': return '👤';
                                  case 'tracking': return '🔍';
                                  case 'claim': return '🛡️';
                                  case 'jobcard': return '📋';
                                  case 'invoice': return '🧾';
                                  case 'low_stock': return '⚠️';
                                  case 'out_of_stock': return '❌';
                                  default: return '🔔';
                                }
                              })()}
                            </span>
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex justify-between items-center w-full">
                                <p className="font-black text-slate-900 dark:text-white text-[11px] leading-tight">{item.title}</p>
                                <span className="text-[8px] text-slate-400 font-bold shrink-0">
                                  {new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                </span>
                              </div>
                              <p className="text-slate-550 dark:text-slate-400 font-semibold text-[10px] leading-snug">{item.message}</p>
                              {(item.customerName || item.vehicleNumber || item.mobile || item.serviceType || item.preferredDate) && (
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] font-bold text-slate-450 border-t border-slate-150 dark:border-slate-800 pt-1.5 mt-1 select-text">
                                  {item.customerName && <div className="truncate"><span className="text-slate-400">Cust:</span> {item.customerName}</div>}
                                  {item.mobile && <div className="truncate"><span className="text-slate-400">Mob:</span> {item.mobile}</div>}
                                  {item.vehicleNumber && <div className="truncate"><span className="text-slate-400">Reg:</span> {item.vehicleNumber}</div>}
                                  {item.serviceType && <div className="truncate"><span className="text-slate-400">Cat:</span> {item.serviceType}</div>}
                                  {item.preferredDate && <div className="col-span-2 truncate"><span className="text-slate-400">Date:</span> {item.preferredDate}</div>}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 dark:text-slate-500 text-center py-4 font-medium">No notifications yet.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* User profile identifier avatar */}
          <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-3">
            <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
              <svg className="w-5.5 h-5.5 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
            <div className="text-left hidden md:block">
              <span className="block text-xs font-bold text-slate-800 dark:text-slate-200 leading-none">
                {user?.name || 'Admin User'}
              </span>
              <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                {user?.role}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="p-1.5 text-slate-400 hover:text-red-650 dark:hover:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg md:hidden transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>

      {/* Middle Search Bar */}
      <div className="w-full md:max-w-xs lg:max-w-sm flex flex-col relative shrink-0 md:order-2">
        <div className="flex items-center w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden focus-within:border-indigo-650 transition-colors">
          <Search className="w-4 h-4 text-slate-400 ml-3 shrink-0" />
          <input
            type="text"
            placeholder="Search ERP modules..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            className="w-full px-2 py-1.5 bg-transparent text-xs font-semibold focus:outline-none dark:text-white"
          />
        </div>

        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg overflow-hidden py-1.5 text-xs z-50 animate-fade-in max-h-60 overflow-y-auto">
            {filteredSuggestions.map((item, idx) => (
              <div
                key={item.name}
                onClick={() => handleSelectSuggestion(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`px-3 py-2 cursor-pointer flex justify-between items-center transition-colors font-bold ${
                  idx === selectedIndex 
                    ? 'bg-indigo-50/75 dark:bg-indigo-950/20 text-indigo-650 dark:text-indigo-400' 
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <span>{item.name}</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Module</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </header>
  );
}
