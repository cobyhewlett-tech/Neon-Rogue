import React from 'react';
import { GameMode, PlayerStats } from '../types';
import { UPGRADE_CATALOG } from '../game/constants';
import { 
  Shield, 
  Heart, 
  Zap, 
  Flame, 
  Pause, 
  Volume2, 
  VolumeX, 
  Crosshair, 
  Skull, 
  Clock,
  EyeOff,
  AlertTriangle
} from 'lucide-react';

interface HUDProps {
  stats: PlayerStats | null;
  score: number;
  kills: number;
  time: number;
  highScore: number;
  gameMode: GameMode;
  dailyCode?: string;
  bossState: { name: string; hp: number; maxHp: number } | null;
  isMuted: boolean;
  autoFire: boolean;
  onToggleMute: () => void;
  onToggleAutoFire: () => void;
  onPause: () => void;
  onDashClick: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  stats,
  score,
  kills,
  time,
  highScore,
  gameMode,
  dailyCode,
  bossState,
  isMuted,
  autoFire,
  onToggleMute,
  onToggleAutoFire,
  onPause,
  onDashClick,
}) => {
  if (!stats) return null;

  const minutes = Math.floor(time / 60);
  const seconds = time % 60;
  const timeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const xpPercent = Math.min(100, Math.round((stats.xp / stats.xpToNextLevel) * 100));
  const hpPercent = Math.max(0, Math.min(100, Math.round((stats.health / stats.maxHealth) * 100)));
  const shieldPercent = stats.maxShield > 0
    ? Math.max(0, Math.min(100, Math.round((stats.shield / stats.maxShield) * 100)))
    : 0;

  const dashReady = stats.dashTimer <= 0;
  const dashPercent = dashReady
    ? 100
    : Math.max(0, Math.min(100, Math.round((1 - stats.dashTimer / stats.dashCooldown) * 100)));

  // List of active upgrades
  const activeUpgradesList = Object.entries<number>(stats.upgrades).map(([id, level]) => {
    const info = UPGRADE_CATALOG.find((u) => u.id === id);
    return {
      id,
      title: info ? info.title : id,
      level: Number(level),
    };
  });

  return (
    <div id="game-hud-root" className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 select-none">
      {/* Top Header: XP bar, Timer, Score, Kills */}
      <div className="flex flex-col gap-2">
        {/* XP Progress Bar */}
        <div className="flex items-center gap-3 w-full max-w-4xl mx-auto">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-900/90 border border-amber-500/40 text-amber-400 font-mono font-bold text-xs tracking-wider shadow-sm">
            <Zap className="w-3.5 h-3.5" />
            <span>LVL {stats.level}</span>
          </div>

          <div className="relative flex-1 h-3.5 bg-slate-950/80 rounded-full border border-slate-800 overflow-hidden shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 via-sky-400 to-amber-400 transition-all duration-200"
              style={{ width: `${xpPercent}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-semibold text-slate-300 drop-shadow">
              {stats.xp} / {stats.xpToNextLevel} XP
            </div>
          </div>
        </div>

        {/* Status Tracker & Actions Row */}
        <div className="flex items-center justify-between w-full max-w-6xl mx-auto pt-1">
          {/* Left: Timer & Kills */}
          <div className="flex items-center gap-4 bg-slate-900/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-slate-800 text-slate-200 font-mono text-sm tabular-nums shadow-md">
            <div className="flex items-center gap-1.5 text-cyan-400">
              <Clock className="w-4 h-4" />
              <span className="font-bold tracking-wider">{timeFormatted}</span>
            </div>
            <div className="h-4 w-px bg-slate-700" />
            <div className="flex items-center gap-1.5 text-rose-400">
              <Skull className="w-4 h-4" />
              <span className="font-bold">{kills}</span>
            </div>
            {gameMode === 'daily' && dailyCode && (
              <>
                <div className="h-4 w-px bg-slate-700" />
                <span className="text-xs font-bold text-emerald-400 tracking-wide whitespace-nowrap">
                  DAILY · {dailyCode}
                </span>
              </>
            )}
          </div>

          {/* Center: Boss Health Gauge if active */}
          {bossState && (
            <div className="flex-1 max-w-md mx-4 animate-pulse">
              <div className="flex justify-between items-center text-xs font-mono font-bold text-rose-400 mb-1">
                <span>⚠️ {bossState.name}</span>
                <span>{Math.round((bossState.hp / bossState.maxHp) * 100)}%</span>
              </div>
              <div className="h-3 w-full bg-slate-950 rounded-full border border-rose-600/60 overflow-hidden shadow-rose-900/40 shadow-md">
                <div
                  className="h-full bg-gradient-to-r from-rose-600 to-amber-500 transition-all duration-150"
                  style={{ width: `${Math.max(0, Math.min(100, (bossState.hp / bossState.maxHp) * 100))}%` }}
                />
              </div>
            </div>
          )}

          {/* Right: Score and Interactive Control Buttons */}
          <div className="flex items-center gap-3">
            <div className="bg-slate-900/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-slate-800 text-right font-mono shadow-md">
              <div className="text-[10px] uppercase text-slate-400 tracking-wider">Score</div>
              <div className="text-sm font-bold text-amber-400">{score.toLocaleString()}</div>
            </div>

            {/* Quick Actions */}
            <div className="pointer-events-auto flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-800 shadow-md">
              <button
                id="btn-hud-autofire"
                type="button"
                onClick={onToggleAutoFire}
                title={autoFire ? 'Auto-Targeting: ON' : 'Auto-Targeting: OFF'}
                className={`p-2 rounded-lg transition-colors ${
                  autoFire
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Crosshair className="w-4 h-4" />
              </button>

              <button
                id="btn-hud-sound"
                type="button"
                onClick={onToggleMute}
                title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                id="btn-hud-pause"
                type="button"
                onClick={onPause}
                title="Pause Game (ESC)"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <Pause className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Center Stealth / Hiding Spot Indicator */}
      {stats.inHidingSpot && (
        <div className="flex justify-center pointer-events-none">
          {stats.isHidden ? (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-950/85 border border-emerald-500/60 text-emerald-300 font-mono text-xs font-bold shadow-lg shadow-emerald-500/20 backdrop-blur-md">
              <EyeOff className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>HIDING SPOT • CLOAK ACTIVE (CLICK TO AMBUSH CRIT)</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-950/85 border border-amber-500/60 text-amber-300 font-mono text-xs font-bold shadow-lg shadow-amber-500/20 backdrop-blur-md">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>COVER COMPROMISED • RE-CLOAKING...</span>
            </div>
          )}
        </div>
      )}

      {/* Bottom Bar: Health, Shield, Dash, Active Upgrades */}
      <div className="w-full max-w-6xl mx-auto flex flex-col sm:flex-row items-end sm:items-center justify-between gap-4">
        {/* Left: Health and Shield Vitals */}
        <div className="bg-slate-950/85 backdrop-blur-md p-3.5 rounded-2xl border border-slate-800/90 shadow-xl flex flex-col gap-2 w-72">
          {/* Shield Gauge */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-[11px] font-mono font-medium text-cyan-300">
              <span className="flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-cyan-400" />
                SHIELD
              </span>
              <span>
                {Math.round(stats.shield)} / {stats.maxShield}
              </span>
            </div>
            <div className="h-2.5 bg-slate-900 rounded-full border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-600 to-sky-400 transition-all duration-200"
                style={{ width: `${shieldPercent}%` }}
              />
            </div>
          </div>

          {/* Health Gauge */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-[11px] font-mono font-medium text-rose-300">
              <span className="flex items-center gap-1">
                <Heart className="w-3.5 h-3.5 text-rose-500" />
                HULL INTEGRITY
              </span>
              <span>
                {Math.round(stats.health)} / {stats.maxHealth}
              </span>
            </div>
            <div className="h-2.5 bg-slate-900 rounded-full border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-rose-600 to-red-400 transition-all duration-200"
                style={{ width: `${hpPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Center: Active Upgrades Pills */}
        <div className="hidden md:flex flex-wrap items-center gap-1.5 max-w-md justify-center">
          {activeUpgradesList.map((item) => {
            const isMax = item.level >= 5;
            return (
              <div
                key={item.id}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-mono shadow-sm ${
                  isMax
                    ? 'bg-amber-950/80 border-amber-400/70 text-amber-200'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300'
                }`}
              >
                <span className="truncate max-w-[110px]">{item.title}</span>
                <span className={isMax ? 'text-amber-300 font-black' : 'text-amber-400 font-bold'}>
                  {isMax ? 'LVL 5 ★' : `L${item.level}`}
                </span>
              </div>
            );
          })}
        </div>

        {/* Right: Dash Thruster status with click-to-dash on touch */}
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            id="btn-hud-dash"
            type="button"
            onClick={onDashClick}
            disabled={!dashReady}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl font-mono text-sm font-bold tracking-wide transition-all shadow-lg active:scale-95 ${
              dashReady
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 hover:brightness-110 shadow-cyan-500/20'
                : 'bg-slate-900/80 text-slate-500 border border-slate-800 cursor-not-allowed'
            }`}
          >
            <Flame className={`w-4 h-4 ${dashReady ? 'animate-pulse' : ''}`} />
            <span>WARP DASH</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/20 text-slate-900 font-normal">
              SPACE
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
