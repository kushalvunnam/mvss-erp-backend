import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../config';
import { Search, Plus, Edit2, Calendar, FileText, ClipboardList, Trash2, X } from 'lucide-react';

import { getCachedData, setCachedData } from '../utils/apiCache';

export default function Vehicles({ token, user }) {
  const [vehicles, setVehicles] = useState(() => getCachedData(`${API_BASE_URL}/vehicles?search=`) || []);
  const [customers, setCustomers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [history, setHistory] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('add');

  const [formData, setFormData] = useState({
    vehicleNumber: '',
    chassisNumber: '',
    engineNumber: '',
    make: '',
    model: '',
    variant: '',
    fuelType: 'Petrol',
    transmission: 'Manual',
    color: '',
    insuranceCompany: '',
    insurancePolicyNumber: '',
    insuranceExpiryDate: '',
    odometerReading: '',
    customerId: ''
  });

  // Debounce search state
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchVehicles = async () => {
    const url = `${API_BASE_URL}/vehicles?search=${encodeURIComponent(debouncedSearch)}`;
    const cached = getCachedData(url);
    if (cached && vehicles.length === 0) setVehicles(cached);

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCachedData(url, data);
        setVehicles(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/customers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
      }
    } catch (err) {
      console.error(err);
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

  // Fetch customers once on mount
  useEffect(() => {
    fetchCustomers();
  }, []);

  // Fetch vehicles when debouncedSearch changes
  useEffect(() => {
    fetchVehicles();
  }, [debouncedSearch]);

  useEffect(() => {
    const globalFilter = localStorage.getItem('global_search_filter');
    if (globalFilter) {
      setSearch(globalFilter);
      localStorage.removeItem('global_search_filter');
    }
  }, []);

  const loadHistory = async (vehicle) => {
    setSelectedVehicle(vehicle);
    try {
      const res = await fetch(`${API_BASE_URL}/vehicles/${vehicle._id}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenAdd = () => {
    setFormData({
      vehicleNumber: '',
      chassisNumber: '',
      engineNumber: '',
      make: '',
      model: '',
      variant: '',
      fuelType: 'Petrol',
      transmission: 'Manual',
      color: '',
      insuranceCompany: '',
      insurancePolicyNumber: '',
      insuranceExpiryDate: '',
      odometerReading: '',
      customerId: customers[0]?._id || ''
    });
    setModalMode('add');
    setShowModal(true);
  };

  const handleOpenEdit = (v, e) => {
    e.stopPropagation();
    setFormData({
      vehicleNumber: v.vehicleNumber,
      chassisNumber: v.chassisNumber || '',
      engineNumber: v.engineNumber || '',
      make: v.make,
      model: v.model,
      variant: v.variant || '',
      fuelType: v.fuelType || 'Petrol',
      transmission: v.transmission || 'Manual',
      color: v.color || '',
      insuranceCompany: v.insuranceCompany || '',
      insurancePolicyNumber: v.insurancePolicyNumber || '',
      insuranceExpiryDate: v.insuranceExpiryDate ? v.insuranceExpiryDate.split('T')[0] : '',
      odometerReading: v.odometerReading !== undefined && v.odometerReading !== null ? v.odometerReading.toString() : '',
      customerId: v.customerId?._id || ''
    });
    setSelectedVehicle(v);
    setModalMode('edit');
    setShowModal(true);
  };

  const handleDeleteVehicle = async (id, e) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to delete this vehicle permanently? This action cannot be undone.')) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/vehicles/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchVehicles();
        if (selectedVehicle?._id === id) {
          setSelectedVehicle(null);
          setHistory([]);
        }
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to delete vehicle.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client-side validations
    if (!formData.vehicleNumber || !formData.vehicleNumber.trim()) {
      alert('Vehicle Registration Number is required.');
      return;
    }
    if (!formData.customerId) {
      alert('Owner / Customer must be selected.');
      return;
    }
    if (!formData.make || !formData.make.trim()) {
      alert('Vehicle Make is required.');
      return;
    }
    if (!formData.model || !formData.model.trim()) {
      alert('Vehicle Model is required.');
      return;
    }

    if (saving) return;
    setSaving(true);

    const payload = {
      ...formData,
      odometerReading: Number(formData.odometerReading) || 0
    };
    const url = modalMode === 'add'
      ? `${API_BASE_URL}/vehicles`
      : `${API_BASE_URL}/vehicles/${selectedVehicle._id}`;
    
    const method = modalMode === 'add' ? 'POST' : 'PUT';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert(modalMode === 'add' ? 'Vehicle added successfully.' : 'Vehicle details updated successfully.');
        setShowModal(false);
        
        // Reset form data on successful add
        if (modalMode === 'add') {
          setFormData({
            vehicleNumber: '',
            chassisNumber: '',
            engineNumber: '',
            make: '',
            model: '',
            variant: '',
            fuelType: 'Petrol',
            transmission: 'Manual',
            color: '',
            insuranceCompany: '',
            insurancePolicyNumber: '',
            insuranceExpiryDate: '',
            odometerReading: '',
            customerId: customers[0]?._id || ''
          });
        } else {
          const updated = await res.json();
          setSelectedVehicle(updated);
        }
        
        // Refresh list
        fetchVehicles();
      } else {
        const err = await res.json();
        alert(err.error || 'Operation failed');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred while saving the vehicle.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full animate-fade-in p-1">
      {/* Table Section */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-white">Vehicles Register</h2>
            <p className="text-xs text-slate-400 font-semibold dark:text-slate-500">Search and manage workshop vehicles log</p>
          </div>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10"
          >
            <Plus className="w-4 h-4" /> Add Vehicle
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by registration number, chassis number, make, model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Datatable */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
                  <th className="p-4">Reg Number</th>
                  <th className="p-4">Model & Make</th>
                  <th className="p-4">Owner Name</th>
                  <th className="p-4">Odometer</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {vehicles.length > 0 ? (
                  vehicles.map(v => (
                    <tr
                      key={v._id}
                      onClick={() => loadHistory(v)}
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 cursor-pointer transition-all ${
                        selectedVehicle?._id === v._id ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : ''
                      }`}
                    >
                      <td className="p-4 font-bold text-slate-800 dark:text-slate-200 font-mono tracking-wider">{v.vehicleNumber}</td>
                      <td className="p-4 font-semibold text-slate-650 dark:text-slate-300">
                        {v.make} {v.model} <span className="text-slate-400 font-medium text-[10px] ml-1">{v.variant || 'N/A'} • {v.transmission || 'Manual'}</span>
                      </td>
                      <td className="p-4 font-medium text-slate-550 dark:text-slate-400">
                        {v.customerId ? v.customerId.name : 'Unknown'}
                      </td>
                      <td className="p-4 font-semibold text-slate-550 dark:text-slate-400">{v.odometerReading.toLocaleString()} km</td>
                      <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={(e) => handleOpenEdit(v, e)}
                            className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {user?.role === 'Admin' && (
                            <button
                              onClick={(e) => handleDeleteVehicle(v._id, e)}
                              className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-slate-105 dark:hover:bg-slate-800 transition-colors"
                              title="Delete Vehicle"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-slate-400 dark:text-slate-500 font-semibold">
                      No vehicle records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Details / History Column */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col h-fit">
        {selectedVehicle ? (
          <div className="space-y-6">
            <div>
              <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{selectedVehicle.fuelType}</span>
              <h3 className="text-lg font-black text-slate-800 dark:text-white mt-2 font-mono tracking-wider">{selectedVehicle.vehicleNumber}</h3>
              <p className="text-xs text-slate-550 dark:text-slate-300 font-semibold mt-1">
                {selectedVehicle.make} {selectedVehicle.model} {selectedVehicle.variant} • {selectedVehicle.transmission || 'Manual'}
              </p>
              
              <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs text-slate-400 font-medium">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide">Chassis Number</span>
                  <span className="text-slate-700 dark:text-slate-300 font-bold font-mono">{selectedVehicle.chassisNumber || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide">Engine Number</span>
                  <span className="text-slate-700 dark:text-slate-300 font-bold font-mono">{selectedVehicle.engineNumber || 'N/A'}</span>
                </div>
              </div>

              {selectedVehicle.insuranceCompany && (
                <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-850 rounded-xl space-y-1">
                  <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wide block">Insurance Details</span>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{selectedVehicle.insuranceCompany}</p>
                  <p className="text-[10px] text-slate-400 font-semibold">Policy: {selectedVehicle.insurancePolicyNumber || 'N/A'}</p>
                  {selectedVehicle.insuranceExpiryDate && (
                    <p className="text-[10px] text-slate-400 font-semibold">
                      Expiry: {new Date(selectedVehicle.insuranceExpiryDate).toLocaleDateString('en-IN')}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Repair history */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
              <h4 className="text-xs font-extrabold text-slate-850 dark:text-slate-200 uppercase tracking-wide mb-4">Previous Repairs</h4>
              
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {history.length > 0 ? (
                  history.map((jc, idx) => (
                    <div key={jc._id} className="p-3 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-850 transition-all flex gap-3 items-start">
                      <ClipboardList className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                      <div className="text-xs flex-1">
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-slate-800 dark:text-slate-250">{jc.jobCardNo}</span>
                          <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
                            jc.status === 'Delivered' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20' : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20'
                          }`}>
                            {jc.status}
                          </span>
                        </div>
                        <p className="text-slate-450 dark:text-slate-400 font-medium mt-1">KM: {jc.odometerReading.toLocaleString()} | {jc.serviceType}</p>
                        <p className="text-slate-400 dark:text-slate-550 font-semibold text-[9px] mt-2 block">
                          Advisor: {jc.serviceAdvisorId ? jc.serviceAdvisorId.name : 'System'} | {new Date(jc.date).toLocaleDateString('en-IN')}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-400 dark:text-slate-500 text-center py-4 text-xs font-semibold">No previous repair cards found.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-20 text-slate-400 dark:text-slate-500 font-semibold text-xs">
            Select a vehicle to inspect identifiers and service card logs.
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {showModal && createPortal(
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex justify-center items-center p-3 sm:p-6 z-[99999] select-none overflow-hidden animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[90vw] max-w-[850px] h-[80vh] max-h-[80vh] shadow-2xl flex flex-col relative overflow-hidden my-auto animate-scale-in">
            <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/40 shrink-0 mb-0">
              <h3 className="text-lg font-black text-slate-850 dark:text-white uppercase tracking-wider">
                {modalMode === 'add' ? 'New Vehicle Record' : 'Edit Vehicle Details'}
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Vehicle Reg Number</label>
                  <input
                    type="text"
                    required
                    disabled={modalMode === 'edit'}
                    value={formData.vehicleNumber}
                    onChange={(e) => setFormData({ ...formData, vehicleNumber: e.target.value })}
                    placeholder="TS09EP1234"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 uppercase disabled:opacity-55"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Owner / Customer</label>
                  <select
                    value={formData.customerId}
                    onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                    disabled={modalMode === 'edit'}
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 disabled:opacity-55"
                  >
                    {customers.map(c => (
                      <option key={c._id} value={c._id}>{c.name} ({c.mobile})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Make</label>
                  <input
                    type="text"
                    required
                    value={formData.make}
                    onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                    placeholder="Maruti Suzuki"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Model</label>
                  <input
                    type="text"
                    required
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="Swift"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Variant</label>
                  <input
                    type="text"
                    value={formData.variant}
                    onChange={(e) => setFormData({ ...formData, variant: e.target.value })}
                    placeholder="VXI"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Fuel Type</label>
                  <select
                    value={formData.fuelType}
                    onChange={(e) => setFormData({ ...formData, fuelType: e.target.value })}
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Petrol">Petrol</option>
                    <option value="Diesel">Diesel</option>
                    <option value="CNG">CNG</option>
                    <option value="Electric">Electric</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Transmission</label>
                  <select
                    value={formData.transmission}
                    onChange={(e) => setFormData({ ...formData, transmission: e.target.value })}
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Manual">Manual</option>
                    <option value="Automatic">Automatic</option>
                    <option value="AMT">AMT</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Color</label>
                  <input
                    type="text"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="White"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Odometer Reading</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={formData.odometerReading}
                    onChange={(e) => {
                      const val = e.target.value;
                      let cleaned = val.replace(/[^0-9]/g, '');
                      if (cleaned.startsWith('0') && cleaned.length > 1) {
                        cleaned = cleaned.replace(/^0+/, '');
                      }
                      setFormData({ ...formData, odometerReading: cleaned });
                    }}
                    placeholder="Enter odometer reading"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800 pt-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Engine Number</label>
                  <input
                    type="text"
                    value={formData.engineNumber}
                    onChange={(e) => setFormData({ ...formData, engineNumber: e.target.value })}
                    placeholder="K12M12345"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Chassis Number</label>
                  <input
                    type="text"
                    value={formData.chassisNumber}
                    onChange={(e) => setFormData({ ...formData, chassisNumber: e.target.value })}
                    placeholder="MA3FDB123456789"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-3">
                <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider block">Insurance Company Coverage</span>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Insurance Provider</label>
                  <input
                    type="text"
                    value={formData.insuranceCompany}
                    onChange={(e) => setFormData({ ...formData, insuranceCompany: e.target.value })}
                    placeholder="ICICI Lombard General Insurance"
                    className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Policy Number</label>
                    <input
                      type="text"
                      value={formData.insurancePolicyNumber}
                      onChange={(e) => setFormData({ ...formData, insurancePolicyNumber: e.target.value })}
                      placeholder="POL-1234567"
                      className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wide">Policy Expiry</label>
                    <input
                      type="date"
                      value={formData.insuranceExpiryDate}
                      onChange={(e) => setFormData({ ...formData, insuranceExpiryDate: e.target.value })}
                      className="mt-1 block w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
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
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : (modalMode === 'add' ? 'Save Vehicle' : 'Save Changes')}
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
