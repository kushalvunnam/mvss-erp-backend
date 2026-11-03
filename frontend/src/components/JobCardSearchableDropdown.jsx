import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, X } from 'lucide-react';
import { API_BASE_URL } from '../config';

const ROW_HEIGHT = 52;

function defaultRenderLabel(item) {
  return `${item.customerName || 'Unknown Customer'} | ${item.jobCardNo} | Reg: ${item.vehicleNo || 'N/A'} | ${item.vehicleModel || 'No Vehicle Info'}`;
}

export default function JobCardSearchableDropdown({
  value,
  onSelect,
  disabled = false,
  className = '',
  excludeDelivered = true,
  token,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  
  const [items, setItems] = useState([]);
  const [searching, setSearching] = useState(false);
  
  // Use a ref for cache to avoid callback invalidation and re-render loops
  const cacheRef = useRef({});

  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debounceTimer = useRef(null);
  const activeRequestRef = useRef(null);
  
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
            const maxAvailableWidth = Math.max(200, window.innerWidth - 24);
      const minWidth = Math.min(260, maxAvailableWidth);
      const widthVal = Math.min(Math.max(rect.width, minWidth), maxAvailableWidth);
      
      let leftVal = rect.left;
      if (leftVal + widthVal > window.innerWidth - 12) {
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

  const fetchJobCards = useCallback(async (searchQuery) => {
    const trimmed = searchQuery.trim();
    
    if (cacheRef.current[trimmed]) {
      setItems(cacheRef.current[trimmed]);
      setSearching(false);
      return;
    }

    if (activeRequestRef.current) {
      activeRequestRef.current.abort();
    }

    const controller = new AbortController();
    activeRequestRef.current = controller;
    setSearching(true);

    try {
      const res = await fetch(
        `${API_BASE_URL}/jobcards/search?q=${encodeURIComponent(trimmed)}&excludeDelivered=${excludeDelivered}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        }
      );
      if (res.ok) {
        const data = await res.json();
        setItems(data);
        cacheRef.current[trimmed] = data;
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to fetch job cards:', err);
      }
    } finally {
      if (activeRequestRef.current === controller) {
        setSearching(false);
        activeRequestRef.current = null;
      }
    }
  }, [excludeDelivered, token]);

  const selectedItem = useMemo(() => {
    const found = items.find(i => i._id === value);
    if (found) return found;
    for (const key of Object.keys(cacheRef.current)) {
      const cacheFound = cacheRef.current[key].find(i => i._id === value);
      if (cacheFound) return cacheFound;
    }
    return null;
  }, [items, value]);

  useEffect(() => {
    if (value && !selectedItem && token) {
      const fetchSingle = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/jobcards/${value}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const jc = await res.json();
            const formatted = {
              _id: jc._id,
              jobCardNo: jc.jobCardNo,
              status: jc.status,
              vehicleNo: jc.vehicleId?.vehicleNumber || '',
              customerName: jc.customerId?.name || jc.customerId?.companyName || '',
              vehicleModel: jc.vehicleId ? `${jc.vehicleId.make || ''} ${jc.vehicleId.model || ''}`.trim() : '',
              dateFormatted: new Date(jc.date || jc.createdAt).toLocaleDateString('en-IN')
            };
            setItems(prev => {
              if (prev.find(p => p._id === formatted._id)) return prev;
              return [formatted, ...prev];
            });
            cacheRef.current[''] = cacheRef.current[''] ? [formatted, ...cacheRef.current['']] : [formatted];
          }
        } catch (err) {
          console.error(err);
        }
      };
      fetchSingle();
    }
  }, [value, selectedItem, token]);

  // Debounce query input changes (150ms for fast feedback)
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 150);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [query]);

  // Trigger search when open or debouncedQuery changes
  useEffect(() => {
    if (open) {
      fetchJobCards(debouncedQuery);
    }
  }, [debouncedQuery, open, fetchJobCards]);

  useEffect(() => {
    setHighlightedIdx(0);
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
        const next = Math.min(prev + 1, items.length - 1);
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
      if (items[highlightedIdx]) {
        handleSelect(items[highlightedIdx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={`relative flex items-center w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none cursor-pointer ${disabled ? 'opacity-55 pointer-events-none' : ''}`}
        onClick={() => !disabled && setOpen(o => !o)}
      >
        <span className={`flex-1 truncate ${selectedItem ? 'text-slate-700 dark:text-slate-200' : 'text-slate-450'}`}>
          {selectedItem ? defaultRenderLabel(selectedItem) : '-- Choose Job Card --'}
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
              placeholder="Search job card no, vehicle plate, customer name..."
              className="w-full bg-transparent border-none outline-none text-xs font-semibold text-slate-700 dark:text-slate-200 placeholder:text-slate-450"
              autoComplete="off"
            />
          </div>

          {searching ? (
            <div className="px-4 py-5 text-center text-xs text-slate-450 font-bold italic animate-pulse">
              Searching...
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-slate-450 font-bold italic">
              No job cards found.
            </div>
          ) : (
            <div
              ref={listRef}
              className="overflow-auto scrollbar-thin"
              style={{ maxHeight: `calc(${coords.maxHeight} - 60px)` }}
            >
              {items.map((item, idx) => (
                <div
                  key={item._id}
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(item); }}
                  onMouseEnter={() => setHighlightedIdx(idx)}
                  className={`px-4 py-2 flex flex-col justify-center cursor-pointer border-b border-slate-50 dark:border-slate-800/40 w-full ${
                    idx === highlightedIdx
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                  style={{ height: ROW_HEIGHT }}
                >
                  <span className="text-xs font-bold block truncate">
                    {item.customerName || 'Unknown Customer'}
                  </span>
                  <span className="text-[10px] text-slate-450 mt-0.5 block truncate">
                    {item.jobCardNo}  •  {item.vehicleNo || 'N/A'}  •  {item.vehicleModel || 'No Vehicle Info'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {items.length > 0 && !searching && (
            <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2 text-[9px] text-slate-450 font-bold uppercase tracking-wider flex justify-between select-none shrink-0 bg-white dark:bg-slate-900 mt-auto">
              <span>{items.length} result{items.length !== 1 ? 's' : ''}</span>
              <span>Navigate / Select / Esc Close</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
