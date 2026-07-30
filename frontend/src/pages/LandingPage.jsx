import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Wrench, ShieldCheck, Clock, Phone, MapPin, Car, FileText, ChevronRight, ChevronLeft, ArrowRight, Lock, X, CheckCircle, Navigation, Star, Award, Settings, Users, ShieldAlert, Sparkles, Menu, User, Calendar, Hash, Mail } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import Login from './Login';
import InternationalPhoneInput from '../components/InternationalPhoneInput';
import { API_BASE_URL, OWNER_SUPPORT_NUMBER, BRANCHES, getBranchDirectionsUrl } from '../config';

export default function LandingPage({ onLoginSuccess, onStaffLoginClick }) {
  const [heroIdx, setHeroIdx] = useState(0);
  const [activeCategory, setActiveCategory] = useState('All');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [testimonialIdx, setTestimonialIdx] = useState(0);
  const [bookingRef, setBookingRef] = useState('');
  const [selectedService, setSelectedService] = useState(null);

  // Booking Form State & Validation
  const [customerName, setCustomerName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [preferredStream, setPreferredStream] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [submittedDate, setSubmittedDate] = useState('');
  const [errors, setErrors] = useState({});
  const [formTouched, setFormTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessMsg, setShowSuccessMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Auto-fill & Search dropdown states
  const [suggestions, setSuggestions] = useState([]);
  const [activeSearchField, setActiveSearchField] = useState(null); // 'name' | 'phone' | 'plate'
  const [searchQuery, setSearchQuery] = useState('');

  const performSearch = async (query) => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const q = query.trim();
    try {
      const res = await fetch(`${API_BASE_URL}/customers/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data);
      } else {
        throw new Error('API failed');
      }
    } catch (err) {
      console.warn('Search API failed or offline, searching local mock storage:', err);
      // Fallback search across local/session storage
      const customers = JSON.parse(sessionStorage.getItem('mock_customers') || localStorage.getItem('mock_customers') || '[]');
      const vehicles = JSON.parse(sessionStorage.getItem('mock_vehicles') || localStorage.getItem('mock_vehicles') || '[]');

      const resultsMap = new Map();

      // Search by Customer Name or Mobile
      const matchedCustomers = customers.filter(c => 
        (c.name && c.name.toLowerCase().includes(q.toLowerCase())) ||
        (c.mobile && c.mobile.toLowerCase().includes(q.toLowerCase()))
      );

      // Helper to add unique entry
      const addResult = (cust, veh) => {
        if (!cust) return;
        const key = `${cust._id}_${veh ? veh._id : 'no_vehicle'}`;
        if (!resultsMap.has(key)) {
          resultsMap.set(key, {
            customerId: cust._id,
            customerName: cust.name,
            mobile: cust.mobile,
            email: cust.email || '',
            vehicleId: veh ? veh._id : null,
            vehicleNumber: veh ? veh.vehicleNumber : '',
            vehicleModel: veh ? `${veh.make} ${veh.model}` : ''
          });
        }
      };

      // Add direct customer matches
      matchedCustomers.forEach(cust => {
        const custVehs = vehicles.filter(v => v.customerId === cust._id || (v.customerId && v.customerId._id === cust._id));
        if (custVehs.length > 0) {
          custVehs.forEach(veh => addResult(cust, veh));
        } else {
          addResult(cust, null);
        }
      });

      // Search directly by Vehicle Number
      const matchedVehiclesByNo = vehicles.filter(v => 
        v.vehicleNumber && v.vehicleNumber.toLowerCase().includes(q.toLowerCase())
      );
      matchedVehiclesByNo.forEach(veh => {
        const custId = typeof veh.customerId === 'object' ? veh.customerId?._id : veh.customerId;
        const cust = customers.find(c => c._id === custId) || veh.customerId;
        addResult(cust, veh);
      });

      setSuggestions(Array.from(resultsMap.values()));
    }
  };

  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleSelectSuggestion = (suggestion) => {
    if (suggestion.customerName) setCustomerName(suggestion.customerName);
    if (suggestion.mobile) setContactPhone(suggestion.mobile);
    if (suggestion.email) setCustomerEmail(suggestion.email);
    if (suggestion.vehicleNumber) setVehiclePlate(suggestion.vehicleNumber);
    if (suggestion.vehicleModel) setVehicleModel(suggestion.vehicleModel);

    // Clear suggestions
    setSuggestions([]);
    setActiveSearchField(null);
    setSearchQuery('');

    // Clear validation errors for these fields
    setErrors(prev => ({
      ...prev,
      customerName: '',
      contactPhone: '',
      vehiclePlate: ''
    }));
  };

  const dropdownRef = React.useRef(null);
  const mobileMenuRef = React.useRef(null);
  const mobileMenuButtonRef = React.useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setActiveSearchField(null);
        setSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleClickOutsideMobileMenu = (event) => {
      if (
        isMobileMenuOpen &&
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target) &&
        mobileMenuButtonRef.current &&
        !mobileMenuButtonRef.current.contains(event.target)
      ) {
        setIsMobileMenuOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutsideMobileMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutsideMobileMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  const validateField = (name, value) => {
    let errorMsg = '';
    const trimmed = typeof value === 'string' ? value.trim() : '';

    if (name === 'customerName') {
      if (!trimmed) {
        errorMsg = 'Please enter your name.';
      } else {
        const nameRegex = /^[A-Za-z]+( [A-Za-z]+)*$/;
        if (!nameRegex.test(trimmed)) {
          errorMsg = 'Please enter a valid name using letters only.';
        }
      }
    } else if (name === 'customerEmail') {
      if (trimmed) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmed)) {
          errorMsg = 'Please enter a valid email address.';
        }
      }
    } else if (name === 'contactPhone') {
      if (!value) {
        errorMsg = 'Please enter a valid phone number.';
      } else if (value.length < 8) {
        errorMsg = 'Phone number is too short.';
      } else if (value.length > 16) {
        errorMsg = 'Phone number is too long.';
      }
    } else if (name === 'vehiclePlate') {
      const plateRegex = /^[A-Z0-9-]+$/i;
      if (!trimmed || !plateRegex.test(trimmed)) {
        errorMsg = 'Please enter a valid vehicle registration number.';
      }
    } else if (name === 'preferredDate') {
      if (!value) {
        errorMsg = 'Please select a preferred service date.';
      } else {
        const selectedDate = new Date(value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        selectedDate.setHours(0, 0, 0, 0);
        if (selectedDate < today) {
          errorMsg = 'Please select today or a future date.';
        }
      }
    } else if (name === 'preferredStream') {
      if (!value) {
        errorMsg = 'Please select a service category.';
      }
    }
    return errorMsg;
  };

  const handleDateChange = (e) => {
    let val = e.target.value;
    setPreferredDate(val);
    if (formTouched || errors.preferredDate) {
      const err = validateField('preferredDate', val);
      setErrors(prev => ({ ...prev, preferredDate: err }));
    }
  };

  const getTodayString = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatDateToDMY = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  };

  const handleNameChange = (e) => {
    let val = e.target.value.replace(/[^A-Za-z ]/g, '').replace(/  +/g, ' ');
    setCustomerName(val);
    setActiveSearchField('name');
    setSearchQuery(val);
    if (formTouched || errors.customerName) {
      const err = validateField('customerName', val);
      setErrors(prev => ({ ...prev, customerName: err }));
    }
  };

  const handleNameBlur = () => {
    const trimmed = customerName.trim();
    setCustomerName(trimmed);
    const err = validateField('customerName', trimmed);
    setErrors(prev => ({ ...prev, customerName: err }));
  };

  const handlePhoneChange = (val) => {
    setContactPhone(val);
    setActiveSearchField('phone');
    setSearchQuery(val);
    if (formTouched || errors.contactPhone) {
      const err = validateField('contactPhone', val);
      setErrors(prev => ({ ...prev, contactPhone: err }));
    }
  };

  const handlePhoneBlur = () => {
    const err = validateField('contactPhone', contactPhone);
    setErrors(prev => ({ ...prev, contactPhone: err }));
  };

  const handlePlateChange = (e) => {
    let val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    setVehiclePlate(val);
    setActiveSearchField('plate');
    setSearchQuery(val);
    if (formTouched || errors.vehiclePlate) {
      const err = validateField('vehiclePlate', val);
      setErrors(prev => ({ ...prev, vehiclePlate: err }));
    }
  };

  const handlePlateBlur = () => {
    const trimmed = vehiclePlate.trim();
    setVehiclePlate(trimmed);
    const err = validateField('vehiclePlate', trimmed);
    setErrors(prev => ({ ...prev, vehiclePlate: err }));
  };

  const handleStreamChange = (e) => {
    let val = e.target.value;
    setPreferredStream(val);
    if (formTouched || errors.preferredStream) {
      const err = validateField('preferredStream', val);
      setErrors(prev => ({ ...prev, preferredStream: err }));
    }
  };

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    setFormTouched(true);

    const trimmedName = customerName.trim();
    const trimmedPhone = contactPhone.trim();
    const trimmedPlate = vehiclePlate.trim();

    setCustomerName(trimmedName);
    setContactPhone(trimmedPhone);
    setVehiclePlate(trimmedPlate);

    const nameErr = validateField('customerName', trimmedName);
    const phoneErr = validateField('contactPhone', trimmedPhone);
    const emailErr = validateField('customerEmail', customerEmail);
    const plateErr = validateField('vehiclePlate', trimmedPlate);
    const dateErr = validateField('preferredDate', preferredDate);
    const streamErr = validateField('preferredStream', preferredStream);

    const newErrors = {
      customerName: nameErr,
      contactPhone: phoneErr,
      customerEmail: emailErr,
      vehiclePlate: plateErr,
      preferredDate: dateErr,
      preferredStream: streamErr
    };

    setErrors(newErrors);

    if (nameErr || phoneErr || emailErr || plateErr || dateErr || streamErr) {
      return;
    }

    const sanitize = (text) => {
      if (!text) return '';
      let clean = text.replace(/<[^>]*>?/g, '');
      clean = clean.replace(/['";#\*]/g, '');
      clean = clean.replace(/--/g, '-');
      return clean;
    };

    // Sanitize inputs
    const sanitizedName = sanitize(trimmedName);
    const sanitizedPhone = sanitize(trimmedPhone);
    const sanitizedEmail = sanitize(customerEmail.trim());
    const sanitizedPlate = sanitize(trimmedPlate);
    const sanitizedModel = sanitize(vehicleModel.trim());
    const sanitizedStream = sanitize(preferredStream);

    setIsSubmitting(true);
    setShowSuccessMsg(false);
    setErrorMsg('');

    try {
      const res = await fetch(`${API_BASE_URL}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: sanitizedName,
          mobile: sanitizedPhone,
          email: sanitizedEmail,
          vehicleNumber: sanitizedPlate,
          vehicleModel: sanitizedModel,
          serviceType: sanitizedStream,
          preferredDate: formatDateToDMY(preferredDate),
          bookingDate: new Date().toLocaleDateString('en-IN'),
          bookingTime: new Date().toLocaleTimeString('en-IN')
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || 'Failed to create booking');
      }

      const generatedRef = `MVSS-${Date.now().toString().slice(-6).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      setBookingRef(generatedRef);
      setSubmittedDate(formatDateToDMY(preferredDate));
      setShowSuccessMsg(true);
      setCustomerName('');
      setContactPhone('');
      setCustomerEmail('');
      setVehiclePlate('');
      setVehicleModel('');
      setPreferredStream('');
      setPreferredDate('');
      setErrors({});
      setFormTouched(false);

      // Auto-hide success message after 15 seconds so they can write down the ref
      setTimeout(() => {
        setShowSuccessMsg(false);
      }, 15000);
    } catch (err) {
      if (err.message && err.message !== 'Failed to fetch' && err.message.indexOf('network') === -1 && err.message !== 'Failed to create booking') {
        setErrorMsg(err.message || 'Unable to submit appointment request. Please try again.');
      } else {
        console.warn('Booking API offline, falling back to LocalStorage demo:', err);

        const generatedRef = `MVSS-${Date.now().toString().slice(-6).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
        setBookingRef(generatedRef);

        // Local storage fallback for offline demo
        const mockNotifs = JSON.parse(localStorage.getItem('mock_notifications') || '[]');
        mockNotifs.push({
          _id: 'mock_notif_' + Date.now(),
          type: 'booking',
          title: 'New Service Booking',
          message: `${sanitizedName} has requested a service appointment on ${formatDateToDMY(preferredDate)}.`,
          customerName: sanitizedName,
          mobile: sanitizedPhone,
          vehicleNumber: sanitizedPlate,
          vehicleModel: sanitizedModel,
          serviceType: sanitizedStream,
          preferredDate: formatDateToDMY(preferredDate),
          status: 'unread',
          createdAt: new Date().toISOString()
        });
        localStorage.setItem('mock_notifications', JSON.stringify(mockNotifs));

        // Also save message fallback
        const mockMsgs = JSON.parse(localStorage.getItem('mock_messages') || '[]');
        mockMsgs.push({
          _id: 'mock_msg_' + Date.now(),
          type: 'booking',
          senderName: sanitizedName,
          phone: sanitizedPhone,
          subject: 'Service Booking Message',
          body: `${sanitizedName} has requested a service slot for vehicle ${sanitizedPlate}${sanitizedModel ? ` (${sanitizedModel})` : ''} (Type: ${sanitizedStream}) on ${formatDateToDMY(preferredDate)} (submitted on ${new Date().toLocaleDateString('en-IN')}).`,
          status: 'unread',
          createdAt: new Date().toISOString()
        });
        localStorage.setItem('mock_messages', JSON.stringify(mockMsgs));

        // In demo/offline mode, we trigger the success flow for simulation
        setSubmittedDate(formatDateToDMY(preferredDate));
        setShowSuccessMsg(true);
        setCustomerName('');
        setContactPhone('');
        setVehiclePlate('');
        setVehicleModel('');
        setPreferredStream('');
        setPreferredDate('');
        setErrors({});
        setFormTouched(false);

        setTimeout(() => {
          setShowSuccessMsg(false);
        }, 15000);

        // Dispatch storage event so header can update
        window.dispatchEvent(new Event('storage'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hero slideshow photos (Workshop photos only - NO LOGO)
  const heroSlides = [
    { src: '/workshop/page_5_img_1.jpeg', label: 'Workshop Front View' },
    { src: '/workshop/page_2_img_1.jpeg', label: 'Service Bay' },
    { src: '/workshop/page_8_img_1.jpeg', label: 'BMW Service Area' },
    { src: '/workshop/page_10_img_1.jpeg', label: 'Mercedes Service Area' },
    { src: '/workshop/page_3_img_1.jpeg', label: 'Technician Team' },
    { src: '/workshop/page_7_img_1.jpeg', label: 'Workshop Interior' }
  ];

  // 10 Unique Gallery Photos mapped EXACTLY to client specifications (No duplicates, no Auto4m logo)
  const galleryPhotos = [
    // CATEGORY A: Workshop Infrastructure
    { src: '/workshop/page_10_img_1.jpeg', category: 'Infrastructure', title: 'Large Workshop Floor', desc: 'Workshop hall image with multiple service bays.' },
    { src: '/workshop/page_2_img_1.jpeg', category: 'Infrastructure', title: 'Hydraulic Lift Service Bay', desc: 'Vehicle-on-lift image in the hydraulic service bay.' },
 
    // CATEGORY B: Live Service Operations
    { src: '/workshop/page_3_img_1.jpeg', category: 'Operations', title: 'Live Service Operations', desc: 'Technicians actively repairing vehicles.' },
    { src: '/workshop/page_7_img_1.jpeg', category: 'Operations', title: 'Expert Technician Team', desc: 'Mechanics and team working together on vehicle repairs.' },
 
    // CATEGORY C: Body Shop & Paint
    { src: '/workshop/paint_booth.png', category: 'Body Shop', title: 'Body Shop & Paint Center', desc: 'Vehicle painting and spray booth room.' },
 
    // CATEGORY D: Equipment & Tools
    { src: '/workshop/page_9_img_1.jpeg', category: 'Equipment', title: 'Advanced Workshop Equipment', desc: 'Green Bosch NTI 101 nitrogen inflator machine.' },
    { src: '/workshop/page_6_img_1.jpeg', category: 'Equipment', title: 'Spare Parts Inventory', desc: 'Spare parts storage shelves and inventory stock.' },
    { src: '/workshop/red_toolbox_cropped.jpg', category: 'Equipment', title: 'Tool Station', desc: 'Red Wurth toolbox and professional tool chest.' },
 
    // CATEGORY E: Customer Vehicle Yard
    { src: '/workshop/page_5_img_1.jpeg', category: 'Vehicle Yard', title: 'Customer Vehicle Parking Area', desc: 'Parking yard image with multiple parked customer vehicles.' },
 
    // CATEGORY F: Customer Facilities
    { src: '/workshop/page_4_img_1.jpeg', category: 'Customer Facilities', title: 'Customer Reception Area', desc: 'Office and reception desk with chairs and consultation table.' }
  ];

  // Testimonials
  const testimonials = [
    { rating: 5, quote: 'Excellent service and transparent billing. The team diagnosed and fixed my Harrier engine issue swiftly.', author: 'Ravi Kumar' },
    { rating: 5, quote: 'Highly professional setup. Got my Honda City body shop denting and painting done to factory finish.', author: 'Sandeep Reddy' },
    { rating: 5, quote: 'Excellent customer service. Genuine spare parts, clear HSN codes, and competitive pricing.', author: 'Priya Sharma' }
  ];

  useEffect(() => {
    const heroInterval = setInterval(() => {
      setHeroIdx((prev) => (prev + 1) % heroSlides.length);
    }, 5000);

    const testimonialInterval = setInterval(() => {
      setTestimonialIdx((prev) => (prev + 1) % testimonials.length);
    }, 6000);

    return () => {
      clearInterval(heroInterval);
      clearInterval(testimonialInterval);
    };
  }, []);

  const filteredPhotos = activeCategory === 'All' 
    ? galleryPhotos 
    : galleryPhotos.filter(p => p.category === activeCategory);

  return (
    <div className="min-h-screen bg-slate-50 text-[#111827] font-sans relative overflow-x-hidden scroll-smooth">
      
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-lg border-b border-slate-200/60 select-none shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3.5 flex justify-between items-center w-full">
          <a 
            href="/" 
            aria-label="MVSS Automobiles Homepage"
            onClick={(e) => { e.preventDefault(); window.location.href = '/'; }} 
            className="flex items-center gap-2 sm:gap-3 select-none shrink-0 group"
          >
            <div className="shrink-0 transition-transform duration-350 group-hover:scale-105 p-0.5 flex items-center justify-center overflow-hidden">
              <img 
                src="/logo.png" 
                alt="MVSS Automobiles Logo" 
                className="h-10 sm:h-12 md:h-14 lg:h-16 w-auto max-w-[180px] object-contain block"
              />
            </div>
            <div className="text-left flex flex-col justify-center select-none">
              <h1 className="text-[14px] md:text-base lg:text-xl font-black tracking-tight uppercase text-[#0B1528] leading-none">
                MVSS AUTOMOBILES
              </h1>
              <p className="text-[10px] md:text-[9px] lg:text-[10px] text-[#C1121F] font-black uppercase tracking-widest leading-none mt-1 md:mt-0.5">
                PVT. LTD.
              </p>
            </div>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-x-8 text-xs font-bold text-slate-700 uppercase tracking-widest">
            <a href="#home" className="hover:text-[#C1121F] transition-colors relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-[#C1121F] hover:after:w-full after:transition-all">Home</a>
            <a href="#services" className="hover:text-[#C1121F] transition-colors relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-[#C1121F] hover:after:w-full after:transition-all">Services</a>
            <a href="#why-choose" className="hover:text-[#C1121F] transition-colors relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-[#C1121F] hover:after:w-full after:transition-all">Why Choose us</a>
            <a href="#gallery" className="hover:text-[#C1121F] transition-colors relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-[#C1121F] hover:after:w-full after:transition-all">Gallery</a>
            <a href="#contact" className="hover:text-[#C1121F] transition-colors relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-[#C1121F] hover:after:w-full after:transition-all">Contact</a>
            <a href="#about" className="hover:text-[#C1121F] transition-colors relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-[#C1121F] hover:after:w-full after:transition-all">About</a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/login"
              aria-label="Staff Login"
              onClick={(e) => {
                e.preventDefault();
                if (onStaffLoginClick) {
                  onStaffLoginClick();
                } else {
                  window.location.href = '/login';
                }
              }}
              className="flex items-center gap-1.5 p-2 md:px-3 md:py-1.5 lg:px-4 lg:py-2 bg-[#0B1528] hover:bg-[#C1121F] text-white rounded-lg md:rounded-xl text-[11px] md:text-xs font-black transition-all shrink-0 shadow-md shadow-slate-900/10 active:scale-95 select-none"
            >
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">Staff Login</span>
            </Link>
            
            {/* Mobile Menu Toggle Button */}
            <button
              ref={mobileMenuButtonRef}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="flex lg:hidden p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg md:rounded-xl transition-all"
              aria-label="Toggle Mobile Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Responsive Mobile/Tablet Slide Menu (Drawer) */}
      </header>

      {/* Backdrop overlay */}
      <div 
        className={`fixed inset-0 bg-black/55 backdrop-blur-sm z-[9999] transition-opacity duration-300 lg:hidden ${
          isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsMobileMenuOpen(false)}
      />
      
      {/* Slide Menu Panel */}
      <div 
        ref={mobileMenuRef}
        className={`fixed top-0 right-0 h-screen w-[80vw] sm:w-[320px] bg-white z-[9999] shadow-2xl transition-transform duration-300 ease-in-out transform lg:hidden flex flex-col ${
          isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-5 py-4 flex justify-between items-center border-b border-slate-150 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-0.5 bg-[#030712] rounded-full border border-[#C1121F]/30 overflow-hidden shrink-0">
              <img 
                src="/logo.png" 
                alt="MVSS Logo" 
                className="h-8 w-8 object-cover rounded-full"
              />
            </div>
            <div className="text-left flex flex-col justify-center">
              <span className="text-xs font-black tracking-tight uppercase text-[#0B1528] leading-none">
                MVSS AUTOMOBILES
              </span>
              <span className="text-[7px] text-[#C1121F] font-black uppercase tracking-widest leading-none mt-0.5">
                PVT. LTD.
              </span>
            </div>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-[#DC2626] hover:bg-red-50 rounded-full transition-all focus:outline-none"
            aria-label="Close Mobile Menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto flex flex-col">
          {[
            { label: 'Home', href: '#home' },
            { label: 'Services', href: '#services' },
            { label: 'Why Choose us', href: '#why-choose' },
            { label: 'Gallery', href: '#gallery' },
            { label: 'Contact', href: '#contact' },
            { label: 'About', href: '#about' }
          ].map((link, idx) => (
            <a 
              key={idx}
              href={link.href} 
              onClick={() => setIsMobileMenuOpen(false)} 
              className="h-14 px-5 flex items-center text-sm font-semibold text-[#111827] hover:bg-[#F3F4F6] hover:text-[#DC2626] transition-all border-b border-slate-100"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Staff Login inside Drawer */}
        <div className="p-6 border-t border-slate-100 bg-white shrink-0">
          <Link
            to="/login"
            onClick={(e) => {
              e.preventDefault();
              setIsMobileMenuOpen(false);
              if (onStaffLoginClick) {
                onStaffLoginClick();
              } else {
                window.location.href = '/login';
              }
            }}
            className="flex items-center justify-center gap-1.5 w-full py-3 bg-[#0B1528] hover:bg-[#C1121F] text-white rounded-xl text-xs font-black transition-all shadow-md active:scale-95 select-none"
          >
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>Staff Login</span>
          </Link>
        </div>
      </div>

      {/* Hero Section */}
      <section id="home" className="relative w-full h-[auto] min-h-[500px] sm:min-h-[550px] md:min-h-[600px] lg:h-[700px] xl:h-[750px] overflow-hidden bg-slate-950 flex items-center pt-28 pb-16 sm:pb-20 lg:py-0">
        
        {/* Subtle Dark Overlay Gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-slate-950/40 z-10" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent z-10" />

        {/* Slideshow Background */}
        <div className="absolute inset-0 z-0">
          {heroSlides.map((slide, idx) => (
            <div 
              key={idx}
              className={`absolute inset-0 w-full h-full transition-all duration-1000 transform scale-100 ${idx === heroIdx ? 'opacity-40 scale-105' : 'opacity-0'}`}
            >
              <img 
                src={slide.src}
                alt={slide.label}
                loading={idx === 0 ? 'eager' : 'lazy'}
                decoding="async"
                fetchPriority={idx === 0 ? 'high' : 'low'}
                className="w-full h-full object-cover object-center"
              />
            </div>
          ))}
        </div>

        {/* Content Box */}
        <div className="relative z-20 max-w-7xl mx-auto px-6 w-full text-white space-y-6">
          <div className="space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#C1121F]/15 border border-[#C1121F]/30 rounded-full animate-pulse">
              <Sparkles className="w-3.5 h-3.5 text-[#C1121F]" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Multi-Brand Workshop</span>
            </div>
            <h2 className="text-[clamp(1.85rem,5.5vw,4.5rem)] font-black text-white uppercase tracking-tight leading-tight">
              Quality Service <br />
              <span className="text-[#C1121F]">With Passion</span>
            </h2>
            <p className="text-[clamp(0.8rem,1.8vw,1.1rem)] text-slate-300 font-medium leading-relaxed max-w-xl">
              Complete Multi-Brand Car Care, Advanced Mechanical Service, Panel Paint Booth Refinishing, Cashless Insurance Claims, and Transparent Billing.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap gap-3.5 pt-4">
            <a
              href="#booking-section"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 sm:py-4 bg-[#C1121F] hover:bg-red-700 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-[#C1121F]/20 hover:scale-105 active:scale-95 w-full sm:w-auto"
            >
              <Wrench className="w-4 h-4" />
              Book Appointment
            </a>
            <a
              href={`tel:${OWNER_SUPPORT_NUMBER.replace(/\s+/g, '')}`}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 sm:py-4 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black transition-all border border-white/20 hover:scale-105 active:scale-95 w-full sm:w-auto"
            >
              <Phone className="w-4 h-4 text-[#C1121F]" />
              Call Workshop
            </a>
            <a
              href={`https://wa.me/${OWNER_SUPPORT_NUMBER.replace(/[\s\+]+/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 sm:py-4 bg-[#25D366] hover:bg-[#20BA56] text-white rounded-xl text-xs font-black transition-all shadow-md hover:scale-105 active:scale-95 w-full sm:w-auto"
            >
              WhatsApp Support
            </a>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="relative z-30 my-12 sm:my-16 md:my-20 lg:my-24 max-w-7xl mx-auto px-6">
        <div className="bg-white border border-slate-200/80 rounded-[24px] shadow-sm lg:shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          <div className="flex items-center gap-4 p-4 bg-slate-50/50 lg:bg-transparent rounded-2xl border border-slate-100/70 lg:border-0 lg:border-r lg:border-slate-100 lg:p-0 last:border-0 last:border-r-0">
            <div className="p-3 lg:p-2.5 bg-red-50 text-[#C1121F] rounded-xl shrink-0">
              <Car className="w-6 h-6 lg:w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm lg:text-xs font-black text-slate-900 uppercase">5000+ Serviced</h4>
              <p className="text-[10px] lg:text-[9px] text-slate-400 font-bold uppercase tracking-wider">Vehicles Handled</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4 bg-slate-50/50 lg:bg-transparent rounded-2xl border border-slate-100/70 lg:border-0 lg:border-r lg:border-slate-100 lg:p-0 last:border-0 last:border-r-0">
            <div className="p-3 lg:p-2.5 bg-red-50 text-[#C1121F] rounded-xl shrink-0">
              <Users className="w-6 h-6 lg:w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm lg:text-xs font-black text-slate-900 uppercase">Certified Staff</h4>
              <p className="text-[10px] lg:text-[9px] text-slate-400 font-bold uppercase tracking-wider">Expert Technicians</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4 bg-slate-50/50 lg:bg-transparent rounded-2xl border border-slate-100/70 lg:border-0 lg:border-r lg:border-slate-100 lg:p-0 last:border-0 last:border-r-0">
            <div className="p-3 lg:p-2.5 bg-red-50 text-[#C1121F] rounded-xl shrink-0">
              <Award className="w-6 h-6 lg:w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm lg:text-xs font-black text-slate-900 uppercase">Genuine Spares</h4>
              <p className="text-[10px] lg:text-[9px] text-slate-400 font-bold uppercase tracking-wider">OEM Sourced Parts</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4 bg-slate-50/50 lg:bg-transparent rounded-2xl border border-slate-100/70 lg:border-0 lg:p-0 last:border-0">
            <div className="p-3 lg:p-2.5 bg-red-50 text-[#C1121F] rounded-xl shrink-0">
              <ShieldCheck className="w-6 h-6 lg:w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm lg:text-xs font-black text-slate-900 uppercase">Claims Support</h4>
              <p className="text-[10px] lg:text-[9px] text-slate-400 font-bold uppercase tracking-wider">Cashless Assistance</p>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="pb-12 sm:pb-16 md:pb-20 lg:pb-24 max-w-7xl mx-auto px-6 space-y-12">
        <div className="text-center space-y-2">
          <span className="text-[10px] font-black text-[#C1121F] uppercase tracking-widest">Our Capabilities</span>
          <h3 className="text-3xl font-extrabold text-slate-900 uppercase tracking-tight">Premium Service Offerings</h3>
          <p className="text-xs text-slate-400 font-semibold max-w-md mx-auto">Modern service streams designed to keep your vehicle in prime manufacturer condition.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { 
              title: 'Multi Brand Service', 
              desc: 'Chassis general repairs and engine service overhauls for premium brands.', 
              icon: Car, 
              img: '/workshop/page_8_img_1.jpeg',
              features: ['Complete engine diagnostics', 'General servicing', 'Brake inspection and repair', 'Suspension checks', 'Battery testing', 'AC servicing', 'Oil and filter replacement', 'Genuine spare parts support'],
              benefits: 'Restores luxury drive comfort, prevents major mechanical degradation, and maintains high fuel economy with digital service ledger logging.'
            },
            { 
              title: 'Body Shop & Painting', 
              desc: 'Panel paint booth refinish, dent adjustments, corporate detailing finish and scratch removals.', 
              icon: Wrench, 
              img: '/workshop/paint_booth.png',
              features: ['Dent removal', 'Accident repair', 'Panel replacement', 'Full body painting', 'Paint booth refinishing', 'Scratch removal', 'Color matching', 'Premium finish coating'],
              benefits: 'Showroom-quality paint matching, factory-standard crash structure restoration, and durable corrosion protection.'
            },
            { 
              title: 'Insurance Claims', 
              desc: 'Surveyor damage canvas tracking, cash-free claims handling, and insurance catalog estimates.', 
              icon: ShieldCheck, 
              img: '/workshop/page_4_img_1.jpeg',
              features: ['Cashless insurance claims', 'Survey coordination', 'Documentation support', 'Claim tracking', 'Insurance approval process', 'Repair estimation support'],
              benefits: 'Zero out-of-pocket expenses for covered damages, transparent surveyor evaluations, and swift processing timeline.'
            },
            { 
              title: 'Genuine Spare Parts', 
              desc: 'OEM filters, replacement spark plugs, certified high-grade components directly from catalog room.', 
              icon: Award, 
              img: '/workshop/page_6_img_1.jpeg',
              features: ['OEM spare parts', 'Genuine accessories', 'Filters and lubricants', 'Batteries and electrical parts', 'Warranty-supported replacements'],
              benefits: '100% manufacturer warranty safety compliance, certified electrical components, and long-term durability.'
            },
            { 
              title: 'Wheel Alignment', 
              desc: 'Computerized alignment calibration, wheel weight balancing, and tyre pressure correction.', 
              icon: Settings, 
              img: '/workshop/page_2_img_1.jpeg',
              features: ['Computerized wheel alignment', 'Wheel balancing', 'Steering correction', 'Tyre inspection', 'Suspension optimization'],
              benefits: 'Prevents uneven tyre tread wear, improves highway steering stability, and enhances vehicle stability control.'
            },
            { 
              title: 'Engine Repair', 
              desc: 'Full engine block repairs, mechanical component overhauls, and transmission tuning.', 
              icon: Settings, 
              img: '/workshop/page_10_img_1.jpeg',
              features: ['Engine overhaul', 'Engine diagnostics', 'Fuel system repair', 'Cooling system repair', 'Transmission inspection', 'Performance tuning'],
              benefits: 'Restores optimal compression ratio, cures engine warning lights, and guarantees smooth power delivery.'
            },
            { 
              title: 'Periodic Maintenance', 
              desc: 'Periodic lubrication checkout, Mobil oil replacements, engine checkups and standard fluid topups.', 
              icon: CheckCircle, 
              img: '/workshop/page_3_img_1.jpeg',
              features: ['Scheduled maintenance', 'Oil replacement', 'Fluid top-up', 'Brake inspection', 'Battery health check', 'Complete vehicle inspection'],
              benefits: 'Protects manufacturer warranty status, guarantees safety threshold performance, and maintains higher resale value.'
            },
            { 
              title: 'Vehicle Pickup & Delivery', 
              desc: 'Secure door-to-door vehicle transport checkout, pickup check-in and delivery mapping.', 
              icon: Navigation, 
              img: '/workshop/page_5_img_1.jpeg',
              features: ['Doorstep vehicle pickup', 'Workshop transportation', 'Service updates', 'Vehicle delivery after completion', 'Safe vehicle handling'],
              benefits: 'Saves valuable personal time, includes real-time advisor service updates, and ensures insured transport handling.'
            }
          ].map((service, idx) => {
            const Icon = service.icon;
            return (
              <div 
                key={idx} 
                className="bg-white border border-slate-200/70 rounded-2xl overflow-hidden transition-all duration-300 hover:border-[#C1121F]/20 hover:-translate-y-1.5 hover:shadow-lg flex flex-col justify-between group shadow-sm w-full h-full min-h-[330px]"
              >
                <div className="relative h-[150px] w-full overflow-hidden bg-slate-100 shrink-0">
                  <img 
                    src={service.img} 
                    alt={service.title} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-3 left-3 p-2 bg-white/95 backdrop-blur-sm text-[#C1121F] rounded-xl shadow-md border border-slate-100">
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <h4 className="text-xs font-black text-slate-900 group-hover:text-[#C1121F] transition-colors uppercase tracking-wide">{service.title}</h4>
                    <p className="text-[10px] text-slate-400 font-semibold leading-relaxed line-clamp-3">{service.desc}</p>
                  </div>
                  <button 
                    onClick={() => setSelectedService(service)}
                    className="text-[9px] font-black text-[#C1121F] uppercase tracking-widest flex items-center gap-1 mt-2 hover:underline focus:outline-none w-max"
                  >
                    Learn More <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Achievements Section */}
      <section className="py-24 bg-[#0B1528] text-white relative">
        <div className="absolute inset-0 bg-slate-950/20 z-0" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 space-y-12">
          <div className="text-center space-y-2">
            <span className="text-[10px] font-black text-[#C1121F] uppercase tracking-widest">Our Accomplishments</span>
            <h3 className="text-3xl font-extrabold text-white uppercase tracking-tight">Workshop Achievements</h3>
            <p className="text-xs text-slate-450 font-semibold max-w-md mx-auto">Milestones achieved over years of dedicated multi-brand automobile servicing.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {[
              { val: '5,000+', label: 'Vehicles Serviced', desc: 'Premium multi-brand vehicles serviced.' },
              { val: '10+', label: 'Years Experience', desc: 'Proven technical track record.' },
              { val: '100%', label: 'Genuine Spares', desc: 'OEM components catalog sourcing.' },
              { val: '4.9★', label: 'Customer Rating', desc: 'Top-rated workshop reviews.' }
            ].map((stat, idx) => (
              <div key={idx} className="bg-slate-900/60 backdrop-blur-md border border-slate-800 p-6 rounded-[24px] space-y-2 text-center hover:border-slate-750 transition-colors">
                <div className="text-3xl lg:text-4xl font-black text-[#C1121F] font-mono">{stat.val}</div>
                <h4 className="text-sm font-black text-white uppercase">{stat.label}</h4>
                <p className="text-[10px] text-slate-450 font-semibold">{stat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery Section */}
      <section id="gallery" className="py-24 max-w-7xl mx-auto px-6 space-y-12">
        <div className="text-center space-y-2">
          <span className="text-[10px] font-black text-[#C1121F] uppercase tracking-widest">Our Facility Tour</span>
          <h3 className="text-3xl font-extrabold text-slate-900 uppercase tracking-tight">Workshop Gallery</h3>
          <p className="text-xs text-slate-400 font-semibold max-w-md mx-auto">
            Visual tour of our modern service checkouts, premium brand service bays, and genuine spares stock.
          </p>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap justify-center gap-2 select-none">
          {['All', 'Infrastructure', 'Operations', 'Body Shop', 'Equipment', 'Vehicle Yard', 'Customer Facilities'].map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 border ${
                activeCategory === cat 
                  ? 'bg-[#C1121F] border-[#C1121F] text-white shadow-md shadow-red-500/10' 
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-350'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Photo Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPhotos.map((photo, idx) => (
            <div 
              key={idx}
              className="h-[380px] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:border-[#C1121F]/20 transition-all duration-350 flex flex-col hover:-translate-y-1.5 hover:shadow-md group"
            >
              <div className="h-[260px] w-full overflow-hidden bg-slate-100 relative shrink-0">
                <img 
                  src={photo.src} 
                  alt={photo.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
                  loading="lazy"
                />
              </div>
              <div className="p-5 bg-white border-t border-slate-100 flex flex-col justify-start space-y-1 flex-1">
                <h4 className="text-xs sm:text-sm font-black text-slate-900 h-[35px] flex items-center leading-tight uppercase tracking-wide">
                  {photo.title}
                </h4>
                <p className="text-[10px] sm:text-[11px] text-slate-400 font-semibold leading-relaxed h-[45px] overflow-hidden">
                  {photo.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why Choose Us */}
      <section id="why-choose" className="py-24 bg-white border-t border-b border-slate-200/50 relative">
        <div id="about" className="absolute -top-24" />
        <div className="max-w-7xl mx-auto px-6 space-y-12">
          <div className="text-center space-y-2">
            <span className="text-[10px] font-black text-[#C1121F] uppercase tracking-widest">Enterprise Car Care</span>
            <h3 className="text-3xl font-extrabold text-slate-900 uppercase tracking-tight">Why Choose MVSS</h3>
            <p className="text-xs text-slate-400 font-semibold max-w-md mx-auto">We provide premium multi-brand services with full digital tracking transparency.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: 'Certified Technicians', desc: 'Workshop floor staffed with certified mechanical and body workshop specialists.' },
              { title: 'Multi Brand Expertise', desc: 'Certified engine servicing, chassis PMS and mechanical repair for premium brands.' },
              { title: 'Bosch Equipment', desc: 'Bosch automobile scanners and computerized alignment calibration checkups.' },
              { title: 'Digital Job Cards', desc: 'Secure digital tracking boards showing check-in status, progress, estimation and release.' },
              { title: 'GST Billing', desc: 'Auto-generated invoice details with clear spares selling price and labor fees.' },
              { title: 'Transparent Workflow', desc: 'From check-in to checkout, estimates, service checklists, and signatures are managed digitally.' },
              { title: 'Quality Spare Parts', desc: 'OEM filters, high-grade lubrication motor oil, spark plugs, and brake pads.' },
              { title: 'Customer Satisfaction', desc: 'Post-repair quality inspect checks before vehicle delivery and gate pass release.' }
            ].map((item, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl flex gap-3.5 items-start h-full min-h-[160px] hover:border-[#C1121F]/20 hover:bg-white hover:shadow-md transition-all duration-300">
                <CheckCircle className="w-5 h-5 text-[#C1121F] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide">{item.title}</h4>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 font-semibold leading-relaxed line-clamp-3">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Customer Testimonials Carousel */}
      <section id="testimonials" className="py-24 bg-slate-50 relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-6 space-y-12 relative z-10">
          <div className="text-center space-y-2">
            <span className="text-[10px] font-black text-[#C1121F] uppercase tracking-widest">Client Feedback</span>
            <h3 className="text-3xl font-extrabold text-slate-900 uppercase tracking-tight">Customer Reviews</h3>
            <p className="text-xs text-slate-400 font-semibold">Read what premium multi-brand automobile owners say about our workshop services.</p>
          </div>

          <div className="relative min-h-[220px] bg-white border border-slate-200 rounded-3xl shadow-md p-8 md:p-12 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex gap-1 text-[#C1121F]">
                {[...Array(testimonials[testimonialIdx].rating)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-current animate-scale-up" />
                ))}
              </div>
              <p className="text-sm md:text-base text-slate-650 font-bold italic leading-relaxed">
                "{testimonials[testimonialIdx].quote}"
              </p>
            </div>
            
            <div className="flex items-center justify-between border-t border-slate-100 pt-6 mt-6">
              <div>
                <span className="block text-xs font-black text-slate-900 uppercase tracking-wide">— {testimonials[testimonialIdx].author}</span>
                <span className="block text-[8px] text-[#C1121F] font-black uppercase tracking-widest mt-0.5">Verified Customer</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setTestimonialIdx((prev) => (prev - 1 + testimonials.length) % testimonials.length)}
                  className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl transition-all active:scale-95"
                  aria-label="Previous review"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setTestimonialIdx((prev) => (prev + 1) % testimonials.length)}
                  className="p-2 bg-[#0B1528] hover:bg-[#C1121F] text-white rounded-xl transition-all active:scale-95 shadow-sm"
                  aria-label="Next review"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Redesigned Contact & Branch Outlets & Appointment Box */}
      <section id="contact" className="py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          
          {/* Outlets (7 cols) */}
          <div className="lg:col-span-7 space-y-8">
            <div className="space-y-2">
              <span className="text-[10px] font-black text-[#C1121F] uppercase tracking-widest block text-left">Our Outlets</span>
              <h3 className="text-3xl font-extrabold text-slate-900 uppercase tracking-tight">Branch Locations</h3>
              <p className="text-xs text-slate-400 font-semibold">Visit our fully-equipped multi-brand service centers near you in Hyderabad.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {BRANCHES.map((branch) => {
                const directionsUrl = getBranchDirectionsUrl(branch);
                return (
                  <div key={branch.id} className="bg-slate-55/40 border border-slate-200 p-6 rounded-2xl space-y-4 hover:border-[#C1121F]/20 hover:shadow-md transition-all duration-300">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-[#C1121F]/5 text-[#C1121F] rounded-xl shrink-0 mt-0.5">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide">{branch.name}</h4>
                        <p className="text-[11px] text-slate-400 font-semibold leading-relaxed mt-1.5">
                          {branch.address}
                        </p>
                      </div>
                    </div>
                    <div className="pt-2">
                      <a 
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B1528] hover:bg-[#C1121F] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        Get Directions
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Contacts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-50 text-[#C1121F] rounded-xl shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <span className="block font-black text-slate-950 text-[8px] uppercase tracking-widest">Phone Support</span>
                  <a href={`tel:${OWNER_SUPPORT_NUMBER.replace(/\s+/g, '')}`} className="hover:underline text-[#C1121F] font-mono text-xs font-bold">{OWNER_SUPPORT_NUMBER}</a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-50 text-[#C1121F] rounded-xl shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <span className="block font-black text-slate-950 text-[8px] uppercase tracking-widest">Email Support</span>
                  <a href="mailto:accounts@auto4m.in" className="hover:underline text-[#C1121F] text-xs font-bold">accounts@auto4m.in</a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-50 text-[#C1121F] rounded-xl shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <span className="block font-black text-slate-950 text-[8px] uppercase tracking-widest">Business Hours</span>
                  <span className="text-slate-400 text-xs font-semibold">9:00 AM - 7:00 PM</span>
                </div>
              </div>
            </div>
          </div>

          {/* Appointment Form Box (5 cols) */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-[32px] p-8 shadow-lg shadow-slate-200/50 space-y-6" id="booking-section">
            <div className="space-y-1">
              <span className="text-[8px] font-black text-[#C1121F] uppercase tracking-widest">Appointment Board</span>
              <h4 className="text-base font-black text-slate-900 uppercase tracking-wide">Schedule Your Service</h4>
            </div>
            
            <form onSubmit={handleBookingSubmit} ref={dropdownRef} noValidate className="space-y-4 text-xs font-semibold relative">
              
              {/* Name Field */}
              <div className="space-y-1 relative">
                <label htmlFor="booking-customer-name" className="block text-[8px] font-black text-slate-600 uppercase tracking-widest">Customer Name</label>
                <div className="relative flex items-center">
                  <User className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input 
                    id="booking-customer-name"
                    type="text" 
                    value={customerName}
                    disabled={isSubmitting}
                    onChange={handleNameChange}
                    onBlur={handleNameBlur}
                    placeholder="Enter full name" 
                    className={`w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-xl text-xs font-medium focus:outline-none focus:bg-white transition-all ${errors.customerName ? 'border-red-500 focus:border-red-500' : 'border-slate-200 focus:border-[#C1121F]'}`} 
                  />
                </div>
                {errors.customerName && (
                  <span className="block mt-0.5 text-[9px] text-red-500 font-semibold">{errors.customerName}</span>
                )}

                {/* Name suggestions */}
                {activeSearchField === 'name' && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg max-h-48 overflow-y-auto z-50 divide-y divide-slate-100 dark:divide-slate-800 animate-fade-in">
                    {suggestions.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectSuggestion(s)}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex flex-col gap-0.5 transition-colors"
                      >
                        <span className="font-bold text-slate-900 dark:text-white text-xs">{s.customerName}</span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {s.mobile} {s.vehicleNumber ? `• ${s.vehicleNumber} (${s.vehicleModel || 'No Model'})` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Phone Field */}
              <div className="space-y-1 relative">
                <label htmlFor="booking-contact-phone" className="block text-[8px] font-black text-slate-600 uppercase tracking-widest">Contact Phone</label>
                <InternationalPhoneInput
                  value={contactPhone}
                  onChange={handlePhoneChange}
                  onBlur={handlePhoneBlur}
                  disabled={isSubmitting}
                  error={!!errors.contactPhone}
                  name="contactPhone"
                  id="booking-contact-phone"
                  required={true}
                  country="IN"
                  ariaLabel="Contact phone number"
                  ariaDescribedby={errors.contactPhone ? 'contactPhone-error' : undefined}
                />
                {errors.contactPhone && (
                  <span id="contactPhone-error" className="block mt-0.5 text-[9px] text-red-500 font-semibold">{errors.contactPhone}</span>
                )}

                {/* Phone suggestions */}
                {activeSearchField === 'phone' && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg max-h-48 overflow-y-auto z-50 divide-y divide-slate-100 dark:divide-slate-800 animate-fade-in">
                    {suggestions.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectSuggestion(s)}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex flex-col gap-0.5 transition-colors"
                      >
                        <span className="font-bold text-slate-900 dark:text-white text-xs">{s.mobile}</span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {s.customerName} {s.vehicleNumber ? `• ${s.vehicleNumber} (${s.vehicleModel || 'No Model'})` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Email Field */}
              <div className="space-y-1 relative">
                <label htmlFor="booking-customer-email" className="block text-[8px] font-black text-slate-600 uppercase tracking-widest">Email Address (Optional)</label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input 
                    id="booking-customer-email"
                    type="email" 
                    value={customerEmail}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setCustomerEmail(e.target.value);
                      if (formTouched || errors.customerEmail) {
                        const err = validateField('customerEmail', e.target.value);
                        setErrors(prev => ({ ...prev, customerEmail: err }));
                      }
                    }}
                    onBlur={() => {
                      const err = validateField('customerEmail', customerEmail);
                      setErrors(prev => ({ ...prev, customerEmail: err }));
                    }}
                    placeholder="Enter email address (to receive confirmation)" 
                    className={`w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-xl text-xs font-medium focus:outline-none focus:bg-white transition-all ${errors.customerEmail ? 'border-red-500 focus:border-red-500' : 'border-slate-200 focus:border-[#C1121F]'}`} 
                  />
                </div>
                {errors.customerEmail && (
                  <span className="block mt-0.5 text-[9px] text-red-500 font-semibold">{errors.customerEmail}</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 relative">
                {/* Plate Field */}
                <div className="space-y-1 relative">
                  <label htmlFor="booking-vehicle-plate" className="block text-[8px] font-black text-slate-600 uppercase tracking-widest">Vehicle Reg No</label>
                  <div className="relative flex items-center">
                    <Hash className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input 
                      id="booking-vehicle-plate"
                      type="text" 
                      value={vehiclePlate}
                      disabled={isSubmitting}
                      onChange={handlePlateChange}
                      onBlur={handlePlateBlur}
                      placeholder="TS-09-EA-1234" 
                      className={`w-full pl-9 pr-3 py-3 bg-slate-50 border rounded-xl text-xs font-medium focus:outline-none focus:bg-white uppercase transition-all ${errors.vehiclePlate ? 'border-red-500 focus:border-red-500' : 'border-slate-200 focus:border-[#C1121F]'}`} 
                    />
                  </div>
                  {errors.vehiclePlate && (
                    <span className="block mt-0.5 text-[9px] text-red-500 font-semibold">{errors.vehiclePlate}</span>
                  )}

                  {/* Plate suggestions */}
                  {activeSearchField === 'plate' && suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg max-h-48 overflow-y-auto z-50 divide-y divide-slate-100 dark:divide-slate-800 animate-fade-in">
                      {suggestions.map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectSuggestion(s)}
                          className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex flex-col gap-0.5 transition-colors"
                        >
                          <span className="font-bold text-slate-900 dark:text-white text-xs">{s.vehicleNumber}</span>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {s.customerName} • {s.mobile} {s.vehicleModel ? `• ${s.vehicleModel}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Date Picker */}
                <div className="space-y-1">
                  <label htmlFor="booking-preferred-date" className="block text-[8px] font-black text-slate-600 uppercase tracking-widest">Service Date</label>
                  <div className="relative flex items-center">
                    <Calendar className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input 
                      id="booking-preferred-date"
                      type="date" 
                      value={preferredDate}
                      min={getTodayString()}
                      disabled={isSubmitting}
                      onChange={handleDateChange}
                      className={`w-full pl-9 pr-3 py-3 bg-slate-50 border rounded-xl text-xs font-medium focus:outline-none focus:bg-white transition-all ${errors.preferredDate ? 'border-red-500 focus:border-red-500' : 'border-slate-200 focus:border-[#C1121F]'}`} 
                    />
                  </div>
                  {errors.preferredDate && (
                    <span className="block mt-0.5 text-[9px] text-red-500 font-semibold">{errors.preferredDate}</span>
                  )}
                </div>
              </div>

              {/* Vehicle Model Field */}
              <div className="space-y-1">
                <label htmlFor="booking-vehicle-model" className="block text-[8px] font-black text-slate-600 uppercase tracking-widest">Vehicle Model</label>
                <div className="relative flex items-center">
                  <Car className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input 
                    id="booking-vehicle-model"
                    type="text" 
                    value={vehicleModel}
                    disabled={isSubmitting}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    placeholder="e.g. Maruti Suzuki Swift" 
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:bg-white focus:border-[#C1121F] transition-all" 
                  />
                </div>
              </div>

              {/* Stream Select */}
              <div className="space-y-1">
                <label htmlFor="booking-service-category" className="block text-[8px] font-black text-slate-600 uppercase tracking-widest">Service Category</label>
                <div className="relative flex items-center">
                  <Wrench className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                  <select 
                    id="booking-service-category"
                    value={preferredStream}
                    disabled={isSubmitting}
                    onChange={handleStreamChange}
                    className={`w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-xl text-xs font-bold focus:outline-none focus:bg-white transition-all ${errors.preferredStream ? 'border-red-500 focus:border-red-500' : 'border-slate-200 focus:border-[#C1121F]'}`}
                  >
                    <option value="">Select Service Category</option>
                    <option value="General Servicing (PMS)">General Servicing (PMS)</option>
                    <option value="Running Repair (RR)">Running Repair (RR)</option>
                    <option value="Body Shop (Dent/Paint)">Body Shop (Dent/Paint)</option>
                    <option value="Insurance Claims">Insurance Claims</option>
                  </select>
                </div>
                {errors.preferredStream && (
                  <span className="block mt-0.5 text-[9px] text-red-500 font-semibold">{errors.preferredStream}</span>
                )}
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full py-4 px-4 bg-[#C1121F] hover:bg-red-700 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-red-500/10 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Submitting...
                  </>
                ) : (
                  'Book Appointment'
                )}
              </button>

              {/* Redesigned Success message card */}
              {showSuccessMsg && (
                <div className="p-5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs space-y-3 animate-scale-up select-text">
                  <div className="flex items-center gap-2 font-bold">
                    <span className="p-1 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-[10px] font-black">✓</span>
                    <span>Service Request Submitted</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-emerald-700">
                    Your service request for <strong className="font-extrabold">{submittedDate}</strong> has been submitted successfully. Our customer team will contact you shortly to confirm your slot.
                  </p>
                  <div className="border-t border-emerald-150 pt-2.5 space-y-1">
                    <span className="block text-[8px] font-black text-emerald-500 uppercase tracking-widest leading-none">Booking Reference Code</span>
                    <span className="inline-block px-3 py-1.5 bg-white border border-emerald-200 border-dashed text-slate-800 font-mono font-bold text-xs uppercase rounded-lg select-all">
                      {bookingRef}
                    </span>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="p-5 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-xs space-y-2 animate-scale-up">
                  <div className="flex items-center gap-2 font-bold text-red-750">
                    <span>❌</span>
                    <span>Submission Failed</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-red-650">
                    {errorMsg}
                  </p>
                </div>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-12 bg-[#0B1528] text-slate-400 relative">
        <div className="absolute inset-0 bg-slate-950/20 z-0" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 space-y-10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 text-xs select-none">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-[#030712] rounded-full border-2 border-[#C1121F]/40 shrink-0 shadow-lg overflow-hidden">
                <img 
                  src="/logo.png" 
                  alt="MVSS Logo" 
                  className="h-24 w-24 object-cover rounded-full"
                />
              </div>
              <span className="font-extrabold text-white text-xs uppercase tracking-widest">MVSS AUTOMOBILES</span>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-slate-400 font-bold uppercase tracking-widest text-[9px]">
              <a href="#privacy" onClick={(e) => { e.preventDefault(); alert('Privacy Policy: Customer data is collected solely for workshop check-in, tracking, and GST invoicing purposes, stored securely in MongoDB Atlas.'); }} className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#terms" onClick={(e) => { e.preventDefault(); alert('Terms & Conditions: Service repair completion, vehicle tracking updates, and invoicing follow direct workshop guidelines under authorized advisor supervision.'); }} className="hover:text-white transition-colors">Terms & Conditions</a>
              <a href="#support" onClick={(e) => { e.preventDefault(); alert('Support Portal: For technical assistance or database connection queries, please reach the IT Service Desk.'); }} className="hover:text-white transition-colors">Support Portal</a>
            </div>
          </div>
          <div className="border-t border-slate-800/80 pt-6 flex flex-col md:flex-row justify-between items-center gap-4 text-[9px] font-bold uppercase tracking-widest text-slate-500">
            <span>© 2026 MVSS AUTOMOBILES. ALL RIGHTS RESERVED.</span>
            <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> SECURE AUDIT LOGGING ACTIVE</span>
          </div>
        </div>
      </footer>
 
      {/* Service Details Modal */}
      {selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm select-none p-4 md:p-10 animate-fade-in">
          <div className="absolute inset-0 z-0" onClick={() => setSelectedService(null)} />
          <div className="relative z-10 w-full max-w-[650px] bg-white rounded-[24px] shadow-2xl overflow-hidden flex flex-col border border-slate-200/50 animate-scale-up max-h-[90vh]">
            {/* Close Button */}
            <button 
              onClick={() => setSelectedService(null)}
              className="absolute top-4 right-4 p-2 bg-slate-100/90 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-full transition-all z-50 flex items-center justify-center shadow-sm"
              title="Close Service Details"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Image Header */}
            <div className="relative h-[200px] w-full bg-slate-100 shrink-0">
              <img 
                src={selectedService.img} 
                alt={selectedService.title} 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent" />
              <div className="absolute bottom-5 left-6 flex items-center gap-3 text-white">
                <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
                  {React.createElement(selectedService.icon, { className: "w-5 h-5 text-white" })}
                </div>
                <div>
                  <span className="text-[10px] font-black text-[#C1121F] uppercase tracking-widest bg-white px-2 py-0.5 rounded-md">Workshop Capability</span>
                  <h4 className="text-xl font-black uppercase tracking-tight mt-1">{selectedService.title}</h4>
                </div>
              </div>
            </div>

            {/* Modal Body Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
              
              {/* Description */}
              <div className="space-y-2">
                <span className="block text-[8px] font-black uppercase text-slate-400 tracking-wider">Service Overview</span>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  {selectedService.desc}
                </p>
              </div>

              {/* Features List */}
              <div className="space-y-3">
                <span className="block text-[8px] font-black uppercase text-slate-400 tracking-wider">Key Inclusions & Features</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {selectedService.features.map((feature, fidx) => (
                    <div key={fidx} className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Benefits */}
              <div className="bg-[#C1121F]/5 border border-[#C1121F]/10 p-4 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-[8px] font-black uppercase text-[#C1121F] tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-[#C1121F]" />
                  <span>Premium Value & Benefits</span>
                </div>
                <p className="text-[10px] text-slate-700 font-semibold leading-relaxed">
                  {selectedService.benefits}
                </p>
              </div>

            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setSelectedService(null)}
                className="px-4 py-2 border border-slate-200 hover:border-slate-350 bg-white text-slate-600 hover:text-slate-800 rounded-xl text-xs font-bold transition-all"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedService(null);
                  const element = document.getElementById('booking-section');
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="px-5 py-2.5 bg-[#0B1528] hover:bg-[#C1121F] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-slate-900/10 active:scale-95 flex items-center gap-1.5"
              >
                Book Appointment
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>
        </div>
      )}

      {/* WhatsApp Floating Button */}
      <a
        href={`https://wa.me/${OWNER_SUPPORT_NUMBER.replace(/[\s\+]+/g, '')}?text=Hi%20MVSS%20Automobiles,%20I'd%20like%20to%20inquire%20about%20a%20service%20for%20my%20vehicle.`}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 active:scale-95 group"
        aria-label="Chat on WhatsApp"
      >
        <FaWhatsapp className="w-6 h-6 sm:w-7 sm:h-7" />
      </a>

    </div>
  );
}
