import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, X, RotateCcw, Check, FlipHorizontal, AlertTriangle, Image as ImageIcon } from 'lucide-react';

export default function LiveCameraModal({ isOpen, onClose, onPhotoCaptured, photoType = 'Vehicle' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fallbackInputRef = useRef(null);

  const [isStarting, setIsStarting] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); // Prefer rear camera
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // Stop all active media stream tracks
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (_) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  // Check available video devices
  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      }).catch(() => {});
    }
  }, []);

  // Start camera stream
  const startCamera = useCallback(async (mode = facingMode) => {
    stopStream();
    setIsStarting(true);
    setErrorMessage('');
    setCapturedBlob(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsStarting(false);
      setErrorMessage('Direct live camera streaming is not supported on this browser or connection. Please use the system camera fallback below.');
      return;
    }

    try {
      const constraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().then(() => {
            setIsStreaming(true);
            setIsStarting(false);
          }).catch(err => {
            console.warn('Video play interrupted:', err);
            setIsStarting(false);
          });
        };
      }
    } catch (err) {
      console.error('Camera stream error:', err);
      setIsStarting(false);
      setIsStreaming(false);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Camera access was denied. Please allow camera permissions in your browser or phone app settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage('No camera hardware was found on this device.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setErrorMessage('The camera is currently being used by another application or tab.');
      } else {
        setErrorMessage(`Unable to access camera (${err.message || 'Error'}). Please try the camera fallback.`);
      }
    }
  }, [facingMode, previewUrl, stopStream]);

  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopStream();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setCapturedBlob(null);
      setErrorMessage('');
    }
    return () => {
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [isOpen]);

  // Flip camera between rear and front
  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Capture frame from video
  const captureFrame = () => {
    const video = videoRef.current;
    if (!video) return;

    // Optional haptic vibration
    if (navigator.vibrate) {
      try { navigator.vibrate(40); } catch (_) {}
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // If front camera, un-mirror the capture
    if (facingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob((blob) => {
      if (blob) {
        setCapturedBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        stopStream();
      }
    }, 'image/jpeg', 0.92);
  };

  // Retake photo
  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCapturedBlob(null);
    startCamera(facingMode);
  };

  // Confirm and attach photo
  const handleConfirmPhoto = () => {
    if (!capturedBlob) return;
    const timestamp = Date.now();
    const fileName = `jobcard_${photoType.toLowerCase().replace(/\s+/g, '_')}_${timestamp}.jpg`;
    const file = new File([capturedBlob], fileName, {
      type: 'image/jpeg',
      lastModified: timestamp
    });

    onPhotoCaptured(file, photoType);
    stopStream();
    onClose();
  };

  // Handle fallback native input capture
  const handleFallbackFile = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      onPhotoCaptured(file, photoType);
      stopStream();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between overflow-hidden animate-fade-in select-none">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent z-10 text-white">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <h3 className="text-sm font-black uppercase tracking-wider">
            {capturedBlob ? 'Review Vehicle Photo' : 'Live Camera Viewfinder'}
          </h3>
          <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full ml-1">
            {photoType}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            stopStream();
            onClose();
          }}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white"
          aria-label="Close camera"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Viewport */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {/* Error / Permission Denied State */}
        {errorMessage && (
          <div className="max-w-sm mx-4 p-6 bg-slate-900 border border-slate-800 rounded-3xl text-center space-y-4 text-white shadow-2xl">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold uppercase tracking-wide text-amber-300">Camera Notice</h4>
              <p className="text-xs text-slate-300 leading-relaxed">{errorMessage}</p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => fallbackInputRef.current?.click()}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" /> Open System Camera App
              </button>
              <button
                type="button"
                onClick={() => startCamera(facingMode)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Retry Live Stream
              </button>
            </div>
          </div>
        )}

        {/* Loading Spinner */}
        {isStarting && !errorMessage && (
          <div className="flex flex-col items-center justify-center gap-3 text-white">
            <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-300 tracking-wider">
              Accessing {facingMode === 'environment' ? 'Rear' : 'Front'} Camera...
            </span>
          </div>
        )}

        {/* Live Video Feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''} ${
            isStreaming && !capturedBlob ? 'block' : 'hidden'
          }`}
        />

        {/* Frame Guidelines Overlay (when live stream is active) */}
        {isStreaming && !capturedBlob && (
          <div className="absolute inset-6 pointer-events-none border-2 border-white/30 rounded-3xl flex flex-col justify-between p-4">
            <div className="flex justify-between items-start">
              <div className="w-6 h-6 border-t-2 border-l-2 border-white/70 rounded-tl-lg" />
              <div className="w-6 h-6 border-t-2 border-r-2 border-white/70 rounded-tr-lg" />
            </div>
            <div className="text-center">
              <span className="text-[11px] font-semibold text-white/80 bg-black/40 px-3 py-1 rounded-full backdrop-blur-xs">
                Frame {photoType} and tap capture
              </span>
            </div>
            <div className="flex justify-between items-end">
              <div className="w-6 h-6 border-b-2 border-l-2 border-white/70 rounded-bl-lg" />
              <div className="w-6 h-6 border-b-2 border-r-2 border-white/70 rounded-br-lg" />
            </div>
          </div>
        )}

        {/* Captured Freeze-Frame Preview */}
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Captured Preview"
            className="w-full h-full object-contain animate-fade-in"
          />
        )}

        {/* Hidden Native File Input Fallback with direct capture */}
        <input
          ref={fallbackInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFallbackFile}
          className="hidden"
        />
      </div>

      {/* Bottom Controls Bar */}
      <div className="p-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent z-10">
        {/* Preview Decision Controls */}
        {capturedBlob ? (
          <div className="flex items-center justify-around gap-4 max-w-md mx-auto">
            <button
              type="button"
              onClick={handleRetake}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-slate-800/90 hover:bg-slate-700 text-white rounded-2xl text-xs font-bold backdrop-blur-xs active:scale-95 transition-all border border-slate-700"
            >
              <RotateCcw className="w-4 h-4" /> Retake
            </button>
            <button
              type="button"
              onClick={handleConfirmPhoto}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-emerald-600/30 active:scale-95 transition-all"
            >
              <Check className="w-4 h-4" /> Attach Photo
            </button>
          </div>
        ) : (
          /* Live Capture Controls */
          <div className="flex items-center justify-between max-w-md mx-auto">
            {/* System Fallback Launcher */}
            <button
              type="button"
              onClick={() => fallbackInputRef.current?.click()}
              className="p-3.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white"
              title="Open System Camera"
            >
              <Camera className="w-5 h-5" />
            </button>

            {/* Main Shutter Button */}
            <button
              type="button"
              disabled={!isStreaming}
              onClick={captureFrame}
              className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center bg-transparent active:scale-90 transition-all disabled:opacity-40"
              aria-label="Capture photo"
            >
              <div className="w-14 h-14 rounded-full bg-white transition-transform duration-100 hover:scale-105" />
            </button>

            {/* Camera Switch Button */}
            <button
              type="button"
              onClick={toggleFacingMode}
              className={`p-3.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white ${
                !hasMultipleCameras ? 'opacity-40' : ''
              }`}
              title="Switch Camera (Front/Rear)"
            >
              <FlipHorizontal className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
