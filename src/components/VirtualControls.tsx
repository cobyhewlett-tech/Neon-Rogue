import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, Flame } from 'lucide-react';

interface VirtualControlsProps {
  onMove: (x: number, y: number) => void;
  onDash: () => void;
  autoFire: boolean;
  onToggleAutoFire: () => void;
}

export const VirtualControls: React.FC<VirtualControlsProps> = ({
  onMove,
  onDash,
  autoFire,
  onToggleAutoFire,
}) => {
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const joystickRef = useRef<HTMLDivElement>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const touchIdRef = useRef<number | null>(null);

  useEffect(() => {
    // Detect touch capability
    const checkTouch = () => {
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        setIsTouchDevice(true);
      }
    };
    checkTouch();
  }, []);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;
    handleTouchMove(e);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchIdRef.current === null || !joystickRef.current) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchIdRef.current) {
        const rect = joystickRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const maxDist = rect.width / 2 - 10;
        const dist = Math.hypot(dx, dy);

        if (dist > maxDist) {
          dx = (dx / dist) * maxDist;
          dy = (dy / dist) * maxDist;
        }

        setKnobPos({ x: dx, y: dy });

        // Normalize to -1 to 1
        onMove(dx / maxDist, dy / maxDist);
        break;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        touchIdRef.current = null;
        setKnobPos({ x: 0, y: 0 });
        onMove(0, 0);
        break;
      }
    }
  };

  if (!isTouchDevice) return null;

  return (
    <div id="virtual-controls-container" className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* Left Virtual Joystick */}
      <div className="pointer-events-auto absolute bottom-8 left-8">
        <div
          ref={joystickRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className="relative w-32 h-32 rounded-full bg-slate-900/60 backdrop-blur-sm border-2 border-slate-700/80 flex items-center justify-center touch-none shadow-2xl"
        >
          {/* Inner ring */}
          <div className="w-16 h-16 rounded-full border border-slate-700/50" />
          {/* Knob */}
          <div
            className="absolute w-12 h-12 rounded-full bg-gradient-to-tr from-cyan-600 to-sky-400 border-2 border-white/80 shadow-lg transition-transform duration-75"
            style={{
              transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
            }}
          />
        </div>
      </div>

      {/* Right Action Buttons */}
      <div className="pointer-events-auto absolute bottom-8 right-8 flex flex-col items-center gap-3">
        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            onToggleAutoFire();
          }}
          className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all shadow-xl active:scale-95 ${
            autoFire
              ? 'bg-cyan-500/30 border-cyan-400 text-cyan-300'
              : 'bg-slate-900/70 border-slate-700 text-slate-400'
          }`}
        >
          <Crosshair className="w-6 h-6" />
        </button>

        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            onDash();
          }}
          className="w-16 h-16 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 flex items-center justify-center border-2 border-white/60 shadow-xl active:scale-90"
        >
          <Flame className="w-7 h-7" />
        </button>
      </div>
    </div>
  );
};
