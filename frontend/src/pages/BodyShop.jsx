import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../config';
import { 
  Wrench, 
  Car, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Image as ImageIcon, 
  Camera, 
  AlertCircle, 
  ShieldAlert, 
  Sparkles, 
  UploadCloud, 
  User, 
  Gauge, 
  Check, 
  ArrowRight,
  ShieldCheck,
  Calendar,
  IndianRupee,
  Plus
} from 'lucide-react';

export default function BodyShop({ token, user, onNavigateToJobCard, setActiveTab }) {
  const [jobCards, setJobCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [brokenImages, setBrokenImages] = useState({});
  const [selectedJc, setSelectedJc] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Form states for updates
  const [dentProgress, setDentProgress] = useState(0);
  const [paintProgress, setPaintProgress] = useState(0);
  const [chassisProgress, setChassisProgress] = useState(0);
  const [glassProgress, setGlassProgress] = useState(0);
  const [bumperProgress, setBumperProgress] = useState(0);
  const [labourDetails, setLabourDetails] = useState('');
  const [materialUsed, setMaterialUsed] = useState('');
  const [completionStatus, setCompletionStatus] = useState('In Progress');
  const [notes, setNotes] = useState('');
  const [estDeliveryDate, setEstDeliveryDate] = useState('');
  const [estDeliveryTime, setEstDeliveryTime] = useState('');

  // Drag and drop / file upload refs
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [photoTypeUpload, setPhotoTypeUpload] = useState('Before Repair');

  const fetchJobCards = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/jobcards`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setJobCards(data);
        
        // Update selected job card details if one is selected
        if (selectedJc) {
          const updated = data.find(j => j._id === selectedJc._id);
          if (updated) {
            setSelectedJc(updated);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch job cards:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobCards();
  }, [token]);

  // Handle job card selection
  const handleSelectJobCard = (jc) => {
    setSelectedJc(jc);
    
    // Parse bodyShopDetails JSON if exists
    let details = {
      dentProgress: 0,
      paintProgress: 0,
      chassisProgress: 0,
      glassProgress: 0,
      bumperProgress: 0,
      labourDetails: '',
      materialUsed: '',
      completionStatus: 'In Progress',
      notes: ''
    };

    if (jc.bodyShopDetails) {
      try {
        details = { ...details, ...JSON.parse(jc.bodyShopDetails) };
      } catch (e) {
        console.error('Error parsing bodyShopDetails:', e);
      }
    }

    setDentProgress(details.dentProgress || 0);
    setPaintProgress(details.paintProgress || 0);
    setChassisProgress(details.bodyAlignmentProgress || details.chassisProgress || 0);
    setGlassProgress(details.glassProgress || 0);
    setBumperProgress(details.bumperProgress || 0);
    setLabourDetails(details.labourDetails || '');
    setMaterialUsed(details.materialUsed || '');
    setCompletionStatus(details.completionStatus || 'In Progress');
    setNotes(details.notes || jc.advisorNotes || '');
    
    // Format promDate for input type="date"
    if (jc.promDate) {
      setEstDeliveryDate(new Date(jc.promDate).toISOString().split('T')[0]);
    } else {
      setEstDeliveryDate('');
    }
    setEstDeliveryTime(jc.promTime || '');
  };

  // Filter job cards for Body Shop dashboard
  // Only show cards with status: Work In Progress, Body Shop, Quality Check, Ready for Delivery, Delivered
  // AND either workCategory B/P or Insurance Jobs
  const bodyShopJobs = jobCards.filter(jc => 
    jc.workCategory === 'B/P' || jc.workCategory === 'Insurance Jobs'
  );

  // Status-based counts
  const assignedCount = bodyShopJobs.length;
  const pendingCount = bodyShopJobs.filter(jc => jc.status === 'Body Shop').length;
  const insuranceCount = bodyShopJobs.filter(jc => jc.workCategory === 'Insurance Jobs' && jc.status === 'Body Shop').length;
  
  // Painting and Dent repair jobs counts (count jobcards in 'Body Shop' status that have progress < 100)
  const getProgressVal = (jc, key) => {
    if (!jc.bodyShopDetails) return 0;
    try {
      const parsed = JSON.parse(jc.bodyShopDetails);
      return parsed[key] || 0;
    } catch {
      return 0;
    }
  };

  const paintingCount = bodyShopJobs.filter(jc => jc.status === 'Body Shop' && getProgressVal(jc, 'paintProgress') < 100).length;
  const dentCount = bodyShopJobs.filter(jc => jc.status === 'Body Shop' && getProgressVal(jc, 'dentProgress') < 100).length;
  const qcWaitingCount = bodyShopJobs.filter(jc => jc.status === 'Quality Check').length;
  const completedCount = bodyShopJobs.filter(jc => jc.status === 'Ready for Delivery' || jc.status === 'Delivered').length;

  // Submit Body Shop progress update
  const handleUpdateDetails = async (e, shouldForwardToQC = false) => {
    if (e) e.preventDefault();
    setUpdating(true);

    const finalCompletionStatus = shouldForwardToQC ? 'Completed' : completionStatus;

    const bodyShopObj = {
      dentProgress,
      paintProgress,
      bodyAlignmentProgress: chassisProgress,
      glassProgress,
      bumperProgress,
      labourDetails,
      materialUsed,
      completionStatus: finalCompletionStatus,
      notes
    };

    const updatePayload = {
      bodyShopDetails: JSON.stringify(bodyShopObj),
      advisorNotes: notes
    };

    if (estDeliveryDate) {
      updatePayload.promDate = new Date(estDeliveryDate).toISOString();
    }
    if (estDeliveryTime) {
      updatePayload.promTime = estDeliveryTime;
    }

    if (shouldForwardToQC) {
      updatePayload.status = selectedJc.workCategory === 'Insurance Jobs' ? 'Surveyor Approval' : 'Quality Check';
    }

    try {
      const res = await fetch(`${API_BASE_URL}/jobcards/${selectedJc._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updatePayload)
      });

      if (res.ok) {
        alert(shouldForwardToQC 
          ? (selectedJc.workCategory === 'Insurance Jobs' 
              ? 'Repair completed! Forwarded to Surveyor Approval successfully.' 
              : 'Repair completed! Vehicle forwarded to QC successfully.') 
          : 'Repair progress updated successfully!');
        await fetchJobCards();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update progress.');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating details.');
    } finally {
      setUpdating(false);
    }
  };

  // Image Upload handler
  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append('photo', file);
    formData.append('photoType', photoTypeUpload);

    try {
      const res = await fetch(`${API_BASE_URL}/jobcards/${selectedJc._id}/photo`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (res.ok) {
        alert(`Successfully uploaded ${photoTypeUpload} photo!`);
        await fetchJobCards();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to upload photo.');
      }
    } catch (err) {
      console.error(err);
      alert('Error uploading photo.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  // Trigger file dialogs
  const triggerDesktopUpload = () => {
    fileInputRef.current.click();
  };

  const triggerCameraUpload = () => {
    cameraInputRef.current.click();
  };

  if (loading) {
    return <div className="p-8 text-center text-sm font-semibold text-slate-400">Loading Body Shop terminal...</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in p-1 select-none">
      {/* Header with Create Job Card button */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white">Body Shop Terminal</h2>
          <p className="text-xs text-slate-400 font-semibold dark:text-slate-500">Track body and paint repair progress</p>
        </div>
        <button
          onClick={() => {
            if (setActiveTab) {
              setActiveTab('jobcards');
              localStorage.setItem('jobcard_view_mode', 'create');
            }
          }}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10"
        >
          <Plus className="w-4 h-4" /> Create Job Card
        </button>
      </div>

      {/* Dashboard Stats Panel */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {[
          { title: 'Assigned Jobs', count: assignedCount, glow: 'from-orange-500/10 to-transparent', border: 'hover:border-orange-500/30', textClass: 'text-orange-655' },
          { title: 'Pending Repairs', count: pendingCount, glow: 'from-amber-500/10 to-transparent', border: 'hover:border-amber-500/30', textClass: 'text-amber-655' },
          { title: 'Insurance Claims', count: insuranceCount, glow: 'from-red-500/10 to-transparent', border: 'hover:border-red-500/30', textClass: 'text-red-655' },
          { title: 'Painting Jobs', count: paintingCount, glow: 'from-pink-500/10 to-transparent', border: 'hover:border-pink-500/30', textClass: 'text-pink-655' },
          { title: 'Dent Repair Jobs', count: dentCount, glow: 'from-indigo-500/10 to-transparent', border: 'hover:border-indigo-500/30', textClass: 'text-indigo-655' },
          { title: 'Waiting for QC', count: qcWaitingCount, glow: 'from-cyan-500/10 to-transparent', border: 'hover:border-cyan-500/30', textClass: 'text-cyan-655' },
          { title: 'Completed Repairs', count: completedCount, glow: 'from-emerald-500/10 to-transparent', border: 'hover:border-emerald-500/30', textClass: 'text-emerald-655' },
        ].map((c, i) => (
          <div 
            key={i} 
            className={`glassmorphism p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 shadow-sm hover:shadow-md ${c.border}`}
          >
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-gradient-to-tr ${c.glow} rounded-full blur-[40px] pointer-events-none`} />
            <span className="block text-[10px] text-slate-450 dark:text-slate-500 font-extrabold uppercase tracking-wider relative z-10 leading-none">{c.title}</span>
            <span className={`block text-2xl font-black font-mono mt-2 relative z-10 ${c.textClass}`}>{c.count}</span>
          </div>
        ))}
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Large Data Table of Assigned Vehicles */}
        <div className={`lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm flex flex-col ${selectedJc ? 'hidden lg:flex' : ''}`}>
          <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/40">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Assigned Job Cards</h3>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mt-0.5">Select a vehicle to log repair status</p>
            </div>
            <span className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100/50 text-indigo-700 dark:text-indigo-400 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg">
              {bodyShopJobs.length} Jobs
            </span>
          </div>

          <div className="overflow-x-auto max-h-[650px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
                  <th className="p-4">Reg No / Model</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Current Status</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {bodyShopJobs.length > 0 ? (
                  bodyShopJobs.map(jc => {
                    const isSelected = selectedJc?._id === jc._id;
                    
                    let badgeColor = 'bg-slate-100 text-slate-700 dark:bg-slate-800';
                    if (jc.status === 'Work In Progress') badgeColor = 'bg-indigo-50 text-indigo-700 dark:bg-indigo-955/20 dark:text-indigo-400';
                    if (jc.status === 'Body Shop') badgeColor = 'bg-orange-50 text-orange-700 dark:bg-orange-955/20 dark:text-orange-400';
                    if (jc.status === 'Quality Check') badgeColor = 'bg-cyan-50 text-cyan-700 dark:bg-cyan-955/20 dark:text-cyan-400';
                    if (jc.status === 'Ready for Delivery') badgeColor = 'bg-amber-50 text-amber-700 dark:bg-amber-955/20 dark:text-amber-400';
                    if (jc.status === 'Delivered') badgeColor = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-955/20 dark:text-emerald-400';

                    return (
                      <tr 
                        key={jc._id}
                        onClick={() => handleSelectJobCard(jc)}
                        className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 cursor-pointer transition-all ${
                          isSelected ? 'bg-indigo-50/20 dark:bg-indigo-950/10 border-l-4 border-indigo-650' : ''
                        }`}
                      >
                        <td className="p-4">
                          <span className="block font-bold text-slate-900 dark:text-white font-mono tracking-wider">{jc.vehicleId?.vehicleNumber}</span>
                          <span className="block text-[10px] text-slate-450 dark:text-slate-500 font-semibold mt-0.5">
                            {jc.vehicleId?.make} {jc.vehicleId?.model}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase ${
                            jc.workCategory === 'B/P' 
                              ? 'bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400' 
                              : 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400'
                          }`}>
                            {jc.workCategory === 'B/P' ? 'Body Shop' : 'Insurance'}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase ${badgeColor}`}>
                            {jc.status}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <span className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-bold transition-all text-[11px] inline-flex items-center gap-1">
                            Inspect <ArrowRight className="w-3 h-3" />
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-slate-450 dark:text-slate-500 font-semibold">
                      No active body shop repairs assigned.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Interactive Progress & Details Pane */}
        <div className={`lg:col-span-7 space-y-6 ${!selectedJc ? 'hidden lg:block' : ''}`}>
          {selectedJc ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
              
              {/* Card Header */}
              <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <button 
                    onClick={() => setSelectedJc(null)}
                    className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg mb-2 lg:hidden"
                  >
                    &larr; Back to List
                  </button>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white font-mono tracking-wider">
                      {selectedJc.vehicleId?.vehicleNumber}
                    </h2>
                    <span className={`px-2.5 py-0.5 rounded font-extrabold text-[9px] uppercase ${
                      selectedJc.status === 'Work In Progress' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400' :
                      selectedJc.status === 'Body Shop' ? 'bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400' :
                      'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/20 dark:text-cyan-400'
                    }`}>
                      {selectedJc.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    {selectedJc.vehicleId?.make} {selectedJc.vehicleId?.model} | Client: <strong className="text-slate-700 dark:text-slate-350">{selectedJc.customerId?.name}</strong>
                  </p>
                </div>
                
                <div className="text-right flex flex-col items-end gap-1.5">
                  <span className="text-[10px] font-mono text-slate-400 font-bold">{selectedJc.jobCardNo}</span>
                  <button
                    onClick={() => onNavigateToJobCard(selectedJc._id)}
                    className="text-[9px] font-black uppercase text-indigo-650 hover:text-indigo-700 flex items-center gap-1 border border-indigo-200/50 bg-indigo-50/30 px-2 py-0.5 rounded-md"
                  >
                    Full Card &larr;
                  </button>
                </div>
              </div>

              {/* Progress Sliders: Touch Friendly & Premium */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                  <Gauge className="w-4 h-4 text-orange-500" /> Progress Indicators
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: 'Dent Repair Progress', value: dentProgress, setter: setDentProgress, color: 'accent-orange-500' },
                    { label: 'Painting Progress', value: paintProgress, setter: setPaintProgress, color: 'accent-pink-500' },
                    { label: 'Body Alignment Progress', value: chassisProgress, setter: setChassisProgress, color: 'accent-indigo-500' },
                    { label: 'Glass Replacement Progress', value: glassProgress, setter: setGlassProgress, color: 'accent-sky-500' },
                    { label: 'Bumper Repair Progress', value: bumperProgress, setter: setBumperProgress, color: 'accent-amber-500' },
                  ].map((p, idx) => (
                    <div key={idx} className="bg-slate-50 dark:bg-slate-950/20 p-3.5 border border-slate-100 dark:border-slate-850 rounded-2xl space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-700 dark:text-slate-350">{p.label}</span>
                        <span className="font-mono font-black text-indigo-650 dark:text-indigo-400">{p.value}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        step="5"
                        value={p.value} 
                        onChange={(e) => p.setter(Number(e.target.value))}
                        className={`w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg cursor-pointer ${p.color}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Image Upload Block: Drag & Drop and Camera triggers */}
              <div className="space-y-4 border-t border-slate-100 dark:border-slate-800/80 pt-6">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-205 uppercase tracking-wide flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-pink-500" /> Photo Upload & Repair Log
                  </h4>
                  
                  {/* Photo Type Selector */}
                  <select
                    value={photoTypeUpload}
                    onChange={(e) => setPhotoTypeUpload(e.target.value)}
                    className="px-2 py-1 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] font-bold text-slate-700 dark:text-slate-350"
                  >
                    <option value="Before Repair">Before Repair</option>
                    <option value="During Repair">During Repair</option>
                    <option value="After Repair">After Repair</option>
                  </select>
                </div>

                {/* Upload drag drop zone */}
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                    dragActive 
                      ? 'border-indigo-500 bg-indigo-50/10' 
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 hover:bg-slate-50 dark:hover:bg-slate-900/10'
                  }`}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange}
                    className="hidden" 
                    accept="image/*"
                  />
                  {/* Dedicated Camera Trigger for mobile directly opening camera */}
                  <input 
                    type="file" 
                    ref={cameraInputRef} 
                    onChange={handleFileChange}
                    className="hidden" 
                    accept="image/*"
                    capture="environment"
                  />

                  {uploading ? (
                    <span className="text-xs font-bold text-slate-550 animate-pulse block">Uploading image, please wait...</span>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-center gap-3">
                        <button
                          type="button"
                          onClick={triggerDesktopUpload}
                          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/10"
                        >
                          <UploadCloud className="w-3.5 h-3.5" /> Drag or Upload File
                        </button>
                        <button
                          type="button"
                          onClick={triggerCameraUpload}
                          className="flex items-center gap-1.5 px-3 py-2 bg-pink-600 text-white rounded-xl text-[10px] font-bold hover:bg-pink-700 transition-all shadow-md shadow-pink-600/10"
                        >
                          <Camera className="w-3.5 h-3.5" /> Open Mobile Camera
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-450 dark:text-slate-500 font-semibold leading-relaxed">
                        PNG, JPG, or WEBP. Max size 10MB.
                      </p>
                    </div>
                  )}
                </div>

                {/* Uploaded Images Gallery sorted by photoType */}
                <div className="grid grid-cols-3 gap-3">
                  {['Before Repair', 'During Repair', 'After Repair'].map(type => {
                    const photosOfType = (selectedJc.photos || []).filter(p => p.photoType === type);
                    return (
                      <div key={type} className="space-y-1.5 bg-slate-50/50 dark:bg-slate-950/10 p-2 border border-slate-100 dark:border-slate-850 rounded-xl">
                        <span className="block text-[8px] font-black text-slate-450 dark:text-slate-500 uppercase tracking-widest">{type}</span>
                        <div className="grid grid-cols-1 gap-1.5">
                          {photosOfType.length > 0 ? (
                            photosOfType.map((p, i) => {
                              if (!p || !p.url) return null;
                              const isAbsolute = p.url.startsWith('http') || p.url.startsWith('blob:') || p.url.startsWith('data:');
                              
                              let relativePath = p.url;
                              if (!isAbsolute) {
                                if (!relativePath.startsWith('/uploads/') && !relativePath.startsWith('uploads/')) {
                                  relativePath = `/uploads/${relativePath}`;
                                } else if (relativePath.startsWith('uploads/')) {
                                  relativePath = `/${relativePath}`;
                                }
                              }
                              const src = isAbsolute ? p.url : `${API_BASE_URL.replace('/api', '')}${relativePath}`;
                              const isBroken = brokenImages[p.url];
                              
                              return (
                                <div key={i} className="aspect-video w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
                                  {isBroken ? (
                                    <div className="flex flex-col items-center justify-center p-2 text-center">
                                      <span className="text-[9px] font-bold text-red-500">Attachment unavailable.</span>
                                    </div>
                                  ) : (
                                    <img 
                                      src={src} 
                                      alt={type} 
                                      onError={() => setBrokenImages(prev => ({ ...prev, [p.url]: true }))}
                                      onClick={() => window.open(src, '_blank')}
                                      className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-all"
                                    />
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <span className="text-[9px] text-slate-400 italic block py-2">No photos</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Form details: notes, estimated dates, labour details */}
              <form onSubmit={handleUpdateDetails} className="space-y-5 border-t border-slate-100 dark:border-slate-800/80 pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Estimated Delivery Date */}
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500 mb-1.5">
                      Estimated Completion Date
                    </label>
                    <div className="relative">
                      <Calendar className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400 pointer-events-none" />
                      <input 
                        type="date"
                        value={estDeliveryDate}
                        onChange={(e) => setEstDeliveryDate(e.target.value)}
                        className="block w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1"
                      />
                    </div>
                  </div>

                  {/* Estimated Delivery Time */}
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500 mb-1.5">
                      Estimated Completion Time
                    </label>
                    <input 
                      type="text"
                      placeholder="e.g. 05:00 PM"
                      value={estDeliveryTime}
                      onChange={(e) => setEstDeliveryTime(e.target.value)}
                      className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1"
                    />
                  </div>
                </div>

                {/* Labour Details */}
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500 mb-1.5">
                    Record Labour / Mechanic Assignments
                  </label>
                  <textarea 
                    rows="2"
                    placeholder="e.g. Mechanic Ravi Kumar: Dent removal and bumper re-alignment (4 hrs)"
                    value={labourDetails}
                    onChange={(e) => setLabourDetails(e.target.value)}
                    className="block w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-205 placeholder-slate-400 text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1"
                  />
                </div>

                {/* Material Used */}
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500 mb-1.5">
                    Material / Spare Parts Used
                  </label>
                  <textarea 
                    rows="2"
                    placeholder="e.g. Front Bumper Guard, Paint Primer (2L), Glass Adhesive..."
                    value={materialUsed}
                    onChange={(e) => setMaterialUsed(e.target.value)}
                    className="block w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-205 placeholder-slate-400 text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1"
                  />
                </div>

                {/* Completion Status */}
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500 mb-1.5">
                    Completion Status
                  </label>
                  <select
                    value={completionStatus}
                    onChange={(e) => setCompletionStatus(e.target.value)}
                    className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-205 text-xs font-bold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>

                {/* Repair Notes / Remarks */}
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500 mb-1.5">
                    Repair Notes & Remarks
                  </label>
                  <textarea 
                    rows="2"
                    placeholder="Provide notes or surveyor findings..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="block w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-205 placeholder-slate-400 text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap justify-between items-center gap-3 border-t border-slate-100 dark:border-slate-800/80 pt-4">
                  {/* Standard Save */}
                  <button
                    type="submit"
                    disabled={updating}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                  >
                    {updating ? 'Saving logs...' : 'Save Progress Logs'}
                  </button>

                  {/* Complete & Forward to QC */}
                  {selectedJc.status === 'Body Shop' && (
                    <button
                      type="button"
                      onClick={(e) => handleUpdateDetails(e, true)}
                      disabled={updating}
                      className="px-4.5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/10 flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4" /> {selectedJc.workCategory === 'Insurance Jobs' ? 'Mark Completed & Forward to Surveyor' : 'Mark Completed & Forward to QC'}
                    </button>
                  )}
                  
                  {/* Fallback to transition to Body Shop status if advisor put it in WIP */}
                  {selectedJc.status === 'Work In Progress' && (
                    <button
                      type="button"
                      onClick={async () => {
                        setUpdating(true);
                        try {
                          const res = await fetch(`${API_BASE_URL}/jobcards/${selectedJc._id}`, {
                            method: 'PUT',
                            headers: {
                              'Content-Type': 'application/json',
                              Authorization: `Bearer ${token}`
                            },
                            body: JSON.stringify({ status: 'Body Shop' })
                          });
                          if (res.ok) {
                            alert('Vehicle successfully pulled into Body Shop repair stage!');
                            await fetchJobCards();
                          }
                        } catch(e) {
                          console.error(e);
                        } finally {
                          setUpdating(false);
                        }
                      }}
                      className="px-4.5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      Pull Vehicle into Body Shop
                    </button>
                  )}
                </div>
              </form>

            </div>
          ) : (
            <div className="bg-white/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center shadow-sm relative overflow-hidden h-[500px] flex flex-col justify-center items-center">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-indigo-500/5 rounded-full blur-[60px] pointer-events-none" />
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-center text-slate-400 mb-5 shadow-sm">
                <Car className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-white uppercase tracking-wider">No Vehicle Selected</h3>
              <p className="text-xs text-slate-450 dark:text-slate-500 font-semibold max-w-xs mt-1.5 leading-relaxed">
                Select an assigned vehicle from the left pane to view progress gauges, log labor assignments, upload repair photos, or forward the vehicle to Quality Check.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
