import React from 'react';
import { motion } from 'motion/react';
import { GameSettings } from '../types';
import { 
  Play, 
  RotateCcw, 
  Home, 
  Volume2, 
  VolumeX, 
  Vibrate, 
  Crosshair, 
  Keyboard,
  Sliders
} from 'lucide-react';

interface PauseModalProps {
  settings: GameSettings;
  onUpdateSettings: (newSettings: Partial<GameSettings>) => void;
  onResume: () => void;
  onRestart: () => void;
  onQuitToMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  settings,
  onUpdateSettings,
  onResume,
  onRestart,
  onQuitToMenu,
}) => {
  return (
    <div id="modal-pause" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-6 text-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold font-mono tracking-tight">GAME PAUSED</h2>
          </div>
          <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-1 rounded-md">
            [ESC] to Resume
          </span>
        </div>

        {/* Audio Controls */}
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-mono font-semibold uppercase text-slate-400 tracking-wider">
            Audio Calibration
          </h3>

          <div className="flex flex-col gap-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
            {/* Mute Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-sans font-medium">
                {settings.audio.muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
                <span>Master Sound</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    audio: { ...settings.audio, muted: !settings.audio.muted },
                  })
                }
                className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-colors ${
                  settings.audio.muted
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                }`}
              >
                {settings.audio.muted ? 'MUTED' : 'ACTIVE'}
              </button>
            </div>

            {/* SFX Volume */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span>Sound FX Volume</span>
                <span>{Math.round(settings.audio.sfxVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.audio.sfxVolume}
                onChange={(e) =>
                  onUpdateSettings({
                    audio: { ...settings.audio, sfxVolume: parseFloat(e.target.value) },
                  })
                }
                className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Music Volume */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span>Synth Music Volume</span>
                <span>{Math.round(settings.audio.musicVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.audio.musicVolume}
                onChange={(e) =>
                  onUpdateSettings({
                    audio: { ...settings.audio, musicVolume: parseFloat(e.target.value) },
                  })
                }
                className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Gameplay Options */}
        <div className="flex flex-col gap-2.5">
          <h3 className="text-xs font-mono font-semibold uppercase text-slate-400 tracking-wider">
            Display & Controls
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onUpdateSettings({ autoFire: !settings.autoFire })}
              className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-mono transition-all ${
                settings.autoFire
                  ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400'
              }`}
            >
              <Crosshair className="w-4 h-4" />
              <span>Auto-Aim: {settings.autoFire ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ screenShake: !settings.screenShake })}
              className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-mono transition-all ${
                settings.screenShake
                  ? 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400'
              }`}
            >
              <Vibrate className="w-4 h-4" />
              <span>Screen Shake: {settings.screenShake ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>

        {/* Controls Cheatsheet */}
        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 text-xs font-mono text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-cyan-400" />
            <span>Controls:</span>
          </div>
          <div className="flex gap-3 text-[11px]">
            <span><strong className="text-slate-200">WASD</strong> Move</span>
            <span><strong className="text-slate-200">SPACE</strong> Dash</span>
            <span><strong className="text-slate-200">CLICK</strong> Aim/Fire</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-2">
          <button
            id="btn-pause-resume"
            type="button"
            onClick={onResume}
            className="w-full py-3.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-sm tracking-wide transition-colors flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            RESUME SIMULATION
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              id="btn-pause-restart"
              type="button"
              onClick={onRestart}
              className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-mono text-xs font-bold border border-slate-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              RESTART RUN
            </button>
            <button
              id="btn-pause-quit"
              type="button"
              onClick={onQuitToMenu}
              className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-mono text-xs font-bold border border-slate-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              MAIN MENU
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
