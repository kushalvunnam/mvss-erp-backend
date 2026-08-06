import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../config';
import InternationalPhoneInput from '../components/InternationalPhoneInput';
import { Search, Plus, Edit2, Calendar, FileText, Receipt, ShieldAlert, Trash2, X } from 'lucide-react';

import { getCachedData, setCachedData } from '../utils/apiCache';

export default function Customers({ token, user }) {
  const [customers, setCustomers] = useState(() => getCachedData(`${API_BASE_URL}/customers?search=&type=`) || []);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  
  // Detail views & forms
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [customerVehicles, setCustomerVehicles] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'

  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    alternateNumber: '',
    email: '',
    address: '',
    gstNumber: '',
    aadhaarPan: '',
    type: 'Individual'
  });

  const fetchCustomers = async () => {
    const url = `${API_BASE_URL}/customers?search=${encodeURIComponent(search)}&type=${typeFilter}`;
    const cached = getCachedData(url);
    if (cached && customers.length === 0) setCustomers(cached);

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCachedData(url, data);
        setCustomers(data);
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  // Close modal on Esc keypress
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [search, typeFilter]);

  useEffect(() => {
    const globalFilter = localStorage.getItem('global_search_filter');
    if (globalFilter) {
      setSearch(globalFilter);
      localStorage.removeItem('global_search_filter');
    }
  }, []);

  const loadTimeline = async (customer) => {
    setSelectedCustomer(customer);
    setCustomerVehicles([]);
    try {
      const res = await fetch(`${API_BASE_URL}/customers/${customer._id}/timeline`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTimeline(data);
      }
    } catch (err) {
      console.error('Failed to load timeline:', err);
    }

    try {
      const res = await fetch(`${API_BASE_URL}/vehicles/customer/${customer._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCustomerVehicles(data);
      }
    } catch (err) {
      console.error('Failed to fetch customer vehicles:', err);
    }
  };

  const handleOpenAdd = () => {
    setFormData({
      name: '',
      mobile: '',
      alternateNumber: '',
      email: '',
      address: '',
      gstNumber: '',
      aadhaarPan: '',
      type: 'Individual'
    });
    setModalMode('add');
    setShowModal(true);
  };

  const handleOpenEdit = (c, e) => {
    e.stopPropagation(); // prevent opening details panel
    setFormData({
      name: c.name,
      mobile: c.mobile,
      alternateNumber: c.alternateNumber || '',
      email: c.email || '',
      address: c.address || '',
      gstNumber: c.gstNumber || '',
      aadhaarPan: c.aadhaarPan || '',
      type: c.type || 'Individual'
    });
    setSelectedCustomer(c);
    setModalMode('edit');
    setShowModal(true);
  };

  const handleGstChange = (e) => {
    const input = e.target;
    const originalValue = input.value;
    const processedValue = originalValue.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
    
    const selectionStart = input.selectionStart;
    setFormData(prev => ({ ...prev, gstNumber: processedValue }));

    requestAnimationFrame(() => {
      if (input) {
        const beforeCursor = originalValue.slice(0, selectionStart);
        const cleanBeforeCursor = beforeCursor.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const newCursorPos = cleanBeforeCursor.length;
        input.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  };

  const handleMobileChange = (val) => {
    setFormData(prev => ({ ...prev, mobile: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.mobile) {
      alert('Please enter a valid phone number.');
      return;
    } else if (formData.mobile.length < 8) {
      alert('Phone number is too short.');
      return;
    } else if (formData.mobile.length > 16) {
      alert('Phone number is too long.');
      return;
    }

    if (formData.gstNumber) {
      const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstRegex.test(formData.gstNumber)) {
        alert('Please enter a valid 15-character Indian GSTIN number (e.g. 29ABCDE1234F1Z5).');
        return;
      }
    }

    const url = modalMode === 'add' 
      ? `${API_BASE_URL}/customers`
      : `${API_BASE_URL}/customers/${selectedCustomer._id}`;
    
    const method = modalMode === 'add' ? 'POST' : 'PUT';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setShowModal(false);
        fetchCustomers();
        if (modalMode === 'edit') {
          const updated = await res.json();
          setSelectedCustomer(updated);
        }
      } else {
        const err = await res.json();
        alert(err.error || 'Operation failed');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCustomer = async (id, e) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to delete this customer? This action cannot be undone.')) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/customers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchCustomers();
        if (selectedCustomer?._id === id) {
          setSelectedCustomer(null);
          setTimeline([]);
        }
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to delete customer.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full animate-fade-in p-1">
      {/* List Area */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-white">Customers List</h2>
            <p className="text-xs text-slate-400 font-semibold dark:text-slate-500">Add, edit, or filter customer records</p>
          </div>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10"
          >
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, mobile, vehicle plate/brand/model, or job card no..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 text-xs font-bold focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Customer Types</option>
            <option value="Individual">Individual</option>
            <option value="Corporate">Corporate</option>
            <option value="Insurance">Insurance Agency</option>
          </select>
        </div>

        {/* Datatable */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
                  <th className="p-4">Customer Name</th>
                  <th className="p-4">Mobile</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">GST Number</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {customers.length > 0 ? (
                  customers.map(c => (
                    <tr
                      key={c._id}
                      onClick={() => loadTimeline(c)}
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 cursor-pointer transition-all ${
                        selectedCustomer?._id === c._id ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : ''
                      }`}
                    >
                      <td className="p-4 font-bold text-slate-800 dark:text-slate-200">{c.name}</td>
                      <td className="p-4 font-medium text-slate-550 dark:text-slate-400">{c.mobile}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          c.type === 'Corporate' ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/20 dark:text-sky-400' :
                          c.type === 'Insurance' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400' :
                          'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400'
                        }`}>
                          {c.type}
                        </span>
                      </td>
                      <td className="p-4 font-mono font-medium text-slate-500">{c.gstNumber || 'None'}</td>
                      <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={(e) => handleOpenEdit(c, e)}
                              className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="Edit Customer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {user?.role === 'Admin' && (
                              <button
                                onClick={(e) => handleDeleteCustomer(c._id, e)}
                                className="text-slate-400 hover:text-red-650 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title="Delete Customer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-slate-455 dark:text-slate-500 font-semibold">
                      No Results Found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Details Side Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col h-fit">
        {selectedCustomer ? (
          <div className="space-y-6">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">{selectedCustomer.type}</span>
              <h3 className="text-lg font-black text-slate-800 dark:text-white mt-1">{selectedCustomer.name}</h3>
              <div className="space-y-0.5 mt-1">
                <p className="text-xs text-slate-450 dark:text-slate-400 font-medium">Mobile: {selectedCustomer.mobile}</p>
                {selectedCustomer.alternateNumber && (
                  <p className="text-xs text-slate-450 dark:text-slate-400 font-medium">Alternate: {selectedCustomer.alternateNumber}</p>
                )}
                {selectedCustomer.email && (
                  <p className="text-xs text-slate-450 dark:text-slate-450 font-medium truncate">Email: {selectedCustomer.email}</p>
                )}
              </div>
              {selectedCustomer.address && (
                <p className="text-xs text-slate-400 font-medium mt-2 bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-lg border border-slate-100 dark:border-slate-850">
                  {selectedCustomer.address}
                </p>
              )}
            </div>

            {/* Registered Vehicles */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
              <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide mb-3">Registered Vehicles</h4>
              <div className="space-y-2">
                {customerVehicles.length > 0 ? (
                  customerVehicles.map((vh, idx) => (
                    <div key={idx} className="bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-100 dark:border-slate-850 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-mono font-bold text-indigo-650 dark:text-indigo-400 block">{vh.vehicleNumber}</span>
                        <span className="text-[10px] text-slate-400 font-semibold block">{vh.make} {vh.model} ({vh.fuelType} • {vh.transmission || 'Manual'})</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 font-semibold block">Odometer</span>
                        <span className="font-bold text-slate-700 dark:text-slate-350 block mt-0.5">{vh.odometerReading?.toLocaleString() || 0} km</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-450 dark:text-slate-550 text-center py-2 text-xs italic font-semibold">No vehicles registered.</p>
                )}
              </div>
            </div>

            {/* Service history timeline */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
              <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide mb-4">Service Timeline</h4>
              
              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                {timeline.length > 0 ? (
                  timeline.map((event, idx) => {
                    let iconBg = 'bg-slate-100 text-slate-650';
                    let Icon = FileText;

                    if (event.type === 'Invoice') {
                      iconBg = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400';
                      Icon = Receipt;
                    } else if (event.type === 'Claim') {
                      iconBg = 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400';
                      Icon = Calendar;
                    }

                    return (
                      <div key={idx} className="flex gap-3 items-start relative pb-4">
                        {idx !== timeline.length - 1 && (
                          <span className="w-0.5 bg-slate-100 dark:bg-slate-800 absolute left-4.5 top-6 bottom-0" />
                        )}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-800 dark:text-slate-250">{event.type}</span>
                            <span className="text-[10px] text-slate-400 font-semibold">{event.number}</span>
                            {event.status && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-350">
                                {event.status}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-500 dark:text-slate-400 font-medium mt-0.5">{event.details}</p>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block mt-1">
                            {new Date(event.date).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-slate-400 dark:text-slate-500 text-center py-4 text-xs font-semibold">No service history compiled.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-20 text-slate-400 dark:text-slate-500 font-semibold text-xs">
            Select a customer to view history logs and profile timelines.
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && createPortal(
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex justify-center items-center p-3 sm:p-6 z-[99999] select-none overflow-hidden animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[90vw] max-w-[800px] h-[80vh] max-h-[80vh] shadow-2xl flex flex-col relative overflow-hidden my-auto animate-scale-in">
            <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/40 shrink-0 mb-0">
              <h3 className="text-lg font-black text-slate-850 dark:text-white uppercase tracking-wider">
                {modalMode === 'add' ? 'New Customer Details' : 'Edit Customer Details'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Full Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Rahul Sharma"
                  className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide mb-1">Mobile Number</label>
                  <InternationalPhoneInput
                    value={formData.mobile}
                    onChange={handleMobileChange}
                    country="IN"
                    variant="compact"
                    name="mobile"
                    required={true}
                    ariaLabel="Mobile number"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide mb-1">Alternate Phone</label>
                  <InternationalPhoneInput
                    value={formData.alternateNumber}
                    onChange={(val) => setFormData({ ...formData, alternateNumber: val })}
                    country="IN"
                    variant="compact"
                    name="alternateNumber"
                    ariaLabel="Alternate phone number"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Customer Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Individual">Individual</option>
                    <option value="Corporate">Corporate</option>
                    <option value="Insurance">Insurance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Email ID</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="rahul@example.com"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">GST Number</label>
                  <input
                    type="text"
                    value={formData.gstNumber}
                    onChange={handleGstChange}
                    placeholder="Enter GST Number"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Aadhaar / PAN</label>
                  <input
                    type="text"
                    value={formData.aadhaarPan}
                    onChange={(e) => setFormData({ ...formData, aadhaarPan: e.target.value })}
                    placeholder="12-digit Aadhaar / 10-digit PAN"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Address</label>
                <textarea
                  rows="3"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="House No, Street name, City, Zipcode..."
                  className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex justify-end gap-3 shrink-0 rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-150 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-750 dark:text-slate-350 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-bold transition-all"
                >
                  {modalMode === 'add' ? 'Register' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
