import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Search, 
  ChevronDown, 
  X, 
  Check, 
  Car, 
  AlertCircle, 
  CheckCircle2, 
  Wrench, 
  RefreshCw,
  FileText
} from 'lucide-react';

export default function GatePassReleaseDropdown({
  releases = [],
  loading = false,
  selected = null,
  onSelect,
  onRefresh,
  disabled = false,
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter items based on query
  const filteredReleases = useMemo(() => {
    if (!searchQuery.trim()) return releases;
    const q = searchQuery.trim().toLowerCase();
    return releases.filter(r => 
      (r.customerName && r.customerName.toLowerCase().includes(q)) ||
      (r.customerMobile && r.customerMobile.includes(q)) ||
      (r.vehicleNumber && r.vehicleNumber.toLowerCase().includes(q)) ||
      (r.jobCardNumber && r.jobCardNumber.toLowerCase().includes(q)) ||
      (r.invoiceNo && r.invoiceNo.toLowerCase().includes(q)) ||
      (r.vehicleDetails && r.vehicleDetails.toLowerCase().includes(q))
    );
  }, [releases, searchQuery]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setHighlightedIndex(0);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    const totalCount = filteredReleases.length + 1; // +1 for Custom Material option

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % totalCount);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + totalCount) % totalCount);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex === 0) {
        // Custom Material option
        onSelect(null);
        setIsOpen(false);
      } else {
        const item = filteredReleases[highlightedIndex - 1];
        if (item) {
          onSelect(item);
          setIsOpen(false);
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Selector Trigger Button */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={`flex-1 flex items-center justify-between px-3.5 py-2.5 bg-white dark:bg-slate-900 border rounded-xl text-left transition-all shadow-xs ${
            isOpen 
              ? 'border-indigo-500 ring-2 ring-indigo-500/20' 
              : selected 
                ? 'border-indigo-300 dark:border-indigo-800 bg-indigo-50/20 dark:bg-indigo-950/10' 
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <div className="flex items-center gap-2.5 truncate">
            {selected ? (
              selected.isPaid ? (
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Car className="w-4 h-4" />
                </div>
              ) : (
                <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-4 h-4" />
                </div>
              )
            ) : (
              <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
                <Search className="w-4 h-4" />
              </div>
            )}

            <div className="truncate">
              {selected ? (
                <div className="flex items-center gap-2 truncate">
                  <span className="font-mono font-bold text-xs uppercase text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                    {selected.vehicleNumber}
                  </span>
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">
                    {selected.customerName}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                    ({selected.customerMobile})
                  </span>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold hidden md:inline">
                    • {selected.invoiceNo || selected.jobCardNumber}
                  </span>
                  {selected.isPaid ? (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 rounded shrink-0">
                      PAID
                    </span>
                  ) : (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 rounded shrink-0">
                      BAL: ₹{selected.balanceDue?.toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                  Select an existing customer, vehicle, or completed invoice...
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {selected && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Clear selection (use manual / vendor mode)"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 transition-colors shadow-xs"
            title="Refresh eligible releases from database"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-500' : ''}`} />
          </button>
        )}
      </div>

      {/* Dropdown Menu Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-80 animate-fade-in">
          
          {/* Search Input Box */}
          <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search by customer, mobile, vehicle plate, JC, or invoice..."
              className="w-full bg-transparent text-xs font-semibold focus:outline-none dark:text-white placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Records List */}
          <div ref={listRef} className="overflow-y-auto flex-1 divide-y divide-slate-100 dark:divide-slate-800/60">
            
            {/* Option 0: Custom / Vendor Material Gate Pass */}
            <div
              onClick={() => {
                onSelect(null);
                setIsOpen(false);
              }}
              className={`p-3 cursor-pointer transition-colors flex items-center justify-between ${
                highlightedIndex === 0
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-850 dark:text-white flex items-center gap-1.5">
                    <span>🛠️ Custom / Vendor Material Gate Pass</span>
                    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded">
                      No Invoice
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Clearance for external lathe work, parts vendor dispatch, warranty return, or tool transport
                  </p>
                </div>
              </div>
              {!selected && (
                <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              )}
            </div>

            {/* Loading Indicator */}
            {loading ? (
              <div className="p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                <span>Loading eligible release records...</span>
              </div>
            ) : filteredReleases.length === 0 ? (
              <div className="p-6 text-center text-slate-400 dark:text-slate-500 text-xs">
                No matching customer releases found. Try searching by vehicle plate or customer name.
              </div>
            ) : (
              filteredReleases.map((release, idx) => {
                const itemIndex = idx + 1;
                const isSelected = selected?.id === release.id;
                const isHighlighted = highlightedIndex === itemIndex;

                return (
                  <div
                    key={release.id}
                    onClick={() => {
                      onSelect(release);
                      setIsOpen(false);
                    }}
                    onMouseEnter={() => setHighlightedIndex(itemIndex)}
                    className={`p-3 cursor-pointer transition-colors ${
                      isHighlighted 
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/30' 
                        : isSelected 
                          ? 'bg-slate-50 dark:bg-slate-800/40' 
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      
                      {/* Left: Vehicle and Customer Details */}
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-extrabold text-xs uppercase bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-2 py-0.5 rounded shadow-xs tracking-wider">
                            {release.vehicleNumber}
                          </span>
                          {release.vehicleDetails && (
                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-350">
                              {release.vehicleDetails}
                            </span>
                          )}
                          <span className="text-slate-300 dark:text-slate-600">•</span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {release.customerName}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {release.customerMobile}
                          </span>
                        </div>

                        {/* Subline: Invoice and Job Card info */}
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 flex-wrap">
                          {release.invoiceNo && (
                            <span className="flex items-center gap-1 font-semibold">
                              <FileText className="w-3 h-3 text-indigo-500" />
                              <span>INV: <strong className="text-slate-700 dark:text-slate-200">{release.invoiceNo}</strong></span>
                              <span className="text-[9px] px-1 bg-slate-100 dark:bg-slate-800 rounded font-medium">({release.invoiceStatus})</span>
                            </span>
                          )}
                          {release.jobCardNumber && (
                            <span>
                              JC: <strong className="text-slate-700 dark:text-slate-200">{release.jobCardNumber}</strong>
                            </span>
                          )}
                          <span>•</span>
                          <span>Total: <strong>₹{release.totalAmount?.toLocaleString('en-IN')}</strong></span>
                        </div>
                      </div>

                      {/* Right: Badges & Status */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {release.isPaid ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            PAID
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase px-2 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 rounded-full">
                            <AlertCircle className="w-3 h-3" />
                            DUE: ₹{release.balanceDue?.toLocaleString('en-IN')}
                          </span>
                        )}

                        {release.hasActiveGatePass && (
                          <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 rounded">
                            GP Active
                          </span>
                        )}

                        {isSelected && (
                          <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5" />
                        )}
                      </div>

                    </div>
                  </div>
                );
              })
            )}

          </div>

          {/* Footer note */}
          <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex justify-between items-center text-[10px] text-slate-400 font-semibold px-3">
            <span>Showing {filteredReleases.length} eligible release records</span>
            <span>Use ↑↓ arrows to navigate, Enter to select</span>
          </div>

        </div>
      )}
    </div>
  );
}
