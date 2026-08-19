import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, X } from 'lucide-react';

const ROW_HEIGHT = 38;
const VIRTUALIZATION_THRESHOLD = 500;

const PART_SEARCH_FIELDS = ['partName', 'partNumber', 'partCode', 'oemBrand', 'hsnCode', 'brand', 'supplier', 'vehicleCompatibility', 'model', 'alias'];
const LABOUR_SEARCH_FIELDS = ['partName', 'partNumber', 'partCode', 'category', 'hsnCode', 'model', 'alias', 'oemBrand', 'description'];
const VENDOR_SEARCH_FIELDS = ['name', 'vendorCode', 'mobile', 'phone', 'city', 'supplierType'];
const JOBCARD_SEARCH_FIELDS = ['jobCardNo', 'vehicleNo', 'customerName', 'vehicleModel', 'dateFormatted', 'status'];
const CUSTOMER_SEARCH_FIELDS = ['name', 'mobile', 'email', 'gstNumber', 'companyName'];
const VEHICLE_SEARCH_FIELDS = ['vehicleNumber', 'make', 'model', 'variant', 'chassisNumber'];
const EMPLOYEE_SEARCH_FIELDS = ['name', 'email', 'phone', 'role', 'department', 'employeeId'];
const INVOICE_SEARCH_FIELDS = ['invoiceNo', 'customerName', 'vehicleNo', 'invoiceType'];

function buildMatcher(query, fields) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return null;
  return (item) => {
    const haystack = fields.map(f => (item[f] != null ? String(item[f]) : '').toLowerCase()).join(' ');
    return terms.every(t => haystack.includes(t));
  };
}

function defaultRenderLabel(item, type = 'parts') {
  if (type === 'labour') {
    const desc = item.partName || item.description || item.name || '';
    const code = item.partCode || item.partNumber || '';
    const category = item.category ? `[${item.category}]` : '';
    const model = item.model ? `(${item.model})` : '';
    return `${desc} ${category} ${model} ${code ? `(${code})` : ''}`.replace(/\s+/g, ' ').trim();
  }
  if (type === 'vendors') {
    const name = item.name || '';
    const code = item.vendorCode ? `(${item.vendorCode})` : '';
    const phone = item.mobile || item.phone ? `- Phone: ${item.mobile || item.phone}` : '';
    return `${name} ${code} ${phone}`.replace(/\s+/g, ' ').trim();
  }
  if (type === 'jobcards') {
    return `${item.jobCardNo} | Reg: ${item.vehicleNo} | Cust: ${item.customerName} | Vehicle: ${item.vehicleModel} | Date: ${item.dateFormatted} | Status: ${item.status}`;
  }
  if (type === 'customers') {
    const company = item.companyName ? `[${item.companyName}] ` : '';
    const nameVal = item.name || '';
    const mobileVal = item.mobile ? `- Phone: ${item.mobile}` : '';
    return `${company}${nameVal} ${mobileVal}`.replace(/\s+/g, ' ').trim();
  }
  if (type === 'vehicles') {
    const reg = item.vehicleNumber || '';
    const modelInfo = `${item.make || ''} ${item.model || ''} ${item.variant || ''}`.trim();
    return `${reg} (${modelInfo || 'Unknown Vehicle'})`.trim();
  }
  if (type === 'employees') {
    return `${item.name || ''} (${item.role || ''} - Dept: ${item.department || 'General'})`.trim();
  }
  if (type === 'invoices') {
    return `${item.invoiceNo} | ${item.invoiceType || ''} | Cust: ${item.customerName || ''} | Total: ₹${item.totals?.grandTotal?.toLocaleString() || '0'}`;
  }
  const name = item.partName || item.name || '';
  const num = item.partNumber || '';
  const brand = item.brand ? `[${item.brand}]` : '';
  const model = item.model ? `(${item.model}${item.variant ? ` - ${item.variant}` : ''})` : '';
  return `${name} ${brand} ${model} (${num})`.replace(/\s+/g, ' ').trim();
}

export default function SearchableDropdown({
  items = [],
  value,
  onSelect,
  placeholder = 'Search...',
  emptyOptionLabel = '-- Custom --',
  searchFields,
  renderItemLabel,
  disabled = false,
  className = '',
  type = 'parts',
}) {
  const fields = searchFields || (
    type === 'labour' ? LABOUR_SEARCH_FIELDS :
    type === 'vendors' ? VENDOR_SEARCH_FIELDS :
    type === 'jobcards' ? JOBCARD_SEARCH_FIELDS :
    type === 'customers' ? CUSTOMER_SEARCH_FIELDS :
    type === 'vehicles' ? VEHICLE_SEARCH_FIELDS :
    type === 'employees' ? EMPLOYEE_SEARCH_FIELDS :
    type === 'invoices' ? INVOICE_SEARCH_FIELDS :
    PART_SEARCH_FIELDS
  );
  const renderLabel = renderItemLabel || ((item) => defaultRenderLabel(item, type));

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debounceTimer = useRef(null);
  const viewportHeight = 260;

  const [coords, setCoords] = useState({
    top: 'auto',
    bottom: 'auto',
    left: '0px',
    width: 'auto',
    maxHeight: '320px',
  });

  const updateCoords = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const margin = 4;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      const openUpward = spaceBelow < 320 && spaceAbove > spaceBelow;
      const minWidth = 260;
      const widthVal = Math.max(rect.width, minWidth);
      
      let leftVal = rect.left;
      if (leftVal + widthVal > window.innerWidth) {
        leftVal = window.innerWidth - widthVal - 12;
      }
      if (leftVal < 12) {
        leftVal = 12;
      }

      if (openUpward) {
        setCoords({
          top: 'auto',
          bottom: `${window.innerHeight - rect.top + margin}px`,
          left: `${leftVal}px`,
          width: `${widthVal}px`,
          maxHeight: `${Math.max(100, rect.top - margin - 12)}px`,
        });
      } else {
        setCoords({
          top: `${rect.bottom + margin}px`,
          bottom: 'auto',
          left: `${leftVal}px`,
          width: `${widthVal}px`,
          maxHeight: `${Math.max(100, window.innerHeight - rect.bottom - margin - 12)}px`,
        });
      }
    }
  }, []);

  const selectedItem = useMemo(
    () => items.find(i => i._id === value) || null,
    [items, value]
  );

  const filtered = useMemo(() => {
    const matcher = buildMatcher(debouncedQuery, fields);
    if (!matcher) return items;
    return items.filter(matcher);
  }, [items, debouncedQuery, fields]);

  const shouldVirtualize = filtered.length > VIRTUALIZATION_THRESHOLD;
  const effectiveList = filtered;
  const visibleStart = shouldVirtualize ? Math.max(0, Math.floor(scrollOffset / ROW_HEIGHT) - 2) : 0;
  const visibleCount = shouldVirtualize ? Math.ceil(viewportHeight / ROW_HEIGHT) + 4 : effectiveList.length;
  const virtualItems = shouldVirtualize
    ? effectiveList.slice(visibleStart, visibleStart + visibleCount)
    : effectiveList;
  const totalListHeight = shouldVirtualize ? effectiveList.length * ROW_HEIGHT : 0;
  const paddingTop = shouldVirtualize ? visibleStart * ROW_HEIGHT : 0;

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 180);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [query]);

  useEffect(() => {
    setHighlightedIdx(0);
    setScrollOffset(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [debouncedQuery]);

  useEffect(() => {
    if (open) {
      updateCoords();
      window.addEventListener('scroll', updateCoords, true);
      window.addEventListener('resize', updateCoords, true);
    }
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords, true);
    };
  }, [open, updateCoords]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [open]);

  const scrollToIndex = useCallback((idx) => {
    if (!listRef.current) return;
    const targetTop = idx * ROW_HEIGHT;
    const currentScroll = listRef.current.scrollTop;
    if (targetTop < currentScroll) {
      listRef.current.scrollTop = targetTop;
    } else if (targetTop + ROW_HEIGHT > currentScroll + viewportHeight) {
      listRef.current.scrollTop = targetTop + ROW_HEIGHT - viewportHeight;
    }
  }, [viewportHeight]);

  const handleSelect = useCallback((item) => {
    onSelect(item ? item._id : '');
    setOpen(false);
    setQuery('');
    setDebouncedQuery('');
  }, [onSelect]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlightedIdx(prev => {
        const next = Math.min(prev + 1, effectiveList.length - 1);
        scrollToIndex(next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlightedIdx(prev => {
        const next = Math.max(prev - 1, 0);
        scrollToIndex(next);
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      if (effectiveList[highlightedIdx]) {
        handleSelect(effectiveList[highlightedIdx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const handleScroll = (e) => {
    if (shouldVirtualize) {
      setScrollOffset(e.target.scrollTop);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={`relative flex items-center w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none cursor-pointer ${disabled ? 'opacity-55 pointer-events-none' : ''}`}
        onClick={() => !disabled && setOpen(o => !o)}
      >
        <span className={`flex-1 truncate ${selectedItem ? 'text-slate-700 dark:text-slate-200' : 'text-slate-450'}`}>
          {selectedItem ? renderLabel(selectedItem) : emptyOptionLabel}
        </span>
        <div className="flex items-center gap-1 ml-1 shrink-0">
          {selectedItem && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleSelect(null); }}
              className="text-slate-400 hover:text-red-500 mr-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{
            position: 'fixed',
            zIndex: 1000000,
            top: coords.top,
            bottom: coords.bottom,
            left: coords.left,
            width: coords.width,
            maxHeight: coords.maxHeight,
          }}
        >
          <div className="border-b border-slate-100 dark:border-slate-800 p-2 bg-slate-50/50 dark:bg-slate-950/40 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-450 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full bg-transparent border-none outline-none text-xs font-semibold text-slate-700 dark:text-slate-200 placeholder:text-slate-450"
              autoComplete="off"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-slate-450 font-bold italic">
              {
                type === 'labour' ? 'No services found.' :
                type === 'vendors' ? 'No vendors found.' :
                type === 'jobcards' ? 'No job cards found.' :
                type === 'customers' ? 'No customers found.' :
                type === 'vehicles' ? 'No vehicles found.' :
                type === 'employees' ? 'No employees found.' :
                type === 'invoices' ? 'No invoices found.' :
                'No spare parts found.'
              }
            </div>
          ) : (
            <div
              ref={listRef}
              onScroll={handleScroll}
              className="overflow-auto scrollbar-thin"
              style={{ maxHeight: `calc(${coords.maxHeight} - 60px)` }}
            >
              {shouldVirtualize && (
                <div style={{ height: totalListHeight, position: 'relative' }}>
                  <div style={{ transform: `translateY(${paddingTop}px)` }}>
                    {virtualItems.map((item, vi) => {
                      const realIdx = visibleStart + vi;
                      return (
                        <div
                          key={item._id}
                          onMouseDown={(e) => { e.preventDefault(); handleSelect(item); }}
                          onMouseEnter={() => setHighlightedIdx(realIdx)}
                          className={`px-4 flex items-center text-xs font-semibold cursor-pointer whitespace-nowrap w-fit min-w-full ${
                            realIdx === highlightedIdx
                              ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                          style={{ height: ROW_HEIGHT }}
                        >
                          {renderLabel(item)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {!shouldVirtualize && virtualItems.map((item, idx) => (
                <div
                  key={item._id}
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(item); }}
                  onMouseEnter={() => setHighlightedIdx(idx)}
                  className={`px-4 flex items-center text-xs font-semibold cursor-pointer whitespace-nowrap w-fit min-w-full ${
                    idx === highlightedIdx
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                  style={{ height: ROW_HEIGHT }}
                >
                  {renderLabel(item)}
                </div>
              ))}
            </div>
          )}

          {filtered.length > 0 && (
            <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2 text-[9px] text-slate-450 font-bold uppercase tracking-wider flex justify-between select-none shrink-0 bg-white dark:bg-slate-900 mt-auto">
              <span>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
              <span>Navigate / Select / Esc Close</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
