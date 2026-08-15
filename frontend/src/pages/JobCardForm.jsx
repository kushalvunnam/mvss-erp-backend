import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { ChevronLeft, ChevronRight, Save, User, Car, CheckSquare, Plus, Trash2, Camera, Settings, Gauge, Calendar, Flame, Wrench } from 'lucide-react';
import VehicleDamageCanvas from '../components/VehicleDamageCanvas';
import SignaturePad from '../components/SignaturePad';
import SearchableDropdown from '../components/SearchableDropdown';

// Car silhouette components for 3D card
const CarSilhouetteSUV = () => (
  <svg viewBox="0 0 120 50" className="w-full h-auto text-indigo-500/80 dark:text-indigo-400/80 fill-current drop-shadow-[0_4px_10px_rgba(99,102,241,0.3)]">
    <path d="M5,32 L15,32 A8,8 0 0,1 31,32 L85,32 A8,8 0 0,1 101,32 L115,32 L115,26 Q115,20 105,19 L95,16 Q90,14 80,12 L50,12 Q42,12 35,16 L15,22 Q5,24 5,28 Z" />
    <circle cx="23" cy="32" r="7.5" className="text-slate-900 fill-current stroke-indigo-400 stroke-2" />
    <circle cx="23" cy="32" r="3.5" className="text-indigo-400 fill-current animate-pulse" />
    <circle cx="93" cy="32" r="7.5" className="text-slate-900 fill-current stroke-indigo-400 stroke-2" />
    <circle cx="93" cy="32" r="3.5" className="text-indigo-400 fill-current animate-pulse" />
    <path d="M38,18 L52,14 L75,14 L85,18 L78,23 L42,23 Z" className="text-white/20 fill-current" />
    <path d="M9,25 L12,23 L14,24 L10,26 Z" className="text-amber-400 fill-current" />
    <path d="M112,24 L114,23 L115,25 L113,26 Z" className="text-red-500 fill-current" />
  </svg>
);

const CarSilhouetteSedan = () => (
  <svg viewBox="0 0 120 50" className="w-full h-auto text-indigo-500/80 dark:text-indigo-400/80 fill-current drop-shadow-[0_4px_10px_rgba(99,102,241,0.3)]">
    <path d="M5,32 L15,32 A8,8 0 0,1 31,32 L85,32 A8,8 0 0,1 101,32 L115,32 L115,27 Q115,24 105,24 L92,22 Q85,14 72,12 L45,12 Q38,15 32,22 L15,24 Q5,26 5,30 Z" />
    <circle cx="23" cy="32" r="7.5" className="text-slate-900 fill-current stroke-indigo-400 stroke-2" />
    <circle cx="23" cy="32" r="3.5" className="text-indigo-400 fill-current animate-pulse" />
    <circle cx="93" cy="32" r="7.5" className="text-slate-900 fill-current stroke-indigo-400 stroke-2" />
    <circle cx="93" cy="32" r="3.5" className="text-indigo-400 fill-current animate-pulse" />
    <path d="M36,21 L48,15 L68,15 L78,21 L72,24 L40,24 Z" className="text-white/20 fill-current" />
    <path d="M9,26 L12,24 L14,25 L10,27 Z" className="text-amber-400 fill-current" />
    <path d="M112,25 L114,24 L115,26 L113,27 Z" className="text-red-500 fill-current" />
  </svg>
);

const CarSilhouetteHatchback = () => (
  <svg viewBox="0 0 120 50" className="w-full h-auto text-indigo-500/80 dark:text-indigo-400/80 fill-current drop-shadow-[0_4px_10px_rgba(99,102,241,0.3)]">
    <path d="M5,32 L15,32 A8,8 0 0,1 31,32 L85,32 A8,8 0 0,1 101,32 L115,32 L112,23 Q110,17 98,16 L78,15 Q72,12 62,12 L45,12 Q38,15 32,22 L15,24 Q5,26 5,30 Z" />
    <circle cx="23" cy="32" r="7.5" className="text-slate-900 fill-current stroke-indigo-400 stroke-2" />
    <circle cx="23" cy="32" r="3.5" className="text-indigo-400 fill-current animate-pulse" />
    <circle cx="93" cy="32" r="7.5" className="text-slate-900 fill-current stroke-indigo-400 stroke-2" />
    <circle cx="93" cy="32" r="3.5" className="text-indigo-400 fill-current animate-pulse" />
    <path d="M36,21 L48,15 L66,15 L78,19 L72,24 L40,24 Z" className="text-white/20 fill-current" />
    <path d="M9,26 L12,24 L14,25 L10,27 Z" className="text-amber-400 fill-current" />
    <path d="M111,22 L113,21 L114,23 L112,24 Z" className="text-red-500 fill-current" />
  </svg>
);

const CarSilhouetteEV = () => (
  <svg viewBox="0 0 120 50" className="w-full h-auto text-cyan-550 fill-current drop-shadow-[0_4px_10px_rgba(6,182,212,0.3)]">
    <path d="M5,31 L15,31 A8,8 0 0,1 31,31 L85,31 A8,8 0 0,1 101,31 L115,31 L115,27 Q115,23 100,21 L85,18 L68,11 L45,11 L28,19 L10,23 Q5,24 5,28 Z" />
    <circle cx="23" cy="31" r="7.5" className="text-slate-900 fill-current stroke-cyan-400 stroke-2" />
    <circle cx="23" cy="31" r="3.5" className="text-cyan-400 fill-current animate-ping" />
    <circle cx="93" cy="31" r="7.5" className="text-slate-900 fill-current stroke-cyan-400 stroke-2" />
    <circle cx="93" cy="31" r="3.5" className="text-cyan-400 fill-current animate-ping" />
    <path d="M34,19 L46,13 L68,13 L78,18 L70,22 L38,22 Z" className="text-white/25 fill-current" />
    <path d="M9,25 L12,23 L14,24 L10,26 Z" className="text-cyan-300 fill-current" />
    <rect x="50" y="27" width="20" height="3" rx="1.5" className="text-cyan-400/80 fill-current animate-pulse" />
  </svg>
);const CabinSilhouette = () => (
  <svg viewBox="0 0 120 50" className="w-full h-auto text-indigo-400/90 fill-none stroke-indigo-400 stroke-2 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]">
    {/* Steering Wheel */}
    <circle cx="35" cy="25" r="13" strokeWidth="1.5" />
    <circle cx="35" cy="25" r="3" fill="currentColor" />
    <path d="M35,25 L35,38 M35,25 L24,19 M35,25 L46,19" strokeWidth="1.5" />
    {/* Dashboard display */}
    <rect x="52" y="18" width="18" height="10" rx="1" strokeWidth="1.5" />
    <line x1="56" y1="23" x2="66" y2="23" strokeWidth="1" strokeDasharray="2 1" />
    {/* Seat outline */}
    <path d="M85,12 Q80,24 85,34 L100,36 L108,39 L113,36 L106,30 L96,17 Z" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1" />
    <circle cx="85" cy="8" r="3" strokeWidth="1.5" />
  </svg>
);

const EngineSilhouette = () => (
  <svg viewBox="0 0 120 50" className="w-full h-auto text-indigo-400/90 fill-none stroke-indigo-400 stroke-2 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]">
    {/* Cylinder Block */}
    <rect x="45" y="13" width="30" height="20" rx="3" strokeWidth="1.5" />
    <line x1="52" y1="13" x2="52" y2="33" strokeWidth="1" />
    <line x1="60" y1="13" x2="60" y2="33" strokeWidth="1" />
    <line x1="68" y1="13" x2="68" y2="33" strokeWidth="1" />
    {/* Crankcase */}
    <circle cx="60" cy="38" r="8" strokeWidth="1.5" />
    <path d="M60,30 L60,18" strokeWidth="2" />
    {/* Spark indicators */}
    <path d="M60,5 L60,9 M54,6 L57,8 M66,6 L63,8" stroke="#facc15" strokeWidth="1.5" className="animate-pulse" />
  </svg>
);
// High-quality custom inline SVG brand logos
const BRAND_LOGOS = {
  toyota: (className) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="12" rx="11" ry="7" />
      <ellipse cx="12" cy="12" rx="7" ry="4" />
      <ellipse cx="12" cy="10" rx="3" ry="5" />
    </svg>
  ),
  honda: (className) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 6v12M17 6v12M7 12h10" />
    </svg>
  ),
  hyundai: (className) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="12" rx="10" ry="7" />
      <path d="M8 8 L11 8 M16 8 L13 8 M10 8 L10 16 M14 8 L14 16 M10 12 L14 12" strokeLinecap="round" />
    </svg>
  ),
  suzuki: (className) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 18L18 6M6 6h6l6 12h-6z" />
    </svg>
  ),
  maruti: (className) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 18L18 6M6 6h6l6 12h-6z" />
    </svg>
  ),
  tata: (className) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M7 9 L12 16 L17 9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 9 L12 16" strokeLinecap="round" />
    </svg>
  ),
  mahindra: (className) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 18 L12 6 L20 18" />
      <path d="M8 18 L12 10 L16 18" />
    </svg>
  ),
  bmw: (className) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2 L12 22 M2 12 L22 12" />
      <circle cx="12" cy="12" r="6" strokeDasharray="2 2" />
    </svg>
  ),
  audi: (className) => (
    <svg viewBox="0 0 48 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="10" cy="12" r="8" />
      <circle cx="20" cy="12" r="8" />
      <circle cx="30" cy="12" r="8" />
      <circle cx="38" cy="12" r="8" />
    </svg>
  ),
  mercedes: (className) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 12 L12 3 M12 12 L4 17 M12 12 L20 17" />
    </svg>
  )
};

// Premium Vehicle Spec Catalog mappings
const VEHICLE_CATALOG = {
  'toyota-fortuner': { engine: '2.8L D-4D Turbo Diesel', transmission: '6-Speed Torque Converter AT', year: '2022', bodyType: 'suv' },
  'toyota-innova': { engine: '2.4L GD-FTV Turbo Diesel', transmission: '6-Speed Automatic / Manual', year: '2021', bodyType: 'suv' },
  'toyota-glanza': { engine: '1.2L K-Series Petrol', transmission: '5-Speed AMT / Manual', year: '2023', bodyType: 'hatchback' },
  'honda-city': { engine: '1.5L i-VTEC DOHC Petrol', transmission: '7-Speed CVT / 6-Speed Manual', year: '2022', bodyType: 'sedan' },
  'honda-amaze': { engine: '1.2L i-VTEC Petrol', transmission: 'CVT Automatic / 5-Speed Manual', year: '2021', bodyType: 'sedan' },
  'honda-civic': { engine: '1.8L i-VTEC Petrol', transmission: 'CVT Automatic', year: '2020', bodyType: 'sedan' },
  'hyundai-i20': { engine: '1.2L Kappa / 1.0L Turbo GDi', transmission: '7-Speed DCT / Intelligent Manual', year: '2022', bodyType: 'hatchback' },
  'hyundai-creta': { engine: '1.5L CRDi Diesel / 1.5L MPi Petrol', transmission: '6-Speed Automatic / IVT', year: '2023', bodyType: 'suv' },
  'hyundai-verna': { engine: '1.5L Turbo GDi Petrol', transmission: '7-Speed DCT / 6-Speed MT', year: '2023', bodyType: 'sedan' },
  'suzuki-swift': { engine: '1.2L DualJet Dual VVT Petrol', transmission: '5-Speed AGS / Manual', year: '2022', bodyType: 'hatchback' },
  'maruti-swift': { engine: '1.2L DualJet Dual VVT Petrol', transmission: '5-Speed AGS / Manual', year: '2022', bodyType: 'hatchback' },
  'suzuki-baleno': { engine: '1.2L DualJet Petrol', transmission: '5-Speed AGS / Manual', year: '2023', bodyType: 'hatchback' },
  'maruti-baleno': { engine: '1.2L DualJet Petrol', transmission: '5-Speed AGS / Manual', year: '2023', bodyType: 'hatchback' },
  'suzuki-brezza': { engine: '1.5L K15C Smart Hybrid Petrol', transmission: '6-Speed Automatic / 5-Speed MT', year: '2022', bodyType: 'suv' },
  'maruti-brezza': { engine: '1.5L K15C Smart Hybrid Petrol', transmission: '6-Speed Automatic / 5-Speed MT', year: '2022', bodyType: 'suv' },
  'tata-nexon': { engine: '1.2L Revotron Turbo Petrol', transmission: '6-Speed Automated Manual', year: '2023', bodyType: 'suv' },
  'tata-harrier': { engine: '2.0L Kryotec Turbocharged Diesel', transmission: '6-Speed Automatic / Manual', year: '2022', bodyType: 'suv' },
  'tata-tiago': { engine: '1.2L Revotron Petrol', transmission: '5-Speed AMT / Manual', year: '2021', bodyType: 'hatchback' },
  'mahindra-thar': { engine: '2.2L mHawk Diesel / 2.0L Petrol', transmission: '6-Speed Torque Converter AT', year: '2022', bodyType: 'suv' },
  'mahindra-xuv700': { engine: '2.2L mHawk CRDi Turbo Diesel', transmission: '6-Speed Automatic / Manual', year: '2023', bodyType: 'suv' },
  'mahindra-scorpio': { engine: '2.2L mHawk Diesel', transmission: '6-Speed Automatic / Manual', year: '2022', bodyType: 'suv' }
};

// Parser with high-quality fallback for unknown/custom vehicles
const resolveVehicleSpecs = (make, model, variant, fuelType) => {
  const normMake = (make || '').trim().toLowerCase();
  const normModel = (model || '').trim().toLowerCase();
  const normVariant = (variant || '').trim().toLowerCase();
  const normFuel = (fuelType || 'Petrol');

  const catalogKey = `${normMake}-${normModel}`;
  const spec = VEHICLE_CATALOG[catalogKey];

  if (spec) {
    return { ...spec, fuelType: normFuel };
  }

  // Smart fallback calculations
  let bodyType = 'sedan';
  const nameString = `${normMake} ${normModel} ${normVariant}`;
  
  const suvKeywords = ['creta', 'brezza', 'nexon', 'harrier', 'safari', 'thar', 'xuv', 'scorpio', 'bolero', 'fortuner', 'innova', 'duster', 'seltos', 'venue', 'punch', 'kiger', 'magnite', 'hector', 'compass', 'suv', 'cross'];
  const hatchKeywords = ['swift', 'baleno', 'i20', 'i10', 'alto', 'kwid', 'tiago', 'wagonr', 'celerio', 'ignis', 'jazz', 'polo', 'glanza', 'hatch'];
  const evKeywords = ['ev', 'electric', 'nexonev', 'e-tron', 'taycan', 'tesla'];

  if (evKeywords.some(kw => nameString.includes(kw)) || normFuel.toLowerCase() === 'electric') {
    bodyType = 'ev';
  } else if (suvKeywords.some(kw => nameString.includes(kw))) {
    bodyType = 'suv';
  } else if (hatchKeywords.some(kw => nameString.includes(kw))) {
    bodyType = 'hatchback';
  }

  let transmission = '5-Speed Manual';
  const autoKeywords = ['auto', 'amt', 'cvt', 'dct', 'at', 'ags', 'torque', 'automatic'];
  if (autoKeywords.some(kw => nameString.includes(kw))) {
    transmission = 'Automatic Transmission';
  }

  let engine = '1.2L Multi-Point Fuel Injection';
  if (normFuel.toLowerCase() === 'electric') {
    engine = 'Permanent Magnet Synchronous Motor';
  } else if (normFuel.toLowerCase() === 'diesel') {
    engine = '1.5L CRDi Turbocharged Diesel';
  } else if (normFuel.toLowerCase() === 'cng') {
    engine = '1.2L Bi-Fuel i-CNG Engine';
  } else if (normFuel.toLowerCase() === 'hybrid') {
    engine = '1.5L Intelligent Strong Hybrid';
  }

  return {
    engine,
    transmission,
    year: '2022',
    bodyType,
    fuelType: normFuel
  };
};

export default function JobCardForm({ token, onSaved, onCancel, editId = null }) {
  const [step, setStep] = useState(1);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  
  // Selection references
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [filteredVehicles, setFilteredVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');

  // Cascading vehicle selector states
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  // Mouse tilt tracking state for 3D card
  const [cardTilt, setCardTilt] = useState({ x: 0, y: 0 });

  // Active view tab state (Exterior, Interior, Engine, 360° View)
  const [activeView, setActiveView] = useState('Exterior');

  // Sync cascading selections when vehicle is resolved/changed
  useEffect(() => {
    if (selectedVehicleId && filteredVehicles.length > 0) {
      const activeVehicle = filteredVehicles.find(v => v._id === selectedVehicleId);
      if (activeVehicle) {
        setSelectedBrand(activeVehicle.make);
        setSelectedModel(activeVehicle.model);
      }
    } else {
      setSelectedBrand('');
      setSelectedModel('');
    }
    setActiveView('Exterior'); // Reset active tab view when vehicle changes
  }, [selectedVehicleId, filteredVehicles]);

  // Form State
  const [formData, setFormData] = useState({
    contactPerson: '',
    odometerReading: '',
    estimation: '',
    color: '',
    insuranceName: '',
    claimNo: '',
    serviceType: 'General Servicing',
    serviceTypes: ['General Servicing'],
    workCategory: 'RR',
    jobType: 'Cash Job',
    serviceAdvisorName: '',
    technicianName: '',
    qcName: '',
    floorInchargeName: '',
    internalRemarks: '',
    technicianNotes: '',
    
    // 32 Inspection items
    inspectionChecklist: {
      engineOil: '', gearboxFluid: '', automaticTransmissionFluid: '', differentialFluid: '',
      brakeClutchFluid: '', powerSteeringFluid: '', batteryFluid: '', windscreenWashingFluid: '',
      coolantAntiFreezeFluid: '', engineOilFilter: '', airFilterAirconFilter: '', fuelFilter: '',
      
      tightnessOfBelts: '', engineTuning: '', clutch: '', handbrakeSystem: '',
      vacuumPumpBrakeBooster: '', sparkPlugs: '', suspension: '', rubberMudFlapProtector: '',
      fuelInjectors: '', headlightsFoglightsTails: '', brakelightsReverse: '', signalLights: '',
      
      tyreTread: '', tyrePressure: '', windscreenWiperWasher: '', safetyNutsBolts: '',
      horn: '', exhaustPipesMounting: '', safetyBelts: '', driveShaftDustCovers: '',
    },
    
    fuelLevel: 'E',
    
    // Accessories checklist
    accessories: {
      serviceBook: 'No', toolKit: 'No', spareWheel: 'No', jack: 'No', jackHandle: 'No',
      carPerfume: 'No', clock: 'No', stereo: 'No', cdPlayer: 'No', mouthPiece: 'No',
      cdChanger: 'No', battery: 'No', tyres: 'No',
      idols: '', wheelCover: '', wheelCap: '', mudFlaps: '', mats: '', dickyMat: '',
      cigaretteLighter: 'No', speakerRR: '', speakerFR: '', tweeters: '', extWarranty: 'No'
    },
    
    damageMarkings: [],
    complaints: [''],
    advisorNotes: '',
    
    promDate: '',
    promTime: '',
    estAmt: '',
    
    signatures: {
      customer: '',
      advisor: '',
      technician: '',
    }
  });

  const [photos, setPhotos] = useState([]);
  const [photoType, setPhotoType] = useState('Vehicle');

  // Photo capture, compression and upload states
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Client-side image compression
  const compressImage = (file) => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        resolve(file);
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(compressedFile);
          }, 'image/jpeg', 0.7);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFilesAdded = async (fileList) => {
    const newPhotos = [];
    setIsCompressing(true);
    setCompressionProgress(0);
    
    const files = Array.from(fileList);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const compressed = await compressImage(file);
        newPhotos.push(compressed);
      } else {
        newPhotos.push(file);
      }
      setCompressionProgress(Math.round(((i + 1) / files.length) * 100));
    }
    
    setPhotos(prev => [...prev, ...newPhotos]);
    setIsCompressing(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [cRes, vRes] = await Promise.all([
          fetch(`${API_BASE_URL}/customers`, { headers }),
          fetch(`${API_BASE_URL}/vehicles`, { headers })
        ]);
        if (cRes.ok && vRes.ok) {
          const cData = await cRes.json();
          const vData = await vRes.json();
          setCustomers(cData);
          setVehicles(vData);

          // If in edit mode, fetch the job card details
          if (editId) {
            const jcRes = await fetch(`${API_BASE_URL}/jobcards/${editId}`, { headers });
            if (jcRes.ok) {
              const jc = await jcRes.json();
              setSelectedCustomerId(jc.customerId._id);
              setSelectedVehicleId(jc.vehicleId._id);
              setFormData({
                contactPerson: jc.contactPerson || '',
                odometerReading: jc.odometerReading !== undefined && jc.odometerReading !== null ? jc.odometerReading.toString() : '',
                estimation: jc.estimation || '',
                color: jc.color || '',
                insuranceName: jc.insuranceName || '',
                claimNo: jc.claimNo || '',
                serviceType: jc.serviceType || 'General Servicing',
                serviceTypes: jc.serviceTypes && jc.serviceTypes.length > 0 ? jc.serviceTypes : (jc.serviceType ? [jc.serviceType] : ['General Servicing']),
                workCategory: jc.workCategory || 'RR',
                jobType: jc.jobType || 'Cash Job',
                serviceAdvisorName: jc.serviceAdvisorName || '',
                technicianName: jc.technicianName || '',
                qcName: jc.qcName || '',
                floorInchargeName: jc.floorInchargeName || '',
                inspectionChecklist: { ...formData.inspectionChecklist, ...jc.inspectionChecklist },
                fuelLevel: jc.fuelLevel || 'E',
                accessories: { ...formData.accessories, ...jc.accessories },
                damageMarkings: jc.damageMarkings || [],
                complaints: jc.complaints && jc.complaints.length > 0 ? jc.complaints : [''],
                advisorNotes: jc.advisorNotes || '',
                internalRemarks: jc.internalRemarks || '',
                technicianNotes: jc.technicianNotes || '',
                promDate: jc.promDate ? jc.promDate.split('T')[0] : '',
                promTime: jc.promTime || '',
                estAmt: jc.estAmt !== undefined && jc.estAmt !== null ? jc.estAmt.toString() : '',
                signatures: {
                  customer: jc.signatures?.customer || '',
                  advisor: jc.signatures?.advisor || '',
                  technician: jc.signatures?.technician || ''
                }
              });
            }
          }
        }
      } catch (err) {
        console.error('Failed to load initial wizard states:', err);
      }
    };
    loadInitialData();
  }, [token, editId]);

  // Filter vehicles when customer changes
  useEffect(() => {
    if (selectedCustomerId) {
      const filtered = vehicles.filter(v => v.customerId?._id === selectedCustomerId);
      setFilteredVehicles(filtered);
      if (filtered.length > 0 && !editId) {
        setSelectedVehicleId(filtered[0]._id);
        setFormData(prev => ({ ...prev, odometerReading: filtered[0].odometerReading !== undefined && filtered[0].odometerReading !== null ? filtered[0].odometerReading.toString() : '' }));
      }
    } else {
      setFilteredVehicles([]);
    }
  }, [selectedCustomerId, vehicles]);

  // Auto-fill odometer when vehicle changes
  const handleVehicleChange = (vId) => {
    setSelectedVehicleId(vId);
    const vehicle = vehicles.find(v => v._id === vId);
    if (vehicle) {
      setFormData(prev => ({ ...prev, odometerReading: vehicle.odometerReading !== undefined && vehicle.odometerReading !== null ? vehicle.odometerReading.toString() : '' }));
    }
  };

  const handleInspectionStatusChange = (key, status) => {
    setFormData(prev => {
      const current = prev.inspectionChecklist[key] || {};
      const nextVal = typeof current === 'string' ? { status: '', remarks: '' } : { ...current };
      nextVal.status = status;
      return {
        ...prev,
        inspectionChecklist: {
          ...prev.inspectionChecklist,
          [key]: nextVal
        }
      };
    });
  };

  const handleInspectionRemarksChange = (key, remarks) => {
    setFormData(prev => {
      const current = prev.inspectionChecklist[key] || {};
      const nextVal = typeof current === 'string' ? { status: current, remarks: '' } : { ...current };
      nextVal.remarks = remarks;
      return {
        ...prev,
        inspectionChecklist: {
          ...prev.inspectionChecklist,
          [key]: nextVal
        }
      };
    });
  };

  const handleAccessoryChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      accessories: {
        ...prev.accessories,
        [key]: value
      }
    }));
  };

  const handleAddComplaint = () => {
    setFormData(prev => ({
      ...prev,
      complaints: [...prev.complaints, '']
    }));
  };

  const handleRemoveComplaint = (idx) => {
    const list = [...formData.complaints];
    list.splice(idx, 1);
    setFormData(prev => ({ ...prev, complaints: list }));
  };

  const handleComplaintText = (idx, text) => {
    const list = [...formData.complaints];
    list[idx] = text;
    setFormData(prev => ({ ...prev, complaints: list }));
  };

  const handleSave = async () => {
    const cleanComplaints = formData.complaints.filter(c => c.trim() !== '');
    const submitData = {
      ...formData,
      customerId: selectedCustomerId,
      vehicleId: selectedVehicleId,
      complaints: cleanComplaints,
      odometerReading: Number(formData.odometerReading) || 0,
      estAmt: Number(formData.estAmt) || 0
    };

    const url = editId
      ? `${API_BASE_URL}/jobcards/${editId}`
      : `${API_BASE_URL}/jobcards`;
    
    const method = editId ? 'PUT' : 'POST';

    setIsSaving(true);
    setUploadProgress(0);
    setUploadStatusText('Saving Job Card Profile...');

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(submitData)
      });

      if (res.ok) {
        const savedJc = await res.json();
        
        // Upload photos if any
        if (photos.length > 0) {
          const totalPhotos = photos.length;
          for (let i = 0; i < totalPhotos; i++) {
            const file = photos[i];
            
            // XHR Upload with progress
            await new Promise((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('POST', `${API_BASE_URL}/jobcards/${savedJc._id}/photo`);
              xhr.setRequestHeader('Authorization', `Bearer ${token}`);
              
              xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                  const filePercent = Math.round((e.loaded / e.total) * 100);
                  const overallPercent = Math.round(((i / totalPhotos) * 100) + (filePercent / totalPhotos));
                  setUploadProgress(overallPercent);
                  setUploadStatusText(`Uploading photo ${i + 1} of ${totalPhotos} (${filePercent}%)...`);
                }
              };
              
              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  resolve(JSON.parse(xhr.responseText));
                } else {
                  reject(new Error(xhr.statusText || 'Upload failed'));
                }
              };
              
              xhr.onerror = () => reject(new Error('Network error during upload'));
              
              const photoForm = new FormData();
              photoForm.append('photo', file);
              photoForm.append('photoType', photoType);
              
              setUploadStatusText(`Initiating upload for photo ${i + 1} of ${totalPhotos}...`);
              xhr.send(photoForm);
            });
          }
        }
        
        setUploadProgress(100);
        setUploadStatusText('Job Card successfully saved!');
        setTimeout(() => {
          setIsSaving(false);
          onSaved();
        }, 800);
      } else {
        setIsSaving(false);
        const err = await res.json();
        alert(err.error || 'Failed to save job card.');
      }
    } catch (err) {
      setIsSaving(false);
      console.error(err);
      alert('An error occurred while saving. Please check network connection.');
    }
  };

  const activeVehicle = filteredVehicles.find(v => v._id === selectedVehicleId);
  const specs = activeVehicle ? resolveVehicleSpecs(activeVehicle.make, activeVehicle.model, activeVehicle.variant, activeVehicle.fuelType) : null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl h-fit max-w-5xl mx-auto select-none animate-fade-in relative">
      {isSaving && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center z-[9999] select-none animate-fade-in text-center p-6">
          <div className="glassmorphism max-w-sm w-full p-8 rounded-3xl border border-indigo-500/20 space-y-6">
            <div className="w-16 h-16 mx-auto bg-indigo-950/40 border border-indigo-900/40 rounded-2xl flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-950/30 animate-bounce">
              <Wrench className="w-8 h-8 animate-spin" />
            </div>
            
            <div className="space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-400">Saving Job Card</span>
              <h3 className="text-lg font-black text-white uppercase tracking-tight">{uploadStatusText}</h3>
            </div>

            <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-sky-500 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>

            <span className="block text-xs font-mono font-bold text-slate-500">{uploadProgress}% Complete</span>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
        <div>
          <h2 className="text-base font-extrabold text-slate-800 dark:text-white uppercase tracking-wider">
            {editId ? 'Modify Job Card' : 'Digital Job Card Wizard'}
          </h2>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 block">
            Step {step} of 5 — {
              step === 1 ? 'Customer & Automobile Select' :
              step === 2 ? '32-Point Servicing Checklist' :
              step === 3 ? 'Accessories & Fuel Gauge' :
              step === 4 ? 'Body Damages & Complaints' :
              'Signatures & Promised Delivery'
            }
          </span>
        </div>
        <button
          onClick={onCancel}
          className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3.5 py-1.5 rounded-xl border border-slate-250/20"
        >
          Cancel
        </button>
      </div>

      {/* Progress Line */}
      <div className="flex gap-2 justify-between mb-8">
        {[1, 2, 3, 4, 5].map(s => (
          <div 
            key={s} 
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              step >= s ? 'bg-indigo-600' : 'bg-slate-100 dark:bg-slate-800'
            }`}
          />
        ))}
      </div>

      {/* STEP 1: CUSTOMER & VEHICLE */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4 bg-slate-50 dark:bg-slate-950/20 p-5 rounded-2xl border border-slate-100 dark:border-slate-850">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-5 h-5 text-indigo-500" />
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Select Owner / Customer</h4>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Customer</label>
                <SearchableDropdown
                  items={customers}
                  value={selectedCustomerId}
                  onSelect={setSelectedCustomerId}
                  placeholder="Search customer name, company, phone..."
                  emptyOptionLabel="-- Choose Customer --"
                  type="customers"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Contact Person</label>
                <input
                  type="text"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  placeholder="Secondary driver or relative name"
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>            <div className="space-y-4 bg-slate-50 dark:bg-slate-950/20 p-5 rounded-2xl border border-slate-100 dark:border-slate-850">
              <div className="flex items-center gap-2 mb-2">
                <Car className="w-5 h-5 text-indigo-500" />
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Select Automobile</h4>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-550 mb-1">Vehicle Selection</label>
                {!selectedCustomerId ? (
                  <div className="text-center py-5 text-xs font-semibold text-slate-400 bg-white dark:bg-slate-950 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                    Select a customer first to load vehicles
                  </div>
                ) : filteredVehicles.length === 0 ? (
                  <div className="text-center py-5 text-xs font-bold text-amber-550 bg-amber-500/5 rounded-xl border border-dashed border-amber-500/25">
                    No vehicles registered for this customer
                  </div>
                ) : (
                  <div className="space-y-3.5 bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200/60 dark:border-slate-850">
                    {/* Brand Selector */}
                    <div>
                      <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1.5">1. Brand</span>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(new Set(filteredVehicles.map(v => v.make))).map(make => {
                          const logoRenderer = BRAND_LOGOS[make.toLowerCase()];
                          return (
                            <button
                              key={make}
                              type="button"
                              onClick={() => {
                                setSelectedBrand(make);
                                setSelectedModel('');
                                const models = Array.from(new Set(filteredVehicles.filter(v => v.make === make).map(v => v.model)));
                                if (models.length === 1) {
                                  setSelectedModel(models[0]);
                                  const matches = filteredVehicles.filter(v => v.make === make && v.model === models[0]);
                                  if (matches.length === 1) {
                                    handleVehicleChange(matches[0]._id);
                                  }
                                }
                              }}
                              className={`px-3 py-1.5 rounded-xl border text-[11px] font-extrabold transition-all duration-300 flex items-center gap-1.5 select-none ${
                                selectedBrand === make
                                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/15'
                                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 hover:border-indigo-400 dark:hover:border-indigo-500 hover:translate-y-[-1px]'
                              }`}
                            >
                              {logoRenderer ? logoRenderer('w-3.5 h-3.5') : <Car className="w-3.5 h-3.5" />}
                              <span>{make}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Model Selector */}
                    {selectedBrand && (
                      <div className="animate-fade-in border-t border-slate-100 dark:border-slate-855 pt-2.5">
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1.5">2. Model</span>
                        <div className="flex flex-wrap gap-2">
                          {Array.from(new Set(filteredVehicles.filter(v => v.make === selectedBrand).map(v => v.model))).map(model => (
                            <button
                              key={model}
                              type="button"
                              onClick={() => {
                                setSelectedModel(model);
                                const matches = filteredVehicles.filter(v => v.make === selectedBrand && v.model === model);
                                if (matches.length === 1) {
                                  handleVehicleChange(matches[0]._id);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-xl border text-[11px] font-extrabold transition-all duration-300 select-none ${
                                selectedModel === model
                                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/15'
                                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 hover:border-indigo-400 dark:hover:border-indigo-500 hover:translate-y-[-1px]'
                              }`}
                            >
                              {model}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Variant & License Plate Selector */}
                    {selectedBrand && selectedModel && (
                      <div className="animate-fade-in border-t border-slate-100 dark:border-slate-855 pt-2.5">
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1.5">3. Variant & registration</span>
                        <div className="flex flex-wrap gap-2">
                          {filteredVehicles.filter(v => v.make === selectedBrand && v.model === selectedModel).map(v => (
                            <button
                              key={v._id}
                              type="button"
                              onClick={() => handleVehicleChange(v._id)}
                              className={`px-3 py-1.5 rounded-xl border text-[11px] font-extrabold transition-all duration-300 flex items-center gap-2 select-none ${
                                selectedVehicleId === v._id
                                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/15'
                                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 hover:border-indigo-400 dark:hover:border-indigo-500 hover:translate-y-[-1px]'
                              }`}
                            >
                              <span>{v.variant || 'Standard'}</span>
                              <span className={`px-2 py-0.5 rounded font-mono text-[9px] border tracking-wider ${
                                selectedVehicleId === v._id
                                  ? 'bg-indigo-750 border-indigo-500 text-white'
                                  : 'bg-white dark:bg-slate-905 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                              }`}>
                                {v.vehicleNumber}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Odometer Reading (KM)</label>
                  <input
                    type="text"
                    inputMode="numeric"
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
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-2">Service Type(s) *</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                    {['General Servicing', 'Paid Service', 'Accident Repair', 'Warranty Work', 'Water Wash', 'Other'].map(type => {
                      const isChecked = formData.serviceTypes?.includes(type) || false;
                      return (
                        <label key={type} className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              let nextTypes = [...(formData.serviceTypes || [])];
                              if (nextTypes.includes(type)) {
                                nextTypes = nextTypes.filter(t => t !== type);
                              } else {
                                nextTypes.push(type);
                              }
                              setFormData({
                                ...formData,
                                serviceTypes: nextTypes,
                                serviceType: nextTypes[0] || 'General Servicing'
                              });
                            }}
                            className="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                          />
                          {type}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-550 mb-1">Customer Type</label>
                  <select
                    value={formData.workCategory}
                    onChange={(e) => setFormData({ ...formData, workCategory: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Insurance Jobs">insurance</option>
                    <option value="B/P">body shop(bshop)</option>
                    <option value="RR">RR(Running repair)</option>
                    <option value="PMS">PMS (Periodical Maintenance Service)</option>
                    <option value="Corporate">corporate</option>
                    <option value="General Service">General Service</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-550 mb-1">Job Type</label>
                  <select
                    value={formData.jobType}
                    onChange={(e) => setFormData({ ...formData, jobType: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Cash Job">Cash Job</option>
                    <option value="Insurance Job">Insurance Job</option>
                    <option value="Credit Job">Credit Job</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 dark:border-slate-800 pt-4">
            <div>
              <label className="block text-xs font-semibold text-slate-550">Color</label>
              <input
                type="text"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                placeholder="Metallic Silver"
                className="mt-1 w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-550">Insurance Name</label>
              <input
                type="text"
                value={formData.insuranceName}
                onChange={(e) => setFormData({ ...formData, insuranceName: e.target.value })}
                placeholder="Tata AIG"
                className="mt-1 w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-550">Insurance Claim No.</label>
              <input
                type="text"
                value={formData.claimNo}
                onChange={(e) => setFormData({ ...formData, claimNo: e.target.value })}
                placeholder="CLM-1092837"
                className="mt-1 w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: 32 POINT CHECKLIST */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-4 bg-slate-50 dark:bg-slate-950/20 p-3 rounded-xl border border-slate-105/50">
            <CheckSquare className="w-5 h-5 text-indigo-600" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">32 Servicing and Maintenance Checks Sheet</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-h-[50vh] overflow-y-auto pr-2">
            
            {/* COLUMN 1: ENGINE */}
            <div className="space-y-4">
              <h5 className="text-[10px] font-extrabold uppercase text-slate-400 border-b pb-2 tracking-wider">1. Engine (Oil & Water)</h5>
              {[
                { key: 'engineOil', label: 'Engine Oil' },
                { key: 'gearboxFluid', label: 'Gearbox Fluid' },
                { key: 'automaticTransmissionFluid', label: 'Automatic Transmission Fluid' },
                { key: 'differentialFluid', label: 'Differential Fluid' },
                { key: 'brakeClutchFluid', label: 'Brake & Clutch Fluid' },
                { key: 'powerSteeringFluid', label: 'Power Steering Fluid' },
                { key: 'batteryFluid', label: 'Battery Fluid' },
                { key: 'windscreenWashingFluid', label: 'Windscreen Washer' },
                { key: 'coolantAntiFreezeFluid', label: 'Coolant / Anti-freeze' },
                { key: 'engineOilFilter', label: 'Engine Oil Filter' },
                { key: 'airFilterAirconFilter', label: 'Air / Aircon Filter' },
                { key: 'fuelFilter', label: 'Fuel Filter' },
              ].map(item => (
                <div key={item.key} className="flex flex-col gap-1.5 border-b border-slate-105/40 dark:border-slate-800/40 pb-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-350">{item.label}</span>
                    <div className="flex gap-1">
                      {['Yes', 'No'].map(opt => {
                        const itemVal = formData.inspectionChecklist[item.key];
                        const currentStatus = typeof itemVal === 'string' ? (itemVal === 'OK' ? 'Yes' : itemVal === 'Not OK' ? 'No' : '') : (itemVal?.status || '');
                        const isActive = currentStatus === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handleInspectionStatusChange(item.key, opt)}
                            className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${
                              isActive
                                ? opt === 'Yes' ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' : 'bg-red-500 border-red-500 text-white shadow-sm'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={typeof formData.inspectionChecklist[item.key] === 'string' ? '' : (formData.inspectionChecklist[item.key]?.remarks || '')}
                    onChange={(e) => handleInspectionRemarksChange(item.key, e.target.value)}
                    placeholder="Remarks / findings"
                    className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded text-[9px] font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              ))}
            </div>

            {/* COLUMN 2: BODY & DRIVER SEAT */}
            <div className="space-y-4">
              <h5 className="text-[10px] font-extrabold uppercase text-slate-400 border-b pb-2 tracking-wider">2. Driver seat & body</h5>
              {[
                { key: 'tightnessOfBelts', label: 'Tightness of Belts' },
                { key: 'engineTuning', label: 'Engine Tuning' },
                { key: 'clutch', label: 'Clutch operation' },
                { key: 'handbrakeSystem', label: 'Handbrake / Brake' },
                { key: 'vacuumPumpBrakeBooster', label: 'Brake Booster' },
                { key: 'sparkPlugs', label: 'Spark Plugs' },
                { key: 'suspension', label: 'Suspension checks' },
                { key: 'rubberMudFlapProtector', label: 'Mud flap rubber' },
                { key: 'fuelInjectors', label: 'Fuel Injectors' },
                { key: 'headlightsFoglightsTails', label: 'Headlights/Foglights' },
                { key: 'brakelightsReverse', label: 'Brakelights/Reverse' },
                { key: 'signalLights', label: 'Signal Indicators' },
              ].map(item => (
                <div key={item.key} className="flex flex-col gap-1.5 border-b border-slate-105/40 dark:border-slate-800/40 pb-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-350">{item.label}</span>
                    <div className="flex gap-1">
                      {['Yes', 'No'].map(opt => {
                        const itemVal = formData.inspectionChecklist[item.key];
                        const currentStatus = typeof itemVal === 'string' ? (itemVal === 'OK' ? 'Yes' : itemVal === 'Not OK' ? 'No' : '') : (itemVal?.status || '');
                        const isActive = currentStatus === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handleInspectionStatusChange(item.key, opt)}
                            className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${
                              isActive
                                ? opt === 'Yes' ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' : 'bg-red-500 border-red-500 text-white shadow-sm'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={typeof formData.inspectionChecklist[item.key] === 'string' ? '' : (formData.inspectionChecklist[item.key]?.remarks || '')}
                    onChange={(e) => handleInspectionRemarksChange(item.key, e.target.value)}
                    placeholder="Remarks / findings"
                    className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded text-[9px] font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              ))}
            </div>

            {/* COLUMN 3: CHASSIS */}
            <div className="space-y-4">
              <h5 className="text-[10px] font-extrabold uppercase text-slate-400 border-b pb-2 tracking-wider">3. Chassis & Specials</h5>
              {[
                { key: 'tyreTread', label: 'Tyre Tread depth' },
                { key: 'tyrePressure', label: 'Tyre Pressure check' },
                { key: 'windscreenWiperWasher', label: 'Wipers & Washer' },
                { key: 'safetyNutsBolts', label: 'Safety Nuts & Bolts' },
                { key: 'horn', label: 'Horn check' },
                { key: 'exhaustPipesMounting', label: 'Exhaust & Mounting' },
                { key: 'safetyBelts', label: 'Seat Belts' },
                { key: 'driveShaftDustCovers', label: 'Drive shaft covers' },
              ].map(item => (
                <div key={item.key} className="flex flex-col gap-1.5 border-b border-slate-105/40 dark:border-slate-800/40 pb-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-350">{item.label}</span>
                    <div className="flex gap-1">
                      {['Yes', 'No'].map(opt => {
                        const itemVal = formData.inspectionChecklist[item.key];
                        const currentStatus = typeof itemVal === 'string' ? (itemVal === 'OK' ? 'Yes' : itemVal === 'Not OK' ? 'No' : '') : (itemVal?.status || '');
                        const isActive = currentStatus === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handleInspectionStatusChange(item.key, opt)}
                            className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${
                              isActive
                                ? opt === 'Yes' ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' : 'bg-red-500 border-red-500 text-white shadow-sm'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={typeof formData.inspectionChecklist[item.key] === 'string' ? '' : (formData.inspectionChecklist[item.key]?.remarks || '')}
                    onChange={(e) => handleInspectionRemarksChange(item.key, e.target.value)}
                    placeholder="Remarks / findings"
                    className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded text-[9px] font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* STEP 3: ACCESSORIES & FUEL GAUGE */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Accessories Checklist */}
            <div className="space-y-4 bg-slate-50 dark:bg-slate-950/20 p-5 rounded-2xl border border-slate-100 dark:border-slate-850">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-2">Accessories Inventory Checklist</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3.5 text-xs">
                {[
                  { key: 'serviceBook', label: 'Service Book' },
                  { key: 'toolKit', label: 'Tool Kit' },
                  { key: 'spareWheel', label: 'Spare Wheel' },
                  { key: 'jack', label: 'Jack' },
                  { key: 'jackHandle', label: 'Jack Handle' },
                  { key: 'carPerfume', label: 'Car Perfume' },
                  { key: 'stereo', label: 'Stereo System' },
                  { key: 'battery', label: 'Battery' },
                  { key: 'tyres', label: 'Tyres condition' },
                  { key: 'cigaretteLighter', label: 'Cigarette Lighter' },
                  { key: 'extWarranty', label: 'Ext. Warranty' },
                ].map(acc => (
                  <div key={acc.key} className="flex justify-between items-center">
                    <span className="font-semibold text-slate-700 dark:text-slate-350">{acc.label}</span>
                    <div className="flex gap-1.5">
                      {['Yes', 'No'].map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleAccessoryChange(acc.key, opt)}
                          className={`w-10 py-1 rounded text-[10px] font-bold border transition-colors ${
                            formData.accessories[acc.key] === opt
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Counts & Fuel Needle */}
            <div className="space-y-6">
              <div className="bg-slate-50 dark:bg-slate-950/20 p-5 rounded-2xl border border-slate-100 dark:border-slate-850 space-y-4">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Accessory counts</h4>
                
                <div className="grid grid-cols-2 gap-4 text-xs">
                  {[
                    { key: 'idols', label: 'Idols (Nos)' },
                    { key: 'wheelCover', label: 'Wheel Covers' },
                    { key: 'wheelCap', label: 'Wheel Caps' },
                    { key: 'mudFlaps', label: 'Mud Flaps' },
                    { key: 'mats', label: 'Mats (Nos)' },
                    { key: 'dickyMat', label: 'Dicky Mat (Nos)' },
                    { key: 'speakerRR', label: 'Speaker RR (Nos)' },
                    { key: 'speakerFR', label: 'Speaker FR (Nos)' },
                  ].map(countField => (
                    <div key={countField.key}>
                      <label className="block text-[10px] font-semibold text-slate-550 uppercase tracking-wider mb-0.5">{countField.label}</label>
                      <input
                        type="text"
                        value={formData.accessories[countField.key]}
                        onChange={(e) => handleAccessoryChange(countField.key, e.target.value)}
                        placeholder="e.g. 4"
                        className="w-full px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs font-semibold focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Fuel Level Selector */}
              <div className="bg-slate-50 dark:bg-slate-950/20 p-5 rounded-2xl border border-slate-100 dark:border-slate-850 space-y-4">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Fuel Level Needle Position</h4>
                <div className="flex justify-between items-center bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200/50">
                  <span className="text-xs font-bold text-slate-400">Empty</span>
                  <div className="flex gap-2">
                    {['Empty', '1/4', 'Half', '3/4', 'Full'].map(level => {
                      const getNormalizedFuelLevel = (lvl) => {
                        if (lvl === 'E') return 'Empty';
                        if (lvl === '1/2') return 'Half';
                        if (lvl === 'F') return 'Full';
                        return lvl;
                      };
                      const isActive = getNormalizedFuelLevel(formData.fuelLevel) === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setFormData({ ...formData, fuelLevel: level })}
                          className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                            isActive
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350'
                          }`}
                        >
                          {level}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-xs font-bold text-indigo-650">Full</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* STEP 4: CAR DENT/SCRATCH DRAWING & COMPLAINTS */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Draw Damage markings */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Car body damage layout</h4>
              <VehicleDamageCanvas 
                markings={formData.damageMarkings} 
                onChange={(list) => setFormData({ ...formData, damageMarkings: list })} 
              />
            </div>

            {/* Complaints list */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Customer complaints</h4>
              
              <div className="space-y-3 max-h-[35vh] overflow-y-auto pr-1">
                {formData.complaints.map((comp, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={comp}
                      onChange={(e) => handleComplaintText(idx, e.target.value)}
                      placeholder={`Complaint #${idx + 1} (e.g. Engine ticking noise)`}
                      className="flex-1 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                    />
                    {formData.complaints.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveComplaint(idx)}
                        className="text-red-500 hover:text-red-700 p-2 rounded-xl border border-slate-200/40 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddComplaint}
                className="flex items-center gap-1 text-xs font-bold text-indigo-650 hover:text-indigo-700"
              >
                <Plus className="w-4 h-4" /> Add Complaint Line
              </button>              {/* Photo upload attachment */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-5 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">Vehicle Photo Capture</h4>
                    <span className="text-[10px] text-slate-450 font-semibold block mt-0.5">Attach inspection images & documents</span>
                  </div>
                  
                  {/* Photo type selector */}
                  <div className="w-40">
                    <select
                      value={photoType}
                      onChange={(e) => setPhotoType(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none"
                    >
                      <option value="Vehicle">Vehicle Photo</option>
                      <option value="Damage">Damage Detail</option>
                      <option value="Document">Supporting Doc</option>
                      <option value="Before Repair">Before Repair</option>
                      <option value="During Repair">During Repair</option>
                      <option value="After Repair">After Repair</option>
                    </select>
                  </div>
                </div>

                {/* Drag and Drop Zone / Capture Buttons */}
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('gallery-upload-input').click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer relative ${
                    isDragging 
                      ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/10' 
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 hover:bg-slate-100/50 dark:bg-slate-950/30 dark:hover:bg-slate-950/50'
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      if (e.target.files) {
                        handleFilesAdded(e.target.files);
                      }
                    }}
                    className="hidden"
                    id="camera-capture-input"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) {
                        handleFilesAdded(e.target.files);
                      }
                    }}
                    className="hidden"
                    id="gallery-upload-input"
                  />

                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-2xl shadow-sm">
                      <Camera className="w-6 h-6" />
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-xs font-black text-slate-800 dark:text-slate-200">
                        Drag & drop images here, or <span className="text-indigo-600 hover:text-indigo-700">browse files</span>
                      </p>
                      <p className="text-[10px] text-slate-400 font-semibold">
                        Supports multiple vehicle, damage, or document photos
                      </p>
                    </div>
                  </div>
                </div>

                {/* Mobile Direct Camera Capture Action Button */}
                <div className="grid grid-cols-2 gap-3 sm:hidden">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      document.getElementById('camera-capture-input').click();
                    }}
                    className="flex justify-center items-center gap-1.5 py-3 px-4 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/10 hover:bg-indigo-700"
                  >
                    <Camera className="w-4 h-4" />
                    Capture Photo
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      document.getElementById('gallery-upload-input').click();
                    }}
                    className="flex justify-center items-center gap-1.5 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200"
                  >
                    Choose Gallery
                  </button>
                </div>

                {/* Compression Progress Info */}
                {isCompressing && (
                  <div className="animate-fade-in bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-950/30 p-3 rounded-xl flex items-center justify-between">
                    <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400">
                      Compressing and optimizing vehicle images...
                    </span>
                    <span className="text-[10px] font-mono font-bold text-indigo-700 dark:text-indigo-400">
                      {compressionProgress}%
                    </span>
                  </div>
                )}

                {/* Photos Previews List */}
                {photos.length > 0 && (
                  <div className="space-y-3 pt-1">
                    <div className="text-[10px] text-indigo-700 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/20 px-3.5 py-2.5 rounded-xl flex justify-between items-center">
                      <span>{photos.length} files optimized & prepared to upload</span>
                      <button 
                        type="button" 
                        onClick={() => setPhotos([])} 
                        className="text-[10px] text-red-500 hover:text-red-750 font-bold uppercase transition-colors"
                      >
                        Clear All
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                      {photos.map((file, idx) => {
                        const isImage = file.type.startsWith('image/');
                        const previewUrl = isImage ? URL.createObjectURL(file) : null;
                        const sizeKb = Math.round(file.size / 1024);
                        
                        return (
                          <div key={idx} className="relative group border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-950 aspect-square flex flex-col items-center justify-center p-1 text-center shadow-xs">
                            {isImage ? (
                              <>
                                <img src={previewUrl} alt={file.name} className="w-full h-full object-cover rounded-lg" />
                                <div className="absolute inset-x-0 bottom-0 bg-slate-950/60 p-1 text-[8px] font-mono text-white truncate rounded-b-lg">
                                  {sizeKb} KB
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-col items-center justify-center p-1.5 w-full">
                                <FileText className="w-6 h-6 text-slate-400" />
                                <span className="text-[7px] text-slate-500 truncate max-w-full font-mono mt-1 block">{file.name}</span>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const updated = [...photos];
                                updated.splice(idx, 1);
                                setPhotos(updated);
                              }}
                              className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-650 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow-md transition-colors z-20"
                            >
                              &times;
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

            </div>

          </div>
        </div>
      )}

      {/* STEP 5: SIGNATURES & PROMISED DELIVERY */}
      {step === 5 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 dark:bg-slate-950/20 p-5 rounded-2xl border border-slate-100 dark:border-slate-850">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Advisor Free Text Notes</label>
                <textarea
                  rows="3"
                  value={formData.advisorNotes}
                  onChange={(e) => setFormData({ ...formData, advisorNotes: e.target.value })}
                  placeholder="Advisor notes, parts to order, specific customer instructions..."
                  className="mt-1.5 w-full px-3.5 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Technician Notes</label>
                  <textarea
                    rows="2"
                    value={formData.technicianNotes || ''}
                    onChange={(e) => setFormData({ ...formData, technicianNotes: e.target.value })}
                    placeholder="Initial observations and diagnostic notes..."
                    className="mt-1.5 w-full px-3.5 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Internal Workshop Remarks</label>
                  <textarea
                    rows="2"
                    value={formData.internalRemarks || ''}
                    onChange={(e) => setFormData({ ...formData, internalRemarks: e.target.value })}
                    placeholder="Remarks for internal workshop reference..."
                    className="mt-1.5 w-full px-3.5 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800/80 pt-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider">Staff Assignment</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase">Service Advisor</label>
                    <input
                      type="text"
                      value={formData.serviceAdvisorName}
                      onChange={(e) => setFormData({ ...formData, serviceAdvisorName: e.target.value })}
                      placeholder="e.g. Ramesh Kumar"
                      className="mt-1 w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase">Technician</label>
                    <input
                      type="text"
                      value={formData.technicianName}
                      onChange={(e) => setFormData({ ...formData, technicianName: e.target.value })}
                      placeholder="e.g. Suresh QC"
                      className="mt-1 w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase">Quality Checker (QC)</label>
                    <input
                      type="text"
                      value={formData.qcName}
                      onChange={(e) => setFormData({ ...formData, qcName: e.target.value })}
                      placeholder="e.g. Anil Kumar"
                      className="mt-1 w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase">Floor Incharge</label>
                    <input
                      type="text"
                      value={formData.floorInchargeName}
                      onChange={(e) => setFormData({ ...formData, floorInchargeName: e.target.value })}
                      placeholder="e.g. Vikram Singh"
                      className="mt-1 w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Promised Delivery Date</label>
                <input
                  type="date"
                  value={formData.promDate}
                  onChange={(e) => setFormData({ ...formData, promDate: e.target.value })}
                  className="mt-1.5 w-full px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Promised Time</label>
                <input
                  type="text"
                  value={formData.promTime}
                  onChange={(e) => setFormData({ ...formData, promTime: e.target.value })}
                  placeholder="e.g. 5:30 PM"
                  className="mt-1.5 w-full px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                />
              </div>


            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 border-t border-slate-100 dark:border-slate-800 pt-6">
            <SignaturePad
              label="Customer Digital Signature"
              value={formData.signatures.customer}
              onChange={(sig) => setFormData({
                ...formData,
                signatures: { ...formData.signatures, customer: sig }
              })}
            />

            <SignaturePad
              label="Advisor Digital Signature"
              value={formData.signatures.advisor}
              onChange={(sig) => setFormData({
                ...formData,
                signatures: { ...formData.signatures, advisor: sig }
              })}
            />

            <SignaturePad
              label="Technician Digital Signature"
              value={formData.signatures.technician || ''}
              onChange={(sig) => setFormData({
                ...formData,
                signatures: { ...formData.signatures, technician: sig }
              })}
            />
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between items-center border-t border-slate-100 dark:border-slate-800 pt-6 mt-8">
        <button
          type="button"
          disabled={step === 1}
          onClick={() => setStep(step - 1)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-350 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>

        {step < 5 ? (
          <button
            type="button"
            disabled={step === 1 && (!selectedCustomerId || !selectedVehicleId)}
            onClick={() => setStep(step + 1)}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10 disabled:opacity-45"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="flex items-center gap-1.5 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10 disabled:opacity-45"
          >
            <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save Job Card'}
          </button>
        )}
      </div>

    </div>
  );
}
