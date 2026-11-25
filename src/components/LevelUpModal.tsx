import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { UpgradeDefinition, UpgradeRarity } from '../types';
import { 
  Zap, 
  Orbit, 
  Activity, 
  Rocket, 
  Radio, 
  Shield, 
  ShieldCheck, 
  HeartPulse, 
  Magnet, 
  Flame, 
  Target, 
  Cpu, 
  Sparkles,
  ArrowUpRight,
  EyeOff
} from 'lucide-react';

interface LevelUpModalProps {
  level: number;
  options: UpgradeDefinition[];
  onSelect: (upgradeId: string) => void;
}

const RARITY_THEMES: Record<UpgradeRarity, { border: string; bg: string; badge: string; text: string }> = {
  common: {
    border: 'border-slate-700 hover:border-cyan-500',
    bg: 'from-slate-900/90 to-slate-950/90',
    badge: 'bg-slate-800 text-slate-300 border-slate-700',
    text: 'text-cyan-400',
  },
  rare: {
    border: 'border-sky-700/60 hover:border-sky-400',
    bg: 'from-sky-950/40 to-slate-950/90',
    badge: 'bg-sky-900/60 text-sky-300 border-sky-700',
    text: 'text-sky-400',
  },
  epic: {
    border: 'border-purple-700/60 hover:border-purple-400',
    bg: 'from-purple-950/40 to-slate-950/90',
    badge: 'bg-purple-900/60 text-purple-300 border-purple-700',
    text: 'text-purple-400',
  },
  legendary: {
    border: 'border-amber-500/80 hover:border-amber-300 shadow-amber-500/20 shadow-xl',
    bg: 'from-amber-950/50 to-slate-950/95',
    badge: 'bg-amber-900/60 text-amber-300 border-amber-500',
    text: 'text-amber-400',
  },
};

const getIcon = (iconName: string, className = 'w-6 h-6') => {
  switch (iconName) {
    case 'Zap': return <Zap className={className} />;
    case 'Orbit': return <Orbit className={className} />;
    case 'Activity': return <Activity className={className} />;
    case 'Rocket': return <Rocket className={className} />;
    case 'Radio': return <Radio className={className} />;
    case 'Shield': return <Shield className={className} />;
    case 'ShieldCheck': return <ShieldCheck className={className} />;
    case 'HeartPulse': return <HeartPulse className={className} />;
    case 'Magnet': return <Magnet className={className} />;
    case 'Flame': return <Flame className={className} />;
    case 'Target': return <Target className={className} />;
    case 'Cpu': return <Cpu className={className} />;
    case 'Sparkles': return <Sparkles className={className} />;
    case 'EyeOff': return <EyeOff className={className} />;
    default: return <Zap className={className} />;
  }
};

export const LevelUpModal: React.FC<LevelUpModalProps> = ({ level, options, onSelect }) => {
  // Key bindings 1, 2, 3 for rapid selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1' && options[0]) onSelect(options[0].id);
      if (e.key === '2' && options[1]) onSelect(options[1].id);
      if (e.key === '3' && options[2]) onSelect(options[2].id);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [options, onSelect]);

  return (
    <div id="modal-levelup" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="w-full max-w-4xl flex flex-col items-center gap-6"
      >
        {/* Modal Header */}
        <div className="text-center flex flex-col items-center gap-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-xs font-bold tracking-widest uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            Tactical Protocol Upgrade
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white font-mono">
            LEVEL <span className="text-amber-400">{level}</span> REACHED
          </h2>
          <p className="text-slate-400 text-sm font-sans max-w-md">
            Select a combat augmentation module to calibrate your vessel's offensive and defensive matrix.
          </p>
        </div>

        {/* 3 Option Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
          {options.map((option, index) => {
            const theme = RARITY_THEMES[option.rarity];
            const isNew = option.currentLevel === 0;
            const isReachingLvl5 = option.currentLevel + 1 === 5;

            return (
              <motion.button
                key={option.id}
                id={`btn-upgrade-option-${index}`}
                type="button"
                whileHover={{ scale: 1.03, y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelect(option.id)}
                className={`relative group text-left p-5 rounded-2xl bg-gradient-to-b ${theme.bg} border-2 ${
                  isReachingLvl5 ? 'border-amber-400 shadow-amber-500/25 shadow-xl' : theme.border
                } transition-all flex flex-col justify-between min-h-[260px] shadow-2xl overflow-hidden cursor-pointer`}
              >
                {/* Number Hotkey Indicator */}
                <div className="absolute top-3 right-3 w-6 h-6 rounded-md bg-slate-900/90 border border-slate-700 flex items-center justify-center font-mono text-xs text-slate-400 font-bold group-hover:text-amber-400 group-hover:border-amber-500/60">
                  {index + 1}
                </div>

                {/* Top Section */}
                <div className="flex flex-col gap-3">
                  {/* Icon & Rarity Badge */}
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl bg-slate-900/80 border border-slate-800 ${theme.text} group-hover:scale-110 transition-transform shadow-inner`}>
                      {getIcon(option.iconName)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${theme.badge}`}>
                          {option.rarity}
                        </span>
                        {isReachingLvl5 && (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase tracking-wider bg-amber-500 text-slate-950">
                            MAX LVL 5
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono text-slate-400 mt-0.5">
                        {isNew ? (
                          <span className="text-emerald-400 font-semibold">NEW ITEM • L1 / 5</span>
                        ) : isReachingLvl5 ? (
                          <span className="text-amber-300 font-bold">Level 4 → LVL 5 OVERDRIVE</span>
                        ) : (
                          <span>Level {option.currentLevel} → <span className="text-amber-300 font-bold">{option.currentLevel + 1}</span> / 5</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="text-base font-bold text-slate-100 font-mono group-hover:text-white tracking-tight">
                      {option.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-3 font-sans">
                      {option.description}
                    </p>
                  </div>
                </div>

                {/* Bottom Stat Bonus preview */}
                <div className="pt-4 mt-4 border-t border-slate-800/80 flex flex-col gap-2">
                  <div className="text-[11px] font-mono text-amber-300 font-semibold flex items-start gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      {isReachingLvl5 && option.lvl5BonusText ? option.lvl5BonusText : option.statBonusText}
                    </span>
                  </div>

                  {/* Level Pips */}
                  <div className="flex items-center gap-1 pt-1">
                    {Array.from({ length: option.maxLevel }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full ${
                          i < option.currentLevel
                            ? 'bg-amber-400'
                            : i === option.currentLevel
                            ? isReachingLvl5
                              ? 'bg-amber-300 animate-pulse'
                              : 'bg-emerald-400 animate-pulse'
                            : 'bg-slate-800'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        <p className="text-xs font-mono text-slate-500">
          Press [1], [2], or [3] on your keyboard, or tap a module to install.
        </p>
      </motion.div>
    </div>
  );
};
