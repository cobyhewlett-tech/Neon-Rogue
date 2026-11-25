import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  ChatMessageItem,
  DailyChallengeConfig,
  DailyLeaderboardEntry,
  GameMode,
  GameSettings,
  GameStatus,
  HighScoreEntry,
  OnlinePilotSummary,
  OnlineRoomInfo,
  PlayerStats,
  RunSummary,
  ShipClass,
  UpgradeDefinition,
} from './types';
import { GameEngine } from './game/engine';
import { SHIP_CLASSES, STORAGE_KEYS } from './game/constants';
import {
  formatResetCountdown,
  getDailyChallengeConfig,
} from './game/daily';
import { soundEngine } from './utils/audio';
import { realtimeClient } from './utils/realtime';
import {
  auth,
  saveChatMessageToFirestore,
  signInWithGoogle,
  signOutPilot,
  submitDailyScore,
  subscribeDailyLeaderboard,
  subscribeGlobalChat,
} from './utils/firebase';
import { MainMenu } from './components/MainMenu';
import { HUD } from './components/HUD';
import { LevelUpModal } from './components/LevelUpModal';
import { PauseModal } from './components/PauseModal';
import { GameOverModal } from './components/GameOverModal';
import { VirtualControls } from './components/VirtualControls';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // Application State
  const [gameStatus, setGameStatus] = useState<GameStatus>('menu');
  const [activeGameMode, setActiveGameMode] = useState<GameMode>('survivor');
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [score, setScore] = useState(0);
  const [kills, setKills] = useState(0);
  const [survivalTime, setSurvivalTime] = useState(0);
  const [bossState, setBossState] = useState<{ name: string; hp: number; maxHp: number } | null>(null);

  // Upgrade Selection Modal State
  const [levelUpData, setLevelUpData] = useState<{ level: number; options: UpgradeDefinition[] } | null>(null);

  // Game Over / Victory Summary State
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);

  // Daily Challenge State (24-hour UTC seeded reset)
  const [dailyConfig, setDailyConfig] = useState<DailyChallengeConfig>(() => getDailyChallengeConfig());
  const [dailyCountdown, setDailyCountdown] = useState<string>(() =>
    formatResetCountdown(dailyConfig.resetTimestamp - Date.now())
  );
  const [dailyLeaderboard, setDailyLeaderboard] = useState<DailyLeaderboardEntry[]>([]);
  const [dailyLeaderboardLoading, setDailyLeaderboardLoading] = useState<boolean>(true);
  const [dailySubmitStatus, setDailySubmitStatus] = useState<
    'idle' | 'submitting' | 'submitted' | 'kept_best' | 'error'
  >('idle');

  // Firebase Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState<boolean>(false);

  // Online Co-op & Live Chat State
  const [pilotName, setPilotName] = useState<string>(() => {
    return `Pilot-${Math.floor(100 + Math.random() * 900)}`;
  });
  const [customPilotEdited, setCustomPilotEdited] = useState(false);
  const [onlineRoomId, setOnlineRoomId] = useState<string>('PUBLIC');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [onlinePilots, setOnlinePilots] = useState<OnlinePilotSummary[]>([]);
  const [activeRooms, setActiveRooms] = useState<OnlineRoomInfo[]>([]);
  const [squadPlayerCount, setSquadPlayerCount] = useState<number>(1);
  const [wsMessages, setWsMessages] = useState<ChatMessageItem[]>([]);
  const [firestoreMessages, setFirestoreMessages] = useState<ChatMessageItem[]>([]);

  // LocalStorage state
  const [highScores, setHighScores] = useState<HighScoreEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.HIGH_SCORES);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [localDailyBest, setLocalDailyBest] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DAILY_BEST);
      if (saved) {
        const parsed = JSON.parse(saved) as { dateKey?: string; score?: number };
        if (parsed.dateKey === dailyConfig.dateKey) {
          return Number(parsed.score || 0);
        }
      }
    } catch {
      // ignore
    }
    return 0;
  });

  const [unlockedShips, setUnlockedShips] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.UNLOCKED_SHIPS);
      return saved ? JSON.parse(saved) : ['striker', 'vanguard'];
    } catch {
      return ['striker', 'vanguard'];
    }
  });

  const [settings, setSettings] = useState<GameSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        soundEngine.settings = parsed.audio;
        return parsed;
      }
    } catch {
      // fallback
    }
    return {
      screenShake: true,
      autoFire: true,
      showDamageNumbers: true,
      audio: {
        masterVolume: 0.8,
        sfxVolume: 0.8,
        musicVolume: 0.6,
        muted: false,
      },
    };
  });

  // Highest score
  const highestScore = highScores.length > 0 ? highScores[0].score : 0;

  // Keep latest callback ref so engine closures never go stale
  const handleRunFinishedRef = useRef<(summary: RunSummary, isVictory: boolean) => void>(() => {});

  // Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user && !customPilotEdited) {
        const name = (user.displayName || user.email?.split('@')[0] || '').trim().slice(0, 24);
        if (name) {
          setPilotName(name);
        }
      }
    });
    return () => unsubscribe();
  }, [customPilotEdited]);

  // Realtime WebSocket Presence & Live Chat Subscription
  useEffect(() => {
    const mergeHistory = (incoming: ChatMessageItem[]) => {
      if (!incoming || incoming.length === 0) return;
      setWsMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const additions = incoming.filter((m) => m && !seen.has(m.id));
        if (additions.length === 0) return prev;
        return [...prev, ...additions].sort((a, b) => a.timestamp - b.timestamp).slice(-80);
      });
    };

    const unsubscribe = realtimeClient.subscribe({
      onConnectionChange: (connected) => {
        setWsConnected(connected);
      },
      onPresence: (count, pilots, rooms) => {
        setOnlineCount(count);
        setOnlinePilots(pilots);
        setActiveRooms(rooms);
      },
      onChatHistory: (history) => {
        mergeHistory(history);
      },
      onRoomJoined: (payload) => {
        mergeHistory(payload.squadHistory);
      },
      onChatMessage: (message) => {
        setWsMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message].slice(-80);
        });
      },
    });

    return () => unsubscribe();
  }, []);

  // Sync Pilot Callsign to WebSocket Server
  useEffect(() => {
    const shipName = engineRef.current?.selectedShip.name || SHIP_CLASSES[0].name;
    realtimeClient.updateIdentity(pilotName || 'Rogue Pilot', shipName);
  }, [pilotName]);

  // Subscribe to persistent Firestore global chat when signed in
  useEffect(() => {
    if (!currentUser) {
      setFirestoreMessages([]);
      return;
    }
    const unsubscribe = subscribeGlobalChat(
      'global',
      (msgs) => {
        setFirestoreMessages(msgs);
      },
      (err) => {
        console.error('Global chat subscription error:', err);
      }
    );
    return () => unsubscribe();
  }, [currentUser]);

  // Merge & deduplicate real-time WebSocket chat + persisted Firestore chat
  const chatMessages = useMemo(() => {
    const combined: ChatMessageItem[] = [...wsMessages];
    for (const fm of firestoreMessages) {
      const duplicate = combined.some(
        (wm) =>
          wm.id === fm.id ||
          (wm.channel === fm.channel &&
            wm.pilotName === fm.pilotName &&
            wm.text === fm.text &&
            Math.abs(wm.timestamp - fm.timestamp) < 8000)
      );
      if (!duplicate) {
        combined.push(fm);
      }
    }
    return combined.sort((a, b) => a.timestamp - b.timestamp).slice(-80);
  }, [wsMessages, firestoreMessages]);

  // 24-hour UTC Reset Countdown & Midnight Rollover
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      if (now >= dailyConfig.resetTimestamp) {
        const nextConfig = getDailyChallengeConfig(new Date(now));
        setDailyConfig(nextConfig);
        setLocalDailyBest(0);
        setDailyCountdown(formatResetCountdown(nextConfig.resetTimestamp - now));
      } else {
        setDailyCountdown(formatResetCountdown(dailyConfig.resetTimestamp - now));
      }
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [dailyConfig.resetTimestamp]);

  // Live Firestore Subscription for Today's Daily Challenge Leaderboard
  useEffect(() => {
    setDailyLeaderboardLoading(true);
    const unsubscribe = subscribeDailyLeaderboard(
      dailyConfig.dateKey,
      (entries) => {
        setDailyLeaderboard(entries);
        setDailyLeaderboardLoading(false);
      },
      (err) => {
        console.error('Daily leaderboard subscription error:', err);
        setDailyLeaderboardLoading(false);
      }
    );

    return () => unsubscribe();
  }, [dailyConfig.dateKey]);

  // Initialize Game Engine on Canvas Mount
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new GameEngine(canvasRef.current, {
      onStatsUpdate: (stats) => {
        setPlayerStats({ ...stats });
      },
      onScoreUpdate: (newScore, newKills, newTime) => {
        setScore(newScore);
        setKills(newKills);
        setSurvivalTime(newTime);
      },
      onLevelUp: (newLevel, availableUpgrades) => {
        setGameStatus('levelup');
        setLevelUpData({ level: newLevel, options: availableUpgrades });
      },
      onBossState: (boss) => {
        setBossState(boss);
      },
      onGameOver: (summary) => {
        handleRunFinishedRef.current(summary, false);
      },
      onVictory: (summary) => {
        handleRunFinishedRef.current(summary, true);
      },
      onRemotePlayersCount: (count) => {
        setSquadPlayerCount(count);
      },
    });

    engineRef.current = engine;
    engine.screenShakeEnabled = settings.screenShake;
    engine.autoFireEnabled = settings.autoFire;
    engine.showDamageNumbers = settings.showDamageNumbers;

    // Handle Window Resize
    const handleResize = () => {
      engine.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      engine.stop();
    };
  }, []);

  // Sync settings changes to engine and sound
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.screenShakeEnabled = settings.screenShake;
      engineRef.current.autoFireEnabled = settings.autoFire;
      engineRef.current.showDamageNumbers = settings.showDamageNumbers;
    }
    soundEngine.updateVolumes(settings.audio);

    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Global Keyboard Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }

      // Toggle Pause on Escape
      if (e.code === 'Escape') {
        if (gameStatus === 'playing') {
          engineRef.current?.pause();
          setGameStatus('paused');
        } else if (gameStatus === 'paused') {
          engineRef.current?.resume();
          setGameStatus('playing');
        }
        return;
      }

      // Dash on Space
      if (e.code === 'Space' && gameStatus === 'playing') {
        e.preventDefault();
        engineRef.current?.triggerDash();
      }

      if (engineRef.current && e.code in engineRef.current.keys) {
        engineRef.current.keys[e.code] = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (engineRef.current && e.code in engineRef.current.keys) {
        engineRef.current.keys[e.code] = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameStatus]);

  // Canvas Mouse Controls
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!engineRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    engineRef.current.mouse.screenX = screenX;
    engineRef.current.mouse.screenY = screenY;
    engineRef.current.mouse.worldX = screenX + engineRef.current.cameraX;
    engineRef.current.mouse.worldY = screenY + engineRef.current.cameraY;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2) {
      // Right click dash
      engineRef.current?.triggerDash();
      return;
    }
    if (engineRef.current) {
      engineRef.current.mouse.isDown = true;
    }
  };

  const handleMouseUp = () => {
    if (engineRef.current) {
      engineRef.current.mouse.isDown = false;
    }
  };

  // Start run from menu
  const handleStartGame = (ship: ShipClass, mode: GameMode) => {
    if (!engineRef.current) return;
    setActiveGameMode(mode);
    setGameStatus('playing');
    setBossState(null);
    setDailySubmitStatus('idle');
    setSquadPlayerCount(1);
    const effectiveRoom = onlineRoomId.trim() || 'PUBLIC';
    const effectivePilot = pilotName.trim() || 'Rogue Pilot';
    engineRef.current.startRun(
      ship,
      mode,
      mode === 'daily' ? dailyConfig : undefined,
      mode === 'online' ? { roomId: effectiveRoom, pilotName: effectivePilot } : undefined
    );
  };

  // Send Live Chat message
  const handleSendChatMessage = (text: string, scope: 'global' | 'squad') => {
    const effectivePilot = pilotName.trim() || 'Rogue Pilot';
    const shipName = engineRef.current?.selectedShip.name || SHIP_CLASSES[0].name;
    realtimeClient.sendChat(text, scope, effectivePilot, shipName);
    if (scope === 'global' && currentUser) {
      void saveChatMessageToFirestore(currentUser, 'global', effectivePilot, shipName, text).catch(
        (err) => console.error('Failed to persist global chat message:', err)
      );
    }
  };

  // Upgrades
  const handleSelectUpgrade = (upgradeId: string) => {
    if (!engineRef.current) return;
    engineRef.current.applyUpgrade(upgradeId);
    setLevelUpData(null);
    setGameStatus('playing');
  };

  const postDailyRunToCloud = async (user: User, summary: RunSummary) => {
    setDailySubmitStatus('submitting');
    try {
      const result = await submitDailyScore(user, summary, dailyConfig);
      setDailySubmitStatus(result.submitted ? 'submitted' : 'kept_best');
    } catch (err) {
      console.error('Failed to submit daily score:', err);
      setDailySubmitStatus('error');
    }
  };

  // Run Finished (Game Over or Victory)
  const handleRunFinished = (summary: RunSummary, isVictory: boolean) => {
    // Check if new high score
    const isNewHigh = summary.score > highestScore && summary.score > 0;
    summary.isNewHighScore = isNewHigh;

    // Daily Challenge personal best tracking & global upload
    if (summary.gameMode === 'daily') {
      const prevDailyBest =
        summary.dailyDateKey === dailyConfig.dateKey ? localDailyBest : 0;
      const isNewDailyBest = summary.score > prevDailyBest && summary.score > 0;
      summary.isNewDailyBest = isNewDailyBest;

      if (isNewDailyBest) {
        setLocalDailyBest(summary.score);
        try {
          localStorage.setItem(
            STORAGE_KEYS.DAILY_BEST,
            JSON.stringify({ dateKey: dailyConfig.dateKey, score: summary.score })
          );
        } catch {
          // ignore
        }
      }

      if (currentUser) {
        void postDailyRunToCloud(currentUser, summary);
      } else {
        setDailySubmitStatus('idle');
      }
    }

    // Check unlocks: Chrono ship requires 3 mins survival
    if (summary.survivalTime >= 180 && !unlockedShips.includes('chrono')) {
      const updatedShips = [...unlockedShips, 'chrono'];
      setUnlockedShips(updatedShips);
      try {
        localStorage.setItem(STORAGE_KEYS.UNLOCKED_SHIPS, JSON.stringify(updatedShips));
      } catch {
        // ignore
      }
    }

    // Save local score record
    const newEntry: HighScoreEntry = {
      id: Date.now().toString(),
      score: summary.score,
      survivalTime: summary.survivalTime,
      kills: summary.kills,
      level: summary.level,
      shipName: summary.shipName,
      date: new Date().toLocaleDateString(),
    };

    const updatedScores = [...highScores, newEntry]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    setHighScores(updatedScores);
    try {
      localStorage.setItem(STORAGE_KEYS.HIGH_SCORES, JSON.stringify(updatedScores));
    } catch {
      // ignore
    }

    setRunSummary(summary);
    setGameStatus(isVictory ? 'victory' : 'gameover');
  };

  handleRunFinishedRef.current = handleRunFinished;

  // Auth Actions
  const handleSignIn = async () => {
    setAuthBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Google sign-in failed:', err);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOutPilot();
    } catch (err) {
      console.error('Sign-out failed:', err);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignInAndSubmitDaily = async () => {
    if (!runSummary || runSummary.gameMode !== 'daily') return;
    setAuthBusy(true);
    try {
      const user = await signInWithGoogle();
      if (user) {
        await postDailyRunToCloud(user, runSummary);
      }
    } catch (err) {
      console.error('Sign-in & score submit failed:', err);
      setDailySubmitStatus('error');
    } finally {
      setAuthBusy(false);
    }
  };

  // Setting updates
  const handleUpdateSettings = (newSettings: Partial<GameSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...newSettings,
      audio: newSettings.audio ? { ...prev.audio, ...newSettings.audio } : prev.audio,
    }));
  };

  const toggleMute = () => {
    handleUpdateSettings({
      audio: {
        ...settings.audio,
        muted: !settings.audio.muted,
      },
    });
  };

  const toggleAutoFire = () => {
    handleUpdateSettings({
      autoFire: !settings.autoFire,
    });
  };

  return (
    <div id="app-root" className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans">
      {/* 60FPS Game Canvas */}
      <canvas
        id="game-canvas"
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        className={`w-full h-full block cursor-crosshair ${
          gameStatus === 'menu' ? 'hidden' : 'block'
        }`}
      />

      {/* Main Menu Screen */}
      {gameStatus === 'menu' && (
        <MainMenu
          highScores={highScores}
          unlockedShipIds={unlockedShips}
          isMuted={settings.audio.muted}
          dailyConfig={dailyConfig}
          dailyCountdown={dailyCountdown}
          dailyLeaderboard={dailyLeaderboard}
          dailyLeaderboardLoading={dailyLeaderboardLoading}
          localDailyBest={localDailyBest}
          currentUser={currentUser}
          authBusy={authBusy}
          pilotName={pilotName}
          onPilotNameChange={(name) => {
            setCustomPilotEdited(true);
            setPilotName(name);
          }}
          onlineRoomId={onlineRoomId}
          onOnlineRoomIdChange={setOnlineRoomId}
          onlineCount={onlineCount}
          onlinePilots={onlinePilots}
          activeRooms={activeRooms}
          wsConnected={wsConnected}
          chatMessages={chatMessages}
          onSendChatMessage={handleSendChatMessage}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onToggleMute={toggleMute}
          onStartGame={handleStartGame}
        />
      )}

      {/* In-Game HUD overlay */}
      {(gameStatus === 'playing' || gameStatus === 'paused' || gameStatus === 'levelup') && (
        <>
          <HUD
            stats={playerStats}
            score={score}
            kills={kills}
            time={survivalTime}
            highScore={highestScore}
            gameMode={activeGameMode}
            dailyCode={activeGameMode === 'daily' ? dailyConfig.challengeCode : undefined}
            onlineRoomId={activeGameMode === 'online' ? onlineRoomId || 'PUBLIC' : undefined}
            squadPlayerCount={squadPlayerCount}
            onlineCount={onlineCount}
            wsConnected={wsConnected}
            pilotName={pilotName}
            chatMessages={chatMessages}
            onSendChatMessage={handleSendChatMessage}
            bossState={bossState}
            isMuted={settings.audio.muted}
            autoFire={settings.autoFire}
            onToggleMute={toggleMute}
            onToggleAutoFire={toggleAutoFire}
            onPause={() => {
              engineRef.current?.pause();
              setGameStatus('paused');
            }}
            onDashClick={() => {
              engineRef.current?.triggerDash();
            }}
          />

          {/* Virtual on-screen controls for touch devices */}
          <VirtualControls
            onMove={(x, y) => {
              if (!engineRef.current) return;
              engineRef.current.keys.KeyA = x < -0.25;
              engineRef.current.keys.KeyD = x > 0.25;
              engineRef.current.keys.KeyW = y < -0.25;
              engineRef.current.keys.KeyS = y > 0.25;
            }}
            onDash={() => {
              engineRef.current?.triggerDash();
            }}
            autoFire={settings.autoFire}
            onToggleAutoFire={toggleAutoFire}
          />
        </>
      )}

      {/* Level Up Roguelike Draft Modal */}
      {gameStatus === 'levelup' && levelUpData && (
        <LevelUpModal
          level={levelUpData.level}
          options={levelUpData.options}
          onSelect={handleSelectUpgrade}
        />
      )}

      {/* Pause & Settings Modal */}
      {gameStatus === 'paused' && (
        <PauseModal
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onResume={() => {
            engineRef.current?.resume();
            setGameStatus('playing');
          }}
          onRestart={() => {
            if (engineRef.current) {
              setGameStatus('playing');
              setDailySubmitStatus('idle');
              setSquadPlayerCount(1);
              const mode = engineRef.current.gameMode;
              engineRef.current.startRun(
                engineRef.current.selectedShip,
                mode,
                mode === 'daily' ? dailyConfig : undefined,
                mode === 'online'
                  ? { roomId: onlineRoomId.trim() || 'PUBLIC', pilotName: pilotName.trim() || 'Rogue Pilot' }
                  : undefined
              );
            }
          }}
          onQuitToMenu={() => {
            engineRef.current?.stop();
            setGameStatus('menu');
          }}
        />
      )}

      {/* Game Over / Victory Modal */}
      {(gameStatus === 'gameover' || gameStatus === 'victory') && runSummary && (
        <GameOverModal
          summary={runSummary}
          isVictory={gameStatus === 'victory'}
          dailyLeaderboard={dailyLeaderboard}
          currentUser={currentUser}
          dailySubmitStatus={dailySubmitStatus}
          authBusy={authBusy}
          onSignInAndSubmitDaily={handleSignInAndSubmitDaily}
          onPlayAgain={() => {
            if (engineRef.current) {
              const ship = SHIP_CLASSES.find((s) => s.id === runSummary.shipId) || SHIP_CLASSES[0];
              setGameStatus('playing');
              setDailySubmitStatus('idle');
              setSquadPlayerCount(1);
              engineRef.current.startRun(
                ship,
                runSummary.gameMode,
                runSummary.gameMode === 'daily' ? dailyConfig : undefined,
                runSummary.gameMode === 'online'
                  ? { roomId: onlineRoomId.trim() || 'PUBLIC', pilotName: pilotName.trim() || 'Rogue Pilot' }
                  : undefined
              );
            }
          }}
          onMainMenu={() => {
            setGameStatus('menu');
          }}
        />
      )}
    </div>
  );
}
