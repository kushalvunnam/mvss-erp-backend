import React from 'react';
import { OWNER_SUPPORT_NUMBER } from '../config';
import { 
  LayoutDashboard, 
  Users, 
  Car, 
  FileText, 
  FileCheck, 
  Receipt, 
  Package, 
  ShieldCheck, 
  LogOut,
  Wrench,
  X,
  TrendingUp,
  History,
  Key,
  ShoppingBag,
  Wallet,
  Clock
} from 'lucide-react';

export default function Sidebar({ currentTab, setCurrentTab, user, onLogout, isOpen, setIsOpen, isCollapsed }) {
  const role = user?.role || 'Guest';

  const navigationItems = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, roles: ['Admin', 'Service', 'Reception'] },
    { id: 'bodyshop', name: 'Body Shop', icon: Wrench, roles: ['Admin'] },
    { id: 'customers', name: 'Customers', icon: Users, roles: ['Admin', 'Accounts', 'Service', 'Body Shop', 'Reception'] },
    { id: 'vehicles', name: 'Vehicles', icon: Car, roles: ['Admin', 'Accounts', 'Service', 'Body Shop', 'Reception'] },
    { id: 'jobcards', name: 'Job Cards', icon: FileText, roles: ['Admin', 'Accounts', 'Service', 'Body Shop', 'Reception'] },
    { id: 'estimates', name: 'Estimates', icon: FileCheck, roles: ['Admin', 'Accounts', 'Service', 'Body Shop'] },
    { id: 'invoices', name: 'Invoices', icon: Receipt, roles: ['Admin', 'Accounts'] },
    // Inventory Category Items
    { id: 'inventory', name: 'Parts / Labour Master', icon: Package, roles: ['Admin', 'Spares'] },
    { id: 'vendors', name: 'Vendor Management', icon: Users, roles: ['Admin', 'Spares'] },
    { id: 'adjustments', name: 'Stock Adjustment', icon: Wrench, roles: ['Admin', 'Spares'] },
    { id: 'stockstatement', name: 'Stock Statement', icon: FileText, roles: ['Admin', 'Spares'] },
    { id: 'inventoryreports', name: 'Stock Alerts & Reports', icon: TrendingUp, roles: ['Admin', 'Spares'] },
    { id: 'purchases', name: 'Purchases', icon: ShoppingBag, roles: ['Admin', 'Spares'] },
    { id: 'backlogs', name: 'Backlog Tracking', icon: Clock, roles: ['Admin', 'Accounts', 'Service', 'Body Shop', 'Spares'] },
    { id: 'expenses', name: 'Miscellaneous Expenses', icon: Wallet, roles: ['Admin', 'Accounts', 'Service', 'Spares'] },
    { id: 'externalrepairs', name: 'External Repairs', icon: Wrench, roles: ['Admin', 'Accounts', 'Service', 'Body Shop'] },
    { id: 'employees', name: 'Employees', icon: Users, roles: ['Admin'] },
    { id: 'claims', name: 'Insurance Claims', icon: ShieldCheck, roles: ['Admin', 'Service'] },
    { id: 'servicehistory', name: 'General Service History', icon: History, roles: ['Admin', 'Accounts', 'Service', 'Body Shop', 'Reception'] },
    { id: 'insurance', name: 'Insurance Module', icon: ShieldCheck, roles: ['Admin', 'Accounts', 'Service', 'Body Shop', 'Reception'] },
    { id: 'reports', name: 'Reports', icon: TrendingUp, roles: ['Admin', 'Service'] },
    { id: 'auditlogs', name: 'Audit Logs', icon: History, roles: ['Admin'] },
    { id: 'gatepass', name: 'Gate Pass', icon: Key, roles: ['Admin', 'Service'] }
  ];

  // Filter items based on user role to keep same business permissions
  const filteredItems = navigationItems.filter(item => item.roles.includes(role));

  const handleItemClick = (item) => {
    setCurrentTab(item.id);
    setIsOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 md:hidden"
        />
      )}

      {/* Sidebar container */}
      <aside 
        className={`fixed md:static inset-y-0 left-0 bg-[#0F172A] text-slate-350 flex flex-col h-screen shrink-0 select-none transition-all duration-300 ease-in-out z-50 md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${
          isCollapsed ? 'w-60 md:w-16' : 'w-60'
        } border-r border-slate-800`}
      >
        {/* Brand Header Section */}
        <div className={`px-4.5 py-4 border-b border-slate-800 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} relative transition-all duration-300`}>
          {isCollapsed ? (
            <div className="text-white font-black text-xs tracking-wider bg-indigo-600/80 px-2 py-1 rounded-md shadow-sm">
              MVSS
            </div>
          ) : (
            <div className="animate-fade-in whitespace-nowrap overflow-hidden">
              <h2 className="text-white font-black text-sm tracking-wide leading-tight uppercase">MVSS Automobiles</h2>
              <span className="text-[8.5px] text-slate-400 font-bold uppercase tracking-wider block mt-1">WORKSHOP MANAGEMENT SYSTEM</span>
            </div>
          )}
          {/* Close button on mobile */}
          <button 
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white md:hidden transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Menu Options List */}
        <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto">
          {filteredItems.map(item => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                title={isCollapsed ? item.name : ''}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-3'} py-2 rounded-lg text-xs font-medium transition-all relative ${
                  isActive 
                    ? 'bg-slate-800 text-white font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-indigo-500 before:rounded-r' 
                    : 'hover:bg-slate-800/40 hover:text-slate-100 text-slate-400'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-400'} ${isCollapsed ? 'mx-auto' : ''}`} />
                {!isCollapsed && <span className="animate-fade-in whitespace-nowrap overflow-hidden">{item.name}</span>}
              </button>
            );
          })}
        </nav>

        {/* Help Support Widget */}
        {!isCollapsed && (
          <div className="p-3 border-t border-slate-800 animate-fade-in">
            <div className="p-3 bg-slate-800/30 border border-slate-800/60 rounded-lg text-center">
              <p className="font-semibold text-slate-400 text-[10px]">Need Help?</p>
              <a 
                href={`tel:${OWNER_SUPPORT_NUMBER.replace(/\s+/g, '')}`} 
                className="text-[11px] text-slate-200 hover:text-indigo-400 font-bold mt-0.5 block transition-colors"
              >
                {OWNER_SUPPORT_NUMBER}
              </a>
            </div>
          </div>
        )}

        {/* Bottom profile / logout */}
        <div className={`p-3 border-t border-slate-800 flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
          <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-200 text-xs shrink-0 select-none">
            {user?.name?.charAt(0) || 'U'}
          </div>
          {!isCollapsed && (
            <>
              <div className="overflow-hidden min-w-0 flex-1 animate-fade-in">
                <h4 className="text-slate-200 font-bold text-xs truncate leading-none">{user?.name || 'User'}</h4>
                <span className="text-[9px] text-slate-500 font-medium mt-0.5 block truncate">{user?.role}</span>
              </div>
              <button
                onClick={onLogout}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                title="Log Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
