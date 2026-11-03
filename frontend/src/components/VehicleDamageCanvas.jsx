import React, { useRef, useEffect, useState } from 'react';
import { ShieldAlert, Trash2, Edit } from 'lucide-react';

export default function VehicleDamageCanvas({ markings = [], onChange, readOnly = false }) {
  const canvasRef = useRef(null);
  const [selectedType, setSelectedType] = useState('Scratch');
  const [description, setDescription] = useState('');
  const [hoveredMarking, setHoveredMarking] = useState(null);

  // Redraw the canvas background and markings
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Draw grid background (subtle)
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // --- Draw Car Schematic Wireframe ---
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#ffffff';

    // 1. Center Body (Top View Outline)
    ctx.beginPath();
    ctx.roundRect(120, 100, 260, 100, 25);
    ctx.stroke();
    
    // Windshield (Front - left side of body)
    ctx.beginPath();
    ctx.moveTo(180, 100);
    ctx.quadraticCurveTo(170, 150, 180, 200);
    ctx.stroke();

    // Rear Windshield (Rear - right side of body)
    ctx.beginPath();
    ctx.moveTo(320, 100);
    ctx.quadraticCurveTo(330, 150, 320, 200);
    ctx.stroke();

    // Cabin lines (Sides)
    ctx.beginPath();
    ctx.moveTo(180, 115);
    ctx.lineTo(320, 115);
    ctx.moveTo(180, 185);
    ctx.lineTo(320, 185);
    ctx.stroke();

    // Wheels (4 tyres)
    ctx.fillStyle = '#475569';
    ctx.fillRect(150, 85, 40, 15);  // Front Right
    ctx.fillRect(150, 200, 40, 15); // Front Left
    ctx.fillRect(310, 85, 40, 15);  // Rear Right
    ctx.fillRect(310, 200, 40, 15); // Rear Left

    // Labels for RHS / LHS / Front / Rear
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillText('RHS (RIGHT HAND SIDE)', 190, 75);
    ctx.fillText('LHS (LEFT HAND SIDE)', 190, 235);
    ctx.fillText('FRONT', 60, 155);
    ctx.fillText('REAR', 410, 155);

    // Front Bumper / Grill schematic
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(120, 150, 20, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();

    // Rear bumper schematic
    ctx.beginPath();
    ctx.arc(380, 150, 20, Math.PI * 1.5, Math.PI * 0.5);
    ctx.stroke();

    // Draw Markings
    markings.forEach((m, idx) => {
      let color = '#3b82f6'; // blue for Scratch
      let label = 'S';
      if (m.type === 'Dent') { color = '#ef4444'; label = 'D'; }
      if (m.type === 'Crack') { color = '#f59e0b'; label = 'C'; }
      if (m.type === 'Paint Damage') { color = '#ec4899'; label = 'P'; }
      if (m.type === 'Glass Damage') { color = '#06b6d4'; label = 'G'; }
      if (m.type === 'Bumper Damage') { color = '#64748b'; label = 'B'; }

      // Outer Glow
      ctx.beginPath();
      ctx.arc(m.x, m.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = color + '22'; // 13% opacity
      ctx.fill();

      // Main Circle
      ctx.beginPath();
      ctx.arc(m.x, m.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label Text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, m.x, m.y);
    });
  };

  useEffect(() => {
    drawCanvas();
  }, [markings]);

  const handleCanvasClick = (e) => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.round((e.clientY - rect.top) * (canvas.height / rect.height));

    // Check if clicked near an existing marking to edit or delete it
    const clickThreshold = 15;
    const existingIdx = markings.findIndex(m => {
      const dist = Math.sqrt((m.x - x) ** 2 + (m.y - y) ** 2);
      return dist <= clickThreshold;
    });

    if (existingIdx !== -1) {
      // Remove marking on click
      const newMarkings = [...markings];
      newMarkings.splice(existingIdx, 1);
      onChange(newMarkings);
      return;
    }

    // Add new marking
    const desc = prompt(`Enter notes for this ${selectedType} (optional):`) || '';
    const newMarking = { x, y, type: selectedType, description: desc };
    onChange([...markings, newMarking]);
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    const hoverThreshold = 15;
    const hovered = markings.find(m => {
      const dist = Math.sqrt((m.x - x) ** 2 + (m.y - y) ** 2);
      return dist <= hoverThreshold;
    });

    setHoveredMarking(hovered || null);
  };

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex flex-wrap gap-2 items-center bg-slate-100 dark:bg-slate-900 p-2 rounded-lg">
          <span className="text-xs font-bold text-slate-500 mr-2">DAMAGE SELECTOR:</span>
          {[
            { name: 'Scratch', color: 'bg-blue-500 border-blue-500' },
            { name: 'Dent', color: 'bg-red-500 border-red-500' },
            { name: 'Crack', color: 'bg-amber-500 border-amber-500' },
            { name: 'Paint Damage', color: 'bg-pink-500 border-pink-500' },
            { name: 'Glass Damage', color: 'bg-cyan-500 border-cyan-500' },
            { name: 'Bumper Damage', color: 'bg-slate-500 border-slate-500' },
          ].map(t => (
            <button
              key={t.name}
              type="button"
              onClick={() => setSelectedType(t.name)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                selectedType === t.name
                  ? `${t.color} text-white shadow-sm`
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${t.color.split(' ')[0]}`} />
              {t.name}
            </button>
          ))}
        </div>
      )}

      <div className="relative border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-950 flex justify-center">
        <canvas
          ref={canvasRef}
          width={500}
          height={300}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          className={`max-w-full ${readOnly ? 'cursor-default' : 'cursor-crosshair'}`}
          style={{ touchAction: 'manipulation' }}
        />
        
        {hoveredMarking && (
          <div className="absolute top-2 left-2 bg-slate-900/90 text-white px-3 py-1.5 rounded-md text-xs pointer-events-none shadow-lg animate-fade-in">
            <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400 block">{hoveredMarking.type}</span>
            {hoveredMarking.description || 'No additional notes'}
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="flex gap-2 items-start text-slate-500 text-xs">
          <ShieldAlert className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <p>
            Tap anywhere on the car wireframe to mark damage. Tap an existing marker to delete it.
          </p>
        </div>
      )}

      {markings.length > 0 && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-900/50">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
                <th className="p-2">Type</th>
                <th className="p-2">Details</th>
                {!readOnly && <th className="p-2 text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {markings.map((m, idx) => (
                <tr key={idx} className="border-b border-slate-100 dark:border-slate-800/50">
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                      m.type === 'Scratch' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' :
                      m.type === 'Dent' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                      m.type === 'Crack' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
                      'bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-400'
                    }`}>
                      {m.type}
                    </span>
                  </td>
                  <td className="p-2 text-slate-600 dark:text-slate-350">{m.description || 'No notes added'}</td>
                  {!readOnly && (
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          const newM = [...markings];
                          newM.splice(idx, 1);
                          onChange(newM);
                        }}
                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
