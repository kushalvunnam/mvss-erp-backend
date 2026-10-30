import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../config';
import { invalidateCache } from '../utils/apiCache';
import { 
  Wrench, 
  Car, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  X, 
  Check, 
  FileText,
  ShieldCheck,
  Send,
  PackageX,
  FileSearch,
  Truck,
  Archive,
  Hourglass
} from 'lucide-react';

export const BODY_SHOP_STAGES = [
  'Vehicle Reported',
  'Customer Not Responding',
  'Survey Pending',
  'Awaiting for Documents',
  'Awaiting for Work Approval',
  'Work in Progress',
  'Part not Available',
  'Awaiting for Reinspection',
  'Awaiting for Delivery Order',
  'Ready for Delivery',
  'Delivered',
  'Closed',
  'Estimation Pending'
];

export const BODY_SHOP_STAGE_CONFIG = {
  'Vehicle Reported': {
    number: 1,
    icon: Car,
    color: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800',
    description: 'Vehicle received at workshop, initial intake recorded'
  },
  'Customer Not Responding': {
    number: 2,
    icon: AlertCircle,
    color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
    description: 'Attempts to reach customer for claim details/approval pending'
  },
  'Survey Pending': {
    number: 3,
    icon: FileSearch,
    color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800',
    description: 'Waiting for insurance surveyor inspection'
  },
  'Awaiting for Documents': {
    number: 4,
    icon: FileText,
    color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800',
    description: 'Waiting for claim form, RC, DL or policy documents'
  },
  'Awaiting for Work Approval': {
    number: 5,
    icon: Hourglass,
    color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
    description: 'Insurance surveyor or customer work approval pending'
  },
  'Work in Progress': {
    number: 6,
    icon: Wrench,
    color: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-700',
    description: 'Denting, painting, chassis or panel repairs underway'
  },
  'Part not Available': {
    number: 7,
    icon: PackageX,
    color: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
    description: 'Work paused waiting for backordered/out-of-stock parts'
  },
  'Awaiting for Reinspection': {
    number: 8,
    icon: ShieldCheck,
    color: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800',
    description: 'Repaired sections awaiting insurance re-inspection'
  },
  'Awaiting for Delivery Order': {
    number: 9,
    icon: FileText,
    color: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800',
    description: 'Waiting for insurance company Delivery Order (DO) issuance'
  },
  'Ready for Delivery': {
    number: 10,
    icon: CheckCircle2,
    color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
    description: 'All repairs completed, vehicle cleaned and ready for gate pass'
  },
  'Delivered': {
    number: 11,
    icon: Truck,
    color: 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/50 border-green-300 dark:border-green-700',
    description: 'Vehicle handed over to customer (retains active billing status)'
  },
  'Closed': {
    number: 12,
    icon: Archive,
    color: 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700',
    description: 'All payments settled and Job Card formally closed'
  },
  'Estimation Pending': {
    number: 13,
    icon: Clock,
    color: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
    description: 'Denting/painting cost estimate awaiting preparation'
  }
};

export default function BodyShopStatusModal({
  jobCard,
  token,
  user,
  isOpen,
  onClose,
  onSuccess
}) {
  const currentStage = jobCard?.bodyShopStatus || jobCard?.bodyShopStage || 'Vehicle Reported';
  const [selectedStage, setSelectedStage] = useState(currentStage);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !jobCard) return null;

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!selectedStage) {
      setError('Please select a Body Shop stage.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/jobcards/${jobCard._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status: 'Body Shop',
          bodyShopStatus: selectedStage,
          bodyShopStage: selectedStage,
          statusRemarks: remarks ? remarks.trim() : `Body Shop stage updated to ${selectedStage}`
        })
      });

      if (res.ok) {
        invalidateCache('service-history');
        if (onSuccess) {
          onSuccess(selectedStage);
        }
        onClose();
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Failed to update Body Shop stage.');
      }
    } catch (err) {
      console.error('Error updating Body Shop stage:', err);
      setError('Network error while updating Body Shop stage.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex justify-center items-center p-3 sm:p-6 z-[999999] select-none animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in"
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-fuchsia-50/40 dark:bg-fuchsia-955/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-fuchsia-600 text-white flex items-center justify-center shadow-md shadow-fuchsia-600/20">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                Body Shop Status Workflow
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                JC #{jobCard.jobCardNo} • {jobCard.vehicleId?.vehicleNumber || 'Vehicle'} ({jobCard.vehicleId?.make || ''} {jobCard.vehicleId?.model || ''})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              {error}
            </div>
          )}

          {/* Current Stage Indicator */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Current Stage
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-fuchsia-100 dark:bg-fuchsia-950 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-300 dark:border-fuchsia-800">
              <Car className="w-3.5 h-3.5" />
              {jobCard.status === 'Body Shop' && jobCard.bodyShopStatus 
                ? jobCard.bodyShopStatus 
                : (jobCard.status || 'Not Set')}
            </span>
          </div>

          {/* 13 Stages Selection Dropdown & Quick Grid */}
          <div className="space-y-2">
            <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Select Body Shop Stage (13 Dedicated Stages) *
            </label>
            
            {/* Native dropdown for fast selection on mobile & desktop */}
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 border-2 border-indigo-500/40 dark:border-indigo-400/40 rounded-2xl text-xs font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500 shadow-sm"
            >
              {BODY_SHOP_STAGES.map((stage, idx) => (
                <option key={stage} value={stage}>
                  {idx + 1}. {stage}
                </option>
              ))}
            </select>
          </div>

          {/* Interactive 13 Stages Cards Grid */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
              Or Tap to Select Stage:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-1">
              {BODY_SHOP_STAGES.map((stage, idx) => {
                const config = BODY_SHOP_STAGE_CONFIG[stage] || { number: idx + 1, icon: Wrench, color: '', description: '' };
                const IconComponent = config.icon || Wrench;
                const isSelected = selectedStage === stage;
                const isCurrent = (jobCard.bodyShopStatus || 'Vehicle Reported') === stage && jobCard.status === 'Body Shop';

                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => setSelectedStage(stage)}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl text-left border transition-all ${
                      isSelected
                        ? 'bg-fuchsia-50 dark:bg-fuchsia-950/50 border-fuchsia-500 ring-2 ring-fuchsia-500/30'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${config.color || 'bg-slate-100 text-slate-600'}`}>
                      <IconComponent className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-black text-slate-800 dark:text-white truncate">
                          {idx + 1}. {stage}
                        </span>
                        {isSelected && (
                          <span className="w-4 h-4 rounded-full bg-fuchsia-600 text-white flex items-center justify-center shrink-0">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5 truncate">
                        {config.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Remarks input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">
              Status Remarks / Transition Notes (Optional)
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Surveyor inspection scheduled for tomorrow 11 AM..."
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-md shadow-fuchsia-600/20 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Clock className="w-4 h-4 animate-spin" />
                Updating Stage...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Confirm & Update Stage
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
