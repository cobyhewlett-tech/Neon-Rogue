import React from 'react';
import { motion } from 'motion/react';
import type { User } from 'firebase/auth';
import { DailyLeaderboardEntry, RunSummary } from '../types';
import { 
  Trophy, 
  RotateCcw, 
  Home, 
  Clock, 
  Skull, 
  Zap, 
  ShieldAlert, 
  Award,
  Swords,
  Calendar,
  LogIn,
  CheckCircle2
} from 'lucide-react';

interface GameOverModalProps {
  summary: RunSummary;
  isVictory: boolean;
  dailyLeaderboard: DailyLeaderboardEntry[];
  currentUser: User | null;
  dailySubmitStatus: 'idle' | 'submitting' | 'submitted' | 'kept_best' | 'error';
  authBusy: boolean;
  onSignInAndSubmitDaily: () => void;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  summary,
  isVictory,
  dailyLeaderboard,
  currentUser,
  dailySubmitStatus,
  authBusy,
  onSignInAndSubmitDaily,
  onPlayAgain,
  onMainMenu,
}) => {
  const minutes = Math.floor(summary.survivalTime / 60);
  const seconds = summary.survivalTime % 60;
  const timeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  const isDaily = summary.gameMode === 'daily';

  return (
    <div id="modal-gameover" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-xl bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col gap-6 text-slate-100"
      >
        {/* Header Banner */}
        <div className="text-center flex flex-col items-center gap-2">
          {isVictory ? (
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Trophy className="w-8 h-8" />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center shadow-lg shadow-rose-500/20">
              <ShieldAlert className="w-8 h-8" />
            </div>
          )}

          <h2 className="text-2xl sm:text-3xl font-black font-mono tracking-tight">
            {isVictory ? (
              <span className="text-emerald-400">MISSION ACCOMPLISHED</span>
            ) : (
              <span className="text-rose-400">VESSEL INTEGRITY LOST</span>
            )}
          </h2>

          <p className="text-slate-400 text-xs sm:text-sm font-sans max-w-md">
            {isDaily
              ? `Daily Challenge ${summary.dailyChallengeCode || ''} (${summary.dailyMutatorName || 'Seeded Run'}) complete.`
              : isVictory
              ? 'Threat neutralized. The autonomous dreadnoughts were decimated and the cyber-grid has stabilized.'
              : 'Hostile forces overwhelmed your defensive perimeter. Black box telemetry recorded.'}
          </p>

          {(summary.isNewHighScore || summary.isNewDailyBest) && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-xs font-bold animate-bounce">
              <Award className="w-4 h-4" />
              {summary.isNewDailyBest ? 'NEW DAILY CHALLENGE BEST!' : 'NEW PERSONAL RECORD!'}
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80">
          <div className="flex flex-col gap-0.5 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
            <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-cyan-400" />
              Survival Time
            </span>
            <span className="text-base sm:text-lg font-bold font-mono text-cyan-300">
              {timeFormatted}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
            <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
              <Award className="w-3 h-3 text-amber-400" />
              Final Score
            </span>
            <span className="text-base sm:text-lg font-bold font-mono text-amber-300">
              {summary.score.toLocaleString()}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
            <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
              <Skull className="w-3 h-3 text-rose-400" />
              Hostiles Neutralized
            </span>
            <span className="text-base sm:text-lg font-bold font-mono text-rose-300">
              {summary.kills}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
            <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
              <Zap className="w-3 h-3 text-sky-400" />
              Level Reached
            </span>
            <span className="text-base sm:text-lg font-bold font-mono text-sky-300">
              LVL {summary.level}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
            <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
              <Swords className="w-3 h-3 text-purple-400" />
              Damage Dealt
            </span>
            <span className="text-base sm:text-lg font-bold font-mono text-purple-300">
              {summary.damageDealt.toLocaleString()}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
            <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
              <Trophy className="w-3 h-3 text-emerald-400" />
              Bosses Defeated
            </span>
            <span className="text-base sm:text-lg font-bold font-mono text-emerald-300">
              {summary.bossesDefeated}
            </span>
          </div>
        </div>

        {/* Daily Challenge Global Leaderboard & Score Posting */}
        {isDaily && (
          <div className="flex flex-col gap-2.5 p-4 rounded-2xl bg-slate-950/75 border border-emerald-500/35">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-300">
                <Calendar className="w-4 h-4" />
                <span>DAILY LEADERBOARD · {summary.dailyChallengeCode}</span>
              </div>

              {currentUser ? (
                <span className="flex items-center gap-1 text-[11px] font-mono text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  {dailySubmitStatus === 'submitting'
                    ? 'Posting score...'
                    : dailySubmitStatus === 'submitted'
                    ? 'Daily best updated on leaderboard'
                    : dailySubmitStatus === 'kept_best'
                    ? 'Higher daily score already recorded'
                    : dailySubmitStatus === 'error'
                    ? 'Could not sync score'
                    : 'Synced'}
                </span>
              ) : (
                <button
                  id="btn-gameover-signin-daily"
                  type="button"
                  onClick={onSignInAndSubmitDaily}
                  disabled={authBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono text-xs font-bold transition-colors cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  {authBusy ? 'Signing In...' : 'Sign In to Post Score'}
                </button>
              )}
            </div>

            {dailyLeaderboard.length > 0 ? (
              <div className="flex flex-col gap-1 max-h-28 overflow-y-auto pr-1">
                {dailyLeaderboard.slice(0, 5).map((entry, idx) => {
                  const isSelf = currentUser && entry.uid === currentUser.uid;
                  return (
                    <div
                      key={entry.id}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono tabular-nums ${
                        isSelf ? 'bg-emerald-950/60 text-emerald-200 border border-emerald-500/40' : 'bg-slate-900/60 text-slate-300'
                      }`}
                    >
                      <span className="truncate">
                        <strong className={idx === 0 ? 'text-amber-400' : 'text-slate-400'}>#{idx + 1}</strong>{' '}
                        {entry.pilotName}
                        {isSelf ? ' (You)' : ''}
                      </span>
                      <span className="text-amber-300 font-bold shrink-0 pl-2">
                        {entry.score.toLocaleString()} PTS
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs font-mono text-slate-500 text-center py-2">
                {currentUser ? 'Posting first score for today...' : 'Sign in above to claim #1 on today’s board.'}
              </div>
            )}
          </div>
        )}

        {/* Upgrades Build Recap */}
        {summary.upgrades.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-mono font-semibold uppercase text-slate-400">
              Installed Augmentations ({summary.upgrades.length})
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {summary.upgrades.map((u) => (
                <span
                  key={u.id}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono flex items-center gap-1 ${
                    u.level >= 5
                      ? 'bg-amber-950/70 border-amber-400/70 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  <span>{u.title}</span>
                  <span className="text-amber-400 font-bold">{u.level >= 5 ? 'LVL 5 ★' : `L${u.level}`}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            id="btn-gameover-playagain"
            type="button"
            onClick={onPlayAgain}
            className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-slate-950 font-mono font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            DEPLOY AGAIN
          </button>
          <button
            id="btn-gameover-menu"
            type="button"
            onClick={onMainMenu}
            className="py-3.5 px-6 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-mono text-sm font-bold border border-slate-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
            MAIN MENU
          </button>
        </div>
      </motion.div>
    </div>
  );
};
