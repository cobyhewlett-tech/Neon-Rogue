import React, { useState } from 'react';
import { motion } from 'motion/react';
import type { User } from 'firebase/auth';
import {
  DailyChallengeConfig,
  DailyLeaderboardEntry,
  GameMode,
  HighScoreEntry,
  ShipClass,
} from '../types';
import { SHIP_CLASSES } from '../game/constants';
import { 
  Play, 
  Shield, 
  Zap, 
  Flame, 
  Volume2, 
  VolumeX, 
  Trophy, 
  HelpCircle, 
  Crosshair, 
  Sparkles, 
  X,
  Clock,
  Skull,
  Calendar,
  LogIn,
  LogOut,
  Lock
} from 'lucide-react';

interface MainMenuProps {
  highScores: HighScoreEntry[];
  unlockedShipIds: string[];
  isMuted: boolean;
  dailyConfig: DailyChallengeConfig;
  dailyCountdown: string;
  dailyLeaderboard: DailyLeaderboardEntry[];
  dailyLeaderboardLoading: boolean;
  localDailyBest: number;
  currentUser: User | null;
  authBusy: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onToggleMute: () => void;
  onStartGame: (ship: ShipClass, mode: GameMode) => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  highScores,
  unlockedShipIds,
  isMuted,
  dailyConfig,
  dailyCountdown,
  dailyLeaderboard,
  dailyLeaderboardLoading,
  localDailyBest,
  currentUser,
  authBusy,
  onSignIn,
  onSignOut,
  onToggleMute,
  onStartGame,
}) => {
  const [selectedShipIndex, setSelectedShipIndex] = useState(0);
  const [selectedMode, setSelectedMode] = useState<GameMode>('survivor');
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showScoresModal, setShowScoresModal] = useState(false);

  const isDaily = selectedMode === 'daily';
  const activeShip = isDaily ? dailyConfig.ship : SHIP_CLASSES[selectedShipIndex];
  const isUnlocked = isDaily || activeShip.unlockedByDefault || unlockedShipIds.includes(activeShip.id);

  const myCloudEntry = currentUser
    ? dailyLeaderboard.find((e) => e.uid === currentUser.uid)
    : undefined;
  const myDailyBest = Math.max(localDailyBest, myCloudEntry?.score || 0);

  const handleLaunch = () => {
    if (!isUnlocked) return;
    onStartGame(activeShip, selectedMode);
  };

  return (
    <div id="main-menu-root" className="relative min-h-screen w-full flex flex-col justify-between p-4 sm:p-8 bg-slate-950 text-slate-100 select-none overflow-y-auto">
      {/* Background Ambience / Grid */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-950/20 via-slate-950 to-slate-950 pointer-events-none" />
      <div 
        className="absolute inset-0 opacity-15 pointer-events-none" 
        style={{
          backgroundImage: 'linear-gradient(to right, #1e293b 1px, transparent 1px), linear-gradient(to bottom, #1e293b 1px, transparent 1px)',
          backgroundSize: '48px 48px'
        }}
      />

      {/* Top Navbar */}
      <header className="relative z-10 w-full max-w-6xl mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-md shadow-cyan-500/10">
            <Crosshair className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black font-mono tracking-wider text-white">
              NEON<span className="text-cyan-400">ROGUE</span>
            </h1>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              Cyber Survivor • 60FPS Arcade
            </p>
          </div>
        </div>

        {/* Top Right Utility Buttons */}
        <div className="flex items-center gap-2">
          <button
            id="btn-menu-scores"
            type="button"
            onClick={() => setShowScoresModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 hover:text-amber-300 hover:border-amber-500/40 transition-colors cursor-pointer"
          >
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Records</span>
          </button>

          <button
            id="btn-menu-guide"
            type="button"
            onClick={() => setShowGuideModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Manual</span>
          </button>

          <button
            id="btn-menu-mute"
            type="button"
            onClick={onToggleMute}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Center Content: Ship Selection & Mode Configuration */}
      <main className="relative z-10 w-full max-w-5xl mx-auto my-auto py-6 flex flex-col gap-6">
        {/* Title Tagline */}
        <div className="text-center flex flex-col items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold tracking-widest uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            Tactical Space Combat Simulator
          </div>
          <h2 className="text-3xl sm:text-5xl font-black font-mono tracking-tight text-white">
            SELECT COMBAT VESSEL
          </h2>
          <p className="text-sm text-slate-400 max-w-md font-sans">
            Pilot specialized interceptors, collect glowing energy cores, and build an unstoppable modular arsenal.
          </p>
        </div>

        {/* Ship Class Selection Carousel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SHIP_CLASSES.map((ship, idx) => {
            const isDailyShip = isDaily && ship.id === dailyConfig.ship.id;
            const isCurrent = isDaily ? isDailyShip : idx === selectedShipIndex;
            const shipUnlocked = isDailyShip || ship.unlockedByDefault || unlockedShipIds.includes(ship.id);
            const isDimmedByDaily = isDaily && !isDailyShip;

            return (
              <motion.button
                key={ship.id}
                id={`btn-select-ship-${ship.id}`}
                type="button"
                whileHover={isDimmedByDaily ? undefined : { y: -4 }}
                whileTap={isDimmedByDaily ? undefined : { scale: 0.98 }}
                onClick={() => {
                  if (!isDaily) setSelectedShipIndex(idx);
                }}
                className={`p-5 rounded-3xl border-2 transition-all text-left flex flex-col justify-between min-h-[280px] relative overflow-hidden ${
                  isCurrent
                    ? isDaily
                      ? 'bg-slate-900/90 border-emerald-400 shadow-xl shadow-emerald-500/10 cursor-default'
                      : 'bg-slate-900/90 border-cyan-400 shadow-xl shadow-cyan-500/10 cursor-pointer'
                    : isDimmedByDaily
                    ? 'bg-slate-950/40 border-slate-900 opacity-45 cursor-not-allowed'
                    : 'bg-slate-950/70 border-slate-800/90 hover:border-slate-700 cursor-pointer'
                }`}
              >
                {/* Active Indicator Pin */}
                {isCurrent && (
                  <div
                    className={`absolute top-3 right-3 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      isDaily
                        ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                        : 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                    }`}
                  >
                    {isDaily ? 'DAILY VESSEL' : 'SELECTED'}
                  </div>
                )}
                {!isCurrent && !shipUnlocked && !isDaily && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-mono text-slate-500">
                    <Lock className="w-3 h-3" />
                    <span>LOCKED</span>
                  </div>
                )}

                {/* Top: Icon & Codename */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-12 h-12 rounded-2xl flex items-center justify-center border shadow-inner"
                      style={{ 
                        backgroundColor: `${ship.color}15`, 
                        borderColor: `${ship.color}40`,
                        color: ship.color 
                      }}
                    >
                      <Crosshair className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                        {ship.codename}
                      </div>
                      <div className="text-lg font-bold font-mono text-white">
                        {ship.name}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed font-sans">
                    {ship.description}
                  </p>
                </div>

                {/* Center: Specs Bars */}
                <div className="flex flex-col gap-2 pt-4 border-t border-slate-800/80">
                  <div className="flex flex-col gap-1 text-[11px] font-mono">
                    <div className="flex justify-between text-slate-400">
                      <span className="flex items-center gap-1">
                        <Shield className="w-3 h-3 text-cyan-400" /> Hull & Shield
                      </span>
                      <span className="text-slate-200">{ship.baseMaxHealth + ship.baseShield} PTS</span>
                    </div>
                    <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-cyan-400" 
                        style={{ width: `${Math.min(100, ((ship.baseMaxHealth + ship.baseShield) / 270) * 100)}%` }} 
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 text-[11px] font-mono">
                    <div className="flex justify-between text-slate-400">
                      <span className="flex items-center gap-1">
                        <Flame className="w-3 h-3 text-amber-400" /> Agility / Dash
                      </span>
                      <span className="text-slate-200">{ship.baseSpeed.toFixed(1)} SPD</span>
                    </div>
                    <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-400" 
                        style={{ width: `${Math.min(100, (ship.baseSpeed / 6.5) * 100)}%` }} 
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 text-[11px] font-mono">
                    <div className="flex justify-between text-slate-400">
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-sky-400" /> Firepower
                      </span>
                      <span className="text-slate-200">{Math.round(ship.baseFireRate * ship.baseDamage)} DPS</span>
                    </div>
                    <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-sky-400" 
                        style={{ width: `${Math.min(100, ((ship.baseFireRate * ship.baseDamage) / 130) * 100)}%` }} 
                      />
                    </div>
                  </div>
                </div>

                {/* Special Perk Tag */}
                <div className="mt-3 p-2 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] font-mono text-slate-300">
                  <span className="text-amber-400 font-bold block mb-0.5">Vessel Trait:</span>
                  <span>{ship.specialTrait}</span>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Game Mode Selector */}
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 p-4 rounded-3xl bg-slate-900/80 border border-slate-800">
          <div className="flex flex-col gap-0.5 text-center lg:text-left">
            <span className="text-xs font-mono uppercase text-slate-400 font-semibold tracking-wider">
              Operation Mode
            </span>
            <span className="text-sm font-sans text-slate-300">
              {selectedMode === 'survivor'
                ? 'Survivor Protocol: Survive 10 minutes, use tactical hiding spots, and eliminate 2 massive dreadnought bosses.'
                : selectedMode === 'daily'
                ? `Daily Challenge (${dailyConfig.challengeCode}): Fixed 24h seeded run shared by all pilots. Compete for the daily high score.`
                : 'Endless Simulation: Test your survivability against exponentially scaling waves.'}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5 p-1 rounded-2xl bg-slate-950 border border-slate-800 shrink-0">
            <button
              id="btn-mode-survivor"
              type="button"
              onClick={() => setSelectedMode('survivor')}
              className={`px-3.5 py-2 rounded-xl font-mono text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedMode === 'survivor'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              SURVIVOR (10 MIN)
            </button>
            <button
              id="btn-mode-endless"
              type="button"
              onClick={() => setSelectedMode('endless')}
              className={`px-3.5 py-2 rounded-xl font-mono text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedMode === 'endless'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ENDLESS
            </button>
            <button
              id="btn-mode-daily"
              type="button"
              onClick={() => setSelectedMode('daily')}
              className={`px-3.5 py-2 rounded-xl font-mono text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedMode === 'daily'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              DAILY CHALLENGE
            </button>
          </div>
        </div>

        {/* Daily Challenge Briefing & Global Leaderboard Panel */}
        {isDaily && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-5 rounded-3xl bg-slate-900/85 border border-emerald-500/35 shadow-xl">
            {/* Left: Daily Seed & Mutator Briefing */}
            <div className="lg:col-span-5 flex flex-col justify-between gap-4 pr-0 lg:pr-4 lg:border-r lg:border-slate-800">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold font-mono text-emerald-300 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Today&apos;s Seeded Run
                  </h3>
                  <span className="text-xs font-mono tabular-nums text-slate-400">
                    Resets in {dailyCountdown}
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-400 flex flex-wrap items-center gap-2">
                  <span className="text-slate-200 font-semibold">{dailyConfig.challengeCode}</span>
                  <span aria-hidden="true">·</span>
                  <span>{dailyConfig.dateKey} UTC</span>
                  <span aria-hidden="true">·</span>
                  <span>24h Global Rotation</span>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 text-xs font-sans border-t border-slate-800 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-mono">Assigned Vessel</span>
                  <span className="text-slate-100 font-mono font-bold">{dailyConfig.ship.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-mono">Starting Module</span>
                  <span className="text-cyan-300 font-mono font-bold">{dailyConfig.startingUpgradeTitle} L1</span>
                </div>
                <div className="flex flex-col gap-1 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-mono">Sector Mutator</span>
                    <span className="text-amber-300 font-mono font-bold">{dailyConfig.mutator.name}</span>
                  </div>
                  <p className="text-slate-400 text-xs">{dailyConfig.mutator.description}</p>
                  <p className="text-emerald-300 font-mono text-[11px]">{dailyConfig.mutator.effectsSummary}</p>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Your Best Today</span>
                <span className="text-amber-300 font-bold tabular-nums">
                  {myDailyBest > 0 ? `${myDailyBest.toLocaleString()} PTS` : 'No Run Logged'}
                </span>
              </div>
            </div>

            {/* Right: Live Global Daily Leaderboard */}
            <div className="lg:col-span-7 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold font-mono text-white">
                    Daily Standings ({dailyLeaderboard.length})
                  </h3>
                </div>

                {currentUser ? (
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-emerald-300 truncate max-w-[160px]">
                      {currentUser.displayName || currentUser.email?.split('@')[0] || 'Pilot'}
                    </span>
                    <button
                      id="btn-daily-signout"
                      type="button"
                      onClick={onSignOut}
                      disabled={authBusy}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button
                    id="btn-daily-signin"
                    type="button"
                    onClick={onSignIn}
                    disabled={authBusy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono font-bold text-cyan-300 transition-colors cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    {authBusy ? 'Signing In...' : 'Sign In to Compete'}
                  </button>
                )}
              </div>

              {dailyLeaderboardLoading ? (
                <div className="py-8 text-center text-xs font-mono text-slate-500">
                  Syncing daily standings...
                </div>
              ) : dailyLeaderboard.length === 0 ? (
                <div className="py-8 text-center text-xs font-mono text-slate-400 bg-slate-950/60 rounded-2xl border border-slate-800/80 px-4">
                  No scores posted for {dailyConfig.challengeCode} yet.{' '}
                  {currentUser
                    ? 'Complete a run to claim #1!'
                    : 'Sign in with Google and launch a run to claim #1.'}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1">
                  {dailyLeaderboard.slice(0, 20).map((entry, idx) => {
                    const isSelf = currentUser && entry.uid === currentUser.uid;
                    const m = Math.floor(entry.survivalTime / 60);
                    const s = entry.survivalTime % 60;
                    return (
                      <div
                        key={entry.id}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl border font-mono text-xs tabular-nums ${
                          isSelf
                            ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-100'
                            : 'bg-slate-950/70 border-slate-800/80 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-6 font-bold shrink-0 ${
                              idx === 0
                                ? 'text-amber-400'
                                : idx === 1
                                ? 'text-slate-200'
                                : idx === 2
                                ? 'text-amber-600'
                                : 'text-slate-500'
                            }`}
                          >
                            #{idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-100 truncate">
                              {entry.pilotName}
                              {isSelf ? ' (You)' : ''}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {m}:{String(s).padStart(2, '0')} · {entry.kills} kills · LVL {entry.level}
                            </div>
                          </div>
                        </div>
                        <div className="text-right font-bold text-amber-300 shrink-0 pl-2">
                          {entry.score.toLocaleString()} PTS
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Big Launch Button */}
        <div className="flex flex-col items-center gap-2 pt-2">
          <motion.button
            id="btn-main-launch"
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={!isUnlocked}
            onClick={handleLaunch}
            className={`w-full max-w-md py-4 px-6 rounded-2xl font-mono font-black text-lg tracking-wider flex items-center justify-center gap-3 shadow-xl transition-all ${
              !isUnlocked
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : isDaily
                ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 hover:brightness-110 text-slate-950 shadow-emerald-500/25 cursor-pointer'
                : 'bg-gradient-to-r from-cyan-500 via-sky-400 to-blue-600 hover:brightness-110 text-slate-950 shadow-cyan-500/25 cursor-pointer'
            }`}
          >
            <Play className="w-6 h-6 fill-current" />
            {isDaily ? 'START DAILY CHALLENGE' : 'INITIATE COMBAT RUN'}
          </motion.button>
          <span className="text-xs font-mono text-slate-500">
            Controls: WASD / Arrows to Move · Mouse Aim / Auto-fire · SPACE to Dash
          </span>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto flex items-center justify-between text-[11px] font-mono text-slate-500 py-2 border-t border-slate-900">
        <div>NEON ROGUE • V1.0.0</div>
        <div>WEB AUDIO PROCEDURAL SYNTH ENGINE</div>
      </footer>

      {/* Guide Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold font-mono text-cyan-400 flex items-center gap-2">
                <HelpCircle className="w-5 h-5" /> PILOT FLIGHT MANUAL
              </h3>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs font-sans leading-relaxed text-slate-300">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col gap-1 font-mono">
                <span className="text-amber-400 font-bold">FLIGHT CONTROLS:</span>
                <span>• <strong className="text-white">WASD or Arrow Keys</strong>: 360° Movement</span>
                <span>• <strong className="text-white">Mouse Aim / Click</strong>: Manual Fire</span>
                <span>• <strong className="text-white">Auto-Aim (Crosshair button)</strong>: Targets nearest hostile automatically</span>
                <span>• <strong className="text-white">SPACE or Right Click</strong>: Warp Dash (Invulnerability frames!)</span>
                <span>• <strong className="text-white">1, 2, 3 Keys</strong>: Quick-select level-up augmentations</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col gap-1">
                <span className="text-cyan-400 font-mono font-bold">TACTICAL INTEL, HIDING SPOTS &amp; DAILY CHALLENGE:</span>
                <span>• Fly into green <strong>Hiding Spots</strong> (marked on your radar) to engage your stealth cloak. Enemies lose aggro, snipers drop laser locks, and shields recharge rapidly!</span>
                <span>• While hidden, auto-fire holds cover. <strong>Left-Click</strong> to fire a guaranteed <strong>Ambush Critical Strike</strong>.</span>
                <span>• Upgrade every weapon and defense module up to <strong>LVL 5</strong> to unlock its Overdrive mastery perk!</span>
                <span>• <strong>Daily Challenge</strong> resets every 24h (00:00 UTC) with a shared seed, fixed vessel, mutator, and global leaderboard.</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-mono font-bold text-xs tracking-wider cursor-pointer"
            >
              ACKNOWLEDGE
            </button>
          </div>
        </div>
      )}

      {/* High Scores Modal */}
      {showScoresModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold font-mono text-amber-400 flex items-center gap-2">
                <Trophy className="w-5 h-5" /> TOP PILOT RECORDS
              </h3>
              <button
                type="button"
                onClick={() => setShowScoresModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {highScores.length === 0 ? (
              <div className="py-8 text-center text-slate-500 font-mono text-xs">
                No recorded flights yet. Initiate a run to log your score!
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                {highScores.map((entry, i) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-5 font-bold ${i === 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                        #{i + 1}
                      </span>
                      <div>
                        <div className="text-slate-200 font-bold">{entry.shipName}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-cyan-400" />
                            {Math.floor(entry.survivalTime / 60)}:{(entry.survivalTime % 60).toString().padStart(2, '0')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Skull className="w-3 h-3 text-rose-400" />
                            {entry.kills} kills
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-amber-400 font-bold">{entry.score.toLocaleString()} PTS</div>
                      <div className="text-[10px] text-slate-500">LVL {entry.level}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowScoresModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-200 font-mono font-bold text-xs tracking-wider cursor-pointer"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
