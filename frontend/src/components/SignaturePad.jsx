import React, { useRef, useEffect, useState, useCallback } from 'react';
import { RotateCcw, Check, PenTool, CheckCircle2 } from 'lucide-react';

export default function SignaturePad({ label, value, onChange, readOnly = false }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(Boolean(value));
  const [isSaved, setIsSaved] = useState(Boolean(value));
  const pointsRef = useRef([]);
  const isDrawingRef = useRef(false);

  // Resize canvas for device pixel ratio and container width
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.max(Math.floor(rect.width) || 300, 240);
    const displayHeight = 120;

    // Set internal canvas resolution
    canvas.width = Math.round(displayWidth * dpr);
    canvas.height = Math.round(displayHeight * dpr);

    // Set CSS display dimensions
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    canvas.style.touchAction = 'none'; // Critical: Prevents mobile page scrolling while drawing!

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // If an existing signature is passed as value (Base64 URL)
    if (value) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.clearRect(0, 0, displayWidth, displayHeight);
        ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
        setHasSignature(true);
        setIsSaved(true);
      };
      img.src = value;
    } else {
      ctx.clearRect(0, 0, displayWidth, displayHeight);
    }
  }, [value]);

  useEffect(() => {
    setupCanvas();
    window.addEventListener('resize', setupCanvas);
    return () => window.removeEventListener('resize', setupCanvas);
  }, [setupCanvas]);

  // Coordinate helper using container bounding rect
  const getCoordinates = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startStroke = (clientX, clientY) => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const pt = getCoordinates(clientX, clientY);
    pointsRef.current = [pt];
    isDrawingRef.current = true;
    setIsDrawing(true);
    setIsSaved(false);

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.25, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
  };

  const continueStroke = (clientX, clientY) => {
    if (!isDrawingRef.current || readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const pt = getCoordinates(clientX, clientY);
    pointsRef.current.push(pt);
    const pts = pointsRef.current;

    if (pts.length >= 3) {
      const p1 = pts[pts.length - 2];
      const p2 = pts[pts.length - 1];
      const midPoint = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2
      };
      ctx.quadraticCurveTo(p1.x, p1.y, midPoint.x, midPoint.y);
      ctx.stroke();
    } else if (pts.length === 2) {
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
    setHasSignature(true);
  };

  const endStroke = () => {
    if (!isDrawingRef.current || readOnly) return;
    isDrawingRef.current = false;
    setIsDrawing(false);
    pointsRef.current = [];

    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setHasSignature(true);
    // Auto-commit signature to form state so nothing is lost if user forgets to tap Save
    onChange?.(dataUrl);
  };

  // Attach native non-passive listeners to canvas directly
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Pointer events (modern Android Chrome, iOS 13+ Safari, desktop)
    const onPointerDown = (e) => {
      if (readOnly) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      startStroke(e.clientX, e.clientY);
    };

    const onPointerMove = (e) => {
      if (!isDrawingRef.current || readOnly) return;
      e.preventDefault(); // Prevents vertical page scroll while drawing!
      continueStroke(e.clientX, e.clientY);
    };

    const onPointerUp = (e) => {
      if (!isDrawingRef.current || readOnly) return;
      e.preventDefault();
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      endStroke();
    };

    const onPointerCancel = (e) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      endStroke();
    };

    // Touch events fallback for older mobile engines (with passive: false)
    const onTouchStart = (e) => {
      if (readOnly || !e.touches || !e.touches[0]) return;
      e.preventDefault();
      const t = e.touches[0];
      startStroke(t.clientX, t.clientY);
    };

    const onTouchMove = (e) => {
      if (!isDrawingRef.current || readOnly || !e.touches || !e.touches[0]) return;
      e.preventDefault(); // Prevents vertical page scroll while drawing!
      const t = e.touches[0];
      continueStroke(t.clientX, t.clientY);
    };

    const onTouchEnd = (e) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      endStroke();
    };

    // Use PointerEvents if supported, otherwise fallback to TouchEvents
    const hasPointer = window.PointerEvent;
    if (hasPointer) {
      canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
      canvas.addEventListener('pointermove', onPointerMove, { passive: false });
      canvas.addEventListener('pointerup', onPointerUp, { passive: false });
      canvas.addEventListener('pointercancel', onPointerCancel, { passive: false });
    } else {
      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      canvas.addEventListener('touchend', onTouchEnd, { passive: false });
      canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
    }

    return () => {
      if (hasPointer) {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerCancel);
      } else {
        canvas.removeEventListener('touchstart', onTouchStart);
        canvas.removeEventListener('touchmove', onTouchMove);
        canvas.removeEventListener('touchend', onTouchEnd);
        canvas.removeEventListener('touchcancel', onTouchEnd);
      }
    };
  }, [readOnly, onChange]);

  const clearPad = () => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    pointsRef.current = [];
    setHasSignature(false);
    setIsSaved(false);
    onChange?.('');
  };

  const saveSignature = () => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;
    const dataUrl = canvas.toDataURL('image/png');
    onChange?.(dataUrl);
    setIsSaved(true);
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
            {label}
          </label>
          {hasSignature && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-3 h-3" /> {isSaved ? 'Saved' : 'Signed'}
            </span>
          )}
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            {hasSignature && (
              <button
                type="button"
                onClick={clearPad}
                className="flex items-center gap-1 text-[11px] font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                title="Clear Signature"
              >
                <RotateCcw className="w-3 h-3" /> Clear
              </button>
            )}
            {hasSignature && !isSaved && (
              <button
                type="button"
                onClick={saveSignature}
                className="flex items-center gap-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 rounded-lg shadow-sm transition-colors"
                title="Save Signature"
              >
                <Check className="w-3 h-3" /> Save
              </button>
            )}
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className={`relative border-2 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-inner flex flex-col justify-center items-center select-none ${
          readOnly
            ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40'
            : isDrawing
            ? 'border-indigo-500 ring-2 ring-indigo-500/20'
            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
        }`}
        style={{ touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          className={`w-full block ${
            readOnly ? 'cursor-default' : 'cursor-crosshair'
          }`}
          style={{
            touchAction: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
            WebkitTouchCallout: 'none'
          }}
        />

        {/* Signing Guide Line & Watermark */}
        {!readOnly && !hasSignature && (
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3">
            <div className="flex items-center gap-1.5 text-slate-300 dark:text-slate-600 text-[10px] font-medium">
              <PenTool className="w-3 h-3" />
              <span>Use finger or stylus to sign</span>
            </div>
            <div className="w-full flex items-center gap-2">
              <div className="flex-1 border-b border-dashed border-slate-200 dark:border-slate-800" />
              <span className="text-[9px] uppercase tracking-wider text-slate-300 dark:text-slate-600 font-bold">Sign above line</span>
              <div className="flex-1 border-b border-dashed border-slate-200 dark:border-slate-800" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
